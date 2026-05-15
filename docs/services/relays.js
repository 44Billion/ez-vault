import { SimplePool } from 'nostr-tools/pool'

// Used only to discover users' NIP-65 relay lists (kind:10002).
export const seedRelays = [
  'wss://relay.44billion.net',
  'wss://purplepag.es',
  'wss://user.kindpag.es',
  'wss://relay.nos.social',
  'wss://nostr.land',
  'wss://indexer.coracle.social'
]

// Fallback write-accepting relays. Used as the initial write/read-relay set for
// new accounts and as a fallback when we cannot resolve a user's own relays.
export const freeRelays = [
  'wss://relay.44billion.net',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.damus.io'
]

const POST_EOSE_GRACE_MS = 500
const HARD_TIMEOUT_MS = 5000

export const pool = new SimplePool()

export async function publish (event, relays) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  const settlements = await Promise.allSettled(pool.publish(relays, event))
  const fulfilled = settlements.filter(r => r.status === 'fulfilled').length
  return {
    success: fulfilled > 0,
    total: relays.length,
    fulfilled,
    errors: settlements
      .map((r, i) => r.status === 'rejected' ? { relay: relays[i], reason: r.reason } : null)
      .filter(Boolean)
  }
}

// Subscribe to a filter across multiple relays and return the newest matching
// event. Closes early 500ms after the first EOSE (or after a hard timeout).
export function fetchEvents (filter, relays, {
  graceMs = POST_EOSE_GRACE_MS,
  hardTimeoutMs = HARD_TIMEOUT_MS
} = {}) {
  return new Promise((resolve) => {
    if (!relays?.length) return resolve([])

    const events = []
    let settled = false
    let graceTimer = null
    let hardTimer = null
    let sub = null

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(graceTimer)
      clearTimeout(hardTimer)
      try { sub?.close() } catch { /* noop */ }
      resolve(events)
    }

    sub = pool.subscribeMany(relays, filter, {
      onevent (event) {
        events.push(event)
      },
      oneose () {
        if (settled || graceTimer) return
        graceTimer = setTimeout(finish, graceMs)
      },
      onclose () {
        // A single relay closing is not enough to finish — only give up when
        // EOSE-grace or the hard timeout fires.
      }
    })

    hardTimer = setTimeout(finish, hardTimeoutMs)
  })
}

// Subscribe to a filter across multiple relays and return the newest matching
// event. Closes early 500ms after the first EOSE (or after a hard timeout).
export async function fetchLatestEvent (filter, relays, options = {}) {
  const events = await fetchEvents(filter, relays, options)
  let latest = null
  for (const event of events) {
    if (!latest || event.created_at > latest.created_at) latest = event
  }
  return latest
}

// NIP-65: fetch the user's latest relay-list event (kind:10002) from seed relays.
export async function fetchRelayListEvent (pubkey) {
  return fetchLatestEvent({ kinds: [10002], authors: [pubkey], limit: 1 }, seedRelays)
}

// Returns { read, write }. `write` is the caller's best bet for publishing the
// user's events; `read` is where the user expects to receive events addressed to them.
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

// Resolves a user's write relays via NIP-65, falling back to freeRelays.
export async function resolveWriteRelays (pubkey) {
  try {
    const event = await fetchRelayListEvent(pubkey)
    const { write } = parseRelayListEvent(event)
    if (write.length) return write
  } catch (err) {
    console.warn('resolveWriteRelays failed', err?.message ?? err)
  }
  return freeRelays.slice(0, 2)
}

export async function fetchLatestProfile (pubkey, {
  writeRelays
} = {}) {
  const relays = writeRelays?.length ? writeRelays : await resolveWriteRelays(pubkey)
  return fetchLatestEvent({ kinds: [0], authors: [pubkey], limit: 1 }, relays)
}
