import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as store from '../src/services/accounts-store.js'
import {
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
