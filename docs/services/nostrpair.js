import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools'
import { getConversationKey, encrypt as nip44Encrypt, decrypt as nip44Decrypt } from 'nostr-tools/nip44'
import { pool, freeRelays } from './relays.js'
import { bytesToHex } from './nostr.js'
import {
  buildNostrpairUrl,
  parseNostrpairInput,
  extractBunkerClientKey,
  buildBunkerUrlWithClientKey
} from '../helpers/nostrpair-url.js'

export { buildNostrpairUrl, parseNostrpairInput, extractBunkerClientKey }

// kind for NIP-46 nostr-connect events; we reuse the same event kind (and the
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
const PAIRING_CODE_DOMAIN_TAG = 'ez-vault/nostrpair/pairing-code/v1' // Or 'nostr-pair-sas-v1' from https://github.com/nostr-protocol/nips/pull/2328

const SECRET_BYTES = 16
const CONNECT_TIMEOUT_MS = 30_000
const PAIRING_CODE_DIGITS = 6

function randomHex (bytes) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return bytesToHex(buf)
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

async function publishFrame ({ seckey, toPubkey, payload, relay }) {
  const ck = getConversationKey(seckey, toPubkey)
  const content = nip44Encrypt(JSON.stringify(payload), ck)
  const event = finalizeEvent({
    kind: NIP46_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', toPubkey]],
    content
  }, seckey)
  await Promise.allSettled(pool.publish([relay], event))
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

// Source-side session: we hold the keys and act as the "remote signer" in
// NIP-46 terms. A fresh ephemeral key is generated per session — the URL we
// emit binds the pairing to that key, never to a user account. We accept
// exactly two RPC methods: `connect` (with the URL's one-use secret) and
// `import_accounts` (custom). Anything else gets rejected so a compromised
// target client can't piggyback signing operations onto a pairing channel.
export class ExportSession {
  #ephSecretKey
  #ephPubkey
  #secret
  #relay
  #handlers
  #sub = null
  #clientPubkey = null
  #pendingImport = null
  #closed = false
  #connectTimer = null
  // One-shot resolver for the trusted-signer round-trip the target fires
  // after it has the import_accounts reply in hand. Set on demand by
  // `awaitTrustedSignerExchange`; the `register_trusted_signers` handler
  // below flips the received flag and resolves whoever's waiting.
  #trustExchangeReceived = false
  #trustExchangeResolve = null
  #trustExchangeReject = null

  constructor ({ onTargetConnected, onPairingCode, onError, onTrustedSignersReceived } = {}) {
    this.#ephSecretKey = generateSecretKey()
    this.#ephPubkey = getPublicKey(this.#ephSecretKey)
    this.#secret = randomHex(SECRET_BYTES)
    this.#relay = pairingRelay
    this.#handlers = { onTargetConnected, onPairingCode, onError, onTrustedSignersReceived }
  }

  get url () {
    return buildNostrpairUrl({ pubkey: this.#ephPubkey, relay: this.#relay, secret: this.#secret })
  }

  start () {
    if (this.#sub || this.#closed) return
    const since = Math.floor(Date.now() / 1000) - 5
    this.#sub = pool.subscribeMany(
      [this.#relay],
      { kinds: [NIP46_KIND], '#p': [this.#ephPubkey], since },
      {
        onevent: (e) => this.#onEvent(e).catch(err => this.#handlers.onError?.(err))
      }
    )
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
      // First successful connect locks the channel to that client pubkey;
      // any later traffic from a different pubkey is silently ignored. This
      // prevents a second client that scraped the URL off-relay from racing
      // in and stealing the pairing.
      if (this.#clientPubkey && this.#clientPubkey !== event.pubkey) return
      this.#clientPubkey = event.pubkey
      clearTimeout(this.#connectTimer)
      this.#connectTimer = null
      this.#handlers.onTargetConnected?.()
      return this.#reply(event.pubkey, req.id, 'ack', null)
    }

    if (event.pubkey !== this.#clientPubkey) return

    if (req.method === 'import_accounts') {
      const code = await derivePairingCode(this.#ephSecretKey, event.pubkey)
      this.#pendingImport = { id: req.id, code }
      this.#handlers.onPairingCode?.(code)
      return
    }

    // Target's follow-up after it received and validated the import_accounts
    // reply: it now sends back its own per-account signer pubkeys so the
    // source can store them as trusted. Params shape:
    //   { platform: 'macOS / Chrome', signers: [{ accountPubkey, signerPubkey }, ...] }
    // We reply 'ack' once the handler has stashed them.
    if (req.method === 'register_trusted_signers') {
      const params = req.params && typeof req.params === 'object' ? req.params : {}
      const platform = typeof params.platform === 'string' ? params.platform : ''
      const signers = Array.isArray(params.signers) ? params.signers : []
      try {
        await this.#handlers.onTrustedSignersReceived?.({ platform, signers })
      } catch (err) {
        return this.#reply(event.pubkey, req.id, null, err?.message || 'register_trusted_signers failed')
      }
      await this.#reply(event.pubkey, req.id, 'ack', null)
      this.#trustExchangeReceived = true
      this.#trustExchangeResolve?.()
      this.#trustExchangeResolve = null
      this.#trustExchangeReject = null
      return
    }

    // Per spec: any single-account NIP-46 method (sign_event, nip04_*,
    // nip44_*, get_public_key, get_relays, ...) is meaningless on a pairing
    // channel. Reply with an explicit error so the target sees why instead
    // of timing out.
    if (req.id != null) {
      this.#reply(event.pubkey, req.id, null, 'method not supported on nostrpair channel')
    }
  }

  // Caller passes in the user-typed code AND the envelope to send. The
  // envelope is `{ platform, accounts }` where `accounts` is the per-account
  // tuple list produced by `buildExportPayload`. Returns true on a code
  // match (and the envelope gets delivered), false on mismatch (the channel
  // stays open so the user can try again). The session does NOT close
  // here — it stays alive for the target's follow-up `register_trusted_signers`
  // request, which the source acks on; the caller closes the session after
  // that round-trip.
  async confirmImport (typedCode, envelope) {
    if (!this.#pendingImport || !this.#clientPubkey) return false
    const { id, code } = this.#pendingImport
    if (typedCode !== code) {
      // Don't reveal the correct code by replying; let the caller flash an
      // error and keep the pending request alive for a retry.
      return false
    }
    await this.#reply(this.#clientPubkey, id, JSON.stringify(envelope), null)
    this.#pendingImport = null
    return true
  }

  // Active cancel: if the target is waiting on import_accounts, send the
  // empty-envelope+error reply documented in the spec so the target stops
  // waiting and surfaces the cancellation cleanly. Then tear down.
  async cancel () {
    if (this.#pendingImport && this.#clientPubkey) {
      const { id } = this.#pendingImport
      this.#pendingImport = null
      try {
        await this.#reply(this.#clientPubkey, id, JSON.stringify({ platform: '', accounts: [] }), 'cancelled by source')
      } catch { /* noop — we're closing anyway */ }
    }
    this.close()
  }

  // Resolves once the target has sent `register_trusted_signers` and we've
  // acked it. Race-safe: if the RPC already arrived before the caller
  // awaits, the returned promise resolves immediately; otherwise it
  // resolves when the inbound handler does. Single-awaiter — a second
  // call to this method abandons the prior promise (we don't need
  // fan-out and the usage site is exactly one caller). `close()` rejects
  // any pending wait with `IMPORT_CANCELLED`.
  awaitTrustedSignerExchange () {
    if (this.#trustExchangeReceived) return Promise.resolve()
    return new Promise((resolve, reject) => {
      this.#trustExchangeResolve = resolve
      this.#trustExchangeReject = reject
    })
  }

  close () {
    if (this.#closed) return
    this.#closed = true
    clearTimeout(this.#connectTimer)
    this.#connectTimer = null
    try { this.#sub?.close() } catch { /* noop */ }
    this.#sub = null
    this.#trustExchangeReject?.(new Error('IMPORT_CANCELLED'))
    this.#trustExchangeResolve = null
    this.#trustExchangeReject = null
  }

  #reply (toPubkey, id, result, error) {
    if (this.#closed) return
    return publishFrame({
      seckey: this.#ephSecretKey,
      toPubkey,
      payload: { id, result, error },
      relay: this.#relay
    })
  }
}

// Target-side session: scan the URL, generate our own ephemeral client key,
// connect to the source's relay, send `connect` then `import_accounts`, and
// surface the pairing code so the user can read it on this device and type it
// on the source. Resolves with the array of {nsec|npub|bunker://} strings the
// source replied with; rejects on cancel / error / timeout.
export class ImportSession {
  #ephSecretKey
  #ephPubkey
  #remotePubkey
  #relay
  #secret
  #handlers
  #sub = null
  #pending = new Map()
  #closed = false

  constructor (url, { onPairingCode, onConnected, onError } = {}) {
    const parsed = parseNostrpairInput(url)
    this.#remotePubkey = parsed.pubkey
    this.#relay = parsed.relay
    this.#secret = parsed.secret
    this.#ephSecretKey = generateSecretKey()
    this.#ephPubkey = getPublicKey(this.#ephSecretKey)
    this.#handlers = { onPairingCode, onConnected, onError }
  }

  async run () {
    this.#startSubscription()
    await this.#request('connect', [this.#remotePubkey, this.#secret], { timeoutMs: CONNECT_TIMEOUT_MS })
    this.#handlers.onConnected?.()

    // Surface the pairing code as soon as we have both keys — no need to wait
    // for the source's reply to import_accounts. The user can already start
    // walking it over to the other device.
    const code = await derivePairingCode(this.#ephSecretKey, this.#remotePubkey)
    this.#handlers.onPairingCode?.(code)

    // No timeout on import_accounts: this resolves only after the source user
    // types the matching code, which is bounded by human attention, not by
    // protocol timing. close() / cancel() rejects the pending promise so the
    // caller can still drop out cleanly.
    const resultJson = await this.#request('import_accounts', [])
    let parsed
    try { parsed = JSON.parse(resultJson) } catch { throw new Error('IMPORT_BAD_RESPONSE') }
    // Envelope shape: { platform, accounts: [[bareKey], [bareKey, signerPubkey], ...] }.
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.accounts)) {
      throw new Error('IMPORT_BAD_RESPONSE')
    }
    return { platform: typeof parsed.platform === 'string' ? parsed.platform : '', accounts: parsed.accounts }
  }

  // Round-trip for the trusted-signer exchange that follows import_accounts.
  // Caller passes `{ platform, signers }` — our platform label + the
  // [{accountPubkey, signerPubkey}, ...] list — and we wait for the source's
  // 'ack' before resolving. Source rejects via reply.error if it couldn't
  // store; we surface that as a rejected promise.
  async registerTrustedSigners (params) {
    const result = await this.#request('register_trusted_signers', params)
    if (result !== 'ack') throw new Error('REGISTER_TRUSTED_SIGNERS_FAILED')
    return result
  }

  close () {
    if (this.#closed) return
    this.#closed = true
    try { this.#sub?.close() } catch { /* noop */ }
    this.#sub = null
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer)
      reject(new Error('IMPORT_CANCELLED'))
    }
    this.#pending.clear()
  }

  #startSubscription () {
    const since = Math.floor(Date.now() / 1000) - 5
    this.#sub = pool.subscribeMany(
      [this.#relay],
      { kinds: [NIP46_KIND], '#p': [this.#ephPubkey], authors: [this.#remotePubkey], since },
      { onevent: (e) => this.#onEvent(e) }
    )
  }

  #onEvent (event) {
    if (this.#closed) return
    if (event.pubkey !== this.#remotePubkey) return
    const reply = tryDecodeFrame(event, this.#ephSecretKey)
    if (!reply || reply.id == null) return
    const pending = this.#pending.get(reply.id)
    if (!pending) return
    this.#pending.delete(reply.id)
    clearTimeout(pending.timer)
    if (reply.error) {
      pending.reject(new Error(typeof reply.error === 'string' ? reply.error : 'IMPORT_REJECTED'))
      return
    }
    pending.resolve(reply.result)
  }

  #request (method, params, { timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const id = randomHex(8)
      const timer = timeoutMs
        ? setTimeout(() => {
          if (this.#pending.delete(id)) reject(new Error('IMPORT_TIMEOUT'))
        }, timeoutMs)
        : null
      this.#pending.set(id, { resolve, reject, timer })
      publishFrame({
        seckey: this.#ephSecretKey,
        toPubkey: this.#remotePubkey,
        payload: { id, method, params },
        relay: this.#relay
      }).catch(err => {
        if (this.#pending.delete(id)) {
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }
}

// Build the array of strings the source returns from `import_accounts`. Each
// entry is one of: nsec1... (hex secret converted to bech32), npub1... (read-
// only), or bunker://...#client_key=... where the URL fragment carries the
// per-account persistent client key. The fragment is local-only — the bunker
// itself never sees it because relays don't transmit URL fragments — so it's
// just a convenient way to pack two values into one string.
//
// `secretEntries` is the snapshot returned by `passkey.openSecrets()` — the
// caller has just performed a fresh passkey reauth to obtain the raw key
// material. Threading it in explicitly keeps the secret-extraction call
// site visible at the export boundary.
//
// Each account becomes a tuple in the returned array:
//   - npub:        [bareKey]
//   - nsec/bunker: [bareKey, signerPubkey]
// The `signerPubkey` is the source device's per-account signer pubkey,
// looked up via `getSignerPubkey(accountPubkey)`. It travels with the
// secret material so the target can store it as a trusted signer in the
// same atomic commit it stores the account itself.
export function buildExportPayload (accounts, secretEntries, { nsecFromHex, npubFromPubkey, getSignerPubkey }) {
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
      const signerPubkey = getSignerPubkey?.(acc.pubkey)
      out.push(signerPubkey ? [nsecFromHex(seckey), signerPubkey] : [nsecFromHex(seckey)])
    } else if (acc.type === 'npub') {
      out.push([npubFromPubkey(acc.pubkey)])
    } else if (acc.type === 'bunker') {
      const clientKey = clientKeyByPubkey.get(acc.pubkey)
      if (!clientKey) continue
      const bareKey = buildBunkerUrlWithClientKey(acc.bunker, clientKey)
      const signerPubkey = getSignerPubkey?.(acc.pubkey)
      out.push(signerPubkey ? [bareKey, signerPubkey] : [bareKey])
    }
  }
  return out
}
