import {
  ask,
  connect,
  disconnect,
  reply,
  requestNostrDbAppBackfill,
  serializeError,
  tell
} from "./chunk-XKVS66NZ.js";
import {
  append
} from "./chunk-VUQ33JTS.js";
import {
  run
} from "./chunk-ODWYKDK7.js";
import {
  accountProfile,
  isAccountMetadataEvent,
  isNewerAccountMetadata
} from "./chunk-ARAI55H6.js";
import {
  filterVisibleAccounts,
  read,
  subscribe as subscribe3
} from "./chunk-JKFX5B2W.js";
import {
  closeStorage,
  get,
  getBunkerHandle,
  getNsecSigner,
  list,
  npubFromPubkey,
  parseProfileEvent,
  parseRelayListEvent,
  relayPool,
  subscribe,
  subscribe2,
  update
} from "./chunk-H4GRMQPD.js";
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

// src/services/local-dev-wipe.js
var DELETE_TIMEOUT_MS = 5e3;
function normalizeError(error) {
  return {
    name: error?.name ?? "Error",
    message: error?.message ?? String(error ?? "Unknown error")
  };
}
function deleteDatabase(indexedDB, name, timeoutMs = DELETE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.deleteDatabase(name);
    } catch (err) {
      reject(err);
      return;
    }
    let blocked = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result?.error) reject(result.error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish({ name, blocked: true }), timeoutMs);
    request.onblocked = () => {
      blocked = true;
    };
    request.onsuccess = () => finish({ name, blocked });
    request.onerror = () => finish({ error: request.error || new Error(`IDB_DELETE_FAILED: ${name}`) });
  });
}
async function clearCacheStorage(caches) {
  if (typeof caches?.keys !== "function" || typeof caches?.delete !== "function") return;
  const names = await caches.keys();
  await Promise.all((names || []).map((name) => caches.delete(name)));
}
async function clearOpfs(storage) {
  if (typeof storage?.getDirectory !== "function") return;
  const directory = await storage.getDirectory();
  if (typeof directory?.entries !== "function" || typeof directory?.removeEntry !== "function") return;
  for await (const [name] of directory.entries()) {
    await directory.removeEntry(name, { recursive: true });
  }
}
async function wipeLocalDevData({
  _window = globalThis.window,
  _navigator = globalThis.navigator,
  _caches = globalThis.caches,
  _indexedDB = globalThis.indexedDB,
  _closeStorage = closeStorage,
  _deleteTimeoutMs = DELETE_TIMEOUT_MS,
  _console = console
} = {}) {
  const failures = [];
  const deletedDatabases = [];
  const blockedDatabases = [];
  const run2 = async (step, work) => {
    try {
      await work();
    } catch (error) {
      failures.push({ step, ...normalizeError(error) });
      _console?.warn?.(`[local-dev-wipe] ${step} failed`, error);
    }
  };
  await run2("storage", () => _closeStorage());
  await run2("indexedDB", async () => {
    if (typeof _indexedDB?.databases !== "function" || typeof _indexedDB?.deleteDatabase !== "function") {
      throw new Error("IDB_UNAVAILABLE");
    }
    const databases = await _indexedDB.databases() || [];
    for (const database of databases) {
      if (typeof database?.name !== "string" || !database.name) continue;
      const result = await deleteDatabase(_indexedDB, database.name, _deleteTimeoutMs);
      deletedDatabases.push(result.name);
      if (result.blocked) blockedDatabases.push(result.name);
    }
  });
  await run2("localStorage", () => _window?.localStorage?.clear?.());
  await run2("sessionStorage", () => _window?.sessionStorage?.clear?.());
  await run2("caches", () => clearCacheStorage(_caches));
  await run2("opfs", () => clearOpfs(_navigator?.storage));
  return { databases: deletedDatabases, blockedDatabases, failures };
}

// src/services/launcher-relay-pool.js
var ENABLE_LAUNCHER_RELAY_POOL = true;
var RELAY_BRIDGE = {
  ATTACH: "RELAY_ATTACH",
  ATTACHED: "RELAY_ATTACHED",
  SEND: "RELAY_SEND",
  FRAME: "RELAY_FRAME",
  CREDIT: "RELAY_CREDIT",
  CLOSE: "RELAY_CLOSE",
  CLOSED: "RELAY_CLOSED",
  DETACH: "RELAY_DETACH",
  FAILURE: "RELAY_FAILURE"
};
var BRIDGE_CREDIT_FRAMES = 64;
var BRIDGE_CREDIT_BYTES = 256 * 1024;
var MAX_QUEUED_FRAMES = 256;
var MAX_QUEUED_BYTES = 1024 * 1024;
function domException(message, name) {
  return typeof DOMException === "function" ? new DOMException(message, name) : Object.assign(new Error(message), { name });
}
function dataByteLength(data) {
  if (typeof data === "string") return data.length;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
  return 0;
}
function isSendableData(data) {
  return typeof data === "string" || data instanceof ArrayBuffer || ArrayBuffer.isView(data) || typeof Blob !== "undefined" && data instanceof Blob;
}
function isValidCloseCode(code) {
  return code === 1e3 || code >= 3e3 && code <= 4999;
}
function messageEvent(data) {
  if (typeof MessageEvent === "function") return new MessageEvent("message", { data, origin: "" });
  const event = new Event("message");
  event.data = data;
  event.origin = "";
  return event;
}
function closeEvent(code, reason, wasClean) {
  if (typeof CloseEvent === "function") return new CloseEvent("close", { code, reason, wasClean });
  const event = new Event("close");
  event.code = code;
  event.reason = reason;
  event.wasClean = wasClean;
  return event;
}
function defineOwnValue(target, key, value) {
  Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: true });
}
function resolveSocketUrl(rawUrl, baseUrl, securePage) {
  let parsed;
  try {
    parsed = new URL(rawUrl, baseUrl);
  } catch {
    throw domException(`Failed to construct 'WebSocket': The URL '${rawUrl}' is invalid.`, "SyntaxError");
  }
  if (parsed.hash) throw domException(`Failed to construct 'WebSocket': The URL '${rawUrl}' contains a fragment.`, "SyntaxError");
  if (parsed.protocol === "http:") parsed.protocol = "ws:";
  else if (parsed.protocol === "https:") parsed.protocol = "wss:";
  if (securePage && parsed.protocol === "ws:") parsed.protocol = "wss:";
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw domException("Failed to construct 'WebSocket': The URL's scheme must be either 'ws' or 'wss'.", "SyntaxError");
  }
  return parsed.href;
}
function shouldUseLauncherRelayPool(payload, { enabled = ENABLE_LAUNCHER_RELAY_POOL } = {}) {
  return enabled === true && payload?.relayPoolSupported === true && payload?.relayPoolEnabled === true;
}
function installLauncherRelayPoolShim({
  port,
  enabled = ENABLE_LAUNCHER_RELAY_POOL,
  targetWindow = window,
  baseUrl = document.baseURI,
  securePage = location.protocol === "https:",
  relayPoolImpl = relayPool,
  log = () => {
  }
} = {}) {
  if (!enabled || !port || typeof port.postMessage !== "function") return null;
  const OriginalWebSocket = targetWindow.WebSocket;
  if (typeof OriginalWebSocket !== "function") return null;
  let serial = 0;
  const sockets = /* @__PURE__ */ new Map();
  const onPortMessage2 = (event) => {
    const message = event.data;
    const virtualId = message?.payload?.virtualId;
    if (!virtualId) return;
    sockets.get(virtualId)?._receive(message);
  };
  port.addEventListener("message", onPortMessage2);
  port.start?.();
  class LauncherRelayPoolWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;
    #virtualId;
    #creditFrames = BRIDGE_CREDIT_FRAMES;
    #creditBytes = BRIDGE_CREDIT_BYTES;
    #queue = [];
    #queuedBytes = 0;
    #grantedFrames = 0;
    #grantedBytes = 0;
    #creditScheduled = false;
    #receivedAt = null;
    #through;
    #binaryType = "blob";
    constructor(url, protocols) {
      super();
      const protocolList = protocols === void 0 ? [] : typeof protocols === "string" ? [protocols] : Array.from(protocols);
      if (protocolList.length > 0) return new OriginalWebSocket(url, protocols);
      const resolved = resolveSocketUrl(String(url), baseUrl, securePage);
      defineOwnValue(this, "url", resolved);
      defineOwnValue(this, "readyState", 0);
      defineOwnValue(this, "protocol", "");
      defineOwnValue(this, "extensions", "");
      this.#virtualId = `vault-relay-${++serial}`;
      sockets.set(this.#virtualId, this);
      port.postMessage({
        code: RELAY_BRIDGE.ATTACH,
        payload: { virtualId: this.#virtualId, url: resolved }
      });
    }
    get binaryType() {
      return this.#binaryType;
    }
    set binaryType(value) {
      if (value !== "blob" && value !== "arraybuffer") {
        throw domException(`Failed to set the 'binaryType' property on 'WebSocket': The provided value '${value}' is not valid.`, "SyntaxError");
      }
      this.#binaryType = value;
    }
    get bufferedAmount() {
      return this.#queuedBytes;
    }
    send(data) {
      if (this.readyState === LauncherRelayPoolWebSocket.CONNECTING) {
        throw domException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.", "InvalidStateError");
      }
      if (this.readyState !== LauncherRelayPoolWebSocket.OPEN) return;
      if (!isSendableData(data)) {
        throw new TypeError("Failed to execute 'send' on 'WebSocket': The provided value is not of type '(ArrayBuffer or ArrayBufferView or Blob or string)'.");
      }
      const size = dataByteLength(data);
      if (this.#queue.length > 0 || this.#creditFrames < 1 || this.#creditBytes < size) {
        this.#queue.push(data);
        this.#queuedBytes += size;
        if (this.#queue.length > MAX_QUEUED_FRAMES || this.#queuedBytes > MAX_QUEUED_BYTES) {
          port.postMessage({ code: RELAY_BRIDGE.FAILURE, payload: { url: this.url, code: 1013, phase: "bridge", wasClean: false } });
          port.postMessage({ code: RELAY_BRIDGE.CLOSE, payload: { virtualId: this.#virtualId, code: 1e3, reason: "" } });
          this.#finalizeClose(1013, "relay bridge queue overflow", false);
        }
        return;
      }
      this.#consumeCredit(size);
      port.postMessage({ code: RELAY_BRIDGE.SEND, payload: { virtualId: this.#virtualId, data } });
    }
    close(code = 1e3, reason = "") {
      if (!isValidCloseCode(code)) {
        throw domException("Failed to execute 'close' on 'WebSocket': The close code must be either 1000 or in the range 3000 to 4999.", "InvalidAccessError");
      }
      if (this.readyState === LauncherRelayPoolWebSocket.CLOSING || this.readyState === LauncherRelayPoolWebSocket.CLOSED) return;
      this.#clearBuffers();
      if (this.readyState === LauncherRelayPoolWebSocket.CONNECTING) {
        defineOwnValue(this, "readyState", LauncherRelayPoolWebSocket.CLOSING);
        port.postMessage({ code: RELAY_BRIDGE.CLOSE, payload: { virtualId: this.#virtualId, code, reason } });
        queueMicrotask(() => this.#finalizeClose(1006, "", false));
        return;
      }
      defineOwnValue(this, "readyState", LauncherRelayPoolWebSocket.CLOSING);
      port.postMessage({ code: RELAY_BRIDGE.CLOSE, payload: { virtualId: this.#virtualId, code, reason } });
    }
    _receive(message) {
      if (this.readyState === LauncherRelayPoolWebSocket.CLOSED) return;
      if (this.readyState === LauncherRelayPoolWebSocket.CLOSING && message.code !== RELAY_BRIDGE.CLOSED && message.code !== RELAY_BRIDGE.DETACH) return;
      const payload = message.payload ?? {};
      switch (message.code) {
        case RELAY_BRIDGE.ATTACHED:
          if (typeof payload.url === "string") defineOwnValue(this, "url", payload.url);
          defineOwnValue(this, "extensions", payload.extensions ?? "");
          defineOwnValue(this, "readyState", LauncherRelayPoolWebSocket.OPEN);
          this.#fire("open");
          this.#flushQueue();
          break;
        case RELAY_BRIDGE.FRAME: {
          const data = payload.data;
          this.#grantCredit(dataByteLength(data), payload.sequence);
          this.#fire("message", messageEvent(data));
          break;
        }
        case RELAY_BRIDGE.CREDIT:
          this.#creditFrames += payload.frames ?? 0;
          this.#creditBytes += payload.bytes ?? 0;
          this.#flushQueue();
          break;
        case RELAY_BRIDGE.CLOSED:
          this.#finalizeClose(payload.code ?? 1006, payload.reason ?? "", payload.wasClean === true);
          break;
        case RELAY_BRIDGE.DETACH:
          this.#finalizeClose(1006, payload.reason ?? "relay pool unavailable", false);
          break;
      }
    }
    #consumeCredit(size) {
      this.#creditFrames--;
      this.#creditBytes -= size;
    }
    #grantCredit(size, through) {
      this.#receivedAt ??= performance.timeOrigin + performance.now();
      this.#through = through;
      this.#grantedFrames++;
      this.#grantedBytes += size;
      if (this.#creditScheduled) return;
      this.#creditScheduled = true;
      queueMicrotask(() => {
        this.#creditScheduled = false;
        if (this.readyState !== LauncherRelayPoolWebSocket.OPEN) return;
        if (this.#grantedFrames === 0 && this.#grantedBytes === 0) return;
        port.postMessage({
          code: RELAY_BRIDGE.CREDIT,
          payload: { virtualId: this.#virtualId, frames: this.#grantedFrames, bytes: this.#grantedBytes, through: this.#through, receivedAt: this.#receivedAt, returnedAt: performance.timeOrigin + performance.now() }
        });
        this.#grantedFrames = 0;
        this.#grantedBytes = 0;
        this.#receivedAt = null;
        this.#through = void 0;
      });
    }
    #flushQueue() {
      while (this.#queue.length > 0 && this.readyState === LauncherRelayPoolWebSocket.OPEN) {
        const data = this.#queue[0];
        const size = dataByteLength(data);
        if (this.#creditFrames < 1 || this.#creditBytes < size) return;
        this.#queue.shift();
        this.#queuedBytes -= size;
        this.#consumeCredit(size);
        port.postMessage({ code: RELAY_BRIDGE.SEND, payload: { virtualId: this.#virtualId, data } });
      }
    }
    #clearBuffers() {
      this.#queue.length = 0;
      this.#queuedBytes = 0;
      this.#grantedFrames = 0;
      this.#grantedBytes = 0;
      this.#receivedAt = null;
      this.#through = void 0;
    }
    #finalizeClose(code, reason, wasClean) {
      if (this.readyState === LauncherRelayPoolWebSocket.CLOSED) return;
      sockets.delete(this.#virtualId);
      this.#clearBuffers();
      defineOwnValue(this, "readyState", LauncherRelayPoolWebSocket.CLOSED);
      this.#fire("close", closeEvent(code, reason, wasClean));
    }
    #fire(type, event = new Event(type)) {
      this.dispatchEvent(event);
      const handler = this[`on${type}`];
      if (typeof handler === "function") handler(event);
    }
  }
  Object.defineProperties(LauncherRelayPoolWebSocket.prototype, {
    CONNECTING: { value: 0 },
    OPEN: { value: 1 },
    CLOSING: { value: 2 },
    CLOSED: { value: 3 }
  });
  Object.setPrototypeOf(LauncherRelayPoolWebSocket.prototype, OriginalWebSocket.prototype);
  for (const key of Object.getOwnPropertyNames(OriginalWebSocket)) {
    if (key === "prototype" || key === "length" || key === "name") continue;
    const descriptor = Object.getOwnPropertyDescriptor(OriginalWebSocket, key);
    if (!descriptor || typeof descriptor.value === "function") continue;
    try {
      Object.defineProperty(LauncherRelayPoolWebSocket, key, descriptor);
    } catch {
    }
  }
  targetWindow.WebSocket = LauncherRelayPoolWebSocket;
  relayPoolImpl.setWebSocket?.(LauncherRelayPoolWebSocket);
  relayPoolImpl.disconnectAll?.()?.catch?.((error) => log("[vault-relay-pool] disconnectAll failed", error));
  return {
    WebSocket: LauncherRelayPoolWebSocket,
    dispose() {
      port.removeEventListener("message", onPortMessage2);
      for (const socket of [...sockets.values()]) socket.close(1e3, "");
      sockets.clear();
    }
  };
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
function eventList(event, pubkey, kind) {
  return isAccountMetadataEvent(event, pubkey, kind) ? [event] : [];
}
function launcherProfile(account) {
  return {
    ...accountProfile(account),
    npub: npubFromPubkey(account.pubkey),
    meta: { events: eventList(account.profileEvent, account.pubkey, 0) }
  };
}
function launcherRelays(account) {
  const parsed = parseRelayListEvent(eventList(account.relayListEvent, account.pubkey, 10002)[0]);
  return {
    read: parsed.read,
    write: parsed.write.length ? parsed.write : [...account.writeRelays || []],
    meta: { events: eventList(account.relayListEvent, account.pubkey, 10002) }
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
async function applyAccountEvents(pubkey, events) {
  const account = pubkey ? get(pubkey) : null;
  if (!account || !Array.isArray(events) || !events.length) return false;
  const patch = {};
  for (const event of events) {
    if (event?.kind === 0 && isNewerAccountMetadata(event, patch.profileEvent || account.profileEvent, pubkey, 0)) {
      const parsed = parseProfileEvent(event);
      patch.profileEvent = event;
      patch.about = parsed.about;
      patch.name = parsed.name || account.name || "";
      patch.picture = parsed.picture || account.picture || "";
    } else if (event?.kind === 10002 && isNewerAccountMetadata(event, patch.relayListEvent || account.relayListEvent, pubkey, 10002)) {
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
  const { port1: relayPort, port2: relayPortForLauncher } = new MessageChannel();
  port1.addEventListener("message", onPortMessage);
  port1.start();
  relayPort.start();
  launcherPort = port1;
  const accounts = snapshotAccounts();
  const accountsFingerprint = JSON.stringify(accounts);
  const { error, origin, payload } = await ask(window.parent, {
    code: "VAULT_READY",
    payload: { accounts }
  }, { targetOrigin, transfer: [port2, relayPortForLauncher] });
  if (error || !isTrustedOrigin(origin)) {
    try {
      port1.close();
    } catch {
    }
    try {
      relayPort.close();
    } catch {
    }
    disconnect(port1);
    launcherPort = null;
    lastAccountsStateFingerprint = null;
    return;
  }
  launcherOrigin ??= origin;
  handshakeComplete = true;
  if (shouldUseLauncherRelayPool(payload)) {
    installLauncherRelayPoolShim({ port: relayPort });
  } else {
    try {
      relayPort.close();
    } catch {
    }
  }
  window.addEventListener("pagehide", () => {
    if (launcherPort === port1 && handshakeComplete) tell(port1, { code: "VAULT_CONNECTION_STATE", payload: { connected: false } });
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && launcherPort === port1 && handshakeComplete) {
      setAccountsState();
      tell(port1, { code: "VAULT_CONNECTION_STATE", payload: { connected: true } });
    }
  });
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
  if (code === "VAULT_PING") return reply(e, { payload: true }, { to: launcherPort });
  if (handleLegacyViewMessage(e)) return;
  if (code === "UPDATE_ACCOUNT_EVENTS") return handleUpdateAccountEvents(e);
  if (code === "NOSTRDB_APP_BACKFILL") return handleNostrDbAppBackfill(e);
  if (code === "NIP07") return handleNip07(e);
  if (code === "LOCAL_DEV_WIPE") return handleLocalDevWipe(e);
}
function handleLocalDevWipe(e, {
  _wipe = wipeLocalDevData,
  _reply = (message) => reply(e, message, { to: launcherPort }),
  _setTimeout = setTimeout,
  _reload = () => globalThis.location?.reload?.()
} = {}) {
  if (true) return;
  return _wipe().then((result) => {
    _reply({ payload: result });
    _setTimeout(() => {
      try {
        _reload();
      } catch {
      }
    }, 50);
  }).catch((error) => {
    _reply({ error: serializeError(error) });
  });
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
