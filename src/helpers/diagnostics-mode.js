export function debugEnabledForWindow (currentWindow = globalThis.window) {
  if (!currentWindow) return false
  try {
    if (currentWindow === currentWindow.top) return true
  } catch {
    // A cross-origin parent cannot be compared safely; query opt-in still applies.
  }
  return new URLSearchParams(currentWindow.location?.search || '').get('debug') === '1'
}
