import { test } from 'node:test'
import assert from 'node:assert/strict'
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
