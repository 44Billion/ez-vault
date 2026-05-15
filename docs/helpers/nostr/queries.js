import { CONTENT_KEY_KIND, parseContentKeyEvent } from '../../services/content-key/event.js'
import { fetchEvents, freeRelays, parseRelayListEvent, seedRelays } from '../../services/relays.js'

const DEFAULT_RELAYS_PER_PUBKEY = 2

// Given pubkeys and their relay mappings, picks the minimum set of relays
// that covers all pubkeys (up to maxPerPubkey relays each), preferring
// relays shared by more pubkeys. Returns Map<relayUrl, pubkey[]>.
export function pickRelaysForPubkeys (pubkeys, relaysByPubkey, { maxPerPubkey = DEFAULT_RELAYS_PER_PUBKEY } = {}) {
  const pkToPossibleRelays = new Map()
  for (const pk of pubkeys) {
    const writeRelays = relaysByPubkey[pk]?.write || []
    pkToPossibleRelays.set(pk, new Set(writeRelays.length ? writeRelays : freeRelays.slice(0, DEFAULT_RELAYS_PER_PUBKEY)))
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

export async function getRelaysByPubkey (pubkeys, { _fetchEvents = fetchEvents } = {}) {
  const uniquePubkeys = [...new Set(pubkeys)].filter(Boolean)
  if (!uniquePubkeys.length) return {}

  const events = await _fetchEvents({
    kinds: [10002],
    authors: uniquePubkeys,
    limit: uniquePubkeys.length
  }, seedRelays)

  const latestByPubkey = {}
  for (const event of events) {
    if (!uniquePubkeys.includes(event.pubkey)) continue
    if (!latestByPubkey[event.pubkey] || event.created_at > latestByPubkey[event.pubkey].created_at) {
      latestByPubkey[event.pubkey] = event
    }
  }

  const out = {}
  for (const pubkey of uniquePubkeys) {
    out[pubkey] = latestByPubkey[pubkey]
      ? parseRelayListEvent(latestByPubkey[pubkey])
      : { read: freeRelays.slice(0, 2), write: freeRelays.slice(0, 2) }
  }
  return out
}

export async function getIykcProofs (pubkeys, {
  _fetchEvents = fetchEvents,
  _getRelaysByPubkey = getRelaysByPubkey
} = {}) {
  const uniquePubkeys = [...new Set(pubkeys)].filter(Boolean)
  if (!uniquePubkeys.length) return {}

  const relaysByPubkey = await _getRelaysByPubkey(uniquePubkeys, { _fetchEvents })
  const relayToAuthors = pickRelaysForPubkeys(uniquePubkeys, relaysByPubkey)
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

  const out = {}
  for (const pubkey of uniquePubkeys) {
    const entry = latestByPubkey[pubkey]
    if (entry) out[pubkey] = { iykcPubkey: entry.iykcPubkey, iykcProof: entry.iykcProof }
  }
  return out
}
