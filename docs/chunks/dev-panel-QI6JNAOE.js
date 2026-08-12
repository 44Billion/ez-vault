import {
  generateAndPublishContentKey,
  getDebugSnapshot,
  subscribeDebug
} from "./chunk-5QIL4A6S.js";
import "./chunk-4W5XMQY3.js";
import {
  seededAvatarDataUrl
} from "./chunk-3RWQBTGN.js";
import {
  hasPendingMutation,
  subscribePendingMutations
} from "./chunk-YSUPLM3X.js";
import "./chunk-AZYRZ53H.js";
import "./chunk-IXU3T4GE.js";
import {
  subscribe,
  subscribe2,
  subscribeContentKeys
} from "./chunk-2IRIIQPD.js";
import {
  defineLocales,
  getLocale,
  getT,
  subscribeLocaleChanged
} from "./chunk-KYIGV7TE.js";
import "./chunk-XO4CEVFJ.js";
import {
  injectComponentStyles
} from "./chunk-3OYOWZEQ.js";
import "./chunk-NZLE2WMY.js";

// src/components/dev-panel.js
var ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>';
var devPanelLocales = defineLocales({
  none: ["aucun", "nessuno", "keine", "ninguno", "nenhum", "\u043D\u0435\u0442", "\u65E0", "\u7121", "\u306A\u3057", "\uC5C6\uC74C"],
  status: ["\xE9tat", "stato", "Status", "estado", "status", "\u0441\u0442\u0430\u0442\u0443\u0441", "\u72B6\u6001", "\u72C0\u614B", "\u72B6\u614B", "\uC0C1\uD0DC"],
  account: ["compte", "account", "Konto", "cuenta", "conta", "\u0443\u0447\u0451\u0442\u043D\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C", "\u8D26\u6237", "\u5E33\u6236", "\u30A2\u30AB\u30A6\u30F3\u30C8", "\uACC4\uC815"],
  content: ["contenu", "contenuto", "Inhalt", "contenido", "conte\xFAdo", "\u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435", "\u5185\u5BB9", "\u5167\u5BB9", "\u30B3\u30F3\u30C6\u30F3\u30C4", "\uCF58\uD150\uCE20"],
  created: ["cr\xE9\xE9", "creato", "erstellt", "creado", "criado", "\u0441\u043E\u0437\u0434\u0430\u043D\u043E", "\u521B\u5EFA\u65F6\u95F4", "\u5EFA\u7ACB\u6642\u9593", "\u4F5C\u6210\u65E5\u6642", "\uC0DD\uC131\uB428"],
  source: ["source", "origine", "Quelle", "origen", "origem", "\u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A", "\u6765\u6E90", "\u4F86\u6E90", "\u30BD\u30FC\u30B9", "\uCD9C\uCC98"],
  Upsert: ["Mettre \xE0 jour", "Aggiorna", "Aktualisieren", "Actualizar", "Atualizar", "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C", "\u66F4\u65B0", "\u66F4\u65B0", "\u66F4\u65B0", "\uC5C5\uB370\uC774\uD2B8"],
  Development: ["D\xE9veloppement", "Sviluppo", "Entwicklung", "Desarrollo", "Desenvolvimento", "\u0420\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u043A\u0430", "\u5F00\u53D1", "\u958B\u767C", "\u958B\u767A", "\uAC1C\uBC1C"],
  "Top-level vault diagnostics.": ["Diagnostics du coffre de premier niveau.", "Diagnostica del vault di primo livello.", "Diagnose des Tresors auf oberster Ebene.", "Diagn\xF3stico de nivel superior de la b\xF3veda.", "Diagn\xF3stico do cofre de n\xEDvel superior.", "\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0430 \u0432\u0435\u0440\u0445\u043D\u0435\u0433\u043E \u0443\u0440\u043E\u0432\u043D\u044F.", "\u9876\u5C42\u4FDD\u9669\u5E93\u8BCA\u65AD\u3002", "\u9802\u5C64\u4FDD\u96AA\u5EAB\u8A3A\u65B7\u3002", "\u30C8\u30C3\u30D7\u30EC\u30D9\u30EB\u4FDD\u7BA1\u5EAB\u306E\u8A3A\u65AD\u3002", "\uCD5C\uC0C1\uC704 \uBCFC\uD2B8 \uC9C4\uB2E8."],
  "Content keys": ["Cl\xE9s de contenu", "Chiavi dei contenuti", "Inhaltsschl\xFCssel", "Claves de contenido", "Chaves de conte\xFAdo", "\u041A\u043B\u044E\u0447\u0438 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0433\u043E", "\u5185\u5BB9\u5BC6\u94A5", "\u5167\u5BB9\u91D1\u9470", "\u30B3\u30F3\u30C6\u30F3\u30C4\u9375", "\uCF58\uD150\uCE20 \uD0A4"],
  "No nsec accounts.": ["Aucun compte nsec.", "Nessun account nsec.", "Keine nsec-Konten.", "No hay cuentas nsec.", "Nenhuma conta nsec.", "\u041D\u0435\u0442 \u0443\u0447\u0451\u0442\u043D\u044B\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439 nsec.", "\u6CA1\u6709 nsec \u8D26\u6237\u3002", "\u6C92\u6709 nsec \u5E33\u6236\u3002", "nsec \u30A2\u30AB\u30A6\u30F3\u30C8\u306F\u3042\u308A\u307E\u305B\u3093\u3002", "nsec \uACC4\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."]
});
var t = getT(devPanelLocales);
var STYLES = (
  /* css */
  `
  dev-panel {
    display: block;
    padding-bottom: 24px;
  }
  dev-panel .dev-note {
    color: var(--fg);
    font-size: 12rem;
    line-height: 1.35;
    margin-bottom: 12px;
  }
  dev-panel .dev-section-title {
    color: var(--fg-strong);
    font-size: 13rem;
    font-weight: 700;
    margin-bottom: 10px;
  }
  dev-panel .content-key-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  dev-panel .content-key-row {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
    background-color: var(--surface-sunken);
  }
  dev-panel .row-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  dev-panel .account-identity {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  dev-panel .account-avatar-small {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border-radius: 50%;
    background-color: var(--surface);
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
    box-shadow:
      0 0 0 1px var(--border),
      0 0 0 2px var(--accent);
  }
  dev-panel .account-name {
    min-width: 0;
    color: var(--fg-strong);
    font-size: 13rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  dev-panel .pubkey-line,
  dev-panel .meta-line,
  dev-panel .status-line {
    margin-top: 7px;
    color: var(--fg);
    font-size: 12rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  dev-panel .line-label {
    color: var(--fg-muted);
  }
  dev-panel .status-line.is-error {
    color: var(--error-fg);
  }
  dev-panel .status-line.is-ok {
    color: var(--success-fg);
  }
  dev-panel .generate-btn {
    flex: 0 0 auto;
    min-width: 86px;
    height: 32px;
    border-radius: 8px;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    font-size: 12rem;
    font-weight: 700;
  }
  dev-panel .generate-btn:active {
    background-color: var(--accent-hover);
  }
  dev-panel .generate-btn:disabled {
    opacity: 0.48;
  }
  dev-panel .generate-btn svg {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
  }
  dev-panel .empty-state {
    color: var(--fg-muted);
    font-size: 12rem;
  }
`
);
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
function shortPubkey(pubkey) {
  return pubkey ? `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}` : "";
}
function formatDate(createdAt) {
  if (!createdAt) return t("none");
  try {
    return new Date(createdAt * 1e3).toLocaleString(getLocale());
  } catch {
    return String(createdAt);
  }
}
function accountAvatarSrc(account) {
  if (account.picture) return Promise.resolve(account.picture);
  return seededAvatarDataUrl(account.pubkey);
}
function setAvatarImage(element, src) {
  element.style.backgroundImage = `url(${JSON.stringify(src)})`;
}
function statusLine(status, fallbackError) {
  if (fallbackError) {
    return `<div class="status-line is-error"><span class="line-label">${t("status")}</span> ${escapeHtml(fallbackError)}</div>`;
  }
  if (!status) return "";
  const className = status.state === "publish failed" ? "status-line is-error" : status.state === "published" ? "status-line is-ok" : "status-line";
  const message = status.message ? `: ${status.message}` : "";
  return `<div class="${className}"><span class="line-label">${t("status")}</span> ${escapeHtml(status.state + message)}</div>`;
}
function accountRow(row, errors, unlocked) {
  const account = row.account;
  const latest = row.latest;
  const accountName = account.name || shortPubkey(account.pubkey);
  const owner = escapeHtml(account.pubkey);
  const pubkey = latest?.pubkey || "";
  const source = latest ? row.source : t("none");
  const createdAt = latest ? formatDate(latest.createdAt) : t("none");
  return (
    /* html */
    `
    <div class="content-key-row">
      <div class="row-top">
        <div class="account-identity">
          <span class="account-avatar-small" data-avatar-pubkey="${owner}" aria-hidden="true"></span>
          <div class="account-name">${escapeHtml(accountName)}</div>
        </div>
        <button class="generate-btn" type="button" data-action="generate-content-key" data-owner="${owner}" ${unlocked ? "" : "disabled"}>
          <span class="btn-icon">${ICON_PLUS}</span>
          <span class="btn-label">${t("Upsert")}</span>
        </button>
      </div>
      <div class="pubkey-line"><span class="line-label">${t("account")}</span> ${owner}</div>
      <div class="pubkey-line"><span class="line-label">${t("content")}</span> ${escapeHtml(pubkey || t("none"))}</div>
      <div class="meta-line"><span class="line-label">${t("created")}</span> ${escapeHtml(createdAt)}</div>
      <div class="meta-line"><span class="line-label">${t("source")}</span> ${escapeHtml(source)}</div>
      ${statusLine(row.publishStatus, errors.get(account.pubkey))}
    </div>
  `
  );
}
var DevPanel = class extends HTMLElement {
  #unsubscribeSync = null;
  #unsubscribeSecrets = null;
  #unsubscribeContentKeys = null;
  #unsubscribeStore = null;
  #unsubscribePendingMutations = null;
  #unsubscribeLocale = null;
  #errors = /* @__PURE__ */ new Map();
  connectedCallback() {
    injectComponentStyles("dev-panel", STYLES);
    this.#unsubscribeSync = subscribeDebug(() => this.render());
    this.#unsubscribeSecrets = subscribe2(() => this.render());
    this.#unsubscribeContentKeys = subscribeContentKeys?.(() => this.render()) || null;
    this.#unsubscribeStore = subscribe(() => this.render());
    this.#unsubscribePendingMutations = subscribePendingMutations(() => {
      if (!hasPendingMutation()) this.render();
    });
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.render());
    this.addEventListener("click", this.#onClick);
    this.render();
  }
  disconnectedCallback() {
    this.removeEventListener("click", this.#onClick);
    this.#unsubscribeSync?.();
    this.#unsubscribeSecrets?.();
    this.#unsubscribeContentKeys?.();
    this.#unsubscribeStore?.();
    this.#unsubscribePendingMutations?.();
    this.#unsubscribeLocale?.();
  }
  render() {
    const snapshot = getDebugSnapshot();
    const rows = snapshot.accounts.length ? snapshot.accounts.map((row) => accountRow(row, this.#errors, snapshot.unlocked)).join("") : `<div class="empty-state">${t("No nsec accounts.")}</div>`;
    this.innerHTML = /* html */
    `
      <accordion-panel header="${t("Development")}" icon="development" open>
        <div class="dev-note">${t("Top-level vault diagnostics.")}</div>
        <div class="dev-section-title">${t("Content keys")}</div>
        <div class="content-key-list">${rows}</div>
      </accordion-panel>
    `;
    this.#hydrateAvatars(snapshot.accounts.map((row) => row.account));
  }
  #hydrateAvatars(accounts) {
    const avatars = new Map(
      Array.from(this.querySelectorAll(".account-avatar-small")).map((node) => [node.dataset.avatarPubkey, node])
    );
    for (const account of accounts) {
      const avatar = avatars.get(account.pubkey);
      if (!avatar) continue;
      accountAvatarSrc(account).then((src) => {
        if (!this.contains(avatar) || avatar.dataset.avatarPubkey !== account.pubkey) return;
        setAvatarImage(avatar, src);
      }).catch((err) => console.warn("Could not render dev-panel account avatar", err?.message ?? err));
    }
  }
  async #onClick(event) {
    const button = event.target.closest('button[data-action="generate-content-key"]');
    if (!button || !this.contains(button)) return;
    const ownerPubkey = button.dataset.owner;
    this.#errors.delete(ownerPubkey);
    button.disabled = true;
    button.querySelector(".btn-label")?.classList.add("pulsate");
    try {
      await generateAndPublishContentKey(ownerPubkey);
    } catch (err) {
      this.#errors.set(ownerPubkey, err?.message || String(err));
      this.render();
    }
  }
};
customElements.define("dev-panel", DevPanel);
export {
  DevPanel,
  devPanelLocales
};
