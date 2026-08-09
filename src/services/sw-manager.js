// Vanilla service-worker manager for the vault. The update state is
// deliberately non-dismissible: once a new worker is waiting, the UI keeps
// showing the update banner/indicators until the user applies it — there is
// no "dismiss" transition.
//
// Registered with updateViaCache: 'none' and checked hourly + on
// visibilitychange, so an embedded signer that stays open still detects a
// new deploy. Reload happens only after an explicit apply (SKIP_WAITING) and
// never on first install (the launcher SW calls clients.claim() on activate).

export const STATE_NONE = 'none'
export const STATE_AVAILABLE = 'available'

// UI wiring uses this instead of truthiness: the state is a string, and
// !state is false for BOTH 'none' and 'available' (non-empty strings).
export const isUpdateAvailable = state => state === STATE_AVAILABLE

function isDev () {
  return typeof IS_DEVELOPMENT !== 'undefined' && IS_DEVELOPMENT
}

export function createSwManager () {
  let state = STATE_NONE
  let registrationRef = null
  let reloadOnApply = false
  const listeners = new Set()

  function setState (next) {
    if (next === state) return
    state = next
    for (const listener of listeners) listener(state)
  }

  function getState () {
    return state
  }

  function subscribe (listener) {
    listeners.add(listener)
    listener(state)
    return () => listeners.delete(listener)
  }

  async function init () {
    if (isDev()) {
      // Dev must never be controlled by a service worker: unregister any left
      // over from production builds served on the same origin (e.g. a stale
      // worker registered on localhost), so stale caches can't serve old
      // bundles and the update banner never appears in development. Takes
      // effect after the next reload.
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map(registration => registration.unregister()))
        } catch (err) {
          console.warn('Failed to unregister development service workers', err?.message ?? err)
        }
      }
      return
    }
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    let registration
    try {
      // Relative path: works on GitHub Pages (/ez-vault/sw.js) and on the
      // vault subdomain (/sw.js). updateViaCache: 'none' forces the browser
      // to bypass its HTTP cache for the worker script so a new deploy is
      // detected even behind the 10-minute GitHub Pages cache.
      registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    } catch (err) {
      console.warn('Failed to register service worker', err?.message ?? err)
      return
    }
    registrationRef = registration

    setInterval(() => registration.update(), 60 * 60 * 1000)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
    }

    // Fired when a user-approved skipWaiting makes the new worker take
    // control (the SW calls clients.claim() on activate).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadOnApply) return
      reloadOnApply = false
      window.location.reload()
    })

    // A worker can already be waiting (detected on a previous load and never
    // applied — the banner is non-dismissible, so this is the same state).
    if (registration.waiting) {
      setState(STATE_AVAILABLE)
      return
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (!newWorker) return
      newWorker.addEventListener('statechange', () => {
        // Installed but not activated: a newer worker than the one
        // controlling this page is waiting for the user.
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          setState(STATE_AVAILABLE)
        }
      })
    })
  }

  function apply () {
    const registration = registrationRef
    if (registration?.waiting) {
      reloadOnApply = true
      registration.waiting.postMessage({ code: 'SKIP_WAITING' })
      return
    }
    // No waiting worker to skip (e.g. it activated between detection and the
    // click, or the state came from a previous session's build): a plain
    // reload still delivers the new version via the network-first entries.
    window.location.reload()
  }

  return {
    init,
    apply,
    subscribe,
    getState
  }
}

// App-wide singleton. Named exports keep call sites short and make the
// factory available to tests, which create their own instances.
export const swManager = createSwManager()
export const initSwManager = swManager.init
export const applySwUpdate = swManager.apply
export const subscribeSwUpdate = swManager.subscribe
export const getSwUpdateState = swManager.getState
