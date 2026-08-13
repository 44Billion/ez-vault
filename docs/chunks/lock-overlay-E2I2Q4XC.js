import {
  applySwUpdate,
  isUpdateAvailable,
  subscribeSwUpdate,
  swUpdateLocales
} from "./chunk-3UMXSOTO.js";
import {
  requestVaultClose
} from "./chunk-J2FW6PU5.js";
import "./chunk-5QIL4A6S.js";
import "./chunk-JDLAFNFY.js";
import "./chunk-4W5XMQY3.js";
import {
  filterVisibleAccounts,
  pendingMutationNeedsUnlock,
  subscribePendingMutations
} from "./chunk-YSUPLM3X.js";
import "./chunk-AZYRZ53H.js";
import {
  flushPendingIconUpdate,
  unlock
} from "./chunk-IXU3T4GE.js";
import {
  isUnlocked,
  list,
  subscribe,
  subscribe2
} from "./chunk-2IRIIQPD.js";
import {
  error
} from "./chunk-BDYCOPAX.js";
import {
  defineLocales,
  getT,
  subscribeLocaleChanged
} from "./chunk-KYIGV7TE.js";
import {
  injectComponentStyles
} from "./chunk-3OYOWZEQ.js";
import "./chunk-NZLE2WMY.js";

// src/components/lock-overlay.js
var ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>';
var lockOverlayLocales = defineLocales({
  "Vault locked": ["Coffre verrouill\xE9", "Vault bloccato", "Tresor gesperrt", "B\xF3veda bloqueada", "Cofre bloqueado", "\u0425\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E", "\u4FDD\u9669\u5E93\u5DF2\u9501\u5B9A", "\u4FDD\u96AA\u5EAB\u5DF2\u9396\u5B9A", "\u4FDD\u7BA1\u5EAB\u306F\u30ED\u30C3\u30AF\u3055\u308C\u3066\u3044\u307E\u3059", "\uBCFC\uD2B8 \uC7A0\uAE40"],
  "Unlock your encrypted account secrets with your passkey.": ["D\xE9verrouillez les secrets chiffr\xE9s de vos comptes avec votre cl\xE9 d\u2019acc\xE8s.", "Sblocca con la passkey i segreti cifrati dei tuoi account.", "Entsperre deine verschl\xFCsselten Kontogeheimnisse mit deinem Passkey.", "Desbloquea con tu passkey los secretos cifrados de tus cuentas.", "Desbloqueie com a passkey os segredos criptografados das suas contas.", "\u0420\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u0443\u0439\u0442\u0435 \u0437\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0441\u0435\u043A\u0440\u0435\u0442\u044B \u0443\u0447\u0451\u0442\u043D\u044B\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0441 \u043F\u043E\u043C\u043E\u0449\u044C\u044E \u043A\u043B\u044E\u0447\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430.", "\u4F7F\u7528\u901A\u884C\u5BC6\u94A5\u89E3\u9501\u52A0\u5BC6\u7684\u8D26\u6237\u673A\u5BC6\u3002", "\u4F7F\u7528\u901A\u884C\u91D1\u9470\u89E3\u9396\u52A0\u5BC6\u7684\u5E33\u6236\u6A5F\u5BC6\u3002", "\u30D1\u30B9\u30AD\u30FC\u3067\u6697\u53F7\u5316\u3055\u308C\u305F\u30A2\u30AB\u30A6\u30F3\u30C8\u306E\u79D8\u5BC6\u60C5\u5831\u3092\u30ED\u30C3\u30AF\u89E3\u9664\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "\uD328\uC2A4\uD0A4\uB85C \uC554\uD638\uD654\uB41C \uACC4\uC815 \uBE44\uBC00\uC744 \uC7A0\uAE08 \uD574\uC81C\uD558\uC138\uC694."],
  "Unlock with passkey": ["D\xE9verrouiller avec la cl\xE9 d\u2019acc\xE8s", "Sblocca con passkey", "Mit Passkey entsperren", "Desbloquear con passkey", "Desbloquear com passkey", "\u0420\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u043B\u044E\u0447\u043E\u043C \u0434\u043E\u0441\u0442\u0443\u043F\u0430", "\u4F7F\u7528\u901A\u884C\u5BC6\u94A5\u89E3\u9501", "\u4F7F\u7528\u901A\u884C\u91D1\u9470\u89E3\u9396", "\u30D1\u30B9\u30AD\u30FC\u3067\u30ED\u30C3\u30AF\u89E3\u9664", "\uD328\uC2A4\uD0A4\uB85C \uC7A0\uAE08 \uD574\uC81C"],
  "Could not unlock": ["Impossible de d\xE9verrouiller", "Impossibile sbloccare", "Entsperren nicht m\xF6glich", "No se pudo desbloquear", "N\xE3o foi poss\xEDvel desbloquear", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "\u65E0\u6CD5\u89E3\u9501", "\u7121\u6CD5\u89E3\u9396", "\u30ED\u30C3\u30AF\u3092\u89E3\u9664\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", "\uC7A0\uAE08\uC744 \uD574\uC81C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4"]
});
var t = getT(lockOverlayLocales);
var swT = getT(swUpdateLocales);
var STYLES = (
  /* css */
  `
  lock-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 32px 24px;
    background-color: var(--surface-sunken);
    color: var(--fg-strong);
  }
  lock-overlay[hidden] {
    display: none;
  }
  lock-overlay .lock-badge {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    background-color: var(--surface);
    box-shadow: 0 0 0 2px var(--accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-fg);
  }
  lock-overlay .lock-badge svg {
    width: 44px;
    height: 44px;
  }
  lock-overlay .lock-title {
    font-size: 18rem;
    font-weight: 600;
    text-align: center;
    margin: 0;
  }
  lock-overlay .lock-hint {
    font-size: 13rem;
    color: var(--fg-muted);
    text-align: center;
    margin: 0;
    max-width: 280px;
    line-height: 1.4;
  }
  lock-overlay .lock-unlock {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: var(--success);
    color: var(--fg-on-accent);
    border-radius: 9999px;
    padding: 12px 24px;
    font-size: 14rem;
    font-weight: 600;
    min-width: 200px;
  }
  lock-overlay .lock-unlock:active {
    background-color: var(--success-active);
  }
  lock-overlay .lock-unlock:disabled {
    opacity: 0.7;
  }
  lock-overlay .lock-unlock-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  lock-overlay .lock-unlock-icon svg {
    width: 18px;
    height: 18px;
    display: block;
  }
  lock-overlay .overlay-update-indicator {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px 6px 14px;
    background-color: var(--surface-raised);
    color: var(--fg-strong);
    border: 1px solid var(--border);
    border-radius: 9999px;
    font-size: 13rem;
    cursor: pointer;
  }
  lock-overlay .overlay-update-indicator[hidden] {
    display: none;
  }
  lock-overlay .overlay-update-label {
    color: var(--fg);
    font-weight: 500;
  }
  lock-overlay .overlay-update-action {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    border-radius: 9999px;
    padding: 6px 12px;
    font-weight: 600;
  }
  lock-overlay .overlay-update-indicator:active .overlay-update-action {
    background-color: var(--accent-active);
  }
`
);
function shouldShow() {
  if (isUnlocked()) return false;
  if (pendingMutationNeedsUnlock()) return true;
  return filterVisibleAccounts(list()).some((a) => a.type !== "npub");
}
var LockOverlay = class extends HTMLElement {
  #unsubStore = null;
  #unsubSecrets = null;
  #unsubPending = null;
  #unlockBtn = null;
  #unlockIcon = null;
  #unsubLocale = null;
  #updateIndicator = null;
  #unsubUpdate = null;
  #wasVisible = false;
  #closing = false;
  connectedCallback() {
    injectComponentStyles("lock-overlay", STYLES);
    this.innerHTML = `
      <button type="button" class="overlay-update-indicator" hidden>
        <span class="overlay-update-label"></span>
        <span class="overlay-update-action"></span>
      </button>
      <span class="lock-badge" aria-hidden="true">${ICON_LOCK}</span>
      <h2 class="lock-title">Vault locked</h2>
      <p class="lock-hint">Unlock your encrypted account secrets with your passkey.</p>
      <button type="button" class="lock-unlock">
        <span class="lock-unlock-icon">${ICON_LOCK}</span>
        <span>Unlock with passkey</span>
      </button>
    `;
    this.#unlockBtn = this.querySelector(".lock-unlock");
    this.#unlockIcon = this.querySelector(".lock-unlock-icon");
    this.#unlockBtn.addEventListener("click", this.#onUnlock);
    this.#updateIndicator = this.querySelector(".overlay-update-indicator");
    this.#updateIndicator.addEventListener("click", applySwUpdate);
    this.#unsubUpdate = subscribeSwUpdate(
      (available) => this.#updateIndicator.toggleAttribute("hidden", !isUpdateAvailable(available))
    );
    this.#translate();
    this.#unsubLocale = subscribeLocaleChanged(() => this.#translate());
    this.#applyVisibility();
    this.#unsubStore = subscribe(() => this.#applyVisibility());
    this.#unsubSecrets = subscribe2(() => this.#applyVisibility());
    this.#unsubPending = subscribePendingMutations(() => this.#applyVisibility());
  }
  disconnectedCallback() {
    this.#unsubStore?.();
    this.#unsubStore = null;
    this.#unsubSecrets?.();
    this.#unsubSecrets = null;
    this.#unsubPending?.();
    this.#unsubPending = null;
    this.#unlockBtn?.removeEventListener("click", this.#onUnlock);
    this.#updateIndicator?.removeEventListener("click", applySwUpdate);
    this.#updateIndicator = null;
    this.#unsubUpdate?.();
    this.#unsubUpdate = null;
    this.#unsubLocale?.();
    this.#unsubLocale = null;
  }
  #applyVisibility() {
    const show = shouldShow();
    if (show) {
      this.#wasVisible = true;
      this.#closing = false;
      this.toggleAttribute("hidden", false);
      return;
    }
    if (this.#closing) return;
    if (this.#wasVisible && isUnlocked()) {
      this.#closing = true;
      requestVaultClose().then(() => {
        this.#closing = false;
        this.#wasVisible = false;
        this.toggleAttribute("hidden", true);
      });
      return;
    }
    this.#wasVisible = false;
    this.toggleAttribute("hidden", true);
  }
  #onUnlock = async () => {
    if (this.#unlockBtn.disabled) return;
    this.#unlockBtn.disabled = true;
    this.#unlockIcon.classList.add("pulsate");
    try {
      await unlock();
      flushPendingIconUpdate().catch((err) => {
        console.warn("icon signal failed", err?.message ?? err);
      });
    } catch (err) {
      console.error("passkey unlock failed", err?.message ?? err);
      error(t("Could not unlock"), err?.message ?? "");
    } finally {
      this.#unlockBtn.disabled = false;
      this.#unlockIcon.classList.remove("pulsate");
    }
  };
  #translate() {
    this.querySelector(".lock-title").textContent = t("Vault locked");
    this.querySelector(".lock-hint").textContent = t("Unlock your encrypted account secrets with your passkey.");
    this.querySelector(".lock-unlock span:last-child").textContent = t("Unlock with passkey");
    this.querySelector(".overlay-update-label").textContent = swT("Update available");
    this.querySelector(".overlay-update-action").textContent = swT("Update");
  }
};
customElements.define("lock-overlay", LockOverlay);
export {
  LockOverlay,
  lockOverlayLocales
};
