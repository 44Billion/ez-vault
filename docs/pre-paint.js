// Runs synchronously during HTML parsing (loaded as a classic <script src>),
// so it can mutate the DOM before the first paint. The deferred module
// script that follows handles every other update; this exists only to kill
// the layout-shift FOUC that would otherwise happen between paint and the
// module's first run while it waits for esm.sh imports to resolve.
try {
  const raw = localStorage.getItem('ez-vault:accounts')
  const accounts = raw ? JSON.parse(raw) : []
  if (Array.isArray(accounts) && accounts.length > 0) {
    document.getElementById('export-account-btn').removeAttribute('hidden')
  }
} catch { /* noop */ }
