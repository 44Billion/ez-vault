import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools'
import { getConversationKey, encrypt as nip44Encrypt, decrypt as nip44Decrypt } from 'nostr-tools/nip44'
import { pool, freeRelays } from './relays.js'
import { bytesToHex } from '../helpers/nostr/index.js'
import {
  buildNostrpairUrl,
  parseNostrpairInput,
  extractBunkerClientKey,
  buildBunkerUrlWithClientKey
} from '../helpers/nostrpair-url.js'

export { buildNostrpairUrl, parseNostrpairInput, extractBunkerClientKey }

// kind for NIP-46 nostr-connect events; we reuse the same event kind (and
// NIP-44 framing) for nostrpair so any NIP-46-aware relay accepts our traffic.
const NIP46_KIND = 24133

// The pairing exchange is short-lived and same-user, so a single relay is
// enough and also makes QR Code less dense.
export const pairingRelay = freeRelays[0]

// Domain tag for pairing-code derivation. We HMAC the NIP-44 conversation key
// with this string before slicing 4 bytes off, so the bytes we surface to the
// user are independent from the key material NIP-44 itself derives chacha and
// MAC keys from. Without this separation, leaking the pairing code would leak
// prefix bytes of the same input that future message keys are expanded from.
const PAIRING_CODE_DOMAIN_TAG = 'ez-vault:nostrpair:pairing-code:v1' // Or 'nostr-pair-sas-v1' from https://github.com/nostr-protocol/nips/pull/2328

const SECRET_BYTES = 16
const CONNECT_TIMEOUT_MS = 30_000
const REQUEST_TIMEOUT_MS = 120_000
const EXCHANGE_TIMEOUT_MS = 180_000
const PUBLISH_TIMEOUT_MS = 10_000
const SUBSCRIPTION_CONNECTION_TIMEOUT_MS = 10_000
const PAIRING_CODE_DIGITS = 6
const PROFILE_NAME_MAX_LENGTH = 128
const PROFILE_ABOUT_MAX_LENGTH = 4096
const PROFILE_PICTURE_MAX_LENGTH = 4096

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function maybeUnref (timer) {
  timer?.unref?.()
  return timer
}

function timeoutError (label = 'SYNC_TIMEOUT') {
  return new Error(label)
}

function randomHex (bytes) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return bytesToHex(buf)
}

function settlePublishPromise (promise, timeoutMs = PUBLISH_TIMEOUT_MS) {
  let timer = null
  const timeoutPromise = new Promise(resolve => {
    timer = maybeUnref(setTimeout(() => resolve({ status: 'rejected', reason: timeoutError('PAIRING_PUBLISH_TIMEOUT') }), timeoutMs))
  })
  const publishPromise = Promise.resolve(promise).then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason })
  )
  return Promise.race([publishPromise, timeoutPromise]).finally(() => clearTimeout(timer))
}

async function subscribeFrame ({ relay, filter, handlers, _pool = pool }) {
  if (typeof _pool.ensureRelay !== 'function') {
    return _pool.subscribeMany([relay], filter, handlers)
  }
  const relayConnection = await _pool.ensureRelay(relay, {
    connectionTimeout: SUBSCRIPTION_CONNECTION_TIMEOUT_MS
  })
  const sub = relayConnection.subscribe([filter], handlers)
  // AbstractRelay.send() queues the actual WebSocket send in a promise
  // continuation. Yield once so callers don't publish/expose the pairing URL
  // before the REQ has at least been handed to the socket.
  await Promise.resolve()
  return sub
}

// Derives the 6-digit pairing code shown on one device and typed on the
// other. Both sides feed (their seckey, peer pubkey) into the same NIP-44
// conversation-key routine, HMAC the result against a fixed domain tag (see
// PAIRING_CODE_DOMAIN_TAG above), then take the leading 4 bytes mod 1_000_000.
// Identical keypairs on both sides produce identical codes; any other pair
// produces a different code with overwhelming probability.
export async function derivePairingCode (seckey, peerPubkey) {
  const conversationKey = getConversationKey(seckey, peerPubkey)
  const hmacKey = await crypto.subtle.importKey(
    'raw', conversationKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const tagBytes = new TextEncoder().encode(PAIRING_CODE_DOMAIN_TAG)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, tagBytes))
  // Treat the leading 4 bytes as a big-endian uint32. Multiplying instead of
  // shifting on the top byte avoids the sign-extension that `<<` would cause.
  const n = (mac[0] * 0x1000000) + (mac[1] << 16) + (mac[2] << 8) + mac[3]
  return String(n % 10 ** PAIRING_CODE_DIGITS).padStart(PAIRING_CODE_DIGITS, '0')
}

async function publishFrame ({ seckey, toPubkey, payload, relay, _pool = pool }) {
  const ck = getConversationKey(seckey, toPubkey)
  const content = nip44Encrypt(JSON.stringify(payload), ck)
  const event = finalizeEvent({
    kind: NIP46_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', toPubkey]],
    content
  }, seckey)
  const publishPromises = _pool.publish([relay], event)
  if (!Array.isArray(publishPromises) || !publishPromises.length) throw new Error('PAIRING_PUBLISH_FAILED')
  const results = await Promise.all(publishPromises.map(promise => settlePublishPromise(promise)))
  if (!results.some(result => result.status === 'fulfilled')) {
    const reason = results.find(result => result.status === 'rejected')?.reason
    throw reason instanceof Error ? reason : new Error('PAIRING_PUBLISH_FAILED')
  }
  return event
}

function tryDecodeFrame (event, seckey) {
  try {
    const ck = getConversationKey(seckey, event.pubkey)
    const plain = nip44Decrypt(event.content, ck)
    const parsed = JSON.parse(plain)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

// Host-side session (Device 1 in the UI). We hold the channel keys and act
// as the "remote signer" in NIP-46 terms: a fresh ephemeral key is
// generated per session and the URL we emit binds the pairing to that key,
// never to a user account. Accepted RPCs:
//   1. `connect` — burns the URL's one-use secret, locks the channel to
//      the joiner's pubkey.
//   2. `register_trusted_signer` — joiner announces its device signer
//      pubkey; we stash it (via the caller's onTrustedSignerReceived
//      handler) and ack.
//   3. `exchange_accounts` — symmetric account swap. Joiner sends its
//      selected accounts as params; we reply with our own selected
//      accounts after the user confirms the pairing code.
// Anything else gets rejected so a compromised joiner can't piggyback
// signing operations onto a pairing channel.
export class HostSession {
  #ephSecretKey
  #ephPubkey
  #secret
  #relay
  #pool
  #publishFrame
  #handlers
  #sub = null
  #joinerPubkey = null
  #closed = false
  #connectTimer = null

  constructor ({ onJoinerConnected, onPairingCode, onError, onTrustedSignerReceived, onExchangeRequest, _pool = pool, _publishFrame = publishFrame } = {}) {
    this.#ephSecretKey = generateSecretKey()
    this.#ephPubkey = getPublicKey(this.#ephSecretKey)
    this.#secret = randomHex(SECRET_BYTES)
    this.#relay = pairingRelay
    this.#pool = _pool
    this.#publishFrame = _publishFrame
    this.#handlers = { onJoinerConnected, onPairingCode, onError, onTrustedSignerReceived, onExchangeRequest }
  }

  get url () {
    return buildNostrpairUrl({ pubkey: this.#ephPubkey, relay: this.#relay, secret: this.#secret })
  }

  async start () {
    if (this.#sub || this.#closed) return
    const since = Math.floor(Date.now() / 1000) - 5
    const sub = await subscribeFrame({
      relay: this.#relay,
      filter: { kinds: [NIP46_KIND], '#p': [this.#ephPubkey], since },
      handlers: {
        onevent: (e) => this.#onEvent(e).catch(err => this.#handlers.onError?.(err))
      },
      _pool: this.#pool
    })
    if (this.#closed) {
      try { sub?.close?.() } catch { /* noop */ }
      return
    }
    this.#sub = sub
    // If nobody connects in CONNECT_TIMEOUT_MS we don't auto-close — the user
    // may still be carrying their other device across the room. The session
    // only ends when the user cancels or completes it.
  }

  async #onEvent (event) {
    if (this.#closed) return
    const req = tryDecodeFrame(event, this.#ephSecretKey)
    if (!req || !req.method) return

    if (req.method === 'connect') {
      const params = Array.isArray(req.params) ? req.params : []
      // NIP-46 connect: [remote_signer_pubkey, secret, perms?]
      const suppliedSecret = params[1]
      if (suppliedSecret !== this.#secret) {
        return this.#reply(event.pubkey, req.id, null, 'invalid secret')
      }
      // First successful connect locks the channel to that joiner pubkey;
      // any later traffic from a different pubkey is silently ignored. This
      // prevents a second client that scraped the URL off-relay from racing
      // in and stealing the pairing.
      if (this.#joinerPubkey && this.#joinerPubkey !== event.pubkey) return
      this.#joinerPubkey = event.pubkey
      clearTimeout(this.#connectTimer)
      this.#connectTimer = null
      this.#handlers.onJoinerConnected?.()
      await this.#reply(event.pubkey, req.id, 'ack', null)
      // Surface the pairing code now that both keys are known — the host's
      // display goes up immediately so the joiner's user has something to
      // read while we wait for register_trusted_signer + exchange_accounts.
      const code = await derivePairingCode(this.#ephSecretKey, event.pubkey)
      this.#handlers.onPairingCode?.(code)
      return
    }

    if (event.pubkey !== this.#joinerPubkey) return

    // Joiner announces its device signer pubkey before any account work.
    // Params shape: { platform: 'macOS / Chrome', signerPubkey }
    // The caller's handler may also return its OWN { signerPubkey, platform }
    // so we can publish a `register_trusted_signer` request back through the
    // channel — symmetry keeps the trust relationship two-sided.
    if (req.method === 'register_trusted_signer') {
      const params = req.params && typeof req.params === 'object' ? req.params : {}
      const platform = typeof params.platform === 'string' ? params.platform : ''
      const signerPubkey = typeof params.signerPubkey === 'string' ? params.signerPubkey : ''
      if (!signerPubkey) {
        return this.#reply(event.pubkey, req.id, null, 'missing signerPubkey')
      }
      let ourTrust
      try {
        ourTrust = await this.#handlers.onTrustedSignerReceived?.({ platform, signerPubkey })
      } catch (err) {
        return this.#reply(event.pubkey, req.id, null, err?.message || 'register_trusted_signer failed')
      }
      await this.#reply(event.pubkey, req.id, 'ack', null)
      // Publish our own register_trusted_signer back. We don't await an ack;
      // the joiner's #onEvent loop will pick it up and respond, and the
      // result of that response isn't load-bearing for the host's flow.
      if (ourTrust?.signerPubkey) {
        await this.#publishFrame({
          seckey: this.#ephSecretKey,
          toPubkey: event.pubkey,
          payload: {
            id: randomHex(8),
            method: 'register_trusted_signer',
            params: { platform: ourTrust.platform || '', signerPubkey: ourTrust.signerPubkey }
          },
          relay: this.#relay,
          _pool: this.#pool
        })
      }
      return
    }

    // Joiner's account exchange request. Params: { code, platform, accounts }.
    // Each account is a self-contained { type, value, pubkey, profile } object.
    // `code` is the pairing code the user read off OUR display and typed on
    // the joiner; we validate it against our own derivation (same shared
    // ECDH state) before replying. Mismatch → error reply, channel stays
    // open so the user can retype. Match → caller's onExchangeRequest
    // returns the envelope { platform, accounts } we send back.
    if (req.method === 'exchange_accounts') {
      const params = req.params && typeof req.params === 'object' ? req.params : {}
      const typedCode = typeof params.code === 'string' ? params.code : ''
      const platform = typeof params.platform === 'string' ? params.platform : ''
      const accounts = Array.isArray(params.accounts) ? params.accounts : []
      const code = await derivePairingCode(this.#ephSecretKey, event.pubkey)
      if (typedCode !== code) {
        return this.#reply(event.pubkey, req.id, null, 'invalid pairing code')
      }
      let outgoing
      try {
        outgoing = await this.#handlers.onExchangeRequest?.({ platform, accounts })
      } catch (err) {
        return this.#reply(event.pubkey, req.id, null, err?.message || 'exchange_accounts failed')
      }
      const envelope = outgoing && typeof outgoing === 'object'
        ? {
            platform: outgoing.platform || '',
            accounts: Array.isArray(outgoing.accounts) ? outgoing.accounts : []
          }
        : { platform: '', accounts: [] }
      return this.#reply(event.pubkey, req.id, JSON.stringify(envelope), null)
    }

    // Per spec: any single-account NIP-46 method (sign_event, nip04_*,
    // nip44_*, get_public_key, get_relays, ...) is meaningless on a pairing
    // channel. Reply with an explicit error so the joiner sees why instead
    // of timing out.
    if (req.id != null) {
      return this.#reply(event.pubkey, req.id, null, 'method not supported on nostrpair channel')
    }
  }

  // Active cancel: tear down the relay subscription. The joiner sees
  // pending requests reject on SYNC_TIMEOUT (for connect) or on its own
  // cancel, so there's no in-flight reply to send back here.
  cancel () {
    this.close()
  }

  close () {
    if (this.#closed) return
    this.#closed = true
    clearTimeout(this.#connectTimer)
    this.#connectTimer = null
    try { this.#sub?.close() } catch { /* noop */ }
    this.#sub = null
  }

  #reply (toPubkey, id, result, error) {
    if (this.#closed) return
    return this.#publishFrame({
      seckey: this.#ephSecretKey,
      toPubkey,
      payload: { id, result, error },
      relay: this.#relay,
      _pool: this.#pool
    })
  }
}

// Joiner-side session (Device 2 in the UI). Scans the URL, generates an
// ephemeral client key, connects to the host's relay, then drives the
// three-step protocol from the request side: `connect` → `register_trusted_signer`
// → `exchange_accounts`. Resolves once the host has replied to
// exchange_accounts (with its own envelope); rejects on cancel / error /
// timeout. Inbound register_trusted_signer requests from the host are
// surfaced via onTrustedSignerReceived so the caller can write the host's
// signer pubkey to its trust list and ack.
export class JoinerSession {
  #ephSecretKey
  #ephPubkey
  #remotePubkey
  #relay
  #pool
  #publishFrame
  #secret
  #handlers
  #connectTimeoutMs
  #requestTimeoutMs
  #exchangeTimeoutMs
  #sub = null
  #pending = new Map()
  #closed = false

  // One-shot resolver for the host's inbound `register_trusted_signer`
  // request; set by `awaitPeerTrustedSigner`, fulfilled by `#onEvent`
  // when the host's request lands. Race-safe: if the request arrives
  // before the caller awaits, we stash the value and resolve immediately
  // when the caller asks.
  #peerSignerReceived = null
  #peerSignerResolve = null
  #peerSignerReject = null
  #peerSignerTimer = null

  constructor (url, {
    onPairingCode,
    onConnected,
    onError,
    _pool = pool,
    _publishFrame = publishFrame,
    _connectTimeoutMs = CONNECT_TIMEOUT_MS,
    _requestTimeoutMs = REQUEST_TIMEOUT_MS,
    _exchangeTimeoutMs = EXCHANGE_TIMEOUT_MS
  } = {}) {
    const parsed = parseNostrpairInput(url)
    this.#remotePubkey = parsed.pubkey
    this.#relay = parsed.relay
    this.#pool = _pool
    this.#publishFrame = _publishFrame
    this.#connectTimeoutMs = _connectTimeoutMs
    this.#requestTimeoutMs = _requestTimeoutMs
    this.#exchangeTimeoutMs = _exchangeTimeoutMs
    this.#secret = parsed.secret
    this.#ephSecretKey = generateSecretKey()
    this.#ephPubkey = getPublicKey(this.#ephSecretKey)
    this.#handlers = { onPairingCode, onConnected, onError }
  }

  async connect () {
    await this.#startSubscription()
    if (this.#closed) throw new Error('SYNC_CANCELLED')
    await this.#request('connect', [this.#remotePubkey, this.#secret], { timeoutMs: this.#connectTimeoutMs })
    this.#handlers.onConnected?.()

    // Surface the pairing code as soon as we have both keys — the host's
    // reply to register_trusted_signer / exchange_accounts doesn't need to
    // arrive first. The user can already start walking it over to the host.
    const code = await derivePairingCode(this.#ephSecretKey, this.#remotePubkey)
    this.#handlers.onPairingCode?.(code)
  }

  // Bidirectional trust exchange in one shot. Sends our device's
  // `register_trusted_signer` request (with `params = { platform,
  // signerPubkey }`), awaits the host's ack, and also awaits the host's
  // own inbound `register_trusted_signer` request. The host publishes
  // theirs unprompted right after acking ours, so both directions
  // converge in the same round-trip. Returns the peer's
  // `{ platform, signerPubkey }` which the caller folds into the
  // commit's trusted-signers write.
  async exchangeTrust (params) {
    const ackPromise = this.#request('register_trusted_signer', params, { timeoutMs: this.#requestTimeoutMs })
      .then(result => {
        if (result !== 'ack') throw new Error('REGISTER_TRUSTED_SIGNER_FAILED')
      })
    const peerPromise = this.#awaitPeerTrustedSigner({ timeoutMs: this.#requestTimeoutMs })
    const [, peer] = await Promise.all([ackPromise, peerPromise])
    return peer
  }

  #awaitPeerTrustedSigner ({ timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    if (this.#peerSignerReceived) return Promise.resolve(this.#peerSignerReceived)
    return new Promise((resolve, reject) => {
      this.#peerSignerTimer = maybeUnref(setTimeout(() => {
        this.#peerSignerResolve = null
        this.#peerSignerReject = null
        this.#peerSignerTimer = null
        reject(timeoutError())
      }, timeoutMs))
      this.#peerSignerResolve = value => {
        clearTimeout(this.#peerSignerTimer)
        this.#peerSignerTimer = null
        resolve(value)
      }
      this.#peerSignerReject = err => {
        clearTimeout(this.#peerSignerTimer)
        this.#peerSignerTimer = null
        reject(err)
      }
    })
  }

  // Send the account-exchange request and wait for the host's matching
  // envelope. Params: `{ code, platform, accounts }`. The host validates
  // `code` against its own ECDH-derived value before replying — mismatch
  // surfaces as a rejected promise. The reply carries the host's
  // `{ platform, accounts }` envelope.
  async exchangeAccounts (params) {
    const resultJson = await this.#request('exchange_accounts', params, { timeoutMs: this.#exchangeTimeoutMs })
    let parsed
    try { parsed = JSON.parse(resultJson) } catch { throw new Error('SYNC_BAD_RESPONSE') }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.accounts)) {
      throw new Error('SYNC_BAD_RESPONSE')
    }
    return {
      platform: typeof parsed.platform === 'string' ? parsed.platform : '',
      accounts: parsed.accounts
    }
  }

  close () {
    if (this.#closed) return
    this.#closed = true
    try { this.#sub?.close() } catch { /* noop */ }
    this.#sub = null
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer)
      reject(new Error('SYNC_CANCELLED'))
    }
    this.#pending.clear()
    clearTimeout(this.#peerSignerTimer)
    this.#peerSignerTimer = null
    this.#peerSignerReject?.(new Error('SYNC_CANCELLED'))
    this.#peerSignerResolve = null
    this.#peerSignerReject = null
  }

  async #startSubscription () {
    if (this.#sub) return
    const since = Math.floor(Date.now() / 1000) - 5
    const sub = await subscribeFrame({
      relay: this.#relay,
      filter: { kinds: [NIP46_KIND], '#p': [this.#ephPubkey], authors: [this.#remotePubkey], since },
      handlers: { onevent: (e) => this.#onEvent(e).catch(err => this.#handlers.onError?.(err)) },
      _pool: this.#pool
    })
    if (this.#closed) {
      try { sub?.close?.() } catch { /* noop */ }
      return
    }
    this.#sub = sub
  }

  async #onEvent (event) {
    if (this.#closed) return
    if (event.pubkey !== this.#remotePubkey) return
    const frame = tryDecodeFrame(event, this.#ephSecretKey)
    if (!frame) return

    // Inbound request from the host (the symmetric register_trusted_signer
    // it publishes after acking ours). Stash the peer signer for whoever
    // is awaiting `exchangeTrust`, then ack.
    if (frame.method === 'register_trusted_signer' && frame.id != null) {
      const params = frame.params && typeof frame.params === 'object' ? frame.params : {}
      const platform = typeof params.platform === 'string' ? params.platform : ''
      const signerPubkey = typeof params.signerPubkey === 'string' ? params.signerPubkey : ''
      if (!signerPubkey) {
        await this.#publishFrame({
          seckey: this.#ephSecretKey,
          toPubkey: this.#remotePubkey,
          payload: { id: frame.id, result: null, error: 'missing signerPubkey' },
          relay: this.#relay,
          _pool: this.#pool
        })
        return
      }
      this.#peerSignerReceived = { platform, signerPubkey }
      this.#peerSignerResolve?.(this.#peerSignerReceived)
      this.#peerSignerResolve = null
      this.#peerSignerReject = null
      await this.#publishFrame({
        seckey: this.#ephSecretKey,
        toPubkey: this.#remotePubkey,
        payload: { id: frame.id, result: 'ack', error: null },
        relay: this.#relay,
        _pool: this.#pool
      })
      return
    }

    // Reply to one of our own outbound requests.
    if (frame.id == null) return
    const pending = this.#pending.get(frame.id)
    if (!pending) return
    this.#pending.delete(frame.id)
    clearTimeout(pending.timer)
    if (frame.error) {
      pending.reject(new Error(typeof frame.error === 'string' ? frame.error : 'SYNC_REJECTED'))
      return
    }
    pending.resolve(frame.result)
  }

  #request (method, params, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    if (this.#closed) return Promise.reject(new Error('SYNC_CANCELLED'))
    return new Promise((resolve, reject) => {
      const id = randomHex(8)
      const timer = maybeUnref(setTimeout(() => {
        if (this.#pending.delete(id)) reject(timeoutError())
      }, timeoutMs))
      this.#pending.set(id, { resolve, reject, timer })
      this.#publishFrame({
        seckey: this.#ephSecretKey,
        toPubkey: this.#remotePubkey,
        payload: { id, method, params },
        relay: this.#relay,
        _pool: this.#pool
      }).catch(err => {
        if (this.#pending.delete(id)) {
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }
}

// Build the self-contained objects carried in `exchange_accounts.accounts`.
// `value` is nsec1..., npub1..., or bunker://...#client_key=... where the URL
// fragment carries the per-account persistent client key. The fragment is
// local-only — the bunker itself never sees it because relays don't transmit
// URL fragments — so it's just a convenient way to pack two values into one
// string.
//
// `secretEntries` is the snapshot returned by `passkey.openSecrets()` — the
// caller has just performed a fresh passkey reauth to obtain the raw key
// material. Threading it in explicitly keeps the secret-extraction call
// site visible at the sync boundary.
//
function buildSyncAccountEntries (accounts, secretEntries, { nsecFromHex, npubFromPubkey }) {
  const nsecByPubkey = new Map()
  const clientKeyByPubkey = new Map()
  for (const e of secretEntries) {
    if (e.type === 'nsec') nsecByPubkey.set(e.pubkey, e.seckey)
    else if (e.type === 'bunker') clientKeyByPubkey.set(e.pubkey, e.clientKey)
  }
  const out = []
  for (const acc of accounts) {
    if (acc.type === 'nsec') {
      const seckey = nsecByPubkey.get(acc.pubkey)
      if (!seckey) continue
      out.push({
        type: 'nsec',
        value: nsecFromHex(seckey),
        pubkey: acc.pubkey,
        profile: profileForAccount(acc)
      })
    } else if (acc.type === 'npub') {
      out.push({
        type: 'npub',
        value: npubFromPubkey(acc.pubkey),
        pubkey: acc.pubkey,
        profile: profileForAccount(acc)
      })
    } else if (acc.type === 'bunker') {
      const clientKey = clientKeyByPubkey.get(acc.pubkey)
      if (!clientKey) continue
      out.push({
        type: 'bunker',
        value: buildBunkerUrlWithClientKey(acc.bunker, clientKey),
        pubkey: acc.pubkey,
        profile: profileForAccount(acc)
      })
    }
  }
  return out
}

function profileContent (event) {
  if (!event?.content) return {}
  try {
    const parsed = JSON.parse(event.content)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function cleanProfileField (value, maxLength) {
  const clean = typeof value === 'string' ? value.trim() : ''
  return clean.length <= maxLength ? clean : ''
}

function profileForAccount (account) {
  const profile = {}
  const content = profileContent(account.profileEvent)
  const name = cleanProfileField(account.name, PROFILE_NAME_MAX_LENGTH)
  const picture = cleanProfileField(account.picture, PROFILE_PICTURE_MAX_LENGTH)
  const contentName = cleanProfileField(content.name, PROFILE_NAME_MAX_LENGTH)
  const contentPicture = cleanProfileField(content.picture, PROFILE_PICTURE_MAX_LENGTH)
  const about = cleanProfileField(content.about, PROFILE_ABOUT_MAX_LENGTH)

  if (name || contentName) profile.name = name || contentName
  if (about) profile.about = about
  if (picture || contentPicture) profile.picture = picture || contentPicture
  return profile
}

export function buildSyncAccountPayload (accounts, secretEntries, converters) {
  return {
    accounts: buildSyncAccountEntries(accounts, secretEntries, converters)
  }
}
