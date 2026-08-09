// src/services/account-status.js
var state = /* @__PURE__ */ new Map();
var listeners = /* @__PURE__ */ new Set();
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function get(pubkey) {
  return state.get(pubkey) || null;
}
function setError(pubkey, error) {
  const prev = state.get(pubkey);
  if (!error) {
    if (!prev) return;
    state.delete(pubkey);
  } else {
    if (prev?.error === error) return;
    state.set(pubkey, { error });
  }
  for (const fn of listeners) fn(pubkey);
}
function clearError(pubkey) {
  setError(pubkey, null);
}

export {
  subscribe,
  get,
  setError,
  clearError
};
