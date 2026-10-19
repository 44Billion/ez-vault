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
import { ValidationError } from 'libp2r2p/error'
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
const deriveDoubleDhKey = deriveDoubleDhConversationKey
const zeroBytes = Function.prototype.call.bind(Uint8Array.prototype.fill)
const copyBytes = Function.prototype.call.bind(Uint8Array.prototype.slice)
const OBFUSCATE_SALT = utf8ToBytes('nostr-obfuscate-v1')

// Keep raw secret-key bytes off the instance itself so signer.leak = () => this.#secretKey
// and similar prototype-poking tricks can't reach the key.
const secretKeys = new WeakMap()
const createToken = Symbol('createToken')

// These buffers never leave this module. One realm-wide LRU/timer also bounds
// derived signers; ordinary NIP44 has a different derivation and cache.
const cachedKeys = new Map()
const revokedSigners = new WeakSet()
let keyTimer
let signerGeneration = 0
let cacheAvailable = true
function discardConversationKey (key) {
  const record = cachedKeys.get(key)
  if (!record) return
  zeroBytes(record.bytes, 0)
  cachedKeys.delete(key)
}
function scheduleKeyExpiry () {
  clearTimeout(keyTimer)
  keyTimer = undefined
  if (!cachedKeys.size) return
  const next = Math.min(...[...cachedKeys.values()].map(record => record.usedAt + 60000))
  keyTimer = setTimeout(() => {
    const now = performance.now()
    const wallNow = Date.now()
    for (const [key, record] of cachedKeys) if (now - record.usedAt >= 60000 || wallNow - record.wallAt >= 60000) discardConversationKey(key)
    scheduleKeyExpiry()
  }, Math.max(1, next - performance.now()))
  keyTimer?.unref?.()
}
function assertAvailable (generation, ...signers) {
  if (!cacheAvailable || generation !== signerGeneration || signers.some(signer => signer && revokedSigners.has(signer))) throw new Error('SIGNER_RELEASED')
}
function conversationKey (signer, protocol, context, derive, { diagnostics, check, cache = true } = {}) {
  const generation = signerGeneration
  check ??= () => assertAvailable(generation, signer)
  check()
  const now = performance.now()
  const wallNow = Date.now()
  for (const [key, record] of cachedKeys) if (now - record.usedAt >= 60000 || wallNow - record.wallAt >= 60000) discardConversationKey(key)
  let record = cache && [...cachedKeys.values()].find(record => record.signer === signer && record.protocol === protocol && record.context === context)
  const hit = Boolean(record)
  if (record) cachedKeys.delete(record)
  else {
    const bytes = derive()
    try { check() } catch (error) { if (bytes) zeroBytes(bytes, 0); throw error }
    if (!bytes) return null // Identity-only DoubleDH uses the common v3 cache.
    record = { signer, protocol, context, bytes }
  }
  record.usedAt = now
  record.wallAt = wallNow
  if (cache) {
    cachedKeys.set(record, record)
    const own = [...cachedKeys.values()].filter(record => record.signer === signer)
    while (own.length > 32) discardConversationKey(own.shift())
    while (cachedKeys.size > 128) discardConversationKey(cachedKeys.keys().next().value)
  }
  scheduleKeyExpiry()
  const key = copyBytes(record.bytes)
  if (!cache) zeroBytes(record.bytes, 0)
  try {
    recordCryptoPerformance({ ...diagnostics, stage: protocol === 'double-dh' ? 'double-dh-cache' : 'nip44v3-cache', cacheHit: hit, count: cachedKeys.size, durationMs: performance.now() - now })
    check()
    return key
  } catch (error) { zeroBytes(key, 0); throw error }
}
function conversationKeyV3 (signer, peer, diagnostics, check) {
  return conversationKey(signer, 'nip44v3', peer, () => deriveV3Key(secretKeys.get(signer), peer), { diagnostics, check })
}
let contentGeneration = 0
function clearDoubleDhKeys () {
  contentGeneration++
  for (const [key, record] of cachedKeys) if (record.protocol === 'double-dh') discardConversationKey(key)
  scheduleKeyExpiry()
}
function doubleDhConversationKey (signer, { role, identityPubkey, contentPubkey, contentSecretKey, contentSigner, peerIdentityPubkey, peerContentPubkey, kind, scope, ownerSigner, generation, selectedContentGeneration }) {
  const check = () => assertAvailable(generation, signer, ownerSigner, contentSigner)
  check()
  // Hits must preserve the derivation's argument checks and key-availability rules.
  if (!peerIdentityPubkey) throw new ValidationError('DOUBLE_DH_IDENTITY_REQUIRED')
  for (const pubkey of [peerIdentityPubkey, contentPubkey, peerContentPubkey]) {
    if (pubkey && (typeof pubkey !== 'string' || !/^[0-9a-f]{64}$/.test(pubkey))) throw new ValidationError('INVALID_PUBLIC_KEY')
  }
  if (typeof scope !== 'string') throw new ValidationError('INVALID_SCOPE')
  if (contentPubkey && !contentSecretKey) throw new ValidationError(role === 'sender' ? 'SENDER_CONTENT_KEY_REQUIRED' : 'RECEIVER_CONTENT_KEY_REQUIRED')
  // Validated pubkeys/kind cannot contain ':', and arbitrary scope is last.
  const context = `${role}:${contentPubkey || ''}:${peerIdentityPubkey}:${peerContentPubkey || ''}:${kind}:${scope}`
  return conversationKey(signer, 'double-dh', context, () => deriveDoubleDhKey({
    role, identitySecretKey: secretKeys.get(signer), identityPubkey, contentSecretKey,
    contentPubkey, peerIdentityPubkey, peerContentPubkey, kind, scope
  }).conversationKey, { check, cache: selectedContentGeneration === contentGeneration })
}

function clearConversationKeys () {
  // Conservative realm-wide purge also covers derived identities, without a
  // second ownership registry retaining references to retired secret signers.
  for (const key of cachedKeys.keys()) discardConversationKey(key)
  scheduleKeyExpiry()
}

globalThis.addEventListener?.('pagehide', () => {
  cacheAvailable = false
  signerGeneration++
  clearConversationKeys()
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
    // Common v3 runs synchronously; DoubleDH carries root authorization across
    // its own asynchronous content-key selection.
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
  async nip44EncryptDoubleDH (peer, kind, scope, plaintext, contentPubkey) { return this.nip44EncryptDoubleDHBytes(peer, kind, scope, nip44v3.b64decode(plaintext), contentPubkey) }
  async nip44DecryptDoubleDH (peer, kind, scope, ciphertext, contentPubkey, ownContentPubkey) { return nip44v3.b64encode(await this.nip44DecryptDoubleDHBytes(peer, kind, scope, ciphertext, contentPubkey, ownContentPubkey)) }
  async nip44EncryptDoubleDHBytes (peer, kind, scope, plaintext, contentPubkey, contentSigner) { return this.#v3('nip44EncryptDoubleDHBytes', [peer, kind, scope, plaintext, contentPubkey, contentSigner, this.#signer]) }
  async nip44DecryptDoubleDHBytes (peer, kind, scope, ciphertext, contentPubkey, ownContentPubkey) { return this.#v3('nip44DecryptDoubleDHBytes', [peer, kind, scope, ciphertext, contentPubkey, ownContentPubkey, this.#signer]) }
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
    clearConversationKeys()
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
    const previous = this.#contentSignersByOwnerSigner.get(ownerSigner)
    if ((previous?.activeSigner || null) !== activeSigner || (previous?.signers.size || 0) !== signers.size ||
        [...signers].some(([pubkey, signer]) => previous?.signers.get(pubkey) !== signer)) clearDoubleDhKeys()
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
    if (!contentSigner) return { contentPubkey: requestedContentPubkey || '', contentSecretKey: null, contentSigner: null }
    if (!secretKeys.has(contentSigner)) throw new Error('CONTENT_SIGNER_UNSUPPORTED')
    assertAvailable(signerGeneration, this, contentSigner)
    const contentPubkey = await contentSigner.getPublicKey()
    if (requestedContentPubkey && requestedContentPubkey !== contentPubkey) throw new Error('CONTENT_SIGNER_MISMATCH')
    return {
      contentPubkey,
      contentSecretKey: secretKeys.get(contentSigner),
      contentSigner
    }
  }

  async #latestContentKeyMaterial () {
    const contentSigner = NsecSigner.#contentSignersByOwnerSigner.get(this)?.activeSigner
    return this.#contentKeyMaterial(contentSigner)
  }

  async nip44EncryptDoubleDH (peerPubkey, kind, scope = '', plaintextB64, peerContentPubkey = '') {
    return this.nip44EncryptDoubleDHBytes(peerPubkey, kind, scope, nip44v3.b64decode(plaintextB64), peerContentPubkey)
  }

  // ownerSigner is private call context for derived signers, never a wire parameter.
  async nip44EncryptDoubleDHBytes (peerPubkey, kind, scope = '', plaintextBytes, peerContentPubkey = '', contentSigner = undefined, ownerSigner = this) {
    const generation = signerGeneration
    const selectedContentGeneration = contentGeneration
    assertAvailable(generation, this, ownerSigner)
    const normalizedKind = nip44v3.normalizeKind(kind)
    // Pin the selected key, including across a concurrent rotation.
    const material = await (contentSigner === undefined
      ? this.#latestContentKeyMaterial()
      : this.#contentKeyMaterial(contentSigner))
    const key = doubleDhConversationKey(this, {
      ...material, role: 'sender', identityPubkey: this.#pubkey, peerIdentityPubkey: peerPubkey,
      peerContentPubkey, kind: normalizedKind, scope, ownerSigner, generation, selectedContentGeneration
    }) ?? conversationKeyV3(this, peerPubkey, undefined, () => assertAvailable(generation, this, ownerSigner))
    try {
      const ciphertext = v3Encrypt(key, normalizedKind, nip44v3.toBytes(scope || ''), plaintextBytes)
      return [ciphertext, material.contentPubkey]
    } finally { zeroBytes(key, 0) }
  }

  async nip44DecryptDoubleDH (peerPubkey, kind, scope = '', ciphertext, peerContentPubkey = '', ownContentPubkey = '') {
    return nip44v3.b64encode(await this.nip44DecryptDoubleDHBytes(peerPubkey, kind, scope, ciphertext, peerContentPubkey, ownContentPubkey))
  }

  async nip44DecryptDoubleDHBytes (peerPubkey, kind, scope = '', ciphertext, peerContentPubkey = '', ownContentPubkey = '', ownerSigner = this) {
    const generation = signerGeneration
    const selectedContentGeneration = contentGeneration
    assertAvailable(generation, this, ownerSigner)
    const normalizedKind = nip44v3.normalizeKind(kind)
    const material = await this.#contentKeyMaterial(null, ownContentPubkey)
    const key = doubleDhConversationKey(this, {
      ...material, role: 'receiver', identityPubkey: this.#pubkey, peerIdentityPubkey: peerPubkey,
      peerContentPubkey, kind: normalizedKind, scope, ownerSigner, generation, selectedContentGeneration
    }) ?? conversationKeyV3(this, peerPubkey, undefined, () => assertAvailable(generation, this, ownerSigner))
    try {
      return v3Decrypt(key, normalizedKind, nip44v3.toBytes(scope || ''), ciphertext)
    } finally { zeroBytes(key, 0) }
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
