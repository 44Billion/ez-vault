// Vault service worker — built to docs/sw.js by bin/build.js (defines are
// injected there). Served from the same directory as the vault page, so it
// works both on GitHub Pages (repo subpath, e.g. /ez-vault/) and on the
// vault.44billion.net subdomain (root path).
//
// Makes the vault shell work offline while keeping deploys fresh:
// stable-name entries (index.html, app.js) are network-first so a reload
// revalidates with the origin, and hashed chunks are cached forever because
// a new deploy references new URLs. GitHub Pages serves every file with
// Cache-Control: max-age=600 (10 min), so network fetches also send a
// revalidation request header (the 44b-vault legacy mitigation); a first
// load shortly after a deploy may still serve the previous — coherent —
// version for up to ~10 minutes, which is accepted.
// If a stale index.html instead references chunks that no longer exist (404),
// the module graph fails: the inline boot failsafe in index.html logs,
// reloads once per session and then shows a manual reload overlay, and the
// early inline SW registration makes the next reload already controlled
// (network-first revalidation bypasses the stale browser cache). See README
// "Hosting and deploy coherence (GitHub Pages)".
//
// Updates are never applied automatically. A new worker installs and waits;
// the vault shows a non-dismissible update banner/indicator until the user
// explicitly applies it (SKIP_WAITING). Reload vs. manual update: while the
// old worker still controls, any online reload already delivers the new
// version (network-first entries + new chunk URLs); the banner exists for
// embedded PWAs that stay open and to apply the new worker's own logic.
// Caveat: after a deploy that changes this worker's logic, a plain reload is
// still served by the old worker until the new one activates.

// VERSION is injected by the build as a content hash of this worker's logic
// (minus this line), so the cache name changes exactly when the worker
// changes. DEPLOY_VERSION is injected per build as a content hash of the
// vault sources; it only exists to change this script's bytes on every
// deploy so the browser detects a new worker and shows the banner.
const VERSION = LAUNCHER_SW_VERSION
const DEPLOY_VERSION = LAUNCHER_DEPLOY_HASH

const APP_PREFIX = 'ez-vault-sw'
const CACHE_KEY = `${APP_PREFIX}:${VERSION}`

// GitHub Pages serves the vault from a repo subpath (/ez-vault/), while the
// vault subdomain serves it from the root. Derive the base from the worker's
// own URL so precache URLs and route matching work in both layouts. The
// trailing slash matters: '/ez-vault/sw.js' must yield '/ez-vault/' (not
// '/ez-vault'), or ROOT + 'index.html' becomes a malformed URL.
const BASE = self.location.pathname.replace(/\/[^/]*$/, '/')
const ROOT = self.location.origin + BASE
const PRECACHE_URLS = [ROOT, `${ROOT}index.html`, `${ROOT}app.js`]

const isSameOriginGet = request =>
  request.method === 'GET' &&
  new URL(request.url).origin === self.location.origin

const isCacheable = response =>
  response.ok && response.type === 'basic'

// Bypass the 10-minute GitHub Pages browser cache by revalidating on every
// fetch (request header + cache mode), mirroring the 44b-vault legacy SW.
// GitHub Pages does not support custom headers, so this revalidation plus the
// early inline registration in index.html is what keeps a deploy coherent on
// the next controlled reload.
const networkOptions = {
  cache: 'no-cache',
  headers: { 'Cache-Control': 'no-cache' }
}

async function cachePut (request, response) {
  const cache = await caches.open(CACHE_KEY)
  await cache.put(request, response.clone())
}

// Network-first with cache fallback for the stable-name entry files.
async function networkFirst (request) {
  try {
    const response = await fetch(request, networkOptions)
    if (isCacheable(response)) await cachePut(request, response)
    return response
  } catch {
    const cached = await caches.match(request)
    return cached || Response.error()
  }
}

// Navigations may target SPA-ish paths; cache the successful document under
// the canonical index.html key so it is the offline fallback for any route.
async function networkFirstNavigation (request) {
  try {
    const response = await fetch(request, networkOptions)
    if (isCacheable(response)) {
      const cache = await caches.open(CACHE_KEY)
      await cache.put(`${ROOT}index.html`, response.clone())
    }
    return response
  } catch {
    return (await caches.match(`${ROOT}index.html`)) || Response.error()
  }
}

// Hashed chunks are immutable: serve from cache forever, populate on miss.
async function cacheFirst (request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (isCacheable(response)) await cachePut(request, response)
  return response
}

// Remaining stable-name assets (styles, fonts, manifest...): serve the cached
// copy immediately and refresh it in the background.
async function staleWhileRevalidate (request) {
  const cached = await caches.match(request)
  if (cached) {
    fetch(request)
      .then(response => { if (isCacheable(response)) return cachePut(request, response) })
      .catch(() => {})
    return cached
  }
  const response = await fetch(request)
  if (isCacheable(response)) await cachePut(request, response)
  return response
}

self.addEventListener('install', e => {
  console.info('[ez-vault-sw] installing', CACHE_KEY, DEPLOY_VERSION)
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_KEY)
    await Promise.all(PRECACHE_URLS.map(url =>
      cache.add(new Request(url, networkOptions))
    ))
  })())
})

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter(key => key.startsWith(`${APP_PREFIX}:`) && key !== CACHE_KEY)
      .map(key => caches.delete(key)))
    // Take control right after a user-approved skipWaiting so the
    // controllerchange listener in the app reloads the fresh version.
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', e => {
  if (!isSameOriginGet(e.request)) return
  const { pathname } = new URL(e.request.url)

  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirstNavigation(e.request))
  } else if (pathname === `${BASE}app.js`) {
    e.respondWith(networkFirst(e.request))
  } else if (pathname.startsWith(`${BASE}chunks/`)) {
    e.respondWith(cacheFirst(e.request))
  } else {
    e.respondWith(staleWhileRevalidate(e.request))
  }
})

// Never call self.skipWaiting() automatically — only on explicit user action
// (the non-dismissible update banner/indicators).
self.addEventListener('message', e => {
  if (e.data?.code === 'SKIP_WAITING') self.skipWaiting()
})
