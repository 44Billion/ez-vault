import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import * as accounts from '../docs/services/accounts-store.js'
import * as messengerLog from '../docs/services/messenger-log/index.js'
import * as secrets from '../docs/services/secrets.js'
import {
  appendMessengerLog,
  initializeStorage,
  listMessengerLogs,
  mutateAccounts,
  resetStorageForTests
} from '../docs/services/storage/index.js'

const ACCOUNT_A = { pubkey: 'a'.repeat(64), type: 'npub', name: 'A' }
const ACCOUNT_B = { pubkey: 'b'.repeat(64), type: 'npub', name: 'B' }

afterEach(() => secrets.lock())

async function appendLog (appKey, marker, options = {}) {
  return appendMessengerLog({ appKey, marker, payload: `payload-${marker}` }, {
    maxEntriesPerApp: 500,
    maxBytes: 64 * 1024 * 1024,
    ...options
  })
}

test('activity log exposes the agreed per-app, global, and page limits', () => {
  assert.equal(messengerLog.MAX_ENTRIES_PER_APP, 500)
  assert.equal(messengerLog.MAX_LOG_BYTES, 64 * 1024 * 1024)
  assert.equal(messengerLog.PAGE_SIZE, 100)
})

test('account mutations serialize their read-modify-write snapshots', async () => {
  await Promise.all([
    accounts.add(ACCOUNT_A),
    accounts.add(ACCOUNT_B)
  ])

  assert.deepEqual(new Set(accounts.list().map(account => account.pubkey)), new Set([
    ACCOUNT_A.pubkey,
    ACCOUNT_B.pubkey
  ]))
})

test('account mutators cannot await unrelated work before the IDB transaction', async () => {
  await assert.rejects(
    mutateAccounts(async current => ({ accounts: current })),
    /ACCOUNT_MUTATOR_MUST_BE_SYNCHRONOUS/
  )
  assert.deepEqual(accounts.list(), [])
})

test('messenger log enforces its FIFO allowance independently per app', async () => {
  for (let index = 0; index < 3; index++) {
    await appendLog('app:first', `first-${index}`, { maxEntriesPerApp: 2 })
    await appendLog('app:second', `second-${index}`, { maxEntriesPerApp: 2 })
  }

  const records = await listMessengerLogs({ limit: 100 })
  assert.deepEqual(
    records.filter(record => record.appKey === 'app:first').map(record => record.marker),
    ['first-2', 'first-1']
  )
  assert.deepEqual(
    records.filter(record => record.appKey === 'app:second').map(record => record.marker),
    ['second-2', 'second-1']
  )
})

test('launcher entries and an explicitly identified ez-vault app use different buckets', async () => {
  await appendLog('launcher', 'launcher-0', { maxEntriesPerApp: 1 })
  await appendLog('app:ez-vault', 'vault-0', { maxEntriesPerApp: 1 })
  await appendLog('launcher', 'launcher-1', { maxEntriesPerApp: 1 })

  const records = await listMessengerLogs({ limit: 100 })
  assert.deepEqual(records.map(record => record.marker), ['launcher-1', 'vault-0'])
})

test('messenger log prunes the globally oldest records to its byte budget', async () => {
  const options = { maxEntriesPerApp: 500, maxBytes: 520 }
  await appendMessengerLog({ appKey: 'app:a', marker: 'oldest', payload: 'x'.repeat(160) }, options)
  await appendMessengerLog({ appKey: 'app:b', marker: 'middle', payload: 'x'.repeat(160) }, options)
  await appendMessengerLog({ appKey: 'app:c', marker: 'newest', payload: 'x'.repeat(160) }, options)

  const records = await listMessengerLogs({ limit: 100 })
  assert.ok(records.reduce((sum, record) => sum + record.byteSize, 0) <= options.maxBytes)
  assert.equal(records.some(record => record.marker === 'oldest'), false)
  assert.equal(records[0]?.marker, 'newest')
})

test('messenger log pages newest-first in bounded windows without overlap', async () => {
  for (let index = 0; index < 105; index++) await appendLog('app:paged', String(index))

  const first = await listMessengerLogs()
  const second = await listMessengerLogs({ beforeId: first.at(-1).id })

  assert.equal(first.length, 100)
  assert.equal(second.length, 5)
  assert.equal(first[0].marker, '104')
  assert.equal(second.at(-1).marker, '0')
  assert.equal(new Set([...first, ...second].map(record => record.id)).size, 105)
})

test('activity-log serialization failures remain advisory', async () => {
  const vaultKey = new Uint8Array(32)
  vaultKey[0] = 1
  secrets.unlock(vaultKey, null)
  const circular = {}
  circular.self = circular
  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args)
  try {
    await assert.doesNotReject(messengerLog.append({
      app: { id: 'app' },
      method: 'sign_event',
      params: circular
    }))
  } finally {
    console.warn = originalWarn
  }

  assert.equal((await listMessengerLogs()).length, 0)
  assert.match(String(warnings[0]?.[0]), /messenger-log write failed/)
})

test('storage initialization fails closed when IndexedDB is unavailable', async () => {
  await resetStorageForTests({ indexedDB: null })
  await assert.rejects(initializeStorage({ indexedDB: null }), /IDB_UNAVAILABLE/)
})
