import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { wipeLocalDevData } from '../src/services/local-dev-wipe.js'
import * as storage from '../src/services/storage/index.js'

function memoryStorage (entries = {}) {
  const data = new Map(Object.entries(entries))
  return {
    get size () { return data.size },
    clear: () => data.clear(),
    getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
    removeItem: key => { data.delete(String(key)) },
    setItem: (key, value) => { data.set(String(key), String(value)) },
    entries: () => [...data.entries()]
  }
}

function memoryCaches (names = []) {
  const remaining = new Set(names)
  return {
    keys: async () => [...remaining],
    delete: async name => remaining.delete(name),
    remaining
  }
}

function memoryOpfs (files = []) {
  const entries = new Map(files.map(name => [name, {}]))
  return {
    entries,
    storage: {
      getDirectory: async () => ({
        entries: () => entries.entries(),
        removeEntry: async name => { entries.delete(name) }
      })
    }
  }
}

function openDatabase (indexedDB, name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function databaseNames (indexedDB) {
  return indexedDB.databases().then(databases => (databases || []).map(database => database.name).sort())
}

test('wipes every database, storage area, cache and OPFS entry in the vault origin', async () => {
  const indexedDB = globalThis.indexedDB
  await storage.initializeStorage()
  const connection = await openDatabase(indexedDB, 'libp2r2p:test:queue')
  connection.close()
  const localStorage = memoryStorage({ 'ez-vault:passkey:local-key': 'x' })
  const sessionStorage = memoryStorage({ ezVaultBootAutoReloaded: '1' })
  const caches = memoryCaches(['vault-v1', 'runtime'])
  const opfs = memoryOpfs(['export.bin'])
  const warnings = []

  const result = await wipeLocalDevData({
    _window: { localStorage, sessionStorage },
    _navigator: { storage: opfs.storage },
    _caches: caches,
    _indexedDB: indexedDB,
    _console: { warn: (...args) => warnings.push(args) }
  })

  assert.deepEqual(await databaseNames(indexedDB), [])
  assert.deepEqual(result.databases.sort(), ['ez-vault', 'libp2r2p:test:queue'])
  assert.deepEqual(result.blockedDatabases, [])
  assert.deepEqual(result.failures, [])
  assert.deepEqual(warnings, [])
  assert.equal(localStorage.size, 0)
  assert.equal(sessionStorage.size, 0)
  assert.deepEqual([...caches.remaining], [])
  assert.equal(opfs.entries.size, 0)
})

test('reports each provider failure and still clears the remaining ones', async () => {
  const localStorage = memoryStorage({ keep: '1' })
  const sessionStorage = memoryStorage({})
  const caches = memoryCaches(['vault-v1'])
  const failures = []

  const result = await wipeLocalDevData({
    _window: { localStorage, sessionStorage },
    _navigator: { storage: undefined },
    _caches: caches,
    _indexedDB: null,
    _closeStorage: async () => { throw new Error('CLOSE_FAILED') },
    _console: { warn: (...args) => failures.push(args[0]) }
  })

  assert.deepEqual(result.databases, [])
  assert.deepEqual(result.failures.map(failure => failure.step), ['storage', 'indexedDB'])
  assert.equal(result.failures[0].message, 'CLOSE_FAILED')
  assert.match(result.failures[1].message, /IDB_UNAVAILABLE/)
  assert.equal(failures.length, 2)
  assert.equal(localStorage.size, 0)
  assert.deepEqual([...caches.remaining], [])
})

test('reports a delete that stays blocked instead of hanging the caller', async () => {
  const indexedDB = new IDBFactory()
  const connection = await openDatabase(indexedDB, 'blocked-database')
  const localStorage = memoryStorage({})
  const sessionStorage = memoryStorage({})

  const result = await wipeLocalDevData({
    _window: { localStorage, sessionStorage },
    _navigator: {},
    _caches: null,
    _indexedDB: indexedDB,
    _closeStorage: async () => {},
    _deleteTimeoutMs: 20,
    _console: { warn: () => {} }
  })
  connection.close()
  // The delete keeps running after the timeout; await it so the shared test
  // factory does not leak this database into other files.
  await new Promise(resolve => {
    const request = indexedDB.deleteDatabase('blocked-database')
    request.onsuccess = resolve
    request.onerror = resolve
    request.onblocked = resolve
  })

  assert.deepEqual(result.databases, ['blocked-database'])
  assert.deepEqual(result.blockedDatabases, ['blocked-database'])
  assert.deepEqual(result.failures, [])
})
