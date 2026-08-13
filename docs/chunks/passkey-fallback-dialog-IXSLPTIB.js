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
var ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" /><path d="M8 11v-4a4 4 0 0 1 8 0v4" /><path d="M12 16v.01" /></svg>';
var passkeyFallbackLocales = defineLocales({
  "Continue without a passkey?": ["Continuer sans cl\xE9 d\u2019acc\xE8s ?", "Continuare senza passkey?", "Ohne Passkey fortfahren?", "\xBFContinuar sin llave de acceso?", "Prosseguir sem chave de acesso?", "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0431\u0435\u0437 \u043A\u043B\u044E\u0447\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430?", "\u4E0D\u4F7F\u7528\u901A\u884C\u5BC6\u94A5\u7EE7\u7EED\uFF1F", "\u4E0D\u4F7F\u7528\u901A\u884C\u5BC6\u9470\u7E7C\u7E8C\uFF1F", "\u30D1\u30B9\u30AD\u30FC\u306A\u3057\u3067\u7D9A\u884C\u3057\u307E\u3059\u304B\uFF1F", "\uD328\uC2A4\uD0A4 \uC5C6\uC774 \uACC4\uC18D\uD560\uAE4C\uC694?"],
  "If you plan to share this device, we recommend protecting your data with a passkey.": ["Si vous pr\xE9voyez de partager cet appareil, nous vous recommandons de prot\xE9ger vos donn\xE9es avec une cl\xE9 d\u2019acc\xE8s.", "Se prevedi di condividere questo dispositivo, ti consigliamo di proteggere i tuoi dati con una passkey.", "Wenn Sie dieses Ger\xE4t gemeinsam nutzen m\xF6chten, empfehlen wir, Ihre Daten mit einem Passkey zu sch\xFCtzen.", "Si piensas compartir este dispositivo, te recomendamos proteger tus datos con una llave de acceso.", "Se voc\xEA pretende compartilhar este dispositivo, \xE9 recomend\xE1vel proteger seus dados com uma chave de acesso.", "\u0415\u0441\u043B\u0438 \u0432\u044B \u043F\u043B\u0430\u043D\u0438\u0440\u0443\u0435\u0442\u0435 \u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F \u044D\u0442\u0438\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E\u043C, \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F \u0437\u0430\u0449\u0438\u0442\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0441 \u043F\u043E\u043C\u043E\u0449\u044C\u044E \u043A\u043B\u044E\u0447\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430.", "\u5982\u679C\u60A8\u6253\u7B97\u4E0E\u4ED6\u4EBA\u5171\u7528\u6B64\u8BBE\u5907\uFF0C\u5EFA\u8BAE\u4F7F\u7528\u901A\u884C\u5BC6\u94A5\u4FDD\u62A4\u60A8\u7684\u6570\u636E\u3002", "\u5982\u679C\u60A8\u6253\u7B97\u8207\u4ED6\u4EBA\u5171\u7528\u6B64\u88DD\u7F6E\uFF0C\u5EFA\u8B70\u4F7F\u7528\u901A\u884C\u5BC6\u9470\u4FDD\u8B77\u60A8\u7684\u8CC7\u6599\u3002", "\u3053\u306E\u7AEF\u672B\u3092\u4ED6\u306E\u4EBA\u3068\u5171\u6709\u3059\u308B\u5834\u5408\u306F\u3001\u30D1\u30B9\u30AD\u30FC\u3067\u30C7\u30FC\u30BF\u3092\u4FDD\u8B77\u3059\u308B\u3053\u3068\u3092\u304A\u3059\u3059\u3081\u3057\u307E\u3059\u3002", "\uC774 \uAE30\uAE30\uB97C \uB2E4\uB978 \uC0AC\uB78C\uACFC \uACF5\uC720\uD560 \uACC4\uD68D\uC774\uB77C\uBA74 \uD328\uC2A4\uD0A4\uB85C \uB370\uC774\uD130\uB97C \uBCF4\uD638\uD558\uB294 \uAC83\uC774 \uC88B\uC2B5\uB2C8\uB2E4."],
  "Try passkey again": ["R\xE9essayer", "Riprova", "Erneut versuchen", "Volver a intentar", "Tentar novamente", "\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C", "\u91CD\u8BD5", "\u91CD\u8A66", "\u518D\u8A66\u884C", "\uB2E4\uC2DC \uC2DC\uB3C4"],
  "Continue without passkey": ["Continuer sans cl\xE9 d\u2019acc\xE8s", "Continua senza passkey", "Ohne Passkey fortfahren", "Continuar sin llave de acceso", "Continuar sem chave de acesso", "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0431\u0435\u0437 \u043A\u043B\u044E\u0447\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u0430", "\u4E0D\u4F7F\u7528\u901A\u884C\u5BC6\u94A5\u7EE7\u7EED", "\u4E0D\u4F7F\u7528\u901A\u884C\u5BC6\u9470\u7E7C\u7E8C", "\u30D1\u30B9\u30AD\u30FC\u306A\u3057\u3067\u7D9A\u884C", "\uD328\uC2A4\uD0A4 \uC5C6\uC774 \uACC4\uC18D"],
  "Protect your account on this device": ["Prot\xE9gez votre compte sur cet appareil", "Proteggi il tuo account su questo dispositivo", "Sch\xFCtzen Sie Ihr Konto auf diesem Ger\xE4t", "Protege tu cuenta en este dispositivo", "Proteja sua conta neste dispositivo", "\u0417\u0430\u0449\u0438\u0442\u0438\u0442\u0435 \u0441\u0432\u043E\u044E \u0443\u0447\u0451\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C \u043D\u0430 \u044D\u0442\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435", "\u4FDD\u62A4\u60A8\u5728\u6B64\u8BBE\u5907\u4E0A\u7684\u8D26\u6237", "\u4FDD\u8B77\u60A8\u5728\u6B64\u88DD\u7F6E\u4E0A\u7684\u5E33\u6236", "\u3053\u306E\u7AEF\u672B\u4E0A\u306E\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u4FDD\u8B77", "\uC774 \uAE30\uAE30\uC5D0\uC11C \uACC4\uC815 \uBCF4\uD638"],
  "A passkey usually uses biometrics or your device PIN to protect your account.": ["Une cl\xE9 d\u2019acc\xE8s utilise g\xE9n\xE9ralement la biom\xE9trie ou le code PIN de votre appareil pour prot\xE9ger votre compte.", "Una passkey usa solitamente i dati biometrici o il PIN del dispositivo per proteggere il tuo account.", "Ein Passkey verwendet normalerweise biometrische Daten oder die Ger\xE4te-PIN, um Ihr Konto zu sch\xFCtzen.", "Una llave de acceso suele usar datos biom\xE9tricos o el PIN de tu dispositivo para proteger tu cuenta.", "Uma chave de acesso normalmente usa biometria ou o PIN do dispositivo para proteger sua conta.", "\u041A\u043B\u044E\u0447 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043E\u0431\u044B\u0447\u043D\u043E \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0431\u0438\u043E\u043C\u0435\u0442\u0440\u0438\u044E \u0438\u043B\u0438 PIN-\u043A\u043E\u0434 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430 \u0434\u043B\u044F \u0437\u0430\u0449\u0438\u0442\u044B \u0432\u0430\u0448\u0435\u0439 \u0443\u0447\u0451\u0442\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438.", "\u901A\u884C\u5BC6\u94A5\u901A\u5E38\u4F7F\u7528\u751F\u7269\u8BC6\u522B\u6216\u8BBE\u5907 PIN \u7801\u6765\u4FDD\u62A4\u60A8\u7684\u8D26\u6237\u3002", "\u901A\u884C\u5BC6\u9470\u901A\u5E38\u4F7F\u7528\u751F\u7269\u8FA8\u8B58\u6216\u88DD\u7F6E PIN \u78BC\u4F86\u4FDD\u8B77\u60A8\u7684\u5E33\u6236\u3002", "\u30D1\u30B9\u30AD\u30FC\u306F\u901A\u5E38\u3001\u751F\u4F53\u8A8D\u8A3C\u307E\u305F\u306F\u7AEF\u672B\u306E PIN \u3092\u4F7F\u3063\u3066\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u4FDD\u8B77\u3057\u307E\u3059\u3002", "\uD328\uC2A4\uD0A4\uB294 \uC77C\uBC18\uC801\uC73C\uB85C \uC0DD\uCCB4 \uC778\uC2DD \uB610\uB294 \uAE30\uAE30 PIN\uC744 \uC0AC\uC6A9\uD574 \uACC4\uC815\uC744 \uBCF4\uD638\uD569\uB2C8\uB2E4."],
  "Create passkey": ["Cr\xE9er une cl\xE9 d\u2019acc\xE8s", "Crea una passkey", "Passkey erstellen", "Crear llave de acceso", "Criar chave de acesso", "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u043B\u044E\u0447 \u0434\u043E\u0441\u0442\u0443\u043F\u0430", "\u521B\u5EFA\u901A\u884C\u5BC6\u94A5", "\u5EFA\u7ACB\u901A\u884C\u5BC6\u9470", "\u30D1\u30B9\u30AD\u30FC\u3092\u4F5C\u6210", "\uD328\uC2A4\uD0A4 \uB9CC\uB4E4\uAE30"],
  Recommended: ["Recommand\xE9", "Consigliato", "Empfohlen", "Recomendado", "Recomendado", "\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0443\u0435\u0442\u0441\u044F", "\u63A8\u8350", "\u5EFA\u8B70", "\u63A8\u5968", "\uAD8C\uC7A5"]
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
  passkey-fallback-dialog .passkey-recommended-badge {
    display: none;
    margin-left: 8px;
    padding: 2px 7px;
    border-radius: 9999px;
    background-color: var(--accent-soft);
    color: var(--accent-fg);
    font-size: 11rem;
    font-weight: 600;
  }
  passkey-fallback-dialog[data-purpose="pomegranate"] .passkey-recommended-badge {
    display: inline-flex;
  }
  passkey-fallback-dialog[data-purpose="pomegranate"] .passkey-fallback-icon {
    color: var(--accent-fg);
  }
  passkey-fallback-dialog [data-choice="local"] {
    border: 1px solid var(--warning-fg);
    background-color: transparent;
    color: var(--warning-fg);
  }
  passkey-fallback-dialog [data-choice="local"]:active {
    background-color: var(--surface-interactive-active);
  }
  passkey-fallback-dialog[data-purpose="pomegranate"] [data-choice="local"] {
    border-color: var(--border);
    color: var(--fg-muted);
  }
`
);
var PasskeyFallbackDialog = class extends HTMLElement {
  #dialog = null;
  #resolve = null;
  #unsubscribeLocale = null;
  #purpose = "fallback";
  connectedCallback() {
    injectComponentStyles("passkey-fallback-dialog", STYLES);
    this.innerHTML = `
      <dialog aria-labelledby="passkey-fallback-title" aria-describedby="passkey-fallback-description">
        <span class="passkey-fallback-icon" aria-hidden="true">${ICON_WARNING}</span>
        <h2 id="passkey-fallback-title"></h2>
        <p id="passkey-fallback-description"></p>
        <div class="passkey-fallback-actions">
          <button type="button" data-choice="retry">
            <span class="passkey-primary-label"></span>
            <span class="passkey-recommended-badge"></span>
          </button>
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
  request({ purpose = "fallback" } = {}) {
    if (this.#resolve) return Promise.reject(new Error("PASSKEY_FALLBACK_DIALOG_BUSY"));
    this.#purpose = purpose === "pomegranate" ? "pomegranate" : "fallback";
    this.dataset.purpose = this.#purpose;
    this.#translate();
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.#dialog.showModal();
      this.querySelector('[data-choice="retry"]')?.focus();
    });
  }
  #translate() {
    const pomegranate = this.#purpose === "pomegranate";
    this.querySelector(".passkey-fallback-icon").innerHTML = pomegranate ? ICON_LOCK : ICON_WARNING;
    this.querySelector("#passkey-fallback-title")?.replaceChildren(t(pomegranate ? "Protect your account on this device" : "Continue without a passkey?"));
    this.querySelector("#passkey-fallback-description")?.replaceChildren(t(pomegranate ? "A passkey usually uses biometrics or your device PIN to protect your account." : "If you plan to share this device, we recommend protecting your data with a passkey."));
    this.querySelector(".passkey-primary-label")?.replaceChildren(t(pomegranate ? "Create passkey" : "Try passkey again"));
    this.querySelector(".passkey-recommended-badge")?.replaceChildren(t("Recommended"));
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
    if (outside) this.#settle("local");
  };
  #onCancel = (event) => {
    event.preventDefault();
    this.#settle("local");
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
function requestPomegranateProtectionChoice() {
  if (!instance?.isConnected) {
    instance = document.createElement("passkey-fallback-dialog");
    document.body.append(instance);
  }
  return instance.request({ purpose: "pomegranate" });
}
export {
  PasskeyFallbackDialog,
  passkeyFallbackLocales,
  requestPasskeyFallback,
  requestPomegranateProtectionChoice
};
