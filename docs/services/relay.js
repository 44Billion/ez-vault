import { freeRelays, relayPool, seedRelays } from 'libp2r2p/relay'

export { freeRelays, seedRelays } from 'libp2r2p/relay'

const READ_TIMEOUT_MS = 5000
const READ_TIMEOUT_AFTER_FIRST_EOSE_MS = 500

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

export function fetchRelayListEvent (pubkey, options) {
  return fetchLatestEvent({ kinds: [10002], authors: [pubkey], limit: 1 }, seedRelays, options)
}

export function parseRelayListEvent (event) {
  const out = { read: [], write: [] }
  if (!event || event.kind !== 10002) return out
  for (const tag of event.tags) {
    if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue
    const marker = tag[2]
    if (marker === 'read') out.read.push(tag[1])
    else if (marker === 'write') out.write.push(tag[1])
    else { out.read.push(tag[1]); out.write.push(tag[1]) }
  }
  out.read = [...new Set(out.read)]
  out.write = [...new Set(out.write)]
  return out
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
