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
let browser
let permissions
try {
  const fixture = await esbuild.build({
    absWorkingDir: root, entryPoints: ['tests/browser/signer-log-fixture.js'], bundle: true, write: false,
    platform: 'browser', format: 'esm', define: { IS_DEVELOPMENT: 'true', IS_PRODUCTION: 'false' }
  })
  const appScript = `globalThis.auditApp={
    owner:null,result:null,error:null,
    async identify(){this.owner=await nostr.peekPublicKey();await new Promise(resolve=>setTimeout(resolve,50));return this.owner},
    start(fail=false){
      this.result=null;this.error=null;
      this.work=(async()=>{
        if(fail) return nostr.nip44v3.decrypt(this.owner,9,'audit-response-test','invalid-ciphertext');
        const plaintext=new Uint8Array([0,1,127,255]).buffer;
        const cipher=await nostr.nip44v3.encrypt(this.owner,9,'audit-response-test',plaintext);
        await new Promise(resolve=>setTimeout(resolve,50));
        const output=await nostr.nip44v3.decrypt(this.owner,9,'audit-response-test',cipher);
        this.result=[...new Uint8Array(output)];
      })().catch(error=>{this.error=error.message});
    }
  };`
  const app = await prepareTestApp([
    { name: 'index.html', bytes: new TextEncoder().encode('<!doctype html><title>Signer audit regression</title><script type="module" src="./app.js"></script>') },
    { name: 'app.js', bytes: new TextEncoder().encode(appScript) }
  ], { identifier: 'signer-audit-regression', name: 'Signer audit regression' })
  browser = await launchChrome({
    intercept: request => {
      if (request.url === vaultOrigin + '/app.js') return { responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(fixture.outputFiles[0].text).toString('base64') }
      const { hostname } = new URL(request.url)
      if (/^(?:[a-z0-9-]+\.)*localhost$/.test(hostname)) return null
      if (['www.gstatic.com', 'connectivitycheck.gstatic.com', 'captive.apple.com', 'connectivity-check.ubuntu.com'].includes(hostname)) return { responseCode: 204, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }], body: '' }
      return false
    }
  })
  permissions = setInterval(() => browser.evaluate('document.querySelector(".permission-button.allow-button:not(:disabled)")?.click()').catch(() => {}), 100)
  await browser.navigate('http://localhost:10000')
  await browser.until(() => browser.evaluate('Boolean(localStorage.getItem("session_workspaceKeys"))'), 'launcher ready')
  const secret = generateSecretKey()
  const pubkey = getPublicKey(secret)
  await browser.until(() => browser.evaluate('Boolean(document.querySelector("#toolbar-active-avatar-button"))'), 'launcher toolbar')
  await browser.evaluate('document.querySelector("#toolbar-active-avatar-button").click()')
  await browser.until(() => browser.evaluate('Boolean(document.querySelector("account-add input") && document.querySelector("#vault").style.visibility === "visible")', vaultOrigin), 'vault UI')
  const context = [...browser.contexts.values()].find(context => context.origin === vaultOrigin && context.auxData?.isDefault)
  await browser.send('WebAuthn.enable', { enableUI: false }, context.sessionId)
  await browser.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, hasPrf: true, isUserVerified: true, automaticPresenceSimulation: true }
  }, context.sessionId)
  await browser.evaluate('document.querySelector("create-overlay .create-dismiss")?.click();document.querySelector("#add-account-btn").click()', vaultOrigin)
  await browser.evaluate(`document.querySelector('account-add input').value=${JSON.stringify(bytesToHex(secret))};document.querySelector('account-add form').requestSubmit()`, vaultOrigin)
  await browser.until(async () => {
    await browser.evaluate('document.querySelector("passkey-fallback-dialog [data-choice=local]")?.click()', vaultOrigin)
    return browser.evaluate(`Boolean(document.querySelector('account-avatar[pubkey="${pubkey}"]'))`, vaultOrigin)
  }, 'imported test account', 45000)
  await browser.evaluate(app.installExpression)
  await browser.navigate(`http://localhost:10000/${app.app}`)
  const frame = await browser.until(() => browser.evaluate('[...document.querySelectorAll("app-window iframe")].map(frame=>frame.src).find(src=>src.startsWith("http:")&&/^[0-9]+[.]localhost$/.test(new URL(src).hostname))'), 'app frame')
  const origin = new URL(frame).origin
  const evaluate = expression => browser.evaluate(expression, origin)
  await browser.evaluate('document.querySelector("#toolbar-active-avatar-button").click()')
  await browser.until(() => browser.evaluate('Boolean(document.querySelector("lock-overlay .lock-unlock"))', vaultOrigin), 'unlock UI')
  await browser.evaluate('document.querySelector("lock-overlay .lock-unlock").click()', vaultOrigin)
  await browser.until(() => browser.evaluate('Boolean(document.querySelector("vault-lock-button")&&!document.querySelector("vault-lock-button").hidden)', vaultOrigin), 'unlocked vault')
  assert.equal(await evaluate('auditApp.identify()'), pubkey)

  await browser.evaluate('auditProbe.hold()', vaultOrigin)
  await evaluate('auditApp.start()')
  await browser.until(() => evaluate('auditApp.result!==null||auditApp.error!==null'), 'binary signer reply while audit persistence is held', 5000)
  assert.equal(await evaluate('auditApp.error'), null)
  assert.deepEqual(await evaluate('auditApp.result'), [0, 1, 127, 255])
  assert.deepEqual(await browser.evaluate('auditProbe.records()', vaultOrigin), [], 'encrypted audit records remain behind the transition barrier')
  await browser.evaluate('auditProbe.release();auditProbe.flush()', vaultOrigin)
  const records = await browser.evaluate('auditProbe.records()', vaultOrigin)
  assert.equal(records.length, 2)
  assert.ok(records.every(entry => entry.status === 'success'))
  assert.equal(records.find(entry => entry.method === 'nip44v3_encrypt').params[3], 'AAF//w==')
  assert.equal(records.find(entry => entry.method === 'nip44v3_decrypt').result, 'AAF//w==')

  await browser.evaluate('auditProbe.hold()', vaultOrigin)
  await evaluate('auditApp.start(true)')
  await browser.until(() => evaluate('auditApp.error!==null'), 'signer error reply while audit persistence is held', 5000)
  assert.equal((await browser.evaluate('auditProbe.records()', vaultOrigin)).length, 2)
  await browser.evaluate('auditProbe.release();auditProbe.flush()', vaultOrigin)
  assert.equal((await browser.evaluate('auditProbe.records()', vaultOrigin))[0].status, 'failure')
  assert.deepEqual(await browser.evaluate('auditProbe.retention()', vaultOrigin), {
    failedReads: 1, largeValue: true, replaced: true, originalSchema: true, usageMatches: true
  })
  console.log('Real binary signer success/error replies completed with audit writes held; complete encrypted activity records persisted after release.')
  console.log('An unreadable FIFO-eligible encrypted audit entry was removed by key; survivor byte accounting matched, with no schema change.')
} catch (error) {
  await browser?.evaluate('auditProbe.release()', vaultOrigin).catch(() => {})
  await browser?.diagnose(fileURLToPath(new URL('../../tmp/browser-failures/signer-log/', import.meta.url)))
  throw error
} finally {
  clearInterval(permissions)
  await browser?.close()
  await runtime.close()
}
