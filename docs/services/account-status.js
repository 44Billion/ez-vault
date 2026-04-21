// In-memory, per-pubkey status flags (e.g. "bunker refused to answer").
// Not persisted — clears on reload and gets re-set by the next rehydrate pass.
const state = new Map()
const listeners = new Set()

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function get (pubkey) {
  return state.get(pubkey) || null
}

export function setError (pubkey, error) {
  const prev = state.get(pubkey)
  if (!error) {
    if (!prev) return
    state.delete(pubkey)
  } else {
    if (prev?.error === error) return
    state.set(pubkey, { error })
  }
  for (const fn of listeners) fn(pubkey)
}

export function clearError (pubkey) {
  setError(pubkey, null)
}
