import {
  subscribePomegranateBusy
} from "./chunk-O543PRTQ.js";
import "./chunk-6JMWJLON.js";
import {
  QrScanner,
  isCameraSupported
} from "./chunk-N4KMIQDP.js";
import {
  abortIntake,
  commitPrepared,
  createIntakeToken,
  prepareBunker,
  prepareNpub,
  prepareSeckey
} from "./chunk-IHWA5BCE.js";
import "./chunk-3RWQBTGN.js";
import "./chunk-YSUPLM3X.js";
import "./chunk-AZYRZ53H.js";
import {
  ensureRegistered
} from "./chunk-IXU3T4GE.js";
import "./chunk-2IRIIQPD.js";
import {
  info
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

// src/components/account-add.js
var ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>';
var ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>';
var ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>';
var ICON_CAMERA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1a2 2 0 0 0 2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>';
var ERROR_FLASH_MS = 1500;
var accountAddLocales = defineLocales({
  Cancel: ["Annuler", "Annulla", "Abbrechen", "Cancelar", "Cancelar", "\u041E\u0442\u043C\u0435\u043D\u0430", "\u53D6\u6D88", "\u53D6\u6D88", "\u30AD\u30E3\u30F3\u30BB\u30EB", "\uCDE8\uC18C"],
  "Add a private key, public key, or bunker URL": ["Ajouter une cl\xE9 priv\xE9e, une cl\xE9 publique ou une URL bunker", "Aggiungi una chiave privata, pubblica o un URL bunker", "Privaten Schl\xFCssel, \xF6ffentlichen Schl\xFCssel oder Bunker-URL hinzuf\xFCgen", "A\xF1adir una clave privada, p\xFAblica o una URL bunker", "Adicionar uma chave privada, p\xFAblica ou URL bunker", "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043A\u0440\u044B\u0442\u044B\u0439 \u043A\u043B\u044E\u0447, \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0439 \u043A\u043B\u044E\u0447 \u0438\u043B\u0438 URL bunker", "\u6DFB\u52A0\u79C1\u94A5\u3001\u516C\u94A5\u6216 bunker URL", "\u65B0\u589E\u79C1\u9470\u3001\u516C\u9470\u6216 bunker URL", "\u79D8\u5BC6\u9375\u3001\u516C\u958B\u9375\u3001\u307E\u305F\u306F bunker URL \u3092\u8FFD\u52A0", "\uAC1C\uC778 \uD0A4, \uACF5\uAC1C \uD0A4 \uB610\uB294 bunker URL \uCD94\uAC00"],
  "Scan QR": ["Scanner le QR", "Scansiona QR", "QR scannen", "Escanear QR", "Ler QR", "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C QR", "\u626B\u63CF\u4E8C\u7EF4\u7801", "\u6383\u63CF QR \u78BC", "QR \u3092\u30B9\u30AD\u30E3\u30F3", "QR \uC2A4\uCE94"],
  Add: ["Ajouter", "Aggiungi", "Hinzuf\xFCgen", "A\xF1adir", "Adicionar", "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C", "\u6DFB\u52A0", "\u65B0\u589E", "\u8FFD\u52A0", "\uCD94\uAC00"],
  Or: ["Ou", "Oppure", "Oder", "O", "Ou", "\u0418\u043B\u0438", "\u6216", "\u6216", "\u307E\u305F\u306F", "\uB610\uB294"],
  "Stop scanning": ["Arr\xEAter le scan", "Interrompi scansione", "Scannen beenden", "Detener escaneo", "Parar leitura", "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435", "\u505C\u6B62\u626B\u63CF", "\u505C\u6B62\u6383\u63CF", "\u30B9\u30AD\u30E3\u30F3\u3092\u505C\u6B62", "\uC2A4\uCE94 \uC911\uC9C0"],
  'Use "Sync Devices" for nostrpair URLs.': ["Utilisez \xAB Synchroniser les appareils \xBB pour les URL nostrpair.", 'Usa "Sincronizza dispositivi" per gli URL nostrpair.', "Verwende \u201EGer\xE4te synchronisieren\u201C f\xFCr nostrpair-URLs.", "Usa \xABSincronizar dispositivos\xBB para las URL nostrpair.", "Use \u201CSincronizar dispositivos\u201D para URLs nostrpair.", "\u0414\u043B\u044F URL nostrpair \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \xAB\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430\xBB.", "\u8BF7\u4F7F\u7528\u201C\u540C\u6B65\u8BBE\u5907\u201D\u5904\u7406 nostrpair URL\u3002", "\u8ACB\u4F7F\u7528\u300C\u540C\u6B65\u88DD\u7F6E\u300D\u8655\u7406 nostrpair URL\u3002", "nostrpair URL \u306B\u306F\u300C\u30C7\u30D0\u30A4\u30B9\u3092\u540C\u671F\u300D\u3092\u4F7F\u7528\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "nostrpair URL\uC5D0\uB294 \u201C\uAE30\uAE30 \uB3D9\uAE30\uD654\u201D\uB97C \uC0AC\uC6A9\uD558\uC138\uC694."]
});
var t = getT(accountAddLocales);
var STYLES = (
  /* css */
  `
  account-add {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  account-add[open] {
    max-height: 152px;
  }
  /* Scan flow swaps the input row out for a camera preview + Stop button.
     Drop the height cap entirely so the video gets its natural box. */
  account-add[open][data-scanning="true"] {
    max-height: 420px;
  }
  account-add .add-form {
    padding-top: 12px;
  }
  account-add .add-input-row {
    position: relative;
  }
  account-add .add-input {
    padding-left: 36px;
    padding-right: 42px;
    background-color: var(--surface-interactive);
  }
  account-add[data-camera="true"] .add-input {
    padding-right: 78px;
  }
  account-add .add-btn {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-strong)
  }
  account-add .add-btn:disabled {
    opacity: 0.6;
  }
  account-add .add-btn[data-action="cancel"] {
    top: 50%;
    transform: translateY(-50%);
    left: 5px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: transparent;
  }
  account-add .add-btn[data-action="cancel"]:active {
    background-color: var(--surface-interactive-active);
  }
  account-add .add-btn[data-action="scan"] {
    top: 50%;
    transform: translateY(-50%);
    right: 42px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: transparent;
    display: none;
  }
  account-add[data-camera="true"] .add-btn[data-action="scan"] {
    display: inline-flex;
  }
  account-add .add-btn[data-action="scan"]:active {
    background-color: var(--surface-interactive-active);
  }
  account-add .add-btn[data-action="confirm"] {
    top: 0;
    right: 0;
    bottom: 0;
    width: 36px;
    border-radius: 0 7px 7px 0;
    background-color: var(--success);
  }
  account-add .add-btn[data-action="confirm"]:active {
    background-color: var(--success-active);
  }
  account-add .add-btn[data-action="confirm"].is-error {
    background-color: var(--error);
    color: var(--fg-on-accent);
  }
  account-add .add-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  account-add .add-btn-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  account-add .add-btn[data-action="scan"] svg {
    width: 16px;
    height: 16px;
  }
  account-add .add-method-separator {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0;
    color: var(--fg-faint);
    font-size: 11rem;
    line-height: 1;
    text-transform: lowercase;
  }
  account-add .add-method-separator::before,
  account-add .add-method-separator::after {
    content: '';
    flex: 1;
    height: 1px;
    background-color: var(--border);
  }
  account-add .google-login-row {
    display: flex;
    justify-content: center;
  }
  account-add .google-login-row .google-login-button {
    width: 100%;
  }
  account-add .scan-overlay {
    display: none;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
  }
  account-add[data-scanning="true"] .scan-overlay {
    display: flex;
  }
  account-add[data-scanning="true"] .add-form {
    display: none;
  }
  account-add .scan-video-wrap {
    position: relative;
  }
  account-add .scan-video {
    width: 100%;
    max-height: 320px;
    border-radius: 8px;
    background-color: var(--surface-sunken);
    object-fit: cover;
    display: block;
  }
  account-add .scan-stop {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: var(--scrim);
    color: var(--fg-on-accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 1px 2px var(--shadow-strong));
    z-index: 1;
  }
  account-add .scan-stop:active {
    background-color: var(--scrim-strong);
  }
  account-add .scan-stop svg {
    width: 18px;
    height: 18px;
  }
`
);
var TEMPLATE = (
  /* html */
  `
  <form class="add-form" autocomplete="off">
    <div class="add-input-row">
      <button class="add-btn" data-action="cancel" type="button" title="Cancel">
        <span class="add-btn-icon">${ICON_X}</span>
      </button>
      <input class="add-input" type="text" placeholder="nsec1.../hex, npub1..., or bunker://" spellcheck="false" autocorrect="off" autocapitalize="off" />
      <button class="add-btn" data-action="scan" type="button" title="Scan QR">${ICON_CAMERA}</button>
      <button class="add-btn" data-action="confirm" type="submit" title="Add">
        <span class="add-btn-icon">${ICON_CHECK}</span>
      </button>
    </div>
    <div class="add-method-separator" role="separator"><span></span></div>
    <div class="google-login-row"><google-login-button></google-login-button></div>
  </form>
  <div class="scan-overlay">
    <div class="scan-video-wrap">
      <button class="scan-stop" type="button" title="Stop scanning">${ICON_X}</button>
    </div>
  </div>
`
);
var AccountAdd = class extends HTMLElement {
  #form;
  #input;
  #cancelBtn;
  #scanBtn;
  #confirmBtn;
  #confirmIcon;
  #methodSeparator;
  #scanWrap;
  #scanStopBtn;
  #errorTimer = null;
  #busy = false;
  #scanner = null;
  #activeIntake = null;
  #unsubscribeLocale = null;
  #unsubscribePomegranate = null;
  #pomegranateBusy = false;
  // Wired by index.js. `toolbarButtons` are the sibling toolbar buttons
  // we grey out while the add panel owns the screen; `activeButton` is
  // our own toolbar button, flipped to .is-active for the duration so
  // the user can tell which feature is open.
  toolbarButtons = [];
  activeButton = null;
  connectedCallback() {
    injectComponentStyles("account-add", STYLES);
    this.innerHTML = TEMPLATE;
    this.#form = this.querySelector(".add-form");
    this.#input = this.querySelector(".add-input");
    this.#cancelBtn = this.querySelector('button[data-action="cancel"]');
    this.#scanBtn = this.querySelector('button[data-action="scan"]');
    this.#confirmBtn = this.querySelector('button[data-action="confirm"]');
    this.#confirmIcon = this.#confirmBtn.querySelector(".add-btn-icon");
    this.#methodSeparator = this.querySelector(".add-method-separator");
    this.#scanWrap = this.querySelector(".scan-video-wrap");
    this.#scanStopBtn = this.querySelector(".scan-stop");
    this.#form.addEventListener("submit", this.#onSubmit);
    this.#cancelBtn.addEventListener("click", this.#onCancel);
    this.#scanBtn.addEventListener("click", this.#onStartScan);
    this.#scanStopBtn.addEventListener("click", () => this.#stopScan());
    document.addEventListener("pomegranate-account-added", this.#onPomegranateAdded);
    this.#unsubscribePomegranate = subscribePomegranateBusy(this.#setPomegranateBusy);
    this.#translate();
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate());
    if (isCameraSupported()) this.dataset.camera = "true";
  }
  disconnectedCallback() {
    if (this.#errorTimer) clearTimeout(this.#errorTimer);
    this.#stopScan();
    this.#unsubscribeLocale?.();
    this.#unsubscribeLocale = null;
    this.#unsubscribePomegranate?.();
    this.#unsubscribePomegranate = null;
    document.removeEventListener("pomegranate-account-added", this.#onPomegranateAdded);
  }
  open() {
    if (this.hasAttribute("open")) return;
    this.setAttribute("open", "");
    this.#setToolbarDisabled(true);
    this.activeButton?.classList.add("is-active");
    requestAnimationFrame(() => this.#input?.focus());
  }
  close() {
    this.removeAttribute("open");
    this.#input.value = "";
    this.#clearErrorFlash();
    this.#stopScan();
    this.#setToolbarDisabled(false);
    this.activeButton?.classList.remove("is-active");
  }
  #setToolbarDisabled(disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled;
    }
  }
  #onCancel = () => {
    if (this.#busy) abortIntake(this.#activeIntake);
    this.close();
  };
  #onPomegranateAdded = () => {
    if (this.hasAttribute("open")) this.close();
  };
  #setPomegranateBusy = (busy) => {
    this.#pomegranateBusy = busy;
    if (!this.#busy) {
      this.#input.disabled = busy;
      this.#scanBtn.disabled = busy;
      this.#confirmBtn.disabled = busy;
    }
  };
  #onSubmit = async (e) => {
    e.preventDefault();
    if (this.#busy) return;
    const raw = this.#input.value.trim();
    if (!raw) return;
    await this.#runAdd(raw);
  };
  async #runAdd(raw) {
    if (raw.startsWith("nostrpair://")) {
      info(t('Use "Sync Devices" for nostrpair URLs.'));
      this.#flashError();
      return;
    }
    this.#setBusy(true);
    const token = createIntakeToken();
    this.#activeIntake = token;
    const dispatchPromise = this.#dispatch(raw, token).catch((err) => {
      if (token.cancelled) return;
      throw err;
    });
    try {
      await Promise.race([dispatchPromise, token.cancelPromise]);
      if (token.cancelled) return;
      this.close();
    } catch (err) {
      if (token.cancelled || err?.message === "IMPORT_CANCELLED") return;
      console.error("add failed", err?.message ?? err);
      this.#flashError();
    } finally {
      if (this.#activeIntake === token) this.#activeIntake = null;
      this.#setBusy(false);
    }
  }
  async #dispatch(raw, token) {
    let prepared;
    let protectionReady = false;
    if (raw.startsWith("bunker://")) {
      await ensureRegistered();
      protectionReady = true;
      prepared = await prepareBunker(raw, token);
    } else if (raw.startsWith("npub1")) prepared = await prepareNpub(raw);
    else prepared = await prepareSeckey(raw);
    if (prepared.skipped) throw new Error(prepared.reason);
    await commitPrepared([prepared], { protectionReady });
  }
  #setBusy(on) {
    this.#busy = on;
    this.#input.disabled = on || this.#pomegranateBusy;
    this.#scanBtn.disabled = on || this.#pomegranateBusy;
    this.#confirmBtn.disabled = on || this.#pomegranateBusy;
    this.#confirmIcon.classList.toggle("pulsate", on);
  }
  #flashError() {
    this.#clearErrorFlash();
    this.#confirmBtn.disabled = true;
    this.#confirmBtn.classList.add("is-error");
    this.#confirmIcon.innerHTML = ICON_ALERT;
    this.#errorTimer = setTimeout(() => this.#clearErrorFlash(), ERROR_FLASH_MS);
  }
  #clearErrorFlash() {
    if (this.#errorTimer) {
      clearTimeout(this.#errorTimer);
      this.#errorTimer = null;
    }
    this.#confirmBtn.classList.remove("is-error");
    this.#confirmIcon.innerHTML = ICON_CHECK;
    if (!this.#busy && !this.#pomegranateBusy) this.#confirmBtn.disabled = false;
  }
  #onStartScan = async () => {
    if (this.#scanner || this.#busy) return;
    this.#scanBtn.disabled = true;
    this.#scanBtn.classList.add("pulsate");
    const scanner = new QrScanner({
      onResult: (value) => {
        this.#stopScan();
        this.#input.value = value;
        this.#runAdd(value.trim());
      },
      onError: (err) => console.warn("qr scan error", err?.message ?? err)
    });
    this.#scanWrap.appendChild(scanner.videoElement);
    scanner.videoElement.classList.add("scan-video");
    try {
      await scanner.start();
      this.#scanner = scanner;
      this.dataset.scanning = "true";
    } catch (err) {
      console.error("camera start failed", err?.message ?? err);
      try {
        scanner.stop();
      } catch {
      }
      this.#removeScanVideo();
      this.#flashError();
    } finally {
      this.#scanBtn.disabled = false;
      this.#scanBtn.classList.remove("pulsate");
    }
  };
  #stopScan() {
    if (this.#scanner) {
      try {
        this.#scanner.stop();
      } catch {
      }
      this.#scanner = null;
    }
    this.#removeScanVideo();
    this.dataset.scanning = "";
  }
  #removeScanVideo() {
    const video = this.#scanWrap.querySelector("video");
    if (video) video.remove();
  }
  #translate() {
    if (!this.#input) return;
    this.#cancelBtn.title = t("Cancel");
    this.#input.placeholder = t("Add a private key, public key, or bunker URL");
    this.#scanBtn.title = t("Scan QR");
    this.#confirmBtn.title = t("Add");
    this.#methodSeparator.setAttribute("aria-label", t("Or"));
    this.#methodSeparator.querySelector("span").textContent = t("Or");
    this.#scanStopBtn.title = t("Stop scanning");
  }
};
customElements.define("account-add", AccountAdd);
export {
  AccountAdd,
  accountAddLocales
};
