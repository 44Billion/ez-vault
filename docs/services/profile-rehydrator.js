import * as store from './accounts-store.js'
import { fetchLatestProfile, fetchRelayListEvent, parseRelayListEvent, freeRelays } from './relays.js'
import { parseProfileEvent } from './nostr.js'
import { seededAvatarDataUrl } from './avatar.js'
import { isOnline, onOnline } from '../helpers/network.js'

let stopOnlineWatcher = null
let retryTimer = null
const RETRY_BACKOFF_MS = 60_000

export async function rehydrateAll () {
  const accounts = store.list()
  if (!accounts.length) return

  const online = await isOnline()
  if (!online) return scheduleRetry()

  const pending = accounts.map(a => rehydrateOne(a).catch(err => {
    console.warn('rehydrate failed for', a.pubkey, err?.message ?? err)
    return { failed: true }
  }))
  const results = await Promise.all(pending)
  if (results.some(r => r?.failed)) scheduleRetry()
}

async function rehydrateOne (account) {
  const patch = {}

  // Refresh the user's NIP-65 write relays (seed relays → kind:10002).
  const relayListEvent = await fetchRelayListEvent(account.pubkey)
  const cachedRelayListAt = account.relayListEvent?.created_at ?? 0
  let writeRelays = account.writeRelays
  if (relayListEvent && relayListEvent.created_at > cachedRelayListAt) {
    const parsed = parseRelayListEvent(relayListEvent)
    if (parsed.write.length) {
      writeRelays = parsed.write
      patch.relayListEvent = relayListEvent
      patch.writeRelays = parsed.write
    }
  }

  // Fetch the kind:0 from the user's write relays (fall back to free relays).
  const targetWriteRelays = writeRelays?.length ? writeRelays : freeRelays.slice(0, 2)
  const fresh = await fetchLatestProfile(account.pubkey, { writeRelays: targetWriteRelays })
  const cachedProfileAt = account.profileEvent?.created_at ?? 0
  if (fresh && fresh.created_at > cachedProfileAt) {
    const parsed = parseProfileEvent(fresh)
    patch.profileEvent = fresh
    patch.name = parsed.name || account.name || ''
    patch.picture = parsed.picture ||
      account.picture ||
      await seededAvatarDataUrl(account.nsec || account.pubkey)
  } else if (!account.picture) {
    patch.picture = await seededAvatarDataUrl(account.nsec || account.pubkey)
  }

  if (Object.keys(patch).length) store.update(account.pubkey, patch)
  return { updated: Object.keys(patch).length > 0 }
}

function scheduleRetry () {
  if (stopOnlineWatcher) return
  stopOnlineWatcher = onOnline(() => {
    clearRetry()
    rehydrateAll()
  })
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    clearRetry()
    rehydrateAll()
  }, RETRY_BACKOFF_MS)
}

function clearRetry () {
  stopOnlineWatcher?.()
  stopOnlineWatcher = null
  clearTimeout(retryTimer)
  retryTimer = null
}
