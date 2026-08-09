import {
  applySwUpdate,
  initMessenger,
  initSwManager,
  isUpdateAvailable,
  setVaultViewShell,
  subscribeSwUpdate,
  swUpdateLocales
} from "./chunks/chunk-TD5YSDDP.js";
import {
  init,
  startDeviceRelayListRefresh,
  startRevocationRotation
} from "./chunks/chunk-ZZ4ZLTA2.js";
import {
  clearError,
  setError
} from "./chunks/chunk-OQVZFKQZ.js";
import {
  isOnline,
  onOnline,
  startContentKeyEventRefresh
} from "./chunks/chunk-KCKKZNMN.js";
import {
  filterVisibleAccounts,
  recoverPendingMutation,
  runSecretAccountMutation
} from "./chunks/chunk-MEHHDEEL.js";
import "./chunks/chunk-ZI5XKXWT.js";
import {
  checkForIconUpdate,
  hasPasskey
} from "./chunks/chunk-35T5INCI.js";
import "./chunks/chunk-QAUDS4MV.js";
import {
  seededAvatarDataUrl
} from "./chunks/chunk-4RHK4XWQ.js";
import {
  fetchLatestProfile,
  fetchRelayListEvent,
  freeRelays,
  get,
  getBunkerHandle,
  initializeStorage,
  isUnlocked,
  list,
  parseProfileEvent,
  parseRelayListEvent,
  subscribe2 as subscribe,
  transferBunkerSecret,
  update
} from "./chunks/chunk-KDVVJYRE.js";
import {
  defineLocales,
  getT,
  subscribeLocaleChanged
} from "./chunks/chunk-KYIGV7TE.js";
import "./chunks/chunk-NZLE2WMY.js";

// src/services/profile-rehydrator.js
var stopOnlineWatcher = null;
var retryTimer = null;
var RETRY_BACKOFF_MS = 6e4;
async function rehydrateAll() {
  const accounts = filterVisibleAccounts(list());
  if (!accounts.length) return;
  const online = await isOnline();
  if (!online) return scheduleRetry();
  const pending = accounts.map((a) => rehydrateOne(a).catch((err) => {
    console.warn("rehydrate failed for", a.pubkey, err?.message ?? err);
    return { failed: true };
  }));
  const results = await Promise.all(pending);
  if (results.some((r) => r?.failed)) scheduleRetry();
}
async function rehydrateOne(account) {
  const patch = {};
  if (account.type === "bunker" && account.bunker) {
    const handle = getBunkerHandle(account.pubkey);
    if (!handle) {
      return { updated: false };
    }
    let liveBunkerPubkey;
    try {
      liveBunkerPubkey = await handle.getPublicKey();
      clearError(account.pubkey);
    } catch (err) {
      setError(account.pubkey, String(err?.message ?? err));
      throw err;
    }
    if (liveBunkerPubkey !== account.pubkey) {
      if (get(liveBunkerPubkey)) {
        console.warn("Bunker pubkey drifted into an already-imported account", account.pubkey, "->", liveBunkerPubkey);
        return { updated: false };
      }
      console.warn("Bunker pubkey drifted \u2014 adopting new pubkey", account.pubkey, "->", liveBunkerPubkey);
      const oldPubkey = account.pubkey;
      const reset = {
        pubkey: liveBunkerPubkey,
        profileEvent: void 0,
        relayListEvent: void 0,
        writeRelays: void 0,
        name: "",
        picture: void 0
      };
      const afterAccount = { ...account, ...reset };
      try {
        await runSecretAccountMutation({
          operation: "bunker-drift",
          beforeAccounts: [account],
          afterAccounts: [afterAccount],
          apply: async () => {
            await update(oldPubkey, reset);
            await transferBunkerSecret(oldPubkey, liveBunkerPubkey);
          }
        });
        account = afterAccount;
      } catch (err) {
        console.warn("failed to re-seal vault blob after bunker drift", err?.message ?? err);
        return { updated: false };
      }
    }
  }
  const relayListEvent = await fetchRelayListEvent(account.pubkey);
  const cachedRelayListAt = account.relayListEvent?.created_at ?? 0;
  let writeRelays = account.writeRelays;
  if (relayListEvent && relayListEvent.created_at > cachedRelayListAt) {
    const parsed = parseRelayListEvent(relayListEvent);
    if (parsed.write.length) {
      writeRelays = parsed.write;
      patch.relayListEvent = relayListEvent;
      patch.writeRelays = parsed.write;
    }
  }
  const targetWriteRelays = writeRelays?.length ? writeRelays : freeRelays.slice(0, 2);
  const fresh = await fetchLatestProfile(account.pubkey, { writeRelays: targetWriteRelays });
  const cachedProfileAt = account.profileEvent?.created_at ?? 0;
  if (fresh && fresh.created_at > cachedProfileAt) {
    const parsed = parseProfileEvent(fresh);
    patch.profileEvent = fresh;
    patch.name = parsed.name || account.name || "";
    patch.picture = parsed.picture || account.picture || await seededAvatarDataUrl(account.pubkey);
  } else if (!account.picture) {
    patch.picture = await seededAvatarDataUrl(account.pubkey);
  }
  if (Object.keys(patch).length) await update(account.pubkey, patch);
  return { updated: Object.keys(patch).length > 0 };
}
function scheduleRetry() {
  if (stopOnlineWatcher) return;
  stopOnlineWatcher = onOnline(() => {
    clearRetry();
    rehydrateAll();
  });
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    clearRetry();
    rehydrateAll();
  }, RETRY_BACKOFF_MS);
}
function clearRetry() {
  stopOnlineWatcher?.();
  stopOnlineWatcher = null;
  clearTimeout(retryTimer);
  retryTimer = null;
}

// src/i18n/shell.js
var shellLocales = defineLocales({
  "New Account": ["Nouveau compte", "Nuovo account", "Neues Konto", "Nueva cuenta", "Nova conta", "\u041D\u043E\u0432\u0430\u044F \u0443\u0447\u0451\u0442\u043D\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C", "\u65B0\u5EFA\u8D26\u6237", "\u65B0\u589E\u5E33\u6236", "\u65B0\u3057\u3044\u30A2\u30AB\u30A6\u30F3\u30C8", "\uC0C8 \uACC4\uC815"],
  "Add Account": ["Ajouter un compte", "Aggiungi account", "Konto hinzuf\xFCgen", "A\xF1adir cuenta", "Adicionar conta", "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0443\u0447\u0451\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C", "\u6DFB\u52A0\u8D26\u6237", "\u65B0\u589E\u5E33\u6236", "\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u8FFD\u52A0", "\uACC4\uC815 \uCD94\uAC00"],
  Add: ["Ajouter", "Aggiungi", "Hinzuf\xFCgen", "A\xF1adir", "Adicionar", "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C", "\u6DFB\u52A0", "\u65B0\u589E", "\u8FFD\u52A0", "\uCD94\uAC00"],
  "Sync Devices": ["Synchroniser les appareils", "Sincronizza dispositivi", "Ger\xE4te synchronisieren", "Sincronizar dispositivos", "Sincronizar dispositivos", "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430", "\u540C\u6B65\u8BBE\u5907", "\u540C\u6B65\u88DD\u7F6E", "\u30C7\u30D0\u30A4\u30B9\u3092\u540C\u671F", "\uAE30\uAE30 \uB3D9\uAE30\uD654"],
  Sync: ["Synchroniser", "Sincronizza", "Synchronisieren", "Sincronizar", "Sincronizar", "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F", "\u540C\u6B65", "\u540C\u6B65", "\u540C\u671F", "\uB3D9\uAE30\uD654"],
  "Trusted devices": ["Appareils de confiance", "Dispositivi attendibili", "Vertrauensw\xFCrdige Ger\xE4te", "Dispositivos de confianza", "Dispositivos confi\xE1veis", "\u0414\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0435 \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0430", "\u53D7\u4FE1\u4EFB\u7684\u8BBE\u5907", "\u53D7\u4FE1\u4EFB\u7684\u88DD\u7F6E", "\u4FE1\u983C\u6E08\u307F\u30C7\u30D0\u30A4\u30B9", "\uC2E0\uB8B0\uD560 \uC218 \uC788\uB294 \uAE30\uAE30"],
  "Activity log": ["Journal d\u2019activit\xE9", "Registro attivit\xE0", "Aktivit\xE4tsprotokoll", "Registro de actividad", "Registro de atividades", "\u0416\u0443\u0440\u043D\u0430\u043B \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438", "\u6D3B\u52A8\u65E5\u5FD7", "\u6D3B\u52D5\u8A18\u9304", "\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u30ED\u30B0", "\uD65C\uB3D9 \uB85C\uADF8"]
});
var t = getT(shellLocales);
var textKeys = {
  "new-account": "New Account",
  "add-account": "Add Account",
  add: "Add",
  "sync-devices": "Sync Devices",
  sync: "Sync"
};
var headerKeys = {
  "trusted-devices": "Trusted devices",
  "activity-log": "Activity log"
};
function translateShell() {
  for (const [name, key] of Object.entries(textKeys)) {
    const node = document.querySelector(`[data-i18n="${name}"]`);
    if (node) node.textContent = t(key);
  }
  for (const [name, key] of Object.entries(headerKeys)) {
    const panel = document.querySelector(`[data-i18n-header="${name}"]`);
    panel?.setAttribute("header", t(key));
    const label = panel?.querySelector(".accordion-label");
    if (label) label.textContent = t(key);
  }
}
function initShellI18n() {
  translateShell();
  return subscribeLocaleChanged(translateShell);
}

// src/index.js
await initializeStorage();
await Promise.all([
  import("./chunks/account-list-WQ776ULF.js"),
  import("./chunks/account-add-367GZ4VI.js"),
  import("./chunks/sync-panel-CFE5F7Q6.js"),
  import("./chunks/trusted-signers-panel-6AXTFXGP.js"),
  import("./chunks/accordion-panel-AGHO422R.js"),
  import("./chunks/toast-VTWQ4NKU.js"),
  import("./chunks/activity-log-UHUTGGIJ.js"),
  import("./chunks/lock-overlay-GDRZEXBV.js"),
  import("./chunks/create-overlay-TXL6OWYF.js")
]);
document.getElementById("vault").style.visibility = "visible";
var list2 = document.querySelector("account-list");
var addPanel = document.querySelector("account-add");
var syncPanel = document.querySelector("sync-panel");
var createBtn = document.getElementById("create-account-btn");
var addBtn = document.getElementById("add-account-btn");
var syncBtn = document.getElementById("sync-devices-btn");
initShellI18n();
var updateBanner = document.getElementById("update-banner");
var updateBannerText = updateBanner.querySelector(".update-banner-text");
var updateBannerButton = updateBanner.querySelector(".update-banner-button");
var updateT = getT(swUpdateLocales);
function translateUpdateBanner() {
  updateBannerText.textContent = updateT("Update available");
  updateBannerButton.textContent = updateT("Update");
}
subscribeSwUpdate((available) => updateBanner.toggleAttribute("hidden", !isUpdateAvailable(available)));
updateBannerButton.addEventListener("click", applySwUpdate);
translateUpdateBanner();
subscribeLocaleChanged(translateUpdateBanner);
initSwManager();
list2.toolbarButtons = [addBtn, syncBtn];
list2.createButton = createBtn;
addPanel.toolbarButtons = [createBtn, syncBtn];
addPanel.activeButton = addBtn;
syncPanel.list = list2;
syncPanel.toolbarButtons = [createBtn, addBtn];
syncPanel.activeButton = syncBtn;
setVaultViewShell({
  list: list2,
  addPanel,
  syncPanel,
  toolbarButtons: [createBtn, addBtn, syncBtn]
});
createBtn.addEventListener("click", () => {
  if (createBtn.classList.contains("is-active")) {
    list2.querySelector('account-avatar[mode="creating"] button[data-action="cancel-create"]')?.click();
  } else {
    list2.startCreate();
  }
});
addBtn.addEventListener("click", () => {
  if (addBtn.classList.contains("is-active")) {
    addPanel.querySelector('button[data-action="cancel"]')?.click();
  } else {
    addPanel.open();
  }
});
syncBtn.addEventListener("click", () => {
  if (syncBtn.classList.contains("is-active")) {
    syncPanel.querySelector(".panel-cancel")?.click();
  } else {
    syncPanel.open();
  }
});
async function recoverThenRehydrate() {
  await recoverPendingMutation();
  await rehydrateAll();
}
var lastUnlocked = isUnlocked();
subscribe(() => {
  const nowUnlocked = isUnlocked();
  if (!lastUnlocked && nowUnlocked) recoverThenRehydrate();
  lastUnlocked = nowUnlocked;
});
recoverThenRehydrate();
initMessenger();
init();
startContentKeyEventRefresh();
startDeviceRelayListRefresh();
startRevocationRotation().catch((err) => {
  console.warn("revocation rotation startup failed", err?.message ?? err);
});
if (window === window.top) {
  document.body.classList.add("dev");
  import("./chunks/dev-panel-ZGKWC42O.js").then(() => {
    document.querySelector(".diagnostics-section")?.append(document.createElement("dev-panel"));
  });
}
if (hasPasskey() && !isUnlocked()) {
  checkForIconUpdate().catch((err) => {
    console.warn("icon update check failed", err?.message ?? err);
  });
}
