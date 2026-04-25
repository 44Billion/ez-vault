const KEY = '46b-vault:messenger-log'
const MAX_ENTRIES = 500

// Bounded FIFO in localStorage of messenger activity. Newest first. Entries
// are whatever shape the caller passes (plus a ts) — current users tag them
// with a `code` field so future message codes beyond NIP07 can share the log.
// Callers must not include params or plaintext: none of this should land in
// localStorage.

function read () {
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

export function append (entry) {
  const all = read()
  all.unshift({ ts: Math.floor(Date.now() / 1000), ...entry })
  if (all.length > MAX_ENTRIES) all.length = MAX_ENTRIES
  write(all)
}

export function list () {
  return read()
}

export function clear () {
  write([])
}
