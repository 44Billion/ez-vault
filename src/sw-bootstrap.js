// Early service worker registration, inlined into index.html by bin/build.js
// before the module graph loads, so the very next reload is already
// controlled: network-first revalidation then bypasses GitHub Pages'
// 10-minute browser cache for index.html/app.js. Skipped on localhost and
// non-https (dev/peer servers); sw-manager still handles updates and, in dev,
// unregisters any leftover workers.
(function () {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const hostname = window.location.hostname || ''
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost')
  if (isLocalhost || window.location.protocol !== 'https:') return
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(err => {
    console.warn('[ez-vault-sw] early registration failed:', err?.message ?? err)
  })
})()
