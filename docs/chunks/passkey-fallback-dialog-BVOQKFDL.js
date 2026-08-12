import {
  defineLocales,
  getT,
  subscribeLocaleChanged
} from "./chunk-KYIGV7TE.js";
import {
  injectComponentStyles
} from "./chunk-3OYOWZEQ.js";
import "./chunk-NZLE2WMY.js";

// src/components/passkey-fallback-dialog.js
var ICON_WARNING = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>';
var passkeyFallbackLocales = defineLocales({
  "Continue without a passkey?": ["Continuer sans cl\xE9 d\u2019acc\xE8s ?", "Continuare senza passkey?", "Ohne Passkey fortfahren?", "\xBFContinuar sin passkey?", "Prosseguir sem passkey?", "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0431\u0435\u0437 \u043A\u043B\u044E\u0447\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430?", "\u4E0D\u4F7F\u7528\u901A\u884C\u5BC6\u94A5\u7EE7\u7EED\uFF1F", "\u4E0D\u4F7F\u7528\u901A\u884C\u91D1\u9470\u7E7C\u7E8C\uFF1F", "\u30D1\u30B9\u30AD\u30FC\u306A\u3057\u3067\u7D9A\u884C\u3057\u307E\u3059\u304B\uFF1F", "\uD328\uC2A4\uD0A4 \uC5C6\uC774 \uACC4\uC18D\uD560\uAE4C\uC694?"],
  "Anyone who can read this device\u2019s site data will be able to recover your account secrets. You can try creating a passkey again later.": ["Toute personne pouvant lire les donn\xE9es de ce site sur cet appareil pourra r\xE9cup\xE9rer les secrets de vos comptes. Vous pourrez r\xE9essayer de cr\xE9er une cl\xE9 d\u2019acc\xE8s plus tard.", "Chiunque possa leggere i dati del sito su questo dispositivo potr\xE0 recuperare i segreti degli account. Potrai riprovare a creare una passkey in seguito.", "Jeder, der die Websitedaten dieses Ger\xE4ts lesen kann, kann Ihre Kontogeheimnisse wiederherstellen. Sie k\xF6nnen sp\xE4ter erneut einen Passkey erstellen.", "Cualquiera que pueda leer los datos de este sitio en el dispositivo podr\xE1 recuperar los secretos de tus cuentas. Podr\xE1s volver a intentar crear una passkey m\xE1s adelante.", "Qualquer pessoa que consiga ler os dados deste site no dispositivo poder\xE1 recuperar os segredos das suas contas. Voc\xEA poder\xE1 tentar criar uma passkey novamente mais tarde.", "\u041B\u044E\u0431\u043E\u0439, \u043A\u0442\u043E \u0441\u043C\u043E\u0436\u0435\u0442 \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u044D\u0442\u043E\u0433\u043E \u0441\u0430\u0439\u0442\u0430 \u043D\u0430 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435, \u0441\u043C\u043E\u0436\u0435\u0442 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u0435\u043A\u0440\u0435\u0442\u044B \u0432\u0430\u0448\u0438\u0445 \u0443\u0447\u0451\u0442\u043D\u044B\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439. \u041F\u043E\u0437\u0436\u0435 \u043C\u043E\u0436\u043D\u043E \u0441\u043D\u043E\u0432\u0430 \u043F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u043B\u044E\u0447 \u0434\u043E\u0441\u0442\u0443\u043F\u0430.", "\u4EFB\u4F55\u80FD\u591F\u8BFB\u53D6\u6B64\u8BBE\u5907\u7F51\u7AD9\u6570\u636E\u7684\u4EBA\u90FD\u80FD\u6062\u590D\u4F60\u7684\u8D26\u6237\u673A\u5BC6\u3002\u4F60\u53EF\u4EE5\u7A0D\u540E\u518D\u6B21\u5C1D\u8BD5\u521B\u5EFA\u901A\u884C\u5BC6\u94A5\u3002", "\u4EFB\u4F55\u80FD\u5920\u8B80\u53D6\u6B64\u88DD\u7F6E\u7DB2\u7AD9\u8CC7\u6599\u7684\u4EBA\u90FD\u80FD\u5FA9\u539F\u4F60\u7684\u5E33\u6236\u6A5F\u5BC6\u3002\u4F60\u53EF\u4EE5\u7A0D\u5F8C\u518D\u6B21\u5617\u8A66\u5EFA\u7ACB\u901A\u884C\u91D1\u9470\u3002", "\u3053\u306E\u7AEF\u672B\u306E\u30B5\u30A4\u30C8\u30C7\u30FC\u30BF\u3092\u8AAD\u3081\u308B\u4EBA\u306F\u3001\u30A2\u30AB\u30A6\u30F3\u30C8\u306E\u79D8\u5BC6\u60C5\u5831\u3092\u5FA9\u5143\u3067\u304D\u307E\u3059\u3002\u30D1\u30B9\u30AD\u30FC\u306E\u4F5C\u6210\u306F\u5F8C\u3067\u3082\u3046\u4E00\u5EA6\u8A66\u305B\u307E\u3059\u3002", "\uC774 \uAE30\uAE30\uC758 \uC0AC\uC774\uD2B8 \uB370\uC774\uD130\uB97C \uC77D\uC744 \uC218 \uC788\uB294 \uC0AC\uB78C\uC740 \uACC4\uC815 \uBE44\uBC00\uC744 \uBCF5\uAD6C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uB098\uC911\uC5D0 \uD328\uC2A4\uD0A4 \uC0DD\uC131\uC744 \uB2E4\uC2DC \uC2DC\uB3C4\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."],
  "Try passkey again": ["R\xE9essayer la cl\xE9 d\u2019acc\xE8s", "Riprova la passkey", "Passkey erneut versuchen", "Volver a intentar la passkey", "Tentar passkey novamente", "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u043F\u043E\u043F\u044B\u0442\u043A\u0443 \u0441 \u043A\u043B\u044E\u0447\u043E\u043C \u0434\u043E\u0441\u0442\u0443\u043F\u0430", "\u91CD\u8BD5\u901A\u884C\u5BC6\u94A5", "\u91CD\u8A66\u901A\u884C\u91D1\u9470", "\u30D1\u30B9\u30AD\u30FC\u3092\u518D\u8A66\u884C", "\uD328\uC2A4\uD0A4 \uB2E4\uC2DC \uC2DC\uB3C4"],
  "Continue without passkey": ["Continuer sans cl\xE9 d\u2019acc\xE8s", "Continua senza passkey", "Ohne Passkey fortfahren", "Continuar sin passkey", "Continuar sem passkey", "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0431\u0435\u0437 \u043A\u043B\u044E\u0447\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430", "\u4E0D\u4F7F\u7528\u901A\u884C\u5BC6\u94A5\u7EE7\u7EED", "\u4E0D\u4F7F\u7528\u901A\u884C\u91D1\u9470\u7E7C\u7E8C", "\u30D1\u30B9\u30AD\u30FC\u306A\u3057\u3067\u7D9A\u884C", "\uD328\uC2A4\uD0A4 \uC5C6\uC774 \uACC4\uC18D"]
});
var t = getT(passkeyFallbackLocales);
var STYLES = (
  /* css */
  `
  passkey-fallback-dialog dialog {
    width: min(340px, calc(100vw - 32px));
    margin: auto;
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background-color: var(--surface-raised);
    color: var(--fg-strong);
    box-shadow: 0 12px 36px var(--shadow-strong);
  }
  passkey-fallback-dialog dialog::backdrop {
    background-color: var(--scrim-strong);
  }
  passkey-fallback-dialog .passkey-fallback-icon {
    display: flex;
    width: 40px;
    height: 40px;
    margin: 0 auto 16px;
    color: var(--warning-fg);
  }
  passkey-fallback-dialog .passkey-fallback-icon svg {
    width: 100%;
    height: 100%;
  }
  passkey-fallback-dialog h2 {
    margin: 0;
    text-align: center;
    font-size: 18rem;
  }
  passkey-fallback-dialog p {
    margin: 12px 0 20px;
    color: var(--fg);
    font-size: 14rem;
    line-height: 1.45;
    text-align: center;
  }
  passkey-fallback-dialog .passkey-fallback-actions {
    display: grid;
    gap: 10px;
    text-align: center;
  }
  passkey-fallback-dialog button {
    width: 100%;
    border-radius: 9999px;
    padding: 11px 16px;
    font-size: 14rem;
    font-weight: 600;
  }
  passkey-fallback-dialog [data-choice="retry"] {
    background-color: var(--accent);
    color: var(--fg-on-accent);
  }
  passkey-fallback-dialog [data-choice="retry"]:active {
    background-color: var(--accent-active);
  }
  passkey-fallback-dialog [data-choice="local"] {
    border: 1px solid var(--warning-fg);
    background-color: transparent;
    color: var(--warning-fg);
  }
  passkey-fallback-dialog [data-choice="local"]:active {
    background-color: var(--surface-interactive-active);
  }
`
);
var PasskeyFallbackDialog = class extends HTMLElement {
  #dialog = null;
  #resolve = null;
  #unsubscribeLocale = null;
  connectedCallback() {
    injectComponentStyles("passkey-fallback-dialog", STYLES);
    this.innerHTML = `
      <dialog aria-labelledby="passkey-fallback-title" aria-describedby="passkey-fallback-description">
        <span class="passkey-fallback-icon" aria-hidden="true">${ICON_WARNING}</span>
        <h2 id="passkey-fallback-title"></h2>
        <p id="passkey-fallback-description"></p>
        <div class="passkey-fallback-actions">
          <button type="button" data-choice="retry"></button>
          <button type="button" data-choice="local"></button>
        </div>
      </dialog>
    `;
    this.#dialog = this.querySelector("dialog");
    this.#dialog.addEventListener("click", this.#onClick);
    this.#dialog.addEventListener("cancel", this.#onCancel);
    this.#translate();
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate());
  }
  disconnectedCallback() {
    this.#dialog?.removeEventListener("click", this.#onClick);
    this.#dialog?.removeEventListener("cancel", this.#onCancel);
    this.#unsubscribeLocale?.();
    this.#unsubscribeLocale = null;
    this.#settle("cancel");
  }
  request() {
    if (this.#resolve) return Promise.reject(new Error("PASSKEY_FALLBACK_DIALOG_BUSY"));
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.#dialog.showModal();
      this.querySelector('[data-choice="retry"]')?.focus();
    });
  }
  #translate() {
    this.querySelector("#passkey-fallback-title")?.replaceChildren(t("Continue without a passkey?"));
    this.querySelector("#passkey-fallback-description")?.replaceChildren(t("Anyone who can read this device\u2019s site data will be able to recover your account secrets. You can try creating a passkey again later."));
    this.querySelector('[data-choice="retry"]')?.replaceChildren(t("Try passkey again"));
    this.querySelector('[data-choice="local"]')?.replaceChildren(t("Continue without passkey"));
  }
  #onClick = (event) => {
    const choice = event.target.closest("button[data-choice]")?.dataset.choice;
    if (choice) {
      this.#settle(choice);
      return;
    }
    if (event.target !== this.#dialog) return;
    const rect = this.#dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) this.#settle("cancel");
  };
  #onCancel = (event) => {
    event.preventDefault();
    this.#settle("cancel");
  };
  #settle(choice) {
    if (!this.#resolve) return;
    const resolve = this.#resolve;
    this.#resolve = null;
    this.#dialog?.close();
    resolve(choice);
  }
};
if (!customElements.get("passkey-fallback-dialog")) {
  customElements.define("passkey-fallback-dialog", PasskeyFallbackDialog);
}
var instance = null;
function requestPasskeyFallback() {
  if (!instance?.isConnected) {
    instance = document.createElement("passkey-fallback-dialog");
    document.body.append(instance);
  }
  return instance.request();
}
export {
  PasskeyFallbackDialog,
  passkeyFallbackLocales,
  requestPasskeyFallback
};
