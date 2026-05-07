import * as secrets from '../secrets.js'

const KEY = 'ez-vault:messenger-log'
const MAX_ENTRIES = 500

// Bounded FIFO in localStorage of messenger activity, newest first. Acts as
// the user's audit trail: each entry stores the call metadata plus the
// signed/decrypted payload so the user can review what an app actually did
// with their key.
//
// Sensitive fields (`params` and `result`) are sealed together with the
// vault key (the deterministic privkey derived from the passkey PRF) so
// localStorage never holds plaintext. Metadata fields (ts, pubkey, app,
// method, status, ...) stay in the clear so callers like `removeForPubkey`
// can filter without having to decrypt every entry.
//
// Some methods are deliberately *not* logged at the call site (read-only
// disclosures like getPublicKey/getRelays); see `messenger.js` for the
// exclusion list.

const listeners = new Set()

function readRaw () {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write (all) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch (err) {
    // QuotaExceededError or similar — drop the oldest half and retry once,
    // then give up quietly. The log is advisory; losing entries is fine.
    if (all.length <= 1) return
    const trimmed = all.slice(0, Math.max(1, Math.floor(all.length / 2)))
    try { localStorage.setItem(KEY, JSON.stringify(trimmed)) } catch { /* noop */ }
    console.warn('messenger-log write failed, trimmed', err?.message ?? err)
  }
}

function notify () {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.warn('messenger-log listener threw', err) }
  }
}

function inflate (entry) {
  if (!entry.sealed) return entry
  if (!secrets.isUnlocked()) {
    // Locked: leave sealed-only — the UI is overlaid in this state anyway,
    // and any background reader can still see the metadata it needs.
    return entry
  }
  try {
    const { sealed, ...rest } = entry
    const opened = JSON.parse(secrets.vaultDecrypt(sealed))
    return { ...rest, ...opened }
  } catch (err) {
    console.warn('messenger-log decrypt failed', err?.message ?? err)
    return entry
  }
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function append (entry) {
  const { params, result, ...rest } = entry
  const sealedFields = {}
  if (params !== undefined) sealedFields.params = params
  if (result !== undefined) sealedFields.result = result

  const stored = { ts: Math.floor(Date.now() / 1000), ...rest }
  if (Object.keys(sealedFields).length && secrets.isUnlocked()) {
    stored.sealed = secrets.vaultEncrypt(JSON.stringify(sealedFields))
  }
  // While locked, sensitive fields are dropped on the floor — anything that
  // produced them must have run unlocked, so this only happens for failure
  // entries logged after a VAULT_LOCKED rejection.

  const all = readRaw()
  all.unshift(stored)
  if (all.length > MAX_ENTRIES) all.length = MAX_ENTRIES
  write(all)
  notify()
}

export function list () {
  return readRaw().map(inflate)
}

export function removeForPubkey (pubkey) {
  if (!pubkey) return
  const all = readRaw()
  const next = all.filter(e => e.pubkey !== pubkey)
  if (next.length === all.length) return
  write(next)
  notify()
}

export function clear () {
  write([])
  notify()
}
