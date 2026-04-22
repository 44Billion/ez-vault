import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46'
import { SimplePool } from 'nostr-tools/pool'
import { generateSecretKey } from 'nostr-tools'
import * as store from './accounts-store.js'

// One SimplePool shared by every BunkerHandle in this page session. Per-call
// pools would open a fresh WebSocket to the same relays for every request
// and tear them down on close — wasteful and papers over the fact that
// bunker relays are long-lived subscriptions, not one-shot fetches.
const relayPool = new SimplePool()

const handles = new Map() // userPubkey -> BunkerHandle

const PING_INTERVAL_MS = 60_000
const PING_TIMEOUT_MS = 10_000
const IDLE_TIMEOUT_MS = 5 * 60_000

function bytesToHex (bytes) {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

function hexToBytes (hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function withTimeout (promise, ms, label = 'TIMEOUT') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) }
    )
  })
}

// A bunker URL's `secret` is a one-use token consumed by the first successful
// `connect`. Reusing it is both pointless and the source of the bunker-side
// "already connected" rejections we've hit. Always reconnect secret-less.
export function stripBunkerSecret (bunkerUrl) {
  try {
    const url = new URL(bunkerUrl)
    if (url.protocol !== 'bunker:') return bunkerUrl
    url.searchParams.delete('secret')
    return url.toString()
  } catch {
    return bunkerUrl
  }
}

function buildBunkerUrl (remoteSignerPubkey, relays) {
  const u = new URL(`bunker://${remoteSignerPubkey}`)
  for (const r of relays) u.searchParams.append('relay', r)
  return u.toString()
}

async function openSigner (bunkerUrl, clientSecretKey) {
  const pointer = await parseBunkerInput(bunkerUrl)
  if (!pointer) throw new Error('INVALID_BUNKER_URL')
  const signer = BunkerSigner.fromBunker(clientSecretKey, pointer, { pool: relayPool })
  try {
    await signer.connect()
  } catch (err) {
    const msg = typeof err === 'string' ? err : (err?.message ?? '')
    // Some bunkers track prior sessions server-side and reply "already
    // connected" to a repeat `connect` RPC even from a fresh client key.
    // `fromBunker` has already set up the subscription, so the actual RPCs
    // that follow will surface any real connectivity failure.
    if (!/already connected/i.test(msg)) {
      try { await signer.close() } catch { /* noop */ }
      throw err
    }
  }
  return signer
}

// Persists bunker-URL changes (secret stripping, switch_relays result) back
// to the store record. Safe to call with a null pubkey (e.g. during import
// before the record exists) — the store lookup just misses.
function persistHandleState ({ pubkey, bunkerUrl }) {
  if (!pubkey) return
  const rec = store.get(pubkey)
  if (!rec || rec.bunker === bunkerUrl) return
  store.update(pubkey, { bunker: bunkerUrl })
}

// Shared, keep-warm handle for a bunker connection. Internally manages a
// single BunkerSigner, pings it every minute to keep the relay subscription
// alive, transparently reconnects on failure (always without the secret),
// and self-evicts after IDLE_TIMEOUT_MS with no real method calls.
//
// Internal state uses its own field names (bunkerUrl, clientKey, pubkey) so
// it stays decoupled from the account-record shape in accounts-store.
class BunkerHandle {
  #state
  #onStateChange
  #signerPromise = null
  #pingTimer = null
  #lastUsedAt = 0
  #closed = false

  constructor ({ pubkey = null, bunkerUrl, clientKey = null, onStateChange } = {}) {
    if (!bunkerUrl) throw new Error('BUNKER_URL_REQUIRED')
    this.#state = {
      pubkey,
      bunkerUrl,
      clientKey: clientKey || bytesToHex(generateSecretKey())
    }
    this.#onStateChange = onStateChange
    this.#lastUsedAt = Date.now()
    this.#scheduleTick()
  }

  // Read-only snapshot for callers that need to persist post-connect state
  // (import flow reads clientKey + stripped bunkerUrl from here).
  get state () {
    return { ...this.#state }
  }

  async getPublicKey () {
    const pubkey = await this.#request(s => s.getPublicKey())
    if (!this.#state.pubkey) {
      this.#state.pubkey = pubkey
      this.#claimPool()
      this.#notifyStateChange()
    }
    return pubkey
  }

  async signEvent (event) { return this.#request(s => s.signEvent(event)) }
  async nip04Encrypt (pk, pt) { return this.#request(s => s.nip04Encrypt(pk, pt)) }
  async nip04Decrypt (pk, ct) { return this.#request(s => s.nip04Decrypt(pk, ct)) }
  async nip44Encrypt (pk, pt) { return this.#request(s => s.nip44Encrypt(pk, pt)) }
  async nip44Decrypt (pk, ct) { return this.#request(s => s.nip44Decrypt(pk, ct)) }

  async close () {
    if (this.#closed) return
    this.#closed = true
    clearTimeout(this.#pingTimer)
    this.#pingTimer = null
    if (this.#state.pubkey && handles.get(this.#state.pubkey) === this) {
      handles.delete(this.#state.pubkey)
    }
    const p = this.#signerPromise
    this.#signerPromise = null
    if (p) {
      try {
        const signer = await p
        try { await signer.close() } catch { /* noop */ }
      } catch { /* noop */ }
    }
  }

  #claimPool () {
    const { pubkey } = this.#state
    if (!pubkey) return
    const prior = handles.get(pubkey)
    if (prior && prior !== this) prior.close()
    handles.set(pubkey, this)
  }

  #notifyStateChange () {
    this.#onStateChange?.({ pubkey: this.#state.pubkey, bunkerUrl: this.#state.bunkerUrl })
  }

  async #request (fn) {
    if (this.#closed) throw new Error('BUNKER_CLOSED')
    this.#lastUsedAt = Date.now()
    const signer = await this.#getSigner()
    return fn(signer)
  }

  #getSigner () {
    if (this.#closed) return Promise.reject(new Error('BUNKER_CLOSED'))
    if (!this.#signerPromise) {
      const promise = this.#connect()
      this.#signerPromise = promise
      promise.catch(() => {
        if (this.#signerPromise === promise) this.#signerPromise = null
      })
    }
    return this.#signerPromise
  }

  async #connect () {
    const signer = await openSigner(this.#state.bunkerUrl, hexToBytes(this.#state.clientKey))
    let urlChanged = false
    // The URL's `secret` is one-use; now that we've burned it, strip it from
    // our in-memory copy so any future reconnect can't replay it.
    const stripped = stripBunkerSecret(this.#state.bunkerUrl)
    if (stripped !== this.#state.bunkerUrl) {
      this.#state.bunkerUrl = stripped
      urlChanged = true
    }
    // NIP-46: call switch_relays right after connect. If the bunker returns
    // a different relay set, BunkerSigner updates its subscription in-memory;
    // we mirror the new set into our cached bunkerUrl so it survives reload.
    try {
      const switched = await signer.switchRelays()
      if (switched) {
        this.#state.bunkerUrl = buildBunkerUrl(signer.bp.pubkey, signer.bp.relays)
        urlChanged = true
      }
    } catch (err) {
      console.warn('switch_relays failed', err?.message ?? err)
    }
    if (urlChanged) this.#notifyStateChange()
    this.#scheduleTick()
    return signer
  }

  #scheduleTick () {
    clearTimeout(this.#pingTimer)
    this.#pingTimer = setTimeout(() => this.#tick(), PING_INTERVAL_MS)
  }

  async #tick () {
    if (this.#closed) return
    if (Date.now() - this.#lastUsedAt >= IDLE_TIMEOUT_MS) {
      this.close()
      return
    }
    if (this.#signerPromise) {
      try {
        const signer = await this.#signerPromise
        await withTimeout(signer.ping(), PING_TIMEOUT_MS, 'PING_TIMEOUT')
      } catch (err) {
        console.warn('bunker ping failed, reconnecting', err?.message ?? err)
        const stale = this.#signerPromise
        this.#signerPromise = null
        try {
          const signer = await stale
          try { await signer.close() } catch { /* noop */ }
        } catch { /* noop */ }
        // Warm up a fresh connection now so the next caller doesn't pay the
        // reconnect latency. Errors here get logged; the next #getSigner
        // call will retry on demand.
        this.#getSigner().catch(e => {
          console.warn('bunker reconnect failed', e?.message ?? e)
        })
      }
    }
    this.#scheduleTick()
  }
}

export function claimBunker (account) {
  if (account.type !== 'bunker') throw new Error('NOT_A_BUNKER_ACCOUNT')
  if (!account.bunkerClientKey) throw new Error('MISSING_BUNKER_CLIENT_KEY')
  const existing = handles.get(account.pubkey)
  if (existing) {
    const s = existing.state
    if (s.bunkerUrl === account.bunker && s.clientKey === account.bunkerClientKey) {
      return existing
    }
    existing.close()
  }
  const handle = new BunkerHandle({
    pubkey: account.pubkey,
    bunkerUrl: account.bunker,
    clientKey: account.bunkerClientKey,
    onStateChange: persistHandleState
  })
  handles.set(account.pubkey, handle)
  return handle
}

export function releaseBunker (pubkey) {
  const handle = handles.get(pubkey)
  if (handle) handle.close()
}

// Import-time entry. Creates a handle (generating a fresh persistent client
// key), lets it connect using the URL's `secret`, and returns the values the
// caller must persist to the store. The handle stays in the pool, keyed by
// the user pubkey, so the rehydrator/sign flow later reuses the live
// connection instead of opening a new one.
export async function fetchBunkerUserPubkey (bunkerUrl) {
  const handle = new BunkerHandle({ bunkerUrl, onStateChange: persistHandleState })
  try {
    const pubkey = await handle.getPublicKey()
    return {
      pubkey,
      clientKey: handle.state.clientKey,
      bunkerUrl: handle.state.bunkerUrl
    }
  } catch (err) {
    // Connect failed — tear down the draft handle so it doesn't linger in
    // the pool (it hasn't been keyed yet if we never reached getPublicKey).
    await handle.close()
    throw err
  }
}
