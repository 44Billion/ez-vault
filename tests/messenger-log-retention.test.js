import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDBObjectStore } from 'fake-indexeddb'
import { run } from 'libp2r2p/idb'
import {
  appendMessengerLog, removeMessengerLogsForPubkey
} from '../src/services/storage/index.js'

const LOG = 'messengerLog'
const USAGE = 'messenger-log:usage'
const legacy = (id, appKey = 'app:affected', pubkey = 'account-a') => ({
  id, appKey, pubkey, byteSize: 100, sealed: 'opaque-legacy-envelope'
})

async function withDatabase (mode, work) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('ez-vault')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    const tx = db.transaction([LOG, 'state'], mode)
    const complete = new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onabort = () => reject(tx.error || new Error('ABORTED'))
      tx.onerror = () => reject(tx.error || new Error('FAILED'))
    })
    const result = await work(tx)
    await complete
    assert.equal(db.version, 1, 'existing database schema remains unchanged')
    assert.equal(db.objectStoreNames.contains('messengerLogMetadata'), false)
    return result
  } finally { db.close() }
}

async function seed (records) {
  await withDatabase('readwrite', async tx => {
    for (const record of records) await run('put', [record], LOG, null, { tx })
    await run('put', [{ key: USAGE, value: records.reduce((sum, record) => sum + record.byteSize, 0) }], 'state', null, { tx })
    await run('put', [{ key: 'encrypted-vault', value: 'untouched-envelope' }], 'state', null, { tx })
  })
}

async function snapshot () {
  return withDatabase('readonly', async tx => ({
    records: (await run('getAll', [], LOG, null, { tx })).result,
    state: (await run('getAll', [], 'state', null, { tx })).result
  }))
}

function assertUsage (data) {
  assert.equal(data.state.find(row => row.key === USAGE).value, data.records.reduce((sum, row) => sum + row.byteSize, 0))
  assert.equal(data.state.find(row => row.key === 'encrypted-vault').value, 'untouched-envelope')
}

function failReads (t, ids, error = new DOMException('Failed to read large IndexedDB value', 'UnknownError')) {
  const original = IDBObjectStore.prototype.get
  const reads = []
  t.mock.method(IDBObjectStore.prototype, 'get', function (id) {
    if (this.name === LOG) {
      reads.push(id)
      if (ids.includes(id)) throw error
    }
    return original.call(this, id)
  })
  return reads
}

function captureRemovals (t) {
  const warnings = []
  t.mock.method(console, 'warn', (message, json) => {
    if (message === 'messenger-log unreadable entries removed') warnings.push({ message, detail: JSON.parse(json) })
  })
  return warnings
}

test('unreadable FIFO entry 200687 is removed and exact survivor usage is committed with the new entry', async t => {
  await seed([legacy(200687), legacy(200688), legacy(200689, 'app:other')])
  const reads = failReads(t, [200687])
  const warnings = captureRemovals(t)
  const id = await appendMessengerLog({ appKey: 'app:affected', sealed: 'new-envelope' }, { maxEntriesPerApp: 2 })
  const data = await snapshot()
  assert.deepEqual(data.records.map(row => row.id), [200688, 200689, id])
  assert.equal(data.records[0].sealed, 'opaque-legacy-envelope')
  assert.equal(reads.filter(key => key === 200687).length, 1, 'failed request aborts once, then deletion uses the key')
  assert.equal(reads.includes(id), false, 'newly admitted payload need not be reread')
  assertUsage(data)
  assert.equal(warnings.length, 1)
  assert.deepEqual(warnings[0].detail.records, [{ stage: 'retention-app', recordId: 200687 }])
  assert.equal(JSON.stringify(warnings).includes('opaque-legacy-envelope'), false)
})

test('additional unreadable survivors are removed during recount while healthy entries and order survive', async t => {
  await seed([legacy(200687), legacy(200688, 'app:other'), legacy(200689), legacy(200690, 'app:other')])
  const reads = failReads(t, [200687, 200688, 200690])
  const warnings = captureRemovals(t)
  const id = await appendMessengerLog({ appKey: 'app:affected', sealed: 'new-envelope' }, { maxEntriesPerApp: 2 })
  const data = await snapshot()
  assert.deepEqual(data.records.map(row => row.id), [200689, id])
  assertUsage(data)
  assert.equal(warnings.length, 1, 'one aggregate diagnostic, after the successful transaction')
  assert.equal(warnings[0].detail.count, 3)
  assert.deepEqual(warnings[0].detail.records.map(row => row.recordId), [200687, 200688, 200690])
  for (const key of [200687, 200688, 200690]) assert.equal(reads.filter(id => id === key).length, 1)
})

test('global retention removes unreadable entries and recomputes the real byte budget', async t => {
  await seed([legacy(200687), legacy(200688, 'app:other')])
  failReads(t, [200687])
  const warnings = captureRemovals(t)
  await appendMessengerLog({ appKey: 'app:new', sealed: 'new-envelope' }, { maxBytes: 250 })
  const data = await snapshot()
  assert.equal(data.records.some(row => row.id === 200687), false)
  assert.equal(data.records.some(row => row.id === 200688), true)
  assertUsage(data)
  assert.ok(data.state.find(row => row.key === USAGE).value <= 250)
  assert.equal(warnings[0].detail.records[0].stage, 'retention-global')
})

test('explicit account-log removal also discards unreadable survivors without affecting encrypted vault state', async t => {
  await seed([legacy(200687), legacy(200688, 'app:other', 'account-b'), legacy(200689, 'app:other', 'account-b')])
  failReads(t, [200687, 200688])
  const warnings = captureRemovals(t)
  assert.equal(await removeMessengerLogsForPubkey('account-a'), 1)
  const data = await snapshot()
  assert.deepEqual(data.records.map(row => row.id), [200689])
  assertUsage(data)
  assert.equal(warnings[0].detail.count, 2)
})

test('an unrelated survivor read failure rolls back cleanup, admission and accounting without a false removal warning', async t => {
  await seed([legacy(200687), legacy(200688, 'app:other')])
  const before = await snapshot()
  const original = IDBObjectStore.prototype.get
  t.mock.method(IDBObjectStore.prototype, 'get', function (id) {
    if (this.name === LOG && id === 200687) throw new DOMException('Failed to read large IndexedDB value', 'UnknownError')
    if (this.name === LOG && id === 200688) throw new DOMException('Access denied', 'SecurityError')
    return original.call(this, id)
  })
  const warnings = captureRemovals(t)
  await assert.rejects(appendMessengerLog({ appKey: 'app:affected', sealed: 'new-envelope' }, { maxEntriesPerApp: 1 }), { name: 'SecurityError' })
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(warnings, [])
})

test('failure writing the recomputed counter rolls back all removals and the newly admitted entry', async t => {
  await seed([legacy(200687)])
  const before = await snapshot()
  failReads(t, [200687])
  const original = IDBObjectStore.prototype.put
  t.mock.method(IDBObjectStore.prototype, 'put', function (record, ...args) {
    if (this.name === 'state' && record.key === USAGE) throw new DOMException('Quota reached', 'QuotaExceededError')
    return original.call(this, record, ...args)
  })
  const warnings = captureRemovals(t)
  await assert.rejects(appendMessengerLog({ appKey: 'app:affected', sealed: 'new-envelope' }, { maxEntriesPerApp: 1 }), { name: 'QuotaExceededError' })
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(warnings, [])
})

test('cleanup diagnostics aggregate many unreadable entries and bound public record IDs', async t => {
  const records = Array.from({ length: 13 }, (_, index) => legacy(200687 + index, index ? 'app:other' : 'app:affected'))
  await seed(records)
  failReads(t, records.map(row => row.id))
  const warnings = captureRemovals(t)
  await appendMessengerLog({ appKey: 'app:affected', sealed: 'new-envelope' }, { maxEntriesPerApp: 1 })
  const data = await snapshot()
  assert.equal(data.records.length, 1)
  assertUsage(data)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0].detail.count, 13)
  assert.equal(warnings[0].detail.records.length, 10)
})

test('cleanup requires both the specific browser error name and message', async t => {
  await seed([legacy(200687)])
  const before = await snapshot()
  const original = IDBObjectStore.prototype.get
  let readError
  t.mock.method(IDBObjectStore.prototype, 'get', function (id) {
    if (this.name === LOG && id === 200687) throw readError
    return original.call(this, id)
  })
  const warnings = captureRemovals(t)
  for (const error of [
    new DOMException('Failed to read large IndexedDB value', 'SecurityError'),
    new DOMException('A different storage error', 'UnknownError')
  ]) {
    readError = error
    await assert.rejects(appendMessengerLog({ appKey: 'app:affected', sealed: 'new-envelope' }, { maxEntriesPerApp: 1 }), { name: error.name })
    assert.deepEqual(await snapshot(), before)
  }
  assert.deepEqual(warnings, [])
})
