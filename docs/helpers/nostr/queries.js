import { CONTENT_KEY_KIND, parseContentKeyEvent } from '../../services/content-key/event.js'
import { fetchEvents, freeRelays, parseRelayListEvent, pool, seedRelays } from '../../services/relays.js'

const DEFAULT_RELAYS_PER_PUBKEY = 2
const QUERY_CACHE_MS = 40 * 60 * 1000
const RELAY_CACHE_MAX_ITEMS = 500
const IYKC_CACHE_MAX_ITEMS = 10000
const HEX_PUBKEY = /^[0-9a-f]{64}$/i
const relaysByPubkey = Object.create(null)
const relayCacheTimersByPubkey = Object.create(null)
const relayCacheAddedAtByPubkey = Object.create(null)
const relayCacheEventCreatedAtByPubkey = Object.create(null)
const contentKeysByPubkey = Object.create(null)
const iykcCacheTimersByPubkey = Object.create(null)
const iykcCacheAddedAtByPubkey = Object.create(null)

function hasCachedKey (cache, key) {
  return Object.prototype.hasOwnProperty.call(cache, key)
}

function maybeUnref (timer) {
  timer?.unref?.()
  return timer
}

function cloneRelays (relays) {
  return {
    read: [...(relays?.read || [])],
    write: [...(relays?.write || [])]
  }
}

function uniquePubkeys (pubkeys, { requireHex = false } = {}) {
  const values = [...new Set(pubkeys || [])].filter(Boolean)
  return requireHex ? values.filter(pubkey => HEX_PUBKEY.test(pubkey)) : values
}

function relayListCreatedAt (event) {
  return Number.isFinite(event?.created_at) ? event.created_at : 0
}

function relaySetsEqual (a, b) {
  const left = new Set(a || [])
  const right = new Set(b || [])
  if (left.size !== right.size) return false
  for (const value of left) if (!right.has(value)) return false
  return true
}

function relaySetChanges (previous, next) {
  const read = !relaySetsEqual(previous?.read, next?.read)
  const write = !relaySetsEqual(previous?.write, next?.write)
  return {
    read,
    write,
    both: read || write
  }
}

function relayTypeChanged (changes, relayType) {
  if (relayType === 'read') return changes.read
  if (relayType === 'write') return changes.write
  return changes.both
}

function cloneContentKey (contentKey) {
  return contentKey
    ? {
        iykcPubkey: contentKey.iykcPubkey,
        iykcProof: contentKey.iykcProof
      }
    : null
}

function deleteCachedValue (cache, timers, addedAt, key) {
  clearTimeout(timers[key])
  delete cache[key]
  delete timers[key]
  delete addedAt[key]
}

function pruneCache (cache, timers, addedAt, maxItems) {
  const keys = Object.keys(cache)
  if (keys.length <= maxItems) return

  keys
    .sort((a, b) => (addedAt[a] || 0) - (addedAt[b] || 0))
    .slice(0, keys.length - maxItems)
    .forEach(key => deleteCachedValue(cache, timers, addedAt, key))
}

function setCachedValue (cache, timers, addedAt, key, value, cacheMs) {
  cache[key] = value
  addedAt[key] = Date.now()
  clearTimeout(timers[key])
  if (cacheMs > 0) {
    timers[key] = maybeUnref(setTimeout(() => {
      deleteCachedValue(cache, timers, addedAt, key)
    }, cacheMs))
  } else {
    delete timers[key]
  }
}

function clearCache (cache, timers, addedAt) {
  for (const timer of Object.values(timers)) clearTimeout(timer)
  for (const key of Object.keys(cache)) delete cache[key]
  for (const key of Object.keys(timers)) delete timers[key]
  for (const key of Object.keys(addedAt)) delete addedAt[key]
}

function deleteCachedRelay (pubkey) {
  deleteCachedValue(relaysByPubkey, relayCacheTimersByPubkey, relayCacheAddedAtByPubkey, pubkey)
  delete relayCacheEventCreatedAtByPubkey[pubkey]
}

function setCachedRelays (pubkey, relays, createdAt, cacheMs) {
  setCachedValue(relaysByPubkey, relayCacheTimersByPubkey, relayCacheAddedAtByPubkey, pubkey, cloneRelays(relays), cacheMs)
  relayCacheEventCreatedAtByPubkey[pubkey] = createdAt
}

function pruneRelayCache () {
  const keys = Object.keys(relaysByPubkey)
  if (keys.length <= RELAY_CACHE_MAX_ITEMS) return

  keys
    .sort((a, b) => (relayCacheAddedAtByPubkey[a] || 0) - (relayCacheAddedAtByPubkey[b] || 0))
    .slice(0, keys.length - RELAY_CACHE_MAX_ITEMS)
    .forEach(deleteCachedRelay)
}

function clearRelayCache () {
  clearCache(relaysByPubkey, relayCacheTimersByPubkey, relayCacheAddedAtByPubkey)
  for (const key of Object.keys(relayCacheEventCreatedAtByPubkey)) delete relayCacheEventCreatedAtByPubkey[key]
}

export function clearQueryCaches () {
  clearRelayCache()
  clearCache(contentKeysByPubkey, iykcCacheTimersByPubkey, iykcCacheAddedAtByPubkey)
}

// Given pubkeys and their relay mappings, picks the minimum set of relays
// that covers all pubkeys (up to maxPerPubkey relays each), preferring
// relays shared by more pubkeys. Returns Map<relayUrl, pubkey[]>.
export function pickRelaysForPubkeys (pubkeys, relaysByPubkey, { maxPerPubkey = DEFAULT_RELAYS_PER_PUBKEY, relayType = 'write' } = {}) {
  const type = relayType === 'read' ? 'read' : 'write'
  const pkToPossibleRelays = new Map()
  for (const pk of pubkeys) {
    const relays = relaysByPubkey[pk]?.[type] || []
    pkToPossibleRelays.set(pk, new Set(relays.length ? relays : freeRelays.slice(0, DEFAULT_RELAYS_PER_PUBKEY)))
  }

  const relayCounts = new Map()
  for (const relays of pkToPossibleRelays.values()) {
    for (const relay of relays) relayCounts.set(relay, (relayCounts.get(relay) || 0) + 1)
  }
  const rankedRelays = [...relayCounts.keys()].sort((a, b) => relayCounts.get(b) - relayCounts.get(a))

  const relayToAuthors = new Map()
  for (const pk of pubkeys) {
    const possibleRelays = pkToPossibleRelays.get(pk)
    let assigned = 0
    for (const relay of rankedRelays) {
      if (assigned >= maxPerPubkey) break
      if (!possibleRelays.has(relay)) continue
      if (!relayToAuthors.has(relay)) relayToAuthors.set(relay, [])
      relayToAuthors.get(relay).push(pk)
      assigned++
    }
  }

  return relayToAuthors
}

export function cacheRelayListEvent (event, { cacheMs = QUERY_CACHE_MS } = {}) {
  if (!event || event.kind !== 10002 || !event.pubkey) return null
  const createdAt = relayListCreatedAt(event)
  const previousCreatedAt = relayCacheEventCreatedAtByPubkey[event.pubkey]
  if (previousCreatedAt != null && createdAt <= previousCreatedAt) return null

  const previousRelays = hasCachedKey(relaysByPubkey, event.pubkey)
    ? cloneRelays(relaysByPubkey[event.pubkey])
    : null
  const relays = parseRelayListEvent(event)
  const changes = relaySetChanges(previousRelays, relays)
  setCachedRelays(event.pubkey, relays, createdAt, cacheMs)
  pruneRelayCache()

  return {
    pubkey: event.pubkey,
    event,
    relays: cloneRelays(relays),
    previousRelays,
    changes
  }
}

export function subscribeRelayListUpdates (pubkeys, {
  relayType = 'both',
  onChange,
  relays = seedRelays,
  cacheMs = QUERY_CACHE_MS,
  _pool = pool
} = {}) {
  const authors = uniquePubkeys(pubkeys, { requireHex: _pool === pool })
  if (!authors.length) return () => {}

  let closed = false
  const sub = _pool.subscribeMany(relays, {
    kinds: [10002],
    authors
  }, {
    onevent (event) {
      if (closed || !authors.includes(event.pubkey)) return
      const update = cacheRelayListEvent(event, { cacheMs })
      if (!update || !relayTypeChanged(update.changes, relayType)) return
      onChange?.({
        ...update,
        relayType
      })
    }
  })

  return () => {
    closed = true
    sub?.close?.()
  }
}

export async function getRelaysByPubkey (pubkeys, { _fetchEvents = fetchEvents, cacheMs = QUERY_CACHE_MS } = {}) {
  const pubkeyList = uniquePubkeys(pubkeys, { requireHex: _fetchEvents === fetchEvents })
  if (!pubkeyList.length) return {}

  const out = {}
  const missingPubkeys = []
  for (const pubkey of pubkeyList) {
    if (hasCachedKey(relaysByPubkey, pubkey)) out[pubkey] = cloneRelays(relaysByPubkey[pubkey])
    else missingPubkeys.push(pubkey)
  }
  if (!missingPubkeys.length) return out

  const events = await _fetchEvents({
    kinds: [10002],
    authors: missingPubkeys,
    limit: missingPubkeys.length
  }, seedRelays)

  const latestByPubkey = {}
  for (const event of events) {
    if (!missingPubkeys.includes(event.pubkey)) continue
    if (!latestByPubkey[event.pubkey] || event.created_at > latestByPubkey[event.pubkey].created_at) {
      latestByPubkey[event.pubkey] = event
    }
  }

  for (const pubkey of missingPubkeys) {
    const relays = latestByPubkey[pubkey]
      ? parseRelayListEvent(latestByPubkey[pubkey])
      : { read: freeRelays.slice(0, 2), write: freeRelays.slice(0, 2) }
    setCachedRelays(pubkey, relays, relayListCreatedAt(latestByPubkey[pubkey]), cacheMs)
    out[pubkey] = relays
  }
  pruneRelayCache()
  return out
}

export async function getIykcProofs (pubkeys, {
  _fetchEvents = fetchEvents,
  _getRelaysByPubkey = getRelaysByPubkey,
  cacheMs = QUERY_CACHE_MS
} = {}) {
  const pubkeyList = uniquePubkeys(pubkeys, { requireHex: _fetchEvents === fetchEvents })
  if (!pubkeyList.length) return {}

  const out = {}
  const missingPubkeys = []
  for (const pubkey of pubkeyList) {
    if (!hasCachedKey(contentKeysByPubkey, pubkey)) {
      missingPubkeys.push(pubkey)
      continue
    }
    const cached = cloneContentKey(contentKeysByPubkey[pubkey])
    if (cached) out[pubkey] = cached
  }
  if (!missingPubkeys.length) return out

  const relaysByPubkey = await _getRelaysByPubkey(missingPubkeys, { _fetchEvents, cacheMs })
  const relayToAuthors = pickRelaysForPubkeys(missingPubkeys, relaysByPubkey)
  const eventGroups = await Promise.all(
    [...relayToAuthors.entries()]
      .map(([relay, authors]) => _fetchEvents({
        kinds: [CONTENT_KEY_KIND],
        authors,
        limit: authors.length
      }, [relay]))
  )

  const latestByPubkey = {}
  for (const event of eventGroups.flat()) {
    const parsed = parseContentKeyEvent(event)
    if (!parsed) continue
    if (!latestByPubkey[event.pubkey] || event.created_at > latestByPubkey[event.pubkey].created_at) {
      latestByPubkey[event.pubkey] = { created_at: event.created_at, ...parsed }
    }
  }

  for (const pubkey of missingPubkeys) {
    const entry = latestByPubkey[pubkey]
    const proof = entry
      ? { iykcPubkey: entry.iykcPubkey, iykcProof: entry.iykcProof }
      : null
    setCachedValue(contentKeysByPubkey, iykcCacheTimersByPubkey, iykcCacheAddedAtByPubkey, pubkey, cloneContentKey(proof), cacheMs)
    if (proof) out[pubkey] = proof
  }
  pruneCache(contentKeysByPubkey, iykcCacheTimersByPubkey, iykcCacheAddedAtByPubkey, IYKC_CACHE_MAX_ITEMS)
  return out
}
