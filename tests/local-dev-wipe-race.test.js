import { test } from 'node:test'
import assert from 'node:assert/strict'

import { wipeLocalDevData } from '../src/services/local-dev-wipe.js'
import * as log from '../src/services/messenger-log/index.js'
import * as secrets from '../src/services/secrets.js'
import * as storage from '../src/services/storage/index.js'

function memoryStorage () {
  const data = new Map()
  return {
    get size () { return data.size },
    clear: () => data.clear(),
    getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
    removeItem: key => { data.delete(String(key)) },
    setItem: (key, value) => { data.set(String(key), String(value)) }
  }
}

function databaseNames () {
  return indexedDB.databases().then(databases => (databases || []).map(database => database.name).sort())
}

test('an in-flight activity write cannot recreate the vault after a full wipe', async () => {
  secrets.unlock(new Uint8Array(32).fill(7), null)
  const release = secrets.beginVaultTransition()
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    // The write has already been accepted but has not reached storage yet.
    const write = log.appendInBackground({
      code: 'NIP07',
      pubkey: 'owner',
      method: 'sign_event',
      params: ['pending'],
      result: 'ok'
    })
    await new Promise(resolve => setImmediate(resolve))

    const result = await wipeLocalDevData({
      _window: { localStorage: memoryStorage(), sessionStorage: memoryStorage() },
      _navigator: {},
      _caches: null,
      _indexedDB: indexedDB,
      _console: { warn: () => {} }
    })

    assert.deepEqual(result.failures, [])
    assert.deepEqual(await databaseNames(), [])

    release()
    await write

    assert.deepEqual(await databaseNames(), [])
    await assert.rejects(storage.initializeStorage(), /STORAGE_CLOSED/)
  } finally {
    release()
    console.warn = originalWarn
    secrets.lock()
  }
})
