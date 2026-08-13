import {
  requestVaultClose,
  setAccountsState
} from "./chunk-RE3N5ASP.js";
import "./chunk-2G6OKGLI.js";
import "./chunk-JDLAFNFY.js";
import "./chunk-SCLRGSUQ.js";
import {
  hasPendingMutation,
  subscribePendingMutations
} from "./chunk-7VBC3JAI.js";
import "./chunk-AZYRZ53H.js";
import {
  isExpectedPasskeyRegistrationFailure,
  requirePasskey
} from "./chunk-4QDFHAFY.js";
import {
  isUnlocked,
  lock,
  subscribe2 as subscribe
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

// src/services/vault-lock.js
async function lockAndCloseVault({
  _requirePasskey = requirePasskey,
  _lock = lock,
  _publishAccountsState = setAccountsState,
  _requestVaultClose = requestVaultClose
} = {}) {
  await _requirePasskey();
  _lock();
  _publishAccountsState();
  await _requestVaultClose();
}

// src/components/vault-lock-button.js
var ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>';
var vaultLockLocales = defineLocales({
  Lock: ["Verrouiller", "Blocca", "Sperren", "Bloquear", "Bloquear", "\u0417\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "\u9501\u5B9A", "\u9396\u5B9A", "\u30ED\u30C3\u30AF", "\uC7A0\uADF8\uAE30"],
  "Could not lock vault": ["Impossible de verrouiller le coffre", "Impossibile bloccare il vault", "Tresor konnte nicht gesperrt werden", "No se pudo bloquear la b\xF3veda", "N\xE3o foi poss\xEDvel bloquear o cofre", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435", "\u65E0\u6CD5\u9501\u5B9A\u4FDD\u9669\u5E93", "\u7121\u6CD5\u9396\u5B9A\u4FDD\u96AA\u5EAB", "\u30DC\u30FC\u30EB\u30C8\u3092\u30ED\u30C3\u30AF\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", "\uBCFC\uD2B8\uB97C \uC7A0\uAE00 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"],
  "A passkey is required to lock the vault.": ["Une cl\xE9 d\u2019acc\xE8s est n\xE9cessaire pour verrouiller le coffre.", "Per bloccare il vault \xE8 necessaria una passkey.", "Zum Sperren des Tresors ist ein Passkey erforderlich.", "Se necesita una llave de acceso para bloquear la b\xF3veda.", "Uma chave de acesso \xE9 obrigat\xF3ria para bloquear o cofre.", "\u0414\u043B\u044F \u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u043A\u0438 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0430 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043A\u043B\u044E\u0447 \u0434\u043E\u0441\u0442\u0443\u043F\u0430.", "\u9501\u5B9A\u4FDD\u9669\u5E93\u9700\u8981\u901A\u884C\u5BC6\u94A5\u3002", "\u9396\u5B9A\u4FDD\u96AA\u5EAB\u9700\u8981\u901A\u884C\u5BC6\u9470\u3002", "\u30DC\u30FC\u30EB\u30C8\u3092\u30ED\u30C3\u30AF\u3059\u308B\u306B\u306F\u30D1\u30B9\u30AD\u30FC\u304C\u5FC5\u8981\u3067\u3059\u3002", "\uBCFC\uD2B8\uB97C \uC7A0\uADF8\uB824\uBA74 \uD328\uC2A4\uD0A4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."]
});
var t = getT(vaultLockLocales);
var STYLES = (
  /* css */
  `
  vault-lock-button {
    position: fixed;
    left: 50%;
    bottom: 16px;
    z-index: 100;
    transform: translateX(-50%);
  }
  vault-lock-button[hidden] {
    display: none;
  }
  vault-lock-button .vault-lock-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 38px;
    padding: 8px 15px;
    border: 1px solid var(--border);
    border-radius: 9999px;
    background-color: var(--surface-raised);
    color: var(--fg-strong);
    box-shadow: 0 4px 14px var(--shadow);
    font-size: 13rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  vault-lock-button .vault-lock-button:active:not(:disabled) {
    background-color: var(--surface-interactive-active);
  }
  vault-lock-button .vault-lock-button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  vault-lock-button .vault-lock-icon {
    display: inline-flex;
    width: 17px;
    height: 17px;
  }
  vault-lock-button .vault-lock-icon svg {
    width: 100%;
    height: 100%;
  }
  vault-lock-button .vault-lock-content.is-pulsing {
    animation: vault-lock-pulse 900ms ease-in-out infinite alternate;
  }
  vault-lock-button .vault-lock-content {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  @keyframes vault-lock-pulse {
    from { opacity: 0.45; }
    to { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    vault-lock-button .vault-lock-content.is-pulsing { animation: none; }
  }
`
);
var VaultLockButton = class extends HTMLElement {
  #button = null;
  #content = null;
  #busy = false;
  #flowDisabled = false;
  #pendingMutation = false;
  #unsubscribeSecrets = null;
  #unsubscribePending = null;
  #unsubscribeLocale = null;
  connectedCallback() {
    injectComponentStyles("vault-lock-button", STYLES);
    this.innerHTML = `
      <button type="button" class="vault-lock-button">
        <span class="vault-lock-content">
          <span class="vault-lock-icon" aria-hidden="true">${ICON_LOCK}</span>
          <span class="vault-lock-label"></span>
        </span>
      </button>
    `;
    this.#button = this.querySelector("button");
    this.#content = this.querySelector(".vault-lock-content");
    this.#button.addEventListener("click", this.#onClick);
    this.#pendingMutation = hasPendingMutation();
    this.#unsubscribeSecrets = subscribe(() => this.#syncState());
    this.#unsubscribePending = subscribePendingMutations(() => {
      this.#pendingMutation = hasPendingMutation();
      this.#syncState();
    });
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate());
    this.#translate();
    this.#syncState();
  }
  disconnectedCallback() {
    this.#button?.removeEventListener("click", this.#onClick);
    this.#unsubscribeSecrets?.();
    this.#unsubscribePending?.();
    this.#unsubscribeLocale?.();
    this.#unsubscribeSecrets = null;
    this.#unsubscribePending = null;
    this.#unsubscribeLocale = null;
  }
  get disabled() {
    return this.#flowDisabled;
  }
  set disabled(value) {
    this.#flowDisabled = Boolean(value);
    this.#syncState();
  }
  #translate() {
    const label = t("Lock");
    this.querySelector(".vault-lock-label")?.replaceChildren(label);
    if (this.#button) {
      this.#button.title = label;
      this.#button.setAttribute("aria-label", label);
    }
  }
  #syncState() {
    this.hidden = !isUnlocked();
    if (this.#button) {
      this.#button.disabled = this.#busy || this.#flowDisabled || this.#pendingMutation;
    }
  }
  #onClick = async () => {
    if (this.#busy || this.#button?.disabled) return;
    this.#busy = true;
    this.#content?.classList.add("is-pulsing");
    this.#syncState();
    try {
      await lockAndCloseVault();
    } catch (err) {
      const detail = isExpectedPasskeyRegistrationFailure(err) ? t("A passkey is required to lock the vault.") : err?.message ?? String(err);
      if (!isExpectedPasskeyRegistrationFailure(err)) {
        console.error("vault lock failed", err);
      }
      error(t("Could not lock vault"), detail);
    } finally {
      this.#busy = false;
      this.#content?.classList.remove("is-pulsing");
      this.#syncState();
    }
  };
};
if (!customElements.get("vault-lock-button")) {
  customElements.define("vault-lock-button", VaultLockButton);
}
export {
  VaultLockButton,
  vaultLockLocales
};
