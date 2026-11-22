import * as nostrdb from '../nostrdb.js'
import { createEventReplyPacker } from 'libp2r2p/private-messenger/recovery'
import { bytesToHex } from 'libp2r2p/base16'
import { finalizeEvent } from 'libp2r2p/event'
import { PERSONAL_COPY } from 'libp2r2p/kind'
import { createQueue } from 'libp2r2p/idb-queue'
import { keypairFromSeckey } from 'libp2r2p/key'
import { isOnline as defaultIsOnline } from 'libp2r2p/network'
import { PRIVATE_BROADCAST_KIND } from 'libp2r2p/private-channel'
import { relayPool as defaultRelayPool } from 'libp2r2p/relay'
import { sha256 } from '@noble/hashes/sha2.js'
import { NOSTRDB_SYNC, readRecords, replaceRecords } from '../storage/index.js'
import { publicationRetryAt } from '../../helpers/publication-retry.js'
import { assertSupportedPayloadVersion, syncPayloadInvalid } from './payload-error.js'

// Flow notes:
// - Adverts ride the trusted-device announce cadence: debounced after startup
//   or local changes, then every four hours from the parent sync controller.
// - The parent currently flushes owner accounts in series; each advert is one
//   yell to all trusted peer pubkeys on that owner's derived sync channel.
// - Asks are per owner+peer and replies arrive later through the normal message
//   drain, so we never block waiting for an offline peer to answer. Published
//   wire envelopes are checked every 20 minutes; missing asks/replies are
//   republished only after five minutes, and observed envelopes are deleted.
// - A recent lane walks backward from the advertised edge while the historical
//   lane advances from local completeness, so an old blocked range cannot hide
//   current messages.
// - Pushes are per owner and priority lane. Normal events are immediate;
//   lower/lowest events use a 200 ms quiet window capped at one second.
//   RelayConnection applies bulk pacing and retry backoff per relay.
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
// payload: { index, isLast, jsonl, priority? }
// `priority` is optional and may only lower delivery to `lower` or `lowest`.
export const NOSTRDB_SYNC_PUSH_CODE = 'nostrDbSync_push_kpkr'
// payload: { requestId, appId, after, batchSize }
export const NOSTRDB_SYNC_APP_ASK_CODE = 'nostrDbSync_appAsk_7c93'
// payload: { requestId, appId, after, nextAfter, hasMore, index, isLast, jsonl }
export const NOSTRDB_SYNC_APP_REPLY_CODE = 'nostrDbSync_appReply_7c93'

const STATE_KEY = 'ez-vault:trusted-signer-sync:nostrdb:v1'
const HEX32 = /^[0-9a-f]{64}$/i
const APP_ID_MAX_LENGTH = 512
const REQUEST_ID_MAX_LENGTH = 256
const MAX_SYNC_JSONL_CHARS = 4 * 1024 * 1024
const MAX_SYNC_JSONL_BYTES = 4 * 1024 * 1024
const DEFAULT_WINDOW_MS = 15 * 60 * 1000
const MIN_WINDOW_MS = 1000
// Small ranges may grow directly back to minutes after a complete reply.
const MIN_ADAPTIVE_WINDOW_MS = 60 * 1000
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const SYNC_ANCHOR_MAX_FUTURE_SKEW_MS = 5000
const INVENTORY_LIMIT = 200
// Scores are monotonic milliseconds, so a one-second range has about 1,000
// possible values. The extra slot distinguishes a complete range from one
// whose local inventory still exceeds the safe exclusion budget.
const MAX_DENSE_INVENTORY_IDS = 1024
const DENSE_INVENTORY_QUERY_LIMIT = MAX_DENSE_INVENTORY_IDS + 1
const DENSE_RANGE_BATCH_SIZE = 32
const REQUEST_LIMIT = 200
const DEFAULT_NOSTRDB_LANE_MODE = 'recent'
const NOSTRDB_LANE_MODES = new Set(['recent', 'history', 'both'])
const SMALL_REPLY_COUNT = 20
const ONLINE_RETRY_MIN_MS = 5 * 60 * 1000
const ONLINE_RETRY_MAX_MS = 6 * 60 * 60 * 1000
const EXCHANGE_CHECK_INTERVAL_MS = 20 * 60 * 1000
const EXCHANGE_MIN_RESEND_MS = 5 * 60 * 1000
const EXCHANGE_EXPIRY_GRACE_MS = 10 * 60 * 1000
const EXCHANGE_PRESENCE_BATCH_SIZE = 200
const EXCHANGE_DELETE_BATCH_SIZE = 100
const EXCHANGE_MAX_OWNERS = 32
const EXCHANGE_MAX_PER_OWNER = 1024
const EXCHANGE_PRESENCE_TIMEOUT_MS = 5000
const SYNC_EVENT_EXPIRATION_MS = 2 * 24 * 60 * 60 * 1000
const STATE_PRUNE_MS = 30 * 24 * 60 * 60 * 1000
const PUSH_EVENTS_PER_CHUNK = 100
const SYNC_BYTES_PER_CHUNK = 128 * 1024
const encoder = new TextEncoder()
const RECENT_SYNC_EVENT_TTL_MS = 2 * 60 * 1000
const PUSH_BATCH_WINDOW_MS = 200
const PUSH_BATCH_MAX_WAIT_MS = 1000
const PUSH_OUTBOX_PREFIX = 'ez-vault:trusted-signer-sync:nostrdb-push:v1'
const PUSH_CHUNK_OUTBOX_PREFIX = 'ez-vault:trusted-signer-sync:nostrdb-push-chunks:v1'
const PUSH_EVENT_OUTBOX_MAX_BYTES = 32 * 1024 * 1024
const PUSH_CHUNK_OUTBOX_MAX_BYTES = 16 * 1024 * 1024
const PUSH_RECOVERY_PAGE_SIZE = 200
const PUSH_COALESCING_INDEX = 'byCoalescingKey'
const PUSH_PRIORITIES = Object.freeze(['normal', 'lower', 'lowest'])
const PUSH_PRIORITY_RANK = Object.freeze({
  normal: 2,
  lower: 1,
  lowest: 0
})

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

function coalescingDigest (parts) {
  return bytesToHex(sha256(encoder.encode(JSON.stringify(parts))))
}

function pushChunkIdempotencyKey (events) {
  return coalescingDigest([
    'nostrdb-push',
    ...events.map(event => event.id).sort()
  ])
}

function pushChunkReceiverKey (chunk) {
  return normalizeIdList(chunk?.receiverPubkeys, Number.MAX_SAFE_INTEGER).sort().join(',')
}

function canCoalescePushChunks (first, second) {
  if (!first || !second || first.id === second.id ||
      first.channelPubkey !== second.channelPubkey ||
      first.priority !== second.priority ||
      pushChunkReceiverKey(first) !== pushChunkReceiverKey(second)) return false
  if (first.eventIds.length + second.eventIds.length > PUSH_EVENTS_PER_CHUNK) return false
  return encoder.encode(first.jsonl).byteLength + encoder.encode(second.jsonl).byteLength <=
    SYNC_BYTES_PER_CHUNK
}

function personalCopyTag (event, name) {
  const tags = Array.isArray(event?.tags)
    ? event.tags.filter(tag => Array.isArray(tag) && tag[0] === name && tag.length === 2)
    : []
  return tags.length === 1 && typeof tags[0][1] === 'string' ? tags[0][1] : ''
}

function pushEventCoalescingKey (event) {
  // The derived wrapper d binds context, inner kind, effective author and
  // inner d-tag without exposing their plaintext values.
  if (event?.kind !== PERSONAL_COPY) return ''
  const innerKind = personalCopyTag(event, 'k')
  const context = personalCopyTag(event, 'c')
  const coordinate = personalCopyTag(event, 'd')
  if (!innerKind || !context || !coordinate) return ''
  return coalescingDigest(['nostrdb-personal-copy', innerKind, context, coordinate])
}

function comparePushEventRecords (left, right) {
  const leftScore = isSafeScore(left?.score) ? left.score : -1
  const rightScore = isSafeScore(right?.score) ? right.score : -1
  if (leftScore !== rightScore) return leftScore > rightScore ? 1 : -1
  const leftCreatedAt = Number(left?.event?.created_at) || 0
  const rightCreatedAt = Number(right?.event?.created_at) || 0
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt > rightCreatedAt ? 1 : -1
  if (left?.id === right?.id) return 0
  return String(left?.id || '') < String(right?.id || '') ? 1 : -1
}

function requireDataBody (message) {
  const body = message?.payload?.payload
  if (!isPlainObject(body)) throw syncPayloadInvalid('payload-object-required')
  assertSupportedPayloadVersion(body)
  return body
}

function messageTimeMs (message) {
  const seconds = message?.outer?.created_at || message?.event?.created_at || 0
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds * 1000 : 0
}

function messageExpirationSeconds (message) {
  const tags = Array.isArray(message?.outer?.tags) ? message.outer.tags : []
  const values = tags
    .filter(tag => Array.isArray(tag) && tag[0] === 'expiration')
    .map(tag => Number(tag[1]))
  return values.length === 1 && Number.isSafeInteger(values[0]) && values[0] > 0
    ? values[0]
    : null
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
  const growthBase = Math.max(windowMs, MIN_ADAPTIVE_WINDOW_MS)
  if (replyCount <= 0) return clampWindow(growthBase * 4)
  if (replyCount < SMALL_REPLY_COUNT) return clampWindow(growthBase * 2)
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

function mergeIdLists (limit, ...lists) {
  const out = []
  const seen = new Set()
  for (const values of lists) {
    for (const value of Array.isArray(values) ? values : []) {
      const id = normalizePubkey(value)
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(id)
      if (out.length >= limit) return out
    }
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
  const requestId = typeof payload.requestId === 'string' && payload.requestId &&
    payload.requestId.length <= REQUEST_ID_MAX_LENGTH
    ? payload.requestId
    : ''
  const sinceScore = normalizeScore(payload.sinceScore)
  const untilScore = normalizeScore(payload.untilScore)
  if (!requestId || sinceScore == null || untilScore == null || untilScore < sinceScore) return null
  const excludeIds = normalizeIdList(payload.excludeIds, DENSE_INVENTORY_QUERY_LIMIT)
  if (excludeIds.length > MAX_DENSE_INVENTORY_IDS) return null
  return {
    requestId,
    sinceScore,
    untilScore,
    excludeIds,
    limit: normalizePositiveInteger(payload.limit, REQUEST_LIMIT, REQUEST_LIMIT),
    priority: payload.priority === 'lower' || payload.priority === 'lowest'
      ? payload.priority
      : 'normal'
  }
}

function normalizeAppAsk (payload) {
  if (!isPlainObject(payload)) return null
  const requestId = typeof payload.requestId === 'string' && payload.requestId &&
    payload.requestId.length <= REQUEST_ID_MAX_LENGTH
    ? payload.requestId
    : ''
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

export function askCoalescingDigest (message) {
  const code = messageCode(message)
  if (code === NOSTRDB_SYNC_ASK_CODE) {
    const ask = normalizeAsk(messageBody(message))
    if (!ask) return null
    return coalescingDigest([
      'nostrdb-range-ask',
      ask.sinceScore,
      ask.untilScore,
      [...ask.excludeIds].sort(),
      ask.limit,
      ask.priority
    ])
  }
  if (code === NOSTRDB_SYNC_APP_ASK_CODE) {
    const ask = normalizeAppAsk(messageBody(message))
    if (!ask) return null
    return coalescingDigest([
      'nostrdb-app-ask',
      ask.appId,
      ask.after,
      ask.batchSize
    ])
  }
  return null
}

export function coalescingHint (message) {
  const code = messageCode(message)
  if (code === NOSTRDB_SYNC_ADVERTISE_CODE) {
    const advert = normalizeAdvert(messageBody(message))
    if (!advert) return null
    return {
      key: coalescingDigest(['nostrdb-advertise-stream']),
      keep: 'latest',
      sequence: advert.generatedAt
    }
  }
  const key = askCoalescingDigest(message)
  return key ? { key, keep: 'latest' } : null
}

function normalizeEventBatchPayload (payload) {
  if (!isPlainObject(payload)) return null
  const index = Math.floor(Number(payload.index))
  if (!Number.isSafeInteger(index) || index < 0) return null
  if (typeof payload.isLast !== 'boolean') return null
  if (typeof payload.jsonl !== 'string' || payload.jsonl.length > MAX_SYNC_JSONL_CHARS ||
    encoder.encode(payload.jsonl).byteLength > MAX_SYNC_JSONL_BYTES) return null
  if (payload.requestId != null &&
    (typeof payload.requestId !== 'string' || payload.requestId.length > REQUEST_ID_MAX_LENGTH)) return null
  return {
    requestId: typeof payload.requestId === 'string' ? payload.requestId : '',
    sinceScore: normalizeScore(payload.sinceScore),
    untilScore: normalizeScore(payload.untilScore),
    index,
    isLast: payload.isLast,
    hasMore: typeof payload.hasMore === 'boolean' ? payload.hasMore : null,
    priority: PUSH_PRIORITIES.includes(payload.priority) ? payload.priority : 'normal',
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

function parseJsonlEventsDetailed (jsonl) {
  const events = []
  let rejected = 0
  for (const line of String(jsonl || '').split('\n')) {
    if (!line) continue
    try {
      const event = JSON.parse(line)
      if (isPlainObject(event) && Number.isInteger(event.kind)) events.push(event)
      else rejected++
    } catch {
      rejected++
    }
  }
  return { events, rejected }
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

function normalizeRelayUrl (value) {
  try {
    const url = new URL(value)
    if (!['ws:', 'wss:'].includes(url.protocol)) return ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function normalizeRelayList (values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(normalizeRelayUrl)
    .filter(Boolean))]
}

function normalizeSecret (value) {
  const secret = typeof value === 'string' ? value.toLowerCase() : ''
  return /^[0-9a-f]{64}$/.test(secret) ? secret : ''
}

function exchangesState (state) {
  if (!isPlainObject(state.exchanges)) state.exchanges = {}
  return state.exchanges
}

function ownerExchangesState (state, ownerPubkey) {
  const exchanges = exchangesState(state)
  if (!isPlainObject(exchanges[ownerPubkey])) exchanges[ownerPubkey] = {}
  return exchanges[ownerPubkey]
}

function peerExchangesState (state, ownerPubkey, peerPubkey) {
  const owner = ownerExchangesState(state, ownerPubkey)
  if (!isPlainObject(owner[peerPubkey])) owner[peerPubkey] = {}
  return owner[peerPubkey]
}

function exchangeStateKey (direction, requestId) {
  return `${direction}:${requestId}`
}

function exchangeRecord (state, ownerPubkey, peerPubkey, direction, requestId, create = false) {
  const existingPeers = state.exchanges?.[ownerPubkey]?.[peerPubkey]
  if (!isPlainObject(existingPeers) && !create) return null
  const peers = isPlainObject(existingPeers)
    ? existingPeers
    : peerExchangesState(state, ownerPubkey, peerPubkey)
  const key = exchangeStateKey(direction, requestId)
  if (!isPlainObject(peers[key]) && create) peers[key] = { direction, requestId, events: {} }
  const record = peers[key]
  if (!isPlainObject(record)) return null
  if (!isPlainObject(record.events)) record.events = {}
  for (const kind of ['ask', 'reply', 'advert']) {
    if (!Array.isArray(record.events[kind])) record.events[kind] = []
  }
  record.ownerPubkey = ownerPubkey
  record.peerPubkey = peerPubkey
  record.direction = direction
  record.requestId = requestId
  return record
}

function allExchangeRecords (state) {
  const records = []
  for (const [ownerPubkey, peers] of Object.entries(state.exchanges || {})) {
    for (const [peerPubkey, entries] of Object.entries(peers || {})) {
      for (const [key, record] of Object.entries(entries || {})) {
        if (isPlainObject(record)) records.push({ ownerPubkey, peerPubkey, key, record })
      }
    }
  }
  return records
}

function trimOwnerExchanges (state, ownerPubkey) {
  const records = allExchangeRecords(state).filter(entry => entry.ownerPubkey === ownerPubkey)
  if (records.length <= EXCHANGE_MAX_PER_OWNER) return
  records
    .sort((left, right) => (left.record.updatedAt || 0) - (right.record.updatedAt || 0))
    .slice(0, records.length - EXCHANGE_MAX_PER_OWNER)
    .forEach(entry => {
      delete state.exchanges?.[entry.ownerPubkey]?.[entry.peerPubkey]?.[entry.key]
    })
}

function trimExchangeOwners (state) {
  const owners = Object.keys(state.exchanges || {})
  if (owners.length <= EXCHANGE_MAX_OWNERS) return
  owners
    .map(ownerPubkey => ({
      ownerPubkey,
      updatedAt: Math.max(0, ...allExchangeRecords(state)
        .filter(entry => entry.ownerPubkey === ownerPubkey)
        .map(entry => entry.record.updatedAt || 0))
    }))
    .sort((left, right) => left.updatedAt - right.updatedAt)
    .slice(0, owners.length - EXCHANGE_MAX_OWNERS)
    .forEach(({ ownerPubkey }) => { delete state.exchanges[ownerPubkey] })
}

function mergeWireEvents (current, incoming) {
  const merged = new Map((Array.isArray(current) ? current : [])
    .filter(event => normalizePubkey(event?.id))
    .map(event => [event.id, event]))
  for (const event of incoming || []) {
    const id = normalizePubkey(event?.id)
    if (!id) continue
    const next = {
      id,
      relays: normalizeRelayList(event.relays),
      deletionSeckey: normalizeSecret(event.deletionSeckey),
      expiresAt: isSafeScore(event.expiresAt)
        ? event.expiresAt
        : 0
    }
    const previous = merged.get(id)
    merged.set(id, previous
      ? {
          ...previous,
          relays: normalizeRelayList([...(previous.relays || []), ...next.relays]),
          deletionSeckey: previous.deletionSeckey || next.deletionSeckey,
          expiresAt: Math.max(previous.expiresAt || 0, next.expiresAt || 0)
        }
      : next)
  }
  return [...merged.values()]
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

function laneCycleReplyIds (entry, lane) {
  // A hasMore cycle spans several requestIds. Retain every received id because
  // the peer database may contain older replaceable/addressable versions.
  const values = lane === 'recent' ? entry?.recent?.cycleReplyIds : entry?.historyCycleReplyIds
  return normalizeIdList(values, DENSE_INVENTORY_QUERY_LIMIT)
}

function setLaneCycleReplyIds (entry, lane, values) {
  const ids = normalizeIdList(values, DENSE_INVENTORY_QUERY_LIMIT)
  if (lane === 'recent') {
    entry.recent = isPlainObject(entry.recent) ? entry.recent : {}
    if (ids.length) entry.recent.cycleReplyIds = ids
    else delete entry.recent.cycleReplyIds
    return
  }
  if (ids.length) entry.historyCycleReplyIds = ids
  else delete entry.historyCycleReplyIds
}

function normalizedRecentHead (value) {
  const floor = isSafeScore(value?.floor) ? value.floor : null
  const ceiling = isSafeScore(value?.ceiling) ? value.ceiling : null
  return floor != null && ceiling != null && floor <= ceiling
    ? { floor, ceiling }
    : null
}

// Recent keeps one contiguous base and at most one fresh head. The head gives
// priority to the latest advert while the middle gap is filled from old to new.
function normalizeRecentState (entry, advertisedTarget, completedScore) {
  const previous = isPlainObject(entry.recent) ? entry.recent : {}
  const structured = isSafeScore(previous.descentScore) && isSafeScore(previous.coveredCeiling)
  const legacyTarget = isSafeScore(previous.targetScore)
    ? Math.min(previous.targetScore, advertisedTarget)
    : null
  const descentScore = isSafeScore(previous.descentScore)
    ? previous.descentScore
    : legacyTarget ?? advertisedTarget
  let coveredCeiling = Math.max(
    completedScore,
    isSafeScore(previous.coveredCeiling)
      ? previous.coveredCeiling
      : legacyTarget ?? completedScore
  )
  let headCoverage = normalizedRecentHead(previous.headCoverage)
  let gapCeiling = isSafeScore(previous.gapCeiling) ? previous.gapCeiling : null
  let pending = isPlainObject(previous.pending) ? previous.pending : null
  if (!structured && pending && pending.untilScore > advertisedTarget) pending = null
  if (pending && !['descent', 'gap-head', 'gap-fill'].includes(pending.phase)) {
    pending.phase = 'descent'
  }
  if (headCoverage && headCoverage.floor <= coveredCeiling + 1) {
    coveredCeiling = Math.max(coveredCeiling, headCoverage.ceiling)
    headCoverage = null
  }
  if (headCoverage && (gapCeiling == null || gapCeiling < headCoverage.ceiling)) {
    gapCeiling = headCoverage.ceiling
  }
  if (gapCeiling != null && gapCeiling <= coveredCeiling) gapCeiling = null
  const next = {
    ...previous,
    descentScore,
    coveredCeiling,
    gapCeiling,
    headCoverage,
    pending
  }
  delete next.targetScore
  return next
}

function reconcileRecentCoverage (recent) {
  if (recent.headCoverage && recent.headCoverage.floor <= recent.coveredCeiling + 1) {
    recent.coveredCeiling = Math.max(recent.coveredCeiling, recent.headCoverage.ceiling)
    recent.headCoverage = null
  }
  if (recent.headCoverage &&
      (recent.gapCeiling == null || recent.gapCeiling < recent.headCoverage.ceiling)) {
    recent.gapCeiling = recent.headCoverage.ceiling
  }
  if (recent.gapCeiling != null && recent.gapCeiling <= recent.coveredCeiling) {
    recent.gapCeiling = null
  }
}

function recentPhase (recent) {
  reconcileRecentCoverage(recent)
  if (recent.gapCeiling != null && recent.gapCeiling > recent.coveredCeiling) {
    if (!recent.headCoverage || recent.gapCeiling > recent.headCoverage.ceiling) return 'gap-head'
    return 'gap-fill'
  }
  return 'descent'
}

function advanceRecentCoverage (recent, pending) {
  const phase = pending.phase || 'descent'
  if (phase === 'descent') {
    recent.descentScore = Math.min(
      isSafeScore(recent.descentScore) ? recent.descentScore : pending.untilScore,
      pending.sinceScore - 1
    )
    recent.coveredCeiling = Math.max(recent.coveredCeiling, pending.untilScore)
  } else if (phase === 'gap-head') {
    const previous = normalizedRecentHead(recent.headCoverage)
    recent.headCoverage = previous && pending.sinceScore === previous.ceiling + 1
      ? { floor: previous.floor, ceiling: pending.untilScore }
      : { floor: pending.sinceScore, ceiling: pending.untilScore }
  } else {
    recent.coveredCeiling = Math.max(recent.coveredCeiling, pending.untilScore)
  }
  reconcileRecentCoverage(recent)
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
  return context.channelPubkeyForOwner?.(ownerPubkey) || ''
}

function isOwnerReady (ownerPubkey, context) {
  const ready = context.readyOwnerPubkeys
  if (ready instanceof Set) return ready.has(ownerPubkey)
  return Boolean(ownerChannelPubkey(ownerPubkey, context))
}

function publicationSucceeded (result) {
  if (!result?.delivery) return true
  const reports = result.delivery.reports
  return Array.isArray(reports) && reports.length > 0 && reports.every(report => report?.success === true)
}

function messengerPausedError (error) {
  const pending = [error]
  const seen = new Set()
  while (pending.length) {
    const current = pending.pop()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    if (current.code === 'PRIVATE_MESSENGER_PAUSED' || current.message === 'PRIVATE_MESSENGER_PAUSED') return true
    for (const key of ['cause', 'reason', 'error']) pending.push(current[key])
    for (const key of ['errors', 'reports', 'relays']) {
      if (Array.isArray(current[key])) pending.push(...current[key])
    }
  }
  return false
}

function markPendingForResume (entry, error, now, lane = 'history') {
  const pending = lane === 'recent' ? entry?.recent?.pending : entry?.pending
  if (!pending) return
  const retryAt = publicationRetryAt(error, now)
  if (retryAt > now) {
    delete pending.waitingForResume
    pending.nextRetryAt = retryAt
    pending.onlineRetryAt = retryAt
  } else {
    pending.waitingForResume = true
    pending.nextRetryAt = 0
    pending.onlineRetryAt = 0
  }
  entry.updatedAt = now
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

function debugToken (value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/.test(value)
    ? value
    : undefined
}

export function createNostrDbSyncController ({
  getDb = nostrdb.forAccount,
  storage,
  _setTimeout = globalThis.setTimeout?.bind(globalThis),
  _clearTimeout = globalThis.clearTimeout?.bind(globalThis),
  _nowMs = nowMs,
  _performanceNow = () => performance.now(),
  _random = Math.random,
  _indexedDB = globalThis.indexedDB,
  _createPushQueue = createQueue,
  _relayPool = defaultRelayPool,
  _isOnline = defaultIsOnline,
  getLaneMode = () => DEFAULT_NOSTRDB_LANE_MODE,
  onError = err => console.warn('nostrdb sync failed', err?.message ?? err)
} = {}) {
  if (typeof getLaneMode !== 'function') throw new Error('INVALID_NOSTRDB_LANE_MODE_GETTER')
  const subscriptions = new Map()
  const pushQueues = new Map()
  const pushOutboxes = new Map()
  const emptyContextByOwner = new Map()
  const recentSyncEventIds = new Map()
  let runtime = {}
  let retryTimer = null
  let exchangeTimer = null
  let exchangeChecking = false
  let exchangeAgain = false
  let exchangeGeneration = 0
  let requestSequence = 0
  let appBackfillProcessTail = Promise.resolve()
  let appBackfillProcessGeneration = 0
  let pendingAppBackfillProcess = null
  let durableState = storage
    ? readState(storage)
    : (readRecords(NOSTRDB_SYNC).find(record => record.key === 'state')?.value || {})
  let stateWriteTail = Promise.resolve()
  const askStats = { emitted: {}, suppressed: {} }
  const exchangeStats = {
    checked: 0,
    present: 0,
    absent: 0,
    unknown: 0,
    asksRepublished: 0,
    advertsRepublished: 0,
    repliesRegenerated: 0,
    deletionAttempts: 0,
    deletionConfirmed: 0,
    pruned: 0
  }
  const pushStats = {
    idleWakeCount: 0,
    idleWakeMs: 0,
    lastIdleWakeAt: null
  }

  function report (err) {
    try { onError?.(err) } catch {}
  }

  function throwIfHandlerAborted (context) {
    context.signal?.throwIfAborted()
  }

  function backgroundContext (context = runtime) {
    if (!context?.signal && !context?.backgroundMessenger) return context
    return {
      ...context,
      messenger: context.backgroundMessenger || context.messenger,
      signal: undefined
    }
  }

  function laneModeFor (ownerPubkey, peerPubkey, context = runtime) {
    const channelPubkey = ownerChannelPubkey(ownerPubkey, context)
    let mode
    try {
      mode = getLaneMode({ ownerPubkey, channelPubkey })
    } catch (error) {
      report(error)
      return DEFAULT_NOSTRDB_LANE_MODE
    }
    if (mode == null) return DEFAULT_NOSTRDB_LANE_MODE
    if (typeof mode !== 'string' || !NOSTRDB_LANE_MODES.has(mode)) {
      report(Object.assign(new Error('INVALID_NOSTRDB_LANE_MODE'), {
        code: 'INVALID_NOSTRDB_LANE_MODE'
      }))
      return DEFAULT_NOSTRDB_LANE_MODE
    }
    return mode
  }

  function getState () {
    return storage ? readState(storage) : structuredClone(durableState)
  }

  function laneEnabled (mode, lane) {
    return mode === 'both' || mode === lane
  }

  function removeLanePending (state, ownerPubkey, peerPubkey, entry, lane, now) {
    const pending = lane === 'history' ? entry.pending : entry.recent?.pending
    if (!pending) return false
    const exchange = exchangeRecord(state, ownerPubkey, peerPubkey, 'ask', pending.requestId)
    if (exchange) {
      exchange.status = 'deleting-ask'
      exchange.updatedAt = now
    }
    if (lane === 'history') entry.pending = null
    else entry.recent.pending = null
    setLaneCycleReplyIds(entry, lane, [])
    return true
  }

  function absorbRecentBaseIntoHistory (entry) {
    const recent = entry.recent
    if (!isPlainObject(recent) ||
        !isSafeScore(recent.descentScore) ||
        !isSafeScore(recent.coveredCeiling) ||
        !isSafeScore(entry.completedScore) ||
        entry.completedScore < recent.descentScore) return false
    if (recent.coveredCeiling <= entry.completedScore) return false
    entry.completedScore = recent.coveredCeiling
    recent.descentScore = recent.coveredCeiling
    reconcileRecentCoverage(recent)
    return true
  }

  function reconcileEntryLaneMode (state, ownerPubkey, peerPubkey, entry, mode, now) {
    let changed = false
    if (!laneEnabled(mode, 'history')) {
      changed = removeLanePending(state, ownerPubkey, peerPubkey, entry, 'history', now) || changed
    }
    if (!laneEnabled(mode, 'recent')) {
      changed = removeLanePending(state, ownerPubkey, peerPubkey, entry, 'recent', now) || changed
    }
    if (mode === 'history') {
      changed = absorbRecentBaseIntoHistory(entry) || changed
    }
    if (mode === 'both' &&
        entry.pending &&
        isSafeScore(entry.recent?.descentScore) &&
        entry.pending.untilScore > entry.recent.descentScore) {
      changed = removeLanePending(state, ownerPubkey, peerPubkey, entry, 'history', now) || changed
    }
    if (changed) entry.updatedAt = now
    return changed
  }

  function historyTargetScore (entry, targetScore, mode) {
    if (mode !== 'both' || !isSafeScore(entry?.recent?.descentScore)) return targetScore
    return Math.min(targetScore, entry.recent.descentScore)
  }

  function nextRequestId () {
    requestSequence += 1
    return `${_nowMs().toString(36)}:${requestSequence.toString(36)}:${_random().toString(36).slice(2)}`
  }

  function queueStateWrite (state) {
    const snapshot = structuredClone(state)
    const write = stateWriteTail.then(() => replaceRecords(
      NOSTRDB_SYNC,
      [{ key: 'state', value: snapshot }]
    ))
    stateWriteTail = write.catch(report)
    return write
  }

  function notifyRangeChanged (ownerPubkey, priority, context = runtime) {
    if (priority !== 'normal') return
    try {
      context.onRangeChanged?.(ownerPubkey)
    } catch (error) {
      report(error)
    }
  }

  function setState (state, { replaceKeys = [] } = {}) {
    const snapshot = structuredClone(state)
    const merge = current => {
      const next = { ...current, ...snapshot }
      for (const key of replaceKeys) {
        if (snapshot[key] === undefined) delete next[key]
        else next[key] = structuredClone(snapshot[key])
      }
      return next
    }
    if (storage) {
      const current = getState()
      const next = merge(current)
      if (snapshot.pushCursors === undefined && current.pushCursors !== undefined) {
        next.pushCursors = current.pushCursors
      }
      writeState(storage, next)
      return
    }
    const current = getState()
    const next = merge(current)
    if (snapshot.pushCursors === undefined && current.pushCursors !== undefined) {
      next.pushCursors = current.pushCursors
    }
    durableState = structuredClone(next)
    return queueStateWrite(next)
  }

  function channelRelays (channelPubkey, context = runtime) {
    return normalizeRelayList(context.relaysForChannel?.(channelPubkey))
  }

  function updateWireRelays (ownerPubkey, peerPubkey, direction, requestId, eventId, relays, context) {
    throwIfHandlerAborted(context)
    const state = getState()
    const record = exchangeRecord(state, ownerPubkey, peerPubkey, direction, requestId)
    if (!record) return
    let changed = false
    for (const kind of ['ask', 'reply', 'advert']) {
      for (const event of record.events[kind]) {
        if (event.id !== eventId) continue
        const next = normalizeRelayList([...(event.relays || []), ...relays])
        if (next.length === event.relays.length) continue
        event.relays = next
        changed = true
      }
    }
    if (changed) {
      record.updatedAt = _nowMs()
      setState(state)
    }
  }

  async function trackPublication ({
    ownerPubkey,
    peerPubkey,
    direction,
    requestId,
    code,
    channelPubkey,
    result,
    question,
    range,
    lane,
    context = runtime
  }) {
    throwIfHandlerAborted(context)
    ownerPubkey = normalizePubkey(ownerPubkey)
    peerPubkey = normalizePubkey(peerPubkey)
    if (!ownerPubkey || !peerPubkey) throw new Error('SYNC_EXCHANGE_IDENTITY_REQUIRED')
    const reports = Array.isArray(result?.delivery?.reports) ? result.delivery.reports : []
    const fallbackRelays = channelRelays(channelPubkey, context)
    const deletionSeckey = normalizeSecret(result?.delivery?.deletionSeckey)
    const now = _nowMs()
    const state = getState()
    const record = exchangeRecord(state, ownerPubkey, peerPubkey, direction, requestId, true)
    record.code = code
    record.channelPubkey = channelPubkey
    record.updatedAt = now
    record.lastPublishedAt = now
    record.notBeforeAt = 0
    record.nextCheckAt = now + EXCHANGE_CHECK_INTERVAL_MS
    record.expiresAt = Math.max(
      record.expiresAt || 0,
      now + SYNC_EVENT_EXPIRATION_MS + EXCHANGE_EXPIRY_GRACE_MS
    )
    record.range = range ? structuredClone(range) : record.range
    if (lane) record.lane = lane
    if (question) record.question = structuredClone(question)
    if (direction === 'ask' && range) {
      record.requestPayload = structuredClone(range)
      if (code === NOSTRDB_SYNC_APP_ASK_CODE) record.appId = normalizeAppId(range.appId)
    }
    if (direction === 'advert' && range) {
      record.requestPayload = structuredClone(range)
      if (publicationSucceeded(result)) {
        for (const peer of Object.values(state.exchanges?.[ownerPubkey] || {})) {
          for (const existing of Object.values(peer || {})) {
            if (existing === record || existing.direction !== 'advert' || existing.requestId === requestId) continue
            if (existing.status !== 'deleting-advert') {
              existing.status = 'deleting-advert'
              existing.updatedAt = now
            }
          }
        }
      }
    }
    const incoming = reports
      .map(report => ({
        id: normalizePubkey(report?.outerEventId),
        relays: normalizeRelayList(report?.succeededRelays || fallbackRelays),
        deletionSeckey,
        expiresAt: now + SYNC_EVENT_EXPIRATION_MS
      }))
      .filter(event => event.id)
    record.events[direction] = mergeWireEvents(record.events[direction], incoming)
    if (direction === 'ask') {
      record.status = 'awaiting-reply'
      record.lastAskPublishedAt = now
    } else if (direction === 'reply') {
      record.status = 'reply-published'
      record.lastReplyPublishedAt = now
    } else {
      record.status = 'advert-published'
      record.lastAdvertPublishedAt = now
    }
    trimOwnerExchanges(state, ownerPubkey)
    trimExchangeOwners(state)
    await setState(state)
    scheduleExchangeMaintenance(context)
    for (let index = 0; index < reports.length; index++) {
      const report = reports[index]
      const eventId = normalizePubkey(report?.outerEventId)
      if (!eventId || !report?.promise?.then) continue
      report.promise
        .then(summary => updateWireRelays(
          ownerPubkey,
          peerPubkey,
          direction,
          requestId,
          eventId,
          summary?.succeededRelays || fallbackRelays,
          context
        ))
        .then(() => scheduleExchangeMaintenance(context))
        .catch(() => {})
    }
    return record
  }

  async function trackInboundAsk ({
    ownerPubkey,
    peerPubkey,
    message,
    code,
    ask,
    context = runtime
  }) {
    throwIfHandlerAborted(context)
    const requestId = ask.requestId
    const now = _nowMs()
    const state = getState()
    const record = exchangeRecord(state, ownerPubkey, peerPubkey, 'reply', requestId, true)
    record.code = code
    record.channelPubkey = message.channelPubkey
    record.question = structuredClone(message.event)
    record.inboundPayload = structuredClone(message.payload)
    record.range = code === NOSTRDB_SYNC_APP_ASK_CODE
      ? { appId: ask.appId, after: ask.after, batchSize: ask.batchSize }
      : { sinceScore: ask.sinceScore, untilScore: ask.untilScore }
    record.updatedAt = now
    record.nextCheckAt = now + EXCHANGE_CHECK_INTERVAL_MS
    const askId = normalizePubkey(message.outer?.id)
    if (askId) {
      const createdAt = Number.isSafeInteger(message.outer?.created_at)
        ? message.outer.created_at * 1000
        : now
      record.events.ask = mergeWireEvents(record.events.ask, [{
        id: askId,
        relays: channelRelays(message.channelPubkey, context),
        expiresAt: createdAt + SYNC_EVENT_EXPIRATION_MS
      }])
      record.expiresAt = Math.max(
        record.expiresAt || 0,
        createdAt + SYNC_EVENT_EXPIRATION_MS + EXCHANGE_EXPIRY_GRACE_MS
      )
    }
    if (!record.expiresAt) record.expiresAt = now + SYNC_EVENT_EXPIRATION_MS + EXCHANGE_EXPIRY_GRACE_MS
    trimOwnerExchanges(state, ownerPubkey)
    trimExchangeOwners(state)
    await setState(state)
    scheduleExchangeMaintenance(context)
    return record
  }

  function exchangeDeadline (state) {
    let next = Infinity
    for (const entry of allExchangeRecords(state)) {
      if (entry.record.status === 'done') continue
      next = Math.min(next, entry.record.nextCheckAt || Infinity)
    }
    return next
  }

  function hasPendingExchangeWork (state) {
    if (allExchangeRecords(state).length) return true
    for (const peers of Object.values(state.owners || {})) {
      for (const entry of Object.values(peers || {})) {
        if (entry?.pending || entry?.recent?.pending) return true
      }
    }
    for (const apps of Object.values(state.appBackfills || {})) {
      for (const app of Object.values(apps || {})) {
        for (const entry of Object.values(app?.peers || {})) if (entry?.pending) return true
      }
    }
    return false
  }

  function syncPendingCheckDeadline (state, record, nextCheckAt) {
    if (record.direction !== 'ask') return
    for (const peer of [
      state.owners?.[record.ownerPubkey]?.[record.peerPubkey],
      state.appBackfills?.[record.ownerPubkey]?.[appStateKey(record.code === NOSTRDB_SYNC_APP_ASK_CODE ? record.appId : '')]?.peers?.[record.peerPubkey]
    ]) {
      if (!peer) continue
      if (peer.pending?.requestId === record.requestId) {
        peer.pending.nextRetryAt = nextCheckAt
        peer.pending.onlineRetryAt = nextCheckAt
      }
      if (peer.recent?.pending?.requestId === record.requestId) {
        peer.recent.pending.nextRetryAt = nextCheckAt
        peer.recent.pending.onlineRetryAt = nextCheckAt
      }
    }
  }

  async function migratePendingExchanges (context = runtime) {
    const state = getState()
    let changed = false
    for (const [ownerPubkey, peers] of Object.entries(state.owners || {})) {
      for (const [peerPubkey, entry] of Object.entries(peers || {})) {
        for (const [lane, pending] of [['history', entry?.pending], ['recent', entry?.recent?.pending]]) {
          if (!pending?.requestId || exchangeRecord(state, ownerPubkey, peerPubkey, 'ask', pending.requestId)) continue
          const record = exchangeRecord(state, ownerPubkey, peerPubkey, 'ask', pending.requestId, true)
          const sentAt = pending.sentAt || _nowMs()
          record.code = NOSTRDB_SYNC_ASK_CODE
          record.channelPubkey = ownerChannelPubkey(ownerPubkey, context)
          record.lane = lane
          record.requestPayload = {
            requestId: pending.requestId,
            sinceScore: pending.sinceScore,
            untilScore: pending.untilScore,
            excludeIds: Array.isArray(pending.excludeIds) ? pending.excludeIds : [],
            limit: pending.limit || REQUEST_LIMIT
          }
          record.lastPublishedAt = sentAt
          record.lastAskPublishedAt = sentAt
          record.notBeforeAt = Math.max(pending.nextRetryAt || 0, pending.onlineRetryAt || 0)
          record.nextCheckAt = Math.max(
            sentAt + EXCHANGE_CHECK_INTERVAL_MS,
            record.notBeforeAt
          )
          record.expiresAt = sentAt + SYNC_EVENT_EXPIRATION_MS + EXCHANGE_EXPIRY_GRACE_MS
          record.status = pending.waitingForResume ? 'paused' : 'awaiting-reply'
          changed = true
        }
      }
    }
    for (const [ownerPubkey, apps] of Object.entries(state.appBackfills || {})) {
      for (const app of Object.values(apps || {})) {
        for (const [peerPubkey, entry] of Object.entries(app?.peers || {})) {
          const pending = entry?.pending
          if (!pending?.requestId || exchangeRecord(state, ownerPubkey, peerPubkey, 'ask', pending.requestId)) continue
          const record = exchangeRecord(state, ownerPubkey, peerPubkey, 'ask', pending.requestId, true)
          const sentAt = pending.sentAt || _nowMs()
          record.code = NOSTRDB_SYNC_APP_ASK_CODE
          record.channelPubkey = ownerChannelPubkey(ownerPubkey, context)
          record.lane = 'app-backfill'
          record.appId = pending.appId
          record.requestPayload = {
            requestId: pending.requestId,
            appId: pending.appId,
            after: pending.after || '',
            batchSize: pending.batchSize || REQUEST_LIMIT
          }
          record.lastPublishedAt = sentAt
          record.lastAskPublishedAt = sentAt
          record.notBeforeAt = Math.max(pending.nextRetryAt || 0, pending.onlineRetryAt || 0)
          record.nextCheckAt = Math.max(
            sentAt + EXCHANGE_CHECK_INTERVAL_MS,
            record.notBeforeAt
          )
          record.expiresAt = sentAt + SYNC_EVENT_EXPIRATION_MS + EXCHANGE_EXPIRY_GRACE_MS
          record.status = pending.waitingForResume ? 'paused' : 'awaiting-reply'
          changed = true
        }
      }
    }
    if (changed) await setState(state)
    return changed
  }

  function scheduleExchangeMaintenance (context = runtime, { immediate = false } = {}) {
    context = backgroundContext(context)
    if (exchangeTimer) _clearTimeout?.(exchangeTimer)
    exchangeTimer = null
    const state = getState()
    if (!hasPendingExchangeWork(state)) return
    const next = immediate ? _nowMs() : exchangeDeadline(state)
    if (!Number.isFinite(next)) return
    const generation = exchangeGeneration
    exchangeTimer = _setTimeout(() => {
      exchangeTimer = null
      runExchangeMaintenance(context, generation).catch(report)
    }, Math.max(0, next - _nowMs()))
    exchangeTimer?.unref?.()
  }

  function stopExchangeMaintenance () {
    exchangeGeneration += 1
    if (exchangeTimer) _clearTimeout?.(exchangeTimer)
    exchangeTimer = null
    exchangeChecking = false
    exchangeAgain = false
  }

  function wireStatus (record, kind, presence) {
    const events = record.events?.[kind] || []
    if (!events.length) return { allPresent: false, anyPresent: false, allAbsent: true, unknown: false }
    let allPresent = true
    let anyPresent = false
    let allAbsent = true
    let unknown = false
    for (const event of events) {
      const status = presence.get(event.id)
      if (!status || status.unknown) unknown = true
      if (status?.present) {
        anyPresent = true
        allAbsent = false
      } else {
        allPresent = false
      }
      if (!status?.absent) allAbsent = false
    }
    return { allPresent, anyPresent, allAbsent, unknown }
  }

  async function pruneExchangeRecord (ownerPubkey, peerPubkey, key) {
    const state = getState()
    const entries = state.exchanges?.[ownerPubkey]?.[peerPubkey]
    if (!isPlainObject(entries) || !Object.hasOwn(entries, key)) return false
    const record = entries[key]
    if (record.direction === 'ask') {
      const peer = state.owners?.[ownerPubkey]?.[peerPubkey]
      if (isPlainObject(peer)) {
        if (peer.pending?.requestId === record.requestId) peer.pending = null
        if (peer.recent?.pending?.requestId === record.requestId) peer.recent.pending = null
        peer.updatedAt = _nowMs()
      }
      const appId = normalizeAppId(
        record.appId ||
        record.requestPayload?.appId ||
        record.range?.appId
      )
      const appPeer = state.appBackfills?.[ownerPubkey]?.[appStateKey(appId)]?.peers?.[peerPubkey]
      if (appPeer?.pending?.requestId === record.requestId) appPeer.pending = null
    }
    delete entries[key]
    if (!Object.keys(entries).length) delete state.exchanges[ownerPubkey][peerPubkey]
    if (isPlainObject(state.exchanges?.[ownerPubkey]) && !Object.keys(state.exchanges[ownerPubkey]).length) {
      delete state.exchanges[ownerPubkey]
    }
    if (isPlainObject(state.exchanges) && !Object.keys(state.exchanges).length) delete state.exchanges
    await setState(state, { replaceKeys: ['exchanges'] })
    exchangeStats.pruned++
    return true
  }

  async function deleteWireEvents (entry, kind, context, presence) {
    const events = (entry.record.events?.[kind] || []).filter(event => normalizePubkey(event.id))
    if (!events.length) return
    const groups = new Map()
    for (const event of events) {
      const presentRelays = presence.get(event.id)?.relays || []
      const relays = normalizeRelayList(event.relays.filter(relay => presentRelays.includes(normalizeRelayUrl(relay))))
      const secret = normalizeSecret(event.deletionSeckey)
      if (!relays.length) continue
      const key = `${secret}\n${relays.slice().sort().join('\n')}`
      const group = groups.get(key) || { secret, relays, ids: [] }
      group.ids.push(event.id)
      groups.set(key, group)
    }
    const channelSigner = context.channelSignerFor?.(entry.record.channelPubkey)
    for (const group of groups.values()) {
      for (let offset = 0; offset < group.ids.length; offset += EXCHANGE_DELETE_BATCH_SIZE) {
        const ids = [...new Set(group.ids.slice(offset, offset + EXCHANGE_DELETE_BATCH_SIZE))]
        if (!ids.length) continue
        const tags = [['k', String(PRIVATE_BROADCAST_KIND)], ...ids.map(id => ['e', id])]
        if (group.secret) {
          const keypair = keypairFromSeckey(group.secret)
          const deletion = finalizeEvent({
            kind: 5,
            created_at: Math.floor(_nowMs() / 1000),
            tags,
            content: ''
          }, keypair.secretKey)
          const result = await _relayPool.sendEvent(deletion, group.relays, {
            rateLimitRetries: 0
          })
          await result.promise?.catch?.(() => {})
          exchangeStats.deletionAttempts++
        }
        if (channelSigner) {
          const deletion = await channelSigner.signEvent({
            kind: 5,
            created_at: Math.floor(_nowMs() / 1000),
            tags,
            content: ''
          })
          const result = await _relayPool.sendEvent(deletion, group.relays, {
            rateLimitRetries: 0
          })
          await result.promise?.catch?.(() => {})
          exchangeStats.deletionAttempts++
        }
      }
    }
    const state = getState()
    const current = exchangeRecord(
      state,
      entry.ownerPubkey,
      entry.peerPubkey,
      entry.record.direction,
      entry.record.requestId
    )
    if (current) {
      current.lastDeleteAt = _nowMs()
      current.updatedAt = _nowMs()
      await setState(state)
    }
  }

  async function republishTrackedAsk (entry, context) {
    const record = entry.record
    if ((record.notBeforeAt || 0) > _nowMs()) return false
    if (!record.requestPayload || !record.channelPubkey || !record.peerPubkey) return false
    const state = getState()
    const peer = peerState(state, entry.ownerPubkey, entry.peerPubkey)
    const lane = peer.pending?.requestId === record.requestId
      ? 'history'
      : peer.recent?.pending?.requestId === record.requestId
        ? 'recent'
        : ''
    if (lane && !laneEnabled(laneModeFor(entry.ownerPubkey, entry.peerPubkey, context), lane)) {
      return false
    }
    const result = await context.messenger.ask({
      channelPubkey: record.channelPubkey,
      receiverPubkey: record.peerPubkey,
      code: record.code,
      payload: record.requestPayload,
      idempotencyKey: coalescingDigest(['nostrdb-ask', record.code, record.requestId]),
      useBulkPacing: true
    })
    if (!publicationSucceeded(result)) throw new Error('SYNC_PUBLICATION_FAILED')
    await trackPublication({
      ownerPubkey: entry.ownerPubkey,
      peerPubkey: entry.peerPubkey,
      direction: 'ask',
      requestId: record.requestId,
      code: record.code,
      channelPubkey: record.channelPubkey,
      result,
      range: record.requestPayload,
      context
    })
    const updatedState = getState()
    const updatedPeer = peerState(updatedState, entry.ownerPubkey, entry.peerPubkey)
    for (const pending of [updatedPeer.pending, updatedPeer.recent?.pending]) {
      if (pending?.requestId !== record.requestId) continue
      delete pending.waitingForResume
      pending.attempt = (pending.attempt || 0) + 1
      pending.sentAt = _nowMs()
      pending.nextRetryAt = _nowMs() + EXCHANGE_CHECK_INTERVAL_MS
      pending.onlineRetryAt = pending.nextRetryAt
    }
    const appPeer = updatedState.appBackfills?.[entry.ownerPubkey]?.[appStateKey(record.appId)]?.peers?.[entry.peerPubkey]
    if (appPeer?.pending?.requestId === record.requestId) {
      delete appPeer.pending.waitingForResume
      appPeer.pending.attempt = (appPeer.pending.attempt || 0) + 1
      appPeer.pending.sentAt = _nowMs()
      appPeer.pending.nextRetryAt = _nowMs() + EXCHANGE_CHECK_INTERVAL_MS
      appPeer.pending.onlineRetryAt = appPeer.pending.nextRetryAt
    }
    updatedPeer.updatedAt = _nowMs()
    await setState(updatedState)
    exchangeStats.asksRepublished++
    emitDebug(context.debug, 'ask-republished', {
      code: record.code,
      ownerPubkey: entry.ownerPubkey,
      receiverPubkey: entry.peerPubkey,
      requestId: record.requestId
    })
    return true
  }

  async function republishTrackedAdvert (entry, context) {
    const record = entry.record
    if (!record.requestPayload || !record.channelPubkey || !record.peerPubkey) return false
    const result = await context.messenger.yell({
      channelPubkey: record.channelPubkey,
      receiverPubkeys: [record.peerPubkey],
      code: NOSTRDB_SYNC_ADVERTISE_CODE,
      payload: record.requestPayload,
      idempotencyKey: coalescingDigest(['nostrdb-advertise', record.requestId]),
      useBulkPacing: true
    })
    if (!publicationSucceeded(result)) throw new Error('SYNC_PUBLICATION_FAILED')
    await trackPublication({
      ownerPubkey: entry.ownerPubkey,
      peerPubkey: entry.peerPubkey,
      direction: 'advert',
      requestId: record.requestId,
      code: NOSTRDB_SYNC_ADVERTISE_CODE,
      channelPubkey: record.channelPubkey,
      result,
      range: record.requestPayload,
      context
    })
    exchangeStats.advertsRepublished++
    emitDebug(context.debug, 'advert-republished', {
      ownerPubkey: entry.ownerPubkey,
      receiverPubkey: entry.peerPubkey,
      requestId: record.requestId
    })
    return true
  }

  async function regenerateTrackedReply (entry, context) {
    const record = entry.record
    if (!record.question || !record.inboundPayload) return false
    const message = {
      channelPubkey: record.channelPubkey,
      event: record.question,
      payload: record.inboundPayload
    }
    if (record.code === NOSTRDB_SYNC_APP_REPLY_CODE) {
      await handleAppAsk(entry.ownerPubkey, message, context, { tracking: false })
    } else {
      await handleAsk(entry.ownerPubkey, message, context, { tracking: false })
    }
    exchangeStats.repliesRegenerated++
    emitDebug(context.debug, 'reply-regenerated', {
      code: record.code,
      ownerPubkey: entry.ownerPubkey,
      receiverPubkey: entry.peerPubkey,
      requestId: record.requestId
    })
    return true
  }

  async function queryExchangePresence (state) {
    const groups = new Map()
    for (const entry of allExchangeRecords(state)) {
      for (const kind of ['ask', 'reply', 'advert']) {
        for (const event of entry.record.events[kind] || []) {
          const id = normalizePubkey(event.id)
          const relays = normalizeRelayList(event.relays)
          if (!id || !relays.length) continue
          const key = relays.slice().sort().join('\n')
          const group = groups.get(key) || { relays, ids: new Set() }
          group.ids.add(id)
          groups.set(key, group)
        }
      }
    }
    const presence = new Map()
    for (const group of groups.values()) {
      const ids = [...group.ids]
      for (let offset = 0; offset < ids.length; offset += EXCHANGE_PRESENCE_BATCH_SIZE) {
        const batch = ids.slice(offset, offset + EXCHANGE_PRESENCE_BATCH_SIZE)
        let response
        try {
          response = await _relayPool.getEvents({ kinds: [PRIVATE_BROADCAST_KIND], ids: batch }, group.relays, {
            deduplicateAcrossRelays: false,
            rateLimitRetries: 0,
            timeout: EXCHANGE_PRESENCE_TIMEOUT_MS,
            timeoutAfterFirstEose: null
          })
        } catch {
          response = { result: [], relays: group.relays.map(relay => ({ relay, status: 'error' })) }
        }
        const presentRelays = new Map()
        for (const item of response?.result || []) {
          const id = normalizePubkey(item?.event?.id)
          if (!id) continue
          const set = presentRelays.get(id) || new Set()
          if (item.relay) set.add(normalizeRelayUrl(item.relay))
          presentRelays.set(id, set)
        }
        const complete = (response?.relays || []).length === group.relays.length &&
          response.relays.every(relay => ['eose', 'satisfied'].includes(relay.status))
        for (const id of batch) {
          const current = presence.get(id) || { present: false, absent: false, unknown: false, relays: [] }
          const relays = presentRelays.get(id)
          if (relays?.size) {
            current.present = true
            current.absent = false
            current.relays = [...new Set([...current.relays, ...relays])]
          } else if (complete && !current.present && !current.unknown) {
            current.absent = true
          } else if (!complete && !current.present) {
            current.unknown = true
            current.absent = false
          }
          presence.set(id, current)
        }
      }
    }
    return presence
  }

  async function deferExchangeChecks () {
    const state = getState()
    const nextCheckAt = _nowMs() + EXCHANGE_CHECK_INTERVAL_MS
    for (const entry of allExchangeRecords(state)) {
      entry.record.nextCheckAt = Math.max(nextCheckAt, entry.record.notBeforeAt || 0)
      entry.record.updatedAt = _nowMs()
      syncPendingCheckDeadline(state, entry.record, entry.record.nextCheckAt)
    }
    await setState(state)
  }

  async function runExchangeMaintenance (context = runtime, generation = exchangeGeneration) {
    if (generation !== exchangeGeneration) return null
    if (exchangeChecking) {
      exchangeAgain = true
      return null
    }
    exchangeChecking = true
    const actions = []
    try {
      await migratePendingExchanges(context)
      let state = getState()
      const now = _nowMs()
      for (const entry of allExchangeRecords(state)) {
        if (entry.record.expiresAt && entry.record.expiresAt <= now) {
          await pruneExchangeRecord(entry.ownerPubkey, entry.peerPubkey, entry.key)
        }
      }
      state = getState()
      let online = false
      try {
        online = await _isOnline()
      } catch {
        online = false
      }
      if (runtime.messenger?.readStatus?.().paused === true || !online) {
        await deferExchangeChecks()
        return null
      }
      const exchanges = allExchangeRecords(state)
      const presence = await queryExchangePresence(state)
      if (generation !== exchangeGeneration) return null
      for (const entry of exchanges) {
        const record = entry.record
        const asks = wireStatus(record, 'ask', presence)
        const replies = wireStatus(record, 'reply', presence)
        const adverts = wireStatus(record, 'advert', presence)
        const askLastSent = record.lastAskPublishedAt || record.lastPublishedAt || 0
        const replyLastSent = record.lastReplyPublishedAt || record.lastPublishedAt || 0
        const advertLastSent = record.lastAdvertPublishedAt || record.lastPublishedAt || 0
        const primaryStatus = record.direction === 'advert' ? adverts : asks
        exchangeStats.checked++
        if (primaryStatus.anyPresent) exchangeStats.present++
        else if (primaryStatus.allAbsent) exchangeStats.absent++
        else exchangeStats.unknown++

        if (record.direction === 'advert') {
          if (record.status === 'deleting-advert') {
            if (adverts.allAbsent) {
              exchangeStats.deletionConfirmed++
              actions.push({ type: 'prune', entry })
            } else {
              actions.push({ type: 'delete', entry, kind: 'advert', context, presence })
            }
          } else if ((adverts.allAbsent || !record.events.advert.length) &&
              now - advertLastSent >= EXCHANGE_MIN_RESEND_MS) {
            actions.push({ type: 'advert', entry, context })
          }
          continue
        }

        if (record.direction === 'ask') {
          if (record.status === 'deleting-ask') {
            if (asks.allAbsent) {
              exchangeStats.deletionConfirmed++
              actions.push({ type: 'prune', entry })
            } else {
              actions.push({ type: 'delete', entry, kind: 'ask', context, presence })
            }
          } else if (record.status === 'paused' ||
              ((asks.allAbsent || !record.events.ask.length) && now - askLastSent >= EXCHANGE_MIN_RESEND_MS)) {
            actions.push({ type: 'ask', entry, context })
          }
          continue
        }

        if (record.status === 'deleting-reply') {
          if (asks.allAbsent && replies.allAbsent) {
            exchangeStats.deletionConfirmed++
            actions.push({ type: 'prune', entry })
          } else {
            actions.push({ type: 'delete', entry, kind: 'reply', context, presence })
          }
          continue
        }
        if (asks.allAbsent) {
          record.status = 'deleting-reply'
          actions.push({ type: 'delete', entry, kind: 'reply', context, presence })
          continue
        }
        if (!asks.unknown && (asks.anyPresent || asks.allPresent) &&
            !replies.unknown && !replies.allPresent && now - replyLastSent >= EXCHANGE_MIN_RESEND_MS) {
          actions.push({ type: 'reply', entry, context })
        }
      }
      for (const entry of exchanges) {
        entry.record.nextCheckAt = Math.max(
          now + EXCHANGE_CHECK_INTERVAL_MS,
          entry.record.notBeforeAt || 0
        )
        entry.record.updatedAt = now
        syncPendingCheckDeadline(state, entry.record, entry.record.nextCheckAt)
      }
      await setState(state)
      for (const action of actions) {
        if (generation !== exchangeGeneration) return null
        try {
          if (action.type === 'prune') {
            await pruneExchangeRecord(action.entry.ownerPubkey, action.entry.peerPubkey, action.entry.key)
          } else if (action.type === 'delete') {
            await deleteWireEvents(action.entry, action.kind, action.context, action.presence)
          } else if (action.type === 'ask') {
            await republishTrackedAsk(action.entry, action.context)
          } else if (action.type === 'advert') {
            await republishTrackedAdvert(action.entry, action.context)
          } else if (action.type === 'reply') {
            await regenerateTrackedReply(action.entry, action.context)
          }
        } catch (error) {
          report(error)
        }
      }
      return { actions: actions.length, checked: exchangeStats.checked }
    } catch (error) {
      report(error)
      return null
    } finally {
      exchangeChecking = false
      if (generation === exchangeGeneration) {
        scheduleExchangeMaintenance(context, { immediate: exchangeAgain })
        exchangeAgain = false
      }
    }
  }

  function pushCursorForOwner (ownerPubkey) {
    const value = getState().pushCursors?.[ownerPubkey]
    return isSafeScore(value) ? value : null
  }

  function updatePushCursor (ownerPubkey, score) {
    if (!normalizePubkey(ownerPubkey) || !isSafeScore(score)) return Promise.resolve()
    if (storage) {
      const state = getState()
      const current = isSafeScore(state.pushCursors?.[ownerPubkey])
        ? state.pushCursors[ownerPubkey]
        : null
      if (current != null && current >= score) return Promise.resolve()
      state.pushCursors = isPlainObject(state.pushCursors) ? state.pushCursors : {}
      state.pushCursors[ownerPubkey] = score
      writeState(storage, state)
      return Promise.resolve()
    }
    const state = getState()
    const current = isSafeScore(state.pushCursors?.[ownerPubkey])
      ? state.pushCursors[ownerPubkey]
      : null
    if (current != null && current >= score) return Promise.resolve()
    state.pushCursors = isPlainObject(state.pushCursors) ? state.pushCursors : {}
    state.pushCursors[ownerPubkey] = score
    durableState = structuredClone(state)
    return queueStateWrite(state)
  }

  function clearPushCursor (ownerPubkey) {
    if (storage) {
      const state = getState()
      if (!isPlainObject(state.pushCursors) ||
          !Object.hasOwn(state.pushCursors, ownerPubkey)) return Promise.resolve()
      delete state.pushCursors[ownerPubkey]
      if (!Object.keys(state.pushCursors).length) delete state.pushCursors
      writeState(storage, state)
      return Promise.resolve()
    }
    const state = getState()
    if (!isPlainObject(state.pushCursors) ||
        !Object.hasOwn(state.pushCursors, ownerPubkey)) return Promise.resolve()
    delete state.pushCursors[ownerPubkey]
    if (!Object.keys(state.pushCursors).length) delete state.pushCursors
    durableState = structuredClone(state)
    return queueStateWrite(state)
  }

  function recordAskStat (kind, code, reason) {
    const key = `${code}:${reason}`
    askStats[kind][key] = (askStats[kind][key] || 0) + 1
  }

  function askStatsSnapshot () {
    return {
      emitted: { ...askStats.emitted },
      suppressed: { ...askStats.suppressed }
    }
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

  async function announceRange ({ messenger, ownerPubkey, channelPubkey = '', receiverPubkeys, debug = runtime.debug } = {}) {
    const receivers = [...new Set((receiverPubkeys || []).filter(Boolean))]
    if (!messenger?.yell || !ownerPubkey || !channelPubkey || !receivers.length) return null
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
    const advertRequestId = nextRequestId()
    const result = await messenger.yell({
      channelPubkey,
      receiverPubkeys: receivers,
      code: NOSTRDB_SYNC_ADVERTISE_CODE,
      payload,
      useBulkPacing: true
    })
    const reports = Array.isArray(result?.delivery?.reports) ? result.delivery.reports : []
    if (reports.length) {
      for (const receiverPubkey of receivers) {
        const peerPubkey = normalizePubkey(receiverPubkey)
        if (!peerPubkey) continue
        const peerReports = reports.filter(report =>
          !Array.isArray(report.receiverPubkeys) || report.receiverPubkeys.includes(peerPubkey)
        )
        if (!peerReports.length) continue
        try {
          await trackPublication({
            ownerPubkey,
            peerPubkey,
            direction: 'advert',
            requestId: advertRequestId,
            code: NOSTRDB_SYNC_ADVERTISE_CODE,
            channelPubkey,
            result: {
              ...result,
              delivery: {
                ...result.delivery,
                reports: peerReports
              }
            },
            range: payload,
            context: runtime
          })
        } catch (error) {
          report(error)
        }
      }
    }
    return result
  }

  async function localInventoryIds (db, sinceScore, untilScore, limit = INVENTORY_LIMIT) {
    const { results } = await db.query(syncQuery(sinceScore, untilScore, {
      ids_only: true,
      limit
    }))
    return normalizeIdList(results, limit)
  }

  async function buildAskWindow (db, sinceScore, targetScore, windowMs, {
    allowExpanded = false,
    additionalExcludeIds = []
  } = {}) {
    // Windows are over NostrDB sync-anchor scores (`sa`, milliseconds), not
    // Nostr event created_at seconds.
    let size = clampWindow(windowMs)
    while (true) {
      const untilScore = Math.min(targetScore, sinceScore + size - 1)
      const excludeIds = await localInventoryIds(db, sinceScore, untilScore)
      const mergedIds = mergeIdLists(
        DENSE_INVENTORY_QUERY_LIMIT,
        excludeIds,
        additionalExcludeIds
      )
      if (excludeIds.length < INVENTORY_LIMIT && mergedIds.length <= MAX_DENSE_INVENTORY_IDS) {
        return { sinceScore, untilScore, excludeIds: mergedIds, windowMs: size, saturated: false }
      }
      const expand = allowExpanded || size <= MIN_WINDOW_MS
      if (expand) {
        const expandedIds = await localInventoryIds(
          db,
          sinceScore,
          untilScore,
          DENSE_INVENTORY_QUERY_LIMIT
        )
        const denseIds = mergeIdLists(
          DENSE_INVENTORY_QUERY_LIMIT,
          expandedIds,
          additionalExcludeIds
        )
        if (denseIds.length <= MAX_DENSE_INVENTORY_IDS) {
          return { sinceScore, untilScore, excludeIds: denseIds, windowMs: size, saturated: false }
        }
      }
      if (size <= MIN_WINDOW_MS) {
        return {
          sinceScore,
          untilScore,
          excludeIds: [],
          inventoryCount: mergedIds.length,
          windowMs: size,
          saturated: true
        }
      }
      size = Math.max(MIN_WINDOW_MS, Math.floor(size / 2))
    }
  }

  function newDenseRangeBatch (lane) {
    return {
      lane,
      startScore: null,
      endScore: null,
      count: 0
    }
  }

  function addDenseRange (batch, sinceScore, untilScore) {
    batch.startScore = batch.startScore == null
      ? sinceScore
      : Math.min(batch.startScore, sinceScore)
    batch.endScore = batch.endScore == null
      ? untilScore
      : Math.max(batch.endScore, untilScore)
    batch.count++
  }

  function flushDenseRangeDebug (context, batch) {
    if (!batch?.count) return
    emitDebug(context.debug, 'dense-range', {
      lane: batch.lane,
      rangeStart: batch.startScore,
      rangeEnd: batch.endScore,
      rangeCount: batch.count,
      inventoryLimit: MAX_DENSE_INVENTORY_IDS
    })
    batch.startScore = null
    batch.endScore = null
    batch.count = 0
  }

  function scheduleDenseContinuation (ownerPubkey, peerPubkey, lane, context) {
    context = backgroundContext(context)
    const run = () => {
      if (lane === 'history') {
        return maybeAsk(ownerPubkey, peerPubkey, context, {
          reason: 'dense-next',
          denseBatch: newDenseRangeBatch('history')
        })
      }
      return maybeAskRecent(ownerPubkey, peerPubkey, context, {
        reason: 'dense-next',
        denseBatch: newDenseRangeBatch('recent')
      })
    }
    _setTimeout(() => {
      if (runtime.messenger?.readStatus?.().paused === true) return
      Promise.resolve().then(run).catch(report)
    }, 0)?.unref?.()
  }

  async function maybeAsk (ownerPubkey, peerPubkey, context = runtime, {
    onlineHint = false,
    force = false,
    resume = false,
    reason = onlineHint ? 'advertise' : 'initial',
    denseBatch = null
  } = {}) {
    throwIfHandlerAborted(context)
    if (!context.messenger?.ask) return null
    const channelPubkey = ownerChannelPubkey(ownerPubkey, context)
    if (!isOwnerReady(ownerPubkey, context) || !channelPubkey) return null
    const mode = laneModeFor(ownerPubkey, peerPubkey, context)
    const state = getState()
    const entry = peerState(state, ownerPubkey, peerPubkey)
    if (!laneEnabled(mode, 'history')) {
      if (removeLanePending(state, ownerPubkey, peerPubkey, entry, 'history', _nowMs())) {
        entry.updatedAt = _nowMs()
        throwIfHandlerAborted(context)
        await setState(state)
        scheduleExchangeMaintenance(context, { immediate: true })
      }
      return null
    }
    const advert = entry.advert
    if (!advert || advert.maxScore == null || advert.minScore == null) return null

    const now = _nowMs()
    const storedCompleted = Number.isSafeInteger(entry.completedScore)
      ? entry.completedScore
      : advert.minScore - 1
    const completedValue = storedCompleted > advert.maxScore
      ? advert.minScore - 1
      : storedCompleted
    if (completedValue !== storedCompleted) {
      entry.completedScore = completedValue
      setLaneCycleReplyIds(entry, 'history', [])
    }
    const advertisedTarget = Math.max(advert.maxScore, now + SYNC_ANCHOR_MAX_FUTURE_SKEW_MS)
    const targetScore = historyTargetScore(entry, advertisedTarget, mode)
    if (entry.pending && entry.pending.untilScore > targetScore) {
      removeLanePending(state, ownerPubkey, peerPubkey, entry, 'history', now)
      entry.updatedAt = now
      throwIfHandlerAborted(context)
      await setState(state)
      scheduleExchangeMaintenance(context, { immediate: true })
    }
    if (entry.pending?.waitingForResume && !resume) return null
    if (entry.pending && resume && !entry.pending.waitingForResume) return null
    if (entry.pending && !force && !resume) {
      if (onlineHint) {
        recordAskStat('suppressed', NOSTRDB_SYNC_ASK_CODE, reason)
        emitDebug(context.debug, 'ask-suppressed', {
          code: NOSTRDB_SYNC_ASK_CODE,
          ownerPubkey,
          receiverPubkey: peerPubkey,
          requestId: entry.pending.requestId,
          reason,
          attempt: entry.pending.attempt || 0,
          retryAt: now + EXCHANGE_CHECK_INTERVAL_MS,
          waitMs: EXCHANGE_CHECK_INTERVAL_MS
        })
      }
      scheduleExchangeMaintenance(context)
      return null
    }
    const completed = completedValue
    const sinceScore = Math.max(advert.minScore, completed + 1)
    if (sinceScore > targetScore) {
      flushDenseRangeDebug(context, denseBatch)
      entry.pending = null
      setLaneCycleReplyIds(entry, 'history', [])
      entry.updatedAt = now
      setState(state)
      return null
    }

    let askWindow
    try {
      askWindow = await buildAskWindow(getDb(ownerPubkey), sinceScore, targetScore, entry.windowMs, {
        allowExpanded: reason === 'has-more',
        additionalExcludeIds: laneCycleReplyIds(entry, 'history')
      })
      throwIfHandlerAborted(context)
    } catch (err) {
      if (context.signal?.aborted) throw err
      report(err)
      return null
    }
    if (askWindow.saturated) {
      entry.completedScore = Math.max(completedValue, askWindow.untilScore)
      entry.windowMs = askWindow.windowMs
      entry.pending = null
      setLaneCycleReplyIds(entry, 'history', [])
      entry.updatedAt = now
      throwIfHandlerAborted(context)
      await setState(state)
      const batch = denseBatch || newDenseRangeBatch('history')
      addDenseRange(batch, askWindow.sinceScore, askWindow.untilScore)
      if (batch.count >= DENSE_RANGE_BATCH_SIZE) {
        flushDenseRangeDebug(context, batch)
        scheduleDenseContinuation(ownerPubkey, peerPubkey, 'history', context)
        return null
      }
      return maybeAsk(ownerPubkey, peerPubkey, context, {
        reason: 'dense-next',
        denseBatch: batch
      })
    }

    const id = entry.pending?.requestId || nextRequestId()
    const previousAttempt = entry.pending?.attempt || 0
    const attempt = entry.pending ? previousAttempt + 1 : 0
    const onlineDelay = Math.min(ONLINE_RETRY_MAX_MS, ONLINE_RETRY_MIN_MS * (2 ** attempt))
    const payload = {
      requestId: id,
      sinceScore: askWindow.sinceScore,
      untilScore: askWindow.untilScore,
      excludeIds: askWindow.excludeIds,
      limit: REQUEST_LIMIT,
      priority: 'lower'
    }

    entry.windowMs = askWindow.windowMs
    entry.pending = {
      requestId: id,
      sinceScore: askWindow.sinceScore,
      untilScore: askWindow.untilScore,
      excludeIds: [...askWindow.excludeIds],
      limit: REQUEST_LIMIT,
      replyCount: 0,
      replyIndexes: [],
      replyIds: [],
      attempt,
      sentAt: now,
      nextRetryAt: now + EXCHANGE_CHECK_INTERVAL_MS,
      onlineRetryAt: now + onlineDelay
    }
    entry.updatedAt = now
    throwIfHandlerAborted(context)
    setState(state)

    try {
      throwIfHandlerAborted(context)
      const result = await context.messenger.ask({
        channelPubkey,
        receiverPubkey: peerPubkey,
        code: NOSTRDB_SYNC_ASK_CODE,
        payload,
        idempotencyKey: coalescingDigest(['nostrdb-ask', NOSTRDB_SYNC_ASK_CODE, id]),
        useBulkPacing: true
      })
      throwIfHandlerAborted(context)
      if (!publicationSucceeded(result)) throw new Error('SYNC_PUBLICATION_FAILED')
      if (resume) delete entry.pending?.waitingForResume
      await trackPublication({
        ownerPubkey,
        peerPubkey,
        direction: 'ask',
        requestId: id,
        code: NOSTRDB_SYNC_ASK_CODE,
        channelPubkey,
        result,
        range: payload,
        lane: 'history',
        context
      })
    } catch (err) {
      if (context.signal?.aborted) throw err
      const now = _nowMs()
      if (messengerPausedError(err)) {
        markPendingForResume(entry, err, now)
        entry.pending.attempt = previousAttempt
      } else {
        const retryAt = publicationRetryAt(err, now) || now + 1
        entry.pending.nextRetryAt = retryAt
        entry.pending.onlineRetryAt = retryAt
        entry.updatedAt = now
      }
      setState(state)
      scheduleRetrySweep(context)
      report(err)
      return null
    }

    scheduleRetrySweep(context)
    scheduleExchangeMaintenance(context)
    recordAskStat('emitted', NOSTRDB_SYNC_ASK_CODE, reason)
    emitDebug(context.debug, 'ask', {
      channelPubkey,
      ownerPubkey,
      receiverPubkey: peerPubkey,
      requestId: id,
      sinceScore: payload.sinceScore,
      untilScore: payload.untilScore,
      excludeCount: payload.excludeIds.length,
      reason,
      attempt,
      onlineDelay,
      retryAt: entry.pending.onlineRetryAt
    })
    flushDenseRangeDebug(context, denseBatch)
    return payload
  }

  async function buildRecentAskWindow (db, minScore, targetScore, windowMs, {
    allowExpanded = false,
    additionalExcludeIds = [],
    minSince = minScore
  } = {}) {
    let size = clampWindow(windowMs)
    while (true) {
      const sinceScore = Math.max(minScore, minSince, targetScore - size + 1)
      const excludeIds = await localInventoryIds(db, sinceScore, targetScore)
      const mergedIds = mergeIdLists(
        DENSE_INVENTORY_QUERY_LIMIT,
        excludeIds,
        additionalExcludeIds
      )
      if (excludeIds.length < INVENTORY_LIMIT && mergedIds.length <= MAX_DENSE_INVENTORY_IDS) {
        return {
          sinceScore,
          untilScore: targetScore,
          excludeIds: mergedIds,
          windowMs: size,
          saturated: false
        }
      }
      const expand = allowExpanded || size <= MIN_WINDOW_MS
      if (expand) {
        const expandedIds = await localInventoryIds(
          db,
          sinceScore,
          targetScore,
          DENSE_INVENTORY_QUERY_LIMIT
        )
        const denseIds = mergeIdLists(
          DENSE_INVENTORY_QUERY_LIMIT,
          expandedIds,
          additionalExcludeIds
        )
        if (denseIds.length <= MAX_DENSE_INVENTORY_IDS) {
          return {
            sinceScore,
            untilScore: targetScore,
            excludeIds: denseIds,
            windowMs: size,
            saturated: false
          }
        }
      }
      if (size <= MIN_WINDOW_MS) {
        return {
          sinceScore,
          untilScore: targetScore,
          excludeIds: [],
          inventoryCount: mergedIds.length,
          windowMs: size,
          saturated: true
        }
      }
      size = Math.max(MIN_WINDOW_MS, Math.floor(size / 2))
    }
  }

  async function maybeAskRecent (ownerPubkey, peerPubkey, context = runtime, {
    reason = 'recent',
    denseBatch = null
  } = {}) {
    throwIfHandlerAborted(context)
    if (!context.messenger?.ask) return null
    const channelPubkey = ownerChannelPubkey(ownerPubkey, context)
    if (!isOwnerReady(ownerPubkey, context) || !channelPubkey) return null
    const state = getState()
    const entry = peerState(state, ownerPubkey, peerPubkey)
    const mode = laneModeFor(ownerPubkey, peerPubkey, context)
    if (!laneEnabled(mode, 'recent')) {
      if (removeLanePending(state, ownerPubkey, peerPubkey, entry, 'recent', _nowMs())) {
        entry.updatedAt = _nowMs()
        throwIfHandlerAborted(context)
        await setState(state)
        scheduleExchangeMaintenance(context, { immediate: true })
      }
      return null
    }
    const advert = entry.advert
    if (!advert || advert.maxScore == null || advert.minScore == null) return null
    const now = _nowMs()
    const storedCompleted = Number.isSafeInteger(entry.completedScore)
      ? entry.completedScore
      : advert.minScore - 1
    const completedValue = storedCompleted > advert.maxScore
      ? advert.minScore - 1
      : storedCompleted
    if (completedValue !== storedCompleted) {
      entry.completedScore = completedValue
      setLaneCycleReplyIds(entry, 'recent', [])
    }
    const advertisedTarget = Math.max(advert.maxScore, now + SYNC_ANCHOR_MAX_FUTURE_SKEW_MS)
    const hadRecentState = isPlainObject(entry.recent)
    const recent = normalizeRecentState(entry, advertisedTarget, completedValue)
    entry.recent = recent
    const pending = recent.pending
    if (pending) {
      const coveredThrough = Math.max(
        recent.coveredCeiling,
        recent.gapCeiling || -1,
        recent.headCoverage?.ceiling ?? -1,
        pending.untilScore || -1
      )
      if (advertisedTarget > coveredThrough) {
        recent.gapCeiling = advertisedTarget
        entry.updatedAt = now
        throwIfHandlerAborted(context)
        await setState(state)
      }
      scheduleExchangeMaintenance(context)
      return null
    }
    if (reason === 'advertise' &&
        hadRecentState &&
        advertisedTarget > recent.coveredCeiling &&
        advertisedTarget > (recent.gapCeiling ?? -1)) {
      recent.gapCeiling = advertisedTarget
    }
    const minScore = Math.max(advert.minScore, completedValue + 1)
    if (recent.coveredCeiling < completedValue) recent.coveredCeiling = completedValue
    if (recent.descentScore < minScore - 1) recent.descentScore = minScore - 1
    reconcileRecentCoverage(recent)
    const phase = recentPhase(recent)
    let targetScore
    let askWindow
    if (phase === 'gap-fill') {
      const sinceScore = recent.coveredCeiling + 1
      targetScore = recent.headCoverage.floor - 1
      if (sinceScore > targetScore) {
        reconcileRecentCoverage(recent)
        entry.updatedAt = now
        setState(state)
        return maybeAskRecent(ownerPubkey, peerPubkey, context, {
          reason: 'gap-connected',
          denseBatch
        })
      }
      try {
        askWindow = await buildAskWindow(getDb(ownerPubkey), sinceScore, targetScore, recent.windowMs, {
          allowExpanded: reason === 'has-more',
          additionalExcludeIds: laneCycleReplyIds(entry, 'recent')
        })
        throwIfHandlerAborted(context)
      } catch (error) {
        if (context.signal?.aborted) throw error
        report(error)
        return null
      }
    } else {
      targetScore = phase === 'gap-head' ? recent.gapCeiling : recent.descentScore
      if (!isSafeScore(targetScore) || targetScore < minScore) {
        flushDenseRangeDebug(context, denseBatch)
        recent.descentScore = minScore - 1
        recent.pending = null
        entry.updatedAt = now
        setState(state)
        return null
      }
      let minSince = minScore
      if (phase === 'gap-head') {
        minSince = Math.max(
          minScore,
          recent.coveredCeiling + 1,
          recent.headCoverage ? recent.headCoverage.ceiling + 1 : recent.coveredCeiling + 1
        )
      }
      try {
        askWindow = await buildRecentAskWindow(
          getDb(ownerPubkey),
          minScore,
          targetScore,
          recent.windowMs,
          {
            allowExpanded: reason === 'has-more',
            additionalExcludeIds: laneCycleReplyIds(entry, 'recent'),
            minSince
          }
        )
        throwIfHandlerAborted(context)
      } catch (error) {
        if (context.signal?.aborted) throw error
        report(error)
        return null
      }
    }
    if (askWindow.saturated) {
      const coveredPending = {
        phase,
        sinceScore: askWindow.sinceScore,
        untilScore: askWindow.untilScore
      }
      advanceRecentCoverage(recent, coveredPending)
      recent.windowMs = askWindow.windowMs
      recent.pending = null
      setLaneCycleReplyIds(entry, 'recent', [])
      entry.updatedAt = now
      throwIfHandlerAborted(context)
      await setState(state)
      if (laneModeFor(ownerPubkey, peerPubkey, context) === 'both') {
        await maybeAsk(ownerPubkey, peerPubkey, context, { reason: 'recent-boundary' })
      }
      const batch = denseBatch || newDenseRangeBatch('recent')
      addDenseRange(batch, askWindow.sinceScore, askWindow.untilScore)
      if (batch.count >= DENSE_RANGE_BATCH_SIZE) {
        flushDenseRangeDebug(context, batch)
        scheduleDenseContinuation(ownerPubkey, peerPubkey, 'recent', context)
        return null
      }
      return maybeAskRecent(ownerPubkey, peerPubkey, context, {
        reason: 'dense-next',
        denseBatch: batch
      })
    }
    const id = nextRequestId()
    const attempt = 0
    const payload = {
      requestId: id,
      sinceScore: askWindow.sinceScore,
      untilScore: askWindow.untilScore,
      excludeIds: askWindow.excludeIds,
      limit: REQUEST_LIMIT
    }
    const cycleReplyIds = laneCycleReplyIds(entry, 'recent')
    entry.recent = {
      ...recent,
      windowMs: askWindow.windowMs,
      ...(cycleReplyIds.length ? { cycleReplyIds } : {}),
      pending: {
        phase,
        requestId: id,
        sinceScore: askWindow.sinceScore,
        untilScore: askWindow.untilScore,
        excludeIds: [...askWindow.excludeIds],
        limit: REQUEST_LIMIT,
        replyCount: 0,
        replyIndexes: [],
        replyIds: [],
        attempt,
        sentAt: now,
        nextRetryAt: now + EXCHANGE_CHECK_INTERVAL_MS,
        onlineRetryAt: now + ONLINE_RETRY_MIN_MS
      }
    }
    entry.updatedAt = now
    throwIfHandlerAborted(context)
    await setState(state)
    try {
      throwIfHandlerAborted(context)
      const result = await context.messenger.ask({
        channelPubkey,
        receiverPubkey: peerPubkey,
        code: NOSTRDB_SYNC_ASK_CODE,
        payload,
        idempotencyKey: coalescingDigest(['nostrdb-ask', NOSTRDB_SYNC_ASK_CODE, id]),
        useBulkPacing: true
      })
      throwIfHandlerAborted(context)
      if (!publicationSucceeded(result)) throw new Error('SYNC_PUBLICATION_FAILED')
      await trackPublication({
        ownerPubkey,
        peerPubkey,
        direction: 'ask',
        requestId: id,
        code: NOSTRDB_SYNC_ASK_CODE,
        channelPubkey,
        result,
        range: payload,
        lane: 'recent',
        context
      })
    } catch (error) {
      if (context.signal?.aborted) throw error
      const nextState = getState()
      const nextEntry = peerState(nextState, ownerPubkey, peerPubkey)
      if (nextEntry.recent?.pending?.requestId === id) {
        const failedAt = _nowMs()
        if (messengerPausedError(error)) {
          markPendingForResume(nextEntry, error, failedAt, 'recent')
        } else {
          const retryAt = publicationRetryAt(error, failedAt) || failedAt + 1
          nextEntry.recent.pending.nextRetryAt = retryAt
          nextEntry.recent.pending.onlineRetryAt = retryAt
          nextEntry.updatedAt = failedAt
        }
        await setState(nextState)
        scheduleRetrySweep(context)
      }
      report(error)
      return null
    }
    recordAskStat('emitted', NOSTRDB_SYNC_ASK_CODE, reason)
    emitDebug(context.debug, 'ask', {
      channelPubkey,
      ownerPubkey,
      receiverPubkey: peerPubkey,
      requestId: id,
      sinceScore: payload.sinceScore,
      untilScore: payload.untilScore,
      excludeCount: payload.excludeIds.length,
      reason,
      lane: 'recent',
      recentPhase: phase,
      attempt
    })
    flushDenseRangeDebug(context, denseBatch)
    return payload
  }

  async function maybeAskAppBackfill (ownerPubkey, appId, peerPubkey, context = runtime, {
    onlineHint = false,
    resume = false,
    reason = onlineHint ? 'online-hint' : resume ? 'resume' : 'initial'
  } = {}) {
    throwIfHandlerAborted(context)
    if (!context.messenger?.ask) return null
    const channelPubkey = ownerChannelPubkey(ownerPubkey, context)
    if (!isOwnerReady(ownerPubkey, context) || !channelPubkey) return null
    if (!normalizeAppId(appId) || !normalizePubkey(peerPubkey)) return null
    if (context.ownerPubkeys instanceof Set && !context.ownerPubkeys.has(ownerPubkey)) return null
    if (!context.trustedByPubkey?.has?.(peerPubkey)) return null

    const state = getState()
    const appKey = appStateKey(appId)
    const existingApp = state.appBackfills?.[ownerPubkey]?.[appKey]
    if (!isPlainObject(existingApp?.peers) || !Object.hasOwn(existingApp.peers, peerPubkey)) return null
    const app = appBackfillState(state, ownerPubkey, appId)
    const entry = appBackfillPeerState(state, ownerPubkey, appId, peerPubkey)
    if (entry.completed) return null

    const now = _nowMs()
    if (entry.pending?.waitingForResume && !resume) return null
    if (entry.pending && resume && !entry.pending.waitingForResume) return null
    if (entry.pending && !resume) {
      if (onlineHint) {
        recordAskStat('suppressed', NOSTRDB_SYNC_APP_ASK_CODE, reason)
        emitDebug(context.debug, 'app-ask-suppressed', {
          code: NOSTRDB_SYNC_APP_ASK_CODE,
          ownerPubkey,
          appId,
          receiverPubkey: peerPubkey,
          requestId: entry.pending.requestId,
          reason,
          attempt: entry.pending.attempt || 0,
          retryAt: now + EXCHANGE_CHECK_INTERVAL_MS,
          waitMs: EXCHANGE_CHECK_INTERVAL_MS
        })
      }
      scheduleExchangeMaintenance(context)
      return null
    }

    const id = entry.pending?.requestId || nextRequestId()
    const previousAttempt = entry.pending?.attempt || 0
    const attempt = entry.pending ? previousAttempt + 1 : 0
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
      replyIndexes: [],
      attempt,
      sentAt: now,
      nextRetryAt: now + EXCHANGE_CHECK_INTERVAL_MS,
      onlineRetryAt: now + onlineDelay
    }
    entry.updatedAt = now
    app.updatedAt = now
    throwIfHandlerAborted(context)
    setState(state)

    try {
      throwIfHandlerAborted(context)
      const result = await context.messenger.ask({
        channelPubkey,
        receiverPubkey: peerPubkey,
        code: NOSTRDB_SYNC_APP_ASK_CODE,
        payload,
        idempotencyKey: coalescingDigest(['nostrdb-app-ask', NOSTRDB_SYNC_APP_ASK_CODE, id]),
        useBulkPacing: true
      })
      throwIfHandlerAborted(context)
      if (!publicationSucceeded(result)) throw new Error('SYNC_PUBLICATION_FAILED')
      if (resume) delete entry.pending?.waitingForResume
      await trackPublication({
        ownerPubkey,
        peerPubkey,
        direction: 'ask',
        requestId: id,
        code: NOSTRDB_SYNC_APP_ASK_CODE,
        channelPubkey,
        result,
        range: payload,
        lane: 'app-backfill',
        context
      })
    } catch (err) {
      if (context.signal?.aborted) throw err
      const nextState = getState()
      const { app: nextApp, entry: nextEntry } = existingAppBackfillPeerState(nextState, ownerPubkey, appId, peerPubkey)
      if (nextEntry?.pending?.requestId === id) {
        const now = _nowMs()
        if (messengerPausedError(err)) {
          markPendingForResume(nextEntry, err, now)
          nextEntry.pending.attempt = previousAttempt
        } else {
          const retryAt = publicationRetryAt(err, now) || now + 1
          nextEntry.pending.nextRetryAt = retryAt
          nextEntry.pending.onlineRetryAt = retryAt
          nextEntry.updatedAt = now
        }
        nextApp.updatedAt = nextEntry.updatedAt
        setState(nextState)
      }
      scheduleRetrySweep(context)
      report(err)
      return null
    }

    scheduleRetrySweep(context)
    scheduleExchangeMaintenance(context)
    recordAskStat('emitted', NOSTRDB_SYNC_APP_ASK_CODE, reason)
    emitDebug(context.debug, 'app-ask', {
      ownerPubkey,
      appId,
      receiverPubkey: peerPubkey,
      requestId: id,
      after: payload.after,
      reason,
      attempt,
      onlineDelay,
      retryAt: entry.pending.onlineRetryAt
    })
    return payload
  }

  async function processAppBackfillsNow (context = runtime, {
    ownerPubkey = '',
    peerPubkey = '',
    onlineHint = false,
    resume = false,
    reason = onlineHint ? 'online-hint' : resume ? 'resume' : 'initial'
  } = {}) {
    throwIfHandlerAborted(context)
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
          throwIfHandlerAborted(context)
          setState(state)
          changed = false
        }
        for (const peer of peers) {
          throwIfHandlerAborted(context)
          await maybeAskAppBackfill(owner, appId, peer, context, { onlineHint, resume, reason })
        }
      }
      if (Object.keys(apps || {}).length === 0) {
        delete owners[owner]
        changed = true
      }
    }
    if (changed) {
      throwIfHandlerAborted(context)
      setState(state)
    }
  }

  function processAppBackfills (context = runtime, options = {}) {
    const generation = appBackfillProcessGeneration
    if (pendingAppBackfillProcess?.generation === generation) {
      const pending = pendingAppBackfillProcess
      pending.context = context
      pending.options = {
        ownerPubkey: pending.options.ownerPubkey && options.ownerPubkey === pending.options.ownerPubkey
          ? pending.options.ownerPubkey
          : '',
        peerPubkey: pending.options.peerPubkey && options.peerPubkey === pending.options.peerPubkey
          ? pending.options.peerPubkey
          : '',
        onlineHint: Boolean(pending.options.onlineHint || options.onlineHint),
        resume: Boolean(pending.options.resume || options.resume),
        reason: options.reason || pending.options.reason || ''
      }
      return pending.promise
    }
    const pending = {
      generation,
      context,
      options: {
        ownerPubkey: options.ownerPubkey || '',
        peerPubkey: options.peerPubkey || '',
        onlineHint: Boolean(options.onlineHint),
        resume: Boolean(options.resume),
        reason: options.reason || ''
      },
      promise: null
    }
    const run = appBackfillProcessTail
      .catch(() => {})
      .then(() => {
        if (pendingAppBackfillProcess === pending) pendingAppBackfillProcess = null
        if (generation !== appBackfillProcessGeneration) return null
        return processAppBackfillsNow(pending.context, pending.options)
      })
    pending.promise = run
    pendingAppBackfillProcess = pending
    appBackfillProcessTail = run
    return run
  }

  function requestAppBackfill ({ ownerPubkey, appId } = {}, context = runtime) {
    const owner = normalizePubkey(ownerPubkey)
    const app = normalizeAppId(appId)
    if (!owner || !app) return false
    const peers = trustedPubkeys(context)
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
    processAppBackfills(context, { ownerPubkey: owner, reason: 'initial' }).catch(report)
    scheduleRetrySweep(context)
    scheduleExchangeMaintenance(context)
    emitDebug(context.debug, 'app-backfill-requested', { ownerPubkey: owner, appId: app })
    return true
  }

  async function refreshLaneModes (context = runtime, { wake = true } = {}) {
    runtime = { ...runtime, ...context }
    const state = getState()
    const now = _nowMs()
    let changed = false
    const modes = new Map()
    for (const [ownerPubkey, owner] of Object.entries(state.owners || {})) {
      for (const [peerPubkey, entry] of Object.entries(owner || {})) {
        const mode = laneModeFor(ownerPubkey, peerPubkey, runtime)
        modes.set(`${ownerPubkey}:${peerPubkey}`, mode)
        changed = reconcileEntryLaneMode(
          state,
          ownerPubkey,
          peerPubkey,
          entry,
          mode,
          now
        ) || changed
      }
    }
    if (changed) {
      await setState(state)
      scheduleExchangeMaintenance(runtime, { immediate: true })
    }
    if (!wake) return changed
    for (const [ownerPubkey, owner] of Object.entries(state.owners || {})) {
      for (const [peerPubkey] of Object.entries(owner || {})) {
        const mode = modes.get(`${ownerPubkey}:${peerPubkey}`) || DEFAULT_NOSTRDB_LANE_MODE
        if (laneEnabled(mode, 'recent')) {
          await maybeAskRecent(ownerPubkey, peerPubkey, runtime, { reason: 'lane-mode' })
        }
        if (laneEnabled(mode, 'history')) {
          await maybeAsk(ownerPubkey, peerPubkey, runtime, { reason: 'lane-mode' })
        }
      }
    }
    return changed
  }

  async function handleAdvertise (ownerPubkey, message, context) {
    throwIfHandlerAborted(context)
    const advert = normalizeAdvert(requireDataBody(message))
    const peerPubkey = normalizePubkey(message?.event?.pubkey)
    if (!advert) throw syncPayloadInvalid('advertise-payload-invalid')
    if (!peerPubkey) return true

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
    throwIfHandlerAborted(context)
    await setState(state)
    emitDebug(context.debug, 'advertise-received', {
      ownerPubkey,
      senderPubkey: peerPubkey,
      minScore: advert.minScore,
      maxScore: advert.maxScore
    })
    const mode = laneModeFor(ownerPubkey, peerPubkey, context)
    if (laneEnabled(mode, 'recent')) {
      await maybeAskRecent(ownerPubkey, peerPubkey, context, { reason: 'advertise' })
    }
    if (laneEnabled(mode, 'history')) {
      await maybeAsk(ownerPubkey, peerPubkey, context, { onlineHint: true, reason: 'advertise' })
    }
    await processAppBackfills(context, {
      ownerPubkey,
      peerPubkey,
      onlineHint: true,
      reason: 'advertise'
    })
    return true
  }

  async function handleAsk (ownerPubkey, message, context, { tracking = true } = {}) {
    throwIfHandlerAborted(context)
    const ask = normalizeAsk(messageBody(message))
    if (!ask) return true
    const peerPubkey = normalizePubkey(message.event?.pubkey)
    if (!peerPubkey) return true
    const expiresAt = messageExpirationSeconds(message)
    if (expiresAt != null && expiresAt <= Math.floor(_nowMs() / 1000)) return true
    const previousState = getState()
    const previousRecord = exchangeRecord(
      previousState,
      ownerPubkey,
      peerPubkey,
      'reply',
      ask.requestId
    )
    throwIfHandlerAborted(context)
    await trackInboundAsk({
      ownerPubkey,
      peerPubkey,
      message,
      code: NOSTRDB_SYNC_ASK_CODE,
      ask,
      context
    })
    if (tracking &&
        previousRecord?.status === 'reply-published' &&
        previousRecord.events.reply.length) return true
    throwIfHandlerAborted(context)

    const db = getDb(ownerPubkey)
    const effectiveLimit = Math.min(ask.limit, REQUEST_LIMIT)
    const response = await db.query(syncQuery(ask.sinceScore, ask.untilScore, {
      '!ids': ask.excludeIds,
      limit: effectiveLimit + 1
    }))
    throwIfHandlerAborted(context)
    const queried = Array.isArray(response?.results) ? response.results : []
    const hasMore = queried.length > effectiveLimit
    const results = queried.slice(0, effectiveLimit)

    const options = {
      channelPubkey: message.channelPubkey,
      question: message.event,
      receiverPubkey: message.event?.pubkey,
      code: NOSTRDB_SYNC_REPLY_CODE,
      idempotencyKey: coalescingDigest(['nostrdb-reply', NOSTRDB_SYNC_REPLY_CODE, ask.requestId]),
      payload: {
        requestId: ask.requestId,
        sinceScore: ask.sinceScore,
        untilScore: ask.untilScore,
        hasMore,
        priority: ask.priority
      },
      bytesPerChunk: SYNC_BYTES_PER_CHUNK,
      sendEmptyReply: true
    }
    const trackedMessenger = {
      reply: async replyOptions => {
        throwIfHandlerAborted(context)
        const result = await context.messenger.reply({
          ...replyOptions,
          ...(expiresAt == null ? {} : { expiresAt })
        })
        throwIfHandlerAborted(context)
        await trackPublication({
          ownerPubkey,
          peerPubkey,
          direction: 'reply',
          requestId: ask.requestId,
          code: NOSTRDB_SYNC_REPLY_CODE,
          channelPubkey: message.channelPubkey,
          result,
          question: message.event,
          range: {
            sinceScore: ask.sinceScore,
            untilScore: ask.untilScore
          },
          context
        })
        return result
      }
    }
    const packer = createEventReplyPacker({ messenger: trackedMessenger, ...options })

    // Failures reach the parent drain, which nacks instead of acknowledging.
    for (const event of results) {
      throwIfHandlerAborted(context)
      await packer.update(event)
    }
    throwIfHandlerAborted(context)
    await packer.finalize()
    emitDebug(context.debug, 'reply', {
      ownerPubkey,
      receiverPubkey: message.event?.pubkey || '',
      requestId: ask.requestId,
      hasMore,
      count: results.length
    })
    return true
  }

  async function handleAppAsk (ownerPubkey, message, context, { tracking = true } = {}) {
    throwIfHandlerAborted(context)
    const ask = normalizeAppAsk(messageBody(message))
    if (!ask) return true
    const peerPubkey = normalizePubkey(message.event?.pubkey)
    if (!peerPubkey) return true
    const expiresAt = messageExpirationSeconds(message)
    if (expiresAt != null && expiresAt <= Math.floor(_nowMs() / 1000)) return true
    const previousState = getState()
    const previousRecord = exchangeRecord(
      previousState,
      ownerPubkey,
      peerPubkey,
      'reply',
      ask.requestId
    )
    throwIfHandlerAborted(context)
    await trackInboundAsk({
      ownerPubkey,
      peerPubkey,
      message,
      code: NOSTRDB_SYNC_APP_ASK_CODE,
      ask,
      context
    })
    if (tracking &&
        previousRecord?.status === 'reply-published' &&
        previousRecord.events.reply.length) return true
    throwIfHandlerAborted(context)

    let results = []
    let hasMore = false
    let nextAfter = ask.after
    const db = getDb(ownerPubkey)
    if (typeof db.exportEventsByAppPage === 'function') {
      const page = await db.exportEventsByAppPage(ask.appId, {
        after: ask.after,
        batchSize: ask.batchSize
      })
      throwIfHandlerAborted(context)
      results = Array.isArray(page?.events) ? page.events.slice(0, ask.batchSize) : []
      hasMore = page?.hasMore === true
      nextAfter = normalizeOptionalEventId(page?.nextAfter) || results.at(-1)?.id || ask.after
    }

    const options = {
      channelPubkey: message.channelPubkey,
      question: message.event,
      receiverPubkey: message.event?.pubkey,
      code: NOSTRDB_SYNC_APP_REPLY_CODE,
      idempotencyKey: coalescingDigest(['nostrdb-app-reply', NOSTRDB_SYNC_APP_REPLY_CODE, ask.requestId]),
      payload: {
        requestId: ask.requestId,
        appId: ask.appId,
        after: ask.after,
        nextAfter,
        hasMore
      },
      bytesPerChunk: SYNC_BYTES_PER_CHUNK,
      sendEmptyReply: true
    }
    const trackedMessenger = {
      reply: async replyOptions => {
        throwIfHandlerAborted(context)
        const result = await context.messenger.reply({
          ...replyOptions,
          ...(expiresAt == null ? {} : { expiresAt })
        })
        throwIfHandlerAborted(context)
        await trackPublication({
          ownerPubkey,
          peerPubkey,
          direction: 'reply',
          requestId: ask.requestId,
          code: NOSTRDB_SYNC_APP_REPLY_CODE,
          channelPubkey: message.channelPubkey,
          result,
          question: message.event,
          range: { appId: ask.appId, after: ask.after, batchSize: ask.batchSize },
          context
        })
        return result
      }
    }
    const packer = createEventReplyPacker({ messenger: trackedMessenger, ...options })

    // Failures reach the parent drain, which nacks instead of acknowledging.
    for (const event of results) {
      throwIfHandlerAborted(context)
      await packer.update(event)
    }
    throwIfHandlerAborted(context)
    await packer.finalize()
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
        // A merged personal copy is rewritten under a new wrapper id; mark it
        // too so the peer is not asked for it again immediately.
        if (result?.storedEvent) markRecentSyncEvent(result.storedEvent)
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
        // Merged personal copies are stored under a new wrapper id; mark those
        // too so the peer is not asked for them immediately.
        for (const id of Array.isArray(result?.storedIds) ? result.storedIds : []) {
          markRecentSyncEvent({ id })
        }
        return normalizePositiveInteger(result?.added, 0)
      }
      let imported = 0
      for (const event of events) {
        const result = await db.add(event, { appId, mergeSource: 'sync' })
        if (result?.ok === false) continue
        imported++
        if (result?.storedEvent) markRecentSyncEvent(result.storedEvent)
      }
      return imported
    } catch (err) {
      report(err)
      return 0
    }
  }

  async function handleReply (ownerPubkey, message, context) {
    throwIfHandlerAborted(context)
    const body = requireDataBody(message)
    const payload = normalizeEventBatchPayload(body)
    const peerPubkey = normalizePubkey(message?.event?.pubkey)
    if (!payload) throw syncPayloadInvalid('reply-payload-invalid')
    if (!peerPubkey) return true

    const state = getState()
    const entry = peerState(state, ownerPubkey, peerPubkey)
    const historyPending = entry.pending?.requestId === payload.requestId
      ? entry.pending
      : null
    const recentPending = entry.recent?.pending?.requestId === payload.requestId
      ? entry.recent.pending
      : null
    const pending = historyPending || recentPending
    if (pending) {
      const hasSinceScore = Object.hasOwn(body, 'sinceScore')
      const hasUntilScore = Object.hasOwn(body, 'untilScore')
      if (hasSinceScore !== hasUntilScore) {
        throw syncPayloadInvalid('reply-range-incomplete')
      }
      if (hasSinceScore &&
          (payload.sinceScore !== pending.sinceScore || payload.untilScore !== pending.untilScore)) {
        throw syncPayloadInvalid('reply-range-mismatch')
      }
    }

    const { events, rejected } = parseJsonlEventsDetailed(payload.jsonl)
    await ingestEvents(ownerPubkey, events)
    throwIfHandlerAborted(context)

    if (pending) {
      const lane = historyPending ? 'history' : 'recent'
      pending.replyCount = (pending.replyCount || 0) + events.length
      pending.replyIds = mergeIdLists(
        DENSE_INVENTORY_QUERY_LIMIT,
        pending.replyIds,
        events.map(event => event.id)
      )
      if (Number.isSafeInteger(payload.index) && payload.index >= 0) {
        pending.replyIndexes = [...new Set([...(pending.replyIndexes || []), payload.index])]
          .sort((left, right) => left - right)
      }
      if (payload.isLast) {
        const expectedReplyIndexes = Number.isSafeInteger(payload.index)
          ? Array.from({ length: payload.index + 1 }, (_, index) => index)
          : [0]
        const contiguous = expectedReplyIndexes.every(index =>
          (pending.replyIndexes || []).includes(index)
        )
        if (!contiguous) {
          entry.updatedAt = _nowMs()
          throwIfHandlerAborted(context)
          setState(state)
          emitDebug(context.debug, 'reply-incomplete', {
            ownerPubkey,
            senderPubkey: peerPubkey,
            requestId: payload.requestId,
            lane,
            lastIndex: payload.index,
            receivedIndexes: pending.replyIndexes || []
          })
          scheduleExchangeMaintenance(context)
          return true
        }
        const replyCount = pending.replyCount || 0
        const hasMore = payload.hasMore ?? replyCount >= (pending.limit || REQUEST_LIMIT)
        if (hasMore) {
          setLaneCycleReplyIds(entry, lane, mergeIdLists(
            DENSE_INVENTORY_QUERY_LIMIT,
            laneCycleReplyIds(entry, lane),
            pending.replyIds
          ))
        } else {
          setLaneCycleReplyIds(entry, lane, [])
        }
        if (hasMore) {
          if (lane === 'history') entry.windowMs = shrinkWindow(entry.windowMs)
          else entry.recent.windowMs = shrinkWindow(entry.recent.windowMs)
        } else {
          if (lane === 'history') {
            entry.completedScore = Math.max(entry.completedScore || 0, pending.untilScore)
            entry.windowMs = adaptWindow(entry.windowMs, replyCount, pending.limit || REQUEST_LIMIT)
          } else {
            entry.recent.windowMs = adaptWindow(entry.recent.windowMs, replyCount, pending.limit || REQUEST_LIMIT)
            advanceRecentCoverage(entry.recent, pending)
          }
        }
        if (lane === 'history') entry.pending = null
        else entry.recent.pending = null
        const exchange = exchangeRecord(state, ownerPubkey, peerPubkey, 'ask', payload.requestId, true)
        exchange.status = 'deleting-ask'
        exchange.updatedAt = _nowMs()
        entry.updatedAt = _nowMs()
        throwIfHandlerAborted(context)
        await setState(state)
        emitDebug(context.debug, 'reply-received', {
          ownerPubkey,
          senderPubkey: peerPubkey,
          requestId: payload.requestId,
          count: replyCount,
          hasMore,
          untilScore: pending.untilScore,
          lane
        })
        scheduleExchangeMaintenance(context, { immediate: true })
        throwIfHandlerAborted(context)
        if (hasMore) {
          if (lane === 'history') await maybeAsk(ownerPubkey, peerPubkey, context, { force: true, reason: 'has-more' })
        } else if (lane === 'history') {
          await maybeAsk(ownerPubkey, peerPubkey, context, { reason: 'history-next' })
        }
        if (lane === 'recent') {
          const mode = laneModeFor(ownerPubkey, peerPubkey, context)
          if (laneEnabled(mode, 'recent')) {
            await maybeAskRecent(ownerPubkey, peerPubkey, context, {
              reason: hasMore ? 'has-more' : 'recent-next'
            })
          }
          if (laneEnabled(mode, 'history')) {
            await maybeAsk(ownerPubkey, peerPubkey, context, { reason: 'recent-boundary' })
          }
        }
        if (rejected) throw syncPayloadInvalid('jsonl-entries-invalid', { partial: true })
        return true
      }
      entry.updatedAt = _nowMs()
      throwIfHandlerAborted(context)
      setState(state)
    }
    if (rejected) throw syncPayloadInvalid('jsonl-entries-invalid', { partial: true })
    return true
  }

  async function handleAppReply (ownerPubkey, message, context) {
    throwIfHandlerAborted(context)
    const payload = normalizeAppEventBatchPayload(requireDataBody(message))
    const peerPubkey = normalizePubkey(message?.event?.pubkey)
    if (!payload) throw syncPayloadInvalid('app-reply-payload-invalid')
    if (!peerPubkey) return true

    const state = getState()
    const { app, entry } = existingAppBackfillPeerState(state, ownerPubkey, payload.appId, peerPubkey)
    const pending = entry?.pending
    if (!pending || !payload.requestId || pending.requestId !== payload.requestId) {
      const { rejected } = parseJsonlEventsDetailed(payload.jsonl)
      if (rejected) throw syncPayloadInvalid('jsonl-entries-invalid', { partial: true })
      return true
    }

    const { events, rejected } = parseJsonlEventsDetailed(payload.jsonl)
    await ingestAppEvents(ownerPubkey, payload.appId, events)
    throwIfHandlerAborted(context)
    pending.replyCount = (pending.replyCount || 0) + events.length
    if (Number.isSafeInteger(payload.index) && payload.index >= 0) {
      pending.replyIndexes = [...new Set([...(pending.replyIndexes || []), payload.index])]
        .sort((left, right) => left - right)
    }
    if (events.length) pending.lastEventId = events.at(-1).id

    if (payload.isLast) {
      const expectedReplyIndexes = Number.isSafeInteger(payload.index)
        ? Array.from({ length: payload.index + 1 }, (_, index) => index)
        : [0]
      if (!expectedReplyIndexes.every(index => (pending.replyIndexes || []).includes(index))) {
        entry.updatedAt = _nowMs()
        app.updatedAt = entry.updatedAt
        throwIfHandlerAborted(context)
        setState(state)
        emitDebug(context.debug, 'app-reply-incomplete', {
          ownerPubkey,
          appId: payload.appId,
          senderPubkey: peerPubkey,
          requestId: payload.requestId,
          lastIndex: payload.index,
          receivedIndexes: pending.replyIndexes || []
        })
        scheduleExchangeMaintenance(context)
        return true
      }
      const replyCount = pending.replyCount || 0
      const nextAfter = payload.nextAfter || pending.lastEventId || pending.after || ''
      const hasMore = payload.hasMore ?? replyCount >= (pending.batchSize || REQUEST_LIMIT)
      entry.after = nextAfter
      entry.completed = !hasMore
      entry.pending = null
      const exchange = exchangeRecord(state, ownerPubkey, peerPubkey, 'ask', payload.requestId, true)
      exchange.status = 'deleting-ask'
      exchange.updatedAt = _nowMs()
      entry.updatedAt = _nowMs()
      app.updatedAt = entry.updatedAt
      throwIfHandlerAborted(context)
      setState(state)
      scheduleExchangeMaintenance(context, { immediate: true })
      emitDebug(context.debug, 'app-reply-received', {
        ownerPubkey,
        appId: payload.appId,
        senderPubkey: peerPubkey,
        requestId: payload.requestId,
        count: replyCount,
        hasMore,
        nextAfter
      })
      if (hasMore) {
        await processAppBackfills(context, {
          ownerPubkey,
          peerPubkey,
          reason: 'has-more'
        })
      }
      if (rejected) throw syncPayloadInvalid('jsonl-entries-invalid', { partial: true })
      return true
    }

    entry.updatedAt = _nowMs()
    app.updatedAt = entry.updatedAt
    throwIfHandlerAborted(context)
    setState(state)
    if (rejected) throw syncPayloadInvalid('jsonl-entries-invalid', { partial: true })
    return true
  }

  async function handlePush (ownerPubkey, message, context) {
    throwIfHandlerAborted(context)
    const payload = normalizeEventBatchPayload(requireDataBody(message))
    if (!payload) throw syncPayloadInvalid('push-payload-invalid')
    const { events, rejected } = parseJsonlEventsDetailed(payload.jsonl)
    const imported = await ingestEvents(ownerPubkey, events)
    throwIfHandlerAborted(context)
    emitDebug(context.debug, 'push-received', {
      ownerPubkey,
      senderPubkey: message.event?.pubkey || '',
      count: imported
    })
    await processAppBackfills(context, {
      ownerPubkey,
      peerPubkey: message.event?.pubkey || '',
      onlineHint: true,
      reason: 'push'
    })
    if (rejected) throw syncPayloadInvalid('jsonl-entries-invalid', { partial: true })
    return true
  }

  async function handleMessage (message, context = runtime) {
    throwIfHandlerAborted(context)
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
    const channelPubkey = ownerChannelPubkey(ownerPubkey, runtime)
    if (!runtime.messenger?.yell || !receiverPubkeys.length || !isOwnerReady(ownerPubkey, runtime) || !channelPubkey) return null
    return {
      messenger: runtime.messenger,
      channelPubkey,
      receiverPubkeys
    }
  }

  function clearPushTimer (queue) {
    if (queue.timer) _clearTimeout?.(queue.timer)
    queue.timer = null
    queue.timerAt = Infinity
    queue.cooling = false
  }

  function parkPushQueue (ownerPubkey, queue, error = null) {
    if (pushQueues.get(ownerPubkey) !== queue) return
    const retryAt = error ? publicationRetryAt(error, _nowMs()) : 0
    if (retryAt > _nowMs()) queue.retryAt = Math.max(queue.retryAt || 0, retryAt)
    clearPushTimer(queue)
    if (queue.retryAt > _nowMs() && runtime.messenger?.readStatus?.().paused !== true) {
      queue.waitingForResume = false
      if (!queue.flushing) schedulePushWake(ownerPubkey, queue)
    } else {
      queue.waitingForResume = true
    }
  }

  function isPushBackpressureError (error) {
    return error?.code === 'QUEUE_CAPACITY_EXCEEDED' ||
      error?.message === 'QUEUE_ITEM_TOO_LARGE' ||
      error?.name === 'QuotaExceededError'
  }

  function getPushQueue (ownerPubkey) {
    let queue = pushQueues.get(ownerPubkey)
    if (!queue) {
      queue = {
        events: new Map(),
        chunks: new Map(),
        readyAt: {
          normal: Infinity,
          lower: Infinity,
          lowest: Infinity
        },
        batchStartedAt: {
          lower: Infinity,
          lowest: Infinity
        },
        batchQuietAt: {
          lower: Infinity,
          lowest: Infinity
        },
        timer: null,
        timerAt: Infinity,
        cooling: false,
        retryAt: 0,
        waitingForResume: false,
        resumePending: false,
        eventBackpressure: false,
        eventRetryAt: 0,
        eventRetryDelayMs: 1000,
        chunkBackpressure: false,
        chunkRetryAt: 0,
        chunkRetryDelayMs: 1000,
        recovering: false,
        recoveryAgain: false,
        flushing: false,
        rerun: false,
        nextChunkIndex: 0
      }
      pushQueues.set(ownerPubkey, queue)
    }
    return queue
  }

  function pushRecordOrder (left, right) {
    return (PUSH_PRIORITY_RANK[right.priority] || 0) - (PUSH_PRIORITY_RANK[left.priority] || 0) ||
      (left.addedAt || 0) - (right.addedAt || 0)
  }

  function normalizePushEventRecord (ownerPubkey, record) {
    const id = normalizePubkey(record?.id || record?.event?.id)
    const event = record?.event
    if (!id || !isPlainObject(event) || normalizePubkey(event.id) !== id) return null
    return {
      id,
      event,
      coalescingKey: pushEventCoalescingKey(event),
      priority: PUSH_PRIORITIES.includes(record.priority)
        ? record.priority
        : pushPriorityForEvent(ownerPubkey, event),
      score: isSafeScore(record.score) ? record.score : null,
      addedAt: Number.isSafeInteger(record.addedAt) && record.addedAt >= 0
        ? record.addedAt
        : _nowMs()
    }
  }

  function normalizePushChunkRecord (record) {
    const id = normalizePubkey(record?.id)
    const channelPubkey = normalizePubkey(record?.channelPubkey)
    if (!id || !channelPubkey || !PUSH_PRIORITIES.includes(record?.priority) ||
        typeof record.jsonl !== 'string' || !record.jsonl ||
        encoder.encode(record.jsonl).byteLength > MAX_SYNC_JSONL_BYTES) return null
    const eventIds = normalizeIdList(record.eventIds, Number.MAX_SAFE_INTEGER)
    const receiverPubkeys = normalizeIdList(record.receiverPubkeys, Number.MAX_SAFE_INTEGER)
    if (!eventIds.length || !receiverPubkeys.length) return null
    return {
      id,
      channelPubkey,
      receiverPubkeys,
      eventIds,
      eventCount: eventIds.length,
      priority: record.priority,
      index: Number.isSafeInteger(record.index) && record.index >= 0 ? record.index : 0,
      isLast: record.isLast === true,
      jsonl: record.jsonl,
      bytes: Number.isSafeInteger(record.bytes) && record.bytes >= 0
        ? record.bytes
        : encoder.encode(record.jsonl).byteLength,
      addedAt: Number.isSafeInteger(record.addedAt) && record.addedAt >= 0
        ? record.addedAt
        : _nowMs()
    }
  }

  function getPushOutboxes (ownerPubkey) {
    if (!_indexedDB || !_createPushQueue) return Promise.resolve(null)
    let outboxes = pushOutboxes.get(ownerPubkey)
    if (!outboxes) {
      outboxes = Promise.all([
        _createPushQueue({
          prefix: `${PUSH_OUTBOX_PREFIX}:events:${ownerPubkey}`,
          indexedDB: _indexedDB,
          evictionPolicy: 'reject',
          maxBytes: PUSH_EVENT_OUTBOX_MAX_BYTES,
          indexes: {
            id: { keyPath: 'id', unique: true },
            [PUSH_COALESCING_INDEX]: 'coalescingKey'
          }
        }),
        _createPushQueue({
          prefix: `${PUSH_CHUNK_OUTBOX_PREFIX}:${ownerPubkey}`,
          indexedDB: _indexedDB,
          evictionPolicy: 'reject',
          maxBytes: PUSH_CHUNK_OUTBOX_MAX_BYTES,
          indexes: { id: { keyPath: 'id', unique: true } }
        })
      ]).then(([events, chunks]) => ({ events, chunks })).catch(error => {
        pushOutboxes.delete(ownerPubkey)
        throw error
      })
      pushOutboxes.set(ownerPubkey, outboxes)
    }
    return outboxes
  }

  async function refreshPushOutboxes (ownerPubkey, queue) {
    const outboxes = await getPushOutboxes(ownerPubkey)
    if (!outboxes) return
    for await (const value of outboxes.events.storedItems()) {
      const record = normalizePushEventRecord(ownerPubkey, value)
      if (record) {
        record.persisted = true
        queue.events.set(record.id, record)
      }
    }
    for await (const value of outboxes.chunks.storedItems()) {
      const record = normalizePushChunkRecord(value)
      if (record) queue.chunks.set(record.id, record)
    }
  }

  function coalescePushEventInMemory (queue, record) {
    if (!record.coalescingKey) return 'inserted'
    const matches = [...queue.events.values()]
      .filter(candidate => candidate.id !== record.id && candidate.coalescingKey === record.coalescingKey)
    const latest = matches.reduce((current, candidate) => (
      !current || comparePushEventRecords(candidate, current) > 0 ? candidate : current
    ), null)
    if (latest && comparePushEventRecords(record, latest) <= 0) {
      if (queue.events.get(record.id) === record) queue.events.delete(record.id)
      return 'ignored'
    }
    for (const candidate of matches) queue.events.delete(candidate.id)
    queue.events.set(record.id, record)
    return matches.length ? 'replaced' : 'inserted'
  }

  async function reconcilePushCoalescingGroup (ownerPubkey, outboxes, queue, key) {
    const persisted = new Map()
    for await (const value of outboxes.events.storedItemsBy(PUSH_COALESCING_INDEX, key)) {
      const record = normalizePushEventRecord(ownerPubkey, value)
      if (!record || record.coalescingKey !== key) continue
      record.persisted = true
      persisted.set(record.id, record)
    }
    for (const [id, record] of queue.events) {
      if (record.coalescingKey === key && !persisted.has(id)) queue.events.delete(id)
    }
    for (const [id, record] of persisted) queue.events.set(id, record)
  }

  async function compactRestoredPushQueue (ownerPubkey, outboxes, queue) {
    const groups = new Map()
    for (const record of queue.events.values()) {
      if (!record.coalescingKey) continue
      const group = groups.get(record.coalescingKey) || []
      group.push(record)
      groups.set(record.coalescingKey, group)
    }
    for (const [key, group] of groups) {
      if (group.length < 2) continue
      const latest = group.reduce((current, record) =>
        comparePushEventRecords(record, current) > 0 ? record : current
      )
      for (const record of group) {
        if (record === latest) continue
        if (queue.events.get(record.id) === record) queue.events.delete(record.id)
        try { await outboxes.events.removeBy('id', record.id) } catch (error) { report(error) }
      }
      await outboxes.events.putBy('id', latest)
      await reconcilePushCoalescingGroup(ownerPubkey, outboxes, queue, key)
    }
  }

  async function persistPushEventRecord (ownerPubkey, queue, record) {
    const outboxes = await getPushOutboxes(ownerPubkey)
    if (!outboxes) {
      coalescePushEventInMemory(queue, record)
      return true
    }
    try {
      if (record.coalescingKey) {
        await outboxes.events.coalesceBy(PUSH_COALESCING_INDEX, record, {
          compare: comparePushEventRecords,
          keep: 'latest'
        })
        await reconcilePushCoalescingGroup(ownerPubkey, outboxes, queue, record.coalescingKey)
      } else {
        await outboxes.events.putBy('id', record)
      }
      queue.eventBackpressure = false
      queue.eventRetryAt = 0
      queue.eventRetryDelayMs = 1000
      return true
    } catch (error) {
      queue.eventBackpressure = true
      queue.eventRetryAt = _nowMs() + queue.eventRetryDelayMs
      queue.eventRetryDelayMs = Math.min(30000, queue.eventRetryDelayMs * 2)
      if (isPushBackpressureError(error)) {
        if (error?.message === 'QUEUE_ITEM_TOO_LARGE') report(error)
        return false
      }
      report(error)
      return false
    }
  }

  async function persistPushChunkRecord (ownerPubkey, queue, record) {
    const outboxes = await getPushOutboxes(ownerPubkey)
    if (!outboxes) return true
    try {
      await outboxes.chunks.putBy('id', record)
      queue.chunkBackpressure = false
      queue.chunkRetryAt = 0
      queue.chunkRetryDelayMs = 1000
      return true
    } catch (error) {
      queue.chunkBackpressure = true
      queue.chunkRetryAt = _nowMs() + queue.chunkRetryDelayMs
      queue.chunkRetryDelayMs = Math.min(30000, queue.chunkRetryDelayMs * 2)
      if (!isPushBackpressureError(error) || error?.message === 'QUEUE_ITEM_TOO_LARGE') report(error)
      return false
    }
  }

  async function removePushEventRecord (ownerPubkey, record) {
    const outboxes = await getPushOutboxes(ownerPubkey)
    if (!outboxes) return
    try {
      await outboxes.events.removeBy('id', record.id)
    } catch (error) {
      report(error)
    }
  }

  async function removePushChunkRecord (ownerPubkey, record) {
    const outboxes = await getPushOutboxes(ownerPubkey)
    if (!outboxes) return
    try {
      await outboxes.chunks.removeBy('id', record.id)
    } catch (error) {
      report(error)
    }
  }

  function nextPushDueAt (ownerPubkey, queue) {
    if (queue.waitingForResume || runtime.messenger?.readStatus?.().paused === true) return Infinity
    if (!pushRuntime(ownerPubkey)) return Infinity
    const now = _nowMs()
    if ((queue.retryAt || 0) > now) return queue.retryAt
    let dueAt = Infinity
    if (queue.eventBackpressure) {
      dueAt = Math.min(dueAt, Math.max(now, queue.eventRetryAt || now))
    }
    for (const record of queue.events.values()) {
      if (!record.persisted) continue
      const readyAt = queue.readyAt[record.priority]
      if (Number.isFinite(readyAt)) dueAt = Math.min(dueAt, Math.max(now, readyAt))
    }
    if (queue.chunkBackpressure && !queue.chunks.size) {
      dueAt = Math.min(dueAt, Math.max(now, queue.chunkRetryAt || now))
    }
    if (queue.chunks.size) dueAt = Math.min(dueAt, Math.max(now, queue.retryAt || 0))
    return dueAt
  }

  function schedulePushWake (ownerPubkey, queue) {
    if (pushQueues.get(ownerPubkey) !== queue) return
    if (queue.waitingForResume || runtime.messenger?.readStatus?.().paused === true) {
      parkPushQueue(ownerPubkey, queue)
      return
    }
    if (queue.flushing) {
      queue.rerun = true
      return
    }
    const now = _nowMs()
    const dueAt = nextPushDueAt(ownerPubkey, queue)
    if (!Number.isFinite(dueAt)) {
      clearPushTimer(queue)
      return
    }
    let trailingDueAt = Infinity
    for (const priority of ['lower', 'lowest']) {
      if (Number.isFinite(queue.readyAt[priority])) {
        trailingDueAt = Math.min(trailingDueAt, Math.max(now, queue.readyAt[priority]))
      }
    }
    const extendsTrailingWindow = dueAt > queue.timerAt && dueAt === trailingDueAt
    if (queue.timer && queue.timerAt <= dueAt && !extendsTrailingWindow) return
    clearPushTimer(queue)
    queue.cooling = true
    queue.timerAt = dueAt
    queue.timer = _setTimeout(async () => {
      queue.timer = null
      queue.timerAt = Infinity
      queue.cooling = false
      if (pushQueues.get(ownerPubkey) !== queue) return
      if (queue.events.size > 0 || queue.chunks.size > 0) {
        await flushPushQueue(ownerPubkey)
        if (!queue.timer && !queue.waitingForResume) schedulePushWake(ownerPubkey, queue)
      }
    }, Math.max(0, dueAt - now))
    queue.timer?.unref?.()
  }

  function pushPriorityForEvent (ownerPubkey, event) {
    if (event?.kind !== PERSONAL_COPY) return 'lowest'
    const innerKind = personalCopyTag(event, 'k')
    if (innerKind === '34601') return 'lower'
    const context = personalCopyTag(event, 'c')
    if (emptyContextByOwner.has(ownerPubkey) &&
        context === emptyContextByOwner.get(ownerPubkey)) return 'lower'
    return 'normal'
  }

  function markPushPriorityReady (queue, priority) {
    const now = _nowMs()
    if (priority === 'normal') {
      queue.readyAt[priority] = now
      return
    }
    if (!Number.isFinite(queue.batchStartedAt[priority])) {
      queue.batchStartedAt[priority] = now
    }
    queue.batchQuietAt[priority] = now + PUSH_BATCH_WINDOW_MS
    queue.readyAt[priority] = Math.min(
      queue.batchStartedAt[priority] + PUSH_BATCH_MAX_WAIT_MS,
      queue.batchQuietAt[priority]
    )
  }

  async function restorePushQueue (ownerPubkey) {
    const queue = getPushQueue(ownerPubkey)
    await refreshPushOutboxes(ownerPubkey, queue)
    const outboxes = await getPushOutboxes(ownerPubkey)
    if (outboxes) await compactRestoredPushQueue(ownerPubkey, outboxes, queue)
    for (const record of queue.events.values()) {
      record.persisted = true
      markPushPriorityReady(queue, record.priority)
    }
    await recoverPendingPushEvents(ownerPubkey)
    if (queue.events.size || queue.chunks.size) schedulePushWake(ownerPubkey, queue)
  }

  async function recoverPendingPushEvents (ownerPubkey) {
    const queue = getPushQueue(ownerPubkey)
    if (queue.recovering) {
      queue.recoveryAgain = true
      return
    }
    queue.recovering = true
    queue.recoveryAgain = false
    try {
      const db = getDb(ownerPubkey)
      if (typeof db?.query !== 'function') return
      let cursor = pushCursorForOwner(ownerPubkey)
      if (cursor == null) {
        const restoredScores = [...queue.events.values()]
          .map(record => record.score)
          .filter(isSafeScore)
        if (restoredScores.length) {
          cursor = Math.max(...restoredScores)
        } else {
          const current = await db.query({ search: 'algo:sync sort:desc', limit: 1 })
          const baseline = normalizeScore(current?.meta?.firstScore ?? current?.meta?.lastScore)
          if (baseline == null) return
          await updatePushCursor(ownerPubkey, baseline)
          return
        }
      }

      for (let page = 0; page < 20; page++) {
        const response = await db.query(syncQuery(cursor, undefined, {
          limit: PUSH_RECOVERY_PAGE_SIZE
        }))
        const records = Array.isArray(response?.results) ? response.results : []
        if (!records.length) return
        const scores = Array.isArray(response?.meta?.scores) ? response.meta.scores : []
        let persisted = true
        let nextCursor = cursor
        for (let index = 0; index < records.length; index++) {
          const event = records[index]
          const score = normalizeScore(scores[index])
          if (score != null) nextCursor = Math.max(nextCursor, score)
          if (isRecentSyncEvent(event)) continue
          const ok = await queuePush(ownerPubkey, event, score)
          persisted = persisted && ok
        }
        const lastScore = normalizeScore(response?.meta?.lastScore)
        if (lastScore != null) nextCursor = Math.max(nextCursor, lastScore)
        if (!persisted) {
          queue.recoveryAgain = true
          return
        }
        if (nextCursor <= cursor) return
        await updatePushCursor(ownerPubkey, nextCursor)
        cursor = nextCursor
        if (records.length < PUSH_RECOVERY_PAGE_SIZE) return
      }
      queue.recoveryAgain = true
    } catch (error) {
      queue.recoveryAgain = true
      report(error)
    } finally {
      queue.recovering = false
    }
  }

  async function enqueuePushInMemory (ownerPubkey, event, priority, score = null) {
    const queue = getPushQueue(ownerPubkey)
    const id = normalizePubkey(event?.id)
    if (!id) return false
    const existing = queue.events.get(id)
    if (existing?.persisted) return true
    const record = {
      id,
      event,
      coalescingKey: pushEventCoalescingKey(event),
      priority,
      score: isSafeScore(score) ? score : null,
      addedAt: existing?.addedAt ?? _nowMs(),
      persisted: false
    }
    queue.events.set(id, record)
    const persisted = await persistPushEventRecord(ownerPubkey, queue, record)
    record.persisted = persisted
    if (!persisted) {
      queue.recoveryAgain = true
      return false
    }
    notifyRangeChanged(ownerPubkey, priority)
    markPushPriorityReady(queue, priority)
    if (runtime.messenger?.readStatus?.().paused === true) {
      parkPushQueue(ownerPubkey, queue)
      return true
    }
    schedulePushWake(ownerPubkey, queue)
    return true
  }

  async function queuePush (ownerPubkey, event, score = null) {
    if (!normalizePubkey(event?.id)) return true
    if (isRecentSyncEvent(event)) {
      if (isSafeScore(score)) await updatePushCursor(ownerPubkey, score)
      return true
    }
    const priority = pushPriorityForEvent(ownerPubkey, event)
    return enqueuePushInMemory(ownerPubkey, event, priority, score)
  }

  async function retryUnpersistedPushEvents (ownerPubkey, queue) {
    if (!queue.eventBackpressure) return
    for (const record of queue.events.values()) {
      if (record.persisted) continue
      const persisted = await persistPushEventRecord(ownerPubkey, queue, record)
      record.persisted = persisted
      if (!persisted) return
      markPushPriorityReady(queue, record.priority)
    }
    queue.recoveryAgain = true
  }

  async function coalescePushChunkPair (ownerPubkey, queue) {
    const chunks = [...queue.chunks.values()]
      .sort((left, right) => pushRecordOrder(left, right) || left.index - right.index)
    for (let index = 0; index < chunks.length - 1; index++) {
      const first = chunks[index]
      const second = chunks[index + 1]
      if (!canCoalescePushChunks(first, second)) continue
      const eventIds = [...first.eventIds, ...second.eventIds]
      const jsonl = first.jsonl + second.jsonl
      const id = pushChunkIdempotencyKey(eventIds.map(eventId => ({ id: eventId })))
      if (id === first.id || id === second.id) continue
      const chunk = {
        id,
        channelPubkey: first.channelPubkey,
        receiverPubkeys: [...first.receiverPubkeys],
        eventIds,
        eventCount: eventIds.length,
        priority: first.priority,
        index: first.index,
        isLast: second.isLast,
        jsonl,
        bytes: encoder.encode(jsonl).byteLength,
        addedAt: Math.min(first.addedAt, second.addedAt)
      }
      const persisted = await persistPushChunkRecord(ownerPubkey, queue, chunk)
      if (!persisted) return false
      queue.chunks.set(chunk.id, chunk)
      queue.chunks.delete(first.id)
      queue.chunks.delete(second.id)
      await removePushChunkRecord(ownerPubkey, first)
      await removePushChunkRecord(ownerPubkey, second)
      return true
    }
    return false
  }

  async function packPushPriority (ownerPubkey, queue, priority, target) {
    const rawRecords = [...queue.events.values()]
      .filter(record => record.persisted && record.priority === priority)
      .sort((left, right) => left.addedAt - right.addedAt)
    const latestByKey = new Map()
    for (const record of rawRecords) {
      if (!record.coalescingKey) continue
      const current = latestByKey.get(record.coalescingKey)
      if (!current || comparePushEventRecords(record, current) > 0) {
        latestByKey.set(record.coalescingKey, record)
      }
    }
    const records = rawRecords.filter(record =>
      !record.coalescingKey || latestByKey.get(record.coalescingKey) === record
    )
    const selected = new Set(records)
    const superseded = rawRecords.filter(record => !selected.has(record))
    if (!records.length) return true
    let persistedThroughScore = null
    for (const record of superseded) {
      if (queue.events.get(record.id) === record) queue.events.delete(record.id)
      if (isSafeScore(record.score)) {
        persistedThroughScore = persistedThroughScore == null
          ? record.score
          : Math.max(persistedThroughScore, record.score)
      }
      await removePushEventRecord(ownerPubkey, record)
    }
    let cursor = 0
    while (cursor < records.length) {
      const start = cursor
      let jsonl = ''
      let bytes = 0
      while (cursor < records.length && cursor - start < PUSH_EVENTS_PER_CHUNK) {
        const line = eventsToJsonl([records[cursor].event])
        const length = encoder.encode(line).length
        if (cursor > start && bytes + length > SYNC_BYTES_PER_CHUNK) break
        jsonl += line
        bytes += length
        cursor++
      }
      const chunkEvents = records.slice(start, cursor).map(record => record.event)
      const id = pushChunkIdempotencyKey(chunkEvents)
      const chunk = {
        id,
        channelPubkey: target.channelPubkey,
        receiverPubkeys: [...target.receiverPubkeys],
        eventIds: chunkEvents.map(event => event.id),
        eventCount: chunkEvents.length,
        priority,
        index: queue.nextChunkIndex++,
        isLast: cursor === records.length,
        jsonl,
        bytes,
        addedAt: _nowMs()
      }
      const persisted = await persistPushChunkRecord(ownerPubkey, queue, chunk)
      if (!persisted) return false
      queue.chunks.set(chunk.id, chunk)
      for (const record of records.slice(start, cursor)) {
        if (queue.events.get(record.id) !== record) continue
        if (isSafeScore(record.score)) {
          persistedThroughScore = persistedThroughScore == null
            ? record.score
            : Math.max(persistedThroughScore, record.score)
        }
        queue.events.delete(record.id)
        await removePushEventRecord(ownerPubkey, record)
      }
    }
    if (persistedThroughScore != null) await updatePushCursor(ownerPubkey, persistedThroughScore)
    queue.readyAt[priority] = Infinity
    if (priority !== 'normal') {
      queue.batchStartedAt[priority] = Infinity
      queue.batchQuietAt[priority] = Infinity
    }
    return true
  }

  async function sendPushChunk (ownerPubkey, queue, target, chunk) {
    const receiverPubkeys = chunk.receiverPubkeys.filter(pubkey =>
      target.receiverPubkeys.includes(pubkey)
    )
    if (!receiverPubkeys.length) {
      queue.chunks.delete(chunk.id)
      await removePushChunkRecord(ownerPubkey, chunk)
      return { removed: true, empty: true }
    }
    if (receiverPubkeys.length !== chunk.receiverPubkeys.length ||
        chunk.channelPubkey !== target.channelPubkey) {
      chunk = {
        ...chunk,
        channelPubkey: target.channelPubkey,
        receiverPubkeys
      }
      const persisted = await persistPushChunkRecord(ownerPubkey, queue, chunk)
      if (!persisted) return { paused: true }
      queue.chunks.set(chunk.id, chunk)
    }
    const payload = {
      index: chunk.index,
      isLast: chunk.isLast,
      jsonl: chunk.jsonl
    }
    if (chunk.priority !== 'normal') payload.priority = chunk.priority
    await target.messenger.yell({
      channelPubkey: target.channelPubkey,
      receiverPubkeys,
      code: NOSTRDB_SYNC_PUSH_CODE,
      payload,
      idempotencyKey: chunk.id,
      useBulkPacing: chunk.priority !== 'normal'
    })
    queue.chunks.delete(chunk.id)
    await removePushChunkRecord(ownerPubkey, chunk)
    return { removed: true }
  }

  async function flushPushQueue (ownerPubkey) {
    const queue = pushQueues.get(ownerPubkey)
    if (!queue || queue.waitingForResume) return
    const target = pushRuntime(ownerPubkey)
    if (!target) return
    if (target.messenger.readStatus?.().paused === true) {
      parkPushQueue(ownerPubkey, queue)
      return
    }
    if (queue.flushing) {
      queue.rerun = true
      return
    }

    const current = () => pushQueues.get(ownerPubkey) === queue && runtime.messenger === target.messenger
    queue.flushing = true
    const flushStartedAt = _performanceNow()
    let publishedBytes = 0
    let sentChunks = 0
    try {
      await refreshPushOutboxes(ownerPubkey, queue)
      await retryUnpersistedPushEvents(ownerPubkey, queue)
      const now = _nowMs()
      if ((queue.retryAt || 0) <= now) {
        const canPack = !queue.chunkBackpressure || queue.chunkRetryAt <= now
        if (canPack) {
          for (const priority of PUSH_PRIORITIES) {
            if (!current()) return
            if (queue.readyAt[priority] > now) continue
            const packed = await packPushPriority(ownerPubkey, queue, priority, target)
            if (!packed) break
          }
        }
      }

      if (current()) await coalescePushChunkPair(ownerPubkey, queue)
      if (!current()) return
      const chunks = [...queue.chunks.values()]
        .sort((left, right) => pushRecordOrder(left, right) || left.index - right.index)
      for (const chunk of chunks) {
        if (!current()) return
        if ((queue.retryAt || 0) > _nowMs()) break
        const startedAt = runtime.debug ? _performanceNow() : 0
        try {
          const result = await sendPushChunk(ownerPubkey, queue, target, chunk)
          if (result.paused) break
          sentChunks++
          publishedBytes += chunk.bytes
          emitDebug(runtime.debug, 'push-chunk', {
            code: NOSTRDB_SYNC_PUSH_CODE,
            priority: chunk.priority,
            chunkIndex: chunk.index,
            eventCount: chunk.eventCount,
            bytes: chunk.bytes,
            elapsedMs: Math.max(0, Math.round(_performanceNow() - startedAt)),
            outcome: result.empty ? 'dropped-no-recipients' : 'published'
          })
        } catch (error) {
          if (!current()) return
          const failedAt = _nowMs()
          const retryAt = publicationRetryAt(error, failedAt) || failedAt + 1000
          emitDebug(runtime.debug, 'push-chunk', {
            code: NOSTRDB_SYNC_PUSH_CODE,
            priority: chunk.priority,
            chunkIndex: chunk.index,
            eventCount: chunk.eventCount,
            bytes: chunk.bytes,
            elapsedMs: Math.max(0, Math.round(_performanceNow() - startedAt)),
            outcome: 'failed',
            errorCode: debugToken(error?.code) || debugToken(error?.name) || 'UNKNOWN',
            retryAt,
            retryAfterMs: Math.max(0, retryAt - failedAt)
          })
          if (messengerPausedError(error)) {
            parkPushQueue(ownerPubkey, queue, error)
          } else {
            queue.retryAt = retryAt
            report(error)
          }
          break
        }
      }
      if (current() && !queue.chunks.size && !queue.events.size) queue.retryAt = 0
      if (current() && queue.chunks.size && (queue.retryAt || 0) <= _nowMs()) {
        queue.retryAt = _nowMs()
      }
      if (current() && (sentChunks > 0 || publishedBytes > 0)) {
        emitDebug(runtime.debug, 'push', {
          receiverCount: target.receiverPubkeys.length,
          chunkCount: sentChunks,
          bytes: publishedBytes,
          elapsedMs: Math.max(0, Math.round(_performanceNow() - flushStartedAt))
        })
      } else if (current()) {
        pushStats.idleWakeCount++
        pushStats.idleWakeMs += Math.max(0, Math.round(_performanceNow() - flushStartedAt))
        pushStats.lastIdleWakeAt = _nowMs()
      }
    } finally {
      queue.flushing = false
      const rerun = queue.rerun
      queue.rerun = false
      if (pushQueues.get(ownerPubkey) === queue) {
        if (rerun) {
          Promise.resolve().then(() => flushPushQueue(ownerPubkey)).catch(report)
        } else {
          if (queue.recoveryAgain && !queue.eventBackpressure) {
            queue.recoveryAgain = false
            Promise.resolve().then(() => recoverPendingPushEvents(ownerPubkey)).catch(report)
          }
          schedulePushWake(ownerPubkey, queue)
        }
      }
    }
  }

  function stopSubscription (ownerPubkey, { removePending = false } = {}) {
    const sub = subscriptions.get(ownerPubkey)
    if (sub) {
      sub.stopped = true
      sub.iterator?.return?.().catch?.(() => {})
      subscriptions.delete(ownerPubkey)
    }
    if (removePending) clearPushOwner(ownerPubkey).catch(report)
  }

  async function clearPushOwner (ownerPubkey) {
    const queue = pushQueues.get(ownerPubkey)
    if (queue) clearPushTimer(queue)
    pushQueues.delete(ownerPubkey)
    const outboxes = pushOutboxes.get(ownerPubkey)
    pushOutboxes.delete(ownerPubkey)
    try {
      if (outboxes) {
        const current = await outboxes
        await Promise.all([
          current.events.clear(),
          current.chunks.clear()
        ])
        await Promise.all([
          current.events.close?.(),
          current.chunks.close?.()
        ])
      }
    } finally {
      await clearPushCursor(ownerPubkey)
    }
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
        try {
          await restorePushQueue(ownerPubkey)
        } catch (error) {
          report(error)
        }
        for await (const item of iterator) {
          if (sub.stopped) break
          if (item?.type === 'event') await queuePush(ownerPubkey, item.event, item.meta?.score)
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
    if (isPlainObject(state.exchanges)) {
      for (const [ownerPubkey, peerEntries] of Object.entries(state.exchanges)) {
        if (!owners.has(ownerPubkey)) {
          delete state.exchanges[ownerPubkey]
          continue
        }
        for (const [peerPubkey, entries] of Object.entries(peerEntries || {})) {
          if (!peers.has(peerPubkey)) {
            delete peerEntries[peerPubkey]
            continue
          }
          for (const [key, record] of Object.entries(entries || {})) {
            const expiresAt = Number.isSafeInteger(record?.expiresAt) ? record.expiresAt : 0
            if ((!expiresAt || expiresAt + EXCHANGE_EXPIRY_GRACE_MS < _nowMs()) &&
                (record?.updatedAt || 0) < cutoff) {
              delete entries[key]
            }
          }
          if (!Object.keys(entries || {}).length) delete peerEntries[peerPubkey]
        }
        if (!Object.keys(peerEntries || {}).length) delete state.exchanges[ownerPubkey]
      }
      if (!Object.keys(state.exchanges).length) delete state.exchanges
    }
    if (isPlainObject(state.pushCursors)) {
      for (const ownerPubkey of Object.keys(state.pushCursors)) {
        if (!owners.has(ownerPubkey)) delete state.pushCursors[ownerPubkey]
      }
      if (!Object.keys(state.pushCursors).length) delete state.pushCursors
    }
    setState(state, {
      replaceKeys: ['owners', 'appBackfills', 'exchanges', 'pushCursors']
    })
  }

  function nextRetryAt (context = runtime) {
    const state = getState()
    let next = Infinity
    for (const [ownerPubkey, owner] of Object.entries(state.owners || {})) {
      if (!isOwnerReady(ownerPubkey, context)) continue
      for (const entry of Object.values(owner || {})) {
        for (const pending of [entry?.pending, entry?.recent?.pending]) {
          if (!pending || pending.waitingForResume) continue
          next = Math.min(next, pending.nextRetryAt || Infinity)
        }
      }
    }
    for (const [ownerPubkey, apps] of Object.entries(state.appBackfills || {})) {
      if (!isOwnerReady(ownerPubkey, context)) continue
      for (const app of Object.values(apps || {})) {
        for (const entry of Object.values(app?.peers || {})) {
          const pending = entry?.pending
          if (!pending || pending.waitingForResume) continue
          next = Math.min(next, pending.nextRetryAt || Infinity)
        }
      }
    }
    return Number.isFinite(next) ? next : 0
  }

  function scheduleRetrySweep (context = runtime) {
    context = backgroundContext(context)
    if (retryTimer) _clearTimeout?.(retryTimer)
    retryTimer = null
    const next = nextRetryAt(context)
    if (!next) return
    retryTimer = _setTimeout(() => {
      retryTimer = null
      retryDueRequests(context).catch(report)
    }, Math.max(0, next - _nowMs()))
    retryTimer?.unref?.()
  }

  async function retryDueRequests (context = runtime, { force = false, resume = false, apps = true } = {}) {
    if (!force && !resume) {
      await runExchangeMaintenance(context)
      return
    }
    const state = getState()
    const now = _nowMs()
    for (const [ownerPubkey, owner] of Object.entries(state.owners || {})) {
      if (context.ownerPubkeys instanceof Set && !context.ownerPubkeys.has(ownerPubkey)) continue
      for (const [peerPubkey, entry] of Object.entries(owner || {})) {
        if (!entry?.pending) continue
        if (resume ? !entry.pending.waitingForResume : entry.pending.waitingForResume) continue
        if (!resume && !force && (entry.pending.nextRetryAt || Infinity) > now) continue
        await maybeAsk(ownerPubkey, peerPubkey, context, {
          force,
          resume,
          reason: resume ? 'resume' : 'no-reply'
        })
      }
    }
    if (!apps) {
      scheduleRetrySweep(context)
      return
    }
    for (const [ownerPubkey, apps] of Object.entries(state.appBackfills || {})) {
      if (context.ownerPubkeys instanceof Set && !context.ownerPubkeys.has(ownerPubkey)) continue
      for (const [key, app] of Object.entries(apps || {})) {
        const appId = normalizeAppId(app?.appId) || appIdFromStateKey(key)
        if (!appId) continue
        for (const [peerPubkey, entry] of Object.entries(app?.peers || {})) {
          if (!entry?.pending) continue
          if (resume ? !entry.pending.waitingForResume : entry.pending.waitingForResume) continue
          if (!resume && !force && (entry.pending.nextRetryAt || Infinity) > now) continue
          await processAppBackfills(context, {
            ownerPubkey,
            peerPubkey,
            resume,
            reason: resume ? 'resume' : 'no-reply'
          })
          break
        }
      }
    }
    scheduleRetrySweep(context)
  }

  function hasWaitingForResume (state = getState()) {
    for (const owner of Object.values(state.owners || {})) {
      for (const entry of Object.values(owner || {})) {
        if (entry?.pending?.waitingForResume || entry?.recent?.pending?.waitingForResume) return true
      }
    }
    for (const apps of Object.values(state.appBackfills || {})) {
      for (const app of Object.values(apps || {})) {
        for (const entry of Object.values(app?.peers || {})) if (entry?.pending?.waitingForResume) return true
      }
    }
    return false
  }

  async function resumeAfterPause (context = runtime) {
    runtime = { ...runtime, ...context }
    const pushes = []
    for (const [ownerPubkey, queue] of pushQueues) {
      clearPushTimer(queue)
      queue.waitingForResume = false
      queue.resumePending = false
      if (runtime.messenger?.readStatus?.().paused === true) {
        parkPushQueue(ownerPubkey, queue)
        continue
      }
      if ((queue.retryAt || 0) > _nowMs()) {
        schedulePushWake(ownerPubkey, queue)
        continue
      }
      queue.retryAt = 0
      if (queue.events.size > 0 || queue.chunks.size > 0) {
        if (queue.flushing) queue.resumePending = true
        else pushes.push(flushPushQueue(ownerPubkey).catch(report))
      }
    }
    await Promise.all(pushes)
    await retryDueRequests(runtime, { resume: true, apps: false })
    await processAppBackfills(runtime, { resume: true, reason: 'resume' })
    scheduleRetrySweep(runtime)
    scheduleExchangeMaintenance(runtime, { immediate: true })
  }

  function ensureSubscriptions (context = {}) {
    runtime = { ...runtime, ...context }
    emptyContextByOwner.clear()
    for (const [ownerPubkey, value] of context.emptyPersonalCopyContextByOwner || []) {
      emptyContextByOwner.set(ownerPubkey, value)
    }
    const owners = runtime.ownerPubkeys instanceof Set ? runtime.ownerPubkeys : new Set(runtime.ownerPubkeys || [])
    for (const ownerPubkey of [...subscriptions.keys()]) {
      if (!owners.has(ownerPubkey)) stopSubscription(ownerPubkey, { removePending: true })
    }
    for (const ownerPubkey of [...pushQueues.keys()]) {
      if (!owners.has(ownerPubkey)) clearPushOwner(ownerPubkey).catch(report)
    }
    for (const ownerPubkey of owners) startSubscription(ownerPubkey)
    for (const [ownerPubkey, queue] of pushQueues) {
      if (queue.events.size || queue.chunks.size) schedulePushWake(ownerPubkey, queue)
    }
    pruneState({ ownerPubkeys: owners, trustedByPubkey: runtime.trustedByPubkey })
    if (runtime.messenger?.readStatus?.().paused === false && hasWaitingForResume()) {
      resumeAfterPause(runtime).catch(report)
    }
    processAppBackfills(runtime, { reason: 'initial' }).catch(report)
    scheduleRetrySweep(runtime)
    migratePendingExchanges(runtime)
      .then(async () => {
        await refreshLaneModes(runtime, { wake: false })
        scheduleExchangeMaintenance(runtime)
      })
      .catch(report)
  }

  function stop () {
    for (const ownerPubkey of [...subscriptions.keys()]) stopSubscription(ownerPubkey)
    for (const queue of pushQueues.values()) {
      if (queue.timer) _clearTimeout?.(queue.timer)
    }
    pushQueues.clear()
    for (const outboxes of pushOutboxes.values()) {
      Promise.resolve(outboxes).then(({ events, chunks }) => Promise.all([
        events.close?.(),
        chunks.close?.()
      ])).catch(report)
    }
    pushOutboxes.clear()
    emptyContextByOwner.clear()
    if (retryTimer) _clearTimeout?.(retryTimer)
    retryTimer = null
    stopExchangeMaintenance()
    appBackfillProcessGeneration += 1
    appBackfillProcessTail = Promise.resolve()
    pendingAppBackfillProcess = null
    runtime = {}
  }

  return {
    announceRange,
    handleMessage,
    ensureSubscriptions,
    refreshLaneModes,
    resumeAfterPause,
    requestAppBackfill,
    processAppBackfills,
    queuePush,
    runExchangeMaintenance,
    stop,
    getDebugSnapshot: () => ({
      askStats: askStatsSnapshot(),
      push: { ...pushStats },
      exchange: { ...exchangeStats }
    }),
    _getState: getState
  }
}
