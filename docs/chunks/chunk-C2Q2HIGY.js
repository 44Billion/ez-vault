import {
  defineLocales
} from "./chunk-KYIGV7TE.js";

// src/i18n/sw-update.js
var swUpdateLocales = defineLocales({
  "Update available": ["Mise \xE0 jour disponible", "Aggiornamento disponibile", "Update verf\xFCgbar", "Actualizaci\xF3n disponible", "Atualiza\xE7\xE3o dispon\xEDvel", "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435", "\u6709\u53EF\u7528\u66F4\u65B0", "\u6709\u53EF\u7528\u66F4\u65B0", "\u30A2\u30C3\u30D7\u30C7\u30FC\u30C8\u304C\u3042\u308A\u307E\u3059", "\uC5C5\uB370\uC774\uD2B8 \uC0AC\uC6A9 \uAC00\uB2A5"],
  Update: ["Mettre \xE0 jour", "Aggiorna", "Aktualisieren", "Actualizar", "Atualizar", "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C", "\u66F4\u65B0", "\u66F4\u65B0", "\u66F4\u65B0", "\uC5C5\uB370\uC774\uD2B8"]
});

// src/services/sw-manager.js
var STATE_NONE = "none";
var STATE_AVAILABLE = "available";
var isUpdateAvailable = (state) => state === STATE_AVAILABLE;
function isDev() {
  return false;
}
function createSwManager() {
  let state = STATE_NONE;
  let registrationRef = null;
  let reloadOnApply = false;
  const listeners = /* @__PURE__ */ new Set();
  function setState(next) {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener(state);
  }
  function getState() {
    return state;
  }
  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }
  async function init() {
    if (isDev()) {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration2) => registration2.unregister()));
        } catch (err) {
          console.warn("Failed to unregister development service workers", err?.message ?? err);
        }
      }
      return;
    }
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let registration;
    try {
      registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      }
    } catch (err) {
      console.warn("Failed to register service worker", err?.message ?? err);
      return;
    }
    registrationRef = registration;
    setInterval(() => registration.update(), 60 * 60 * 1e3);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update();
      });
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloadOnApply) return;
      reloadOnApply = false;
      window.location.reload();
    });
    if (registration.waiting) {
      setState(STATE_AVAILABLE);
      return;
    }
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          setState(STATE_AVAILABLE);
        }
      });
    });
  }
  function apply() {
    const registration = registrationRef;
    if (registration?.waiting) {
      reloadOnApply = true;
      registration.waiting.postMessage({ code: "SKIP_WAITING" });
      return;
    }
    window.location.reload();
  }
  return {
    init,
    apply,
    subscribe,
    getState
  };
}
var swManager = createSwManager();
var initSwManager = swManager.init;
var applySwUpdate = swManager.apply;
var subscribeSwUpdate = swManager.subscribe;
var getSwUpdateState = swManager.getState;

export {
  swUpdateLocales,
  isUpdateAvailable,
  initSwManager,
  applySwUpdate,
  subscribeSwUpdate
};
