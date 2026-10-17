import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { IDBObjectStore } from 'fake-indexeddb'
import * as secrets from '../src/services/secrets.js'
import * as log from '../src/services/messenger-log/index.js'
import { appendMessengerLog, listMessengerLogs } from '../src/services/storage/index.js'

afterEach(async () => {
  await log.clear()
  secrets.lock()
})

function diagnostics (t) {
  const warnings = []
  const recovered = []
  const parse = text => JSON.parse(text.slice(text.indexOf('{')))
  t.mock.method(console, 'warn', text => warnings.push(parse(text)))
  t.mock.method(console, 'info', text => recovered.push(parse(text)))
  return { warnings, recovered }
}

function entry (id, app = {}) {
  return { code: 'NIP07', pubkey: 'owner', method: 'nip44v3_encrypt', app: { id, ...app }, params: ['private parameter'], result: 'private result' }
}

test('startup bursts perform one metadata scan per app and keep complete sealed records', async t => {
  secrets.unlock(new Uint8Array(32).fill(1), null)
  await log.append(entry('burst'))
  const oldestId = (await listMessengerLogs())[0].id
  const originalGet = IDBObjectStore.prototype.get
  let scans = 0
  t.mock.method(IDBObjectStore.prototype, 'get', function (key) {
    if (this.name === 'messengerLog' && key === oldestId) scans++
    return originalGet.call(this, key)
  })
  await Promise.all(Array.from({ length: 12 }, () => log.appendInBackground(entry('burst', { name: 'Burst app' }))))
  await log.flush()
  assert.equal(scans, 1)
  const stored = await listMessengerLogs()
  assert.equal(stored.length, 13)
  assert.ok(stored.every(row => row.app.name === 'Burst app' && row.sealed && !Object.hasOwn(row, 'params')))
  assert.ok((await log.list()).every(row => row.params[0] === 'private parameter' && row.result === 'private result'))
})

test('richer metadata arriving during a scan is eventually propagated without downgrading records', async t => {
  await log.append(entry('richer'))
  const oldestId = (await listMessengerLogs())[0].id
  const originalGet = IDBObjectStore.prototype.get
  let followup
  t.mock.method(IDBObjectStore.prototype, 'get', function (key) {
    if (this.name === 'messengerLog' && key === oldestId && !followup) {
      followup = log.appendInBackground(entry('richer', { name: 'App', icon: 'https://example.test/icon.png' }))
    }
    return originalGet.call(this, key)
  })
  await log.appendInBackground(entry('richer', { name: 'App' }))
  await followup
  await log.flush()
  const records = await listMessengerLogs()
  assert.equal(records.length, 3)
  assert.ok(records.every(row => row.app.name === 'App' && row.app.icon === 'https://example.test/icon.png'))
})

test('a failed metadata read is throttled independently of new writes and other apps, then recovers', async t => {
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const { warnings, recovered } = diagnostics(t)
  await log.append(entry('metadata-failure'))
  const oldestId = (await listMessengerLogs())[0].id
  const originalGet = IDBObjectStore.prototype.get
  let failing = true
  let attempts = 0
  let changes = 0
  const stop = log.subscribe(() => { changes++ })
  t.after(stop)
  t.mock.method(IDBObjectStore.prototype, 'get', function (key) {
    if (this.name === 'messengerLog' && key === oldestId) {
      attempts++
      if (failing) throw new DOMException('Failed to read large IndexedDB value', 'UnknownError')
    }
    return originalGet.call(this, key)
  })
  const richer = () => entry('metadata-failure', { name: 'Production app' })
  await Promise.all(Array.from({ length: 8 }, () => log.appendInBackground(richer())))
  await log.appendInBackground(entry('unaffected-app', { name: 'Other app' }))
  assert.equal((await listMessengerLogs()).length, 10)
  assert.equal(changes, 9, 'committed writes still notify even when metadata backfill fails')
  assert.equal(attempts, 1)
  assert.equal(warnings.length, 1)
  assert.deepEqual(warnings[0], {
    phase: 'metadata', appKey: 'app:metadata-failure', database: 'ez-vault', store: 'messengerLog',
    stage: 'metadata', operation: 'get', recordId: oldestId, errorName: 'UnknownError',
    message: 'Failed to read large IndexedDB value', failures: 1, retryInMs: 5000, skipped: 0
  })
  now += 4999
  await log.append(richer())
  assert.equal(attempts, 1)
  now++
  failing = false
  await log.append(richer())
  assert.equal(attempts, 2)
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0].phase, 'metadata')
  assert.ok(recovered[0].skipped > 0)
  await log.append(richer())
  assert.equal(attempts, 2, 'successful metadata is cached again')
  assert.equal((await listMessengerLogs()).find(row => row.id === oldestId).app.name, 'Production app')
})

test('queued writes stop after failure and retry with progressive cooldown, reporting audit gaps without sensitive values', async t => {
  secrets.unlock(new Uint8Array(32).fill(1), null)
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const { warnings, recovered } = diagnostics(t)
  await log.append(entry('write-failure'))
  const originalAdd = IDBObjectStore.prototype.add
  let attempts = 0
  let failing = true
  t.mock.method(IDBObjectStore.prototype, 'add', function (...args) {
    if (this.name === 'messengerLog') {
      attempts++
      if (failing) throw new DOMException('private exception text must not be printed', 'UnknownError')
    }
    return originalAdd.apply(this, args)
  })
  await Promise.all(Array.from({ length: 20 }, () => log.appendInBackground(entry('write-failure'))))
  assert.equal(attempts, 1)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].phase, 'append')
  assert.equal(warnings[0].operation, 'add')
  assert.equal(warnings[0].errorName, 'UnknownError')
  assert.equal(warnings[0].retryInMs, 5000)
  assert.equal((await listMessengerLogs()).length, 1, 'existing audit records are preserved')
  await log.appendInBackground({ get params () { assert.fail('Cooldown must skip cloning large inputs') } })
  now += 5000
  await log.appendInBackground(entry('write-failure'))
  assert.equal(attempts, 2)
  assert.equal(warnings[1].retryInMs, 10000)
  assert.equal(warnings[1].skipped, 20)
  now += 9999
  await log.appendInBackground(entry('write-failure'))
  assert.equal(attempts, 2)
  now++
  failing = false
  await log.appendInBackground(entry('write-failure'))
  assert.equal(attempts, 3)
  assert.equal(recovered[0].skipped, 1)
  assert.equal((await listMessengerLogs()).length, 2)
  const output = JSON.stringify({ warnings, recovered })
  for (const sensitive of ['private parameter', 'private result', 'private exception text', 'params', 'sealed']) {
    assert.equal(output.includes(sensitive), false)
  }
})

test('persistent write failures reach a 60-second retry cap without recurring timers', async t => {
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const { warnings } = diagnostics(t)
  const originalAdd = IDBObjectStore.prototype.add
  t.mock.method(IDBObjectStore.prototype, 'add', function (...args) {
    if (this.name === 'messengerLog') throw new DOMException('Failed to read large IndexedDB value', 'UnknownError')
    return originalAdd.apply(this, args)
  })
  for (const delay of [5000, 10000, 20000, 40000, 60000, 60000]) {
    await log.appendInBackground(entry('persistent'))
    assert.equal(warnings.at(-1).retryInMs, delay)
    now += delay
  }
  assert.equal(warnings.length, 6)
})

test('per-app retention failures do not block other apps or report false recovery', async t => {
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const { warnings, recovered } = diagnostics(t)
  for (let index = 0; index < 500; index++) {
    await appendMessengerLog({ appKey: 'app:affected', method: 'probe' })
  }
  const originalGet = IDBObjectStore.prototype.get
  let failing = true
  let attempts = 0
  t.mock.method(IDBObjectStore.prototype, 'get', function (key) {
    if (this.name === 'messengerLog' && key === 1) {
      attempts++
      if (failing) throw new DOMException('Storage is temporarily unavailable', 'UnknownError')
    }
    return originalGet.call(this, key)
  })
  await log.appendInBackground(entry('affected'))
  await log.appendInBackground(entry('healthy'))
  assert.equal(recovered.length, 0)
  assert.equal(warnings[0].appKey, 'app:affected')
  assert.equal(warnings[0].recordId, 1)
  assert.equal(warnings[0].stage, 'retention-app')
  assert.equal(warnings[0].store, 'messengerLog')
  assert.equal((await listMessengerLogs())[0].appKey, 'app:healthy', 'other apps are not held by the cooldown')
  now += 5000
  await log.appendInBackground(entry('healthy'))
  await log.appendInBackground(entry('affected'))
  assert.equal(warnings[1].failures, 2, 'unrelated success does not reset the affected app')
  assert.equal(warnings[1].retryInMs, 10000)
  assert.equal(recovered.length, 0)
  await log.appendInBackground(entry('affected'))
  assert.equal(attempts, 2)
  now += 10000
  failing = false
  await log.appendInBackground(entry('affected'))
  assert.equal(attempts, 3)
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0].appKey, 'app:affected')
  assert.equal(recovered[0].failures, 2)
  assert.equal(recovered[0].skipped, 1)
})

for (const action of ['clear', 'removeForPubkey']) {
  test(`explicit ${action} allows writes to resume without waiting for the cooldown`, async t => {
    const { warnings } = diagnostics(t)
    await log.append(entry('explicit-reset'))
    const originalAdd = IDBObjectStore.prototype.add
    let failing = true
    t.mock.method(IDBObjectStore.prototype, 'add', function (...args) {
      if (this.name === 'messengerLog' && failing) throw new DOMException('Failed to read large IndexedDB value', 'UnknownError')
      return originalAdd.apply(this, args)
    })
    await log.appendInBackground(entry('explicit-reset'))
    assert.equal(warnings.length, 1)
    failing = false
    if (action === 'clear') await log.clear()
    else await log.removeForPubkey('owner')
    await log.appendInBackground(entry('explicit-reset'))
    assert.equal((await listMessengerLogs()).length, 1)
  })
}
