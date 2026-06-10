import { getIykcProofs } from '../../helpers/nostr/queries.js'
import { isOnline, onOnline } from '../../helpers/network.js'
import { makeContentKeyEvent, makeContentKeyEventForPubkey, parseContentKeyEvent, CONTENT_KEY_KIND } from './event.js'
import * as store from '../accounts-store.js'
import * as secrets from '../secrets.js'
import { filterVisibleAccounts } from '../account-mutations.js'
import { fetchEvents, fetchRelayListEvent, freeRelays, parseRelayListEvent, publish, resolveWriteRelays, seedRelays } from '../relays.js'

export { CONTENT_KEY_KIND, getIykcProofs }

export const CONTENT_KEY_EVENT_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000

const CONTENT_KEY_EVENT_REFRESH_KEY = 'ez-vault:content-key-events:last-refresh'

let stopContentKeyEventRefresh = null

function copyUnsignedEvent (event) {
  // eslint-disable-next-line no-unused-vars
  const { id, sig, pubkey, ...unsigned } = event
  return {
    ...unsigned,
    tags: (event.tags || []).map(tag => [...tag])
  }
}

function withImkcTag (event, tag) {
  const tags = (event.tags || []).map(tag => [...tag])
  const indexes = tags
    .map((tag, index) => tag[0] === 'imkc' ? index : -1)
    .filter(index => index >= 0)
  if (indexes.length > 1) throw new Error('MULTIPLE_IMKC_TAGS')
  if (indexes.length) tags[indexes[0]] = tag
  else tags.push(tag)
  return { ...event, tags }
}

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function maybeUnref (timer) {
  timer?.unref?.()
  return timer
}

function unique (values) {
  return [...new Set((values || []).filter(Boolean))]
}

function latestKey (keys) {
  let latest = null
  for (const key of keys || []) {
    if (!latest || (key.createdAt || 0) >= (latest.createdAt || 0)) latest = key
  }
  return latest
}

function refreshStorage () {
  return globalThis.localStorage || null
}

function readLastContentKeyEventRefresh () {
  const raw = refreshStorage()?.getItem(CONTENT_KEY_EVENT_REFRESH_KEY)
  const value = Math.floor(Number(raw) || 0)
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

function writeLastContentKeyEventRefresh (value = Date.now()) {
  refreshStorage()?.setItem(CONTENT_KEY_EVENT_REFRESH_KEY, String(Math.max(0, Math.floor(Number(value) || 0))))
}

function contentKeyAccounts () {
  if (!secrets.isUnlocked()) return []
  return filterVisibleAccounts(store.list())
    .filter(account => account.type === 'nsec' && secrets.listContentKeys(account.pubkey).length)
}

function relayListTemplate ({ readRelays = [], writeRelays = [], createdAt = nowSeconds() }) {
  const write = new Set(writeRelays)
  const read = new Set(readRelays)
  const tags = []
  for (const url of new Set([...write, ...read])) {
    const isWrite = write.has(url)
    const isRead = read.has(url)
    if (isWrite && isRead) tags.push(['r', url])
    else if (isWrite) tags.push(['r', url, 'write'])
    else tags.push(['r', url, 'read'])
  }
  return {
    kind: 10002,
    created_at: createdAt,
    tags,
    content: ''
  }
}

async function publishRelayListIfNeeded ({
  account,
  userSigner,
  relayListEvent,
  parsedRelays,
  _publish,
  _nowSeconds
}) {
  const fallback = freeRelays.slice(0, 2)
  let readRelays = parsedRelays.read
  let writeRelays = parsedRelays.write
  let reason = ''

  if (!relayListEvent) {
    readRelays = fallback
    writeRelays = fallback
    reason = 'missing'
  } else if (!writeRelays.length) {
    readRelays = unique([...readRelays, ...fallback])
    writeRelays = unique([...writeRelays, ...fallback])
    reason = 'missing-write'
  }

  if (!reason) {
    const cachedAt = account.relayListEvent?.created_at ?? 0
    if (relayListEvent.created_at > cachedAt) {
      store.update(account.pubkey, { relayListEvent, writeRelays })
    }
    return { writeRelays, relayListEvent, published: false, reason: '' }
  }

  const event = await userSigner.signEvent(relayListTemplate({
    readRelays,
    writeRelays,
    createdAt: _nowSeconds()
  }))
  const result = await _publish(event, seedRelays)
  store.update(account.pubkey, { relayListEvent: event, writeRelays })
  return { writeRelays, relayListEvent: event, published: true, reason, result }
}

async function resolveContentKeyWriteRelays ({
  account,
  userSigner,
  _fetchRelayListEvent,
  _publish,
  _nowSeconds
}) {
  const relayListEvent = await _fetchRelayListEvent(account.pubkey)
  const parsedRelays = parseRelayListEvent(relayListEvent)
  return publishRelayListIfNeeded({
    account,
    userSigner,
    relayListEvent,
    parsedRelays,
    _publish,
    _nowSeconds
  })
}

async function fetchLatestContentKeyEventFromRelay ({ ownerPubkey, relay, _fetchEvents }) {
  try {
    const events = await _fetchEvents({
      kinds: [CONTENT_KEY_KIND],
      authors: [ownerPubkey],
      limit: 1
    }, [relay])
    let latest = null
    for (const event of events) {
      const parsed = parseContentKeyEvent(event)
      if (!parsed) continue
      if (!latest || event.created_at > latest.event.created_at) latest = { event, parsed }
    }
    return { relay, latest, error: null }
  } catch (err) {
    return { relay, latest: null, error: err }
  }
}

async function refreshAccountContentKeyEvent ({
  account,
  _fetchRelayListEvent,
  _fetchEvents,
  _publish,
  _nowSeconds
}) {
  const userSigner = secrets.getNsecSigner(account.pubkey)
  if (!userSigner) return { pubkey: account.pubkey, skipped: 'locked' }

  const localLatest = latestKey(secrets.listContentKeys(account.pubkey))
  if (!localLatest) return { pubkey: account.pubkey, skipped: 'no-local-content-key' }

  const relayList = await resolveContentKeyWriteRelays({
    account,
    userSigner,
    _fetchRelayListEvent,
    _publish,
    _nowSeconds
  })
  const writeRelays = unique(relayList.writeRelays)
  if (!writeRelays.length) return { pubkey: account.pubkey, skipped: 'no-write-relays', relayList }

  const relayResults = await Promise.all(writeRelays.map(relay =>
    fetchLatestContentKeyEventFromRelay({ ownerPubkey: account.pubkey, relay, _fetchEvents })
  ))
  const checkedResults = relayResults.filter(result => !result.error)
  const found = checkedResults.map(result => result.latest).filter(Boolean)
  if (!checkedResults.length) return { pubkey: account.pubkey, skipped: 'relay-check-failed', relayList, relayResults }

  let canonicalPubkey = localLatest.pubkey
  let canonicalCreatedAt = localLatest.createdAt || 0
  if (found.length) {
    let newest = null
    for (const result of found) {
      if (!newest || result.event.created_at > newest.event.created_at) newest = result
    }
    canonicalPubkey = newest.parsed.iykcPubkey
    canonicalCreatedAt = newest.event.created_at
  }

  const relaysToPublish = found.length
    ? checkedResults
      .filter(result => {
        if (!result.latest) return true
        if (result.latest.parsed.iykcPubkey === canonicalPubkey) return false
        return result.latest.event.created_at < canonicalCreatedAt
      })
      .map(result => result.relay)
    : checkedResults.map(result => result.relay)

  if (!relaysToPublish.length) {
    return { pubkey: account.pubkey, canonicalPubkey, relayList, relayResults, publishedRelays: [] }
  }

  const event = await makeContentKeyEventForPubkey({
    userSigner,
    contentPubkey: canonicalPubkey,
    createdAt: _nowSeconds()
  })
  const result = await _publish(event, relaysToPublish)
  return {
    pubkey: account.pubkey,
    canonicalPubkey,
    relayList,
    relayResults,
    event,
    result,
    publishedRelays: relaysToPublish
  }
}

export async function upsertContentKeyEvent ({ userSigner, contentKeySigner, relays, _publish = publish, _resolveWriteRelays = resolveWriteRelays }) {
  if (!userSigner?.getPublicKey) throw new Error('USER_SIGNER_REQUIRED')
  const pubkey = await userSigner.getPublicKey()
  const writeRelays = relays?.length ? relays : await _resolveWriteRelays(pubkey)
  const event = await makeContentKeyEvent({ userSigner, contentKeySigner })
  const result = await _publish(event, writeRelays)
  return { event, result }
}

export async function doubleSignEvent ({ userSigner, contentKeySigner, event }) {
  if (!userSigner?.signEvent) throw new Error('USER_SIGNER_REQUIRED')
  if (!contentKeySigner?.getPublicKey || !contentKeySigner?.signEvent) throw new Error('CONTENT_KEY_SIGNER_REQUIRED')
  if (!event || typeof event !== 'object') throw new Error('EVENT_REQUIRED')

  const imkcPubkey = await contentKeySigner.getPublicKey()
  const unsigned = copyUnsignedEvent(event)
  const proofless = withImkcTag(unsigned, ['imkc', imkcPubkey])
  const proofEvent = await contentKeySigner.signEvent(copyUnsignedEvent(proofless))
  const proofed = withImkcTag(unsigned, ['imkc', imkcPubkey, proofEvent.sig])
  return userSigner.signEvent(copyUnsignedEvent(proofed))
}

export async function refreshStoredContentKeyEvents ({
  _fetchRelayListEvent = fetchRelayListEvent,
  _fetchEvents = fetchEvents,
  _publish = publish,
  _isOnline = isOnline,
  _nowSeconds = nowSeconds
} = {}) {
  if (!secrets.isUnlocked()) return { skipped: 'locked', accounts: [] }
  const accounts = contentKeyAccounts()
  if (!accounts.length) return { checked: 0, accounts: [] }
  if (!await _isOnline()) return { skipped: 'offline', accounts: accounts.map(account => account.pubkey) }

  const results = []
  for (const account of accounts) {
    try {
      results.push(await refreshAccountContentKeyEvent({
        account,
        _fetchRelayListEvent,
        _fetchEvents,
        _publish,
        _nowSeconds
      }))
    } catch (err) {
      console.warn('content key event refresh failed', account.pubkey, err?.message ?? err)
      results.push({ pubkey: account.pubkey, error: err })
    }
  }
  return {
    checked: accounts.length,
    published: results.reduce((count, result) => count + (result.publishedRelays?.length || 0), 0),
    accounts: results
  }
}

export async function refreshStoredContentKeyEventsIfDue ({
  intervalMs = CONTENT_KEY_EVENT_REFRESH_INTERVAL_MS,
  _nowMs = () => Date.now(),
  ...options
} = {}) {
  if (!secrets.isUnlocked()) return { skipped: 'locked' }
  const now = _nowMs()
  const last = readLastContentKeyEventRefresh()
  if (last && now - last < intervalMs) return { skipped: 'fresh', nextInMs: intervalMs - (now - last) }
  const result = await refreshStoredContentKeyEvents(options)
  if (result.skipped !== 'offline' && result.skipped !== 'locked') writeLastContentKeyEventRefresh(now)
  return result
}

export function startContentKeyEventRefresh ({
  intervalMs = CONTENT_KEY_EVENT_REFRESH_INTERVAL_MS,
  _setTimeout = setTimeout,
  _clearTimeout = clearTimeout,
  _onOnline = onOnline,
  ...options
} = {}) {
  stopContentKeyEventRefresh?.()
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
    const last = readLastContentKeyEventRefresh()
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
    if (stopped) return Promise.resolve()
    if (!secrets.isUnlocked()) return Promise.resolve()
    if (!running) {
      running = refreshStoredContentKeyEventsIfDue({ intervalMs, ...options })
        .catch(err => {
          console.warn('content key event refresh failed', err?.message ?? err)
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
  stopContentKeyEventRefresh = () => {
    stopped = true
    clearTimer()
    unsubSecrets()
    unsubOnline()
    stopContentKeyEventRefresh = null
  }
  tick()
  return stopContentKeyEventRefresh
}
