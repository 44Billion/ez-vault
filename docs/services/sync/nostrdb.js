import * as nostrdb from '../nostrdb.js'
import { createEventReplyPacker } from '../private-messenger/recovery.js'

// Flow notes:
// - Adverts ride the trusted-device announce cadence: debounced after startup
//   or local changes, then every four hours from the parent sync controller.
// - The parent currently flushes owner accounts in series; each advert is one
//   yell to all trusted peer pubkeys on that owner's derived sync channel.
// - Asks are per owner+peer and are created/published serially as adverts,
//   retries, or replies are processed; replies arrive later through the normal
//   message drain, so we never block waiting for an offline peer to answer.
//   Retries rebuild the ask from current advert/local IDs instead of resending
//   stale payloads. Retry sweeps also walk owners/peers in series.
// - Pushes are per owner: leading-edge immediate, then trailing-batched every
//   1.5 seconds for bursts.
// - App-install backfills use the same account channel, but page by app export
//   cursor (`after` event id) instead of sync-anchor score windows.
// - Sync windows use NostrDB `sa` millisecond scores, not Nostr created_at.

// payload: { generatedAt, minScore, maxScore }
export const NOSTRDB_SYNC_ADVERTISE_CODE = 'nostrDbSync_advertise_kpkr'
// payload: { requestId, sinceScore, untilScore, excludeIds, limit }
export const NOSTRDB_SYNC_ASK_CODE = 'nostrDbSync_ask_kpkr'
// payload: { requestId, sinceScore, untilScore, hasMore, index, isLast, jsonl }
// `isLast` closes the chunked private-message reply: no more JSONL chunks are
// expected for this specific response. `hasMore` describes the requested score
// window itself: true means the responder hit its page cap, so the requester
// should re-ask the same window after rebuilding its local excludeIds.
export const NOSTRDB_SYNC_REPLY_CODE = 'nostrDbSync_reply_kpkr'
// payload: { index, isLast, jsonl }
export const NOSTRDB_SYNC_PUSH_CODE = 'nostrDbSync_push_kpkr'
// payload: { requestId, appId, after, batchSize }
export const NOSTRDB_SYNC_APP_ASK_CODE = 'nostrDbSync_appAsk_7c93'
// payload: { requestId, appId, after, nextAfter, hasMore, index, isLast, jsonl }
export const NOSTRDB_SYNC_APP_REPLY_CODE = 'nostrDbSync_appReply_7c93'

const STATE_KEY = 'ez-vault:trusted-signer-sync:nostrdb:v1'
const HEX32 = /^[0-9a-f]{64}$/i
const APP_ID_MAX_LENGTH = 512
const DEFAULT_WINDOW_MS = 15 * 60 * 1000
const MIN_WINDOW_MS = 60 * 1000
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const ADVERT_EDGE_EXTENSION_MS = 4 * 60 * 60 * 1000
const INVENTORY_LIMIT = 200
const REQUEST_LIMIT = 200
const SMALL_REPLY_COUNT = 20
const NO_REPLY_RETRY_MS = 2 * 24 * 60 * 60 * 1000
const ONLINE_RETRY_MIN_MS = 5 * 60 * 1000
const ONLINE_RETRY_MAX_MS = 6 * 60 * 60 * 1000
const STATE_PRUNE_MS = 30 * 24 * 60 * 60 * 1000
const PUSH_THROTTLE_MS = 1500
const PUSH_EVENTS_PER_CHUNK = 100
const RECENT_SYNC_EVENT_TTL_MS = 2 * 60 * 1000

const SYNC_CODES = new Set([
  NOSTRDB_SYNC_ADVERTISE_CODE,
  NOSTRDB_SYNC_ASK_CODE,
  NOSTRDB_SYNC_REPLY_CODE,
  NOSTRDB_SYNC_PUSH_CODE,
  NOSTRDB_SYNC_APP_ASK_CODE,
  NOSTRDB_SYNC_APP_REPLY_CODE
])

function nowMs () {
  return Date.now()
}

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function normalizePubkey (value) {
  const pubkey = typeof value === 'string' ? value.toLowerCase() : ''
  return HEX32.test(pubkey) ? pubkey : ''
}

function normalizeAppId (value) {
  const appId = typeof value === 'string' ? value : ''
  return appId && appId.length <= APP_ID_MAX_LENGTH ? appId : ''
}

function appStateKey (appId) {
  return JSON.stringify(appId)
}

function appIdFromStateKey (key) {
  try {
    return normalizeAppId(JSON.parse(key))
  } catch {
    return ''
  }
}

function normalizeOptionalEventId (value) {
  if (value == null || value === '') return ''
  return normalizePubkey(value)
}

function messageCode (message) {
  return isPlainObject(message?.payload) ? message.payload.code || '' : ''
}

function messageBody (message) {
  return isPlainObject(message?.payload?.payload) ? message.payload.payload : {}
}

function messageTimeMs (message) {
  const seconds = message?.outer?.created_at || message?.event?.created_at || 0
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds * 1000 : 0
}

function isSafeScore (value) {
  return Number.isSafeInteger(value) && value >= 0
}

function normalizeScore (value) {
  return isSafeScore(value) ? value : null
}

function normalizePositiveInteger (value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Math.floor(Number(value))
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback
}

function clampWindow (value) {
  const number = normalizePositiveInteger(value, DEFAULT_WINDOW_MS, MAX_WINDOW_MS)
  return Math.max(MIN_WINDOW_MS, Math.min(MAX_WINDOW_MS, number))
}

function adaptWindow (current, replyCount, limit) {
  const windowMs = clampWindow(current)
  if (replyCount <= 0) return clampWindow(windowMs * 4)
  if (replyCount < SMALL_REPLY_COUNT) return clampWindow(windowMs * 2)
  if (replyCount >= limit) return clampWindow(Math.floor(windowMs / 2))
  return windowMs
}

function shrinkWindow (current) {
  return clampWindow(Math.floor(clampWindow(current) / 2))
}

function normalizeIdList (values, limit = INVENTORY_LIMIT) {
  const out = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const id = normalizePubkey(value)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= limit) break
  }
  return out
}

function normalizeAdvert (payload) {
  if (!isPlainObject(payload)) return null
  const generatedAt = normalizePositiveInteger(payload.generatedAt, 0)
  if (!generatedAt) return null

  const minScore = payload.minScore == null ? null : normalizeScore(payload.minScore)
  const maxScore = payload.maxScore == null ? null : normalizeScore(payload.maxScore)
  if ((minScore == null) !== (maxScore == null)) return null
  if (minScore != null && maxScore < minScore) return null
  return { generatedAt, minScore, maxScore }
}

function normalizeAsk (payload) {
  if (!isPlainObject(payload)) return null
  const requestId = typeof payload.requestId === 'string' && payload.requestId ? payload.requestId : ''
  const sinceScore = normalizeScore(payload.sinceScore)
  const untilScore = normalizeScore(payload.untilScore)
  if (!requestId || sinceScore == null || untilScore == null || untilScore < sinceScore) return null
  return {
    requestId,
    sinceScore,
    untilScore,
    excludeIds: normalizeIdList(payload.excludeIds),
    limit: normalizePositiveInteger(payload.limit, REQUEST_LIMIT, REQUEST_LIMIT)
  }
}

function normalizeAppAsk (payload) {
  if (!isPlainObject(payload)) return null
  const requestId = typeof payload.requestId === 'string' && payload.requestId ? payload.requestId : ''
  const appId = normalizeAppId(payload.appId)
  const after = normalizeOptionalEventId(payload.after)
  if (!requestId || !appId || (payload.after && !after)) return null
  return {
    requestId,
    appId,
    after,
    batchSize: normalizePositiveInteger(payload.batchSize, REQUEST_LIMIT, REQUEST_LIMIT)
  }
}

function normalizeEventBatchPayload (payload) {
  if (!isPlainObject(payload)) return null
  const index = Math.floor(Number(payload.index))
  if (!Number.isSafeInteger(index) || index < 0) return null
  if (typeof payload.jsonl !== 'string') return null
  return {
    requestId: typeof payload.requestId === 'string' ? payload.requestId : '',
    sinceScore: normalizeScore(payload.sinceScore),
    untilScore: normalizeScore(payload.untilScore),
    index,
    isLast: payload.isLast === true,
    hasMore: typeof payload.hasMore === 'boolean' ? payload.hasMore : null,
    jsonl: payload.jsonl
  }
}

function normalizeAppEventBatchPayload (payload) {
  const normalized = normalizeEventBatchPayload(payload)
  if (!normalized) return null
  const appId = normalizeAppId(payload.appId)
  const after = normalizeOptionalEventId(payload.after)
  const nextAfter = normalizeOptionalEventId(payload.nextAfter)
  if (!appId || (payload.after && !after) || (payload.nextAfter && !nextAfter)) return null
  return {
    ...normalized,
    appId,
    after,
    nextAfter
  }
}

function parseJsonlEvents (jsonl) {
  const events = []
  for (const line of String(jsonl || '').split('\n')) {
    if (!line) continue
    try {
      const event = JSON.parse(line)
      if (Number.isInteger(event?.kind)) events.push(event)
    } catch {
    }
  }
  return events
}

function eventsToJsonl (events) {
  return events.map(event => JSON.stringify(event)).join('\n') + (events.length ? '\n' : '')
}

function readState (storage) {
  try {
    const state = JSON.parse(storage?.getItem?.(STATE_KEY) || '{}')
    return isPlainObject(state) ? state : {}
  } catch {
    return {}
  }
}

function writeState (storage, state) {
  try {
    storage?.setItem?.(STATE_KEY, JSON.stringify(state))
  } catch {
  }
}

function ownerState (state, ownerPubkey) {
  if (!isPlainObject(state.owners)) state.owners = {}
  if (!isPlainObject(state.owners[ownerPubkey])) state.owners[ownerPubkey] = {}
  return state.owners[ownerPubkey]
}

function peerState (state, ownerPubkey, peerPubkey) {
  const owner = ownerState(state, ownerPubkey)
  if (!isPlainObject(owner[peerPubkey])) owner[peerPubkey] = {}
  return owner[peerPubkey]
}

function appBackfillsState (state) {
  if (!isPlainObject(state.appBackfills)) state.appBackfills = {}
  return state.appBackfills
}

function ownerAppBackfillsState (state, ownerPubkey) {
  const backfills = appBackfillsState(state)
  if (!isPlainObject(backfills[ownerPubkey])) backfills[ownerPubkey] = {}
  return backfills[ownerPubkey]
}

function appBackfillState (state, ownerPubkey, appId) {
  const owner = ownerAppBackfillsState(state, ownerPubkey)
  const key = appStateKey(appId)
  if (!isPlainObject(owner[key])) owner[key] = { appId, peers: {} }
  if (!isPlainObject(owner[key].peers)) owner[key].peers = {}
  owner[key].appId = appId
  return owner[key]
}

function appBackfillPeerState (state, ownerPubkey, appId, peerPubkey) {
  const app = appBackfillState(state, ownerPubkey, appId)
  if (!isPlainObject(app.peers[peerPubkey])) app.peers[peerPubkey] = {}
  return app.peers[peerPubkey]
}

function existingAppBackfillPeerState (state, ownerPubkey, appId, peerPubkey) {
  const app = state.appBackfills?.[ownerPubkey]?.[appStateKey(appId)]
  const entry = app?.peers?.[peerPubkey]
  return isPlainObject(app) && isPlainObject(entry) ? { app, entry } : {}
}

function appBackfillPeerKeys (app) {
  return Object.keys(isPlainObject(app?.peers) ? app.peers : {})
}

function setAppBackfillTargetPeers (app, peerPubkeys) {
  app.peers = {}
  for (const peerPubkey of peerPubkeys) app.peers[peerPubkey] = {}
}

function compareAdvert (next, current) {
  if (!current) return 1
  if ((next.generatedAt || 0) !== (current.generatedAt || 0)) return (next.generatedAt || 0) - (current.generatedAt || 0)
  if ((next.messageAt || 0) !== (current.messageAt || 0)) return (next.messageAt || 0) - (current.messageAt || 0)
  return String(next.eventId || '').localeCompare(String(current.eventId || ''))
}

function requestId (random = Math.random) {
  return `${Date.now().toString(36)}:${random().toString(36).slice(2)}`
}

function syncQuery (since, until, extra = {}) {
  return {
    since,
    until,
    search: 'algo:sync sort:asc',
    ...extra
  }
}

async function dbRange (db, emptyScore) {
  const first = await db.query({ search: 'algo:sync sort:asc', limit: 1 })
  const minScore = first?.meta?.firstScore ?? null
  // Empty DBs still advertise a current anchor so peers can later ask through
  // maxScore + the normal advert freshness window.
  if (minScore == null) return { minScore: emptyScore, maxScore: emptyScore }
  const last = await db.query({ search: 'algo:sync sort:desc', limit: 1 })
  return {
    minScore,
    maxScore: last?.meta?.firstScore ?? first?.meta?.lastScore ?? minScore
  }
}

function localOwnerForMessage (message, context) {
  const ownerPubkey = normalizePubkey(context.ownerPubkeyForChannel?.(message?.channelPubkey) || '')
  if (!ownerPubkey) return ''
  const owners = context.ownerPubkeys
  if (owners instanceof Set) return owners.has(ownerPubkey) ? ownerPubkey : ''
  return ownerPubkey
}

function isTrustedSender (message, context) {
  return context.trustedByPubkey?.has?.(message?.event?.pubkey) || false
}

function ownerChannelPubkey (ownerPubkey, context) {
  return context.channelPubkeyForOwner?.(ownerPubkey) || ownerPubkey
}

function trustedPubkeys (context) {
  if (Array.isArray(context.receiverPubkeys)) return context.receiverPubkeys.filter(Boolean)
  return [...(context.trustedByPubkey?.keys?.() || [])]
}

function emitDebug (debug, action, detail = {}) {
  try {
    debug?.({ source: 'nostrdb-sync', action, ...detail })
  } catch {
  }
}

export function createNostrDbSyncController ({
  getDb = nostrdb.forAccount,
  storage = globalThis.localStorage,
  _setTimeout = globalThis.setTimeout?.bind(globalThis),
  _clearTimeout = globalThis.clearTimeout?.bind(globalThis),
  _nowMs = nowMs,
  _random = Math.random,
  onError = err => console.warn('nostrdb sync failed', err?.message ?? err)
} = {}) {
  const subscriptions = new Map()
  const pushQueues = new Map()
  const recentSyncEventIds = new Map()
  let runtime = {}
  let retryTimer = null

  function report (err) {
    try { onError?.(err) } catch {}
  }

  function getState () {
    return readState(storage)
  }

  function setState (state) {
    writeState(storage, state)
  }

  function pruneRecentSyncEventIds () {
    const now = _nowMs()
    for (const [id, expiresAt] of recentSyncEventIds) {
      if (expiresAt <= now) recentSyncEventIds.delete(id)
    }
  }

  function markRecentSyncEvent (event) {
    if (!normalizePubkey(event?.id)) return
    pruneRecentSyncEventIds()
    // Prevent echo: a sync-imported event may trigger our DB subscription, but
    // it should not be pushed right back to the peer that just sent it.
    recentSyncEventIds.set(event.id, _nowMs() + RECENT_SYNC_EVENT_TTL_MS)
  }

  function isRecentSyncEvent (event) {
    pruneRecentSyncEventIds()
    return recentSyncEventIds.has(event?.id)
  }

  async function announceRange ({ messenger, ownerPubkey, channelPubkey = ownerPubkey, receiverPubkeys, debug = runtime.debug } = {}) {
    const receivers = [...new Set((receiverPubkeys || []).filter(Boolean))]
    if (!messenger?.yell || !ownerPubkey || !receivers.length) return null
    let range
    const generatedAt = _nowMs()
    try {
      range = await dbRange(getDb(ownerPubkey), generatedAt)
    } catch (err) {
      report(err)
      return null
    }

    const payload = {
      generatedAt,
      minScore: range.minScore,
      maxScore: range.maxScore
    }
    emitDebug(debug, 'advertise', {
      channelPubkey,
      ownerPubkey,
      receiverPubkeys: receivers,
      receiverCount: receivers.length,
      minScore: payload.minScore,
      maxScore: payload.maxScore
    })
    return messenger.yell({
      channelPubkey,
      receiverPubkeys: receivers,
      code: NOSTRDB_SYNC_ADVERTISE_CODE,
      payload
    })
  }

  async function localInventoryIds (db, sinceScore, untilScore) {
    const { results } = await db.query(syncQuery(sinceScore, untilScore, {
      ids_only: true,
      limit: INVENTORY_LIMIT
    }))
    return normalizeIdList(results)
  }

  async function buildAskWindow (db, sinceScore, targetScore, windowMs) {
    // Windows are over NostrDB sync-anchor scores (`sa`, milliseconds), not
    // Nostr event created_at seconds.
    let size = clampWindow(windowMs)
    while (true) {
      const untilScore = Math.min(targetScore, sinceScore + size - 1)
      const excludeIds = await localInventoryIds(db, sinceScore, untilScore)
      if (excludeIds.length < INVENTORY_LIMIT || size <= MIN_WINDOW_MS) {
        return { sinceScore, untilScore, excludeIds, windowMs: size }
      }
      size = Math.max(MIN_WINDOW_MS, Math.floor(size / 2))
    }
  }

  async function maybeAsk (ownerPubkey, peerPubkey, context = runtime, { onlineHint = false, force = false } = {}) {
    if (!context.messenger?.ask) return null
    const state = getState()
    const entry = peerState(state, ownerPubkey, peerPubkey)
    const advert = entry.advert
    if (!advert || advert.maxScore == null || advert.minScore == null) return null

    const now = _nowMs()
    if (entry.pending && !force) {
      const retryAt = onlineHint
        ? Math.min(entry.pending.nextRetryAt || Infinity, entry.pending.onlineRetryAt || Infinity)
        : entry.pending.nextRetryAt
      if (!Number.isFinite(retryAt) || now < retryAt) {
        scheduleRetrySweep(context)
        return null
      }
    }

    const completed = Number.isSafeInteger(entry.completedScore)
      ? entry.completedScore
      : advert.minScore - 1
    const targetScore = advert.maxScore + ADVERT_EDGE_EXTENSION_MS
    const sinceScore = Math.max(advert.minScore, completed + 1)
    if (sinceScore > targetScore) {
      entry.pending = null
      entry.updatedAt = now
      setState(state)
      return null
    }

    let askWindow
    try {
      askWindow = await buildAskWindow(getDb(ownerPubkey), sinceScore, targetScore, entry.windowMs)
    } catch (err) {
      report(err)
      return null
    }

    const id = requestId(_random)
    const attempt = force ? (entry.pending?.attempt || 0) + 1 : 0
    const onlineDelay = Math.min(ONLINE_RETRY_MAX_MS, ONLINE_RETRY_MIN_MS * (2 ** attempt))
    const payload = {
      requestId: id,
      sinceScore: askWindow.sinceScore,
      untilScore: askWindow.untilScore,
      excludeIds: askWindow.excludeIds,
      limit: REQUEST_LIMIT
    }

    try {
      await context.messenger.ask({
        channelPubkey: ownerChannelPubkey(ownerPubkey, context),
        receiverPubkey: peerPubkey,
        code: NOSTRDB_SYNC_ASK_CODE,
        payload
      })
    } catch (err) {
      report(err)
      return null
    }

    entry.windowMs = askWindow.windowMs
    entry.pending = {
      requestId: id,
      sinceScore: askWindow.sinceScore,
      untilScore: askWindow.untilScore,
      limit: REQUEST_LIMIT,
      replyCount: 0,
      attempt,
      sentAt: now,
      nextRetryAt: now + NO_REPLY_RETRY_MS,
      onlineRetryAt: now + onlineDelay
    }
    entry.updatedAt = now
    setState(state)
    scheduleRetrySweep(context)
    emitDebug(context.debug, 'ask', {
      channelPubkey: ownerChannelPubkey(ownerPubkey, context),
      ownerPubkey,
      receiverPubkey: peerPubkey,
      sinceScore: payload.sinceScore,
      untilScore: payload.untilScore,
      excludeCount: payload.excludeIds.length
    })
    return payload
  }

  async function maybeAskAppBackfill (ownerPubkey, appId, peerPubkey, context = runtime, { onlineHint = false, force = false } = {}) {
    if (!context.messenger?.ask) return null
    if (!normalizeAppId(appId) || !normalizePubkey(peerPubkey)) return null
    if (context.ownerPubkeys instanceof Set && !context.ownerPubkeys.has(ownerPubkey)) return null
    if (!context.trustedByPubkey?.has?.(peerPubkey)) return null

    const state = getState()
    const appKey = appStateKey(appId)
    const existingApp = state.appBackfills?.[ownerPubkey]?.[appKey]
    if (!isPlainObject(existingApp?.peers) || !Object.hasOwn(existingApp.peers, peerPubkey)) return null
    const app = appBackfillState(state, ownerPubkey, appId)
    const entry = appBackfillPeerState(state, ownerPubkey, appId, peerPubkey)
    if (entry.completed && !force) return null

    const now = _nowMs()
    if (entry.pending && !force) {
      const retryAt = onlineHint
        ? Math.min(entry.pending.nextRetryAt || Infinity, entry.pending.onlineRetryAt || Infinity)
        : entry.pending.nextRetryAt
      if (!Number.isFinite(retryAt) || now < retryAt) {
        scheduleRetrySweep(context)
        return null
      }
    }

    const id = requestId(_random)
    const attempt = force && entry.pending ? (entry.pending.attempt || 0) + 1 : 0
    const onlineDelay = Math.min(ONLINE_RETRY_MAX_MS, ONLINE_RETRY_MIN_MS * (2 ** attempt))
    const payload = {
      requestId: id,
      appId,
      after: entry.after || '',
      batchSize: REQUEST_LIMIT
    }

    entry.completed = false
    entry.pending = {
      requestId: id,
      appId,
      after: payload.after,
      batchSize: REQUEST_LIMIT,
      replyCount: 0,
      attempt,
      sentAt: now,
      nextRetryAt: now + NO_REPLY_RETRY_MS,
      onlineRetryAt: now + onlineDelay
    }
    entry.updatedAt = now
    app.updatedAt = now
    setState(state)

    try {
      await context.messenger.ask({
        channelPubkey: ownerChannelPubkey(ownerPubkey, context),
        receiverPubkey: peerPubkey,
        code: NOSTRDB_SYNC_APP_ASK_CODE,
        payload
      })
    } catch (err) {
      const nextState = getState()
      const { app: nextApp, entry: nextEntry } = existingAppBackfillPeerState(nextState, ownerPubkey, appId, peerPubkey)
      if (nextEntry?.pending?.requestId === id) {
        nextEntry.pending = null
        nextEntry.updatedAt = _nowMs()
        nextApp.updatedAt = nextEntry.updatedAt
        setState(nextState)
      }
      report(err)
      return null
    }

    scheduleRetrySweep(context)
    emitDebug(context.debug, 'app-ask', {
      ownerPubkey,
      appId,
      receiverPubkey: peerPubkey,
      after: payload.after
    })
    return payload
  }

  async function processAppBackfills (context = runtime, { ownerPubkey = '', peerPubkey = '', onlineHint = false } = {}) {
    const state = getState()
    const owners = state.appBackfills || {}
    const contextOwners = context.ownerPubkeys instanceof Set ? context.ownerPubkeys : new Set(context.ownerPubkeys || [])
    const contextPeers = trustedPubkeys(context)
    let changed = false
    for (const [owner, apps] of Object.entries(owners)) {
      if (ownerPubkey && owner !== ownerPubkey) continue
      if (contextOwners.size && !contextOwners.has(owner)) continue
      for (const [key, appState] of Object.entries(apps || {})) {
        const appId = normalizeAppId(appState?.appId) || appIdFromStateKey(key)
        if (!appId) continue
        if (appState.unresolvedPeers) {
          if (!context.deferAppBackfillPeerResolution && !contextPeers.length) {
            delete apps[key]
            changed = true
            continue
          }
          if (!contextPeers.length) continue
          setAppBackfillTargetPeers(appState, contextPeers)
          appState.unresolvedPeers = false
          appState.updatedAt = _nowMs()
          changed = true
        }
        const peers = peerPubkey
          ? (Object.hasOwn(appState.peers || {}, peerPubkey) ? [peerPubkey] : [])
          : appBackfillPeerKeys(appState)
        if (changed) {
          setState(state)
          changed = false
        }
        for (const peer of peers) {
          await maybeAskAppBackfill(owner, appId, peer, context, { onlineHint })
        }
      }
      if (Object.keys(apps || {}).length === 0) {
        delete owners[owner]
        changed = true
      }
    }
    if (changed) setState(state)
  }

  function requestAppBackfill ({ ownerPubkey, appId } = {}, context = runtime) {
    const owner = normalizePubkey(ownerPubkey)
    const app = normalizeAppId(appId)
    if (!owner || !app) return false
    const peers = trustedPubkeys(context)
    if (!peers.length && !context.deferAppBackfillPeerResolution) return false
    const state = getState()
    const entry = appBackfillState(state, owner, app)
    const now = _nowMs()
    // A reinstall wants a complete replay for this app, so old per-peer
    // cursors are intentionally discarded. The peer set is frozen at request
    // time; peers discovered later will get the regular owner DB sync instead.
    setAppBackfillTargetPeers(entry, peers)
    entry.unresolvedPeers = peers.length === 0
    entry.requestedAt = now
    entry.updatedAt = now
    setState(state)
    processAppBackfills(context, { ownerPubkey: owner }).catch(report)
    scheduleRetrySweep(context)
    emitDebug(context.debug, 'app-backfill-requested', { ownerPubkey: owner, appId: app })
    return true
  }

  async function handleAdvertise (ownerPubkey, message, context) {
    const advert = normalizeAdvert(messageBody(message))
    const peerPubkey = normalizePubkey(message?.event?.pubkey)
    if (!advert || !peerPubkey) return true

    const nextAdvert = {
      ...advert,
      messageAt: messageTimeMs(message),
      eventId: message?.event?.id || ''
    }
    const state = getState()
    const entry = peerState(state, ownerPubkey, peerPubkey)
    if (compareAdvert(nextAdvert, entry.advert) <= 0) return true
    entry.advert = nextAdvert
    entry.updatedAt = _nowMs()
    setState(state)
    emitDebug(context.debug, 'advertise-received', {
      ownerPubkey,
      senderPubkey: peerPubkey,
      minScore: advert.minScore,
      maxScore: advert.maxScore
    })
    await maybeAsk(ownerPubkey, peerPubkey, context, { onlineHint: true })
    await processAppBackfills(context, { ownerPubkey, peerPubkey, onlineHint: true })
    return true
  }

  async function handleAsk (ownerPubkey, message, context) {
    const ask = normalizeAsk(messageBody(message))
    if (!ask) return true

    let results = []
    let hasMore = false
    try {
      const db = getDb(ownerPubkey)
      const effectiveLimit = Math.min(ask.limit, REQUEST_LIMIT)
      const response = await db.query(syncQuery(ask.sinceScore, ask.untilScore, {
        '!ids': ask.excludeIds,
        limit: effectiveLimit + 1
      }))
      const queried = Array.isArray(response?.results) ? response.results : []
      hasMore = queried.length > effectiveLimit
      results = queried.slice(0, effectiveLimit)
    } catch (err) {
      report(err)
      return true
    }

    const options = {
      channelPubkey: message.channelPubkey,
      question: message.event,
      receiverPubkey: message.event?.pubkey,
      code: NOSTRDB_SYNC_REPLY_CODE,
      payload: {
        requestId: ask.requestId,
        sinceScore: ask.sinceScore,
        untilScore: ask.untilScore,
        hasMore
      },
      sendEmptyReply: true
    }
    const packer = typeof context.messenger?.createEventReplyPacker === 'function'
      ? context.messenger.createEventReplyPacker(options)
      : createEventReplyPacker({ messenger: context.messenger, ...options })

    try {
      for (const event of results) await packer.update(event)
      await packer.finalize()
    } catch (err) {
      report(err)
    }
    emitDebug(context.debug, 'reply', {
      ownerPubkey,
      receiverPubkey: message.event?.pubkey || '',
      requestId: ask.requestId,
      hasMore,
      count: results.length
    })
    return true
  }

  async function handleAppAsk (ownerPubkey, message, context) {
    const ask = normalizeAppAsk(messageBody(message))
    if (!ask) return true

    let results = []
    let hasMore = false
    let nextAfter = ask.after
    try {
      const db = getDb(ownerPubkey)
      if (typeof db.exportEventsByAppPage === 'function') {
        const page = await db.exportEventsByAppPage(ask.appId, {
          after: ask.after,
          batchSize: ask.batchSize
        })
        results = Array.isArray(page?.events) ? page.events.slice(0, ask.batchSize) : []
        hasMore = page?.hasMore === true
        nextAfter = normalizeOptionalEventId(page?.nextAfter) || results.at(-1)?.id || ask.after
      }
    } catch (err) {
      report(err)
      return true
    }

    const options = {
      channelPubkey: message.channelPubkey,
      question: message.event,
      receiverPubkey: message.event?.pubkey,
      code: NOSTRDB_SYNC_APP_REPLY_CODE,
      payload: {
        requestId: ask.requestId,
        appId: ask.appId,
        after: ask.after,
        nextAfter,
        hasMore
      },
      sendEmptyReply: true
    }
    const packer = typeof context.messenger?.createEventReplyPacker === 'function'
      ? context.messenger.createEventReplyPacker(options)
      : createEventReplyPacker({ messenger: context.messenger, ...options })

    try {
      for (const event of results) await packer.update(event)
      await packer.finalize()
    } catch (err) {
      report(err)
    }
    emitDebug(context.debug, 'app-reply', {
      ownerPubkey,
      appId: ask.appId,
      receiverPubkey: message.event?.pubkey || '',
      requestId: ask.requestId,
      hasMore,
      count: results.length
    })
    return true
  }

  async function ingestEvents (ownerPubkey, events) {
    if (!events.length) return 0
    let imported = 0
    let db
    try {
      db = getDb(ownerPubkey)
    } catch (err) {
      report(err)
      return 0
    }
    for (const event of events) {
      markRecentSyncEvent(event)
      try {
        // Synced rows stay app-neutral; CRDT merge uses deterministic sync
        // ordering instead of local authoring-time ordering.
        const result = await db.add(event, { mergeSource: 'sync' })
        if (result?.ok !== false) imported++
      } catch (err) {
        report(err)
      }
    }
    return imported
  }

  async function ingestAppEvents (ownerPubkey, appId, events) {
    if (!events.length) return 0
    for (const event of events) markRecentSyncEvent(event)
    try {
      const db = getDb(ownerPubkey)
      if (typeof db.addEventsForApp === 'function') {
        const result = await db.addEventsForApp(appId, events)
        return normalizePositiveInteger(result?.added, 0)
      }
      let imported = 0
      for (const event of events) {
        const result = await db.add(event, { appId, mergeSource: 'sync' })
        if (result?.ok !== false) imported++
      }
      return imported
    } catch (err) {
      report(err)
      return 0
    }
  }

  async function handleReply (ownerPubkey, message, context) {
    const payload = normalizeEventBatchPayload(messageBody(message))
    const peerPubkey = normalizePubkey(message?.event?.pubkey)
    if (!payload || !peerPubkey) return true

    const events = parseJsonlEvents(payload.jsonl)
    await ingestEvents(ownerPubkey, events)

    const state = getState()
    const entry = peerState(state, ownerPubkey, peerPubkey)
    const pending = entry?.pending
    if (pending && payload.requestId && pending.requestId === payload.requestId) {
      pending.replyCount = (pending.replyCount || 0) + events.length
      if (payload.isLast) {
        const replyCount = pending.replyCount || 0
        const hasMore = payload.hasMore ?? replyCount >= (pending.limit || REQUEST_LIMIT)
        if (hasMore) {
          entry.windowMs = shrinkWindow(entry.windowMs)
        } else {
          entry.completedScore = Math.max(entry.completedScore || 0, pending.untilScore)
          entry.windowMs = adaptWindow(entry.windowMs, replyCount, pending.limit || REQUEST_LIMIT)
        }
        entry.pending = null
        entry.updatedAt = _nowMs()
        setState(state)
        emitDebug(context.debug, 'reply-received', {
          ownerPubkey,
          senderPubkey: peerPubkey,
          requestId: payload.requestId,
          count: replyCount,
          hasMore,
          untilScore: pending.untilScore
        })
        await maybeAsk(ownerPubkey, peerPubkey, context, { force: true })
        return true
      }
      entry.updatedAt = _nowMs()
      setState(state)
    }
    return true
  }

  async function handleAppReply (ownerPubkey, message, context) {
    const payload = normalizeAppEventBatchPayload(messageBody(message))
    const peerPubkey = normalizePubkey(message?.event?.pubkey)
    if (!payload || !peerPubkey) return true

    const state = getState()
    const { app, entry } = existingAppBackfillPeerState(state, ownerPubkey, payload.appId, peerPubkey)
    const pending = entry?.pending
    if (!pending || !payload.requestId || pending.requestId !== payload.requestId) return true

    const events = parseJsonlEvents(payload.jsonl)
    await ingestAppEvents(ownerPubkey, payload.appId, events)
    pending.replyCount = (pending.replyCount || 0) + events.length
    if (events.length) pending.lastEventId = events.at(-1).id

    if (payload.isLast) {
      const replyCount = pending.replyCount || 0
      const nextAfter = payload.nextAfter || pending.lastEventId || pending.after || ''
      const hasMore = payload.hasMore ?? replyCount >= (pending.batchSize || REQUEST_LIMIT)
      entry.after = nextAfter
      entry.completed = !hasMore
      entry.pending = null
      entry.updatedAt = _nowMs()
      app.updatedAt = entry.updatedAt
      setState(state)
      emitDebug(context.debug, 'app-reply-received', {
        ownerPubkey,
        appId: payload.appId,
        senderPubkey: peerPubkey,
        requestId: payload.requestId,
        count: replyCount,
        hasMore,
        nextAfter
      })
      if (hasMore) await maybeAskAppBackfill(ownerPubkey, payload.appId, peerPubkey, context, { force: true })
      return true
    }

    entry.updatedAt = _nowMs()
    app.updatedAt = entry.updatedAt
    setState(state)
    return true
  }

  async function handlePush (ownerPubkey, message, context) {
    const payload = normalizeEventBatchPayload(messageBody(message))
    if (!payload) return true
    const events = parseJsonlEvents(payload.jsonl)
    const imported = await ingestEvents(ownerPubkey, events)
    emitDebug(context.debug, 'push-received', {
      ownerPubkey,
      senderPubkey: message.event?.pubkey || '',
      count: imported
    })
    await processAppBackfills(context, { ownerPubkey, peerPubkey: message.event?.pubkey || '', onlineHint: true })
    return true
  }

  async function handleMessage (message, context = runtime) {
    const code = messageCode(message)
    if (!SYNC_CODES.has(code)) return false
    const ownerPubkey = localOwnerForMessage(message, context)
    if (!ownerPubkey || !isTrustedSender(message, context)) return false

    if (code === NOSTRDB_SYNC_ADVERTISE_CODE) return handleAdvertise(ownerPubkey, message, context)
    if (code === NOSTRDB_SYNC_ASK_CODE) return handleAsk(ownerPubkey, message, context)
    if (code === NOSTRDB_SYNC_REPLY_CODE) return handleReply(ownerPubkey, message, context)
    if (code === NOSTRDB_SYNC_PUSH_CODE) return handlePush(ownerPubkey, message, context)
    if (code === NOSTRDB_SYNC_APP_ASK_CODE) return handleAppAsk(ownerPubkey, message, context)
    return handleAppReply(ownerPubkey, message, context)
  }

  function pushRuntime (ownerPubkey) {
    const receiverPubkeys = trustedPubkeys(runtime)
    if (!runtime.messenger?.yell || !receiverPubkeys.length) return null
    return {
      messenger: runtime.messenger,
      channelPubkey: ownerChannelPubkey(ownerPubkey, runtime),
      receiverPubkeys
    }
  }

  async function flushPushQueue (ownerPubkey) {
    const queue = pushQueues.get(ownerPubkey)
    if (!queue || queue.events.size === 0) return
    const target = pushRuntime(ownerPubkey)
    if (!target) return

    const events = [...queue.events.values()]
    queue.events.clear()
    let index = 0
    for (let i = 0; i < events.length; i += PUSH_EVENTS_PER_CHUNK) {
      const chunk = events.slice(i, i + PUSH_EVENTS_PER_CHUNK)
      try {
        await target.messenger.yell({
          channelPubkey: target.channelPubkey,
          receiverPubkeys: target.receiverPubkeys,
          code: NOSTRDB_SYNC_PUSH_CODE,
          payload: {
            index: index++,
            isLast: i + PUSH_EVENTS_PER_CHUNK >= events.length,
            jsonl: eventsToJsonl(chunk)
          }
        })
      } catch (err) {
        report(err)
      }
    }
    emitDebug(runtime.debug, 'push', {
      ownerPubkey,
      channelPubkey: target.channelPubkey,
      receiverCount: target.receiverPubkeys.length,
      count: events.length
    })
  }

  function startPushCooldown (ownerPubkey, queue) {
    queue.cooling = true
    queue.timer = _setTimeout(async () => {
      queue.timer = null
      queue.cooling = false
      if (queue.events.size > 0) {
        await flushPushQueue(ownerPubkey)
        startPushCooldown(ownerPubkey, queue)
      }
    }, PUSH_THROTTLE_MS)
    queue.timer?.unref?.()
  }

  function queuePush (ownerPubkey, event) {
    // Only local/non-sync subscription events are pushed; the cooldown gives us
    // leading-edge delivery plus a trailing batch for bursts.
    if (!normalizePubkey(event?.id) || isRecentSyncEvent(event)) return
    let queue = pushQueues.get(ownerPubkey)
    if (!queue) {
      queue = { events: new Map(), timer: null, cooling: false }
      pushQueues.set(ownerPubkey, queue)
    }
    queue.events.set(event.id, event)
    if (queue.cooling) return
    flushPushQueue(ownerPubkey).catch(report)
    startPushCooldown(ownerPubkey, queue)
  }

  function stopSubscription (ownerPubkey) {
    const sub = subscriptions.get(ownerPubkey)
    if (!sub) return
    sub.stopped = true
    sub.iterator?.return?.().catch?.(() => {})
    subscriptions.delete(ownerPubkey)
  }

  function startSubscription (ownerPubkey) {
    if (subscriptions.has(ownerPubkey)) return
    let iterator
    try {
      const iterable = getDb(ownerPubkey).subscribe({ search: 'algo:sync sort:asc' }, { scheduled: false })
      iterator = iterable?.[Symbol.asyncIterator]?.() || iterable
    } catch (err) {
      report(err)
      return
    }
    if (!iterator?.next) return

    const sub = { iterator, stopped: false }
    subscriptions.set(ownerPubkey, sub)
    ;(async () => {
      try {
        for await (const item of iterator) {
          if (sub.stopped) break
          queuePush(ownerPubkey, item?.result)
        }
      } catch (err) {
        if (!sub.stopped) report(err)
      } finally {
        if (subscriptions.get(ownerPubkey) === sub) subscriptions.delete(ownerPubkey)
      }
    })()
  }

  function pruneState ({ ownerPubkeys = new Set(), trustedByPubkey = new Map() } = {}) {
    const owners = ownerPubkeys instanceof Set ? ownerPubkeys : new Set(ownerPubkeys || [])
    const peers = new Set(trustedByPubkey?.keys?.() || [])
    const cutoff = _nowMs() - STATE_PRUNE_MS
    const state = getState()
    if (isPlainObject(state.owners)) {
      for (const ownerPubkey of Object.keys(state.owners)) {
        if (!owners.has(ownerPubkey)) {
          delete state.owners[ownerPubkey]
          continue
        }
        const owner = state.owners[ownerPubkey]
        for (const peerPubkey of Object.keys(owner)) {
          const entry = owner[peerPubkey]
          if (!peers.has(peerPubkey) || (entry.updatedAt || 0) < cutoff) delete owner[peerPubkey]
        }
        if (Object.keys(owner).length === 0) delete state.owners[ownerPubkey]
      }
    }
    if (isPlainObject(state.appBackfills)) {
      for (const ownerPubkey of Object.keys(state.appBackfills)) {
        if (!owners.has(ownerPubkey)) {
          delete state.appBackfills[ownerPubkey]
          continue
        }
        const apps = state.appBackfills[ownerPubkey]
        for (const [key, app] of Object.entries(apps)) {
          if (!normalizeAppId(app?.appId) && !appIdFromStateKey(key)) {
            delete apps[key]
            continue
          }
          const appPeers = isPlainObject(app.peers) ? app.peers : {}
          for (const peerPubkey of Object.keys(appPeers)) {
            const entry = appPeers[peerPubkey]
            if (!peers.has(peerPubkey) || (entry.updatedAt || 0) < cutoff) delete appPeers[peerPubkey]
          }
          const hasFreshRequest = (app.updatedAt || app.requestedAt || 0) >= cutoff
          if (!hasFreshRequest && Object.keys(appPeers).length === 0) delete apps[key]
          else app.peers = appPeers
        }
        if (Object.keys(apps).length === 0) delete state.appBackfills[ownerPubkey]
      }
    }
    setState(state)
  }

  function nextRetryAt () {
    const state = getState()
    let next = Infinity
    for (const owner of Object.values(state.owners || {})) {
      for (const entry of Object.values(owner || {})) {
        const pending = entry?.pending
        if (!pending) continue
        next = Math.min(next, pending.nextRetryAt || Infinity)
      }
    }
    for (const apps of Object.values(state.appBackfills || {})) {
      for (const app of Object.values(apps || {})) {
        for (const entry of Object.values(app?.peers || {})) {
          const pending = entry?.pending
          if (!pending) continue
          next = Math.min(next, pending.nextRetryAt || Infinity)
        }
      }
    }
    return Number.isFinite(next) ? next : 0
  }

  function scheduleRetrySweep (context = runtime) {
    if (retryTimer) _clearTimeout?.(retryTimer)
    retryTimer = null
    const next = nextRetryAt()
    if (!next) return
    retryTimer = _setTimeout(() => {
      retryTimer = null
      retryDueRequests(context).catch(report)
    }, Math.max(0, next - _nowMs()))
    retryTimer?.unref?.()
  }

  async function retryDueRequests (context = runtime) {
    const state = getState()
    const now = _nowMs()
    for (const [ownerPubkey, owner] of Object.entries(state.owners || {})) {
      if (context.ownerPubkeys instanceof Set && !context.ownerPubkeys.has(ownerPubkey)) continue
      for (const [peerPubkey, entry] of Object.entries(owner || {})) {
        if (!entry?.pending || (entry.pending.nextRetryAt || Infinity) > now) continue
        await maybeAsk(ownerPubkey, peerPubkey, context, { force: true })
      }
    }
    for (const [ownerPubkey, apps] of Object.entries(state.appBackfills || {})) {
      if (context.ownerPubkeys instanceof Set && !context.ownerPubkeys.has(ownerPubkey)) continue
      for (const [key, app] of Object.entries(apps || {})) {
        const appId = normalizeAppId(app?.appId) || appIdFromStateKey(key)
        if (!appId) continue
        for (const [peerPubkey, entry] of Object.entries(app?.peers || {})) {
          if (!entry?.pending || (entry.pending.nextRetryAt || Infinity) > now) continue
          await maybeAskAppBackfill(ownerPubkey, appId, peerPubkey, context, { force: true })
        }
      }
    }
    scheduleRetrySweep(context)
  }

  function ensureSubscriptions (context = {}) {
    runtime = { ...runtime, ...context }
    const owners = runtime.ownerPubkeys instanceof Set ? runtime.ownerPubkeys : new Set(runtime.ownerPubkeys || [])
    for (const ownerPubkey of [...subscriptions.keys()]) {
      if (!owners.has(ownerPubkey)) stopSubscription(ownerPubkey)
    }
    for (const ownerPubkey of owners) startSubscription(ownerPubkey)
    pruneState({ ownerPubkeys: owners, trustedByPubkey: runtime.trustedByPubkey })
    processAppBackfills(runtime).catch(report)
    scheduleRetrySweep(runtime)
  }

  function stop () {
    for (const ownerPubkey of [...subscriptions.keys()]) stopSubscription(ownerPubkey)
    for (const queue of pushQueues.values()) {
      if (queue.timer) _clearTimeout?.(queue.timer)
    }
    pushQueues.clear()
    if (retryTimer) _clearTimeout?.(retryTimer)
    retryTimer = null
    runtime = {}
  }

  return {
    announceRange,
    handleMessage,
    ensureSubscriptions,
    requestAppBackfill,
    processAppBackfills,
    queuePush,
    stop,
    _getState: getState
  }
}
