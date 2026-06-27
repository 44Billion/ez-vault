import { pool, freeRelays, seedRelays, fetchRelayListEvent, parseRelayListEvent, publish } from './relays.js'
import * as secrets from './secrets.js'
import { isOnline, onOnline } from '../helpers/network.js'

export const DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000

const LAST_REFRESH_KEY = 'ez-vault:device-relays:last-refresh'
const RELAY_CONNECT_TIMEOUT_MS = 5000
const RELAY_COUNT = 2

let stopDeviceRelayListRefresh = null

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function maybeUnref (timer) {
  timer?.unref?.()
  return timer
}

function unique (values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))]
}

function fallbackRelays () {
  return freeRelays.slice(0, RELAY_COUNT)
}

function relayListTemplate ({ relays, createdAt = nowSeconds() }) {
  return {
    kind: 10002,
    created_at: createdAt,
    tags: unique(relays).slice(0, RELAY_COUNT).map(relay => ['r', relay]),
    content: ''
  }
}

function readLastRefresh () {
  const value = Math.floor(Number(globalThis.localStorage?.getItem(LAST_REFRESH_KEY)) || 0)
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

function writeLastRefresh (value = Date.now()) {
  globalThis.localStorage?.setItem(LAST_REFRESH_KEY, String(Math.max(0, Math.floor(Number(value) || 0))))
}

export function relaysFromEventOrFallback (event) {
  const parsed = parseRelayListEvent(event)
  const relays = unique([...parsed.read, ...parsed.write]).slice(0, RELAY_COUNT)
  return relays.length ? relays : fallbackRelays()
}

export async function canConnectRelay (relay, { _pool = pool } = {}) {
  if (!_pool?.ensureRelay) return true
  try {
    await _pool.ensureRelay(relay, { connectionTimeout: RELAY_CONNECT_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}

async function firstConnectableReplacement (current, { _canConnectRelay = canConnectRelay } = {}) {
  const currentSet = new Set(current)
  for (const relay of freeRelays) {
    if (currentSet.has(relay)) continue
    if (await _canConnectRelay(relay)) return relay
  }
  return ''
}

export async function resolveDeviceRelays (pubkey, { _fetchRelayListEvent = fetchRelayListEvent } = {}) {
  try {
    return relaysFromEventOrFallback(await _fetchRelayListEvent(pubkey))
  } catch (err) {
    console.warn('device relay lookup failed', err?.message ?? err)
    return fallbackRelays()
  }
}

export async function refreshDeviceRelayList ({
  _fetchRelayListEvent = fetchRelayListEvent,
  _publish = publish,
  _canConnectRelay = canConnectRelay,
  _isOnline = isOnline,
  _nowSeconds = nowSeconds
} = {}) {
  if (!secrets.isUnlocked()) return { skipped: 'locked' }
  if (!await _isOnline()) return { skipped: 'offline' }

  const deviceSigner = await secrets.getDeviceSigner()
  const devicePubkey = await deviceSigner.getPublicKey()
  const relayListEvent = await _fetchRelayListEvent(devicePubkey)
  const currentRelays = relaysFromEventOrFallback(relayListEvent)
  const nextRelays = [...currentRelays]
  let reason = relayListEvent ? '' : 'missing'

  if (relayListEvent) {
    for (let i = 0; i < nextRelays.length; i++) {
      if (await _canConnectRelay(nextRelays[i])) continue
      const replacement = await firstConnectableReplacement(nextRelays, { _canConnectRelay })
      if (replacement) {
        nextRelays[i] = replacement
        reason = 'replace-offline'
      } else {
        reason = 'offline-no-replacement'
      }
      break
    }
  }

  if (!reason || reason === 'offline-no-replacement') {
    return { pubkey: devicePubkey, relays: currentRelays, published: false, reason }
  }

  const event = await deviceSigner.signEvent(relayListTemplate({
    relays: nextRelays,
    createdAt: _nowSeconds()
  }))
  const result = await _publish(event, seedRelays)
  return {
    pubkey: devicePubkey,
    relays: nextRelays,
    event,
    result,
    published: true,
    reason
  }
}

export async function refreshDeviceRelayListIfDue ({
  intervalMs = DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS,
  _nowMs = () => Date.now(),
  ...options
} = {}) {
  if (!secrets.isUnlocked()) return { skipped: 'locked' }
  const now = _nowMs()
  const last = readLastRefresh()
  if (last && now - last < intervalMs) return { skipped: 'fresh', nextInMs: intervalMs - (now - last) }
  const result = await refreshDeviceRelayList(options)
  if (result.skipped !== 'offline' && result.skipped !== 'locked' && result.reason !== 'offline-no-replacement') writeLastRefresh(now)
  return result
}

export function startDeviceRelayListRefresh ({
  intervalMs = DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS,
  _setTimeout = setTimeout,
  _clearTimeout = clearTimeout,
  _onOnline = onOnline,
  ...options
} = {}) {
  stopDeviceRelayListRefresh?.()
  let stopped = false
  let timer = null
  let running = null
  let retryAfterMs = 0

  const clearTimer = () => {
    if (timer) _clearTimeout(timer)
    timer = null
  }
  const delayUntilDue = () => {
    if (retryAfterMs) return Math.max(0, retryAfterMs - Date.now())
    const last = readLastRefresh()
    if (!last) return 0
    return Math.max(0, intervalMs - (Date.now() - last))
  }
  const schedule = () => {
    if (stopped) return
    clearTimer()
    if (!secrets.isUnlocked()) return
    timer = maybeUnref(_setTimeout(tick, delayUntilDue()))
  }
  const tick = () => {
    if (stopped || !secrets.isUnlocked()) return Promise.resolve()
    if (!running) {
      running = refreshDeviceRelayListIfDue({ intervalMs, ...options })
        .catch(err => {
          console.warn('device relay refresh failed', err?.message ?? err)
          return { skipped: 'error' }
        })
        .then(result => {
          retryAfterMs = result?.skipped === 'offline' || result?.skipped === 'error'
            ? Date.now() + Math.min(intervalMs, 60_000)
            : 0
          return result
        })
        .finally(() => {
          running = null
          schedule()
        })
    }
    return running
  }

  const unsubSecrets = secrets.subscribe(() => {
    if (secrets.isUnlocked()) tick()
  })
  const unsubOnline = typeof window === 'undefined' ? () => {} : _onOnline(() => tick())
  stopDeviceRelayListRefresh = () => {
    stopped = true
    clearTimer()
    unsubSecrets()
    unsubOnline()
    stopDeviceRelayListRefresh = null
  }
  tick()
  return stopDeviceRelayListRefresh
}
