import { nip44, getPublicKey } from 'nostr-tools'
import NsecSigner from './nsec-signer.js'
import { BunkerHandle, persistHandleState } from './bunker.js'
import * as store from './accounts-store.js'
import { encodeSecretEntries, decodeSecretEntries } from './secret-blob.js'
import { bytesToBase64, base64ToBytes } from '../helpers/base64.js'

// In-memory home for every account's secret material plus the deterministic
// vault key derived from the passkey PRF extension. Nothing here ever
// touches localStorage — secrets only live in this module while the vault
// is unlocked.
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
// - The raw hex strings are also kept in module-private Maps that the
//   sealing path (TLV encode → encrypt → write to passkey) reads. Those
//   maps are not exported. There is no `getSeckey` / `getClientKey` /
//   `exportEntries` surface — the export and copy-nsec flows reach the
//   raw bytes by going through `passkey.openSecrets()`, which prompts the
//   user for fresh verification and decrypts the largeBlob ad-hoc.
//
// The vault key doubles as a NIP-44 self-encryption key; messenger-log uses
// it to seal sensitive entry payloads while unlocked.

let vaultPrivkey = null
let vaultConversationKey = null

const nsecSignersByPubkey = new Map()
const bunkerHandlesByPubkey = new Map()
const accountTypeByPubkey = new Map()

// Module-private raw stash used by `sealCurrentEntries` only — not exported.
// Both the seckey hex (for nsec) and the clientKey hex (for bunker) live
// here so we can re-emit the TLV blob whenever the secret set changes.
const rawNsecHexByPubkey = new Map()
const rawClientKeyHexByPubkey = new Map()

const listeners = new Set()

function notify () {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.warn('secrets listener threw', err) }
  }
}

function dropPriorEntry (pubkey) {
  const t = accountTypeByPubkey.get(pubkey)
  if (!t) return
  if (t === 'nsec') {
    NsecSigner.release(pubkey)
    nsecSignersByPubkey.delete(pubkey)
    rawNsecHexByPubkey.delete(pubkey)
  } else if (t === 'bunker') {
    const handle = bunkerHandlesByPubkey.get(pubkey)
    if (handle) handle.close()
    bunkerHandlesByPubkey.delete(pubkey)
    rawClientKeyHexByPubkey.delete(pubkey)
  }
  accountTypeByPubkey.delete(pubkey)
}

function adoptNsec (pubkey, seckey) {
  dropPriorEntry(pubkey)
  rawNsecHexByPubkey.set(pubkey, seckey)
  // NsecSigner.getOrCreate sinks the bytes into its WeakMap-backed slot.
  nsecSignersByPubkey.set(pubkey, NsecSigner.getOrCreate(seckey))
  accountTypeByPubkey.set(pubkey, 'nsec')
}

function adoptBunkerWithHandle (pubkey, handle, clientKey) {
  dropPriorEntry(pubkey)
  rawClientKeyHexByPubkey.set(pubkey, clientKey)
  bunkerHandlesByPubkey.set(pubkey, handle)
  accountTypeByPubkey.set(pubkey, 'bunker')
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
  for (const handle of bunkerHandlesByPubkey.values()) handle.close()
  nsecSignersByPubkey.clear()
  bunkerHandlesByPubkey.clear()
  accountTypeByPubkey.clear()
  rawNsecHexByPubkey.clear()
  rawClientKeyHexByPubkey.clear()
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
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
  clearAll()
  if (ciphertext) {
    const tlvBytes = base64ToBytes(nip44.decrypt(ciphertext, vaultConversationKey))
    for (const e of decodeSecretEntries(tlvBytes)) {
      if (e.type === 'nsec') adoptNsec(e.pubkey, e.seckey)
      else if (e.type === 'bunker') adoptBunkerFromUnlock(e.pubkey, e.clientKey)
    }
  }
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
  adoptNsec(pubkey, seckey)
  notify()
}

// Adopt a freshly-imported, already-connected BunkerHandle into the pool.
// Called by `BunkerHandle.commit()` from inside bunker.js, which extracts
// the clientKey from its module-private WeakMap and threads it in here.
export function adoptBunkerHandle (pubkey, handle, clientKey) {
  if (!isUnlocked()) throw new Error('VAULT_LOCKED')
  adoptBunkerWithHandle(pubkey, handle, clientKey)
  notify()
}

export function deleteSecret (pubkey) {
  if (!accountTypeByPubkey.has(pubkey)) return
  dropPriorEntry(pubkey)
  notify()
}

// Profile-rehydrator drift: a bunker we cached as `oldPubkey` now reports
// `newPubkey`. Move the secret + the live handle over without exposing the
// raw clientKey through any public surface.
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
