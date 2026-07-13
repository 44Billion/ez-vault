import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchLatestProfile,
  fetchRelayListEvent,
  freeRelays,
  parseRelayListEvent,
  resolveWriteRelays,
  seedRelays
} from '../docs/services/relay.js'

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

test('relay-list lookup uses RelayPool timing and selects the newest event', async () => {
  const calls = []
  const older = event({ created_at: 10 })
  const newer = event({ id: 'c'.repeat(64), created_at: 20 })
  const result = await fetchRelayListEvent(older.pubkey, {
    _relayPool: {
      async getEvents (filter, relays, options) {
        calls.push({ filter, relays, options })
        return { result: [older, newer], errors: [], success: true }
      }
    }
  })

  assert.equal(result, newer)
  assert.deepEqual(calls, [{
    filter: { kinds: [10002], authors: [older.pubkey], limit: 1 },
    relays: seedRelays,
    options: { timeout: 5000, timeoutAfterFirstEose: 500 }
  }])
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
