import { run } from 'libp2r2p/idb'

const DATABASE_NAME = 'ez-vault'
const DATABASE_VERSION = 1
const ACCOUNTS_STORE = 'accounts'
const STATE_STORE = 'state'
const MESSENGER_LOG_STORE = 'messengerLog'
const REVOCATION_ROTATIONS_STORE = 'revocationRotations'
const NOSTRDB_SYNC_STORE = 'nostrDbSync'
const LOG_USAGE_KEY = 'messenger-log:usage'

/*
IndexedDB schema, shared by the ez-vault application:

database "ez-vault", version 1

accounts, keyPath "pubkey"
  pubkey          account public key
  type            "nsec", "npub", or "bunker"
  bunker          optional persistent bunker URL
  name/picture    resolved profile presentation
  profileEvent    optional latest kind 0 event
  relayListEvent  optional latest kind 10002 event
  writeRelays     resolved NIP-65 write relay URLs
  __order         internal account-list position; removed from records returned to callers

state, keyPath "key"
  key    state record name
  value  passkey metadata/fallbacks, encrypted sidecars, mutation journal,
         refresh timestamps, hints, or the messenger-log byte counter

revocationRotations, keyPath "key"
  key    stable rotation-intent coordinate
  value  content-key rotation intent and retry state

nostrDbSync, keyPath "key"
  key    sync-controller state record name
  value  evolving normalized NostrDB sync state

messengerLog, keyPath "id", autoIncrement
  id        monotonically assigned log entry id
  appKey    per-app retention bucket, or "launcher"
  pubkey    optional account public key associated with the operation
  ts        operation timestamp in seconds
  byteSize  logical serialized size used by the global log budget
  sealed    optional encrypted JSON containing sensitive params/result
  ...       non-sensitive operation metadata such as method, status, and app identity

messengerLog indexes
  byApp     [appKey, id]
  byPubkey  pubkey
*/

const textEncoder = new TextEncoder()

let factory = null
let dbPromise = null
let readyPromise = null
let database = null
let mutationTail = Promise.resolve()
let accountCache = []
const stateCache = new Map()
const recordCaches = new Map([
  [REVOCATION_ROTATIONS_STORE, []],
  [NOSTRDB_SYNC_STORE, []]
])

function deferred () {
  let resolve
  let reject
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, resolve, reject }
}

function transactionDone (tx) {
  const pending = deferred()
  tx.oncomplete = () => pending.resolve()
  tx.onabort = () => pending.reject(tx.error || new Error('IDB_TRANSACTION_ABORTED'))
  tx.onerror = () => pending.reject(tx.error || new Error('IDB_TRANSACTION_FAILED'))
  return pending.promise
}

function clone (value) {
  return value === undefined ? undefined : structuredClone(value)
}

function openDatabase (indexedDB) {
  if (!indexedDB?.open) return Promise.reject(new Error('IDB_UNAVAILABLE'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(request.error || new Error('IDB_OPEN_FAILED'))
    request.onblocked = () => reject(new Error('IDB_DATABASE_BLOCKED'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ACCOUNTS_STORE)) {
        db.createObjectStore(ACCOUNTS_STORE, { keyPath: 'pubkey' })
      }
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(REVOCATION_ROTATIONS_STORE)) {
        db.createObjectStore(REVOCATION_ROTATIONS_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(NOSTRDB_SYNC_STORE)) {
        db.createObjectStore(NOSTRDB_SYNC_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(MESSENGER_LOG_STORE)) {
        const log = db.createObjectStore(MESSENGER_LOG_STORE, { keyPath: 'id', autoIncrement: true })
        log.createIndex('byApp', ['appKey', 'id'])
        log.createIndex('byPubkey', 'pubkey')
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

async function transaction (storeNames, mode, work) {
  const db = await ensureDatabase()
  const tx = db.transaction(storeNames, mode)
  // Completion handlers are attached before any request is issued. Code in
  // `work` may await only IndexedDB requests belonging to this transaction.
  const done = transactionDone(tx)
  try {
    const result = await work(tx)
    await done
    return result
  } catch (err) {
    try { tx.abort() } catch {}
    try { await done } catch {}
    throw err
  }
}

function ensureDatabase () {
  if (!dbPromise) {
    dbPromise = openDatabase(factory).then(db => {
      database = db
      return db
    })
  }
  return dbPromise
}

function enqueueMutation (operation) {
  const pending = mutationTail.then(operation)
  mutationTail = pending.catch(() => {})
  return pending
}

function cleanAccountRecord (record) {
  if (!record?.pubkey) return null
  const account = clone(record)
  delete account.__order
  return account
}

export function initializeStorage ({ indexedDB = globalThis.indexedDB } = {}) {
  if (readyPromise) {
    if (factory !== indexedDB) throw new Error('IDB_FACTORY_ALREADY_SELECTED')
    return readyPromise
  }
  factory = indexedDB
  readyPromise = (async () => {
    await ensureDatabase()
    const snapshot = await transaction([ACCOUNTS_STORE, STATE_STORE, REVOCATION_ROTATIONS_STORE, NOSTRDB_SYNC_STORE], 'readonly', async tx => {
      const accounts = (await run('getAll', [], ACCOUNTS_STORE, null, { tx })).result
      const state = (await run('getAll', [], STATE_STORE, null, { tx })).result
      const revocations = (await run('getAll', [], REVOCATION_ROTATIONS_STORE, null, { tx })).result
      const nostrDbSync = (await run('getAll', [], NOSTRDB_SYNC_STORE, null, { tx })).result
      return { accounts, state, revocations, nostrDbSync }
    })
    accountCache = snapshot.accounts
      .sort((left, right) => (left.__order || 0) - (right.__order || 0))
      .map(cleanAccountRecord)
      .filter(Boolean)
    stateCache.clear()
    for (const record of snapshot.state) stateCache.set(record.key, clone(record.value))
    recordCaches.set(REVOCATION_ROTATIONS_STORE, clone(snapshot.revocations))
    recordCaches.set(NOSTRDB_SYNC_STORE, clone(snapshot.nostrDbSync))
    return true
  })()
  return readyPromise
}

export function listAccounts () {
  return clone(accountCache)
}

export async function mutateAccounts (mutator) {
  if (typeof mutator !== 'function') throw new TypeError('ACCOUNT_MUTATOR_REQUIRED')
  await initializeStorage()
  return enqueueMutation(async () => {
    // The caller runs before the transaction opens, so it cannot accidentally
    // auto-commit an IDB transaction by awaiting unrelated work.
    const mutation = mutator(clone(accountCache)) || {}
    if (typeof mutation?.then === 'function') throw new TypeError('ACCOUNT_MUTATOR_MUST_BE_SYNCHRONOUS')
    const next = (Array.isArray(mutation.accounts) ? mutation.accounts : [])
      .map(cleanAccountRecord)
      .filter(Boolean)
    await transaction([ACCOUNTS_STORE], 'readwrite', async tx => {
      await run('clear', [], ACCOUNTS_STORE, null, { tx })
      for (let index = 0; index < next.length; index++) {
        await run('put', [{ ...next[index], __order: index }], ACCOUNTS_STORE, null, { tx })
      }
    })
    accountCache = clone(next)
    return mutation.result
  })
}

export function getState (key, fallback = null) {
  return stateCache.has(key) ? clone(stateCache.get(key)) : clone(fallback)
}

export function hasState (key) {
  return stateCache.has(key)
}

export async function updateState ({ set = {}, remove = [] } = {}) {
  const entries = Object.entries(set).map(([key, value]) => [String(key), clone(value)])
  const removals = [...new Set(remove.map(String))]
  await initializeStorage()
  return enqueueMutation(async () => {
    await transaction([STATE_STORE], 'readwrite', async tx => {
      for (const key of removals) await run('delete', [key], STATE_STORE, null, { tx })
      for (const [key, value] of entries) await run('put', [{ key, value }], STATE_STORE, null, { tx })
    })
    for (const key of removals) stateCache.delete(key)
    for (const [key, value] of entries) stateCache.set(key, clone(value))
  })
}

export function setState (key, value) {
  return updateState({ set: { [key]: value } })
}

export function removeState (key) {
  return updateState({ remove: [key] })
}

function byteLength (record) {
  return textEncoder.encode(JSON.stringify(record)).byteLength
}

function idRangeForApp (appKey) {
  const keyRange = globalThis.IDBKeyRange
  if (!keyRange?.bound) throw new Error('IDB_KEY_RANGE_UNAVAILABLE')
  return keyRange.bound([appKey, 0], [appKey, Number.MAX_SAFE_INTEGER])
}

async function readLogUsage (tx) {
  const record = (await run('get', [LOG_USAGE_KEY], STATE_STORE, null, { tx })).result
  return Number.isSafeInteger(record?.value) && record.value >= 0 ? record.value : 0
}

async function removeLogInTransaction (tx, id, usage) {
  const record = (await run('get', [id], MESSENGER_LOG_STORE, null, { tx })).result
  if (!record) return usage
  await run('delete', [id], MESSENGER_LOG_STORE, null, { tx })
  return Math.max(0, usage - (Number(record.byteSize) || byteLength(record)))
}

export async function appendMessengerLog (entry, {
  maxEntriesPerApp = 500,
  maxBytes = 64 * 1024 * 1024
} = {}) {
  const prepared = clone(entry)
  prepared.byteSize = 0
  while (true) {
    const nextSize = byteLength(prepared)
    if (nextSize === prepared.byteSize) break
    prepared.byteSize = nextSize
  }
  await initializeStorage()
  return enqueueMutation(async () => {
    return transaction([MESSENGER_LOG_STORE, STATE_STORE], 'readwrite', async tx => {
      let usage = await readLogUsage(tx)
      const id = (await run('add', [prepared], MESSENGER_LOG_STORE, null, { tx })).result
      usage += prepared.byteSize

      const appKeys = (await run('getAllKeys', [idRangeForApp(prepared.appKey)], MESSENGER_LOG_STORE, 'byApp', { tx })).result
      const perAppExcess = Math.max(0, appKeys.length - maxEntriesPerApp)
      for (let index = 0; index < perAppExcess; index++) {
        usage = await removeLogInTransaction(tx, appKeys[index], usage)
      }

      while (usage > maxBytes) {
        const oldest = (await run('getAll', [undefined, 1], MESSENGER_LOG_STORE, null, { tx })).result[0]
        if (!oldest) break
        usage = await removeLogInTransaction(tx, oldest.id, usage)
      }
      await run('put', [{ key: LOG_USAGE_KEY, value: usage }], STATE_STORE, null, { tx })
      return id
    })
  })
}

function cursorPage (tx, { beforeId, limit }) {
  const store = tx.objectStore(MESSENGER_LOG_STORE)
  const range = Number.isSafeInteger(beforeId) && beforeId > 0
    ? globalThis.IDBKeyRange.upperBound(beforeId, true)
    : null
  return new Promise((resolve, reject) => {
    const records = []
    const request = store.openCursor(range, 'prev')
    request.onerror = () => reject(request.error || new Error('IDB_REQUEST_FAILED'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor || records.length >= limit) return resolve(records)
      records.push(cursor.value)
      cursor.continue()
    }
  })
}

export async function listMessengerLogs ({ beforeId, limit = 100 } = {}) {
  await initializeStorage()
  const pageSize = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)))
  return transaction([MESSENGER_LOG_STORE], 'readonly', tx => cursorPage(tx, { beforeId, limit: pageSize }))
}

export async function removeMessengerLogsForPubkey (pubkey) {
  if (!pubkey) return 0
  await initializeStorage()
  return enqueueMutation(async () => {
    return transaction([MESSENGER_LOG_STORE, STATE_STORE], 'readwrite', async tx => {
      let usage = await readLogUsage(tx)
      const keys = (await run('getAllKeys', [pubkey], MESSENGER_LOG_STORE, 'byPubkey', { tx })).result
      for (const id of keys) usage = await removeLogInTransaction(tx, id, usage)
      await run('put', [{ key: LOG_USAGE_KEY, value: usage }], STATE_STORE, null, { tx })
      return keys.length
    })
  })
}

export async function clearMessengerLogs () {
  await initializeStorage()
  return enqueueMutation(async () => {
    await transaction([MESSENGER_LOG_STORE, STATE_STORE], 'readwrite', async tx => {
      await run('clear', [], MESSENGER_LOG_STORE, null, { tx })
      await run('put', [{ key: LOG_USAGE_KEY, value: 0 }], STATE_STORE, null, { tx })
    })
  })
}

export function readRecords (storeName) {
  if (storeName !== REVOCATION_ROTATIONS_STORE && storeName !== NOSTRDB_SYNC_STORE) throw new Error('IDB_STORE_UNSUPPORTED')
  return clone(recordCaches.get(storeName) || [])
}

export async function replaceRecords (storeName, records) {
  if (storeName !== REVOCATION_ROTATIONS_STORE && storeName !== NOSTRDB_SYNC_STORE) throw new Error('IDB_STORE_UNSUPPORTED')
  const snapshot = clone(records || [])
  await initializeStorage()
  return enqueueMutation(async () => {
    await transaction([storeName], 'readwrite', async tx => {
      await run('clear', [], storeName, null, { tx })
      for (const record of snapshot) await run('put', [record], storeName, null, { tx })
    })
    recordCaches.set(storeName, clone(snapshot))
  })
}

export const REVOCATION_ROTATIONS = REVOCATION_ROTATIONS_STORE
export const NOSTRDB_SYNC = NOSTRDB_SYNC_STORE

export async function requestPersistentStorage () {
  try {
    return await globalThis.navigator?.storage?.persist?.() === true
  } catch {
    return false
  }
}

export async function resetStorageForTests ({ indexedDB = globalThis.indexedDB } = {}) {
  await mutationTail
  try { database?.close() } catch {}
  database = null
  dbPromise = null
  readyPromise = null
  mutationTail = Promise.resolve()
  accountCache = []
  stateCache.clear()
  recordCaches.set(REVOCATION_ROTATIONS_STORE, [])
  recordCaches.set(NOSTRDB_SYNC_STORE, [])
  factory = indexedDB
  if (!indexedDB?.deleteDatabase) return
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('IDB_DELETE_FAILED'))
    request.onblocked = () => resolve()
  })
}
