import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import { resolveMetadata } from '../docs/services/account-intake.js'
import { freeRelays } from '../docs/services/relays.js'

function pubkey () {
  return getPublicKey(generateSecretKey())
}

function profileEvent ({ pubkey, name, createdAt }) {
  return {
    kind: 0,
    pubkey,
    created_at: createdAt,
    tags: [['name', name]],
    content: JSON.stringify({ name })
  }
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
  assert.deepEqual(JSON.parse(result.profileEvent.content), {
    name: 'Azure Ember',
    about: 'paired locally',
    picture: 'https://example.test/avatar.png'
  })
})

test('resolveMetadata prefers relay profile over paired account profile when available', async () => {
  const ownerPubkey = pubkey()
  const relayProfile = profileEvent({ pubkey: ownerPubkey, name: 'Relay Name', createdAt: 10 })
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
