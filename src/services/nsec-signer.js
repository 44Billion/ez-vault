import { recordCryptoPerformance } from './crypto-performance.js'
import { finalizeEvent } from 'libp2r2p/event'
import { getPublicKey } from 'libp2r2p/key'
import * as nip04 from 'libp2r2p/nip04'
import * as nip44 from 'libp2r2p/nip44'
import { extract as hkdfExtract } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { bytesToHex, hexToBytes } from 'libp2r2p/base16'
import { deriveSharedKey } from '../helpers/crypto.js'
import { sharedXOnlySecret } from 'libp2r2p/ecdh'
import { deriveDoubleDhConversationKey } from 'libp2r2p/double-dh'
import * as nip44v3 from 'libp2r2p/nip44-v3'
import {
  fetchRelayListEvent,
  parseRelayListEvent,
  freeRelays
} from './relay.js'

// Capture stable references up front so post-load monkey-patching can't
// redirect our signing or cryptographic calls.
const nip44GetConversationKey = nip44.getConversationKey.bind(nip44)
const nip44Encrypt = nip44.encrypt.bind(nip44)
const nip44Decrypt = nip44.decrypt.bind(nip44)
const nip04Encrypt = nip04.encrypt.bind(nip04)
const nip04Decrypt = nip04.decrypt.bind(nip04)
const v3Encrypt = nip44v3.encryptWithConversationKeyBytes
const v3Decrypt = nip44v3.decryptWithConversationKeyBytes
const deriveV3Key = sharedXOnlySecret
const zeroBytes = Function.prototype.call.bind(Uint8Array.prototype.fill)
const copyBytes = Function.prototype.call.bind(Uint8Array.prototype.slice)
const OBFUSCATE_SALT = utf8ToBytes('nostr-obfuscate-v1')

// Keep raw secret-key bytes off the instance itself so signer.leak = () => this.#secretKey
// and similar prototype-poking tricks can't reach the key.
const secretKeys = new WeakMap()
const createToken = Symbol('createToken')

// These buffers never leave this module. One realm-wide LRU/timer also bounds
// derived signers; ordinary NIP44 has a different derivation and cache.
const v3Keys = new Map()
const revokedSigners = new WeakSet()
let v3Timer
let signerGeneration = 0
let cacheAvailable = true
function discardV3Key (key) {
  const record = v3Keys.get(key)
  if (!record) return
  zeroBytes(record.bytes, 0)
  v3Keys.delete(key)
}
function scheduleV3Expiry () {
  clearTimeout(v3Timer)
  v3Timer = undefined
  if (!v3Keys.size) return
  const next = Math.min(...[...v3Keys.values()].map(record => record.usedAt + 60000))
  v3Timer = setTimeout(() => {
    const now = performance.now()
    const wallNow = Date.now()
    for (const [key, record] of v3Keys) if (now - record.usedAt >= 60000 || wallNow - record.wallAt >= 60000) discardV3Key(key)
    scheduleV3Expiry()
  }, Math.max(1, next - performance.now()))
  v3Timer?.unref?.()
}
function conversationKeyV3 (signer, peer, diagnostics) {
  if (!cacheAvailable || revokedSigners.has(signer)) throw new Error('SIGNER_RELEASED')
  const now = performance.now()
  const wallNow = Date.now()
  for (const [key, record] of v3Keys) if (now - record.usedAt >= 60000 || wallNow - record.wallAt >= 60000) discardV3Key(key)
  let record = [...v3Keys.values()].find(record => record.signer === signer && record.peer === peer)
  const hit = Boolean(record)
  if (record) v3Keys.delete(record)
  else record = { signer, peer, bytes: deriveV3Key(secretKeys.get(signer), peer) }
  record.usedAt = now
  record.wallAt = wallNow
  v3Keys.set(record, record)
  const own = [...v3Keys.values()].filter(record => record.signer === signer)
  while (own.length > 32) discardV3Key(own.shift())
  while (v3Keys.size > 128) discardV3Key(v3Keys.keys().next().value)
  scheduleV3Expiry()
  const key = copyBytes(record.bytes)
  try {
    recordCryptoPerformance({ ...diagnostics, stage: 'nip44v3-cache', cacheHit: hit, count: v3Keys.size })
    if (!cacheAvailable || revokedSigners.has(signer)) throw new Error('SIGNER_RELEASED')
    return key
  } catch (error) { zeroBytes(key, 0); throw error }
}
function clearV3Keys () {
  // Conservative realm-wide purge also covers derived identities, without a
  // second ownership registry retaining references to retired secret signers.
  for (const key of v3Keys.keys()) discardV3Key(key)
  scheduleV3Expiry()
}

globalThis.addEventListener?.('pagehide', () => {
  cacheAvailable = false
  signerGeneration++
  clearV3Keys()
})
globalThis.addEventListener?.('pageshow', () => { cacheAvailable = true })

class SharedKeySigner {
  #signer
  #peerPubkey
  #info
  #sharedSignerPromise = null

  constructor (signer, peerPubkey, info = '') {
    this.#signer = signer
    this.#peerPubkey = peerPubkey
    this.#info = info
    Object.preventExtensions(this)
  }

  async #sharedSigner () {
    if (!cacheAvailable || revokedSigners.has(this.#signer)) throw new Error('SIGNER_RELEASED')
    this.#sharedSignerPromise ??= (async () => {
      const generation = signerGeneration
      if (!cacheAvailable || revokedSigners.has(this.#signer)) throw new Error('SIGNER_RELEASED')
      const sharedSecretKey = await deriveSharedKey(secretKeys.get(this.#signer), this.#peerPubkey, this.#info)
      try {
        if (!cacheAvailable || generation !== signerGeneration || revokedSigners.has(this.#signer)) throw new Error('SIGNER_RELEASED')
        const child = NsecSigner.getOrCreate(bytesToHex(sharedSecretKey))
        return child
      } finally { zeroBytes(sharedSecretKey, 0) }
    })().catch(error => { this.#sharedSignerPromise = null; throw error })
    return this.#sharedSignerPromise
  }

  async #v3 (method, params) {
    const generation = signerGeneration
    const signer = await this.#sharedSigner()
    if (!cacheAvailable || generation !== signerGeneration || revokedSigners.has(this.#signer)) throw new Error('SIGNER_RELEASED')
    // No await between revocation check and the synchronous cached primitive.
    return signer[method](...params)
  }

  async getPublicKey () { return (await this.#sharedSigner()).getPublicKey() }
  async signEvent (event) { return (await this.#sharedSigner()).signEvent(event) }
  async nip04Encrypt (peerPubkey, plaintext) { return (await this.#sharedSigner()).nip04Encrypt(peerPubkey, plaintext) }
  async nip04Decrypt (peerPubkey, ciphertext) { return (await this.#sharedSigner()).nip04Decrypt(peerPubkey, ciphertext) }
  async nip44Encrypt (peerPubkey, plaintext) { return (await this.#sharedSigner()).nip44Encrypt(peerPubkey, plaintext) }
  async nip44Decrypt (peerPubkey, ciphertext) { return (await this.#sharedSigner()).nip44Decrypt(peerPubkey, ciphertext) }
  async nip44v3Encrypt (peerPubkey, kind, scope, plaintextB64) { return this.#v3('nip44v3Encrypt', [peerPubkey, kind, scope, plaintextB64]) }
  async nip44v3Decrypt (peerPubkey, kind, scope, ciphertext) { return this.#v3('nip44v3Decrypt', [peerPubkey, kind, scope, ciphertext]) }
  async nip44v3EncryptBytes (...params) { return this.#v3('nip44v3EncryptBytes', params) }
  async nip44v3DecryptBytes (...params) { return this.#v3('nip44v3DecryptBytes', params) }
  async obfuscate (value, kind, scope) { return this.#signer.obfuscate(value, kind, scope) }
  async nip44EncryptDoubleDH (...params) { return (await this.#sharedSigner()).nip44EncryptDoubleDH(...params) }
  async nip44DecryptDoubleDH (...params) { return (await this.#sharedSigner()).nip44DecryptDoubleDH(...params) }
  async nip44EncryptDoubleDHBytes (...params) { return (await this.#sharedSigner()).nip44EncryptDoubleDHBytes(...params) }
  async nip44DecryptDoubleDHBytes (...params) { return (await this.#sharedSigner()).nip44DecryptDoubleDHBytes(...params) }
  withSharedKey (peerPubkey, info = this.#info) { return new SharedKeySigner(this.#signer, peerPubkey, info) }
}

export default class NsecSigner {
  static #signersByPubkey = {}
  static #contentSignersByOwnerSigner = new WeakMap()
  #pubkey
  #conversationKeyGcTimeout
  #conversationKeys = {}

  // Pubkeys with a live in-memory signer. Useful later for the messenger's
  // "is this account ready to sign?" probe.
  static get activePubkeys () {
    return Object.keys(this.#signersByPubkey)
  }

  // Memoize per pubkey so repeated calls from different callers share caches.
  static getOrCreate (seckey) {
    if (!seckey) throw new Error('MISSING_SECKEY')
    const pubkey = getPublicKey(hexToBytes(seckey))
    if (revokedSigners.has(this.#signersByPubkey[pubkey])) delete this.#signersByPubkey[pubkey]
    return (this.#signersByPubkey[pubkey] ??= new this(createToken, seckey, pubkey))
  }

  constructor (token, seckey, pubkey) {
    if (token !== createToken) throw new Error('USE_GET_OR_CREATE')
    secretKeys.set(this, hexToBytes(seckey))
    this.#pubkey = pubkey
    Object.preventExtensions(this)
    this.#scheduleConversationKeyGc()
  }

  get #secretKey () { return secretKeys.get(this) }

  static release (pubkey) {
    const signer = this.#signersByPubkey[pubkey]
    if (!signer) return
    revokedSigners.add(signer)
    clearV3Keys()
    signer.#cleanup()
    delete this.#signersByPubkey[pubkey]
  }

  static releaseAll () {
    for (const pubkey of Object.keys(this.#signersByPubkey)) this.release(pubkey)
  }

  static setContentSigners (ownerSigner, contentSigners = [], activeSigner = null) {
    if (!secretKeys.has(ownerSigner)) throw new Error('OWNER_SIGNER_UNSUPPORTED')
    const signers = new Map()
    for (const signer of contentSigners || []) {
      if (!secretKeys.has(signer)) throw new Error('CONTENT_SIGNER_UNSUPPORTED')
      signers.set(signer.getPublicKey(), signer)
    }
    if (activeSigner && signers.get(activeSigner.getPublicKey()) !== activeSigner) throw new Error('ACTIVE_CONTENT_SIGNER_UNSUPPORTED')
    if (signers.size) this.#contentSignersByOwnerSigner.set(ownerSigner, { signers, activeSigner })
    else this.#contentSignersByOwnerSigner.delete(ownerSigner)
  }

  #cleanup () {
    this.#conversationKeys = {}
    clearTimeout(this.#conversationKeyGcTimeout)
  }

  getPublicKey () {
    return this.#pubkey
  }

  signEvent (event) {
    return finalizeEvent(event, this.#secretKey)
  }

  // NIP-07 shape: { read: [], write: [] }. Falls back to the first two
  // freeRelays when the user has no published kind:10002.
  async getRelays () {
    const event = await fetchRelayListEvent(this.#pubkey)
    const { read, write } = parseRelayListEvent(event)
    if (!read.length && !write.length) {
      const fallback = freeRelays.slice(0, 2)
      return { read: fallback, write: fallback }
    }
    return { read, write }
  }

  nip04Encrypt (peerPubkey, plaintext) {
    return nip04Encrypt(this.#secretKey, peerPubkey, plaintext)
  }

  nip04Decrypt (peerPubkey, ciphertext) {
    return nip04Decrypt(this.#secretKey, peerPubkey, ciphertext)
  }

  // Bounded LRU-ish cap on cached conversation keys. Each key is a 32-byte
  // HKDF output, so the absolute memory cost is small — the cap is mostly to
  // keep the cache from growing without bound for long-lived signers.
  #scheduleConversationKeyGc () {
    this.#conversationKeyGcTimeout = setTimeout(() => {
      Object.keys(this.#conversationKeys).reverse().slice(10)
        .forEach(v => delete this.#conversationKeys[v])
      this.#scheduleConversationKeyGc()
    }, 60000)
    this.#conversationKeyGcTimeout?.unref?.()
  }

  nip44Encrypt (peerPubkey, plaintext) {
    const ck = this.#conversationKeys[peerPubkey] ??=
      nip44GetConversationKey(this.#secretKey, peerPubkey)
    return nip44Encrypt(plaintext, ck)
  }

  nip44Decrypt (peerPubkey, ciphertext) {
    const ck = this.#conversationKeys[peerPubkey] ??=
      nip44GetConversationKey(this.#secretKey, peerPubkey)
    return nip44Decrypt(ciphertext, ck)
  }

  nip44v3Encrypt (peerPubkey, kind, scope, plaintextB64) {
    return this.nip44v3EncryptBytes(peerPubkey, kind, scope, nip44v3.b64decode(plaintextB64))
  }

  nip44v3Decrypt (peerPubkey, kind, scope, ciphertext) {
    return nip44v3.b64encode(this.nip44v3DecryptBytes(peerPubkey, kind, scope, ciphertext))
  }

  // Local app requests use bytes directly. The Base64 methods above serve
  // the existing private-channel/private-messenger signer contract.
  nip44v3EncryptBytes (peerPubkey, kind, scope, plaintextBytes, diagnostics) {
    const key = conversationKeyV3(this, peerPubkey, diagnostics)
    try { return v3Encrypt(key, kind, nip44v3.toBytes(scope || ''), plaintextBytes) } finally { zeroBytes(key, 0) }
  }

  nip44v3DecryptBytes (peerPubkey, kind, scope, ciphertext, diagnostics) {
    const key = conversationKeyV3(this, peerPubkey, diagnostics)
    try { return v3Decrypt(key, kind, nip44v3.toBytes(scope || ''), ciphertext) } finally { zeroBytes(key, 0) }
  }

  obfuscate (value, kind, scope) {
    if (typeof value !== 'string') throw new Error('INVALID_OBFUSCATE_VALUE')
    if (typeof scope !== 'string') throw new Error('INVALID_OBFUSCATE_SCOPE')
    const normalizedKind = nip44v3.normalizeKind(kind)
    const key = hkdfExtract(sha256, this.#secretKey, OBFUSCATE_SALT)
    return bytesToHex(hmac(sha256, key, frameObfuscateMessage({ value, kind: normalizedKind, scope })))
  }

  async #contentKeyMaterial (contentSigner, requestedContentPubkey = '') {
    if (!contentSigner && requestedContentPubkey) {
      contentSigner = NsecSigner.#contentSignersByOwnerSigner.get(this)?.signers.get(requestedContentPubkey) || null
    }
    if (!contentSigner) return { contentPubkey: requestedContentPubkey || '', contentSecretKey: null }
    if (!secretKeys.has(contentSigner)) throw new Error('CONTENT_SIGNER_UNSUPPORTED')
    const contentPubkey = await contentSigner.getPublicKey()
    if (requestedContentPubkey && requestedContentPubkey !== contentPubkey) throw new Error('CONTENT_SIGNER_MISMATCH')
    return {
      contentPubkey,
      contentSecretKey: secretKeys.get(contentSigner)
    }
  }

  async #latestContentKeyMaterial () {
    const contentSigner = NsecSigner.#contentSignersByOwnerSigner.get(this)?.activeSigner
    return this.#contentKeyMaterial(contentSigner)
  }

  async nip44EncryptDoubleDH (peerPubkey, kind, scope = '', plaintextB64, peerContentPubkey = '') {
    return this.nip44EncryptDoubleDHBytes(peerPubkey, kind, scope, nip44v3.b64decode(plaintextB64), peerContentPubkey)
  }

  async nip44EncryptDoubleDHBytes (peerPubkey, kind, scope = '', plaintextBytes, peerContentPubkey = '', contentSigner = undefined) {
    const normalizedKind = nip44v3.normalizeKind(kind)
    // Local dispatch pins the signer selected before asynchronous relay work.
    // Private-messenger callers omit it and use the centrally bound active key.
    const { contentPubkey, contentSecretKey } = await (contentSigner === undefined
      ? this.#latestContentKeyMaterial()
      : this.#contentKeyMaterial(contentSigner))
    const { conversationKey } = deriveDoubleDhConversationKey({
      role: 'sender',
      identitySecretKey: this.#secretKey,
      identityPubkey: this.#pubkey,
      contentSecretKey,
      contentPubkey,
      peerIdentityPubkey: peerPubkey,
      peerContentPubkey,
      kind: normalizedKind,
      scope
    })
    const ciphertext = conversationKey
      ? nip44v3.encryptWithConversationKeyBytes(
        conversationKey,
        normalizedKind,
        nip44v3.toBytes(scope || ''),
        plaintextBytes
      )
      : this.nip44v3EncryptBytes(peerPubkey, normalizedKind, scope, plaintextBytes)
    return [ciphertext, contentPubkey]
  }

  async nip44DecryptDoubleDH (peerPubkey, kind, scope = '', ciphertext, peerContentPubkey = '', ownContentPubkey = '') {
    return nip44v3.b64encode(await this.nip44DecryptDoubleDHBytes(peerPubkey, kind, scope, ciphertext, peerContentPubkey, ownContentPubkey))
  }

  async nip44DecryptDoubleDHBytes (peerPubkey, kind, scope = '', ciphertext, peerContentPubkey = '', ownContentPubkey = '') {
    const normalizedKind = nip44v3.normalizeKind(kind)
    const { contentPubkey, contentSecretKey } = await this.#contentKeyMaterial(null, ownContentPubkey)
    const { conversationKey } = deriveDoubleDhConversationKey({
      role: 'receiver',
      identitySecretKey: this.#secretKey,
      identityPubkey: this.#pubkey,
      contentSecretKey,
      contentPubkey,
      peerIdentityPubkey: peerPubkey,
      peerContentPubkey,
      kind: normalizedKind,
      scope
    })
    return conversationKey
      ? nip44v3.decryptWithConversationKeyBytes(
        conversationKey,
        normalizedKind,
        nip44v3.toBytes(scope || ''),
        ciphertext
      )
      : this.nip44v3DecryptBytes(peerPubkey, normalizedKind, scope, ciphertext)
  }

  withSharedKey (peerPubkey, info) {
    return new SharedKeySigner(this, peerPubkey, info)
  }
}

function u32be (n) {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, n >>> 0, false)
  return bytes
}

function frameObfuscateMessage ({ value, kind, scope }) {
  const scopeBytes = utf8ToBytes(scope)
  const valueBytes = utf8ToBytes(value)
  // Fixed-width kind, length-prefixed scope,
  // then the final value bytes. The final field needs no length prefix because
  // all remaining bytes belong to it; future shapes should use a new salt label.
  return concatBytes(
    u32be(kind),
    u32be(scopeBytes.length),
    scopeBytes,
    valueBytes
  )
}

// Prevent prototype/constructor tampering and method injection.
Object.freeze(SharedKeySigner.prototype)
Object.freeze(NsecSigner.prototype)
Object.freeze(NsecSigner)
