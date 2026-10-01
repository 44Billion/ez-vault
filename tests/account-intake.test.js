import { finalizeEvent } from 'libp2r2p/event'
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import { prepareBunker, resolveMetadata } from '../src/services/account-intake.js'
import { freeRelays } from 'libp2r2p/relay'

function pubkey () {
  return getPublicKey(generateSecretKey())
}

function profileEvent ({ secret, name, createdAt }) {
  return finalizeEvent({
    kind: 0,
    created_at: createdAt,
    tags: [['name', name]],
    content: JSON.stringify({ name })
  }, secret)
}

test('resolveMetadata falls back to paired account profile when relays have no profile', async () => {
  const ownerPubkey = pubkey()
  const result = await resolveMetadata(ownerPubkey, {
    pairedProfile: {
      name: 'Azure Ember',
      about: 'paired locally',
      picture: 'https://example.test/avatar.png'
    },
    _fetchRelayListEvent: async () => null,
    _fetchLatestProfile: async () => null
  })

  assert.equal(result.name, 'Azure Ember')
  assert.equal(result.picture, 'https://example.test/avatar.png')
  assert.deepEqual(result.writeRelays, freeRelays.slice(0, 2))
  assert.equal(result.profileEvent, undefined)
  assert.equal(result.about, 'paired locally')
})

test('resolveMetadata prefers relay profile over paired account profile when available', async () => {
  const secret = generateSecretKey()
  const ownerPubkey = getPublicKey(secret)
  const relayProfile = profileEvent({ secret, name: 'Relay Name', createdAt: 10 })
  let fetchedFromRelays = null

  const result = await resolveMetadata(ownerPubkey, {
    pairedProfile: {
      name: 'Paired Name'
    },
    _fetchRelayListEvent: async () => null,
    _fetchLatestProfile: async (_pubkey, { writeRelays }) => {
      fetchedFromRelays = writeRelays
      return relayProfile
    }
  })

  assert.deepEqual(fetchedFromRelays, freeRelays.slice(0, 2))
  assert.equal(result.name, 'Relay Name')
  assert.equal(result.profileEvent, relayProfile)
})

test('bunker intake rejects malformed client identity fragments before connecting', async () => {
  const handler = 'a'.repeat(64)
  const relay = encodeURIComponent('wss://relay.example')
  const key = 'b'.repeat(64)

  await assert.rejects(
    prepareBunker(`bunker://${handler}?relay=${relay}#client_key=bad`),
    /INVALID_BUNKER_CLIENT_KEY/
  )
  await assert.rejects(
    prepareBunker(`bunker://${handler}?relay=${relay}#client_key=${key}&client_key=${key}`),
    /INVALID_BUNKER_CLIENT_KEY/
  )
  await assert.rejects(
    prepareBunker(`bunker://${handler}?relay=${relay}#client_key=${key}&unknown=1`),
    /INVALID_BUNKER_CLIENT_KEY/
  )
})
