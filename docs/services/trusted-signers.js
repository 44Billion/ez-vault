import * as secrets from './secrets.js'

const KEY = 'ez-vault:trusted-signers'

// Per-account trust list, encrypted in localStorage with the vault key.
// Each account (non-npub) can have many trusted peer signers — typically
// one per paired device. The plaintext shape is:
//
//   { [accountPubkey]: [{ pubkey, platform, addedAt }, ...] }
//
// where `pubkey` is the peer's per-account signer pubkey (the device-local
// keypair the peer derived for that account), `platform` is the short
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

function readMap () {
  const raw = localStorage.getItem(KEY)
  if (!raw) return {}
  if (!secrets.isUnlocked()) return {}
  try {
    const plain = secrets.vaultDecrypt(raw)
    const parsed = JSON.parse(plain)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    console.warn('trusted-signers decrypt failed', err?.message ?? err)
    return {}
  }
}

function writeMap (map) {
  if (!secrets.isUnlocked()) throw new Error('VAULT_LOCKED')
  const sealed = secrets.vaultEncrypt(JSON.stringify(map))
  localStorage.setItem(KEY, sealed)
  notify()
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Append one trusted signer to the list for `accountPubkey`. No-op when
// a signer with the same pubkey is already present for this account so
// re-pairing the same device doesn't duplicate entries.
export function add (accountPubkey, { pubkey, platform }) {
  if (!accountPubkey || !pubkey) return
  const map = readMap()
  const list = map[accountPubkey] || []
  if (list.some(e => e.pubkey === pubkey)) return
  list.push({ pubkey, platform: platform || '', addedAt: Math.floor(Date.now() / 1000) })
  map[accountPubkey] = list
  writeMap(map)
}

// Bulk append — single write for the whole pair batch. Skips duplicates
// the same way `add` does.
export function addMany (entries) {
  if (!entries?.length) return
  const map = readMap()
  let dirty = false
  for (const e of entries) {
    if (!e?.accountPubkey || !e?.pubkey) continue
    const list = map[e.accountPubkey] || []
    if (list.some(x => x.pubkey === e.pubkey)) continue
    list.push({ pubkey: e.pubkey, platform: e.platform || '', addedAt: Math.floor(Date.now() / 1000) })
    map[e.accountPubkey] = list
    dirty = true
  }
  if (dirty) writeMap(map)
}

export function listFor (accountPubkey) {
  const map = readMap()
  return map[accountPubkey] ? [...map[accountPubkey]] : []
}

// Drops the trust list for an account. Used when the account itself is
// removed so the localStorage entry doesn't accumulate orphans.
export function removeForAccount (accountPubkey) {
  if (!accountPubkey) return
  const map = readMap()
  if (!(accountPubkey in map)) return
  delete map[accountPubkey]
  writeMap(map)
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
