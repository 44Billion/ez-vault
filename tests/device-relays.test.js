import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey } from 'nostr-tools'
import NsecSigner from '../docs/services/nsec-signer.js'
import * as secrets from '../docs/services/secrets.js'
import { freeRelays, seedRelays } from '../docs/services/relays.js'
import {
  refreshDeviceRelayList,
  refreshDeviceRelayListIfDue,
  resolveDeviceRelays
} from '../docs/services/device-relays.js'

const data = new Map()

globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  removeItem: key => { data.delete(String(key)) },
  setItem: (key, value) => { data.set(String(key), String(value)) }
}

if (!globalThis.crypto) globalThis.crypto = crypto
if (!globalThis.btoa) globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64')
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary')

afterEach(() => {
  secrets.lock()
  NsecSigner.releaseAll()
  globalThis.localStorage.clear()
})

function relayList (relays) {
  return {
    kind: 10002,
    pubkey: 'a'.repeat(64),
    created_at: 10,
    tags: relays.map(relay => ['r', relay]),
    content: ''
  }
}

test('device relay refresh publishes a two-relay NIP-65 list when missing', async () => {
  secrets.unlock(generateSecretKey(), null)
  const published = []

  const result = await refreshDeviceRelayList({
    _isOnline: async () => true,
    _nowSeconds: () => 30,
    _fetchRelayListEvent: async () => null,
    _publish: async (event, relays) => {
      published.push({ event, relays })
      return { success: true }
    }
  })

  assert.equal(result.published, true)
  assert.equal(result.reason, 'missing')
  assert.deepEqual(published[0].relays, seedRelays)
  assert.equal(published[0].event.kind, 10002)
  assert.equal(published[0].event.created_at, 30)
  assert.deepEqual(published[0].event.tags, freeRelays.slice(0, 2).map(relay => ['r', relay]))
})

test('device relay refresh replaces only one offline relay per run', async () => {
  secrets.unlock(generateSecretKey(), null)
  const current = ['wss://old-one.example', 'wss://old-two.example']
  const published = []
  const checked = []

  const result = await refreshDeviceRelayList({
    _isOnline: async () => true,
    _fetchRelayListEvent: async () => relayList(current),
    _canConnectRelay: async relay => {
      checked.push(relay)
      return relay !== 'wss://old-one.example'
    },
    _publish: async (event, relays) => {
      published.push({ event, relays })
      return { success: true }
    }
  })

  assert.equal(result.reason, 'replace-offline')
  assert.equal(published.length, 1)
  assert.deepEqual(published[0].event.tags, [
    ['r', freeRelays[0]],
    ['r', 'wss://old-two.example']
  ])
  assert.ok(checked.includes('wss://old-one.example'))
  assert.equal(checked.includes('wss://old-two.example'), false)
})

test('device relay lookup falls back to free relays', async () => {
  assert.deepEqual(await resolveDeviceRelays('f'.repeat(64), {
    _fetchRelayListEvent: async () => null
  }), freeRelays.slice(0, 2))
})

test('device relay due refresh persists cadence', async () => {
  secrets.unlock(generateSecretKey(), null)
  const first = await refreshDeviceRelayListIfDue({
    _nowMs: () => 1000,
    _isOnline: async () => true,
    _fetchRelayListEvent: async () => null,
    _publish: async () => ({ success: true })
  })
  const second = await refreshDeviceRelayListIfDue({ _nowMs: () => 2000 })

  assert.equal(first.published, true)
  assert.equal(second.skipped, 'fresh')
})
