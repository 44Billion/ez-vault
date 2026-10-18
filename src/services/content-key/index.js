import { getIykcProofs, rememberContentKeyEvent } from 'libp2r2p/content-key'
import { isOnline, onOnline } from 'libp2r2p/network'
import { makeContentKeyEvent, parseContentKeyEvent } from 'libp2r2p/content-key/event'
import { CONTENT_KEY_ANNOUNCEMENT } from 'libp2r2p/kind'
import { freeRelays, relayPool, seedRelays } from 'libp2r2p/relay'
import * as store from '../accounts-store.js'
import * as secrets from '../secrets.js'
import { filterVisibleAccounts } from '../account-mutations.js'
import { fetchRelayListEvent, parseRelayListEvent, resolveWriteRelays } from '../relay.js'
import { getState, setState } from '../storage/index.js'
import { createContentKeyPublicationJobs } from './publication-jobs.js'

export { getIykcProofs }

export const CONTENT_KEY_EVENT_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000

const CONTENT_KEY_EVENT_REFRESH_KEY = 'ez-vault:content-key-events:last-refresh'

let stopContentKeyEventRefresh = null
let publicationGeneration = 0

const publicationJobs = createContentKeyPublicationJobs({
  current: (owner, key, accountPubkey = owner) => secrets.isUnlocked() && store.get(accountPubkey)?.type === 'nsec' && secrets.getLatestContentKeySigner(owner)?.getPublicKey() === key,
  online: () => globalThis.navigator?.onLine !== false,
  onOnline,
  onError: () => console.warn('content key background publication failed'),
  debug: entry => { if (typeof IS_DEVELOPMENT !== 'undefined' && IS_DEVELOPMENT) console.debug(`[messaging-performance] ${JSON.stringify(entry)}`) }
})
function clearPublications () { publicationGeneration++; publicationJobs.clear() }
secrets.subscribe(() => { if (!secrets.isUnlocked()) clearPublications(); else publicationJobs.reconcile() })
secrets.subscribeContentKeys(() => publicationJobs.reconcile())
store.subscribe(() => publicationJobs.reconcile())
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { stopContentKeyEventRefresh?.(); clearPublications() })

export function scheduleContentKeyPublication ({ ownerPubkey, accountPubkey = ownerPubkey, contentKeySigner, run, force = false }) {
  return publicationJobs.request(ownerPubkey, contentKeySigner.getPublicKey(), run, { force, accountPubkey })
}

export function recordContentKeyTiming (stage, contentKeyId, startedAt, diagnostics) {
  if (typeof IS_DEVELOPMENT === 'undefined' || !IS_DEVELOPMENT) return
  const ids = Object.fromEntries(['requestId', 'parentId', 'eventId'].filter(key =>
    typeof diagnostics?.[key] === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(diagnostics[key])
  ).map(key => [key, diagnostics[key]]))
  console.debug(`[messaging-performance] ${JSON.stringify({ stage, contentKeyId, ...ids, elapsedMs: performance.now() - startedAt })}`)
}

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

function newerAnnouncement (event, previous) {
  return event.created_at > previous.created_at ||
    (event.created_at === previous.created_at && event.id < previous.id)
}

function maybeUnref (timer) {
  timer?.unref?.()
  return timer
}

function unique (values) {
  return [...new Set((values || []).filter(Boolean))]
}

function readLastContentKeyEventRefresh () {
  const raw = getState(CONTENT_KEY_EVENT_REFRESH_KEY, 0)
  const value = Math.floor(Number(raw) || 0)
  return Number.isSafeInteger(value) && value > 0 ? value : 0
}

function writeLastContentKeyEventRefresh (value = Date.now()) {
  return setState(CONTENT_KEY_EVENT_REFRESH_KEY, Math.max(0, Math.floor(Number(value) || 0)))
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
  _relayPool,
  _nowSeconds,
  signal
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
      await store.update(account.pubkey, { relayListEvent, writeRelays })
    }
    return { writeRelays, relayListEvent, published: false, reason: '' }
  }

  const event = await userSigner.signEvent(relayListTemplate({
    readRelays,
    writeRelays,
    createdAt: _nowSeconds()
  }))
  signal?.throwIfAborted()
  const result = await _relayPool.sendEvent(event, seedRelays, { signal })
  signal?.throwIfAborted()
  await store.update(account.pubkey, { relayListEvent: event, writeRelays })
  return { writeRelays, relayListEvent: event, published: true, reason, result }
}

async function resolveContentKeyWriteRelays ({
  account,
  userSigner,
  _fetchRelayListEvent,
  _relayPool,
  _nowSeconds,
  signal
}) {
  const relayListEvent = await _fetchRelayListEvent(account.pubkey)
  signal?.throwIfAborted()
  const parsedRelays = parseRelayListEvent(relayListEvent)
  return publishRelayListIfNeeded({
    account,
    userSigner,
    relayListEvent,
    parsedRelays,
    _relayPool,
    _nowSeconds,
    signal
  })
}

async function fetchLatestContentKeyEventFromRelay ({ ownerPubkey, relay, _relayPool, signal }) {
  try {
    const response = await _relayPool.getEvents({
      kinds: [CONTENT_KEY_ANNOUNCEMENT],
      authors: [ownerPubkey],
      limit: 1
    }, [relay], {
      signal,
      timeout: 5000,
      timeoutAfterFirstEose: null
    })
    if (!response.success) throw response.errors[0]?.reason || new Error('CONTENT_KEY_RELAY_READ_FAILED')
    let latest = null
    for (const { event } of response.result) {
      const parsed = parseContentKeyEvent(event)
      if (!parsed) continue
      if (!latest || newerAnnouncement(event, latest.event)) latest = { event, parsed }
    }
    return { relay, latest, error: null }
  } catch (err) {
    return { relay, latest: null, error: err }
  }
}

async function refreshAccountContentKeyEvent ({
  account,
  _fetchRelayListEvent,
  _relayPool,
  _nowSeconds,
  signal
}) {
  const userSigner = secrets.getNsecSigner(account.pubkey)
  if (!userSigner) return { pubkey: account.pubkey, skipped: 'locked' }

  if (!secrets.getLatestContentKeySigner(account.pubkey)) return { pubkey: account.pubkey, skipped: 'no-local-content-key' }

  const relayList = await resolveContentKeyWriteRelays({
    account,
    userSigner,
    _fetchRelayListEvent,
    _relayPool,
    _nowSeconds,
    signal
  })
  signal?.throwIfAborted()
  const writeRelays = unique(relayList.writeRelays)
  if (!writeRelays.length) return { pubkey: account.pubkey, skipped: 'no-write-relays', relayList }

  const relayResults = await Promise.all(writeRelays.map(relay =>
    fetchLatestContentKeyEventFromRelay({ ownerPubkey: account.pubkey, relay, _relayPool, signal })
  ))
  signal?.throwIfAborted()
  const checkedResults = relayResults.filter(result => !result.error)
  const found = checkedResults.map(result => result.latest).filter(Boolean)
  if (!checkedResults.length) return { pubkey: account.pubkey, skipped: 'relay-check-failed', relayList, relayResults }

  // Relay observations decide where to publish, never which local key to use.
  const contentKeySigner = secrets.getLatestContentKeySigner(account.pubkey)
  if (!contentKeySigner) return { pubkey: account.pubkey, skipped: 'no-local-content-key' }
  const canonicalPubkey = await contentKeySigner.getPublicKey()
  const relaysToPublish = checkedResults
    .filter(result => result.latest?.parsed.iykcPubkey !== canonicalPubkey)
    .map(result => result.relay)

  if (!relaysToPublish.length) {
    return { pubkey: account.pubkey, canonicalPubkey, relayList, relayResults, publishedRelays: [] }
  }

  const event = await makeContentKeyEvent({
    userSigner,
    contentKeySigner,
    createdAt: Math.max(_nowSeconds(), ...found.map(result => result.event.created_at + 1))
  })
  signal?.throwIfAborted()
  const result = await _relayPool.sendEvent(event, relaysToPublish, { signal })
  signal?.throwIfAborted()
  if (result?.success) rememberContentKeyEvent(event)
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

export async function upsertContentKeyEvent ({ userSigner, contentKeySigner, createdAt, relays, signal, _relayPool = relayPool, _resolveWriteRelays = resolveWriteRelays }) {
  if (!userSigner?.getPublicKey) throw new Error('USER_SIGNER_REQUIRED')
  const pubkey = await userSigner.getPublicKey()
  const writeRelays = relays?.length ? relays : await _resolveWriteRelays(pubkey)
  signal?.throwIfAborted()
  const event = await makeContentKeyEvent({ userSigner, contentKeySigner, createdAt })
  signal?.throwIfAborted()
  const result = await _relayPool.sendEvent(event, writeRelays, { signal })
  signal?.throwIfAborted()
  if (result?.success) rememberContentKeyEvent(event)
  return { event, result }
}

export async function rotateContentKeyIfStillCanonical ({
  ownerPubkey,
  removedKnownContentPubkey,
  _fetchRelayListEvent = fetchRelayListEvent,
  _relayPool = relayPool,
  _nowSeconds = nowSeconds
} = {}) {
  const account = store.get(ownerPubkey)
  if (!account || account.type !== 'nsec') return { status: 'cleared', reason: 'missing-owner' }
  if (!removedKnownContentPubkey) return { status: 'cleared', reason: 'missing-removed-key' }

  const userSigner = secrets.getNsecSigner(ownerPubkey)
  if (!userSigner) return { status: 'retry', reason: 'locked' }

  const relayList = await resolveContentKeyWriteRelays({
    account,
    userSigner,
    _fetchRelayListEvent,
    _relayPool,
    _nowSeconds
  })
  const writeRelays = unique(relayList.writeRelays)
  if (!writeRelays.length) return { status: 'retry', reason: 'no-write-relays', relayList }

  const relayResults = await Promise.all(writeRelays.map(relay =>
    fetchLatestContentKeyEventFromRelay({ ownerPubkey, relay, _relayPool })
  ))
  const checkedResults = relayResults.filter(result => !result.error)
  if (!checkedResults.length) return { status: 'retry', reason: 'relay-check-failed', relayList, relayResults }

  let canonical = null
  for (const result of checkedResults.map(result => result.latest).filter(Boolean)) {
    if (!canonical || newerAnnouncement(result.event, canonical.event)) canonical = result
  }
  if (!canonical) return { status: 'retry', reason: 'missing-canonical', relayList, relayResults }
  if (canonical.parsed.iykcPubkey !== removedKnownContentPubkey) {
    return {
      status: 'cleared',
      reason: 'already-rotated',
      canonicalPubkey: canonical.parsed.iykcPubkey,
      relayList,
      relayResults
    }
  }

  let contentKeySigner = secrets.getLatestContentKeySigner(ownerPubkey)
  if (!contentKeySigner) return { status: 'retry', reason: 'missing-local-content-key', relayList, relayResults }

  let contentPubkey = await contentKeySigner.getPublicKey()
  let rotated = false
  if (contentPubkey === removedKnownContentPubkey) {
    contentKeySigner = await secrets.createContentKeySecret(ownerPubkey, _nowSeconds())
    contentPubkey = await contentKeySigner.getPublicKey()
    rotated = true
  }

  const event = await makeContentKeyEvent({
    userSigner,
    contentKeySigner,
    createdAt: Math.max(_nowSeconds(), canonical.event.created_at + 1)
  })
  const result = await _relayPool.sendEvent(event, writeRelays)
  if (result?.success) rememberContentKeyEvent(event)
  return {
    status: result?.success ? 'rotated' : 'retry',
    reason: result?.success ? '' : 'publish-failed',
    rotated,
    contentPubkey,
    event,
    result,
    relayList,
    relayResults
  }
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
  _relayPool = relayPool,
  _isOnline = isOnline,
  _nowSeconds = nowSeconds
} = {}) {
  if (!secrets.isUnlocked()) return { skipped: 'locked', accounts: [] }
  const generation = publicationGeneration
  const accounts = contentKeyAccounts()
  if (!accounts.length) return { checked: 0, accounts: [] }
  if (!await _isOnline()) return { skipped: 'offline', accounts: accounts.map(account => account.pubkey) }

  const results = []
  for (const account of accounts) {
    if (generation !== publicationGeneration || !secrets.isUnlocked()) return { skipped: 'superseded', accounts: [] }
    if (store.get(account.pubkey)?.type !== 'nsec') continue
    try {
      const contentKeySigner = secrets.getLatestContentKeySigner(account.pubkey)
      results.push(await scheduleContentKeyPublication({
        ownerPubkey: account.pubkey, contentKeySigner, force: true,
        run: async signal => {
          const result = await refreshAccountContentKeyEvent({ account, _fetchRelayListEvent, _relayPool, _nowSeconds, signal })
          if (result.skipped === 'relay-check-failed' || result.result?.success === false) throw new Error('CONTENT_KEY_PUBLISH_FAILED')
          return result
        }
      }))
    } catch (err) {
      console.warn('content key event refresh failed', account.pubkey, err?.message ?? err)
      results.push({ pubkey: account.pubkey, error: err })
    }
  }
  if (generation !== publicationGeneration || !secrets.isUnlocked()) return { skipped: 'superseded', accounts: [] }
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
  if (!['offline', 'locked', 'superseded'].includes(result.skipped)) await writeLastContentKeyEventRefresh(now)
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
