import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46'
import { generateSecretKey } from 'nostr-tools'
import { bytesToHex, hexToBytes } from '../helpers/nostr/index.js'
import * as store from './accounts-store.js'
import * as secrets from './secrets.js'
import {
  fetchRelayListEvent,
  freeRelays,
  parseRelayListEvent,
  pool
} from './relays.js'

const PING_INTERVAL_MS = 60_000
const PING_TIMEOUT_MS = 10_000
const IDLE_TIMEOUT_MS = 5 * 60_000

// Module-private slot for raw client keys. Mirrors the NsecSigner pattern
// in nsec-signer.js: the bytes only ever live inside this WeakMap, keyed
// by the BunkerHandle instance, so prototype/property poking on the
// instance ("handle.leak = () => …") can't reach them.
const clientKeysByHandle = new WeakMap()
const handleCreateToken = Symbol('BunkerHandle-create')

function withTimeout (promise, ms, label = 'TIMEOUT') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) }
    )
  })
}

function parseJsonResult (value) {
  return typeof value === 'string' ? JSON.parse(value) : value
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

async function fetchRelaysForPubkey (pubkey) {
  const event = await fetchRelayListEvent(pubkey)
  const { read, write } = parseRelayListEvent(event)
  if (!read.length && !write.length) {
    const fallback = freeRelays.slice(0, 2)
    return { read: fallback, write: fallback }
  }
  return { read, write }
}

async function openSigner (bunkerUrl, clientSecretKey) {
  const pointer = await parseBunkerInput(bunkerUrl)
  if (!pointer) throw new Error('INVALID_BUNKER_URL')
  const signer = BunkerSigner.fromBunker(clientSecretKey, pointer, { pool })
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
export function persistHandleState ({ pubkey, bunkerUrl }) {
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
// Encapsulation, mirroring the NsecSigner pattern in nsec-signer.js:
// - `clientKey` lives in a module-private WeakMap, never on the instance.
// - The constructor requires a Symbol token so external callers can't
//   `new BunkerHandle(...)` with arbitrary key material — they must go
//   through `BunkerHandle.create(...)`.
// - `Object.preventExtensions(this)` and `Object.freeze(prototype)` block
//   `handle.leak = () => …` style monkey-patching tricks.
// - The `state` getter exposes only `{ pubkey, bunkerUrl }`; the clientKey
//   is never reachable through the public surface.
export class BunkerHandle {
  #state
  #onStateChange
  #signerPromise = null
  #pingTimer = null
  #lastUsedAt = 0
  #closed = false
  #onClose

  static create (params) {
    return new BunkerHandle(handleCreateToken, params)
  }

  constructor (token, { pubkey = null, bunkerUrl, clientKey = null, onStateChange, onClose } = {}) {
    if (token !== handleCreateToken) throw new Error('USE_BunkerHandle_create')
    if (!bunkerUrl) throw new Error('BUNKER_URL_REQUIRED')
    const finalClientKey = clientKey || bytesToHex(generateSecretKey())
    this.#state = { pubkey, bunkerUrl }
    clientKeysByHandle.set(this, finalClientKey)
    this.#onStateChange = onStateChange
    this.#onClose = onClose
    this.#lastUsedAt = Date.now()
    Object.preventExtensions(this)
    this.#scheduleTick()
  }

  // Read-only snapshot. Note: clientKey is intentionally absent.
  get state () {
    return { ...this.#state }
  }

  async getPublicKey () {
    const pubkey = await this.#request(s => s.getPublicKey())
    if (!this.#state.pubkey) {
      this.#state.pubkey = pubkey
      this.#notifyStateChange()
    }
    return pubkey
  }

  async signEvent (event) { return this.#request(s => s.signEvent(event)) }
  async nip04Encrypt (pk, pt) { return this.#request(s => s.nip04Encrypt(pk, pt)) }
  async nip04Decrypt (pk, ct) { return this.#request(s => s.nip04Decrypt(pk, ct)) }
  async nip44Encrypt (pk, pt) { return this.#request(s => s.nip44Encrypt(pk, pt)) }
  async nip44Decrypt (pk, ct) { return this.#request(s => s.nip44Decrypt(pk, ct)) }
  async nip44v3Encrypt (pk, kind, scope = '', pt) { return this.#sendRequest('nip44v3_encrypt', [pk, String(kind), scope || '', pt]) }
  async nip44v3Decrypt (pk, kind, scope = '', ct) { return this.#sendRequest('nip44v3_decrypt', [pk, String(kind), scope || '', ct]) }
  async nip44EncryptMultiDH (options) { return parseJsonResult(await this.#sendRequest('nip44_encrypt_multi_dh', [JSON.stringify(options || {})])) }
  async nip44DecryptMultiDH (options) { return parseJsonResult(await this.#sendRequest('nip44_decrypt_multi_dh', [JSON.stringify(options || {})])) }
  async doubleSignEvent (request) { return parseJsonResult(await this.#sendRequest('double_sign_event', [JSON.stringify(request || {})])) }
  async getRelays () {
    // `getRelays` is not a standard NIP-46 RPC. Resolve NIP-65 locally
    // instead of asking the remote signer to support our custom method.
    // return this.#request(s => s.getRelays())
    return fetchRelaysForPubkey(await this.getPublicKey())
  }
  withSharedKey (peerPubkey, info) {
    return new BunkerSharedKeyHandle(this, peerPubkey, info)
  }

  // Adopt this freshly-imported handle into the secrets pool. Called by the
  // import flow after `passkey.ensureRegistered()` succeeds. The clientKey
  // is read out of the WeakMap and threaded straight into secrets's
  // adopt-call without flowing through any return value.
  commit () {
    const pubkey = this.#state.pubkey
    if (!pubkey) throw new Error('PUBKEY_NOT_READY')
    const clientKey = clientKeysByHandle.get(this)
    if (!clientKey) throw new Error('NO_CLIENT_KEY')
    secrets.adoptBunkerHandle(pubkey, this, clientKey)
  }

  async close () {
    if (this.#closed) return
    this.#closed = true
    clearTimeout(this.#pingTimer)
    this.#pingTimer = null
    this.#onClose?.(this)
    const p = this.#signerPromise
    this.#signerPromise = null
    if (p) {
      try {
        const signer = await p
        try { await signer.close() } catch { /* noop */ }
      } catch { /* noop */ }
    }
  }

  #notifyStateChange () {
    this.#onStateChange?.({ pubkey: this.#state.pubkey, bunkerUrl: this.#state.bunkerUrl })
  }

  async #request (fn) {
    if (this.#closed) throw new Error('BUNKER_CLOSED')
    this.#lastUsedAt = Date.now()
    const signer = await this.#getSigner()
    // Re-check after the await: close() may have run while we waited for
    // connect, in which case we must not issue any further RPC.
    if (this.#closed) throw new Error('BUNKER_CLOSED')
    return fn(signer)
  }

  async #sendRequest (method, params = []) {
    return this.#request(signer => signer.sendRequest(method, params))
  }

  async tweakedSendRequest (tweak, method, params = []) {
    return this.#withTweakedSendRequest(tweak, signer => signer.sendRequest(method, params))
  }

  async tweakedRequest (tweak, method, params = []) {
    return this.#withTweakedSendRequest(tweak, signer => signer[method](...params))
  }

  async #withTweakedSendRequest (tweak, fn) {
    return this.#request(signer => {
      const original = signer.sendRequest.bind(signer)
      signer.sendRequest = function (sentMethod, sentParams) {
        const saved = JSON.stringify
        JSON.stringify = function (value, replacer, space) {
          if (value && value.id && value.method === sentMethod && value.params === sentParams) {
            return saved({ id: value.id, method: sentMethod, params: sentParams, tweak }, replacer, space)
          }
          return saved(value, replacer, space)
        }
        try {
          return original(sentMethod, sentParams)
        } finally {
          JSON.stringify = saved
          signer.sendRequest = original
        }
      }
      return fn(signer)
    })
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
    const clientKey = clientKeysByHandle.get(this)
    const signer = await openSigner(this.#state.bunkerUrl, hexToBytes(clientKey))
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
Object.freeze(BunkerHandle.prototype)
Object.freeze(BunkerHandle)

class BunkerSharedKeyHandle {
  #handle
  #peerPubkey
  #info

  constructor (handle, peerPubkey, info = '') {
    this.#handle = handle
    this.#peerPubkey = peerPubkey
    this.#info = info
    Object.preventExtensions(this)
  }

  #tweak () {
    return ['withSharedKey', this.#peerPubkey, this.#info]
  }

  #request (method, params = []) {
    return this.#handle.tweakedRequest(this.#tweak(), method, params)
  }

  #sendRequest (method, params = []) {
    return this.#handle.tweakedSendRequest(this.#tweak(), method, params)
  }

  async #jsonRequest (method, value) {
    return parseJsonResult(await this.#sendRequest(method, [JSON.stringify(value || {})]))
  }

  getPublicKey () { return this.#request('getPublicKey') }
  signEvent (event) { return this.#request('signEvent', [event]) }
  nip04Encrypt (pk, pt) { return this.#request('nip04Encrypt', [pk, pt]) }
  nip04Decrypt (pk, ct) { return this.#request('nip04Decrypt', [pk, ct]) }
  nip44Encrypt (pk, pt) { return this.#request('nip44Encrypt', [pk, pt]) }
  nip44Decrypt (pk, ct) { return this.#request('nip44Decrypt', [pk, ct]) }
  nip44v3Encrypt (pk, kind, scope = '', pt) { return this.#sendRequest('nip44v3_encrypt', [pk, String(kind), scope || '', pt]) }
  nip44v3Decrypt (pk, kind, scope = '', ct) { return this.#sendRequest('nip44v3_decrypt', [pk, String(kind), scope || '', ct]) }
  nip44EncryptMultiDH (options) { return this.#jsonRequest('nip44_encrypt_multi_dh', options) }
  nip44DecryptMultiDH (options) { return this.#jsonRequest('nip44_decrypt_multi_dh', options) }
  doubleSignEvent (request) { return this.#jsonRequest('double_sign_event', request) }
  async getRelays () {
    // Same reason as BunkerHandle#getRelays: this is local NIP-65 discovery,
    // not a NIP-46 request to the remote signer.
    // return this.#request('getRelays')
    return fetchRelaysForPubkey(await this.getPublicKey())
  }
  withSharedKey (peerPubkey, info = this.#info) {
    return new BunkerSharedKeyHandle(this.#handle, peerPubkey, info)
  }
}
Object.freeze(BunkerSharedKeyHandle.prototype)

// Import-time entry. Creates a transient handle (generating a fresh
// persistent client key, or reusing the one supplied by the caller),
// connects using the URL's `secret`, and resolves with the user pubkey
// the bunker speaks for. The clientKey is *not* returned — the caller
// commits via `handle.commit()` (delivered through onHandle) once the
// vault is unlocked, so the bytes never travel through this function's
// return shape.
export async function fetchBunkerUserPubkey (bunkerUrl, { clientKey, onHandle } = {}) {
  const handle = BunkerHandle.create({ bunkerUrl, clientKey, onStateChange: persistHandleState })
  // Surface the live handle so the caller can release it (e.g. on user
  // cancel) before the handshake/getPublicKey RPC ever resolves and so it
  // can call .commit() once the vault is ready.
  onHandle?.(handle)
  try {
    const pubkey = await handle.getPublicKey()
    return {
      pubkey,
      bunkerUrl: handle.state.bunkerUrl
    }
  } catch (err) {
    // Connect failed — tear down the draft handle.
    await handle.close()
    throw err
  }
}
