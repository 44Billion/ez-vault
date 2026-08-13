import {
  hasStoredActive,
  list,
  remove,
  subscribe as subscribe2
} from "./chunk-AZYRZ53H.js";
import {
  ensureRegistered,
  flushPendingIconUpdate,
  hasPasskey,
  unlock
} from "./chunk-4QDFHAFY.js";
import {
  getDeviceSignerPubkey,
  isUnlocked,
  subscribe2 as subscribe
} from "./chunk-2IRIIQPD.js";
import {
  error,
  success
} from "./chunk-BDYCOPAX.js";
import {
  defineLocales,
  getLocale,
  getT,
  subscribeLocaleChanged
} from "./chunk-KYIGV7TE.js";
import {
  injectComponentStyles
} from "./chunk-3OYOWZEQ.js";
import "./chunk-NZLE2WMY.js";

// src/components/trusted-signers-panel.js
var trustedSignersLocales = defineLocales({
  unknown: ["inconnu", "sconosciuto", "unbekannt", "desconocido", "desconhecido", "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E", "\u672A\u77E5", "\u672A\u77E5", "\u4E0D\u660E", "\uC54C \uC218 \uC5C6\uC74C"],
  "No trusted devices yet.": ["Aucun appareil de confiance.", "Nessun dispositivo attendibile.", "Noch keine vertrauensw\xFCrdigen Ger\xE4te.", "A\xFAn no hay dispositivos de confianza.", "Ainda n\xE3o h\xE1 dispositivos confi\xE1veis.", "\u0414\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0445 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.", "\u5C1A\u65E0\u53D7\u4FE1\u4EFB\u7684\u8BBE\u5907\u3002", "\u5C1A\u7121\u53D7\u4FE1\u4EFB\u7684\u88DD\u7F6E\u3002", "\u4FE1\u983C\u6E08\u307F\u30C7\u30D0\u30A4\u30B9\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002", "\uC544\uC9C1 \uC2E0\uB8B0\uD560 \uC218 \uC788\uB294 \uAE30\uAE30\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."],
  "Unlock to view trusted devices.": ["D\xE9verrouillez pour voir les appareils de confiance.", "Sblocca per vedere i dispositivi attendibili.", "Entsperren, um vertrauensw\xFCrdige Ger\xE4te anzuzeigen.", "Desbloquea para ver los dispositivos de confianza.", "Desbloqueie para ver os dispositivos confi\xE1veis.", "\u0420\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u0443\u0439\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u0434\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430.", "\u89E3\u9501\u4EE5\u67E5\u770B\u53D7\u4FE1\u4EFB\u7684\u8BBE\u5907\u3002", "\u89E3\u9396\u4EE5\u67E5\u770B\u53D7\u4FE1\u4EFB\u7684\u88DD\u7F6E\u3002", "\u4FE1\u983C\u6E08\u307F\u30C7\u30D0\u30A4\u30B9\u3092\u8868\u793A\u3059\u308B\u306B\u306F\u30ED\u30C3\u30AF\u3092\u89E3\u9664\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "\uC2E0\uB8B0\uD560 \uC218 \uC788\uB294 \uAE30\uAE30\uB97C \uBCF4\uB824\uBA74 \uC7A0\uAE08\uC744 \uD574\uC81C\uD558\uC138\uC694."],
  "Unlock with passkey": ["D\xE9verrouiller avec la cl\xE9 d\u2019acc\xE8s", "Sblocca con passkey", "Mit Passkey entsperren", "Desbloquear con llave de acceso", "Desbloquear com chave de acesso", "\u0420\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043A\u043B\u044E\u0447\u043E\u043C \u0434\u043E\u0441\u0442\u0443\u043F\u0430", "\u4F7F\u7528\u901A\u884C\u5BC6\u94A5\u89E3\u9501", "\u4F7F\u7528\u901A\u884C\u5BC6\u9470\u89E3\u9396", "\u30D1\u30B9\u30AD\u30FC\u3067\u30ED\u30C3\u30AF\u89E3\u9664", "\uD328\uC2A4\uD0A4\uB85C \uC7A0\uAE08 \uD574\uC81C"],
  "Trusted device": ["Appareil de confiance", "Dispositivo attendibile", "Vertrauensw\xFCrdiges Ger\xE4t", "Dispositivo de confianza", "Dispositivo confi\xE1vel", "\u0414\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E", "\u53D7\u4FE1\u4EFB\u7684\u8BBE\u5907", "\u53D7\u4FE1\u4EFB\u7684\u88DD\u7F6E", "\u4FE1\u983C\u6E08\u307F\u30C7\u30D0\u30A4\u30B9", "\uC2E0\uB8B0\uD560 \uC218 \uC788\uB294 \uAE30\uAE30"],
  "trusted {{time}}": ["approuv\xE9 {{time}}", "attendibile {{time}}", "vertraut {{time}}", "de confianza {{time}}", "confi\xE1vel {{time}}", "\u0434\u043E\u0432\u0435\u0440\u0435\u043D\u043E {{time}}", "\u53D7\u4FE1\u4EFB\u4E8E {{time}}", "\u4FE1\u4EFB\u65BC {{time}}", "\u4FE1\u983C\u65E5\u6642 {{time}}", "\uC2E0\uB8B0\uB428 {{time}}"],
  "Remove trusted device": ["Supprimer l\u2019appareil de confiance", "Rimuovi dispositivo attendibile", "Vertrauensw\xFCrdiges Ger\xE4t entfernen", "Eliminar dispositivo de confianza", "Remover dispositivo confi\xE1vel", "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E", "\u79FB\u9664\u53D7\u4FE1\u4EFB\u7684\u8BBE\u5907", "\u79FB\u9664\u53D7\u4FE1\u4EFB\u7684\u88DD\u7F6E", "\u4FE1\u983C\u6E08\u307F\u30C7\u30D0\u30A4\u30B9\u3092\u524A\u9664", "\uC2E0\uB8B0\uD560 \uC218 \uC788\uB294 \uAE30\uAE30 \uC0AD\uC81C"],
  "Remove this trusted device? Future sync will stop, but data already synced to it cannot be removed.": ["Supprimer cet appareil de confiance ? La synchronisation future s\u2019arr\xEAtera, mais les donn\xE9es d\xE9j\xE0 synchronis\xE9es ne pourront pas \xEAtre supprim\xE9es.", "Rimuovere questo dispositivo attendibile? La sincronizzazione futura si interromper\xE0, ma i dati gi\xE0 sincronizzati non potranno essere rimossi.", "Dieses vertrauensw\xFCrdige Ger\xE4t entfernen? K\xFCnftige Synchronisierung wird beendet, bereits synchronisierte Daten k\xF6nnen jedoch nicht entfernt werden.", "\xBFEliminar este dispositivo de confianza? La sincronizaci\xF3n futura se detendr\xE1, pero los datos ya sincronizados no se pueden eliminar.", "Remover este dispositivo confi\xE1vel? Sincroniza\xE7\xF5es futuras ser\xE3o interrompidas, mas os dados j\xE1 sincronizados n\xE3o poder\xE3o ser removidos.", "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u044D\u0442\u043E \u0434\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E? \u0414\u0430\u043B\u044C\u043D\u0435\u0439\u0448\u0430\u044F \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u043F\u0440\u0435\u043A\u0440\u0430\u0442\u0438\u0442\u0441\u044F, \u043D\u043E \u0443\u0436\u0435 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u043D\u0435\u043B\u044C\u0437\u044F.", "\u8981\u79FB\u9664\u6B64\u53D7\u4FE1\u4EFB\u7684\u8BBE\u5907\u5417\uFF1F\u4E4B\u540E\u5C06\u505C\u6B62\u540C\u6B65\uFF0C\u4F46\u5DF2\u540C\u6B65\u5230\u8BE5\u8BBE\u5907\u7684\u6570\u636E\u65E0\u6CD5\u79FB\u9664\u3002", "\u8981\u79FB\u9664\u6B64\u53D7\u4FE1\u4EFB\u7684\u88DD\u7F6E\u55CE\uFF1F\u4E4B\u5F8C\u5C07\u505C\u6B62\u540C\u6B65\uFF0C\u4F46\u5DF2\u540C\u6B65\u5230\u8A72\u88DD\u7F6E\u7684\u8CC7\u6599\u7121\u6CD5\u79FB\u9664\u3002", "\u3053\u306E\u4FE1\u983C\u6E08\u307F\u30C7\u30D0\u30A4\u30B9\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\u4ECA\u5F8C\u306E\u540C\u671F\u306F\u505C\u6B62\u3057\u307E\u3059\u304C\u3001\u3059\u3067\u306B\u540C\u671F\u3055\u308C\u305F\u30C7\u30FC\u30BF\u306F\u524A\u9664\u3067\u304D\u307E\u305B\u3093\u3002", "\uC774 \uC2E0\uB8B0\uD560 \uC218 \uC788\uB294 \uAE30\uAE30\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694? \uD5A5\uD6C4 \uB3D9\uAE30\uD654\uB294 \uC911\uC9C0\uB418\uC9C0\uB9CC \uC774\uBBF8 \uB3D9\uAE30\uD654\uB41C \uB370\uC774\uD130\uB294 \uC0AD\uC81C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."],
  "Trusted device removed": ["Appareil de confiance supprim\xE9", "Dispositivo attendibile rimosso", "Vertrauensw\xFCrdiges Ger\xE4t entfernt", "Dispositivo de confianza eliminado", "Dispositivo confi\xE1vel removido", "\u0414\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u0443\u0434\u0430\u043B\u0435\u043D\u043E", "\u5DF2\u79FB\u9664\u53D7\u4FE1\u4EFB\u7684\u8BBE\u5907", "\u5DF2\u79FB\u9664\u53D7\u4FE1\u4EFB\u7684\u88DD\u7F6E", "\u4FE1\u983C\u6E08\u307F\u30C7\u30D0\u30A4\u30B9\u3092\u524A\u9664\u3057\u307E\u3057\u305F", "\uC2E0\uB8B0\uD560 \uC218 \uC788\uB294 \uAE30\uAE30 \uC0AD\uC81C\uB428"],
  "Could not remove device": ["Impossible de supprimer l\u2019appareil", "Impossibile rimuovere il dispositivo", "Ger\xE4t konnte nicht entfernt werden", "No se pudo eliminar el dispositivo", "N\xE3o foi poss\xEDvel remover o dispositivo", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E", "\u65E0\u6CD5\u79FB\u9664\u8BBE\u5907", "\u7121\u6CD5\u79FB\u9664\u88DD\u7F6E", "\u30C7\u30D0\u30A4\u30B9\u3092\u524A\u9664\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", "\uAE30\uAE30\uB97C \uC0AD\uC81C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4"],
  "Could not unlock": ["Impossible de d\xE9verrouiller", "Impossibile sbloccare", "Entsperren nicht m\xF6glich", "No se pudo desbloquear", "N\xE3o foi poss\xEDvel desbloquear", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0440\u0430\u0437\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "\u65E0\u6CD5\u89E3\u9501", "\u7121\u6CD5\u89E3\u9396", "\u30ED\u30C3\u30AF\u3092\u89E3\u9664\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", "\uC7A0\uAE08\uC744 \uD574\uC81C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4"]
});
var t = getT(trustedSignersLocales);
var ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3l6 0v3" /></svg>';
var ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>';
var STYLES = (
  /* css */
  `
  trusted-signers-panel {
    display: block;
  }
  body:not(.dev) accordion-panel:has(trusted-signers-panel[data-empty]) {
    display: none;
  }
  trusted-signers-panel .empty-state {
    margin: 0;
    color: var(--fg);
    font-size: 13rem;
    line-height: 1.35;
  }
  trusted-signers-panel .locked-state {
    display: grid;
    gap: 10px;
  }
  trusted-signers-panel .unlock-btn {
    min-height: 36px;
    border: 0;
    border-radius: 9999px;
    padding: 9px 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: var(--success);
    color: var(--fg-on-accent);
    font-size: 13rem;
    font-weight: 600;
    cursor: pointer;
  }
  trusted-signers-panel .unlock-btn:active {
    background-color: var(--success-active);
  }
  trusted-signers-panel .unlock-btn:disabled {
    opacity: 0.7;
    cursor: default;
  }
  trusted-signers-panel .unlock-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  trusted-signers-panel .unlock-icon svg {
    width: 16px;
    height: 16px;
  }
  trusted-signers-panel .device-list {
    display: grid;
    gap: 8px;
  }
  trusted-signers-panel .device-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    gap: 8px;
    align-items: start;
    padding: 8px 0;
    border-top: 1px solid var(--border);
  }
  trusted-signers-panel .device-row:first-child {
    border-top: 0;
    padding-top: 0;
  }
  trusted-signers-panel .device-title {
    color: var(--fg-strong);
    font-size: 14rem;
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  trusted-signers-panel .device-meta {
    margin-top: 3px;
    color: var(--fg);
    font-size: 12rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  trusted-signers-panel .remove-btn {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--error-fg);
    background-color: oklch(from var(--error) l c h / 0.5);
    cursor: pointer;
  }
  trusted-signers-panel .remove-btn:active {
    background-color: oklch(from var(--error) l c h / 0.65);
  }
  trusted-signers-panel .remove-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }
  trusted-signers-panel .remove-btn svg {
    width: 17px;
    height: 17px;
  }
`
);
function shortPubkey(pubkey) {
  return `${pubkey.slice(0, 8)}\u2026${pubkey.slice(-8)}`;
}
function formatTime(seconds) {
  if (!seconds) return t("unknown");
  try {
    return new Date(seconds * 1e3).toLocaleString(getLocale());
  } catch {
    return t("unknown");
  }
}
var TrustedSignersPanel = class extends HTMLElement {
  #unsubscribers = [];
  connectedCallback() {
    injectComponentStyles("trusted-signers-panel", STYLES);
    this.#unsubscribers.push(subscribe2(() => this.#render()));
    this.#unsubscribers.push(subscribe(() => this.#render()));
    this.#unsubscribers.push(subscribeLocaleChanged(() => this.#render()));
    this.#render();
  }
  disconnectedCallback() {
    for (const unsubscribe of this.#unsubscribers.splice(0)) unsubscribe();
  }
  #render() {
    const signers = list();
    if (!signers.length) {
      if (!isUnlocked() && hasPasskey() && hasStoredActive()) {
        this.#renderLocked();
        return;
      }
      this.dataset.empty = "true";
      this.innerHTML = `<p class="empty-state">${t("No trusted devices yet.")}</p>`;
      return;
    }
    delete this.dataset.empty;
    this.replaceChildren(this.#deviceList(signers));
  }
  #renderLocked() {
    delete this.dataset.empty;
    this.innerHTML = `
      <div class="locked-state">
        <p class="empty-state">${t("Unlock to view trusted devices.")}</p>
        <button type="button" class="unlock-btn">
          <span class="unlock-icon">${ICON_LOCK}</span>
          <span>${t("Unlock with passkey")}</span>
        </button>
      </div>
    `;
    this.querySelector(".unlock-btn")?.addEventListener("click", (event) => this.#unlock(event.currentTarget));
  }
  #deviceList(signers) {
    const list2 = document.createElement("div");
    list2.className = "device-list";
    for (const signer of signers) list2.append(this.#deviceRow(signer));
    return list2;
  }
  #deviceRow(signer) {
    const row = document.createElement("div");
    row.className = "device-row";
    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "device-title";
    title.textContent = signer.platform || t("Trusted device");
    const meta = document.createElement("div");
    meta.className = "device-meta";
    meta.textContent = `${shortPubkey(signer.pubkey)} \xB7 ${t("trusted {{time}}", { time: formatTime(signer.addedAt || signer.updatedAt) })}`;
    body.append(title, meta);
    const remove2 = document.createElement("button");
    remove2.className = "remove-btn";
    remove2.type = "button";
    remove2.title = t("Remove trusted device");
    remove2.innerHTML = ICON_TRASH;
    remove2.addEventListener("click", () => this.#removeSigner(signer.pubkey, remove2));
    row.append(body, remove2);
    return row;
  }
  async #removeSigner(pubkey, button) {
    const ok = window.confirm(t("Remove this trusted device? Future sync will stop, but data already synced to it cannot be removed."));
    if (!ok) return;
    button.disabled = true;
    try {
      await ensureRegistered();
      const actorPubkey = await getDeviceSignerPubkey();
      await remove(pubkey, { actorPubkey });
      success(t("Trusted device removed"));
    } catch (err) {
      button.disabled = false;
      error(t("Could not remove device"), err?.message ?? String(err));
    }
  }
  async #unlock(button) {
    if (button.disabled) return;
    const icon = button.querySelector(".unlock-icon");
    button.disabled = true;
    icon?.classList.add("pulsate");
    try {
      await unlock();
      flushPendingIconUpdate().catch((err) => {
        console.warn("icon signal failed", err?.message ?? err);
      });
    } catch (err) {
      console.error("passkey unlock failed", err?.message ?? err);
      error(t("Could not unlock"), err?.message ?? "");
    } finally {
      button.disabled = false;
      icon?.classList.remove("pulsate");
    }
  }
};
customElements.define("trusted-signers-panel", TrustedSignersPanel);
export {
  TrustedSignersPanel,
  trustedSignersLocales
};
