import { getPublicKey, finalizeEvent, nip04, nip44 } from 'nostr-tools'
import { bytesToHex, hexToBytes } from '../helpers/nostr/index.js'
import { deriveSharedKey } from '../helpers/crypto.js'
import { deriveDoubleDhConversationKey } from '../helpers/nostr/double-dh.js'
import * as nip44v3 from './nip44-v3.js'
import {
  fetchRelayListEvent,
  parseRelayListEvent,
  freeRelays
} from './relays.js'

// Capture stable references up front so post-load monkey-patching of the
// nostr-tools module (e.g. a malicious dependency swap) can't redirect our
// signing / crypto calls.
const nip44GetConversationKey = nip44.getConversationKey.bind(nip44)
const nip44Encrypt = nip44.encrypt.bind(nip44)
const nip44Decrypt = nip44.decrypt.bind(nip44)
const nip04Encrypt = nip04.encrypt.bind(nip04)
const nip04Decrypt = nip04.decrypt.bind(nip04)

// Keep raw secret-key bytes off the instance itself so signer.leak = () => this.#secretKey
// and similar prototype-poking tricks can't reach the key.
const secretKeys = new WeakMap()
const createToken = Symbol('createToken')

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
    this.#sharedSignerPromise ??= (async () => {
      const sharedSecretKey = await deriveSharedKey(secretKeys.get(this.#signer), this.#peerPubkey, this.#info)
      return NsecSigner.getOrCreate(bytesToHex(sharedSecretKey))
    })()
    return this.#sharedSignerPromise
  }

  async getPublicKey () { return (await this.#sharedSigner()).getPublicKey() }
  async signEvent (event) { return (await this.#sharedSigner()).signEvent(event) }
  async nip04Encrypt (peerPubkey, plaintext) { return (await this.#sharedSigner()).nip04Encrypt(peerPubkey, plaintext) }
  async nip04Decrypt (peerPubkey, ciphertext) { return (await this.#sharedSigner()).nip04Decrypt(peerPubkey, ciphertext) }
  async nip44Encrypt (peerPubkey, plaintext) { return (await this.#sharedSigner()).nip44Encrypt(peerPubkey, plaintext) }
  async nip44Decrypt (peerPubkey, ciphertext) { return (await this.#sharedSigner()).nip44Decrypt(peerPubkey, ciphertext) }
  async nip44v3Encrypt (peerPubkey, kind, scope, plaintextB64) { return (await this.#sharedSigner()).nip44v3Encrypt(peerPubkey, kind, scope, plaintextB64) }
  async nip44v3Decrypt (peerPubkey, kind, scope, ciphertext) { return (await this.#sharedSigner()).nip44v3Decrypt(peerPubkey, kind, scope, ciphertext) }
  async nip44EncryptDoubleDH (...params) { return (await this.#sharedSigner()).nip44EncryptDoubleDH(...params) }
  async nip44DecryptDoubleDH (...params) { return (await this.#sharedSigner()).nip44DecryptDoubleDH(...params) }
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
    signer.#cleanup()
    delete this.#signersByPubkey[pubkey]
  }

  static releaseAll () {
    for (const pubkey of Object.keys(this.#signersByPubkey)) this.release(pubkey)
  }

  static setContentSigners (ownerSigner, contentSigners = []) {
    if (!secretKeys.has(ownerSigner)) throw new Error('OWNER_SIGNER_UNSUPPORTED')
    const signers = new Map()
    for (const signer of contentSigners || []) {
      if (!secretKeys.has(signer)) throw new Error('CONTENT_SIGNER_UNSUPPORTED')
      signers.set(signer.getPublicKey(), signer)
    }
    if (signers.size) this.#contentSignersByOwnerSigner.set(ownerSigner, signers)
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
    return nip44v3.nip07Encrypt(this.#secretKey, peerPubkey, kind, scope, plaintextB64)
  }

  nip44v3Decrypt (peerPubkey, kind, scope, ciphertext) {
    return nip44v3.nip07Decrypt(this.#secretKey, peerPubkey, kind, scope, ciphertext)
  }

  async #contentKeyMaterial (contentSigner, requestedContentPubkey = '') {
    if (!contentSigner && requestedContentPubkey) {
      contentSigner = NsecSigner.#contentSignersByOwnerSigner.get(this)?.get(requestedContentPubkey) || null
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
    const signers = NsecSigner.#contentSignersByOwnerSigner.get(this)
    const contentSigner = signers?.size ? [...signers.values()].at(-1) : null
    return this.#contentKeyMaterial(contentSigner)
  }

  async nip44EncryptDoubleDH (peerPubkey, kind, scope = '', plaintextB64, peerContentPubkey = '') {
    const normalizedKind = nip44v3.normalizeKind(kind)
    const { contentPubkey, contentSecretKey } = await this.#latestContentKeyMaterial()
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
        nip44v3.b64decode(plaintextB64)
      )
      : nip44v3.nip07Encrypt(this.#secretKey, peerPubkey, normalizedKind, scope, plaintextB64)
    return [ciphertext, contentPubkey]
  }

  async nip44DecryptDoubleDH (peerPubkey, kind, scope = '', ciphertext, peerContentPubkey = '', ownContentPubkey = '') {
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
      ? nip44v3.b64encode(nip44v3.decryptWithConversationKeyBytes(
        conversationKey,
        normalizedKind,
        nip44v3.toBytes(scope || ''),
        ciphertext
      ))
      : nip44v3.nip07Decrypt(this.#secretKey, peerPubkey, normalizedKind, scope, ciphertext)
  }

  withSharedKey (peerPubkey, info) {
    return new SharedKeySigner(this, peerPubkey, info)
  }
}

// Prevent prototype/constructor tampering and method injection.
Object.freeze(SharedKeySigner.prototype)
Object.freeze(NsecSigner.prototype)
Object.freeze(NsecSigner)
