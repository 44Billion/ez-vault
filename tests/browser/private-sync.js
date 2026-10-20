import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import { bytesToHex } from 'libp2r2p/base16'
import { ensureRuntime } from '../../../44billion/bin/dev-runtime.js'
import { launchChrome } from '../../../44billion/tests/browser/runtime/chrome.js'
import { prepareTestApp } from '../../../44billion/tests/browser/runtime/prepare-app.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const vaultOrigin = 'http://localhost:4000'
const runtime = await ensureRuntime({ log: () => {} })
const browsers = []
const origins = []
const appContexts = new Map()
const permissions = []
const transports = new Map()
const retained = new Map()
const pending = new Map()
let flushTimer
let holdLiveBurst = false
const heldLiveBurst = []
const failures = []
let connectivityProbes = 0
const fixture = await esbuild.build({ absWorkingDir: root, entryPoints: ['tests/browser/private-sync-fixture.js'], bundle: true, write: false, platform: 'browser', format: 'esm', define: { IS_DEVELOPMENT: 'true', IS_PRODUCTION: 'false' } })
const script = fixture.outputFiles[0].text
const matches = (event, filter) => (!filter.authors || filter.authors.includes(event.pubkey)) && (!filter.kinds || filter.kinds.includes(event.kind)) && event.created_at >= (filter.since ?? 0) && event.created_at <= (filter.until ?? Infinity) && Object.entries(filter).every(([key, values]) => !key.startsWith('#') || event.tags.some(tag => tag[0] === key.slice(1) && values.includes(tag[1])))
function deliver (transport, frame) {
  const behindHeldEvent = ['EOSE', 'CLOSED'].includes(frame[0]) && heldLiveBurst.some(item => item.transport === transport && item.frame[1] === frame[1])
  if (holdLiveBurst && (frame[0] === 'EVENT' || behindHeldEvent)) { heldLiveBurst.push({ transport, frame }); return }
  const key = `${transport.device}:${transport.contextId}`
  if (!pending.has(key)) pending.set(key, { transport, frames: [] })
  pending.get(key).frames.push([transport.socket, frame])
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      for (const { transport, frames } of pending.values()) {
        browsers[transport.device].send('Runtime.evaluate', { expression: `relayFixture.receive(${JSON.stringify(frames)})`, contextId: transport.contextId, returnByValue: true }, transport.sessionId).catch(error => { if (!/context|target|closed/i.test(error.message)) failures.push(error.message) })
      }
      pending.clear()
    }, 0)
  }
}
function relayFrame (device, { params, sessionId }) {
  const { socket, url, frame } = JSON.parse(params.payload)
  const key = `${device}:${params.executionContextId}:${socket}`
  if (!transports.has(key)) transports.set(key, { device, contextId: params.executionContextId, sessionId, socket, url, subscriptions: new Map() })
  const transport = transports.get(key)
  const [op, id, ...filters] = frame
  if (op === 'CLOSE') { transport.subscriptions.delete(id); return }
  if (op === 'disconnect') { transports.delete(key); return }
  if (op === 'REQ') {
    transport.subscriptions.set(id, filters)
    const seen = new Set()
    for (const filter of filters) {
      for (const event of [...retained.values()].filter(event => matches(event, filter)).sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id)).slice(0, filter.limit ?? Infinity)) {
        if (!seen.has(event.id)) { seen.add(event.id); deliver(transport, ['EVENT', id, event]) }
      }
    }
    deliver(transport, ['EOSE', id])
  } else if (op === 'EVENT') {
    const event = id
    const fresh = !retained.has(event.id)
    retained.set(event.id, event)
    deliver(transport, ['OK', event.id, true, ''])
    if (fresh) {
      for (const target of transports.values()) {
        for (const [sub, filters] of target.subscriptions) {
          if (filters.some(filter => matches(event, filter))) deliver(target, ['EVENT', sub, event])
        }
      }
    }
  }
}
const socketScript = `if(location.port==='10000' && location.hostname==='localhost') {
  const sockets=new Map(); let serial=0;
  globalThis.relayFixture={receive(frames){for(const [id,frame] of frames){const socket=sockets.get(id);if(socket?.readyState===1){const event=new MessageEvent('message',{data:JSON.stringify(frame)});socket.onmessage?.(event);socket.dispatchEvent(event)}}}};
  globalThis.WebSocket=class extends EventTarget {
    static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
    CONNECTING=0;OPEN=1;CLOSING=2;CLOSED=3;readyState=0;bufferedAmount=0;extensions='';protocol='';
    constructor(url){super();this.url=url;this.id=++serial;sockets.set(this.id,this);setTimeout(()=>{if(this.readyState!==0)return;this.readyState=1;this.onopen?.({});this.dispatchEvent(new Event('open'))},0)}
    send(raw){relayFrame(JSON.stringify({socket:this.id,url:this.url,frame:JSON.parse(raw)}))}
    close(){if(this.readyState===3)return;this.readyState=3;relayFrame(JSON.stringify({socket:this.id,url:this.url,frame:['disconnect']}));this.onclose?.({code:1000,reason:'',wasClean:true})}
  }
}`
async function evaluateApp (device, expression) {
  const browser = browsers[device]
  let context = appContexts.get(device)
  if (!context || ![...browser.contexts.values()].includes(context)) {
    context = null
    for (const candidate of [...browser.contexts.values()].reverse()) {
      if (candidate.origin !== origins[device] || !candidate.auxData?.isDefault) continue
      const probe = await browser.send('Runtime.evaluate', { expression: '!!globalThis.syncApp', contextId: candidate.id, returnByValue: true }, candidate.sessionId)
      if (probe.result.value) { context = candidate; break }
    }
    if (!context) throw new Error('App fixture not ready')
    appContexts.set(device, context)
  }
  const objectGroup = 'private-sync-evaluation'
  try {
    const result = await browser.send('Runtime.evaluate', { expression, contextId: context.id, objectGroup, returnByValue: true, awaitPromise: true, userGesture: true }, context.sessionId)
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  } finally { await browser.send('Runtime.releaseObjectGroup', { objectGroup }, context.sessionId).catch(() => {}) }
}
// A fulfilled permission is followed by the native dialog close event. Yield
// between fixture API calls so that event finishes before asking for another
// permission; all grants still go through the real launcher UI.
const appScript = `import { pendingProbe } from './tests/browser/pending-decryption-app.js';globalThis.pendingProbe=pendingProbe;const settlePermission=()=>new Promise(resolve=>setTimeout(resolve,50));globalThis.syncApp={
  async owner(){const owner=await nostr.peekPublicKey();await settlePermission();return owner},
  async seed(peer){const owner=await this.owner(); const now=Math.floor(Date.now()/1000);
    const contact=await napp.eventStore.addPersonalCopy({kind:30000,created_at:now,tags:[['d','+zillion:contacts'],['p',peer,'','','1']],content:''},{context:''});
    await settlePermission();const message=await napp.eventStore.addPersonalCopy({kind:9,created_at:now,tags:[],content:'Self chat synchronization'},{context:'dm:'+owner});
    return [contact.result.ok,message.result.ok]
  },
  async contents(kind){const owner=await this.owner();const {results}=await napp.eventStore.query({kinds:[1006],authors:[owner],'#k':[String(kind)]});await settlePermission();return Promise.all(results.map(async event=>JSON.parse(new TextDecoder().decode(await nostr.nip44v3.decrypt(owner,kind,'',event.content)))))},
  async burst(){const owner=await this.owner();return Promise.all(Array.from({length:12},(_,i)=>napp.eventStore.addPersonalCopy({kind:9,created_at:Math.floor(Date.now()/1000),tags:[],content:'Burst '+i+' '+ 'x'.repeat(18000)},{context:'dm:'+owner})))}
};`
try {
  const appBundle = await esbuild.build({ absWorkingDir: root, stdin: { contents: appScript, resolveDir: root, sourcefile: 'private-sync-app.js' }, bundle: true, write: false, platform: 'browser', format: 'esm' })
  const app = await prepareTestApp([
    { name: 'index.html', bytes: new TextEncoder().encode('<!doctype html><title>Private sync regression</title><script type="module" src="./app.js"></script>') },
    { name: 'app.js', bytes: appBundle.outputFiles[0].contents }
  ], { identifier: 'private-sync-regression', name: 'Private sync regression' })
  const secret = generateSecretKey()
  const identities = []
  for (let device = 0; device < 2; device++) {
    const browser = await launchChrome({
      intercept: request => {
        if (request.url === vaultOrigin + '/app.js') return { responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(script).toString('base64') }
        const { hostname } = new URL(request.url)
        if (['www.gstatic.com', 'connectivitycheck.gstatic.com', 'captive.apple.com', 'connectivity-check.ubuntu.com'].includes(hostname)) {
          connectivityProbes++
          return { responseCode: 204, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }], body: '' }
        }
        return null
      },
      onEvent: event => { if (event.method === 'Runtime.bindingCalled' && event.params.name === 'relayFrame') relayFrame(device, event) }
    })
    browsers.push(browser)
    await browser.send('Runtime.addBinding', { name: 'relayFrame' }, browser.sessionId)
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: socketScript }, browser.sessionId)
    permissions.push(setInterval(() => browser.evaluate('document.querySelector(".permission-button.allow-button:not(:disabled)")?.click()').catch(() => {}), 100))
    await browser.navigate('http://localhost:10000')
    await browser.until(() => browser.evaluate('!!globalThis.syncProbe', vaultOrigin), 'instrumented real vault ready', 45000)
    identities.push(await browser.evaluate(`syncProbe.importAccount(${JSON.stringify(bytesToHex(secret))})`, vaultOrigin))
    const profile = await browser.evaluate(`syncProbe.profile(${JSON.stringify(identities[device].pubkey)}).profile`, vaultOrigin)
    assert.equal(profile.name, 'Paired profile')
    assert.equal(profile.about, 'Preserved biography')
    assert.deepEqual(profile.meta.events, [])
    await browser.evaluate(app.installExpression)
    await browser.navigate(`http://localhost:10000/${app.app}`)
    const url = await browser.until(() => browser.evaluate('[...document.querySelectorAll("app-window iframe")].map(frame=>frame.src).find(src=>src.startsWith("http:")&&/^[0-9]+[.]localhost$/.test(new URL(src).hostname))'), 'app frame')
    const origin = new URL(url).origin
    origins.push(origin)
    await browser.until(() => evaluateApp(device, '!!globalThis.syncApp'), 'app APIs')
  }
  const [a, b] = browsers
  const peer = getPublicKey(generateSecretKey())
  assert.deepEqual(await evaluateApp(0, `syncApp.seed(${JSON.stringify(peer)})`), [true, true])
  for (let device = 0; device < 2; device++) await evaluateApp(device, 'pendingProbe.start()')
  await evaluateApp(0, 'pendingProbe.send("Old content key message")')
  await b.until(async () => await evaluateApp(1, 'pendingProbe.count()') === 1, 'missing content key saved as pending ciphertext', 45000)
  await evaluateApp(1, 'pendingProbe.send("Newer valid message")')
  await b.until(() => evaluateApp(1, 'pendingProbe.delivered.includes("Newer valid message")'), 'newer message delivered while older key is missing', 45000)
  assert.equal(await evaluateApp(1, 'pendingProbe.delivered.includes("Old content key message")'), false)
  await a.evaluate(`syncProbe.trust(${JSON.stringify(identities[1].device)})`, vaultOrigin)
  await b.evaluate(`syncProbe.trust(${JSON.stringify(identities[0].device)})`, vaultOrigin)
  await b.until(async () => (await evaluateApp(1, 'syncApp.contents(30000)')).some(event => event.tags.some(tag => tag[0] === 'p' && tag[1] === peer)), 'private contact synchronized', 90000)
  await b.until(async () => (await evaluateApp(1, 'syncApp.contents(9)')).some(event => event.content === 'Self chat synchronization'), 'self chat synchronized', 90000)
  console.log('Private contact and self chat arrived on the paired device.')
  await b.until(() => evaluateApp(1, 'pendingProbe.delivered.includes("Old content key message")'), 'new content-key notification replays pending ciphertext without reload', 90000)
  await b.until(async () => await evaluateApp(1, 'pendingProbe.count()') === 0, 'pending ciphertext removed after inbox persistence')
  assert.ok(await evaluateApp(1, 'pendingProbe.changes.length') > 1)
  assert.equal(await evaluateApp(1, 'pendingProbe.delivered.filter(value=>value==="Old content key message").length'), 1)
  console.log('Old ciphertext recovered through committed key notifications; newer delivery was never blocked.')
  await b.evaluate('syncProbe.lock()', vaultOrigin)
  assert.equal(await b.evaluate('syncProbe.unlocked()', vaultOrigin), false)
  await b.evaluate('syncProbe.unlock()', vaultOrigin)
  // A real live event exceeds this test-only byte budget even if port delivery
  // yields between frames. Event-count overflow alone depends on consumer speed.
  await b.evaluate('syncProbe.limit(2, 1024)', vaultOrigin)
  // Batch actual upstream EVENT frames, retaining their own EOSE/CLOSED order;
  // publication OKs and unrelated control frames stay live.
  holdLiveBurst = true
  await evaluateApp(0, 'syncApp.burst()')
  const burstDeadline = Date.now() + 30000
  const largestBurst = () => {
    const sizes = new Map()
    for (const { transport, frame } of heldLiveBurst) {
      if (transport.device !== 1 || frame[0] !== 'EVENT') continue
      const key = `${transport.contextId}:${transport.socket}:${frame[1]}`
      sizes.set(key, (sizes.get(key) || 0) + 1)
    }
    return Math.max(0, ...sizes.values())
  }
  // Overflow is per subscription, rather than the combined volume of the
  // device messenger and the app's additional ciphertext-recovery channel.
  while (largestBurst() < 4 && Date.now() < burstDeadline) await new Promise(resolve => setTimeout(resolve, 20))
  assert.ok(largestBurst() >= 4, 'upstream burst reached one paired-device subscription')
  holdLiveBurst = false
  for (const { transport, frame } of heldLiveBurst.splice(0)) deliver(transport, frame)
  await b.until(async () => (await b.evaluate('JSON.stringify(syncProbe.errors)', vaultOrigin)).includes('RELAY_LIVE_BUFFER_FULL'), 'real live overflow at the constrained byte budget', 45000)
  // Only future streams use the restored budget. Do not restart sync here:
  // the real error recovery/backoff must recreate its stream and recover data.
  await b.evaluate('syncProbe.restoreLimits()', vaultOrigin)
  await b.until(async () => (await evaluateApp(1, 'syncApp.contents(9)')).filter(event => event.content.startsWith('Burst ')).length === 12, 'burst messages synchronized', 90000)
  assert.ok((await b.evaluate('JSON.stringify(syncProbe.errors)', vaultOrigin)).includes('RELAY_LIVE_BUFFER_FULL'), 'controlled burst exercised live overflow')
  console.log('All 12 burst messages recovered after a real live overflow.')
  await b.evaluate('syncProbe.limit(null)', vaultOrigin)
  await b.navigate(`http://localhost:10000/${app.app}`)
  await b.until(() => b.evaluate('!!globalThis.syncProbe', vaultOrigin), 'vault after reload')
  await b.until(async () => (await evaluateApp(1, 'syncApp.contents(30000)')).some(event => event.tags.some(tag => tag[0] === 'p' && tag[1] === peer)), 'contact after reload', 45000)
  await b.until(async () => (await evaluateApp(1, 'syncApp.contents(9)')).length === 15, 'messages after reload', 45000)
  for (const browser of browsers) {
    const logs = JSON.stringify(browser.logs)
    assert.ok(!logs.includes('Cached account metadata storage failed: invalid'))
    assert.ok(!logs.includes('Event shape or signature is invalid.'))
  }
  assert.deepEqual(failures, [])
  assert.ok(connectivityProbes > 0, 'native connectivity checks received controlled HTTP responses')
  console.log('Two isolated real launcher/vault contexts: provisional profiles, private contact and self-chat synchronization, lock/unlock, live burst and reload passed.')
} catch (error) {
  for (const device of appContexts.keys()) {
    console.error('Pending-decryption fixture', device, await evaluateApp(device, 'pendingProbe.snapshot()').catch(error => error.message))
    console.error('Sync counts', device, await evaluateApp(device, 'syncApp.contents(9).then(rows=>({total:rows.length,burst:rows.filter(row=>row.content.startsWith("Burst ")).length}))').catch(error => error.message))
  }
  for (const [index, browser] of browsers.entries()) await browser.diagnose(root + '/tmp/browser-failures/private-sync-' + index)
  throw error
} finally {
  permissions.forEach(clearInterval)
  clearTimeout(flushTimer)
  await Promise.all(browsers.map(browser => browser.close()))
  await runtime.close()
}
