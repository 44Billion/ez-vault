import {
  filterVisibleAccounts
} from "./chunk-MEHHDEEL.js";
import {
  CONTENT_KEY_KIND,
  bytesToHex,
  fetchRelayListEvent,
  freeRelays,
  generateSecretKey,
  get,
  getBunkerHandle,
  getContentKeySigner,
  getIykcProofs,
  getLatestContentKeySigner,
  getNsecSigner,
  getState,
  isUnlocked,
  list,
  listContentKeys,
  makeContentKeyEvent,
  makeContentKeyEventForPubkey,
  normalizeKind,
  parseContentKeyEvent,
  parseRelayListEvent,
  relayPool,
  replaceContentKeySecret,
  resolveWriteRelays,
  seedRelays,
  setContentKeySecret,
  setState,
  subscribe2 as subscribe,
  update
} from "./chunk-KDVVJYRE.js";

// node_modules/libp2r2p/network/index.js
async function isOnline() {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    if (!navigator.onLine) return false;
  }
  return hasInternetConnectivity();
}
var CONNECTIVITY_PROBE_URLS = [
  { url: "https://www.gstatic.com/generate_204" },
  { url: "https://connectivitycheck.gstatic.com/generate_204" },
  { url: "https://captive.apple.com/hotspot-detect.html" },
  { method: "GET", url: "https://connectivity-check.ubuntu.com" }
];
async function hasInternetConnectivity() {
  const candidates = shuffle(CONNECTIVITY_PROBE_URLS);
  for (const candidate of candidates) {
    try {
      await ping(candidate.url, { method: candidate.method });
      return true;
    } catch (err) {
      console.warn("connectivity probe failed", candidate.url, err?.message ?? err);
    }
  }
  return false;
}
function shuffle(list2) {
  const copy = list2.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
async function ping(url, { method = "HEAD", timeout = 5e3 } = {}) {
  const abortController = typeof AbortController === "function" ? new AbortController() : null;
  let timerId = null;
  const fetchPromise = fetch(url, {
    method,
    mode: "no-cors",
    cache: "no-store",
    redirect: "follow",
    signal: abortController?.signal
  });
  const completionPromise = fetchPromise.finally(() => {
    if (timerId != null) clearTimeout(timerId);
  });
  const timeoutPromise = new Promise((_resolve, reject) => {
    timerId = setTimeout(() => {
      if (abortController) abortController.abort();
      reject(new Error("PING_TIMEOUT"));
    }, timeout);
  });
  await Promise.race([completionPromise, timeoutPromise]);
  return true;
}
function onOnline(handler) {
  const listener = () => handler();
  window.addEventListener("online", listener);
  return () => window.removeEventListener("online", listener);
}

// src/services/content-key/index.js
var CONTENT_KEY_EVENT_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1e3;
var CONTENT_KEY_EVENT_REFRESH_KEY = "ez-vault:content-key-events:last-refresh";
var stopContentKeyEventRefresh = null;
function copyUnsignedEvent(event) {
  const { id, sig, pubkey, ...unsigned } = event;
  return {
    ...unsigned,
    tags: (event.tags || []).map((tag) => [...tag])
  };
}
function withImkcTag(event, tag) {
  const tags = (event.tags || []).map((tag2) => [...tag2]);
  const indexes = tags.map((tag2, index) => tag2[0] === "imkc" ? index : -1).filter((index) => index >= 0);
  if (indexes.length > 1) throw new Error("MULTIPLE_IMKC_TAGS");
  if (indexes.length) tags[indexes[0]] = tag;
  else tags.push(tag);
  return { ...event, tags };
}
function nowSeconds() {
  return Math.floor(Date.now() / 1e3);
}
function maybeUnref(timer) {
  timer?.unref?.();
  return timer;
}
function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function latestKey(keys) {
  let latest = null;
  for (const key of keys || []) {
    if (!latest || (key.createdAt || 0) >= (latest.createdAt || 0)) latest = key;
  }
  return latest;
}
function readLastContentKeyEventRefresh() {
  const raw = getState(CONTENT_KEY_EVENT_REFRESH_KEY, 0);
  const value = Math.floor(Number(raw) || 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}
function writeLastContentKeyEventRefresh(value = Date.now()) {
  return setState(CONTENT_KEY_EVENT_REFRESH_KEY, Math.max(0, Math.floor(Number(value) || 0)));
}
function contentKeyAccounts() {
  if (!isUnlocked()) return [];
  return filterVisibleAccounts(list()).filter((account) => account.type === "nsec" && listContentKeys(account.pubkey).length);
}
function relayListTemplate({ readRelays = [], writeRelays = [], createdAt = nowSeconds() }) {
  const write = new Set(writeRelays);
  const read = new Set(readRelays);
  const tags = [];
  for (const url of /* @__PURE__ */ new Set([...write, ...read])) {
    const isWrite = write.has(url);
    const isRead = read.has(url);
    if (isWrite && isRead) tags.push(["r", url]);
    else if (isWrite) tags.push(["r", url, "write"]);
    else tags.push(["r", url, "read"]);
  }
  return {
    kind: 10002,
    created_at: createdAt,
    tags,
    content: ""
  };
}
async function publishRelayListIfNeeded({
  account,
  userSigner,
  relayListEvent,
  parsedRelays,
  _relayPool,
  _nowSeconds
}) {
  const fallback = freeRelays.slice(0, 2);
  let readRelays = parsedRelays.read;
  let writeRelays = parsedRelays.write;
  let reason = "";
  if (!relayListEvent) {
    readRelays = fallback;
    writeRelays = fallback;
    reason = "missing";
  } else if (!writeRelays.length) {
    readRelays = unique([...readRelays, ...fallback]);
    writeRelays = unique([...writeRelays, ...fallback]);
    reason = "missing-write";
  }
  if (!reason) {
    const cachedAt = account.relayListEvent?.created_at ?? 0;
    if (relayListEvent.created_at > cachedAt) {
      await update(account.pubkey, { relayListEvent, writeRelays });
    }
    return { writeRelays, relayListEvent, published: false, reason: "" };
  }
  const event = await userSigner.signEvent(relayListTemplate({
    readRelays,
    writeRelays,
    createdAt: _nowSeconds()
  }));
  const result = await _relayPool.sendEvent(event, seedRelays);
  await update(account.pubkey, { relayListEvent: event, writeRelays });
  return { writeRelays, relayListEvent: event, published: true, reason, result };
}
async function resolveContentKeyWriteRelays({
  account,
  userSigner,
  _fetchRelayListEvent,
  _relayPool,
  _nowSeconds
}) {
  const relayListEvent = await _fetchRelayListEvent(account.pubkey);
  const parsedRelays = parseRelayListEvent(relayListEvent);
  return publishRelayListIfNeeded({
    account,
    userSigner,
    relayListEvent,
    parsedRelays,
    _relayPool,
    _nowSeconds
  });
}
async function fetchLatestContentKeyEventFromRelay({ ownerPubkey, relay, _relayPool }) {
  try {
    const response = await _relayPool.getEvents({
      kinds: [CONTENT_KEY_KIND],
      authors: [ownerPubkey],
      limit: 1
    }, [relay], {
      timeout: 5e3,
      timeoutAfterFirstEose: null
    });
    if (!response.success) throw response.errors[0]?.reason || new Error("CONTENT_KEY_RELAY_READ_FAILED");
    let latest = null;
    for (const event of response.result) {
      const parsed = parseContentKeyEvent(event);
      if (!parsed) continue;
      if (!latest || event.created_at > latest.event.created_at) latest = { event, parsed };
    }
    return { relay, latest, error: null };
  } catch (err) {
    return { relay, latest: null, error: err };
  }
}
async function refreshAccountContentKeyEvent({
  account,
  _fetchRelayListEvent,
  _relayPool,
  _nowSeconds
}) {
  const userSigner = getNsecSigner(account.pubkey);
  if (!userSigner) return { pubkey: account.pubkey, skipped: "locked" };
  const localLatest = latestKey(listContentKeys(account.pubkey));
  if (!localLatest) return { pubkey: account.pubkey, skipped: "no-local-content-key" };
  const relayList = await resolveContentKeyWriteRelays({
    account,
    userSigner,
    _fetchRelayListEvent,
    _relayPool,
    _nowSeconds
  });
  const writeRelays = unique(relayList.writeRelays);
  if (!writeRelays.length) return { pubkey: account.pubkey, skipped: "no-write-relays", relayList };
  const relayResults = await Promise.all(writeRelays.map(
    (relay) => fetchLatestContentKeyEventFromRelay({ ownerPubkey: account.pubkey, relay, _relayPool })
  ));
  const checkedResults = relayResults.filter((result2) => !result2.error);
  const found = checkedResults.map((result2) => result2.latest).filter(Boolean);
  if (!checkedResults.length) return { pubkey: account.pubkey, skipped: "relay-check-failed", relayList, relayResults };
  let canonicalPubkey = localLatest.pubkey;
  let canonicalCreatedAt = localLatest.createdAt || 0;
  if (found.length) {
    let newest = null;
    for (const result2 of found) {
      if (!newest || result2.event.created_at > newest.event.created_at) newest = result2;
    }
    canonicalPubkey = newest.parsed.iykcPubkey;
    canonicalCreatedAt = newest.event.created_at;
  }
  const relaysToPublish = found.length ? checkedResults.filter((result2) => {
    if (!result2.latest) return true;
    if (result2.latest.parsed.iykcPubkey === canonicalPubkey) return false;
    return result2.latest.event.created_at < canonicalCreatedAt;
  }).map((result2) => result2.relay) : checkedResults.map((result2) => result2.relay);
  if (!relaysToPublish.length) {
    return { pubkey: account.pubkey, canonicalPubkey, relayList, relayResults, publishedRelays: [] };
  }
  const event = await makeContentKeyEventForPubkey({
    userSigner,
    contentPubkey: canonicalPubkey,
    createdAt: _nowSeconds()
  });
  const result = await _relayPool.sendEvent(event, relaysToPublish);
  return {
    pubkey: account.pubkey,
    canonicalPubkey,
    relayList,
    relayResults,
    event,
    result,
    publishedRelays: relaysToPublish
  };
}
async function upsertContentKeyEvent({ userSigner, contentKeySigner, relays, _relayPool = relayPool, _resolveWriteRelays = resolveWriteRelays }) {
  if (!userSigner?.getPublicKey) throw new Error("USER_SIGNER_REQUIRED");
  const pubkey = await userSigner.getPublicKey();
  const writeRelays = relays?.length ? relays : await _resolveWriteRelays(pubkey);
  const event = await makeContentKeyEvent({ userSigner, contentKeySigner });
  const result = await _relayPool.sendEvent(event, writeRelays);
  return { event, result };
}
async function rotateContentKeyIfStillCanonical({
  ownerPubkey,
  removedKnownContentPubkey,
  _fetchRelayListEvent = fetchRelayListEvent,
  _relayPool = relayPool,
  _nowSeconds = nowSeconds
} = {}) {
  const account = get(ownerPubkey);
  if (!account || account.type !== "nsec") return { status: "cleared", reason: "missing-owner" };
  if (!removedKnownContentPubkey) return { status: "cleared", reason: "missing-removed-key" };
  const userSigner = getNsecSigner(ownerPubkey);
  if (!userSigner) return { status: "retry", reason: "locked" };
  const relayList = await resolveContentKeyWriteRelays({
    account,
    userSigner,
    _fetchRelayListEvent,
    _relayPool,
    _nowSeconds
  });
  const writeRelays = unique(relayList.writeRelays);
  if (!writeRelays.length) return { status: "retry", reason: "no-write-relays", relayList };
  const relayResults = await Promise.all(writeRelays.map(
    (relay) => fetchLatestContentKeyEventFromRelay({ ownerPubkey, relay, _relayPool })
  ));
  const checkedResults = relayResults.filter((result2) => !result2.error);
  if (!checkedResults.length) return { status: "retry", reason: "relay-check-failed", relayList, relayResults };
  let canonical = null;
  for (const result2 of checkedResults.map((result3) => result3.latest).filter(Boolean)) {
    if (!canonical || result2.event.created_at > canonical.event.created_at) canonical = result2;
  }
  if (!canonical) return { status: "retry", reason: "missing-canonical", relayList, relayResults };
  if (canonical.parsed.iykcPubkey !== removedKnownContentPubkey) {
    return {
      status: "cleared",
      reason: "already-rotated",
      canonicalPubkey: canonical.parsed.iykcPubkey,
      relayList,
      relayResults
    };
  }
  let contentKeySigner = getLatestContentKeySigner(ownerPubkey);
  if (!contentKeySigner) return { status: "retry", reason: "missing-local-content-key", relayList, relayResults };
  let contentPubkey = await contentKeySigner.getPublicKey();
  let rotated = false;
  if (contentPubkey === removedKnownContentPubkey) {
    const seckey = bytesToHex(generateSecretKey());
    contentKeySigner = await replaceContentKeySecret(ownerPubkey, seckey, _nowSeconds());
    contentPubkey = await contentKeySigner.getPublicKey();
    rotated = true;
  }
  const event = await makeContentKeyEvent({
    userSigner,
    contentKeySigner,
    createdAt: _nowSeconds()
  });
  const result = await _relayPool.sendEvent(event, writeRelays);
  return {
    status: result?.success ? "rotated" : "retry",
    reason: result?.success ? "" : "publish-failed",
    rotated,
    contentPubkey,
    event,
    result,
    relayList,
    relayResults
  };
}
async function doubleSignEvent({ userSigner, contentKeySigner, event }) {
  if (!userSigner?.signEvent) throw new Error("USER_SIGNER_REQUIRED");
  if (!contentKeySigner?.getPublicKey || !contentKeySigner?.signEvent) throw new Error("CONTENT_KEY_SIGNER_REQUIRED");
  if (!event || typeof event !== "object") throw new Error("EVENT_REQUIRED");
  const imkcPubkey = await contentKeySigner.getPublicKey();
  const unsigned = copyUnsignedEvent(event);
  const proofless = withImkcTag(unsigned, ["imkc", imkcPubkey]);
  const proofEvent = await contentKeySigner.signEvent(copyUnsignedEvent(proofless));
  const proofed = withImkcTag(unsigned, ["imkc", imkcPubkey, proofEvent.sig]);
  return userSigner.signEvent(copyUnsignedEvent(proofed));
}
async function refreshStoredContentKeyEvents({
  _fetchRelayListEvent = fetchRelayListEvent,
  _relayPool = relayPool,
  _isOnline = isOnline,
  _nowSeconds = nowSeconds
} = {}) {
  if (!isUnlocked()) return { skipped: "locked", accounts: [] };
  const accounts = contentKeyAccounts();
  if (!accounts.length) return { checked: 0, accounts: [] };
  if (!await _isOnline()) return { skipped: "offline", accounts: accounts.map((account) => account.pubkey) };
  const results = [];
  for (const account of accounts) {
    try {
      results.push(await refreshAccountContentKeyEvent({
        account,
        _fetchRelayListEvent,
        _relayPool,
        _nowSeconds
      }));
    } catch (err) {
      console.warn("content key event refresh failed", account.pubkey, err?.message ?? err);
      results.push({ pubkey: account.pubkey, error: err });
    }
  }
  return {
    checked: accounts.length,
    published: results.reduce((count, result) => count + (result.publishedRelays?.length || 0), 0),
    accounts: results
  };
}
async function refreshStoredContentKeyEventsIfDue({
  intervalMs = CONTENT_KEY_EVENT_REFRESH_INTERVAL_MS,
  _nowMs = () => Date.now(),
  ...options
} = {}) {
  if (!isUnlocked()) return { skipped: "locked" };
  const now = _nowMs();
  const last = readLastContentKeyEventRefresh();
  if (last && now - last < intervalMs) return { skipped: "fresh", nextInMs: intervalMs - (now - last) };
  const result = await refreshStoredContentKeyEvents(options);
  if (result.skipped !== "offline" && result.skipped !== "locked") await writeLastContentKeyEventRefresh(now);
  return result;
}
function startContentKeyEventRefresh({
  intervalMs = CONTENT_KEY_EVENT_REFRESH_INTERVAL_MS,
  _setTimeout = setTimeout,
  _clearTimeout = clearTimeout,
  _onOnline = onOnline,
  ...options
} = {}) {
  stopContentKeyEventRefresh?.();
  let stopped = false;
  let timer = null;
  let running = null;
  let retryAfterMs = 0;
  const clearTimer = () => {
    if (timer) _clearTimeout(timer);
    timer = null;
  };
  const delayUntilDue = () => {
    if (retryAfterMs) return Math.max(0, retryAfterMs - Date.now());
    const last = readLastContentKeyEventRefresh();
    if (!last) return 0;
    return Math.max(0, intervalMs - (Date.now() - last));
  };
  const schedule = () => {
    if (stopped) return;
    clearTimer();
    if (!isUnlocked()) return;
    timer = maybeUnref(_setTimeout(tick, delayUntilDue()));
  };
  const tick = () => {
    if (stopped) return Promise.resolve();
    if (!isUnlocked()) return Promise.resolve();
    if (!running) {
      running = refreshStoredContentKeyEventsIfDue({ intervalMs, ...options }).catch((err) => {
        console.warn("content key event refresh failed", err?.message ?? err);
        return { skipped: "error" };
      }).then((result) => {
        retryAfterMs = result?.skipped === "offline" || result?.skipped === "error" ? Date.now() + Math.min(intervalMs, 6e4) : 0;
        return result;
      }).finally(() => {
        running = null;
        schedule();
      });
    }
    return running;
  };
  const unsubSecrets = subscribe(() => {
    if (isUnlocked()) tick();
  });
  const unsubOnline = typeof window === "undefined" ? () => {
  } : _onOnline(() => tick());
  stopContentKeyEventRefresh = () => {
    stopped = true;
    clearTimer();
    unsubSecrets();
    unsubOnline();
    stopContentKeyEventRefresh = null;
  };
  tick();
  return stopContentKeyEventRefresh;
}

// src/services/nip44-double-dh.js
function warning(warnings, code, message = "") {
  warnings.push(message ? { code, message } : { code });
}
function publishSucceeded(result) {
  return result?.success !== false;
}
async function lookupContentPubkey(pubkey, warnings, { _getIykcProofs = getIykcProofs, _isOnline = isOnline } = {}) {
  try {
    const found = await _getIykcProofs([pubkey]);
    return { pubkey: found?.[pubkey]?.iykcPubkey || "", failed: false };
  } catch (err) {
    const online = await _isOnline().catch(() => false);
    warning(warnings, online ? "CONTENT_KEY_LOOKUP_FAILED" : "OFFLINE_CONTENT_KEY_LOOKUP_SKIPPED", err?.message || "");
    return { pubkey: "", failed: true };
  }
}
async function publishLocalContentKey({ userSigner, contentKeySigner, warnings, _upsertContentKeyEvent = upsertContentKeyEvent }) {
  try {
    const { result } = await _upsertContentKeyEvent({ userSigner, contentKeySigner });
    if (publishSucceeded(result)) return true;
    warning(warnings, "CONTENT_KEY_PUBLISH_FAILED");
  } catch (err) {
    warning(warnings, "CONTENT_KEY_PUBLISH_FAILED", err?.message || "");
  }
  return false;
}
async function createPersistedContentSigner({ ownerPubkey, warnings }) {
  try {
    return await setContentKeySecret(ownerPubkey, bytesToHex(generateSecretKey()));
  } catch (err) {
    warning(warnings, "CONTENT_KEY_PERSIST_FAILED", err?.message || "");
    return null;
  }
}
async function publishedOwnContentSigner({ account, userSigner, warnings = [], internals = {} }) {
  if (account.type !== "nsec") {
    warning(warnings, "OWN_CONTENT_KEY_UNSUPPORTED");
    return null;
  }
  const ownerPubkey = account.pubkey;
  const advertised = await lookupContentPubkey(ownerPubkey, warnings, internals);
  if (advertised.failed) return null;
  const advertisedPubkey = advertised.pubkey;
  if (advertisedPubkey) {
    const advertisedSigner = getContentKeySigner(ownerPubkey, advertisedPubkey);
    if (advertisedSigner) return advertisedSigner;
  }
  const localSigner = getLatestContentKeySigner(ownerPubkey) || await createPersistedContentSigner({ ownerPubkey, warnings, ...internals });
  if (!localSigner) return null;
  return await publishLocalContentKey({ userSigner, contentKeySigner: localSigner, warnings, ...internals }) ? localSigner : null;
}
function encryptParams(params) {
  const [peerPubkey, kind, scope = "", plaintextB64, peerContentPubkey = ""] = params || [];
  return { peerPubkey, kind, scope, plaintextB64, peerContentPubkey };
}
function decryptParams(params) {
  const [peerPubkey, kind, scope = "", ciphertext, peerContentPubkey = "", ownContentPubkey = ""] = params || [];
  return { peerPubkey, kind, scope, ciphertext, peerContentPubkey, ownContentPubkey };
}
async function encrypt({ account, signer, params, internals }) {
  const { peerPubkey, kind, scope, plaintextB64, peerContentPubkey } = encryptParams(params);
  if (!peerPubkey) throw new Error("PEER_PUBKEY_REQUIRED");
  if (typeof plaintextB64 !== "string") throw new Error("PLAINTEXT_REQUIRED");
  const normalizedKind = normalizeKind(kind);
  const warnings = [];
  await publishedOwnContentSigner({ account, userSigner: signer, warnings, internals });
  const [ciphertext, senderContentPubkey = ""] = await signer.nip44EncryptDoubleDH(
    peerPubkey,
    normalizedKind,
    scope,
    plaintextB64,
    peerContentPubkey
  );
  return [ciphertext, senderContentPubkey];
}
async function decrypt({ account, signer, params }) {
  const { peerPubkey, kind, scope, ciphertext, peerContentPubkey, ownContentPubkey } = decryptParams(params);
  if (!peerPubkey) throw new Error("PEER_PUBKEY_REQUIRED");
  if (typeof ciphertext !== "string") throw new Error("CIPHERTEXT_REQUIRED");
  const normalizedKind = normalizeKind(kind);
  if (ownContentPubkey && !getContentKeySigner(account.pubkey, ownContentPubkey)) throw new Error("CONTENT_KEY_NOT_FOUND");
  return signer.nip44DecryptDoubleDH(
    peerPubkey,
    normalizedKind,
    scope,
    ciphertext,
    peerContentPubkey,
    ownContentPubkey
  );
}
async function nip44EncryptDoubleDH({ account, signer, params = [], internals = {} }) {
  if (account.type !== "nsec") return signer.nip44EncryptDoubleDH(...params);
  return encrypt({ account, signer, params, internals });
}
async function nip44DecryptDoubleDH({ account, signer, params = [] }) {
  if (account.type !== "nsec") return signer.nip44DecryptDoubleDH(...params);
  return decrypt({ account, signer, params });
}

// src/services/signer.js
var SUPPORTED_METHODS = /* @__PURE__ */ new Set([
  "getPublicKey",
  "signEvent",
  "getRelays",
  "nip04Encrypt",
  "nip04Decrypt",
  "nip44Encrypt",
  "nip44Decrypt",
  "nip44v3Encrypt",
  "nip44v3Decrypt",
  "obfuscate",
  "nip44EncryptDoubleDH",
  "nip44DecryptDoubleDH",
  "doubleSignEvent"
]);
var METHOD_ALIASES = {
  nip44v3_encrypt_double_dh: "nip44EncryptDoubleDH",
  nip44v3_decrypt_double_dh: "nip44DecryptDoubleDH",
  double_sign_event: "doubleSignEvent"
};
function normalizeMethod(method) {
  if (METHOD_ALIASES[method]) return METHOD_ALIASES[method];
  const normalized = method.includes("_") ? method.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()) : method;
  return METHOD_ALIASES[normalized] || normalized;
}
function claimSigner(account) {
  if (!account) throw new Error("UNKNOWN_ACCOUNT");
  switch (account.type) {
    case "nsec": {
      const signer = getNsecSigner(account.pubkey);
      if (!signer) throw new Error("VAULT_LOCKED");
      return signer;
    }
    case "bunker": {
      const handle = getBunkerHandle(account.pubkey);
      if (!handle) throw new Error("VAULT_LOCKED");
      return handle;
    }
    case "npub":
      throw new Error("READ_ONLY_ACCOUNT");
    default:
      throw new Error("UNKNOWN_ACCOUNT_TYPE");
  }
}
async function contentSignerForDoubleSign(account, userSigner, internals = {}) {
  if (account.type !== "nsec") throw new Error("OWN_CONTENT_KEY_UNSUPPORTED");
  const warnings = [];
  const signer = await publishedOwnContentSigner({
    account,
    userSigner,
    warnings,
    internals
  });
  if (signer) return signer;
  const code = warnings[warnings.length - 1]?.code || "CONTENT_KEY_UNAVAILABLE";
  const err = new Error(code);
  err.warnings = warnings;
  throw err;
}
async function applyWithSharedKey({ account, signer, withSharedKey }) {
  if (withSharedKey == null) return { account, signer };
  if (!Array.isArray(withSharedKey)) throw new Error("WITH_SHARED_KEY_PARAMS_REQUIRED");
  if (!withSharedKey.length) return { account, signer };
  if (!signer?.withSharedKey) throw new Error("WITH_SHARED_KEY_UNSUPPORTED");
  const scopedSigner = signer.withSharedKey(...withSharedKey);
  if (account.type !== "nsec") return { account, signer: scopedSigner };
  return {
    account: { ...account, pubkey: await scopedSigner.getPublicKey() },
    signer: scopedSigner
  };
}
async function run({ pubkey, method, params = [], internals = {}, withSharedKey = null }) {
  const storedAccount = get(pubkey);
  if (!storedAccount) throw new Error("UNKNOWN_ACCOUNT");
  const normalized = normalizeMethod(method);
  if (!SUPPORTED_METHODS.has(normalized)) throw new Error("UNSUPPORTED_METHOD");
  const scoped = await applyWithSharedKey({
    account: storedAccount,
    signer: claimSigner(storedAccount),
    withSharedKey
  });
  const { account, signer } = scoped;
  if (normalized === "nip44EncryptDoubleDH") {
    return nip44EncryptDoubleDH({ account, signer, params, internals });
  }
  if (normalized === "nip44DecryptDoubleDH") {
    return nip44DecryptDoubleDH({ account, signer, params });
  }
  if (normalized === "doubleSignEvent") {
    const [event] = params || [];
    if (account.type === "bunker") return signer.doubleSignEvent(event);
    return doubleSignEvent({
      userSigner: signer,
      contentKeySigner: await contentSignerForDoubleSign(account, signer, internals),
      event
    });
  }
  return signer[normalized](...params);
}

export {
  isOnline,
  onOnline,
  upsertContentKeyEvent,
  rotateContentKeyIfStillCanonical,
  startContentKeyEventRefresh,
  claimSigner,
  run
};
