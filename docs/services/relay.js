import { SimplePool } from 'nostr-tools/pool'
import { freeRelays, seedRelays } from 'libp2r2p/relay'

export { freeRelays, seedRelays } from 'libp2r2p/relay'

const POST_EOSE_GRACE_MS = 500
const HARD_TIMEOUT_MS = 5000
const PUBLISH_TIMEOUT_UNTIL_FIRST_FULFILLMENT_MS = 3000
const PUBLISH_TIMEOUT_MS = 30000

export const pool = new SimplePool()

function maybeUnref (timer) {
  timer?.unref?.()
  return timer
}

function publishTimeoutError () {
  return new Error('PUBLISH_TIMEOUT')
}

function firstFulfillment (promises, timeout, { fallback } = {}) {
  return new Promise((resolve) => {
    let settled = false
    let rejected = 0
    let timer = null
    const finish = (success) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(success)
    }
    if (timeout !== null) timer = maybeUnref(setTimeout(() => finish(false), timeout))
    for (const promise of promises) {
      Promise.resolve(promise).then(
        () => finish(true),
        () => {
          rejected++
          if (rejected === promises.length) finish(false)
        }
      )
    }
    if (fallback) Promise.resolve(fallback).then(finish, () => finish(false))
  })
}

// Produces one ordered result per relay under one operation-wide deadline.
// timeout() lets an unsuccessful early return close every pending report at once.
function createPublishSettlements (promises, timeout) {
  const settlements = new Array(promises.length)
  let remaining = promises.length
  let timer = null
  let isFinished = false
  let resolve

  const promise = new Promise(nextResolve => { resolve = nextResolve })
  const finish = () => {
    if (isFinished) return
    isFinished = true
    clearTimeout(timer)
    resolve(settlements)
  }

  const settle = (index, settlement) => {
    if (settlements[index]) return
    settlements[index] = settlement
    remaining--
    if (remaining === 0) finish()
  }

  const timeoutPending = () => {
    if (isFinished) return
    for (let index = 0; index < settlements.length; index++) {
      settle(index, { status: 'rejected', reason: publishTimeoutError() })
    }
  }

  if (remaining === 0) finish()
  else {
    if (timeout !== null) timer = maybeUnref(setTimeout(timeoutPending, timeout))
    promises.forEach((promise, index) => {
      Promise.resolve(promise).then(
        () => settle(index, { status: 'fulfilled' }),
        reason => settle(index, { status: 'rejected', reason })
      )
    })
  }

  return { promise, timeout: timeoutPending }
}

function publishSummary (settlements, relays) {
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

export async function publish (event, relays, {
  timeout = PUBLISH_TIMEOUT_MS,
  timeoutUntilFirstFulfillment = PUBLISH_TIMEOUT_UNTIL_FIRST_FULFILLMENT_MS
} = {}) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  const publishPromises = pool.publish(relays, event)
  const settlement = createPublishSettlements(publishPromises, timeout)
  const promise = settlement.promise
    .then(settlements => publishSummary(settlements, relays))
  const success = await firstFulfillment(publishPromises, timeoutUntilFirstFulfillment, {
    fallback: promise.then(report => report.success)
  })
  if (!success) settlement.timeout()

  return {
    total: relays.length,
    success,
    promise
  }
}

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
        graceTimer = maybeUnref(setTimeout(finish, graceMs))
      },
      onclose () {
        // A single relay closing is not enough to finish; the timers decide.
      }
    })

    hardTimer = maybeUnref(setTimeout(finish, hardTimeoutMs))
  })
}

export async function fetchLatestEvent (filter, relays, options = {}) {
  const events = await fetchEvents(filter, relays, options)
  let latest = null
  for (const event of events) {
    if (!latest || event.created_at > latest.created_at) latest = event
  }
  return latest
}

export async function fetchRelayListEvent (pubkey) {
  return fetchLatestEvent({ kinds: [10002], authors: [pubkey], limit: 1 }, seedRelays)
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
