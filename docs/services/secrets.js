import { nip44, getPublicKey } from 'nostr-tools'
import NsecSigner from './nsec-signer.js'
import { BunkerHandle, persistHandleState } from './bunker.js'
import * as store from './accounts-store.js'
import { encodeSecretEntries, decodeSecretEntries } from './secret-blob.js'
import { DEFAULT_STALE_CHANNEL_SECONDS } from './private-messenger/constants.js'
import { bytesToBase64, base64ToBytes } from '../helpers/base64.js'
import { hexToBytes } from '../helpers/nostr/index.js'
import { deriveSignerSeckey } from '../helpers/signer-key.js'

// In-memory home for every account's secret material plus the deterministic
// vault key derived from the passkey PRF extension. Account secrets live in
// this module while the vault is unlocked, and are otherwise sealed into the
// passkey largeBlob by passkey.js.
//
// Encapsulation, mirroring the NsecSigner pattern in nsec-signer.js:
//
// - For nsec accounts the seckey is consumed by `NsecSigner.getOrCreate`,
//   which stashes the bytes in a private WeakMap keyed by the signer
//   instance. We hand callers back the signer — methods consume the seckey
//   internally and never return it.
// - For bunker accounts the clientKey is consumed by `BunkerHandle.create`,
//   which stashes the bytes in *its* private WeakMap. We pool the handle
//   here and hand callers back the handle — same shape as nsec.
// - The raw account hex strings are also kept in module-private Maps that
//   the sealing path (TLV encode → encrypt → write to passkey) reads.
//   Those maps are not exported. There is no `getSeckey` / `getClientKey` /
//   `exportEntries` surface — the export and copy-nsec flows reach the
//   raw bytes by going through `passkey.openSecrets()`, which prompts the
//   user for fresh verification and decrypts the largeBlob ad-hoc.
//
// The vault key doubles as a NIP-44 self-encryption key; messenger-log and
// content-key persistence use it to seal sensitive localStorage payloads
// while unlocked.

const CONTENT_KEYS_KEY = 'ez-vault:content-keys'
const HEX32 = /^[0-9a-f]{64}$/i

let vaultPrivkey = null
let vaultConversationKey = null

const nsecSignersByPubkey = new Map()
const bunkerHandlesByPubkey = new Map()
const accountTypeByPubkey = new Map()
const contentKeySignersByOwnerPubkey = new Map()

// Module-private raw stash used by `sealCurrentEntries` only — not exported.
// Both the seckey hex (for nsec) and the clientKey hex (for bunker) live
// here so we can re-emit the TLV blob whenever the secret set changes.
const rawNsecHexByPubkey = new Map()
const rawClientKeyHexByPubkey = new Map()
const rawContentKeyHexByOwnerPubkey = new Map()

// Single device-level signer seckey. Deterministically derived from the
// passkey PRF via HKDF — see helpers/signer-key.js. We persist the result
// in the same TLV blob (rather than re-deriving on every unlock) so it
// shares the encrypted-at-rest property of the nsec/bunker secrets and so
// the signer pubkey remains stable across any future change to the
// derivation function. The blob's NIP-44 envelope is keyed on the vault
// PRF, so a passkey re-create takes both the blob AND any chance of
// re-deriving the same signer key with it — recovery in that case means
// re-pairing devices.
let deviceSignerSeckey = null

const listeners = new Set()
const contentKeyListeners = new Set()

function notify () {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.warn('secrets listener threw', err) }
  }
}

function notifyContentKeys (ownerPubkey) {
  for (const fn of contentKeyListeners) {
    try { fn(ownerPubkey) } catch (err) { console.warn('content key listener threw', err) }
  }
}

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function dropPriorEntry (pubkey) {
  const t = accountTypeByPubkey.get(pubkey)
  if (!t) return false
  let contentKeysChanged = false
  if (t === 'nsec') {
    NsecSigner.release(pubkey)
    nsecSignersByPubkey.delete(pubkey)
    rawNsecHexByPubkey.delete(pubkey)
    contentKeysChanged = dropContentKeysForOwner(pubkey) || contentKeysChanged
  } else if (t === 'bunker') {
    const handle = bunkerHandlesByPubkey.get(pubkey)
    if (handle) handle.close()
    bunkerHandlesByPubkey.delete(pubkey)
    rawClientKeyHexByPubkey.delete(pubkey)
    contentKeysChanged = dropContentKeysForOwner(pubkey) || contentKeysChanged
  }
  accountTypeByPubkey.delete(pubkey)
  return contentKeysChanged
}

function dropContentKeysForOwner (ownerPubkey) {
  const signers = contentKeySignersByOwnerPubkey.get(ownerPubkey)
  const hadKeys = Boolean(signers?.size || rawContentKeyHexByOwnerPubkey.get(ownerPubkey)?.size)
  if (signers) {
    for (const pubkey of signers.keys()) NsecSigner.release(pubkey)
  }
  contentKeySignersByOwnerPubkey.delete(ownerPubkey)
  rawContentKeyHexByOwnerPubkey.delete(ownerPubkey)
  return hadKeys
}

function dropContentKey (ownerPubkey, contentPubkey) {
  const signers = contentKeySignersByOwnerPubkey.get(ownerPubkey)
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey)
  const hadKey = Boolean(signers?.has(contentPubkey) || raw?.has(contentPubkey))
  if (!hadKey) return false
  NsecSigner.release(contentPubkey)
  signers?.delete(contentPubkey)
  raw?.delete(contentPubkey)
  if (!signers?.size) contentKeySignersByOwnerPubkey.delete(ownerPubkey)
  if (!raw?.size) rawContentKeyHexByOwnerPubkey.delete(ownerPubkey)
  return true
}

function dropAllContentKeys () {
  for (const signers of contentKeySignersByOwnerPubkey.values()) {
    for (const pubkey of signers.keys()) NsecSigner.release(pubkey)
  }
  contentKeySignersByOwnerPubkey.clear()
  rawContentKeyHexByOwnerPubkey.clear()
}

function adoptNsec (pubkey, seckey) {
  const contentKeysChanged = dropPriorEntry(pubkey)
  rawNsecHexByPubkey.set(pubkey, seckey)
  // NsecSigner.getOrCreate sinks the bytes into its WeakMap-backed slot.
  nsecSignersByPubkey.set(pubkey, NsecSigner.getOrCreate(seckey))
  accountTypeByPubkey.set(pubkey, 'nsec')
  return contentKeysChanged
}

function isStaleContentKeyCreatedAt (createdAt, now = nowSeconds()) {
  return (createdAt || 0) <= now - DEFAULT_STALE_CHANNEL_SECONDS
}

function newestContentKeyPubkey (entries) {
  let best = null
  for (const [pubkey, entry] of entries) {
    if (!best || (entry.createdAt || 0) >= best.createdAt) {
      best = { pubkey, createdAt: entry.createdAt || 0 }
    }
  }
  return best?.pubkey || ''
}

function hasNewerContentKey (ownerPubkey, createdAt) {
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey)
  if (!raw?.size) return false
  for (const entry of raw.values()) {
    if ((entry.createdAt || 0) > createdAt) return true
  }
  return false
}

function shouldSkipContentKeyStorage (ownerPubkey, createdAt, now = nowSeconds()) {
  return isStaleContentKeyCreatedAt(createdAt, now) && hasNewerContentKey(ownerPubkey, createdAt)
}

function pruneStaleContentKeysForOwner (ownerPubkey, now = nowSeconds()) {
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey)
  if (!raw || raw.size <= 1) return false

  const newestPubkey = newestContentKeyPubkey(raw)
  let changed = false
  for (const [pubkey, entry] of [...raw]) {
    if (pubkey === newestPubkey) continue
    if (!isStaleContentKeyCreatedAt(entry.createdAt || 0, now)) continue
    changed = dropContentKey(ownerPubkey, pubkey) || changed
  }
  return changed
}

function pruneStaleContentKeys (now = nowSeconds()) {
  let changed = false
  for (const ownerPubkey of [...rawContentKeyHexByOwnerPubkey.keys()]) {
    changed = pruneStaleContentKeysForOwner(ownerPubkey, now) || changed
  }
  return changed
}

function adoptBunkerWithHandle (pubkey, handle, clientKey) {
  const contentKeysChanged = dropPriorEntry(pubkey)
  rawClientKeyHexByPubkey.set(pubkey, clientKey)
  bunkerHandlesByPubkey.set(pubkey, handle)
  accountTypeByPubkey.set(pubkey, 'bunker')
  return contentKeysChanged
}

// Used at unlock time, where we have the raw clientKey from the TLV but
// no live handle yet. Construct one using the bunker URL from the store.
function adoptBunkerFromUnlock (pubkey, clientKey) {
  const account = store.get(pubkey)
  if (!account || account.type !== 'bunker' || !account.bunker) {
    console.warn('bunker secret without matching store record — skipping', pubkey)
    return
  }
  const handle = BunkerHandle.create({
    pubkey,
    bunkerUrl: account.bunker,
    clientKey,
    onStateChange: persistHandleState
  })
  adoptBunkerWithHandle(pubkey, handle, clientKey)
}

function clearAll () {
  for (const pubkey of nsecSignersByPubkey.keys()) NsecSigner.release(pubkey)
  dropAllContentKeys()
  for (const handle of bunkerHandlesByPubkey.values()) handle.close()
  nsecSignersByPubkey.clear()
  bunkerHandlesByPubkey.clear()
  accountTypeByPubkey.clear()
  rawNsecHexByPubkey.clear()
  rawClientKeyHexByPubkey.clear()
  deviceSignerSeckey = null
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function subscribeContentKeys (fn) {
  contentKeyListeners.add(fn)
  return () => contentKeyListeners.delete(fn)
}

export function isUnlocked () {
  return vaultPrivkey !== null
}

// Bring the vault online. `vaultKeyBytes` is the 32-byte PRF output the
// passkey just produced; `ciphertext` is the sealed payload from the
// passkey's largeBlob (or its localStorage fallback), or null on a fresh
// registration where there is nothing to load yet.
export function unlock (vaultKeyBytes, ciphertext) {
  vaultPrivkey = vaultKeyBytes
  vaultConversationKey = nip44.getConversationKey(vaultKeyBytes, getPublicKey(vaultKeyBytes))
  loadEntries(ciphertext)
  notify()
}

// Restore the pool to the state captured by an earlier `sealCurrentEntries()`
// snapshot, using the already-set vault key. The import flow uses this to
// roll back adopt-replace mutations when the post-commit largeBlob write
// fails: walking the pool back to the snapshot closes any handles adopted
// in the intervening commit (clearAll inside loadEntries) and re-adopts the
// prior set from the same ciphertext that was on disk a moment ago.
export function reload (ciphertext) {
  if (!vaultPrivkey) throw new Error('VAULT_LOCKED')
  loadEntries(ciphertext)
  notify()
}

function loadEntries (ciphertext) {
  clearAll()
  if (ciphertext) {
    const tlvBytes = base64ToBytes(nip44.decrypt(ciphertext, vaultConversationKey))
    for (const e of decodeSecretEntries(tlvBytes)) {
      if (e.type === 'nsec') adoptNsec(e.pubkey, e.seckey)
      else if (e.type === 'bunker') adoptBunkerFromUnlock(e.pubkey, e.clientKey)
      else if (e.type === 'device-signer') deviceSignerSeckey = e.seckey
    }
  }
  loadPersistedContentKeys()
}

function normalizeContentKeyEntry (entry) {
  const ownerPubkey = typeof entry?.ownerPubkey === 'string' ? entry.ownerPubkey.toLowerCase() : ''
  const seckey = typeof entry?.seckey === 'string' ? entry.seckey.toLowerCase() : ''
  const createdAt = Math.max(0, Math.floor(Number(entry?.createdAt) || 0))
  if (!HEX32.test(ownerPubkey) || !HEX32.test(seckey)) return null
  return { ownerPubkey, seckey, createdAt }
}

function replaceContentKeyEntries (entries, { pruneStale = true } = {}) {
  dropAllContentKeys()
  for (const entry of entries) {
    const normalized = normalizeContentKeyEntry(entry)
    if (!normalized) continue
    try {
      adoptContentKey(normalized.ownerPubkey, normalized.seckey, normalized.createdAt)
    } catch (err) {
      console.warn('content key skipped', err?.message ?? err)
    }
  }
  return pruneStale ? pruneStaleContentKeys() : false
}

function readPersistedContentKeyEntries () {
  const raw = localStorage.getItem(CONTENT_KEYS_KEY)
  if (!raw) return []
  if (!vaultConversationKey) return []
  try {
    const parsed = JSON.parse(vaultDecrypt(raw))
    return Array.isArray(parsed) ? parsed.map(normalizeContentKeyEntry).filter(Boolean) : []
  } catch (err) {
    console.warn('content keys decrypt failed', err?.message ?? err)
    return []
  }
}

function loadPersistedContentKeys () {
  if (replaceContentKeyEntries(readPersistedContentKeyEntries())) {
    persistContentKeyEntries()
  }
}

function persistContentKeyEntries ({ pruneStale = true } = {}) {
  if (!isUnlocked()) throw new Error('VAULT_LOCKED')
  if (pruneStale) pruneStaleContentKeys()
  const entries = listRawContentKeyEntriesInternal()
  if (!entries.length) {
    localStorage.removeItem(CONTENT_KEYS_KEY)
    return
  }
  localStorage.setItem(CONTENT_KEYS_KEY, vaultEncrypt(JSON.stringify(entries)))
}

export function snapshotContentKeySecrets () {
  return localStorage.getItem(CONTENT_KEYS_KEY)
}

export function restoreContentKeySecrets (priorCiphertext) {
  if (priorCiphertext === null) localStorage.removeItem(CONTENT_KEYS_KEY)
  else localStorage.setItem(CONTENT_KEYS_KEY, priorCiphertext)
  if (isUnlocked()) loadPersistedContentKeys()
  notify()
}

export function lock () {
  vaultPrivkey = null
  vaultConversationKey = null
  clearAll()
  notify()
}

export function setNsecSecret (pubkey, seckey) {
  if (!isUnlocked()) throw new Error('VAULT_LOCKED')
  const priorContentKeys = snapshotContentKeySecrets()
  const contentKeysChanged = adoptNsec(pubkey, seckey)
  try {
    if (contentKeysChanged) persistContentKeyEntries()
  } catch (err) {
    restoreContentKeySecrets(priorContentKeys)
    throw err
  }
  notify()
}

function adoptContentKey (ownerPubkey, seckey, createdAt = Math.floor(Date.now() / 1000)) {
  const signer = NsecSigner.getOrCreate(seckey)
  const pubkey = signer.getPublicKey()
  let signers = contentKeySignersByOwnerPubkey.get(ownerPubkey)
  if (!signers) {
    signers = new Map()
    contentKeySignersByOwnerPubkey.set(ownerPubkey, signers)
  }
  let raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey)
  if (!raw) {
    raw = new Map()
    rawContentKeyHexByOwnerPubkey.set(ownerPubkey, raw)
  }
  signers.set(pubkey, signer)
  raw.set(pubkey, { seckey, createdAt })
  return signer
}

export function setContentKeySecret (ownerPubkey, seckey, createdAt = Math.floor(Date.now() / 1000)) {
  if (!isUnlocked()) throw new Error('VAULT_LOCKED')
  const prior = listRawContentKeyEntriesInternal()
  try {
    const normalizedCreatedAt = Math.max(0, Math.floor(Number(createdAt) || 0))
    if (shouldSkipContentKeyStorage(ownerPubkey, normalizedCreatedAt)) return null
    const signer = adoptContentKey(ownerPubkey, seckey, normalizedCreatedAt)
    // Content keys can rotate during quiet background sync. Keep them in
    // vault-key-encrypted localStorage so rotation never needs a largeBlob
    // WebAuthn prompt.
    persistContentKeyEntries()
    notifyContentKeys(ownerPubkey)
    notify()
    return signer
  } catch (err) {
    replaceContentKeyEntries(prior, { pruneStale: false })
    throw err
  }
}

export function replaceContentKeySecret (ownerPubkey, seckey, createdAt = Math.floor(Date.now() / 1000)) {
  if (!isUnlocked()) throw new Error('VAULT_LOCKED')
  const prior = listRawContentKeyEntriesInternal()
  try {
    dropContentKeysForOwner(ownerPubkey)
    const signer = adoptContentKey(ownerPubkey, seckey, Math.max(0, Math.floor(Number(createdAt) || 0)))
    persistContentKeyEntries({ pruneStale: false })
    notifyContentKeys(ownerPubkey)
    notify()
    return signer
  } catch (err) {
    replaceContentKeyEntries(prior, { pruneStale: false })
    throw err
  }
}

export function getContentKeySigner (ownerPubkey, contentPubkey) {
  if (!contentPubkey) return null
  return contentKeySignersByOwnerPubkey.get(ownerPubkey)?.get(contentPubkey) ?? null
}

export function getLatestContentKeySigner (ownerPubkey) {
  const signers = contentKeySignersByOwnerPubkey.get(ownerPubkey)
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey)
  if (!signers?.size || !raw?.size) return null
  let best = null
  for (const [pubkey, entry] of raw) {
    if (!best || (entry.createdAt || 0) >= (best.createdAt || 0)) best = { pubkey, ...entry }
  }
  return best ? signers.get(best.pubkey) || null : null
}

export function listContentKeys (ownerPubkey) {
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey)
  if (!raw?.size) return []
  return [...raw].map(([pubkey, entry]) => ({
    ownerPubkey,
    pubkey,
    createdAt: entry.createdAt || 0
  }))
}

function getContentKeyRecordInternal (ownerPubkey, contentPubkey) {
  if (!contentPubkey) return null
  const entry = rawContentKeyHexByOwnerPubkey.get(ownerPubkey)?.get(contentPubkey)
  if (!entry?.seckey) return null
  return {
    ownerPubkey,
    pubkey: contentPubkey,
    seckey: entry.seckey,
    createdAt: entry.createdAt || 0
  }
}

// No public "get content seckey" surface: sync supplies the sender callback,
// and this module builds the one reply payload that is meant to carry it.
export async function replyWithContentKeySecrets ({ ownerPubkey, pubkeys, send }) {
  if (!isUnlocked()) throw new Error('VAULT_LOCKED')
  if (typeof send !== 'function') throw new Error('SEND_REQUIRED')
  const keys = [...new Set((Array.isArray(pubkeys) ? pubkeys : []).filter(Boolean))]
    .map(pubkey => getContentKeyRecordInternal(ownerPubkey, pubkey))
    .filter(Boolean)
    .map(record => ({
      pubkey: record.pubkey,
      seckey: record.seckey,
      createdAt: record.createdAt || 0
    }))
  if (!keys.length) return null
  return send({ ownerPubkey, keys })
}

// Adopt a freshly-imported, already-connected BunkerHandle into the pool.
// Called by `BunkerHandle.commit()` from inside bunker.js, which extracts
// the clientKey from its module-private WeakMap and threads it in here.
export function adoptBunkerHandle (pubkey, handle, clientKey) {
  if (!isUnlocked()) throw new Error('VAULT_LOCKED')
  const priorContentKeys = snapshotContentKeySecrets()
  const contentKeysChanged = adoptBunkerWithHandle(pubkey, handle, clientKey)
  try {
    if (contentKeysChanged) persistContentKeyEntries()
  } catch (err) {
    restoreContentKeySecrets(priorContentKeys)
    throw err
  }
  notify()
}

// Public-only surface for the device signer key. The seckey stays inside
// this module; callers that need to sign with it go through the signer
// helpers below, same pattern as nsec/bunker handles.
// Lazily ensure the device signer seckey is loaded. Returns the cached hex
// when the blob carried it, or derives + caches it from the vault PRF on
// first access (next writeSecretsBlob persists the derived bytes). Callers
// awaiting `getDeviceSignerPubkey` / `withDeviceSignerSeckey` go through
// this so the seckey is always present before either returns.
async function ensureDeviceSignerSeckey () {
  if (!vaultPrivkey) throw new Error('VAULT_LOCKED')
  if (!deviceSignerSeckey) deviceSignerSeckey = await deriveSignerSeckey(vaultPrivkey)
  return deviceSignerSeckey
}

export async function getDeviceSignerPubkey () {
  const seckey = await ensureDeviceSignerSeckey()
  return getPublicKey(hexToBytes(seckey))
}

export async function getDeviceSigner () {
  const seckey = await ensureDeviceSignerSeckey()
  return NsecSigner.getOrCreate(seckey)
}

// Run a callback with the device signer seckey bytes. The bytes leave this
// module only via the callback's invocation; we don't return them. Used by
// the nostrpair flow to publish trust-exchange and account-exchange events
// signed by this device's signer keypair.
export async function withDeviceSignerSeckey (fn) {
  const seckey = await ensureDeviceSignerSeckey()
  return fn(hexToBytes(seckey))
}

export function deleteSecret (pubkey) {
  const priorContentKeys = snapshotContentKeySecrets()
  let contentKeysChanged = false
  if (!accountTypeByPubkey.has(pubkey)) {
    contentKeysChanged = dropContentKeysForOwner(pubkey)
    try {
      if (contentKeysChanged) persistContentKeyEntries()
    } catch (err) {
      restoreContentKeySecrets(priorContentKeys)
      throw err
    }
    notify()
    return
  }
  contentKeysChanged = dropPriorEntry(pubkey)
  try {
    if (contentKeysChanged) persistContentKeyEntries()
  } catch (err) {
    restoreContentKeySecrets(priorContentKeys)
    throw err
  }
  notify()
}

// Profile-rehydrator drift: a bunker we cached as `oldPubkey` now reports
// `newPubkey`. Move the secret + the live handle over without exposing the
// raw clientKey through any public surface. The device signer key is
// account-independent so it stays put across drift; trusted-signers are
// stored at device level too, so no per-account cleanup is needed.
export function transferBunkerSecret (oldPubkey, newPubkey) {
  if (!isUnlocked()) throw new Error('VAULT_LOCKED')
  if (accountTypeByPubkey.get(oldPubkey) !== 'bunker') return
  const clientKey = rawClientKeyHexByPubkey.get(oldPubkey)
  if (!clientKey) {
    deleteSecret(oldPubkey)
    return
  }
  // Drop the stale handle/secret first so adoptBunkerFromUnlock's read of
  // the store record (which the caller will have just rewritten under
  // `newPubkey`) finds a clean slate.
  deleteSecret(oldPubkey)
  adoptBunkerFromUnlock(newPubkey, clientKey)
  notify()
}

// Hand out a signer for the normal sign path. `null` if locked or no
// matching nsec entry. Methods on the signer use the seckey internally;
// they do not return it.
export function getNsecSigner (pubkey) {
  return nsecSignersByPubkey.get(pubkey) ?? null
}

// Mirror of getNsecSigner for bunker accounts. Returns the cached
// BunkerHandle whose internal WeakMap holds the clientKey; the methods
// on the handle consume it for signing/encrypting and never return it.
export function getBunkerHandle (pubkey) {
  return bunkerHandlesByPubkey.get(pubkey) ?? null
}

// Re-encrypt the current secret set into the largeBlob ciphertext. Used by
// passkey.writeSecretsBlob — the sealed bytes are all the passkey layer
// ever sees, plaintext stays inside this module.
//
// Note: encodeSecretEntries always emits at least one record (a zero-length
// padding tag when the entry list is empty), so the NIP-44 plaintext is
// never empty. That matters because deleting the last account still has to
// overwrite the largeBlob — otherwise the prior ciphertext stays put and
// the deleted secret resurrects on the next unlock.
export function sealCurrentEntries () {
  if (!isUnlocked()) throw new Error('VAULT_LOCKED')
  const tlvBytes = encodeSecretEntries(listRawEntriesInternal())
  return nip44.encrypt(bytesToBase64(tlvBytes), vaultConversationKey)
}

function listRawEntriesInternal () {
  const out = []
  for (const [pubkey, type] of accountTypeByPubkey) {
    if (type === 'nsec') {
      const seckey = rawNsecHexByPubkey.get(pubkey)
      if (seckey) out.push({ type: 'nsec', pubkey, seckey })
    } else if (type === 'bunker') {
      const clientKey = rawClientKeyHexByPubkey.get(pubkey)
      if (clientKey) out.push({ type: 'bunker', pubkey, clientKey })
    }
  }
  if (deviceSignerSeckey) {
    out.push({ type: 'device-signer', seckey: deviceSignerSeckey })
  }
  return out
}

function listRawContentKeyEntriesInternal () {
  const out = []
  for (const [ownerPubkey, entries] of rawContentKeyHexByOwnerPubkey) {
    for (const entry of entries.values()) {
      out.push({
        ownerPubkey,
        seckey: entry.seckey,
        createdAt: entry.createdAt || 0
      })
    }
  }
  return out
}

export function vaultEncrypt (plaintext) {
  if (!vaultConversationKey) throw new Error('VAULT_LOCKED')
  return nip44.encrypt(plaintext, vaultConversationKey)
}

export function vaultDecrypt (ciphertext) {
  if (!vaultConversationKey) throw new Error('VAULT_LOCKED')
  return nip44.decrypt(ciphertext, vaultConversationKey)
}
