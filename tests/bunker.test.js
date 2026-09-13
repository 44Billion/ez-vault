import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as store from '../src/services/accounts-store.js'
import {
  BunkerHandle,
  buildBunkerUrl,
  buildBunkerBackupUrl,
  persistHandleState,
  publicBunkerRecord,
  stripBunkerSecret
} from '../src/services/bunker.js'

const PUBKEY = 'a'.repeat(64)

test('bunker liveness RPCs have a finite response timeout', () => {
  const source = readFileSync(new URL('../src/services/bunker.js', import.meta.url), 'utf8')
  assert.match(source, /signer\.connect\(\{[\s\S]*?timeout: CONNECTION_TIMEOUT_MS/)
  assert.match(source, /getPublicKey\(\{ timeout: CONNECTION_TIMEOUT_MS \}\)/)
})

test('bunker URL cleanup keeps the relay pointer while dropping only its one-use secret', () => {
  const url = `bunker://${PUBKEY}?relay=wss%3A%2F%2Fone.example&relay=wss%3A%2F%2Ftwo.example&secret=one-use#client_key=local`

  assert.equal(
    stripBunkerSecret(url),
    `bunker://${PUBKEY}?relay=wss%3A%2F%2Fone.example&relay=wss%3A%2F%2Ftwo.example#client_key=local`
  )
  assert.equal(stripBunkerSecret('https://example.com/?secret=keep'), 'https://example.com/?secret=keep')
})

test('new bunker records keep only public relays and relay switches do not expose the handler', async () => {
  const accountPubkey = 'b'.repeat(64)
  const initial = buildBunkerUrl({ handlerPubkey: PUBKEY, relays: ['wss://one.example'] })
  assert.deepEqual(publicBunkerRecord(initial), { bunkerRelays: ['wss://one.example'] })
  await store.add({
    type: 'bunker',
    pubkey: accountPubkey,
    name: '',
    picture: '',
    ...publicBunkerRecord(initial)
  })

  await persistHandleState({
    pubkey: accountPubkey,
    bunkerUrl: `${buildBunkerUrl({ handlerPubkey: PUBKEY, relays: ['wss://two.example'] })}&secret=consumed`
  })

  assert.deepEqual(store.get(accountPubkey).bunkerRelays, ['wss://two.example'])
  assert.equal('bunker' in store.get(accountPubkey), false)
  assert.equal(JSON.stringify(store.get(accountPubkey)).includes(PUBKEY), false)
})

test('legacy bunker records retain a secretless URL until encrypted migration commits', async () => {
  const accountPubkey = 'c'.repeat(64)
  await store.add({
    type: 'bunker',
    pubkey: accountPubkey,
    bunker: `bunker://${PUBKEY}?relay=${encodeURIComponent('wss://one.example')}&secret=old`
  })

  await persistHandleState({
    pubkey: accountPubkey,
    bunkerUrl: `bunker://${PUBKEY}?relay=${encodeURIComponent('wss://two.example')}&secret=consumed`
  })

  const saved = new URL(store.get(accountPubkey).bunker)
  assert.equal(saved.hostname, PUBKEY)
  assert.deepEqual(saved.searchParams.getAll('relay'), ['wss://two.example'])
  assert.equal(saved.searchParams.has('secret'), false)
})

test('authenticated copy and pairing share a backup constructor for new and interrupted migrations', () => {
  const clientKey = 'd'.repeat(64)
  const publicAccount = {
    type: 'bunker',
    pubkey: 'e'.repeat(64),
    bunkerRelays: ['wss://public.example']
  }
  const current = buildBunkerBackupUrl({
    account: publicAccount,
    secretEntry: { handlerPubkey: PUBKEY, clientKey }
  })
  assert.equal(new URL(current).hash, `#client_key=${clientKey}`)

  const interrupted = buildBunkerBackupUrl({
    account: {
      type: 'bunker',
      pubkey: publicAccount.pubkey,
      bunker: `bunker://${PUBKEY}?relay=${encodeURIComponent('wss://legacy.example')}`
    },
    // New TLV committed, public-account cleanup did not.
    secretEntry: { handlerPubkey: PUBKEY, clientKey }
  })
  assert.deepEqual(new URL(interrupted).searchParams.getAll('relay'), ['wss://legacy.example'])
  assert.equal(new URL(interrupted).hash, `#client_key=${clientKey}`)
})

test('root and shared bunker byte adapters preserve the Base64 remote contract', async () => {
  // Exercise the root adapter without opening relays, and the real shared-key
  // wrapper through its RPC seam (including tweak and Double DH JSON framing).
  const calls = []
  const remote = {
    nip44v3Encrypt: async (...args) => { calls.push(args); return 'cipher' },
    nip44v3Decrypt: async (...args) => { calls.push(args); return '+/8A' },
    nip44EncryptDoubleDH: async (...args) => { calls.push(args); return ['cipher', 'sender'] },
    nip44DecryptDoubleDH: async (...args) => { calls.push(args); return '+/8A' }
  }
  const root = Object.fromEntries(
    ['nip44v3EncryptBytes', 'nip44v3DecryptBytes', 'nip44EncryptDoubleDHBytes', 'nip44DecryptDoubleDHBytes']
      .map(method => [method, BunkerHandle.prototype[method].bind(remote)])
  )
  const handle = {
    tweakedSendRequest: async (tweak, method, params) => {
      assert.deepEqual(tweak, ['withSharedKey', 'shared-peer', 'info'])
      assert.equal(params[1], '9')
      if (method === 'nip44v3_encrypt') return remote.nip44v3Encrypt(...params)
      if (method === 'nip44v3_decrypt') return remote.nip44v3Decrypt(...params)
      if (method === 'nip44v3_encrypt_double_dh') return JSON.stringify(await remote.nip44EncryptDoubleDH(...params))
      if (method === 'nip44v3_decrypt_double_dh') return JSON.stringify(await remote.nip44DecryptDoubleDH(...params))
      assert.fail(method)
    }
  }
  const shared = BunkerHandle.prototype.withSharedKey.call(handle, 'shared-peer', 'info')
  const bytes = new Uint8Array([99, 251, 255, 0, 99]).subarray(1, 4)
  for (const adapter of [root, shared]) {
    calls.length = 0
    assert.equal(await adapter.nip44v3EncryptBytes('peer', 9, 'scope', bytes), 'cipher')
    assert.deepEqual(await adapter.nip44v3DecryptBytes('peer', 9, 'scope', 'cipher'), bytes)
    assert.deepEqual(await adapter.nip44EncryptDoubleDHBytes('peer', 9, 'scope', bytes, 'peer-content'), ['cipher', 'sender'])
    assert.deepEqual(await adapter.nip44DecryptDoubleDHBytes('peer', 9, 'scope', 'cipher', 'peer-content', 'own-content'), bytes)
    assert.equal(calls[0][3], '+/8A')
    assert.equal(calls[2][3], '+/8A')
    assert.deepEqual(calls[2].slice(4), ['peer-content'])
    assert.deepEqual(calls[3].slice(4), ['peer-content', 'own-content'])
    await adapter.nip44v3EncryptBytes('peer', 9, '', new Uint8Array())
    assert.equal(calls.at(-1)[3], '')
  }
})
