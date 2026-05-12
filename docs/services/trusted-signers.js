import * as secrets from './secrets.js'

const KEY = 'ez-vault:trusted-signers'

// Flat device-level trust list, encrypted in localStorage with the vault
// key. Each entry is one peer device's signer pubkey — the device-local
// keypair the peer derived from its own passkey PRF. Plaintext shape:
//
//   [{ pubkey, platform, addedAt }, ...]
//
// `pubkey` is the peer's device signer pubkey, `platform` is the short
// "OS / browser" label the peer announced over the pair channel, and
// `addedAt` is unix seconds for ordering / future UI.
//
// Unlike messenger-log, the entire payload is sealed; we don't leave any
// plaintext envelope because pubkeys leak relationship structure and we
// have no filtering need that requires reading them while locked.

const listeners = new Set()

function notify () {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.warn('trusted-signers listener threw', err) }
  }
}

function readList () {
  const raw = localStorage.getItem(KEY)
  if (!raw) return []
  if (!secrets.isUnlocked()) return []
  try {
    const plain = secrets.vaultDecrypt(raw)
    const parsed = JSON.parse(plain)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('trusted-signers decrypt failed', err?.message ?? err)
    return []
  }
}

function writeList (list) {
  if (!secrets.isUnlocked()) throw new Error('VAULT_LOCKED')
  const sealed = secrets.vaultEncrypt(JSON.stringify(list))
  localStorage.setItem(KEY, sealed)
  notify()
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Append one trusted signer. No-op when a signer with the same pubkey is
// already present so re-pairing the same device doesn't duplicate entries.
export function add ({ pubkey, platform }) {
  if (!pubkey) return
  const list = readList()
  if (list.some(e => e.pubkey === pubkey)) return
  list.push({ pubkey, platform: platform || '', addedAt: Math.floor(Date.now() / 1000) })
  writeList(list)
}

// Bulk append — single write for a batch. Skips duplicates the same way
// `add` does. The batch parameter is mostly there for parity with the
// commit path; today the pair flow only ever adds one peer at a time.
export function addMany (entries) {
  if (!entries?.length) return
  const list = readList()
  let dirty = false
  for (const e of entries) {
    if (!e?.pubkey) continue
    if (list.some(x => x.pubkey === e.pubkey)) continue
    list.push({ pubkey: e.pubkey, platform: e.platform || '', addedAt: Math.floor(Date.now() / 1000) })
    dirty = true
  }
  if (dirty) writeList(list)
}

export function list () {
  return readList()
}

// Read the raw ciphertext as it currently sits on disk. Used by the import
// commit path to bracket the trusted-signers write with the rest of the
// commit so a rollback (e.g. writeSecretsBlob throws) can put the byte-for-
// byte prior state back.
export function snapshot () {
  return localStorage.getItem(KEY)
}

export function restore (priorCiphertext) {
  if (priorCiphertext === null) localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, priorCiphertext)
  notify()
}
