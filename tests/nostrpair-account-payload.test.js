import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import {
  buildSyncAccountPayload,
  extractBunkerClientKey
} from '../src/services/nostrpair.js'
import {
  nsecFromHex,
  npubFromPubkey
} from 'libp2r2p/key'
import { bytesToHex } from 'libp2r2p/base16'

function nsecAccount () {
  const secretKey = generateSecretKey()
  const seckey = bytesToHex(secretKey)
  const pubkey = getPublicKey(secretKey)
  return {
    account: {
      type: 'nsec',
      pubkey,
      name: 'Azure Ember',
      picture: 'https://example.test/avatar.png',
      profileEvent: {
        kind: 0,
        pubkey,
        created_at: 20,
        tags: [['name', 'Azure Ember']],
        content: JSON.stringify({ name: 'Azure Ember', about: 'paired account' }),
        id: 'profile-id',
        sig: 'profile-sig'
      },
      relayListEvent: {
        kind: 10002,
        pubkey,
        created_at: 10,
        tags: [['r', 'wss://relay.example']],
        content: '',
        id: 'relay-id',
        sig: 'relay-sig'
      },
      writeRelays: ['wss://relay.example']
    },
    secretEntry: { type: 'nsec', pubkey, seckey }
  }
}

test('buildSyncAccountPayload carries self-contained account entries', () => {
  const { account, secretEntry } = nsecAccount()
  const payload = buildSyncAccountPayload([account], [secretEntry], { nsecFromHex, npubFromPubkey })

  assert.deepEqual(payload.accounts, [{
    type: 'nsec',
    value: nsecFromHex(secretEntry.seckey),
    pubkey: account.pubkey,
    profile: {
      name: 'Azure Ember',
      about: 'paired account',
      picture: 'https://example.test/avatar.png'
    }
  }])
})

test('buildSyncAccountPayload omits oversized inline pictures from pairing profile', () => {
  const { account, secretEntry } = nsecAccount()
  account.picture = `data:image/svg+xml,${'x'.repeat(5000)}`
  const payload = buildSyncAccountPayload([account], [secretEntry], { nsecFromHex, npubFromPubkey })

  assert.deepEqual(payload.accounts[0].profile, {
    name: 'Azure Ember',
    about: 'paired account'
  })
})

test('bunker pairing exports the encrypted handler and client identity with public relays', () => {
  const accountPubkey = '1'.repeat(64)
  const handlerPubkey = '2'.repeat(64)
  const clientKey = '3'.repeat(64)
  const account = {
    type: 'bunker',
    pubkey: accountPubkey,
    name: 'Bunker',
    picture: '',
    bunkerRelays: ['wss://one.example', 'wss://two.example']
  }
  const secret = { type: 'bunker', pubkey: accountPubkey, handlerPubkey, clientKey }

  const payload = buildSyncAccountPayload([account], [secret], { nsecFromHex, npubFromPubkey })
  const exported = payload.accounts[0]
  const decoded = extractBunkerClientKey(exported.value)
  const url = new URL(decoded.url)

  assert.equal(exported.type, 'bunker')
  assert.equal(exported.pubkey, accountPubkey)
  assert.equal(decoded.clientKey, clientKey)
  assert.equal(url.hostname, handlerPubkey)
  assert.deepEqual(url.searchParams.getAll('relay'), account.bunkerRelays)
  assert.equal(url.searchParams.has('secret'), false)
})

test('legacy bunker pairing combines the old URL with its 64-byte secret entry', () => {
  const accountPubkey = '4'.repeat(64)
  const handlerPubkey = '5'.repeat(64)
  const clientKey = '6'.repeat(64)
  const account = {
    type: 'bunker',
    pubkey: accountPubkey,
    bunker: `bunker://${handlerPubkey}?relay=${encodeURIComponent('wss://legacy.example')}&secret=consumed`
  }
  const secret = { type: 'bunker', pubkey: accountPubkey, clientKey, legacy: true }

  const payload = buildSyncAccountPayload([account], [secret], { nsecFromHex, npubFromPubkey })
  const decoded = extractBunkerClientKey(payload.accounts[0].value)
  const url = new URL(decoded.url)

  assert.equal(decoded.clientKey, clientKey)
  assert.equal(url.hostname, handlerPubkey)
  assert.deepEqual(url.searchParams.getAll('relay'), ['wss://legacy.example'])
  assert.equal(url.searchParams.has('secret'), false)
})
