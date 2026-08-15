import {
  freeRelays,
  getRelaysByPubkey,
  parseRelayListEvent as parseNip65RelayListEvent,
  relayPool
} from 'libp2r2p/relay'

export { freeRelays, seedRelays } from 'libp2r2p/relay'

const READ_TIMEOUT_MS = 5000
const READ_TIMEOUT_AFTER_FIRST_EOSE_MS = 500

// libp2r2p rejects these by default; the vault deliberately supports them so
// it never rewrites a user's relay list just because it contains a relay that
// libp2r2p would not route through itself.
export const RELAY_URL_POLICY = {
  onion: true,
  localRelay: true,
  nostrEntityUrls: true
}

function latestEvent (events) {
  let latest = null
  for (const event of events) {
    if (!latest || event.created_at > latest.created_at) latest = event
  }
  return latest
}

async function fetchLatestEvent (filter, relays, { _relayPool = relayPool } = {}) {
  const { result } = await _relayPool.getEvents(filter, relays, {
    timeout: READ_TIMEOUT_MS,
    timeoutAfterFirstEose: READ_TIMEOUT_AFTER_FIRST_EOSE_MS
  })
  return latestEvent(result)
}

export async function fetchRelayListEvent (pubkey, {
  _getRelaysByPubkey = getRelaysByPubkey,
  forceRefresh = true,
  relayUrlPolicy = RELAY_URL_POLICY
} = {}) {
  const relaysByPubkey = await _getRelaysByPubkey([pubkey], {
    includeEvents: true,
    forceRefresh,
    relayUrlPolicy
  })
  return relaysByPubkey[pubkey]?.event ?? null
}

export function parseRelayListEvent (event, { relayUrlPolicy = RELAY_URL_POLICY } = {}) {
  return parseNip65RelayListEvent(event, relayUrlPolicy)
}

export async function resolveWriteRelays (pubkey, { _fetchRelayListEvent = fetchRelayListEvent } = {}) {
  try {
    const event = await _fetchRelayListEvent(pubkey)
    const { write } = parseRelayListEvent(event)
    if (write.length) return write
  } catch (error) {
    console.warn('resolveWriteRelays failed', error?.message ?? error)
  }
  return freeRelays.slice(0, 2)
}

export async function fetchLatestProfile (pubkey, {
  writeRelays,
  _relayPool = relayPool,
  _resolveWriteRelays = resolveWriteRelays
} = {}) {
  const relays = writeRelays?.length ? writeRelays : await _resolveWriteRelays(pubkey)
  return fetchLatestEvent({ kinds: [0], authors: [pubkey], limit: 1 }, relays, { _relayPool })
}
