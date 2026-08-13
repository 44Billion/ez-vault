(() => {
  // src/sw.src.js
  var VERSION = "060fadd6fc";
  var DEPLOY_VERSION = "89559b788d";
  var APP_PREFIX = "ez-vault-sw";
  var CACHE_KEY = `${APP_PREFIX}:${VERSION}`;
  var BASE = self.location.pathname.replace(/\/[^/]*$/, "/");
  var ROOT = self.location.origin + BASE;
  var PRECACHE_URLS = [ROOT, `${ROOT}index.html`, `${ROOT}app.js`];
  var isSameOriginGet = (request) => request.method === "GET" && new URL(request.url).origin === self.location.origin;
  var isCacheable = (response) => response.ok && response.type === "basic";
  var networkOptions = {
    cache: "no-cache",
    headers: { "Cache-Control": "no-cache" }
  };
  async function cachePut(request, response) {
    const cache = await caches.open(CACHE_KEY);
    await cache.put(request, response.clone());
  }
  async function networkFirst(request) {
    try {
      const response = await fetch(request, networkOptions);
      if (isCacheable(response)) await cachePut(request, response);
      return response;
    } catch {
      const cached = await caches.match(request);
      return cached || Response.error();
    }
  }
  async function networkFirstNavigation(request) {
    try {
      const response = await fetch(request, networkOptions);
      if (isCacheable(response)) {
        const cache = await caches.open(CACHE_KEY);
        await cache.put(`${ROOT}index.html`, response.clone());
      }
      return response;
    } catch {
      return await caches.match(`${ROOT}index.html`) || Response.error();
    }
  }
  async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isCacheable(response)) await cachePut(request, response);
    return response;
  }
  async function staleWhileRevalidate(request) {
    const cached = await caches.match(request);
    if (cached) {
      fetch(request).then((response2) => {
        if (isCacheable(response2)) return cachePut(request, response2);
      }).catch(() => {
      });
      return cached;
    }
    const response = await fetch(request);
    if (isCacheable(response)) await cachePut(request, response);
    return response;
  }
  self.addEventListener("install", (e) => {
    console.info("[ez-vault-sw] installing", CACHE_KEY, DEPLOY_VERSION);
    e.waitUntil((async () => {
      const cache = await caches.open(CACHE_KEY);
      await Promise.all(PRECACHE_URLS.map(
        (url) => cache.add(new Request(url, networkOptions))
      ));
    })());
  });
  self.addEventListener("activate", (e) => {
    e.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(`${APP_PREFIX}:`) && key !== CACHE_KEY).map((key) => caches.delete(key)));
      await self.clients.claim();
    })());
  });
  self.addEventListener("fetch", (e) => {
    if (!isSameOriginGet(e.request)) return;
    const { pathname } = new URL(e.request.url);
    if (e.request.mode === "navigate") {
      e.respondWith(networkFirstNavigation(e.request));
    } else if (pathname === `${BASE}app.js`) {
      e.respondWith(networkFirst(e.request));
    } else if (pathname.startsWith(`${BASE}chunks/`)) {
      e.respondWith(cacheFirst(e.request));
    } else {
      e.respondWith(staleWhileRevalidate(e.request));
    }
  });
  self.addEventListener("message", (e) => {
    if (e.data?.code === "SKIP_WAITING") self.skipWaiting();
  });
})();
