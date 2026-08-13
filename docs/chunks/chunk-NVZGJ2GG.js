import {
  ask,
  connect,
  disconnect,
  reply,
  requestNostrDbAppBackfill,
  serializeError,
  tell
} from "./chunk-K7RWYLU3.js";
import {
  append
} from "./chunk-JDLAFNFY.js";
import {
  run
} from "./chunk-2RF63PFL.js";
import {
  filterVisibleAccounts,
  read,
  subscribe as subscribe3
} from "./chunk-3P7U4I6T.js";
import {
  get,
  getBunkerHandle,
  getNsecSigner,
  list,
  npubFromPubkey,
  parseProfileEvent,
  parseRelayListEvent,
  subscribe,
  subscribe2,
  update
} from "./chunk-2IRIIQPD.js";
import {
  launcherLocale,
  setLocale
} from "./chunk-KYIGV7TE.js";

// src/services/view-state.js
var shell = null;
function setVaultViewShell(nextShell) {
  shell = nextShell;
}
function resetVaultView() {
  if (!shell) return;
  const {
    list: list2,
    addPanel,
    syncPanel,
    toolbarButtons = []
  } = shell;
  addPanel?.querySelector('button[data-action="cancel"]')?.click();
  syncPanel?.close();
  for (const avatar of list2?.querySelectorAll('account-avatar[mode="creating"]') ?? []) {
    avatar.querySelector('button[data-action="cancel-create"]')?.click();
  }
  for (const avatar of list2?.querySelectorAll('account-avatar[mode="editing"]') ?? []) {
    avatar.querySelector('button[data-action="cancel-edit"]')?.click();
  }
  list2?.exitSelectionMode();
  for (const button of toolbarButtons) {
    if (!button) continue;
    button.disabled = false;
    button.classList.remove("is-active");
  }
}

// src/services/messenger.js
var UNLOGGED_METHODS = /* @__PURE__ */ new Set([
  "getPublicKey",
  "get_public_key",
  "getRelays",
  "get_relays",
  "obfuscate"
]);
var NIP44_V3_CONTEXT_METHODS = /* @__PURE__ */ new Set([
  "nip44v3_encrypt",
  "nip44v3_decrypt",
  "nip44v3_encrypt_double_dh",
  "nip44v3_decrypt_double_dh"
]);
var LAUNCHER_APP_NAME = "App launcher";
function normalizedEventKind(kind) {
  const n = typeof kind === "string" && kind.trim() !== "" ? Number(kind) : kind;
  return Number.isInteger(n) && n >= 0 && n <= 4294967295 ? n : void 0;
}
function signerRequestApp(app) {
  const id = app?.id ?? "";
  const name = app?.name ?? "";
  const alias = app?.alias ?? "";
  const icon = app?.icon?.url ?? "";
  if (!String(id).trim() && !String(name).trim() && !String(alias).trim() && !String(icon).trim()) {
    return { id: "", name: LAUNCHER_APP_NAME, icon: "", alias: "" };
  }
  return { id, name, icon, alias };
}
function signerRequestContext(method, params = []) {
  if (method === "sign_event" || method === "double_sign_event") {
    return params?.[0]?.kind == null ? {} : { eventKind: params[0].kind };
  }
  if (!NIP44_V3_CONTEXT_METHODS.has(method)) return {};
  const eventKind = normalizedEventKind(params?.[1]);
  return {
    ...eventKind === void 0 ? {} : { eventKind },
    eventScope: String(params?.[2] ?? "")
  };
}
var TRUSTED_ORIGIN_PATTERNS = [
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/,
  "https://44billion.net"
];
function isTrustedOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  for (const rule of TRUSTED_ORIGIN_PATTERNS) {
    if (rule instanceof RegExp ? rule.test(origin) : rule === origin) return true;
  }
  return false;
}
function syncTrustedParentOrigin() {
  const ancestors = window.location.ancestorOrigins;
  if (ancestors?.length) {
    return isTrustedOrigin(ancestors[0]) ? ancestors[0] : null;
  }
  try {
    if (!document.referrer) return null;
    const origin = new URL(document.referrer).origin;
    return isTrustedOrigin(origin) ? origin : null;
  } catch {
    return null;
  }
}
function eventList(event) {
  return event ? [event] : [];
}
function launcherProfile(account) {
  const parsed = parseProfileEvent(account.profileEvent);
  return {
    name: parsed.name || account.name || "",
    about: parsed.about || "",
    picture: parsed.picture || account.picture || "",
    npub: npubFromPubkey(account.pubkey),
    meta: { events: eventList(account.profileEvent) }
  };
}
function launcherRelays(account) {
  const parsed = parseRelayListEvent(account.relayListEvent);
  return {
    read: parsed.read,
    write: parsed.write.length ? parsed.write : [...account.writeRelays || []],
    meta: { events: eventList(account.relayListEvent) }
  };
}
function isAccountLocked(account) {
  if (account.type === "npub") return false;
  if (account.type === "nsec") return !getNsecSigner(account.pubkey);
  if (account.type === "bunker") return !getBunkerHandle(account.pubkey);
  return true;
}
function accountForLauncher(account) {
  return {
    pubkey: account.pubkey,
    profile: launcherProfile(account),
    relays: launcherRelays(account),
    isReadOnly: account.type === "npub",
    isLocked: isAccountLocked(account)
  };
}
function snapshotAccounts() {
  return filterVisibleAccounts(list()).map(accountForLauncher);
}
function isNewerEvent(event, storedEvent) {
  return Number.isFinite(event?.created_at) && event.created_at > (storedEvent?.created_at ?? 0);
}
async function applyAccountEvents(pubkey, events) {
  const account = pubkey ? get(pubkey) : null;
  if (!account || !Array.isArray(events) || !events.length) return false;
  const patch = {};
  for (const event of events) {
    if (event?.kind === 0 && isNewerEvent(event, patch.profileEvent || account.profileEvent)) {
      const parsed = parseProfileEvent(event);
      patch.profileEvent = event;
      patch.name = parsed.name || account.name || "";
      patch.picture = parsed.picture || account.picture || "";
    } else if (event?.kind === 10002 && isNewerEvent(event, patch.relayListEvent || account.relayListEvent)) {
      const relays = parseRelayListEvent(event);
      patch.relayListEvent = event;
      patch.writeRelays = relays.write;
    }
  }
  if (!Object.keys(patch).length) return false;
  await update(pubkey, patch);
  return true;
}
var launcherPort = null;
var launcherOrigin = null;
var handshakeComplete = false;
var unsubscribeStore = null;
var unsubscribeSecrets = null;
var unsubscribeJournal = null;
var accountsStateQueued = false;
var lastAccountsStateFingerprint = null;
var pendingTranslateMessages = [];
function setAccountsState() {
  if (!handshakeComplete || !launcherPort) return;
  if (read()) return;
  const accounts = snapshotAccounts();
  const fingerprint = JSON.stringify(accounts);
  if (fingerprint === lastAccountsStateFingerprint) return;
  tell(launcherPort, {
    code: "SET_ACCOUNTS_STATE",
    payload: { accounts }
  });
  lastAccountsStateFingerprint = fingerprint;
}
async function requestVaultClose(timeoutMs = 1500) {
  if (!handshakeComplete || !launcherPort) return;
  setAccountsState();
  await ask(launcherPort, {
    code: "CLOSE_VAULT_VIEW",
    payload: null
  }, { timeout: timeoutMs });
}
function scheduleAccountsState() {
  if (accountsStateQueued) return;
  accountsStateQueued = true;
  queueMicrotask(() => {
    accountsStateQueued = false;
    setAccountsState();
  });
}
function startAccountStateSubscriptions() {
  unsubscribeStore?.();
  unsubscribeSecrets?.();
  unsubscribeJournal?.();
  unsubscribeStore = subscribe(scheduleAccountsState);
  unsubscribeSecrets = subscribe2(scheduleAccountsState);
  unsubscribeJournal = subscribe3(scheduleAccountsState);
}
async function initMessenger() {
  if (window === window.top) return;
  launcherOrigin = syncTrustedParentOrigin();
  const targetOrigin = launcherOrigin ?? "*";
  const { port1, port2 } = new MessageChannel();
  port1.addEventListener("message", onPortMessage);
  port1.start();
  launcherPort = port1;
  const accounts = snapshotAccounts();
  const accountsFingerprint = JSON.stringify(accounts);
  const { error, origin } = await ask(window.parent, {
    code: "VAULT_READY",
    payload: { accounts }
  }, { targetOrigin, transfer: [port2] });
  if (error || !isTrustedOrigin(origin)) {
    try {
      port1.close();
    } catch {
    }
    disconnect(port1);
    launcherPort = null;
    lastAccountsStateFingerprint = null;
    return;
  }
  launcherOrigin ??= origin;
  handshakeComplete = true;
  lastAccountsStateFingerprint = accountsFingerprint;
  pendingTranslateMessages.splice(0).forEach(handleTranslate);
  connect(launcherPort);
  startAccountStateSubscriptions();
  scheduleAccountsState();
}
function onPortMessage(e) {
  if (!e.data || typeof e.data !== "object") return;
  const { code } = e.data;
  if (code === "REPLY") return;
  if (code === "TRANSLATE") {
    if (!handshakeComplete) pendingTranslateMessages.push(e);
    else handleTranslate(e);
    return;
  }
  if (!handshakeComplete) return;
  if (handleLegacyViewMessage(e)) return;
  if (code === "UPDATE_ACCOUNT_EVENTS") return handleUpdateAccountEvents(e);
  if (code === "NOSTRDB_APP_BACKFILL") return handleNostrDbAppBackfill(e);
  if (code === "NIP07") return handleNip07(e);
}
function handleLegacyViewMessage(e, {
  resetView = resetVaultView,
  sendReply = (message) => reply(e, message, { to: launcherPort })
} = {}) {
  const { code, reqId } = e?.data ?? {};
  if (code !== "CLOSED_VAULT_VIEW" && code !== "OPEN_VAULT_HOME" && code !== "UNLOCK_ACCOUNT") {
    return false;
  }
  try {
    resetView();
    if (reqId) {
      sendReply({
        payload: code === "UNLOCK_ACCOUNT" ? { isRouteReady: true } : true
      });
    }
  } catch (err) {
    if (reqId) sendReply({ error: serializeError(err) });
  }
  return true;
}
function handleTranslate(e) {
  try {
    const { locale, lang } = e.data.payload ?? {};
    setLocale(launcherLocale(locale, lang));
    if (e.data.reqId) reply(e, { payload: true }, { to: launcherPort });
  } catch (err) {
    if (e.data.reqId) reply(e, { error: serializeError(err) }, { to: launcherPort });
  }
}
async function handleUpdateAccountEvents(e) {
  const { pubkey, events } = e.data.payload ?? {};
  try {
    await applyAccountEvents(pubkey, events);
  } catch (err) {
    console.warn("UPDATE_ACCOUNT_EVENTS failed", err?.message ?? err);
  }
}
function handleNostrDbAppBackfill(e) {
  const { ownerPubkey, appId } = e.data.payload ?? {};
  let accepted = false;
  try {
    accepted = requestNostrDbAppBackfill({ ownerPubkey, appId }) === true;
  } catch (err) {
    console.warn("NOSTRDB_APP_BACKFILL failed", err?.message ?? err);
  }
  if (e.data.reqId) reply(e, { payload: { accepted } }, { to: launcherPort });
}
async function handleSignerRequest(e, { code, run: run2 }) {
  const { pubkey, method, params = [], app = {}, with_shared_key: withSharedKey = null, context: requestContext = "" } = e.data.payload ?? {};
  const signerContext = signerRequestContext(method, params);
  const context = typeof requestContext === "string" && requestContext ? requestContext : "";
  const errorContext = {
    ...signerContext,
    ...context ? { context } : {}
  };
  const logBase = {
    code,
    pubkey,
    method,
    app: signerRequestApp(app),
    origin: launcherOrigin,
    ...signerContext,
    ...context ? { context } : {}
  };
  const shouldLog = !UNLOGGED_METHODS.has(method);
  try {
    const payload = await run2({ pubkey, method, params, withSharedKey });
    if (shouldLog) {
      await append({ ...logBase, status: "success", params, result: payload });
    }
    reply(e, { payload }, { to: launcherPort });
  } catch (err) {
    const serialized = serializeError(err, errorContext);
    if (shouldLog) {
      await append({
        ...logBase,
        status: "failure",
        params,
        error: { message: err.message }
      });
    }
    reply(e, { error: serialized }, { to: launcherPort });
  }
}
async function handleNip07(e) {
  return handleSignerRequest(e, { code: "NIP07", run });
}

export {
  setVaultViewShell,
  setAccountsState,
  requestVaultClose,
  initMessenger
};
