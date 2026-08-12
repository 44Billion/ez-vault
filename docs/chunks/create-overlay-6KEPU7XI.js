import {
  applySwUpdate,
  isUpdateAvailable,
  subscribeSwUpdate,
  swUpdateLocales
} from "./chunk-3UMXSOTO.js";
import {
  requestVaultClose
} from "./chunk-MPD2ENSA.js";
import "./chunk-5QIL4A6S.js";
import "./chunk-FHQXEYZ3.js";
import "./chunk-OQVZFKQZ.js";
import "./chunk-JDLAFNFY.js";
import "./chunk-4W5XMQY3.js";
import {
  subscribePomegranateBusy
} from "./chunk-O543PRTQ.js";
import "./chunk-6JMWJLON.js";
import "./chunk-IHWA5BCE.js";
import "./chunk-3RWQBTGN.js";
import {
  pendingMutationNeedsUnlock,
  subscribePendingMutations
} from "./chunk-YSUPLM3X.js";
import "./chunk-AZYRZ53H.js";
import "./chunk-IXU3T4GE.js";
import {
  isUnlocked,
  list,
  subscribe
} from "./chunk-2IRIIQPD.js";
import "./chunk-BDYCOPAX.js";
import {
  defineLocales,
  getT,
  subscribeLocaleChanged
} from "./chunk-KYIGV7TE.js";
import {
  injectComponentStyles
} from "./chunk-3OYOWZEQ.js";
import "./chunk-NZLE2WMY.js";

// src/helpers/create-overlay-visibility.js
function shouldShowCreateOverlay(accounts, pendingNeedsUnlock, vaultUnlocked) {
  return accounts.length === 0 && (!pendingNeedsUnlock || vaultUnlocked);
}

// src/components/create-overlay.js
var ICON_USER_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M16 19h6" /><path d="M19 16v6" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4" /></svg>';
var createOverlayLocales = defineLocales({
  "Create your first account": ["Cr\xE9ez votre premier compte", "Crea il tuo primo account", "Erstelle dein erstes Konto", "Crea tu primera cuenta", "Crie sua primeira conta", "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u0443\u044E \u0443\u0447\u0451\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C", "\u521B\u5EFA\u60A8\u7684\u7B2C\u4E00\u4E2A\u8D26\u6237", "\u5EFA\u7ACB\u60A8\u7684\u7B2C\u4E00\u500B\u5E33\u6236", "\u6700\u521D\u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u4F5C\u6210", "\uCCAB \uACC4\uC815\uC744 \uB9CC\uB4DC\uC138\uC694"],
  "I already have an account": ["J\u2019ai d\xE9j\xE0 un compte", "Ho gi\xE0 un account", "Ich habe bereits ein Konto", "Ya tengo una cuenta", "J\xE1 tenho uma conta", "\u0423 \u043C\u0435\u043D\u044F \u0443\u0436\u0435 \u0435\u0441\u0442\u044C \u0443\u0447\u0451\u0442\u043D\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C", "\u6211\u5DF2\u6709\u8D26\u6237", "\u6211\u5DF2\u6709\u5E33\u6236", "\u3059\u3067\u306B\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u3042\u308A\u307E\u3059", "\uC774\uBBF8 \uACC4\uC815\uC774 \uC788\uC2B5\uB2C8\uB2E4"]
});
var t = getT(createOverlayLocales);
var swT = getT(swUpdateLocales);
var STYLES = (
  /* css */
  `
  create-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 32px 24px;
    background-color: var(--surface-sunken);
    color: var(--fg-strong);
  }
  create-overlay[hidden] {
    display: none;
  }
  create-overlay .create-title {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 18rem;
    font-weight: 600;
    text-align: center;
    margin: 0;
  }
  create-overlay .create-main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    transition: opacity 180ms ease-out;
  }
  create-overlay[data-pomegranate-busy="true"] .create-main {
    opacity: 0.3;
  }
  create-overlay .create-title-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted);
    flex-shrink: 0;
  }
  create-overlay .create-title-icon svg {
    width: 22px;
    height: 22px;
    display: block;
  }
  /* The embedded creating tile reuses the account-avatar flow; only its
     size and touch targets change here. The tile's cancel button is hidden
     because the overlay's own dismiss button owns leaving this screen. */
  create-overlay account-avatar {
    max-width: 160px;
  }
  /* The tile's children are absolutely positioned, so the wrapper needs an
     explicit width or the avatar (width: 100%) collapses to 0x0. */
  create-overlay .create-tile {
    width: 160px;
  }
  create-overlay account-avatar .avatar-btn {
    width: 36px;
    height: 36px;
  }
  create-overlay account-avatar .avatar-btn-icon svg {
    width: 20px;
    height: 20px;
  }
  create-overlay account-avatar .avatar-btn[data-action="cancel-create"] {
    display: none !important;
  }
  create-overlay .create-dismiss {
    background: transparent;
    border: 0;
    padding: 8px 12px;
    border-radius: 8px;
    color: var(--fg-muted);
    font-size: 13rem;
    cursor: pointer;
  }
  create-overlay .create-dismiss:active {
    color: var(--fg-strong);
  }
  create-overlay .create-dismiss:disabled {
    opacity: 0.6;
  }
  create-overlay .overlay-update-indicator {
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
  create-overlay .overlay-update-indicator[hidden] {
    display: none;
  }
  create-overlay .overlay-update-label {
    color: var(--fg);
    font-weight: 500;
  }
  create-overlay .overlay-update-action {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    border-radius: 9999px;
    padding: 6px 12px;
    font-weight: 600;
  }
  create-overlay .overlay-update-indicator:active .overlay-update-action {
    background-color: var(--accent-active);
  }
  create-overlay .overlay-google-login {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  create-overlay .overlay-google-login[inert] {
    opacity: 0.6;
  }
`
);
var CreateOverlay = class extends HTMLElement {
  #unsubStore = null;
  #unsubPending = null;
  #unsubLocale = null;
  #tileObserver = null;
  #tile = null;
  #dismissBtn = null;
  #updateIndicator = null;
  #unsubUpdate = null;
  #dismissed = false;
  #wasVisible = false;
  #closing = false;
  #googleWrap = null;
  #pomegranateBusy = false;
  #unsubPomegranate = null;
  connectedCallback() {
    injectComponentStyles("create-overlay", STYLES);
    this.innerHTML = `
      <button type="button" class="overlay-update-indicator" hidden>
        <span class="overlay-update-label"></span>
        <span class="overlay-update-action"></span>
      </button>
      <div class="create-main">
        <h2 class="create-title">
          <span class="create-title-icon" aria-hidden="true">${ICON_USER_PLUS}</span>
          <span class="create-title-text">Create your first account</span>
        </h2>
        <div class="create-tile"></div>
        <button type="button" class="create-dismiss">I already have an account</button>
      </div>
      <div class="overlay-google-login"><google-login-button></google-login-button></div>
    `;
    this.#dismissBtn = this.querySelector(".create-dismiss");
    this.#dismissBtn.addEventListener("click", this.#onDismiss);
    this.#updateIndicator = this.querySelector(".overlay-update-indicator");
    this.#updateIndicator.addEventListener("click", applySwUpdate);
    this.#googleWrap = this.querySelector(".overlay-google-login");
    this.#unsubPomegranate = subscribePomegranateBusy(this.#setPomegranateBusy);
    document.addEventListener("pomegranate-account-added", this.#onPomegranateAdded);
    this.#unsubUpdate = subscribeSwUpdate(
      (available) => this.#updateIndicator.toggleAttribute("hidden", !isUpdateAvailable(available))
    );
    this.#translate();
    this.#unsubLocale = subscribeLocaleChanged(() => this.#translate());
    this.#applyVisibility();
    this.#unsubStore = subscribe(() => this.#applyVisibility());
    this.#unsubPending = subscribePendingMutations(() => this.#applyVisibility());
  }
  disconnectedCallback() {
    this.#unsubStore?.();
    this.#unsubStore = null;
    this.#unsubPending?.();
    this.#unsubPending = null;
    this.#unsubLocale?.();
    this.#unsubLocale = null;
    this.#dismissBtn?.removeEventListener("click", this.#onDismiss);
    this.#updateIndicator?.removeEventListener("click", applySwUpdate);
    this.#updateIndicator = null;
    this.#unsubUpdate?.();
    this.#unsubUpdate = null;
    this.#unsubPomegranate?.();
    this.#unsubPomegranate = null;
    document.removeEventListener("pomegranate-account-added", this.#onPomegranateAdded);
    this.#googleWrap = null;
    this.#removeTile();
  }
  #applyVisibility() {
    const accounts = list();
    const pendingNeedsUnlock = pendingMutationNeedsUnlock();
    const ownCreateInFlight = this.#tile?.getAttribute("mode") === "creating";
    const shouldShow = !this.#dismissed && (ownCreateInFlight || shouldShowCreateOverlay(accounts, pendingNeedsUnlock, isUnlocked()));
    if (shouldShow) {
      this.#wasVisible = true;
      this.#closing = false;
      this.toggleAttribute("hidden", false);
      this.#ensureTile();
      return;
    }
    if (this.#closing) return;
    if (this.#wasVisible && !this.#dismissed && accounts.length > 0) {
      this.#closeAfterCreation();
      return;
    }
    this.#wasVisible = false;
    this.toggleAttribute("hidden", true);
    this.#removeTile();
  }
  #ensureTile() {
    if (this.#tile?.isConnected) return;
    const tile = document.createElement("account-avatar");
    tile.setAttribute("mode", "creating");
    this.querySelector(".create-tile").appendChild(tile);
    this.#tile = tile;
    this.#watchTile(tile);
  }
  #removeTile() {
    this.#stopWatchingTile();
    this.#tile?.remove();
    this.#tile = null;
  }
  #watchTile(tile) {
    this.#stopWatchingTile();
    this.#tileObserver = new MutationObserver(() => {
      this.#syncBusyState();
    });
    this.#tileObserver.observe(tile, { attributes: true, attributeFilter: ["aria-busy"] });
    this.#syncBusyState();
  }
  #stopWatchingTile() {
    this.#tileObserver?.disconnect();
    this.#tileObserver = null;
  }
  #setPomegranateBusy = (busy) => {
    this.#pomegranateBusy = busy;
    this.dataset.pomegranateBusy = String(busy);
    this.#syncBusyState();
  };
  #onPomegranateAdded = () => {
    if (!this.#wasVisible || this.hasAttribute("hidden")) return;
    this.#closeAfterCreation();
  };
  #closeAfterCreation() {
    if (this.#closing) return;
    this.#closing = true;
    requestVaultClose().then(() => {
      this.#closing = false;
      this.#wasVisible = false;
      this.toggleAttribute("hidden", true);
      this.#removeTile();
    });
  }
  #syncBusyState() {
    const tileBusy = this.#tile?.hasAttribute("aria-busy") || false;
    if (this.#dismissBtn) this.#dismissBtn.disabled = tileBusy || this.#pomegranateBusy;
    if (this.#tile) this.#tile.inert = this.#pomegranateBusy;
    if (this.#googleWrap) this.#googleWrap.inert = tileBusy;
  }
  #onDismiss = () => {
    if (this.#dismissBtn.disabled) return;
    this.#dismissed = true;
    this.#applyVisibility();
  };
  #translate() {
    this.querySelector(".create-title-text").textContent = t("Create your first account");
    this.querySelector(".create-dismiss").textContent = t("I already have an account");
    this.querySelector(".overlay-update-label").textContent = swT("Update available");
    this.querySelector(".overlay-update-action").textContent = swT("Update");
  }
};
customElements.define("create-overlay", CreateOverlay);
export {
  CreateOverlay,
  createOverlayLocales
};
