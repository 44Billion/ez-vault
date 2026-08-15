import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchLatestProfile,
  fetchRelayListEvent,
  freeRelays,
  parseRelayListEvent,
  RELAY_URL_POLICY,
  resolveWriteRelays
} from '../src/services/relay.js'

function event (overrides = {}) {
  return {
    id: 'a'.repeat(64),
    kind: 10002,
    pubkey: 'b'.repeat(64),
    created_at: 10,
    tags: [],
    content: '',
    ...overrides
  }
}

test('relay-list lookup asks the shared helper for the event and returns it', async () => {
  const newer = event({ id: 'c'.repeat(64), created_at: 20 })
  const result = await fetchRelayListEvent(newer.pubkey, {
    _getRelaysByPubkey: async (pubkeys, options) => {
      assert.deepEqual(pubkeys, [newer.pubkey])
      assert.deepEqual(options, {
        includeEvents: true,
        forceRefresh: true,
        relayUrlPolicy: RELAY_URL_POLICY
      })
      return { [newer.pubkey]: { read: [], write: [], event: newer } }
    }
  })

  assert.equal(result, newer)
})

test('relay-list lookup returns null when no relay-list event exists', async () => {
  const pubkey = 'b'.repeat(64)
  const result = await fetchRelayListEvent(pubkey, {
    _getRelaysByPubkey: async () => ({ [pubkey]: { read: [], write: [], event: null } })
  })
  assert.equal(result, null)
})

test('relay-list parsing preserves NIP-65 read/write markers without duplicates', () => {
  assert.deepEqual(parseRelayListEvent(event({
    tags: [
      ['r', 'wss://both.example'],
      ['r', 'wss://read.example', 'read'],
      ['r', 'wss://write.example', 'write'],
      ['r', 'wss://both.example']
    ]
  })), {
    read: ['wss://both.example', 'wss://read.example'],
    write: ['wss://both.example', 'wss://write.example']
  })
})

test('relay-list parsing normalizes URLs and applies the vault relay URL policy', () => {
  const onion = 'ws://oxtrdevav64z64yb7x6rjg4ntzqjhedm5b5zjqulugknhzr46ny2qbad.onion'
  assert.deepEqual(parseRelayListEvent(event({
    tags: [
      ['r', 'HTTPS://Both.Example/'],
      ['r', onion, 'write'],
      ['r', 'ws://localhost:4869'],
      ['r', 'ws://localhost:8080', 'write'],
      ['r', 'wss://npub1example.com', 'read']
    ]
  })), {
    read: ['wss://both.example', 'ws://localhost:4869', 'wss://npub1example.com'],
    write: ['wss://both.example', onion, 'ws://localhost:4869']
  })
})

test('write-relay resolution falls back and profile reads use resolved relays', async () => {
  assert.deepEqual(await resolveWriteRelays('d'.repeat(64), {
    _fetchRelayListEvent: async () => null
  }), freeRelays.slice(0, 2))

  const profile = event({ kind: 0, created_at: 30 })
  let requestedRelays
  const result = await fetchLatestProfile(profile.pubkey, {
    _resolveWriteRelays: async () => ['wss://write.example'],
    _relayPool: {
      async getEvents (_filter, relays) {
        requestedRelays = relays
        return { result: [profile], errors: [], success: true }
      }
    }
  })
  assert.equal(result, profile)
  assert.deepEqual(requestedRelays, ['wss://write.example'])
})
