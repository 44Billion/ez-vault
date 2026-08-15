// Boot failsafe, inlined into index.html by bin/build.js (no module
// dependencies). #vault starts hidden and index.js reveals it only after the
// module graph initializes. If a deploy serves a stale index.html that
// references chunks that no longer exist, the module graph fails and the page
// would stay blank (CSS still paints). This script logs script errors,
// recovers once per session with an automatic reload, and then shows a manual
// reload overlay instead of a blank page.
(function () {
  const BOOT_TIMEOUT_MS = 12000
  const POLL_MS = 1000
  const FLAG = 'ezVaultBootAutoReloaded'
  let vaultEl = null
  let overlayEl = null
  const startedAt = Date.now()

  function storageGet () {
    try {
      return window.sessionStorage.getItem(FLAG) === '1'
    } catch {
      return false
    }
  }
  function storageSet (value) {
    try {
      if (value) window.sessionStorage.setItem(FLAG, '1')
      else window.sessionStorage.removeItem(FLAG)
    } catch {
      // sessionStorage may be unavailable (private mode, blocked storage)
    }
  }

  function isBooted () {
    if (!vaultEl) vaultEl = document.getElementById('vault')
    return Boolean(vaultEl && vaultEl.style && vaultEl.style.visibility === 'visible')
  }

  function showOverlay () {
    if (!overlayEl) overlayEl = document.getElementById('boot-failed-overlay')
    if (!overlayEl) return
    const lang = (navigator.language || 'en').toLowerCase()
    const isPt = lang === 'pt' || lang.startsWith('pt-')
    const messageEl = overlayEl.querySelector('[data-boot-failed-message]')
    if (messageEl) {
      messageEl.textContent = isPt ? 'Falha ao carregar o vault. Recarregar?' : 'Vault failed to load. Reload?'
    }
    const button = overlayEl.querySelector('[data-boot-failed-reload]')
    if (button) {
      button.onclick = () => {
        storageSet(false)
        window.location.reload()
      }
    }
    overlayEl.hidden = false
  }

  window.addEventListener('error', event => {
    console.warn('[vault-boot] script error:', event.message || event.type, event.filename || window.location.href, event.lineno || '')
  })
  window.addEventListener('unhandledrejection', event => {
    console.warn('[vault-boot] unhandled rejection:', event.reason)
  })

  const intervalId = setInterval(() => {
    if (isBooted()) {
      clearInterval(intervalId)
      return
    }
    if (Date.now() - startedAt < BOOT_TIMEOUT_MS) return

    clearInterval(intervalId)
    if (!storageGet()) {
      // First failure this session: one automatic reload. index.js clears the
      // flag on a successful boot so the next real failure gets its automatic
      // attempt again.
      storageSet(true)
      console.warn('[vault-boot] vault did not boot in ' + BOOT_TIMEOUT_MS + 'ms; reloading once', window.location.href)
      window.location.reload()
      return
    }
    console.warn('[vault-boot] vault still did not boot after the automatic reload; showing manual reload', window.location.href)
    showOverlay()
  }, POLL_MS)
})()
