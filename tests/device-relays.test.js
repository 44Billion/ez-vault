import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey } from 'libp2r2p/key'
import NsecSigner from '../src/services/nsec-signer.js'
import * as secrets from '../src/services/secrets.js'
import { freeRelays, seedRelays } from 'libp2r2p/relay'
import {
  canConnectRelay,
  refreshDeviceRelayList,
  refreshDeviceRelayListIfDue,
  resolveDeviceRelays,
  startDeviceRelayListRefresh,
  DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS
} from '../src/services/device-relays.js'

const data = new Map()

globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  removeItem: key => { data.delete(String(key)) },
  setItem: (key, value) => { data.set(String(key), String(value)) }
}

test('device relay health uses a bounded one-relay EOSE probe', async () => {
  const calls = []
  assert.equal(await canConnectRelay('wss://relay.example', {
    _relayPool: {
      async getEvents (filter, relays, options) {
        calls.push({ filter, relays, options })
        return { result: [], errors: [], success: true }
      }
    }
  }), true)
  assert.deepEqual(calls, [{
    filter: { limit: 0 },
    relays: ['wss://relay.example'],
    options: { timeout: 5000, timeoutAfterFirstEose: null, rateLimitRetries: 0 }
  }])

  assert.equal(await canConnectRelay('wss://offline.example', {
    _relayPool: { getEvents: async () => ({ result: [], errors: [new Error('offline')], success: false }) }
  }), false)
})

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

async function waitUntil (predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail('condition was not met before timeout')
    await new Promise(resolve => setTimeout(resolve, 1))
  }
}

test('device relay refresh publishes a two-relay NIP-65 list when missing', async () => {
  secrets.unlock(generateSecretKey(), null)
  const published = []

  const result = await refreshDeviceRelayList({
    _isOnline: async () => true,
    _nowSeconds: () => 30,
    _fetchRelayListEvent: async () => null,
    _relayPool: {
      sendEvent: async (event, relays, options) => {
        published.push({ event, relays, options })
        return { success: true }
      }
    }
  })

  assert.equal(result.published, true)
  assert.equal(result.reason, 'missing')
  assert.deepEqual(published[0].relays, seedRelays)
  assert.equal(published[0].event.kind, 10002)
  assert.equal(published[0].event.created_at, 30)
  assert.equal(published[0].options.rateLimitRetries, 0)
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
    _relayPool: {
      sendEvent: async (event, relays, options) => {
        published.push({ event, relays, options })
        return { success: true }
      }
    }
  })

  assert.equal(result.reason, 'replace-offline')
  assert.equal(published.length, 1)
  assert.equal(published[0].options.rateLimitRetries, 0)
  assert.deepEqual(published[0].event.tags, [
    ['r', freeRelays[0]],
    ['r', 'wss://old-two.example']
  ])
  assert.ok(checked.includes('wss://old-one.example'))
  assert.equal(checked.includes('wss://old-two.example'), false)
})

test('device relay refresh rejects an unsuccessful publication and preserves its retry deadline', async () => {
  secrets.unlock(generateSecretKey(), null)
  const retryAt = Date.now() + 10 * 60 * 1000

  await assert.rejects(refreshDeviceRelayList({
    _isOnline: async () => true,
    _nowSeconds: () => 30,
    _fetchRelayListEvent: async () => null,
    _relayPool: {
      sendEvent: async () => ({
        success: false,
        promise: Promise.resolve({
          errors: [{
            relay: seedRelays[0],
            reason: Object.assign(new Error('rate-limited: wait'), { retryAt })
          }]
        })
      })
    }
  }), error => error.code === 'DEVICE_RELAY_PUBLICATION_FAILED' && error.retryAt === retryAt)
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
    _relayPool: { sendEvent: async () => ({ success: true }) }
  })
  const second = await refreshDeviceRelayListIfDue({ _nowMs: () => 2000 })

  assert.equal(first.published, true)
  assert.equal(second.skipped, 'fresh')
})

test('device relay refresh waits for a relay deadline even across online events', async t => {
  secrets.unlock(generateSecretKey(), null)
  const previousWindow = globalThis.window
  globalThis.window = {}
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  })
  let now = Date.now() + DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS
  let attempts = 0
  let onlineListener
  const timers = new Set()
  const retryAt = now + 10 * 60 * 1000

  const stop = startDeviceRelayListRefresh({
    _isOnline: async () => true,
    _nowMs: () => now,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms, at: now + ms }
      timers.add(timer)
      return timer
    },
    _clearTimeout: timer => timers.delete(timer),
    _onOnline: callback => {
      onlineListener = callback
      return () => { onlineListener = null }
    },
    _fetchRelayListEvent: async () => null,
    _relayPool: {
      sendEvent: async () => {
        attempts++
        if (attempts === 1) {
          return {
            success: false,
            promise: Promise.resolve({
              errors: [{
                relay: seedRelays[0],
                reason: Object.assign(new Error('rate-limited: wait'), { retryAt })
              }]
            })
          }
        }
        return { success: true }
      }
    }
  })
  t.after(stop)

  await waitUntil(() => attempts === 1)
  assert.equal(attempts, 1)
  assert.ok([...timers].some(timer => timer.at === retryAt))

  onlineListener()
  await new Promise(resolve => setTimeout(resolve, 1))
  assert.equal(attempts, 1)

  now = retryAt
  const retry = [...timers].find(timer => timer.at === retryAt)
  timers.delete(retry)
  await retry.fn()
  assert.equal(attempts, 2)
})
