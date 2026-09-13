import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as secrets from '../src/services/secrets.js'
import { listMessengerLogs } from '../src/services/storage/index.js'
import * as log from '../src/services/messenger-log/index.js'

if (!globalThis.localStorage) {
  const data = new Map()
  globalThis.localStorage = {
    clear: () => data.clear(),
    getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
    removeItem: key => { data.delete(String(key)) },
    setItem: (key, value) => { data.set(String(key), String(value)) }
  }
}

test('backfills richer app metadata into older log entries of the same app', async () => {
  await log.append({
    code: 'NIP07',
    pubkey: 'pk',
    method: 'sign_event',
    app: { id: 'backfill-app', name: '', icon: '', alias: '' }
  })
  await log.append({
    code: 'NIP07',
    pubkey: 'pk',
    method: 'sign_event',
    app: { id: 'backfill-app', name: 'Jumble', icon: 'https://example.test/icon.png', alias: 'jumble' }
  })

  const apps = (await log.list())
    .filter(entry => entry.app?.id === 'backfill-app')
    .map(entry => entry.app)

  assert.equal(apps.length, 2)
  // list() is newest-first, so the oldest entry is at the end and must have
  // been patched with the richer metadata from the second append.
  assert.deepEqual(apps[1], { id: 'backfill-app', name: 'Jumble', icon: 'https://example.test/icon.png', alias: 'jumble' })
})

test('backfill never downgrades richer app metadata already stored', async () => {
  await log.append({
    code: 'NIP07',
    pubkey: 'pk',
    method: 'sign_event',
    app: { id: 'no-downgrade-app', name: 'Real Name', icon: 'https://example.test/icon.png', alias: 'real' }
  })
  await log.append({
    code: 'NIP07',
    pubkey: 'pk',
    method: 'sign_event',
    app: { id: 'no-downgrade-app', name: '', icon: '', alias: '' }
  })

  const apps = (await log.list())
    .filter(entry => entry.app?.id === 'no-downgrade-app')
    .map(entry => entry.app)

  assert.equal(apps.length, 2)
  assert.equal(apps[1].name, 'Real Name')
  assert.equal(apps[1].icon, 'https://example.test/icon.png')
})

test('binary plaintext stays Base64 inside sealed log fields, including empty buffers and views', async () => {
  secrets.unlock(new Uint8Array(32).fill(1), null)
  try {
    const bytes = new Uint8Array([99, 251, 255, 0, 99])
    const params = ['peer', 9, '', bytes.slice(1, 4).buffer]
    const result = new DataView(bytes.buffer, 1, 3)
    await log.append({ code: 'NIP07', method: 'nip44v3_encrypt', params, result })
    await log.append({ code: 'NIP07', method: 'nip44v3_decrypt', result: new ArrayBuffer(0) })
    const entries = await log.list()
    assert.equal(entries[0].result, '')
    assert.deepEqual(entries[1].params, ['peer', 9, '', '+/8A'])
    assert.equal(entries[1].result, '+/8A')
    assert.deepEqual(new Uint8Array(params[3]), new Uint8Array([251, 255, 0]))
    assert.equal(result.byteLength, 3)
    for (const stored of await listMessengerLogs()) {
      assert.equal(typeof stored.sealed, 'string')
      assert.equal(Object.hasOwn(stored, 'params'), false)
      assert.equal(Object.hasOwn(stored, 'result'), false)
    }
    secrets.lock()
    for (const entry of await log.list()) {
      assert.equal(Object.hasOwn(entry, 'params'), false)
      assert.equal(Object.hasOwn(entry, 'result'), false)
    }
  } finally {
    secrets.lock()
  }
})
