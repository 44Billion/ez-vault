import {
  claimSigner,
  isOnline,
  onOnline,
  rotateContentKeyIfStillCanonical,
  upsertContentKeyEvent
} from "./chunk-47TWQHYT.js";
import {
  filterVisibleAccounts,
  hasPendingMutation,
  subscribePendingMutations
} from "./chunk-FQWZBX36.js";
import {
  trusted_signers_exports
} from "./chunk-ZOPYVJB4.js";
import {
  NOSTRDB_SYNC,
  PrivateMessenger,
  REVOCATION_ROTATIONS,
  accounts_store_exports,
  bytesToHex,
  createEventReplyPacker,
  fetchRelayListEvent,
  freeRelays,
  generateSecretKey,
  get,
  getDeviceSigner,
  getLatestContentKeySigner,
  getNsecSigner,
  getPublicKey,
  getState,
  hexToBytes,
  isUnlocked,
  list,
  listContentKeys,
  parseRelayListEvent,
  readRecords,
  relayPool,
  replaceRecords,
  replyWithContentKeySecrets,
  secrets_exports,
  seedRelays,
  setContentKeySecret,
  setState,
  subscribe2 as subscribe,
  subscribeRelayListUpdates
} from "./chunk-GUYFWDAK.js";
import {
  __export
} from "./chunk-NZLE2WMY.js";

// src/services/device-relays.js
var device_relays_exports = {};
__export(device_relays_exports, {
  DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS: () => DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS,
  canConnectRelay: () => canConnectRelay,
  refreshDeviceRelayList: () => refreshDeviceRelayList,
  refreshDeviceRelayListIfDue: () => refreshDeviceRelayListIfDue,
  relaysFromEventOrFallback: () => relaysFromEventOrFallback,
  resolveDeviceRelays: () => resolveDeviceRelays,
  startDeviceRelayListRefresh: () => startDeviceRelayListRefresh
});
var DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1e3;
var LAST_REFRESH_KEY = "ez-vault:device-relays:last-refresh";
var RELAY_CONNECT_TIMEOUT_MS = 5e3;
var RELAY_COUNT = 2;
var stopDeviceRelayListRefresh = null;
function nowSeconds() {
  return Math.floor(Date.now() / 1e3);
}
function maybeUnref(timer) {
  timer?.unref?.();
  return timer;
}
function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}
function fallbackRelays() {
  return freeRelays.slice(0, RELAY_COUNT);
}
function relayListTemplate({ relays, createdAt = nowSeconds() }) {
  return {
    kind: 10002,
    created_at: createdAt,
    tags: unique(relays).slice(0, RELAY_COUNT).map((relay) => ["r", relay]),
    content: ""
  };
}
function readLastRefresh() {
  const value = Math.floor(Number(getState(LAST_REFRESH_KEY, 0)) || 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}
function writeLastRefresh(value = Date.now()) {
  return setState(LAST_REFRESH_KEY, Math.max(0, Math.floor(Number(value) || 0)));
}
function relaysFromEventOrFallback(event) {
  const parsed = parseRelayListEvent(event);
  const relays = unique([...parsed.read, ...parsed.write]).slice(0, RELAY_COUNT);
  return relays.length ? relays : fallbackRelays();
}
async function canConnectRelay(relay, { _relayPool = relayPool } = {}) {
  try {
    const result = await _relayPool.getEvents({ limit: 0 }, [relay], {
      timeout: RELAY_CONNECT_TIMEOUT_MS,
      timeoutAfterFirstEose: null
    });
    return result.success;
  } catch {
    return false;
  }
}
async function firstConnectableReplacement(current, { _canConnectRelay = canConnectRelay } = {}) {
  const currentSet = new Set(current);
  for (const relay of freeRelays) {
    if (currentSet.has(relay)) continue;
    if (await _canConnectRelay(relay)) return relay;
  }
  return "";
}
async function resolveDeviceRelays(pubkey, { _fetchRelayListEvent = fetchRelayListEvent } = {}) {
  try {
    return relaysFromEventOrFallback(await _fetchRelayListEvent(pubkey));
  } catch (err) {
    console.warn("device relay lookup failed", err?.message ?? err);
    return fallbackRelays();
  }
}
async function refreshDeviceRelayList({
  _fetchRelayListEvent = fetchRelayListEvent,
  _relayPool = relayPool,
  _canConnectRelay = canConnectRelay,
  _isOnline = isOnline,
  _nowSeconds = nowSeconds
} = {}) {
  if (!isUnlocked()) return { skipped: "locked" };
  if (!await _isOnline()) return { skipped: "offline" };
  const deviceSigner = await getDeviceSigner();
  const devicePubkey = await deviceSigner.getPublicKey();
  const relayListEvent = await _fetchRelayListEvent(devicePubkey);
  const currentRelays = relaysFromEventOrFallback(relayListEvent);
  const nextRelays = [...currentRelays];
  let reason = relayListEvent ? "" : "missing";
  if (relayListEvent) {
    for (let i = 0; i < nextRelays.length; i++) {
      if (await _canConnectRelay(nextRelays[i])) continue;
      const replacement = await firstConnectableReplacement(nextRelays, { _canConnectRelay });
      if (replacement) {
        nextRelays[i] = replacement;
        reason = "replace-offline";
      } else {
        reason = "offline-no-replacement";
      }
      break;
    }
  }
  if (!reason || reason === "offline-no-replacement") {
    return { pubkey: devicePubkey, relays: currentRelays, published: false, reason };
  }
  const event = await deviceSigner.signEvent(relayListTemplate({
    relays: nextRelays,
    createdAt: _nowSeconds()
  }));
  const result = await _relayPool.sendEvent(event, seedRelays);
  return {
    pubkey: devicePubkey,
    relays: nextRelays,
    event,
    result,
    published: true,
    reason
  };
}
async function refreshDeviceRelayListIfDue({
  intervalMs = DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS,
  _nowMs = () => Date.now(),
  ...options
} = {}) {
  if (!isUnlocked()) return { skipped: "locked" };
  const now = _nowMs();
  const last = readLastRefresh();
  if (last && now - last < intervalMs) return { skipped: "fresh", nextInMs: intervalMs - (now - last) };
  const result = await refreshDeviceRelayList(options);
  if (result.skipped !== "offline" && result.skipped !== "locked" && result.reason !== "offline-no-replacement") await writeLastRefresh(now);
  return result;
}
function startDeviceRelayListRefresh({
  intervalMs = DEVICE_RELAY_LIST_REFRESH_INTERVAL_MS,
  _setTimeout = setTimeout,
  _clearTimeout = clearTimeout,
  _onOnline = onOnline,
  ...options
} = {}) {
  stopDeviceRelayListRefresh?.();
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
    const last = readLastRefresh();
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
    if (stopped || !isUnlocked()) return Promise.resolve();
    if (!running) {
      running = refreshDeviceRelayListIfDue({ intervalMs, ...options }).catch((err) => {
        console.warn("device relay refresh failed", err?.message ?? err);
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
  stopDeviceRelayListRefresh = () => {
    stopped = true;
    clearTimer();
    unsubSecrets();
    unsubOnline();
    stopDeviceRelayListRefresh = null;
  };
  tick();
  return stopDeviceRelayListRefresh;
}

// src/services/sync/revocation-rotation.js
var revocation_rotation_exports = {};
__export(revocation_rotation_exports, {
  FALLBACK_ROTATION_DELAY_MS: () => FALLBACK_ROTATION_DELAY_MS,
  MAX_ROTATION_RETRY_MS: () => MAX_ROTATION_RETRY_MS,
  nextRevocationRotationDelay: () => nextRevocationRotationDelay,
  runDueRevocationRotations: () => runDueRevocationRotations,
  scheduleRevocationRotationsForRemovedSigner: () => scheduleRevocationRotationsForRemovedSigner,
  startRevocationRotation: () => startRevocationRotation
});
var KEY = "ez-vault:trusted-signer-sync:content-key-rotation:v1";
var HEX32 = /^[0-9a-f]{64}$/i;
var FALLBACK_ROTATION_DELAY_MS = 30 * 60 * 1e3;
var MAX_ROTATION_RETRY_MS = 4 * 60 * 60 * 1e3;
var MIN_ROTATION_RETRY_MS = 5 * 60 * 1e3;
var stopRevocationRotation = null;
function normalizePubkey(value) {
  const pubkey = typeof value === "string" ? value.trim().toLowerCase() : "";
  return HEX32.test(pubkey) ? pubkey : "";
}
function normalizeNumber(value) {
  const number = Math.floor(Number(value) || 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
function intentKey(intent) {
  return `${intent.ownerPubkey}:${intent.removedSignerPubkey}:${intent.removalUpdatedAt}`;
}
async function readIntents(storage) {
  if (!storage) {
    const records = await readRecords(REVOCATION_ROTATIONS);
    return records.map((record) => normalizeIntent(record.value)).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const byKey = /* @__PURE__ */ new Map();
    for (const item of parsed) {
      const intent = normalizeIntent(item);
      if (intent) byKey.set(intentKey(intent), intent);
    }
    return [...byKey.values()];
  } catch {
    return [];
  }
}
async function writeIntents(intents, storage) {
  const normalized = intents.map(normalizeIntent).filter(Boolean);
  if (!storage) {
    await replaceRecords(REVOCATION_ROTATIONS, normalized.map((intent) => ({
      key: intentKey(intent),
      value: intent
    })));
    return;
  }
  if (!normalized.length) {
    storage?.removeItem(KEY);
    return;
  }
  storage?.setItem(KEY, JSON.stringify(normalized));
}
function normalizeIntent(item) {
  const ownerPubkey = normalizePubkey(item?.ownerPubkey);
  const removedSignerPubkey = normalizePubkey(item?.removedSignerPubkey);
  const removedKnownContentPubkey = normalizePubkey(item?.removedKnownContentPubkey);
  if (!ownerPubkey || !removedSignerPubkey || !removedKnownContentPubkey) return null;
  return {
    ownerPubkey,
    removedSignerPubkey,
    removedKnownContentPubkey,
    removalUpdatedAt: normalizeNumber(item.removalUpdatedAt),
    actorPubkey: normalizePubkey(item.actorPubkey),
    nextAttemptAt: normalizeNumber(item.nextAttemptAt),
    attempts: normalizeNumber(item.attempts)
  };
}
function writableOwnerPubkeys(_store = accounts_store_exports) {
  return filterVisibleAccounts(_store.list()).filter((account) => account.type === "nsec").map((account) => account.pubkey);
}
function retryDelay(attempts) {
  return Math.min(MAX_ROTATION_RETRY_MS, MIN_ROTATION_RETRY_MS * 2 ** Math.max(0, attempts));
}
async function scheduleRevocationRotationsForRemovedSigner({
  removedSignerPubkey,
  removalUpdatedAt,
  actorPubkey = "",
  localActorPubkey = "",
  storage,
  nowMs: nowMs2 = Date.now()
} = {}) {
  const removed = normalizePubkey(removedSignerPubkey);
  if (!removed || !isUnlocked()) return [];
  const actor = normalizePubkey(actorPubkey);
  const localActor = normalizePubkey(localActorPubkey);
  const delayMs = actor && localActor && actor === localActor ? 0 : FALLBACK_ROTATION_DELAY_MS;
  const nextAttemptAt = nowMs2 + delayMs;
  const current = await readIntents(storage);
  const byKey = new Map(current.map((intent) => [intentKey(intent), intent]));
  const created = [];
  for (const ownerPubkey of writableOwnerPubkeys()) {
    const signer = getLatestContentKeySigner(ownerPubkey);
    const removedKnownContentPubkey = await signer?.getPublicKey?.();
    if (!normalizePubkey(removedKnownContentPubkey)) continue;
    const intent = {
      ownerPubkey,
      removedSignerPubkey: removed,
      removedKnownContentPubkey,
      removalUpdatedAt: normalizeNumber(removalUpdatedAt),
      actorPubkey: actor,
      nextAttemptAt,
      attempts: 0
    };
    const key = intentKey(intent);
    const existing = byKey.get(key);
    if (existing && existing.nextAttemptAt <= nextAttemptAt) continue;
    byKey.set(key, existing ? { ...existing, nextAttemptAt: Math.min(existing.nextAttemptAt, nextAttemptAt) } : intent);
    created.push(intent);
  }
  await writeIntents([...byKey.values()], storage);
  return created;
}
async function runDueRevocationRotations({
  storage,
  nowMs: nowMs2 = Date.now(),
  _rotateContentKeyIfStillCanonical = rotateContentKeyIfStillCanonical,
  onError = (err) => console.warn("revocation rotation failed", err?.message ?? err)
} = {}) {
  if (!isUnlocked()) return { skipped: "locked" };
  const intents = await readIntents(storage);
  if (!intents.length) return { checked: 0, remaining: 0 };
  const remaining = [];
  let checked = 0;
  let cleared = 0;
  let rotated = 0;
  for (const intent of intents) {
    if ((intent.nextAttemptAt || 0) > nowMs2) {
      remaining.push(intent);
      continue;
    }
    checked += 1;
    try {
      const result = await _rotateContentKeyIfStillCanonical(intent);
      if (result?.status === "rotated") {
        rotated += 1;
        continue;
      }
      if (result?.status === "cleared") {
        cleared += 1;
        continue;
      }
      const attempts = (intent.attempts || 0) + 1;
      remaining.push({
        ...intent,
        attempts,
        nextAttemptAt: nowMs2 + retryDelay(attempts)
      });
    } catch (err) {
      onError(err);
      const attempts = (intent.attempts || 0) + 1;
      remaining.push({
        ...intent,
        attempts,
        nextAttemptAt: nowMs2 + retryDelay(attempts)
      });
    }
  }
  await writeIntents(remaining, storage);
  return { checked, cleared, rotated, remaining: remaining.length };
}
async function nextRevocationRotationDelay(storage, nowMs2 = Date.now()) {
  const due = (await readIntents(storage)).map((intent) => intent.nextAttemptAt || 0).filter(Boolean).sort((a, b) => a - b)[0];
  if (!due) return null;
  return Math.max(0, due - nowMs2);
}
async function startRevocationRotation({
  storage,
  _setTimeout = setTimeout,
  _clearTimeout = clearTimeout,
  ...options
} = {}) {
  stopRevocationRotation?.();
  let stopped = false;
  let timer = null;
  let running = null;
  const clearTimer = () => {
    if (timer) _clearTimeout(timer);
    timer = null;
  };
  const schedule = async () => {
    if (stopped) return;
    clearTimer();
    if (!isUnlocked()) return;
    const delay = await nextRevocationRotationDelay(storage);
    if (delay == null) return;
    timer = _setTimeout(tick, delay);
    timer?.unref?.();
  };
  const tick = () => {
    if (stopped || !isUnlocked()) return Promise.resolve();
    if (!running) {
      running = runDueRevocationRotations({ storage, ...options }).finally(() => {
        running = null;
        schedule().catch((err) => console.warn("revocation rotation scheduling failed", err?.message ?? err));
      });
    }
    return running;
  };
  const unsubSecrets = subscribe(() => {
    if (isUnlocked()) tick();
  });
  stopRevocationRotation = () => {
    stopped = true;
    clearTimer();
    unsubSecrets();
    stopRevocationRotation = null;
  };
  await tick();
  return stopRevocationRotation;
}

// src/services/sync/content-keys.js
var content_keys_exports = {};
__export(content_keys_exports, {
  CONTENT_KEYS_ANNOUNCE_CODE: () => CONTENT_KEYS_ANNOUNCE_CODE,
  CONTENT_KEYS_ASK_CODE: () => CONTENT_KEYS_ASK_CODE,
  CONTENT_KEYS_REPLY_CODE: () => CONTENT_KEYS_REPLY_CODE,
  announceAllContentKeys: () => announceAllContentKeys,
  announceContentKeys: () => announceContentKeys,
  generateAndPublishContentKey: () => generateAndPublishContentKey,
  getDebugSnapshot: () => getDebugSnapshot,
  handleMessage: () => handleMessage,
  resetDebugSources: () => resetDebugSources,
  subscribeDebug: () => subscribeDebug
});
var CONTENT_KEYS_ANNOUNCE_CODE = "contentKeys_announce_t7y8";
var CONTENT_KEYS_ASK_CODE = "contentKeys_ask_t7y8";
var CONTENT_KEYS_REPLY_CODE = "contentKeys_reply_t7y8";
var HEX322 = /^[0-9a-f]{64}$/i;
var listeners = /* @__PURE__ */ new Set();
var debugSourceByKey = /* @__PURE__ */ new Map();
var publishStatusByOwner = /* @__PURE__ */ new Map();
function nowSeconds2() {
  return Math.floor(Date.now() / 1e3);
}
function sourceKey(ownerPubkey, contentPubkey) {
  return `${ownerPubkey}:${contentPubkey}`;
}
function notifyDebug() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.warn("content-key sync debug listener threw", err);
    }
  }
}
function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function normalizePubkey2(value) {
  const pubkey = typeof value === "string" ? value.toLowerCase() : "";
  return HEX322.test(pubkey) ? pubkey : "";
}
function normalizeCreatedAt(value) {
  const createdAt = Math.floor(Number(value) || 0);
  return Number.isSafeInteger(createdAt) && createdAt >= 0 ? createdAt : 0;
}
function normalizeMetaKey(entry) {
  const pubkey = normalizePubkey2(entry?.pubkey);
  if (!pubkey) return null;
  return { pubkey, createdAt: normalizeCreatedAt(entry.createdAt) };
}
function normalizeSecretKey(entry) {
  const pubkey = normalizePubkey2(entry?.pubkey);
  const seckey = normalizePubkey2(entry?.seckey);
  if (!pubkey || !seckey) return null;
  try {
    if (getPublicKey(hexToBytes(seckey)) !== pubkey) return null;
  } catch {
    return null;
  }
  return { pubkey, seckey, createdAt: normalizeCreatedAt(entry.createdAt) };
}
function normalizePubkeyList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizePubkey2).filter(Boolean))];
}
function contentKeysForOwner(ownerPubkey) {
  return listContentKeys(ownerPubkey).map(normalizeMetaKey).filter(Boolean);
}
function latestKey(keys) {
  let latest = null;
  for (const key of keys || []) {
    if (!latest || (key.createdAt || 0) >= (latest.createdAt || 0)) latest = key;
  }
  return latest;
}
function shortPubkey(pubkey) {
  return pubkey ? `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}` : "";
}
function trustedLabel(pubkey, trustedByPubkey) {
  const signer = trustedByPubkey?.get?.(pubkey);
  return signer?.platform || shortPubkey(pubkey);
}
function setDebugSource(ownerPubkey, contentPubkey, source) {
  debugSourceByKey.set(sourceKey(ownerPubkey, contentPubkey), source);
  notifyDebug();
}
function setPublishStatus(ownerPubkey, status) {
  if (status) publishStatusByOwner.set(ownerPubkey, status);
  else publishStatusByOwner.delete(ownerPubkey);
  notifyDebug();
}
function emitDebug(debug, action, detail = {}) {
  try {
    debug?.({ source: "content-keys", action, ...detail });
  } catch (err) {
    console.warn("content-key sync debug hook threw", err);
  }
}
function messageCode(message) {
  return isPlainObject(message?.payload) ? message.payload.code || "" : "";
}
function messageBody(message) {
  return isPlainObject(message?.payload?.payload) ? message.payload.payload : {};
}
function isTrustedSender(message, trustedByPubkey) {
  return trustedByPubkey?.has?.(message?.event?.pubkey) || false;
}
function localOwnerForChannel(channelPubkey, context = {}) {
  const ownerPubkey = normalizePubkey2(context.ownerPubkeyForChannel?.(channelPubkey) || channelPubkey);
  return get(ownerPubkey)?.type === "nsec" ? ownerPubkey : "";
}
function contentKeyDiff(ownerPubkey, announcedKeys) {
  const knownPubkeys = contentKeysForOwner(ownerPubkey).map((key) => key.pubkey);
  const held = new Set(knownPubkeys);
  const announcedPubkeys = [...new Set(announcedKeys.map((key) => key.pubkey).filter(Boolean))];
  return {
    knownPubkeys,
    announcedPubkeys,
    missingPubkeys: announcedPubkeys.filter((pubkey) => !held.has(pubkey))
  };
}
function subscribeDebug(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function resetDebugSources() {
  debugSourceByKey.clear();
  publishStatusByOwner.clear();
  notifyDebug();
}
function getDebugSnapshot() {
  const accounts = filterVisibleAccounts(list()).filter((account) => account.type === "nsec").map((account) => {
    const keys = isUnlocked() ? contentKeysForOwner(account.pubkey) : [];
    const latest = latestKey(keys);
    const source = latest ? debugSourceByKey.get(sourceKey(account.pubkey, latest.pubkey)) || "persisted local" : "";
    return {
      account,
      keys,
      latest,
      source,
      publishStatus: publishStatusByOwner.get(account.pubkey) || null
    };
  });
  return { unlocked: isUnlocked(), accounts };
}
async function announceContentKeys({ messenger, ownerPubkey, channelPubkey = ownerPubkey, receiverPubkeys, debug }) {
  const keys = contentKeysForOwner(ownerPubkey);
  const receivers = normalizePubkeyList(receiverPubkeys);
  if (!keys.length || !receivers.length) return null;
  emitDebug(debug, "announce", {
    type: "yell",
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    channelPubkey,
    ownerPubkey,
    receiverPubkeys: receivers,
    receiverCount: receivers.length,
    pubkeys: keys.map((key) => key.pubkey),
    count: keys.length
  });
  return messenger.yell({
    channelPubkey,
    receiverPubkeys: receivers,
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    payload: { keys }
  });
}
async function announceAllContentKeys({ messenger, receiverPubkeys, debug }) {
  const results = [];
  for (const account of filterVisibleAccounts(list())) {
    if (account.type !== "nsec") continue;
    const result = await announceContentKeys({ messenger, ownerPubkey: account.pubkey, receiverPubkeys, debug });
    if (result) results.push(result);
  }
  return results;
}
async function generateAndPublishContentKey({
  ownerPubkey,
  _upsertContentKeyEvent = upsertContentKeyEvent
}) {
  const account = get(ownerPubkey);
  if (account?.type !== "nsec") throw new Error("NSEC_ACCOUNT_REQUIRED");
  const userSigner = getNsecSigner(ownerPubkey);
  if (!userSigner) throw new Error("VAULT_LOCKED");
  const seckey = bytesToHex(generateSecretKey());
  const createdAt = nowSeconds2();
  const contentKeySigner = await setContentKeySecret(ownerPubkey, seckey, createdAt);
  const pubkey = await contentKeySigner.getPublicKey();
  setDebugSource(ownerPubkey, pubkey, "generated locally");
  setPublishStatus(ownerPubkey, { state: "publishing", message: "" });
  let result = null;
  let error = null;
  try {
    result = await _upsertContentKeyEvent({ userSigner, contentKeySigner });
    setPublishStatus(ownerPubkey, { state: "published", message: "" });
  } catch (err) {
    error = err;
    setPublishStatus(ownerPubkey, {
      state: "publish failed",
      message: err?.message || String(err)
    });
  }
  return { ownerPubkey, pubkey, createdAt, result, error };
}
async function handleAnnounce(message, context) {
  const ownerPubkey = localOwnerForChannel(message.channelPubkey, context);
  if (!ownerPubkey) return false;
  const channelPubkey = message.channelPubkey || ownerPubkey;
  const keys = (Array.isArray(messageBody(message).keys) ? messageBody(message).keys : []).map(normalizeMetaKey).filter(Boolean);
  const { knownPubkeys, announcedPubkeys, missingPubkeys: pubkeys } = contentKeyDiff(ownerPubkey, keys);
  if (!pubkeys.length) return true;
  emitDebug(context.debug, "request", {
    type: "ask",
    code: CONTENT_KEYS_ASK_CODE,
    channelPubkey,
    ownerPubkey,
    receiverPubkey: message.event.pubkey,
    announcedCount: announcedPubkeys.length,
    knownCount: knownPubkeys.length,
    pubkeys,
    count: pubkeys.length
  });
  await context.messenger.ask({
    channelPubkey,
    receiverPubkey: message.event.pubkey,
    code: CONTENT_KEYS_ASK_CODE,
    payload: { pubkeys }
  });
  return true;
}
async function handleRequest(message, context) {
  const ownerPubkey = localOwnerForChannel(message.channelPubkey, context);
  if (!ownerPubkey || !message.event?.id) return false;
  const channelPubkey = message.channelPubkey || ownerPubkey;
  const pubkeys = normalizePubkeyList(messageBody(message).pubkeys);
  if (!pubkeys.length) return true;
  await replyWithContentKeySecrets({
    ownerPubkey,
    pubkeys,
    send: (payload) => {
      const keys = Array.isArray(payload?.keys) ? payload.keys : [];
      emitDebug(context.debug, "reply", {
        type: "reply",
        code: CONTENT_KEYS_REPLY_CODE,
        channelPubkey,
        ownerPubkey,
        receiverPubkey: message.event.pubkey,
        pubkeys: keys.map((key) => key.pubkey).filter(Boolean),
        count: keys.length
      });
      return context.messenger.reply({
        channelPubkey,
        question: message.event,
        receiverPubkey: message.event.pubkey,
        code: CONTENT_KEYS_REPLY_CODE,
        payload
      });
    }
  });
  return true;
}
async function handleReply(message, context) {
  const ownerPubkey = localOwnerForChannel(message.channelPubkey, context);
  if (!ownerPubkey) return false;
  const channelPubkey = message.channelPubkey || ownerPubkey;
  const label = trustedLabel(message.event.pubkey, context.trustedByPubkey);
  const existingByPubkey = new Map(contentKeysForOwner(ownerPubkey).map((key) => [key.pubkey, key]));
  let changed = false;
  const importedPubkeys = [];
  for (const key of Array.isArray(messageBody(message).keys) ? messageBody(message).keys : []) {
    const normalized = normalizeSecretKey(key);
    if (!normalized) continue;
    const existing = existingByPubkey.get(normalized.pubkey);
    if (existing && (existing.createdAt || 0) >= normalized.createdAt) continue;
    const signer = await setContentKeySecret(ownerPubkey, normalized.seckey, normalized.createdAt);
    if (!signer) continue;
    existingByPubkey.set(normalized.pubkey, { pubkey: normalized.pubkey, createdAt: normalized.createdAt });
    debugSourceByKey.set(sourceKey(ownerPubkey, normalized.pubkey), `synced from ${label}`);
    importedPubkeys.push(normalized.pubkey);
    changed = true;
  }
  if (changed) {
    notifyDebug();
    emitDebug(context.debug, "import", {
      type: "reply",
      code: CONTENT_KEYS_REPLY_CODE,
      channelPubkey,
      ownerPubkey,
      senderPubkey: message.event.pubkey,
      pubkeys: importedPubkeys,
      count: importedPubkeys.length
    });
  }
  return true;
}
async function handleMessage(message, context) {
  const code = messageCode(message);
  if (code !== CONTENT_KEYS_ANNOUNCE_CODE && code !== CONTENT_KEYS_ASK_CODE && code !== CONTENT_KEYS_REPLY_CODE) return false;
  if (!localOwnerForChannel(message?.channelPubkey, context)) return false;
  if (!isTrustedSender(message, context.trustedByPubkey)) return false;
  if (code === CONTENT_KEYS_ANNOUNCE_CODE) return handleAnnounce(message, context);
  if (code === CONTENT_KEYS_ASK_CODE) return handleRequest(message, context);
  return handleReply(message, context);
}

// src/services/sync/trusted-signers.js
var trusted_signers_exports2 = {};
__export(trusted_signers_exports2, {
  TRUSTED_SIGNERS_STATE_CODE: () => TRUSTED_SIGNERS_STATE_CODE,
  TRUSTED_SIGNER_SYNC_INFO: () => TRUSTED_SIGNER_SYNC_INFO,
  announceTrustedSignerState: () => announceTrustedSignerState,
  handleMessage: () => handleMessage2,
  stateEntries: () => stateEntries
});
var TRUSTED_SIGNERS_STATE_CODE = "trustedSigners_state_v1";
var TRUSTED_SIGNER_SYNC_INFO = "trusted-signer-list-sync-v1";
var HEX323 = /^[0-9a-f]{64}$/i;
function isPlainObject2(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function normalizePubkey3(value) {
  const pubkey = typeof value === "string" ? value.trim().toLowerCase() : "";
  return HEX323.test(pubkey) ? pubkey : "";
}
function normalizeTimestamp(value) {
  const timestamp = Math.floor(Number(value) || 0);
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : 0;
}
function messageBody2(message) {
  return isPlainObject2(message?.payload?.payload) ? message.payload.payload : {};
}
function messageCode2(message) {
  return isPlainObject2(message?.payload) ? message.payload.code || "" : "";
}
function normalizeEntry(entry) {
  const pubkey = normalizePubkey3(entry?.pubkey);
  if (!pubkey) return null;
  const status = entry.status === "removed" ? "removed" : entry.status === "trusted" ? "trusted" : "";
  if (!status) return null;
  const updatedAt = normalizeTimestamp(entry.updatedAt);
  if (!updatedAt) return null;
  return {
    pubkey,
    platform: typeof entry.platform === "string" ? entry.platform.trim() : "",
    status,
    updatedAt,
    actorPubkey: normalizePubkey3(entry.actorPubkey) || ""
  };
}
function stateEntries(records) {
  return (Array.isArray(records) ? records : []).map(normalizeEntry).filter(Boolean);
}
function entriesExceptPubkey(entries, pubkey) {
  const normalizedPubkey = normalizePubkey3(pubkey);
  return normalizedPubkey ? entries.filter((entry) => entry.pubkey !== normalizedPubkey) : entries;
}
function senderTrustUpdatedAt(context, senderPubkey) {
  return normalizeTimestamp(context.trustedByPubkey?.get?.(senderPubkey)?.updatedAt);
}
function assertPublished(result) {
  if (!result?.delivery) return result;
  const reports = result.delivery.reports;
  if (!Array.isArray(reports) || !reports.length || reports.some((report) => report?.success !== true)) {
    throw new Error("SYNC_PUBLICATION_FAILED");
  }
  return result;
}
async function announceTrustedSignerState({
  messenger,
  peerChannels,
  records,
  activePeerPubkeys,
  reminderRecords
} = {}) {
  if (!messenger) return { sent: 0 };
  const channels = peerChannels || /* @__PURE__ */ new Map();
  const active = [...new Set(activePeerPubkeys || [])].map(normalizePubkey3).filter(Boolean);
  const entries = stateEntries(records);
  let sent = 0;
  if (entries.length) {
    for (const peerPubkey of active) {
      const channelPubkey = channels.get(peerPubkey);
      if (!channelPubkey) continue;
      const payloadEntries = entriesExceptPubkey(entries, peerPubkey);
      if (!payloadEntries.length) continue;
      assertPublished(await messenger.tell({
        channelPubkey,
        receiverPubkey: peerPubkey,
        code: TRUSTED_SIGNERS_STATE_CODE,
        payload: { entries: payloadEntries }
      }));
      sent += 1;
    }
  }
  for (const record of stateEntries(reminderRecords)) {
    if (record.status !== "removed") continue;
    if (active.includes(record.pubkey)) continue;
    const channelPubkey = channels.get(record.pubkey);
    if (!channelPubkey) continue;
    assertPublished(await messenger.tell({
      channelPubkey,
      receiverPubkey: record.pubkey,
      code: TRUSTED_SIGNERS_STATE_CODE,
      payload: { entries: [record] }
    }));
    sent += 1;
  }
  return { sent };
}
async function handleMessage2(message, context = {}) {
  if (messageCode2(message) !== TRUSTED_SIGNERS_STATE_CODE) return false;
  const senderPubkey = normalizePubkey3(message?.event?.pubkey);
  if (!senderPubkey || !context.trustedByPubkey?.has?.(senderPubkey)) return true;
  const entries = stateEntries(messageBody2(message).entries);
  if (!entries.length) return true;
  const devicePubkey = normalizePubkey3(context.devicePubkey);
  const selfRemoval = entries.find((entry) => entry.status === "removed" && entry.pubkey === devicePubkey);
  if (selfRemoval) {
    if (selfRemoval.updatedAt < senderTrustUpdatedAt(context, senderPubkey)) return true;
    await context.trustedSigners?.clearActive?.({
      actorPubkey: devicePubkey,
      updatedAt: selfRemoval.updatedAt,
      tombstone: false
    });
    return true;
  }
  const mergeEntries = entriesExceptPubkey(entries, devicePubkey);
  if (mergeEntries.length) await context.trustedSigners?.mergeRecords?.(mergeEntries, { action: "sync" });
  return true;
}

// src/helpers/error.js
function serializeError(err, context = {}) {
  return {
    type: "error",
    name: err.name,
    message: err.message,
    stack: err.stack,
    context
  };
}
function reviveError(err) {
  if (err instanceof Error) return err;
  const error = new Error(err.message);
  error.name = err.name || "Error";
  error.stack = err.stack;
  Object.assign(error, err.context || {});
  return error;
}

// src/helpers/window-message.js
var resrejByReqId = {};
function getReqId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
function initReqPromise(reqId, code, timeoutMs = 5e3) {
  if (!reqId || !code) throw new Error("Missing request id or code");
  const { promise, resolve, reject } = Promise.withResolvers();
  resrejByReqId[reqId] = {
    resolve,
    reject
  };
  let timeout;
  if (timeoutMs != null) {
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        resrejByReqId[reqId]?.reject?.(`Timeout for ${code} reqId: ${reqId}`);
      }, timeoutMs);
    } else resrejByReqId[reqId]?.reject?.(`Timeout for ${code} reqId: ${reqId}`);
  }
  return promise.finally(() => {
    clearTimeout(timeout);
    delete resrejByReqId[reqId];
  });
}
function handleMessageReply(e) {
  const resrej = resrejByReqId[e.data.reqId];
  if (!resrej) {
    console.log(`Unhandled response for reqId ${e.data.reqId} (may have timed out)`, JSON.stringify(e.data));
    return;
  }
  if (e.data.error) resrej.reject(reviveError(e.data.error));
  else resrej.resolve({ payload: e.data.payload, isLast: e.data.isLast ?? true, ports: e.ports, origin: e.origin });
}
var initReplyListener = ((hasRunKey, hasRunByKey = /* @__PURE__ */ new WeakMap(), listenerRegistry = new FinalizationRegistry((controller2) => controller2.abort())) => (maybePort) => {
  const isPort = maybePort instanceof MessagePort;
  hasRunKey = isPort ? maybePort : globalThis;
  if (hasRunByKey.has(hasRunKey)) return;
  const controller2 = new AbortController();
  hasRunByKey.set(hasRunKey, controller2);
  hasRunKey.addEventListener("message", async (e) => {
    if (e.data.code === "REPLY") return handleMessageReply(e);
  }, { signal: controller2.signal });
  if (isPort) hasRunKey.start();
  listenerRegistry.register(hasRunKey, controller2);
})();
async function ask(to, message, options, transfer) {
  if (!message.code && !("payload" in message)) throw new Error("Missing args");
  if (!options || typeof options !== "object") options = { targetOrigin: options, transfer };
  initReplyListener(to);
  const reqId = getReqId();
  const promise = initReqPromise(reqId, message.code, options.timeout);
  to.postMessage({
    ...message,
    reqId
  }, options);
  return promise.then(({ payload, ports, origin }) => ({
    code: message.code,
    payload,
    ports,
    origin
  })).catch((error) => ({
    code: message.code,
    payload: null,
    error
  }));
}
function reply(originalMsgEvent, message, options, transfer) {
  if (!("payload" in message) && !("error" in message)) throw new Error("Missing args");
  if (!options || typeof options !== "object") options = { targetOrigin: options, transfer };
  options.targetOrigin ??= originalMsgEvent.origin;
  if (!options.to && !originalMsgEvent.source) throw new Error("Set port to options.to");
  options.to ??= originalMsgEvent.source;
  options.to.postMessage({
    ...message,
    reqId: originalMsgEvent.data.reqId,
    code: "REPLY"
  }, options);
}
function tell(to, message, options, transfer) {
  if (!message.code || !("payload" in message) && !("error" in message)) throw new Error("Missing args");
  if (!options || typeof options !== "object") options = { targetOrigin: options, transfer };
  to.postMessage(message, options);
}
async function* askStream(to, message, options, transfer) {
  if (!message.code && !("payload" in message)) throw new Error("Missing args");
  if (!options || typeof options !== "object") options = { targetOrigin: options, transfer };
  initReplyListener(to);
  const reqId = getReqId();
  const messageQueue = [];
  let resolvePromise;
  const waitForNextMessage = () => {
    return new Promise((resolve) => {
      resolvePromise = resolve;
    });
  };
  resrejByReqId[reqId] = {
    resolve: ({ payload: payload2, isLast: isLast2 = true }) => {
      messageQueue.push({ payload: payload2, isLast: isLast2 });
      if (resolvePromise) resolvePromise();
    },
    reject: (error2) => {
      messageQueue.push({ error: error2 });
      if (resolvePromise) resolvePromise();
    }
  };
  to.postMessage({
    ...message,
    reqId
  }, options);
  let payload, error;
  let isLast = false;
  try {
    while (!isLast) {
      if (messageQueue.length === 0) await waitForNextMessage();
      while (messageQueue.length > 0) {
        ({ payload, error, isLast } = messageQueue.shift());
        if (error) yield { code: message.code, payload: null, error };
        else yield { code: message.code, payload };
      }
    }
  } finally {
    delete resrejByReqId[reqId];
  }
}

// src/services/nostrdb.js
var NOSTRDB_ONE_SHOT_METHODS = [
  "add",
  "query",
  "count",
  "supports",
  "exportEventsByAppPage",
  "addEventsForApp"
];
var NOSTRDB_STREAM_DONE = "nostrdb:done";
var DEFAULT_TIMEOUT = 5 * 60 * 1e3;
var HEX324 = /^[0-9a-f]{64}$/i;
var launcherPort = null;
function defaultSubscriptionId() {
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}
function normalizeOwnerPubkey(ownerPubkey) {
  const pubkey = typeof ownerPubkey === "string" ? ownerPubkey.toLowerCase() : "";
  if (!HEX324.test(pubkey)) throw new Error("NOSTRDB_OWNER_REQUIRED");
  return pubkey;
}
function isWritableVaultAccount(ownerPubkey, accounts) {
  return (Array.isArray(accounts) ? accounts : []).some(
    (account) => normalizePubkey4(account?.pubkey) === ownerPubkey && account.type !== "npub"
  );
}
function normalizePubkey4(value) {
  const pubkey = typeof value === "string" ? value.toLowerCase() : "";
  return HEX324.test(pubkey) ? pubkey : "";
}
function isStreamDone(payload, subscriptionId) {
  return payload?.type === NOSTRDB_STREAM_DONE && payload.subscriptionId === subscriptionId;
}
function createNostrDbMethod(ownerPubkey, method, { getPort, ask: askFn, timeout }) {
  return async (...params) => {
    const port = getPort();
    if (!port) throw new Error("NOSTRDB_UNAVAILABLE");
    const { payload, error } = await askFn(
      port,
      { code: "NOSTRDB", payload: { ownerPubkey, method, params } },
      { timeout }
    );
    if (error) throw error;
    return payload;
  };
}
function createNostrDbSubscription(ownerPubkey, params, {
  getPort,
  askStream: askStreamFn,
  tell: tellFn,
  subscriptionId
}) {
  let port;
  let streamIterator;
  let started = false;
  async function start() {
    if (started) return;
    started = true;
    port = getPort();
    if (!port) throw new Error("NOSTRDB_UNAVAILABLE");
    streamIterator = askStreamFn(
      port,
      { code: "NOSTRDB", payload: { ownerPubkey, method: "subscribe", params, subscriptionId } },
      { timeout: null }
    )[Symbol.asyncIterator]();
  }
  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      await start();
      const next = await streamIterator.next();
      if (next.done) return { done: true };
      const { payload, error } = next.value;
      if (error) throw error;
      if (isStreamDone(payload, subscriptionId)) return { done: true };
      return { value: payload, done: false };
    },
    async return() {
      if (started && port) {
        tellFn(port, { code: "NOSTRDB_CANCEL", payload: { ownerPubkey, subscriptionId } });
        await streamIterator?.return?.();
      }
      return { done: true };
    }
  };
}
function createNostrDbService({
  getPort = () => launcherPort,
  listAccounts = list,
  ask: askFn = ask,
  askStream: askStreamFn = askStream,
  tell: tellFn = tell,
  makeSubscriptionId = defaultSubscriptionId,
  timeout = DEFAULT_TIMEOUT
} = {}) {
  return {
    forAccount(ownerPubkey) {
      const normalizedOwnerPubkey = normalizeOwnerPubkey(ownerPubkey);
      if (!isWritableVaultAccount(normalizedOwnerPubkey, listAccounts())) {
        throw new Error("NOSTRDB_OWNER_NOT_CONTROLLED");
      }
      const nostrdb = {};
      for (const method of NOSTRDB_ONE_SHOT_METHODS) {
        nostrdb[method] = createNostrDbMethod(normalizedOwnerPubkey, method, {
          getPort,
          ask: askFn,
          timeout
        });
      }
      nostrdb.subscribe = (...params) => createNostrDbSubscription(normalizedOwnerPubkey, params, {
        getPort,
        askStream: askStreamFn,
        tell: tellFn,
        subscriptionId: makeSubscriptionId()
      });
      return nostrdb;
    }
  };
}
var defaultService = createNostrDbService();
function connect(port) {
  launcherPort = port || null;
}
function disconnect(port = launcherPort) {
  if (!port || port === launcherPort) launcherPort = null;
}
function forAccount(ownerPubkey) {
  return defaultService.forAccount(ownerPubkey);
}

// src/services/sync/nostrdb.js
var NOSTRDB_SYNC_ADVERTISE_CODE = "nostrDbSync_advertise_kpkr";
var NOSTRDB_SYNC_ASK_CODE = "nostrDbSync_ask_kpkr";
var NOSTRDB_SYNC_REPLY_CODE = "nostrDbSync_reply_kpkr";
var NOSTRDB_SYNC_PUSH_CODE = "nostrDbSync_push_kpkr";
var NOSTRDB_SYNC_APP_ASK_CODE = "nostrDbSync_appAsk_7c93";
var NOSTRDB_SYNC_APP_REPLY_CODE = "nostrDbSync_appReply_7c93";
var STATE_KEY = "ez-vault:trusted-signer-sync:nostrdb:v1";
var HEX325 = /^[0-9a-f]{64}$/i;
var APP_ID_MAX_LENGTH = 512;
var DEFAULT_WINDOW_MS = 15 * 60 * 1e3;
var MIN_WINDOW_MS = 60 * 1e3;
var MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1e3;
var ADVERT_EDGE_EXTENSION_MS = 4 * 60 * 60 * 1e3;
var INVENTORY_LIMIT = 200;
var REQUEST_LIMIT = 200;
var SMALL_REPLY_COUNT = 20;
var NO_REPLY_RETRY_MS = 2 * 24 * 60 * 60 * 1e3;
var ONLINE_RETRY_MIN_MS = 5 * 60 * 1e3;
var ONLINE_RETRY_MAX_MS = 6 * 60 * 60 * 1e3;
var STATE_PRUNE_MS = 30 * 24 * 60 * 60 * 1e3;
var PUSH_THROTTLE_MS = 1500;
var PUSH_EVENTS_PER_CHUNK = 100;
var RECENT_SYNC_EVENT_TTL_MS = 2 * 60 * 1e3;
var SYNC_CODES = /* @__PURE__ */ new Set([
  NOSTRDB_SYNC_ADVERTISE_CODE,
  NOSTRDB_SYNC_ASK_CODE,
  NOSTRDB_SYNC_REPLY_CODE,
  NOSTRDB_SYNC_PUSH_CODE,
  NOSTRDB_SYNC_APP_ASK_CODE,
  NOSTRDB_SYNC_APP_REPLY_CODE
]);
function nowMs() {
  return Date.now();
}
function isPlainObject3(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function normalizePubkey5(value) {
  const pubkey = typeof value === "string" ? value.toLowerCase() : "";
  return HEX325.test(pubkey) ? pubkey : "";
}
function normalizeAppId(value) {
  const appId = typeof value === "string" ? value : "";
  return appId && appId.length <= APP_ID_MAX_LENGTH ? appId : "";
}
function appStateKey(appId) {
  return JSON.stringify(appId);
}
function appIdFromStateKey(key) {
  try {
    return normalizeAppId(JSON.parse(key));
  } catch {
    return "";
  }
}
function normalizeOptionalEventId(value) {
  if (value == null || value === "") return "";
  return normalizePubkey5(value);
}
function messageCode3(message) {
  return isPlainObject3(message?.payload) ? message.payload.code || "" : "";
}
function messageBody3(message) {
  return isPlainObject3(message?.payload?.payload) ? message.payload.payload : {};
}
function messageTimeMs(message) {
  const seconds = message?.outer?.created_at || message?.event?.created_at || 0;
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds * 1e3 : 0;
}
function isSafeScore(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function normalizeScore(value) {
  return isSafeScore(value) ? value : null;
}
function normalizePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}
function clampWindow(value) {
  const number = normalizePositiveInteger(value, DEFAULT_WINDOW_MS, MAX_WINDOW_MS);
  return Math.max(MIN_WINDOW_MS, Math.min(MAX_WINDOW_MS, number));
}
function adaptWindow(current, replyCount, limit) {
  const windowMs = clampWindow(current);
  if (replyCount <= 0) return clampWindow(windowMs * 4);
  if (replyCount < SMALL_REPLY_COUNT) return clampWindow(windowMs * 2);
  if (replyCount >= limit) return clampWindow(Math.floor(windowMs / 2));
  return windowMs;
}
function shrinkWindow(current) {
  return clampWindow(Math.floor(clampWindow(current) / 2));
}
function normalizeIdList(values, limit = INVENTORY_LIMIT) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = normalizePubkey5(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}
function normalizeAdvert(payload) {
  if (!isPlainObject3(payload)) return null;
  const generatedAt = normalizePositiveInteger(payload.generatedAt, 0);
  if (!generatedAt) return null;
  const minScore = payload.minScore == null ? null : normalizeScore(payload.minScore);
  const maxScore = payload.maxScore == null ? null : normalizeScore(payload.maxScore);
  if (minScore == null !== (maxScore == null)) return null;
  if (minScore != null && maxScore < minScore) return null;
  return { generatedAt, minScore, maxScore };
}
function normalizeAsk(payload) {
  if (!isPlainObject3(payload)) return null;
  const requestId2 = typeof payload.requestId === "string" && payload.requestId ? payload.requestId : "";
  const sinceScore = normalizeScore(payload.sinceScore);
  const untilScore = normalizeScore(payload.untilScore);
  if (!requestId2 || sinceScore == null || untilScore == null || untilScore < sinceScore) return null;
  return {
    requestId: requestId2,
    sinceScore,
    untilScore,
    excludeIds: normalizeIdList(payload.excludeIds),
    limit: normalizePositiveInteger(payload.limit, REQUEST_LIMIT, REQUEST_LIMIT)
  };
}
function normalizeAppAsk(payload) {
  if (!isPlainObject3(payload)) return null;
  const requestId2 = typeof payload.requestId === "string" && payload.requestId ? payload.requestId : "";
  const appId = normalizeAppId(payload.appId);
  const after = normalizeOptionalEventId(payload.after);
  if (!requestId2 || !appId || payload.after && !after) return null;
  return {
    requestId: requestId2,
    appId,
    after,
    batchSize: normalizePositiveInteger(payload.batchSize, REQUEST_LIMIT, REQUEST_LIMIT)
  };
}
function normalizeEventBatchPayload(payload) {
  if (!isPlainObject3(payload)) return null;
  const index = Math.floor(Number(payload.index));
  if (!Number.isSafeInteger(index) || index < 0) return null;
  if (typeof payload.jsonl !== "string") return null;
  return {
    requestId: typeof payload.requestId === "string" ? payload.requestId : "",
    sinceScore: normalizeScore(payload.sinceScore),
    untilScore: normalizeScore(payload.untilScore),
    index,
    isLast: payload.isLast === true,
    hasMore: typeof payload.hasMore === "boolean" ? payload.hasMore : null,
    jsonl: payload.jsonl
  };
}
function normalizeAppEventBatchPayload(payload) {
  const normalized = normalizeEventBatchPayload(payload);
  if (!normalized) return null;
  const appId = normalizeAppId(payload.appId);
  const after = normalizeOptionalEventId(payload.after);
  const nextAfter = normalizeOptionalEventId(payload.nextAfter);
  if (!appId || payload.after && !after || payload.nextAfter && !nextAfter) return null;
  return {
    ...normalized,
    appId,
    after,
    nextAfter
  };
}
function parseJsonlEvents(jsonl) {
  const events = [];
  for (const line of String(jsonl || "").split("\n")) {
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      if (Number.isInteger(event?.kind)) events.push(event);
    } catch {
    }
  }
  return events;
}
function eventsToJsonl(events) {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length ? "\n" : "");
}
function readState(storage) {
  try {
    const state = JSON.parse(storage?.getItem?.(STATE_KEY) || "{}");
    return isPlainObject3(state) ? state : {};
  } catch {
    return {};
  }
}
function writeState(storage, state) {
  try {
    storage?.setItem?.(STATE_KEY, JSON.stringify(state));
  } catch {
  }
}
function ownerState(state, ownerPubkey) {
  if (!isPlainObject3(state.owners)) state.owners = {};
  if (!isPlainObject3(state.owners[ownerPubkey])) state.owners[ownerPubkey] = {};
  return state.owners[ownerPubkey];
}
function peerState(state, ownerPubkey, peerPubkey) {
  const owner = ownerState(state, ownerPubkey);
  if (!isPlainObject3(owner[peerPubkey])) owner[peerPubkey] = {};
  return owner[peerPubkey];
}
function appBackfillsState(state) {
  if (!isPlainObject3(state.appBackfills)) state.appBackfills = {};
  return state.appBackfills;
}
function ownerAppBackfillsState(state, ownerPubkey) {
  const backfills = appBackfillsState(state);
  if (!isPlainObject3(backfills[ownerPubkey])) backfills[ownerPubkey] = {};
  return backfills[ownerPubkey];
}
function appBackfillState(state, ownerPubkey, appId) {
  const owner = ownerAppBackfillsState(state, ownerPubkey);
  const key = appStateKey(appId);
  if (!isPlainObject3(owner[key])) owner[key] = { appId, peers: {} };
  if (!isPlainObject3(owner[key].peers)) owner[key].peers = {};
  owner[key].appId = appId;
  return owner[key];
}
function appBackfillPeerState(state, ownerPubkey, appId, peerPubkey) {
  const app = appBackfillState(state, ownerPubkey, appId);
  if (!isPlainObject3(app.peers[peerPubkey])) app.peers[peerPubkey] = {};
  return app.peers[peerPubkey];
}
function existingAppBackfillPeerState(state, ownerPubkey, appId, peerPubkey) {
  const app = state.appBackfills?.[ownerPubkey]?.[appStateKey(appId)];
  const entry = app?.peers?.[peerPubkey];
  return isPlainObject3(app) && isPlainObject3(entry) ? { app, entry } : {};
}
function appBackfillPeerKeys(app) {
  return Object.keys(isPlainObject3(app?.peers) ? app.peers : {});
}
function setAppBackfillTargetPeers(app, peerPubkeys) {
  app.peers = {};
  for (const peerPubkey of peerPubkeys) app.peers[peerPubkey] = {};
}
function compareAdvert(next, current) {
  if (!current) return 1;
  if ((next.generatedAt || 0) !== (current.generatedAt || 0)) return (next.generatedAt || 0) - (current.generatedAt || 0);
  if ((next.messageAt || 0) !== (current.messageAt || 0)) return (next.messageAt || 0) - (current.messageAt || 0);
  return String(next.eventId || "").localeCompare(String(current.eventId || ""));
}
function requestId(random = Math.random) {
  return `${Date.now().toString(36)}:${random().toString(36).slice(2)}`;
}
function syncQuery(since, until, extra = {}) {
  return {
    since,
    until,
    search: "algo:sync sort:asc",
    ...extra
  };
}
async function dbRange(db, emptyScore) {
  const first = await db.query({ search: "algo:sync sort:asc", limit: 1 });
  const minScore = first?.meta?.firstScore ?? null;
  if (minScore == null) return { minScore: emptyScore, maxScore: emptyScore };
  const last = await db.query({ search: "algo:sync sort:desc", limit: 1 });
  return {
    minScore,
    maxScore: last?.meta?.firstScore ?? first?.meta?.lastScore ?? minScore
  };
}
function localOwnerForMessage(message, context) {
  const ownerPubkey = normalizePubkey5(context.ownerPubkeyForChannel?.(message?.channelPubkey) || "");
  if (!ownerPubkey) return "";
  const owners = context.ownerPubkeys;
  if (owners instanceof Set) return owners.has(ownerPubkey) ? ownerPubkey : "";
  return ownerPubkey;
}
function isTrustedSender2(message, context) {
  return context.trustedByPubkey?.has?.(message?.event?.pubkey) || false;
}
function ownerChannelPubkey(ownerPubkey, context) {
  return context.channelPubkeyForOwner?.(ownerPubkey) || "";
}
function isOwnerReady(ownerPubkey, context) {
  const ready = context.readyOwnerPubkeys;
  if (ready instanceof Set) return ready.has(ownerPubkey);
  return Boolean(ownerChannelPubkey(ownerPubkey, context));
}
function publicationSucceeded(result) {
  if (!result?.delivery) return true;
  const reports = result.delivery.reports;
  return Array.isArray(reports) && reports.length > 0 && reports.every((report) => report?.success === true);
}
function trustedPubkeys(context) {
  if (Array.isArray(context.receiverPubkeys)) return context.receiverPubkeys.filter(Boolean);
  return [...context.trustedByPubkey?.keys?.() || []];
}
function emitDebug2(debug, action, detail = {}) {
  try {
    debug?.({ source: "nostrdb-sync", action, ...detail });
  } catch {
  }
}
function createNostrDbSyncController({
  getDb = forAccount,
  storage,
  _setTimeout = globalThis.setTimeout?.bind(globalThis),
  _clearTimeout = globalThis.clearTimeout?.bind(globalThis),
  _nowMs = nowMs,
  _random = Math.random,
  onError = (err) => console.warn("nostrdb sync failed", err?.message ?? err)
} = {}) {
  const subscriptions = /* @__PURE__ */ new Map();
  const pushQueues = /* @__PURE__ */ new Map();
  const recentSyncEventIds = /* @__PURE__ */ new Map();
  let runtime = {};
  let retryTimer = null;
  let appBackfillProcessTail = Promise.resolve();
  let appBackfillProcessGeneration = 0;
  let pendingAppBackfillProcess = null;
  let durableState = storage ? readState(storage) : readRecords(NOSTRDB_SYNC).find((record) => record.key === "state")?.value || {};
  let stateWriteTail = Promise.resolve();
  function report(err) {
    try {
      onError?.(err);
    } catch {
    }
  }
  function getState2() {
    return storage ? readState(storage) : structuredClone(durableState);
  }
  function setState2(state) {
    if (storage) return writeState(storage, state);
    const snapshot = structuredClone(state);
    durableState = snapshot;
    const write = stateWriteTail.then(() => replaceRecords(NOSTRDB_SYNC, [{ key: "state", value: snapshot }]));
    stateWriteTail = write.catch(report);
    return write;
  }
  function pruneRecentSyncEventIds() {
    const now = _nowMs();
    for (const [id, expiresAt] of recentSyncEventIds) {
      if (expiresAt <= now) recentSyncEventIds.delete(id);
    }
  }
  function markRecentSyncEvent(event) {
    if (!normalizePubkey5(event?.id)) return;
    pruneRecentSyncEventIds();
    recentSyncEventIds.set(event.id, _nowMs() + RECENT_SYNC_EVENT_TTL_MS);
  }
  function isRecentSyncEvent(event) {
    pruneRecentSyncEventIds();
    return recentSyncEventIds.has(event?.id);
  }
  async function announceRange({ messenger, ownerPubkey, channelPubkey = "", receiverPubkeys, debug = runtime.debug } = {}) {
    const receivers = [...new Set((receiverPubkeys || []).filter(Boolean))];
    if (!messenger?.yell || !ownerPubkey || !channelPubkey || !receivers.length) return null;
    let range;
    const generatedAt = _nowMs();
    try {
      range = await dbRange(getDb(ownerPubkey), generatedAt);
    } catch (err) {
      report(err);
      return null;
    }
    const payload = {
      generatedAt,
      minScore: range.minScore,
      maxScore: range.maxScore
    };
    emitDebug2(debug, "advertise", {
      channelPubkey,
      ownerPubkey,
      receiverPubkeys: receivers,
      receiverCount: receivers.length,
      minScore: payload.minScore,
      maxScore: payload.maxScore
    });
    return messenger.yell({
      channelPubkey,
      receiverPubkeys: receivers,
      code: NOSTRDB_SYNC_ADVERTISE_CODE,
      payload
    });
  }
  async function localInventoryIds(db, sinceScore, untilScore) {
    const { results } = await db.query(syncQuery(sinceScore, untilScore, {
      ids_only: true,
      limit: INVENTORY_LIMIT
    }));
    return normalizeIdList(results);
  }
  async function buildAskWindow(db, sinceScore, targetScore, windowMs) {
    let size = clampWindow(windowMs);
    while (true) {
      const untilScore = Math.min(targetScore, sinceScore + size - 1);
      const excludeIds = await localInventoryIds(db, sinceScore, untilScore);
      if (excludeIds.length < INVENTORY_LIMIT || size <= MIN_WINDOW_MS) {
        return { sinceScore, untilScore, excludeIds, windowMs: size };
      }
      size = Math.max(MIN_WINDOW_MS, Math.floor(size / 2));
    }
  }
  async function maybeAsk(ownerPubkey, peerPubkey, context = runtime, { onlineHint = false, force = false } = {}) {
    if (!context.messenger?.ask) return null;
    const channelPubkey = ownerChannelPubkey(ownerPubkey, context);
    if (!isOwnerReady(ownerPubkey, context) || !channelPubkey) return null;
    const state = getState2();
    const entry = peerState(state, ownerPubkey, peerPubkey);
    const advert = entry.advert;
    if (!advert || advert.maxScore == null || advert.minScore == null) return null;
    const now = _nowMs();
    if (entry.pending && !force) {
      const retryAt = onlineHint ? Math.min(entry.pending.nextRetryAt || Infinity, entry.pending.onlineRetryAt || Infinity) : entry.pending.nextRetryAt;
      if (!Number.isFinite(retryAt) || now < retryAt) {
        scheduleRetrySweep(context);
        return null;
      }
    }
    const completed = Number.isSafeInteger(entry.completedScore) ? entry.completedScore : advert.minScore - 1;
    const targetScore = advert.maxScore + ADVERT_EDGE_EXTENSION_MS;
    const sinceScore = Math.max(advert.minScore, completed + 1);
    if (sinceScore > targetScore) {
      entry.pending = null;
      entry.updatedAt = now;
      setState2(state);
      return null;
    }
    let askWindow;
    try {
      askWindow = await buildAskWindow(getDb(ownerPubkey), sinceScore, targetScore, entry.windowMs);
    } catch (err) {
      report(err);
      return null;
    }
    const id = requestId(_random);
    const attempt = force ? (entry.pending?.attempt || 0) + 1 : 0;
    const onlineDelay = Math.min(ONLINE_RETRY_MAX_MS, ONLINE_RETRY_MIN_MS * 2 ** attempt);
    const payload = {
      requestId: id,
      sinceScore: askWindow.sinceScore,
      untilScore: askWindow.untilScore,
      excludeIds: askWindow.excludeIds,
      limit: REQUEST_LIMIT
    };
    entry.windowMs = askWindow.windowMs;
    entry.pending = {
      requestId: id,
      sinceScore: askWindow.sinceScore,
      untilScore: askWindow.untilScore,
      limit: REQUEST_LIMIT,
      replyCount: 0,
      attempt,
      sentAt: now,
      nextRetryAt: now + NO_REPLY_RETRY_MS,
      onlineRetryAt: now + onlineDelay
    };
    entry.updatedAt = now;
    setState2(state);
    try {
      const result = await context.messenger.ask({
        channelPubkey,
        receiverPubkey: peerPubkey,
        code: NOSTRDB_SYNC_ASK_CODE,
        payload
      });
      if (!publicationSucceeded(result)) throw new Error("SYNC_PUBLICATION_FAILED");
    } catch (err) {
      entry.pending.nextRetryAt = _nowMs() + onlineDelay;
      entry.pending.onlineRetryAt = entry.pending.nextRetryAt;
      entry.updatedAt = _nowMs();
      setState2(state);
      scheduleRetrySweep(context);
      report(err);
      return null;
    }
    scheduleRetrySweep(context);
    emitDebug2(context.debug, "ask", {
      channelPubkey,
      ownerPubkey,
      receiverPubkey: peerPubkey,
      sinceScore: payload.sinceScore,
      untilScore: payload.untilScore,
      excludeCount: payload.excludeIds.length
    });
    return payload;
  }
  async function maybeAskAppBackfill(ownerPubkey, appId, peerPubkey, context = runtime, { onlineHint = false } = {}) {
    if (!context.messenger?.ask) return null;
    const channelPubkey = ownerChannelPubkey(ownerPubkey, context);
    if (!isOwnerReady(ownerPubkey, context) || !channelPubkey) return null;
    if (!normalizeAppId(appId) || !normalizePubkey5(peerPubkey)) return null;
    if (context.ownerPubkeys instanceof Set && !context.ownerPubkeys.has(ownerPubkey)) return null;
    if (!context.trustedByPubkey?.has?.(peerPubkey)) return null;
    const state = getState2();
    const appKey = appStateKey(appId);
    const existingApp = state.appBackfills?.[ownerPubkey]?.[appKey];
    if (!isPlainObject3(existingApp?.peers) || !Object.hasOwn(existingApp.peers, peerPubkey)) return null;
    const app = appBackfillState(state, ownerPubkey, appId);
    const entry = appBackfillPeerState(state, ownerPubkey, appId, peerPubkey);
    if (entry.completed) return null;
    const now = _nowMs();
    if (entry.pending) {
      const retryAt = onlineHint ? Math.min(entry.pending.nextRetryAt || Infinity, entry.pending.onlineRetryAt || Infinity) : entry.pending.nextRetryAt;
      if (!Number.isFinite(retryAt) || now < retryAt) {
        scheduleRetrySweep(context);
        return null;
      }
    }
    const id = requestId(_random);
    const attempt = entry.pending ? (entry.pending.attempt || 0) + 1 : 0;
    const onlineDelay = Math.min(ONLINE_RETRY_MAX_MS, ONLINE_RETRY_MIN_MS * 2 ** attempt);
    const payload = {
      requestId: id,
      appId,
      after: entry.after || "",
      batchSize: REQUEST_LIMIT
    };
    entry.completed = false;
    entry.pending = {
      requestId: id,
      appId,
      after: payload.after,
      batchSize: REQUEST_LIMIT,
      replyCount: 0,
      attempt,
      sentAt: now,
      nextRetryAt: now + NO_REPLY_RETRY_MS,
      onlineRetryAt: now + onlineDelay
    };
    entry.updatedAt = now;
    app.updatedAt = now;
    setState2(state);
    try {
      const result = await context.messenger.ask({
        channelPubkey,
        receiverPubkey: peerPubkey,
        code: NOSTRDB_SYNC_APP_ASK_CODE,
        payload
      });
      if (!publicationSucceeded(result)) throw new Error("SYNC_PUBLICATION_FAILED");
    } catch (err) {
      const nextState = getState2();
      const { app: nextApp, entry: nextEntry } = existingAppBackfillPeerState(nextState, ownerPubkey, appId, peerPubkey);
      if (nextEntry?.pending?.requestId === id) {
        nextEntry.pending.nextRetryAt = _nowMs() + onlineDelay;
        nextEntry.pending.onlineRetryAt = nextEntry.pending.nextRetryAt;
        nextEntry.updatedAt = _nowMs();
        nextApp.updatedAt = nextEntry.updatedAt;
        setState2(nextState);
      }
      scheduleRetrySweep(context);
      report(err);
      return null;
    }
    scheduleRetrySweep(context);
    emitDebug2(context.debug, "app-ask", {
      ownerPubkey,
      appId,
      receiverPubkey: peerPubkey,
      after: payload.after
    });
    return payload;
  }
  async function processAppBackfillsNow(context = runtime, { ownerPubkey = "", peerPubkey = "", onlineHint = false } = {}) {
    const state = getState2();
    const owners = state.appBackfills || {};
    const contextOwners = context.ownerPubkeys instanceof Set ? context.ownerPubkeys : new Set(context.ownerPubkeys || []);
    const contextPeers = trustedPubkeys(context);
    let changed = false;
    for (const [owner, apps] of Object.entries(owners)) {
      if (ownerPubkey && owner !== ownerPubkey) continue;
      if (contextOwners.size && !contextOwners.has(owner)) continue;
      for (const [key, appState] of Object.entries(apps || {})) {
        const appId = normalizeAppId(appState?.appId) || appIdFromStateKey(key);
        if (!appId) continue;
        if (appState.unresolvedPeers) {
          if (!contextPeers.length) continue;
          setAppBackfillTargetPeers(appState, contextPeers);
          appState.unresolvedPeers = false;
          appState.updatedAt = _nowMs();
          changed = true;
        }
        const peers = peerPubkey ? Object.hasOwn(appState.peers || {}, peerPubkey) ? [peerPubkey] : [] : appBackfillPeerKeys(appState);
        if (changed) {
          setState2(state);
          changed = false;
        }
        for (const peer of peers) {
          await maybeAskAppBackfill(owner, appId, peer, context, { onlineHint });
        }
      }
      if (Object.keys(apps || {}).length === 0) {
        delete owners[owner];
        changed = true;
      }
    }
    if (changed) setState2(state);
  }
  function processAppBackfills(context = runtime, options = {}) {
    const generation = appBackfillProcessGeneration;
    if (pendingAppBackfillProcess?.generation === generation) {
      const pending2 = pendingAppBackfillProcess;
      pending2.context = context;
      pending2.options = {
        ownerPubkey: pending2.options.ownerPubkey && options.ownerPubkey === pending2.options.ownerPubkey ? pending2.options.ownerPubkey : "",
        peerPubkey: pending2.options.peerPubkey && options.peerPubkey === pending2.options.peerPubkey ? pending2.options.peerPubkey : "",
        onlineHint: Boolean(pending2.options.onlineHint || options.onlineHint)
      };
      return pending2.promise;
    }
    const pending = {
      generation,
      context,
      options: {
        ownerPubkey: options.ownerPubkey || "",
        peerPubkey: options.peerPubkey || "",
        onlineHint: Boolean(options.onlineHint)
      },
      promise: null
    };
    const run = appBackfillProcessTail.catch(() => {
    }).then(() => {
      if (pendingAppBackfillProcess === pending) pendingAppBackfillProcess = null;
      if (generation !== appBackfillProcessGeneration) return null;
      return processAppBackfillsNow(pending.context, pending.options);
    });
    pending.promise = run;
    pendingAppBackfillProcess = pending;
    appBackfillProcessTail = run;
    return run;
  }
  function requestAppBackfill({ ownerPubkey, appId } = {}, context = runtime) {
    const owner = normalizePubkey5(ownerPubkey);
    const app = normalizeAppId(appId);
    if (!owner || !app) return false;
    const peers = trustedPubkeys(context);
    const state = getState2();
    const entry = appBackfillState(state, owner, app);
    const now = _nowMs();
    setAppBackfillTargetPeers(entry, peers);
    entry.unresolvedPeers = peers.length === 0;
    entry.requestedAt = now;
    entry.updatedAt = now;
    setState2(state);
    processAppBackfills(context, { ownerPubkey: owner }).catch(report);
    scheduleRetrySweep(context);
    emitDebug2(context.debug, "app-backfill-requested", { ownerPubkey: owner, appId: app });
    return true;
  }
  async function handleAdvertise(ownerPubkey, message, context) {
    const advert = normalizeAdvert(messageBody3(message));
    const peerPubkey = normalizePubkey5(message?.event?.pubkey);
    if (!advert || !peerPubkey) return true;
    const nextAdvert = {
      ...advert,
      messageAt: messageTimeMs(message),
      eventId: message?.event?.id || ""
    };
    const state = getState2();
    const entry = peerState(state, ownerPubkey, peerPubkey);
    if (compareAdvert(nextAdvert, entry.advert) <= 0) return true;
    entry.advert = nextAdvert;
    entry.updatedAt = _nowMs();
    setState2(state);
    emitDebug2(context.debug, "advertise-received", {
      ownerPubkey,
      senderPubkey: peerPubkey,
      minScore: advert.minScore,
      maxScore: advert.maxScore
    });
    await maybeAsk(ownerPubkey, peerPubkey, context, { onlineHint: true });
    await processAppBackfills(context, { ownerPubkey, peerPubkey, onlineHint: true });
    return true;
  }
  async function handleAsk(ownerPubkey, message, context) {
    const ask2 = normalizeAsk(messageBody3(message));
    if (!ask2) return true;
    let results = [];
    let hasMore = false;
    try {
      const db = getDb(ownerPubkey);
      const effectiveLimit = Math.min(ask2.limit, REQUEST_LIMIT);
      const response = await db.query(syncQuery(ask2.sinceScore, ask2.untilScore, {
        "!ids": ask2.excludeIds,
        limit: effectiveLimit + 1
      }));
      const queried = Array.isArray(response?.results) ? response.results : [];
      hasMore = queried.length > effectiveLimit;
      results = queried.slice(0, effectiveLimit);
    } catch (err) {
      report(err);
      return true;
    }
    const options = {
      channelPubkey: message.channelPubkey,
      question: message.event,
      receiverPubkey: message.event?.pubkey,
      code: NOSTRDB_SYNC_REPLY_CODE,
      payload: {
        requestId: ask2.requestId,
        sinceScore: ask2.sinceScore,
        untilScore: ask2.untilScore,
        hasMore
      },
      sendEmptyReply: true
    };
    const packer = typeof context.messenger?.createEventReplyPacker === "function" ? context.messenger.createEventReplyPacker(options) : createEventReplyPacker({ messenger: context.messenger, ...options });
    try {
      for (const event of results) await packer.update(event);
      await packer.finalize();
    } catch (err) {
      report(err);
    }
    emitDebug2(context.debug, "reply", {
      ownerPubkey,
      receiverPubkey: message.event?.pubkey || "",
      requestId: ask2.requestId,
      hasMore,
      count: results.length
    });
    return true;
  }
  async function handleAppAsk(ownerPubkey, message, context) {
    const ask2 = normalizeAppAsk(messageBody3(message));
    if (!ask2) return true;
    let results = [];
    let hasMore = false;
    let nextAfter = ask2.after;
    try {
      const db = getDb(ownerPubkey);
      if (typeof db.exportEventsByAppPage === "function") {
        const page = await db.exportEventsByAppPage(ask2.appId, {
          after: ask2.after,
          batchSize: ask2.batchSize
        });
        results = Array.isArray(page?.events) ? page.events.slice(0, ask2.batchSize) : [];
        hasMore = page?.hasMore === true;
        nextAfter = normalizeOptionalEventId(page?.nextAfter) || results.at(-1)?.id || ask2.after;
      }
    } catch (err) {
      report(err);
      return true;
    }
    const options = {
      channelPubkey: message.channelPubkey,
      question: message.event,
      receiverPubkey: message.event?.pubkey,
      code: NOSTRDB_SYNC_APP_REPLY_CODE,
      payload: {
        requestId: ask2.requestId,
        appId: ask2.appId,
        after: ask2.after,
        nextAfter,
        hasMore
      },
      sendEmptyReply: true
    };
    const packer = typeof context.messenger?.createEventReplyPacker === "function" ? context.messenger.createEventReplyPacker(options) : createEventReplyPacker({ messenger: context.messenger, ...options });
    try {
      for (const event of results) await packer.update(event);
      await packer.finalize();
    } catch (err) {
      report(err);
    }
    emitDebug2(context.debug, "app-reply", {
      ownerPubkey,
      appId: ask2.appId,
      receiverPubkey: message.event?.pubkey || "",
      requestId: ask2.requestId,
      hasMore,
      count: results.length
    });
    return true;
  }
  async function ingestEvents(ownerPubkey, events) {
    if (!events.length) return 0;
    let imported = 0;
    let db;
    try {
      db = getDb(ownerPubkey);
    } catch (err) {
      report(err);
      return 0;
    }
    for (const event of events) {
      markRecentSyncEvent(event);
      try {
        const result = await db.add(event, { mergeSource: "sync" });
        if (result?.ok !== false) imported++;
      } catch (err) {
        report(err);
      }
    }
    return imported;
  }
  async function ingestAppEvents(ownerPubkey, appId, events) {
    if (!events.length) return 0;
    for (const event of events) markRecentSyncEvent(event);
    try {
      const db = getDb(ownerPubkey);
      if (typeof db.addEventsForApp === "function") {
        const result = await db.addEventsForApp(appId, events);
        return normalizePositiveInteger(result?.added, 0);
      }
      let imported = 0;
      for (const event of events) {
        const result = await db.add(event, { appId, mergeSource: "sync" });
        if (result?.ok !== false) imported++;
      }
      return imported;
    } catch (err) {
      report(err);
      return 0;
    }
  }
  async function handleReply2(ownerPubkey, message, context) {
    const payload = normalizeEventBatchPayload(messageBody3(message));
    const peerPubkey = normalizePubkey5(message?.event?.pubkey);
    if (!payload || !peerPubkey) return true;
    const events = parseJsonlEvents(payload.jsonl);
    await ingestEvents(ownerPubkey, events);
    const state = getState2();
    const entry = peerState(state, ownerPubkey, peerPubkey);
    const pending = entry?.pending;
    if (pending && payload.requestId && pending.requestId === payload.requestId) {
      pending.replyCount = (pending.replyCount || 0) + events.length;
      if (payload.isLast) {
        const replyCount = pending.replyCount || 0;
        const hasMore = payload.hasMore ?? replyCount >= (pending.limit || REQUEST_LIMIT);
        if (hasMore) {
          entry.windowMs = shrinkWindow(entry.windowMs);
        } else {
          entry.completedScore = Math.max(entry.completedScore || 0, pending.untilScore);
          entry.windowMs = adaptWindow(entry.windowMs, replyCount, pending.limit || REQUEST_LIMIT);
        }
        entry.pending = null;
        entry.updatedAt = _nowMs();
        setState2(state);
        emitDebug2(context.debug, "reply-received", {
          ownerPubkey,
          senderPubkey: peerPubkey,
          requestId: payload.requestId,
          count: replyCount,
          hasMore,
          untilScore: pending.untilScore
        });
        await maybeAsk(ownerPubkey, peerPubkey, context, { force: true });
        return true;
      }
      entry.updatedAt = _nowMs();
      setState2(state);
    }
    return true;
  }
  async function handleAppReply(ownerPubkey, message, context) {
    const payload = normalizeAppEventBatchPayload(messageBody3(message));
    const peerPubkey = normalizePubkey5(message?.event?.pubkey);
    if (!payload || !peerPubkey) return true;
    const state = getState2();
    const { app, entry } = existingAppBackfillPeerState(state, ownerPubkey, payload.appId, peerPubkey);
    const pending = entry?.pending;
    if (!pending || !payload.requestId || pending.requestId !== payload.requestId) return true;
    const events = parseJsonlEvents(payload.jsonl);
    await ingestAppEvents(ownerPubkey, payload.appId, events);
    pending.replyCount = (pending.replyCount || 0) + events.length;
    if (events.length) pending.lastEventId = events.at(-1).id;
    if (payload.isLast) {
      const replyCount = pending.replyCount || 0;
      const nextAfter = payload.nextAfter || pending.lastEventId || pending.after || "";
      const hasMore = payload.hasMore ?? replyCount >= (pending.batchSize || REQUEST_LIMIT);
      entry.after = nextAfter;
      entry.completed = !hasMore;
      entry.pending = null;
      entry.updatedAt = _nowMs();
      app.updatedAt = entry.updatedAt;
      setState2(state);
      emitDebug2(context.debug, "app-reply-received", {
        ownerPubkey,
        appId: payload.appId,
        senderPubkey: peerPubkey,
        requestId: payload.requestId,
        count: replyCount,
        hasMore,
        nextAfter
      });
      if (hasMore) await processAppBackfills(context, { ownerPubkey, peerPubkey });
      return true;
    }
    entry.updatedAt = _nowMs();
    app.updatedAt = entry.updatedAt;
    setState2(state);
    return true;
  }
  async function handlePush(ownerPubkey, message, context) {
    const payload = normalizeEventBatchPayload(messageBody3(message));
    if (!payload) return true;
    const events = parseJsonlEvents(payload.jsonl);
    const imported = await ingestEvents(ownerPubkey, events);
    emitDebug2(context.debug, "push-received", {
      ownerPubkey,
      senderPubkey: message.event?.pubkey || "",
      count: imported
    });
    await processAppBackfills(context, { ownerPubkey, peerPubkey: message.event?.pubkey || "", onlineHint: true });
    return true;
  }
  async function handleMessage3(message, context = runtime) {
    const code = messageCode3(message);
    if (!SYNC_CODES.has(code)) return false;
    const ownerPubkey = localOwnerForMessage(message, context);
    if (!ownerPubkey || !isTrustedSender2(message, context)) return false;
    if (code === NOSTRDB_SYNC_ADVERTISE_CODE) return handleAdvertise(ownerPubkey, message, context);
    if (code === NOSTRDB_SYNC_ASK_CODE) return handleAsk(ownerPubkey, message, context);
    if (code === NOSTRDB_SYNC_REPLY_CODE) return handleReply2(ownerPubkey, message, context);
    if (code === NOSTRDB_SYNC_PUSH_CODE) return handlePush(ownerPubkey, message, context);
    if (code === NOSTRDB_SYNC_APP_ASK_CODE) return handleAppAsk(ownerPubkey, message, context);
    return handleAppReply(ownerPubkey, message, context);
  }
  function pushRuntime(ownerPubkey) {
    const receiverPubkeys = trustedPubkeys(runtime);
    const channelPubkey = ownerChannelPubkey(ownerPubkey, runtime);
    if (!runtime.messenger?.yell || !receiverPubkeys.length || !isOwnerReady(ownerPubkey, runtime) || !channelPubkey) return null;
    return {
      messenger: runtime.messenger,
      channelPubkey,
      receiverPubkeys
    };
  }
  async function flushPushQueue(ownerPubkey) {
    const queue = pushQueues.get(ownerPubkey);
    if (!queue || queue.events.size === 0) return;
    const target = pushRuntime(ownerPubkey);
    if (!target) return;
    const events = [...queue.events.values()];
    queue.events.clear();
    let index = 0;
    for (let i = 0; i < events.length; i += PUSH_EVENTS_PER_CHUNK) {
      const chunk = events.slice(i, i + PUSH_EVENTS_PER_CHUNK);
      try {
        await target.messenger.yell({
          channelPubkey: target.channelPubkey,
          receiverPubkeys: target.receiverPubkeys,
          code: NOSTRDB_SYNC_PUSH_CODE,
          payload: {
            index: index++,
            isLast: i + PUSH_EVENTS_PER_CHUNK >= events.length,
            jsonl: eventsToJsonl(chunk)
          }
        });
      } catch (err) {
        report(err);
      }
    }
    emitDebug2(runtime.debug, "push", {
      ownerPubkey,
      channelPubkey: target.channelPubkey,
      receiverCount: target.receiverPubkeys.length,
      count: events.length
    });
  }
  function startPushCooldown(ownerPubkey, queue) {
    queue.cooling = true;
    queue.timer = _setTimeout(async () => {
      queue.timer = null;
      queue.cooling = false;
      if (queue.events.size > 0) {
        await flushPushQueue(ownerPubkey);
        startPushCooldown(ownerPubkey, queue);
      }
    }, PUSH_THROTTLE_MS);
    queue.timer?.unref?.();
  }
  function queuePush(ownerPubkey, event) {
    if (!normalizePubkey5(event?.id) || isRecentSyncEvent(event)) return;
    let queue = pushQueues.get(ownerPubkey);
    if (!queue) {
      queue = { events: /* @__PURE__ */ new Map(), timer: null, cooling: false };
      pushQueues.set(ownerPubkey, queue);
    }
    queue.events.set(event.id, event);
    if (queue.cooling) return;
    flushPushQueue(ownerPubkey).catch(report);
    startPushCooldown(ownerPubkey, queue);
  }
  function stopSubscription(ownerPubkey) {
    const sub = subscriptions.get(ownerPubkey);
    if (!sub) return;
    sub.stopped = true;
    sub.iterator?.return?.().catch?.(() => {
    });
    subscriptions.delete(ownerPubkey);
  }
  function startSubscription(ownerPubkey) {
    if (subscriptions.has(ownerPubkey)) return;
    let iterator;
    try {
      const iterable = getDb(ownerPubkey).subscribe({ search: "algo:sync sort:asc" }, { scheduled: false });
      iterator = iterable?.[Symbol.asyncIterator]?.() || iterable;
    } catch (err) {
      report(err);
      return;
    }
    if (!iterator?.next) return;
    const sub = { iterator, stopped: false };
    subscriptions.set(ownerPubkey, sub);
    (async () => {
      try {
        for await (const item of iterator) {
          if (sub.stopped) break;
          queuePush(ownerPubkey, item?.result);
        }
      } catch (err) {
        if (!sub.stopped) report(err);
      } finally {
        if (subscriptions.get(ownerPubkey) === sub) subscriptions.delete(ownerPubkey);
      }
    })();
  }
  function pruneState({ ownerPubkeys = /* @__PURE__ */ new Set(), trustedByPubkey = /* @__PURE__ */ new Map() } = {}) {
    const owners = ownerPubkeys instanceof Set ? ownerPubkeys : new Set(ownerPubkeys || []);
    const peers = new Set(trustedByPubkey?.keys?.() || []);
    const cutoff = _nowMs() - STATE_PRUNE_MS;
    const state = getState2();
    if (isPlainObject3(state.owners)) {
      for (const ownerPubkey of Object.keys(state.owners)) {
        if (!owners.has(ownerPubkey)) {
          delete state.owners[ownerPubkey];
          continue;
        }
        const owner = state.owners[ownerPubkey];
        for (const peerPubkey of Object.keys(owner)) {
          const entry = owner[peerPubkey];
          if (!peers.has(peerPubkey) || (entry.updatedAt || 0) < cutoff) delete owner[peerPubkey];
        }
        if (Object.keys(owner).length === 0) delete state.owners[ownerPubkey];
      }
    }
    if (isPlainObject3(state.appBackfills)) {
      for (const ownerPubkey of Object.keys(state.appBackfills)) {
        if (!owners.has(ownerPubkey)) {
          delete state.appBackfills[ownerPubkey];
          continue;
        }
        const apps = state.appBackfills[ownerPubkey];
        for (const [key, app] of Object.entries(apps)) {
          if (!normalizeAppId(app?.appId) && !appIdFromStateKey(key)) {
            delete apps[key];
            continue;
          }
          const appPeers = isPlainObject3(app.peers) ? app.peers : {};
          for (const peerPubkey of Object.keys(appPeers)) {
            const entry = appPeers[peerPubkey];
            if (!peers.has(peerPubkey) || (entry.updatedAt || 0) < cutoff) delete appPeers[peerPubkey];
          }
          const hasFreshRequest = (app.updatedAt || app.requestedAt || 0) >= cutoff;
          if (!hasFreshRequest && Object.keys(appPeers).length === 0) delete apps[key];
          else app.peers = appPeers;
        }
        if (Object.keys(apps).length === 0) delete state.appBackfills[ownerPubkey];
      }
    }
    setState2(state);
  }
  function nextRetryAt(context = runtime) {
    const state = getState2();
    let next = Infinity;
    for (const [ownerPubkey, owner] of Object.entries(state.owners || {})) {
      if (!isOwnerReady(ownerPubkey, context)) continue;
      for (const entry of Object.values(owner || {})) {
        const pending = entry?.pending;
        if (!pending) continue;
        next = Math.min(next, pending.nextRetryAt || Infinity);
      }
    }
    for (const [ownerPubkey, apps] of Object.entries(state.appBackfills || {})) {
      if (!isOwnerReady(ownerPubkey, context)) continue;
      for (const app of Object.values(apps || {})) {
        for (const entry of Object.values(app?.peers || {})) {
          const pending = entry?.pending;
          if (!pending) continue;
          next = Math.min(next, pending.nextRetryAt || Infinity);
        }
      }
    }
    return Number.isFinite(next) ? next : 0;
  }
  function scheduleRetrySweep(context = runtime) {
    if (retryTimer) _clearTimeout?.(retryTimer);
    retryTimer = null;
    const next = nextRetryAt(context);
    if (!next) return;
    retryTimer = _setTimeout(() => {
      retryTimer = null;
      retryDueRequests(context).catch(report);
    }, Math.max(0, next - _nowMs()));
    retryTimer?.unref?.();
  }
  async function retryDueRequests(context = runtime) {
    const state = getState2();
    const now = _nowMs();
    for (const [ownerPubkey, owner] of Object.entries(state.owners || {})) {
      if (context.ownerPubkeys instanceof Set && !context.ownerPubkeys.has(ownerPubkey)) continue;
      for (const [peerPubkey, entry] of Object.entries(owner || {})) {
        if (!entry?.pending || (entry.pending.nextRetryAt || Infinity) > now) continue;
        await maybeAsk(ownerPubkey, peerPubkey, context, { force: true });
      }
    }
    for (const [ownerPubkey, apps] of Object.entries(state.appBackfills || {})) {
      if (context.ownerPubkeys instanceof Set && !context.ownerPubkeys.has(ownerPubkey)) continue;
      for (const [key, app] of Object.entries(apps || {})) {
        const appId = normalizeAppId(app?.appId) || appIdFromStateKey(key);
        if (!appId) continue;
        for (const [peerPubkey, entry] of Object.entries(app?.peers || {})) {
          if (!entry?.pending || (entry.pending.nextRetryAt || Infinity) > now) continue;
          await processAppBackfills(context, { ownerPubkey, peerPubkey });
          break;
        }
      }
    }
    scheduleRetrySweep(context);
  }
  function ensureSubscriptions(context = {}) {
    runtime = { ...runtime, ...context };
    const owners = runtime.ownerPubkeys instanceof Set ? runtime.ownerPubkeys : new Set(runtime.ownerPubkeys || []);
    for (const ownerPubkey of [...subscriptions.keys()]) {
      if (!owners.has(ownerPubkey)) stopSubscription(ownerPubkey);
    }
    for (const ownerPubkey of owners) startSubscription(ownerPubkey);
    pruneState({ ownerPubkeys: owners, trustedByPubkey: runtime.trustedByPubkey });
    processAppBackfills(runtime).catch(report);
    scheduleRetrySweep(runtime);
  }
  function stop2() {
    for (const ownerPubkey of [...subscriptions.keys()]) stopSubscription(ownerPubkey);
    for (const queue of pushQueues.values()) {
      if (queue.timer) _clearTimeout?.(queue.timer);
    }
    pushQueues.clear();
    if (retryTimer) _clearTimeout?.(retryTimer);
    retryTimer = null;
    appBackfillProcessGeneration += 1;
    appBackfillProcessTail = Promise.resolve();
    pendingAppBackfillProcess = null;
    runtime = {};
  }
  return {
    announceRange,
    handleMessage: handleMessage3,
    ensureSubscriptions,
    requestAppBackfill,
    processAppBackfills,
    queuePush,
    stop: stop2,
    _getState: getState2
  };
}

// src/services/sync/index.js
var ANNOUNCE_INTERVAL_MS = 4 * 60 * 60 * 1e3;
var ANNOUNCE_DEBOUNCE_MS = 1e3;
var ANNOUNCE_ALL = "*";
var TRUSTED_SIGNER_SYNC_INFO2 = "trusted-signer-sync-v1";
var HEX326 = /^[0-9a-f]{64}$/i;
var APP_ID_MAX_LENGTH2 = 512;
function defaultOnError(err) {
  console.warn("sync failed", err?.message ?? err);
}
function isPlainObject4(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function isTopLevelWindow() {
  try {
    return typeof window !== "undefined" && window === window.top;
  } catch {
    return false;
  }
}
function redactDebugEvent(event) {
  try {
    return JSON.parse(JSON.stringify(event, (key, value) => {
      const name = String(key).toLowerCase();
      if (name.includes("seckey") || name.includes("secret") || name === "payload" || name === "content") {
        return "[redacted]";
      }
      return value;
    }));
  } catch {
    return { source: "sync", action: "debug", redacted: true };
  }
}
function defaultDebugSink() {
  if (!isTopLevelWindow()) return null;
  return (event) => {
    const safe = redactDebugEvent(event);
    console.log("[ez-vault sync]", safe.action || "event", safe);
  };
}
function syncRelays(relays) {
  return [...new Set((Array.isArray(relays) ? relays : []).filter(Boolean))].slice(0, 2);
}
function syncWatchRelays(relays) {
  return [...new Set((Array.isArray(relays) ? relays : []).filter(Boolean))];
}
function trustedMap(trusted) {
  return new Map(trusted.map((entry) => [entry.pubkey, entry]));
}
function nsecOwnerPubkeys(_store = accounts_store_exports) {
  return filterVisibleAccounts(_store.list()).filter((account) => account.type === "nsec").map((account) => account.pubkey);
}
function nostrDbOwnerPubkeys(_store = accounts_store_exports) {
  return nsecOwnerPubkeys(_store).filter((pubkey) => HEX326.test(pubkey));
}
function syncAccountIdentityKey(_store = accounts_store_exports) {
  return filterVisibleAccounts(_store.list()).filter((account) => account.type === "nsec").map((account) => `${account.type}:${account.pubkey}`).join("|");
}
function messageCode4(message) {
  return isPlainObject4(message?.payload) ? message.payload.code || "" : "";
}
function messageDebugInfo(message) {
  return {
    type: message?.type || "",
    code: messageCode4(message),
    channelPubkey: message?.channelPubkey || "",
    senderPubkey: message?.event?.pubkey || "",
    eventId: message?.event?.id || "",
    outerId: message?.outer?.id || "",
    outerCreatedAt: message?.outer?.created_at || message?.event?.created_at || 0
  };
}
function createSyncController({
  MessengerClass = PrivateMessenger,
  _store = accounts_store_exports,
  _secrets = secrets_exports,
  _trustedSigners = trusted_signers_exports,
  _deviceRelays = device_relays_exports,
  _contentKeys = content_keys_exports,
  _trustedSignerSync = trusted_signers_exports2,
  _revocationRotation = revocation_rotation_exports,
  _createNostrDbSyncController = createNostrDbSyncController,
  _claimSigner = claimSigner,
  _subscribeRelayListUpdates = subscribeRelayListUpdates,
  _hasPendingMutation = hasPendingMutation,
  _subscribePendingMutations = subscribePendingMutations,
  _setTimeout = globalThis.setTimeout.bind(globalThis),
  _clearTimeout = globalThis.clearTimeout.bind(globalThis),
  _setInterval = globalThis.setInterval.bind(globalThis),
  _clearInterval = globalThis.clearInterval.bind(globalThis),
  _debug,
  onError = defaultOnError
} = {}) {
  let initialized = false;
  let messenger = null;
  let trustedByPubkey = /* @__PURE__ */ new Map();
  let refreshPromise = null;
  let drainQueued = false;
  let drainScheduled = false;
  let draining = false;
  let announceTimer = null;
  let announceInterval = null;
  let pendingResetInterval = false;
  let lastStoreIdentityKey = "";
  let stopRelayListWatcher = null;
  let relayListWatcherKey = "";
  let relayListRevision = 0;
  let refreshQueued = false;
  let lifecycleId = 0;
  const pendingAnnounceOwners = /* @__PURE__ */ new Set();
  const unsubscribers = [];
  const channelPubkeyByOwnerPubkey = /* @__PURE__ */ new Map();
  const ownerPubkeyByChannelPubkey = /* @__PURE__ */ new Map();
  const signerChannelPubkeyByPeerPubkey = /* @__PURE__ */ new Map();
  const readRelaysByOwnerPubkey = /* @__PURE__ */ new Map();
  const knownOwnerPubkeys = /* @__PURE__ */ new Set();
  const readyOwnerPubkeys = /* @__PURE__ */ new Set();
  const channelBuildFailuresByOwner = /* @__PURE__ */ new Map();
  let devicePubkey = "";
  const debug = _debug === void 0 ? defaultDebugSink() : _debug;
  const nostrDbSync = _createNostrDbSyncController({
    _setTimeout,
    _clearTimeout,
    onError
  });
  function emitDebug3(action, detail = {}) {
    try {
      debug?.({ source: "sync", action, ...detail });
    } catch (err) {
      onError(err);
    }
  }
  function assertPublished2(result) {
    if (!result?.delivery) return result;
    const reports = result.delivery.reports;
    if (!Array.isArray(reports) || !reports.length || reports.some((report) => report?.success !== true)) {
      throw new Error("SYNC_PUBLICATION_FAILED");
    }
    return result;
  }
  function isCurrentLifecycle(id) {
    return initialized && id === lifecycleId;
  }
  async function accountReadRelays(ownerPubkey, signer) {
    const relays = readRelaysByOwnerPubkey.has(ownerPubkey) ? { read: readRelaysByOwnerPubkey.get(ownerPubkey) } : await signer.getRelays?.();
    const readRelays = syncWatchRelays(relays?.read);
    if (!readRelays.length) throw new Error("SYNC_READ_RELAYS_REQUIRED");
    return readRelays;
  }
  function trustedPubkeys2() {
    return [...trustedByPubkey.keys()];
  }
  function trustedRecords() {
    return typeof _trustedSigners.listRecords === "function" ? _trustedSigners.listRecords() : _trustedSigners.list();
  }
  function removedReminderRecords() {
    return typeof _trustedSigners.listRemovedForReminder === "function" ? _trustedSigners.listRemovedForReminder() : [];
  }
  function channelPubkeyForOwner(ownerPubkey) {
    return channelPubkeyByOwnerPubkey.get(ownerPubkey) || "";
  }
  function ownerPubkeyForChannel(channelPubkey) {
    return ownerPubkeyByChannelPubkey.get(channelPubkey) || "";
  }
  async function resolveDeviceSyncRelays(pubkey) {
    if (typeof window === "undefined" && _deviceRelays === device_relays_exports) {
      return _deviceRelays.relaysFromEventOrFallback(null);
    }
    return _deviceRelays.resolveDeviceRelays(pubkey);
  }
  function signerSyncPeers() {
    const byPubkey = /* @__PURE__ */ new Map();
    for (const signer of _trustedSigners.list()) {
      if (signer.pubkey) byPubkey.set(signer.pubkey, signer);
    }
    for (const record of removedReminderRecords()) {
      if (record.pubkey && !byPubkey.has(record.pubkey)) byPubkey.set(record.pubkey, record);
    }
    return [...byPubkey.values()];
  }
  function reportChannelBuildFailure(ownerPubkey, stage, cause) {
    const detail = cause?.message ?? String(cause);
    const err = new Error(`SYNC_CHANNEL_BUILD_FAILED owner=${ownerPubkey} stage=${stage} cause=${detail}`);
    err.code = "SYNC_CHANNEL_BUILD_FAILED";
    err.ownerPubkey = ownerPubkey;
    err.stage = stage;
    err.cause = cause;
    onError(err);
    emitDebug3("channel-build-failed", { ownerPubkey, stage, cause: detail });
    return err;
  }
  function replaceMap(target, source) {
    target.clear();
    for (const [key, value] of source) target.set(key, value);
  }
  function replaceSet(target, source) {
    target.clear();
    for (const value of source) target.add(value);
  }
  function publishChannelSnapshot(snapshot) {
    replaceMap(channelPubkeyByOwnerPubkey, snapshot.channelPubkeyByOwnerPubkey);
    replaceMap(ownerPubkeyByChannelPubkey, snapshot.ownerPubkeyByChannelPubkey);
    replaceMap(signerChannelPubkeyByPeerPubkey, snapshot.signerChannelPubkeyByPeerPubkey);
    if (snapshot.relayListRevision === relayListRevision) {
      replaceMap(readRelaysByOwnerPubkey, snapshot.readRelaysByOwnerPubkey);
    }
    replaceMap(channelBuildFailuresByOwner, snapshot.channelBuildFailuresByOwner);
    replaceSet(knownOwnerPubkeys, snapshot.knownOwnerPubkeys);
    replaceSet(readyOwnerPubkeys, snapshot.readyOwnerPubkeys);
    devicePubkey = snapshot.devicePubkey;
  }
  async function buildChannels(deviceSigner) {
    const snapshotRelayListRevision = relayListRevision;
    const seeders = trustedPubkeys2();
    const channels = [];
    const nextChannelPubkeyByOwnerPubkey = /* @__PURE__ */ new Map();
    const nextOwnerPubkeyByChannelPubkey = /* @__PURE__ */ new Map();
    const nextSignerChannelPubkeyByPeerPubkey = /* @__PURE__ */ new Map();
    const nextOwnerPubkeys = /* @__PURE__ */ new Set();
    const nextReadyOwnerPubkeys = /* @__PURE__ */ new Set();
    const nextReadRelaysByOwnerPubkey = /* @__PURE__ */ new Map();
    const nextChannelBuildFailuresByOwner = /* @__PURE__ */ new Map();
    for (const account of filterVisibleAccounts(_store.list())) {
      if (account.type !== "nsec") continue;
      nextOwnerPubkeys.add(account.pubkey);
      if (readRelaysByOwnerPubkey.has(account.pubkey)) {
        nextReadRelaysByOwnerPubkey.set(account.pubkey, readRelaysByOwnerPubkey.get(account.pubkey));
      }
      let accountSigner;
      try {
        accountSigner = _claimSigner(account);
      } catch (err) {
        nextChannelBuildFailuresByOwner.set(account.pubkey, reportChannelBuildFailure(account.pubkey, "claim-signer", err));
        continue;
      }
      let channelSigner;
      let channelPubkey;
      try {
        channelSigner = accountSigner.withSharedKey(account.pubkey, TRUSTED_SIGNER_SYNC_INFO2);
        channelPubkey = await channelSigner.getPublicKey();
        if (!channelPubkey) throw new Error("CHANNEL_PUBKEY_REQUIRED");
      } catch (err) {
        nextChannelBuildFailuresByOwner.set(account.pubkey, reportChannelBuildFailure(account.pubkey, "derive-channel-pubkey", err));
        continue;
      }
      let relays;
      try {
        relays = await accountReadRelays(account.pubkey, accountSigner);
      } catch (err) {
        nextChannelBuildFailuresByOwner.set(account.pubkey, reportChannelBuildFailure(account.pubkey, "resolve-read-relays", err));
        continue;
      }
      nextReadRelaysByOwnerPubkey.set(account.pubkey, relays);
      nextChannelPubkeyByOwnerPubkey.set(account.pubkey, channelPubkey);
      nextOwnerPubkeyByChannelPubkey.set(channelPubkey, account.pubkey);
      nextReadyOwnerPubkeys.add(account.pubkey);
      channels.push({
        pubkey: channelPubkey,
        signer: channelSigner,
        relays,
        sendRelays: syncRelays(relays),
        mode: "seeder",
        seeders
      });
    }
    let nextDevicePubkey = "";
    try {
      nextDevicePubkey = await deviceSigner.getPublicKey();
      const localDeviceRelays = await resolveDeviceSyncRelays(nextDevicePubkey);
      for (const peer of signerSyncPeers()) {
        if (!peer.pubkey || peer.pubkey === nextDevicePubkey) continue;
        const channelSigner = deviceSigner.withSharedKey(peer.pubkey, _trustedSignerSync.TRUSTED_SIGNER_SYNC_INFO);
        const channelPubkey = await channelSigner.getPublicKey();
        const peerRelays = await resolveDeviceSyncRelays(peer.pubkey);
        nextSignerChannelPubkeyByPeerPubkey.set(peer.pubkey, channelPubkey);
        channels.push({
          pubkey: channelPubkey,
          signer: channelSigner,
          relays: syncWatchRelays(localDeviceRelays),
          sendRelays: syncRelays(peerRelays),
          mode: "seeder",
          seeders: [peer.pubkey]
        });
      }
    } catch (err) {
      onError(err);
    }
    return {
      channels,
      devicePubkey: nextDevicePubkey,
      channelPubkeyByOwnerPubkey: nextChannelPubkeyByOwnerPubkey,
      ownerPubkeyByChannelPubkey: nextOwnerPubkeyByChannelPubkey,
      signerChannelPubkeyByPeerPubkey: nextSignerChannelPubkeyByPeerPubkey,
      readRelaysByOwnerPubkey: nextReadRelaysByOwnerPubkey,
      knownOwnerPubkeys: nextOwnerPubkeys,
      readyOwnerPubkeys: nextReadyOwnerPubkeys,
      channelBuildFailuresByOwner: nextChannelBuildFailuresByOwner,
      relayListRevision: snapshotRelayListRevision
    };
  }
  function clearRelayListWatcher() {
    stopRelayListWatcher?.();
    stopRelayListWatcher = null;
    relayListWatcherKey = "";
  }
  function relayListWatcherPubkeys() {
    return [...knownOwnerPubkeys];
  }
  function ensureRelayListWatcher() {
    const pubkeys = relayListWatcherPubkeys();
    const key = [...pubkeys].sort().join(",");
    if (!key) {
      clearRelayListWatcher();
      return;
    }
    if (stopRelayListWatcher && relayListWatcherKey === key) return;
    clearRelayListWatcher();
    if (typeof window === "undefined" && _subscribeRelayListUpdates === subscribeRelayListUpdates) return;
    relayListWatcherKey = key;
    try {
      stopRelayListWatcher = _subscribeRelayListUpdates(pubkeys, {
        relayType: "read",
        onChange: onAccountRelayListChange
      });
    } catch (err) {
      clearRelayListWatcher();
      onError(err);
    }
  }
  function onAccountRelayListChange(update) {
    if (!knownOwnerPubkeys.has(update.pubkey)) return;
    const relays = syncWatchRelays(update.relays?.read);
    const previous = readRelaysByOwnerPubkey.get(update.pubkey) || [];
    if (previous.length === relays.length && previous.every((relay) => relays.includes(relay))) return;
    relayListRevision += 1;
    readRelaysByOwnerPubkey.set(update.pubkey, relays);
    emitDebug3("relay-list", {
      ownerPubkey: update.pubkey,
      relays,
      relayCount: relays.length
    });
    refresh2();
  }
  function scheduleDrain() {
    if (!initialized) return;
    const id = lifecycleId;
    drainQueued = true;
    if (draining || drainScheduled) return;
    drainScheduled = true;
    Promise.resolve().then(() => drainMessages(id));
  }
  async function drainMessages(id = lifecycleId) {
    drainScheduled = false;
    if (!isCurrentLifecycle(id)) return;
    if (draining) return;
    draining = true;
    try {
      while (drainQueued && isCurrentLifecycle(id)) {
        drainQueued = false;
        let handled = 0;
        emitDebug3("drain", { phase: "start" });
        let reachedEmptyQueue = false;
        while (isCurrentLifecycle(id) && messenger && _secrets.isUnlocked()) {
          const message = await messenger.nextMessage?.();
          if (!message) {
            reachedEmptyQueue = true;
            break;
          }
          handled += 1;
          emitDebug3("handle", messageDebugInfo(message));
          try {
            const handled2 = await _contentKeys.handleMessage(message, {
              messenger,
              trustedByPubkey,
              ownerPubkeyForChannel,
              debug
            });
            if (!handled2) {
              const handledTrustedSigners = await _trustedSignerSync.handleMessage(message, {
                messenger,
                trustedByPubkey,
                devicePubkey,
                trustedSigners: _trustedSigners,
                debug
              });
              if (!handledTrustedSigners) {
                await nostrDbSync.handleMessage(message, {
                  messenger,
                  trustedByPubkey,
                  ownerPubkeyForChannel,
                  channelPubkeyForOwner,
                  ownerPubkeys: new Set(nostrDbOwnerPubkeys(_store)),
                  debug
                });
              }
            }
          } catch (err) {
            onError(err);
          }
        }
        if (reachedEmptyQueue) drainQueued = false;
        emitDebug3("drain", { phase: "end", handled });
      }
    } catch (err) {
      onError(err);
    } finally {
      draining = false;
      if (isCurrentLifecycle(id) && drainQueued) scheduleDrain();
      else if (!isCurrentLifecycle(id) && initialized && drainQueued) scheduleDrain();
    }
  }
  function clearAnnouncementTimers({ clearPending = true } = {}) {
    if (announceTimer) _clearTimeout(announceTimer);
    if (announceInterval) _clearInterval(announceInterval);
    announceTimer = null;
    announceInterval = null;
    pendingResetInterval = false;
    if (clearPending) pendingAnnounceOwners.clear();
  }
  function ensureAnnouncementInterval() {
    if (announceInterval) return;
    const id = lifecycleId;
    announceInterval = _setInterval(() => {
      if (isCurrentLifecycle(id)) scheduleAnnounceAll2();
    }, ANNOUNCE_INTERVAL_MS);
    announceInterval?.unref?.();
  }
  function resetAnnouncementInterval() {
    if (announceInterval) _clearInterval(announceInterval);
    announceInterval = null;
    if (messenger && _secrets.isUnlocked()) ensureAnnouncementInterval();
  }
  async function flushAnnouncements(id = lifecycleId) {
    if (!isCurrentLifecycle(id)) return;
    announceTimer = null;
    const resetInterval = pendingResetInterval;
    pendingResetInterval = false;
    const currentRefresh = refreshPromise;
    if (currentRefresh) await currentRefresh;
    if (!isCurrentLifecycle(id)) return;
    if (!messenger || !_secrets.isUnlocked()) {
      return;
    }
    const currentMessenger = messenger;
    const receivers = trustedPubkeys2();
    const peerChannels = new Map(signerChannelPubkeyByPeerPubkey);
    const ownerChannels = new Map(channelPubkeyByOwnerPubkey);
    const readyOwners = new Set(readyOwnerPubkeys);
    const hasSignerSyncTargets = peerChannels.size > 0;
    if (!receivers.length && !hasSignerSyncTargets) {
      pendingAnnounceOwners.clear();
      return;
    }
    const owners = pendingAnnounceOwners.has(ANNOUNCE_ALL) ? nsecOwnerPubkeys(_store) : [...pendingAnnounceOwners];
    pendingAnnounceOwners.clear();
    if (receivers.length) {
      for (const ownerPubkey of owners) {
        if (!isCurrentLifecycle(id)) return;
        const channelPubkey = ownerChannels.get(ownerPubkey);
        if (!readyOwners.has(ownerPubkey) || !channelPubkey) {
          pendingAnnounceOwners.add(ownerPubkey);
          emitDebug3("announce-deferred", {
            ownerPubkey,
            reason: channelBuildFailuresByOwner.has(ownerPubkey) ? "channel-build-failed" : "channel-not-ready"
          });
          continue;
        }
        try {
          assertPublished2(await _contentKeys.announceContentKeys({
            messenger: currentMessenger,
            channelPubkey,
            ownerPubkey,
            receiverPubkeys: receivers,
            debug
          }));
          if (HEX326.test(ownerPubkey)) {
            assertPublished2(await nostrDbSync.announceRange({
              messenger: currentMessenger,
              channelPubkey,
              ownerPubkey,
              receiverPubkeys: receivers,
              debug
            }));
          }
        } catch (err) {
          pendingAnnounceOwners.add(ownerPubkey);
          onError(err);
        }
      }
    }
    try {
      await _trustedSignerSync.announceTrustedSignerState({
        messenger: currentMessenger,
        peerChannels,
        records: trustedRecords(),
        activePeerPubkeys: receivers,
        reminderRecords: removedReminderRecords(),
        debug
      });
    } catch (err) {
      pendingAnnounceOwners.add(ANNOUNCE_ALL);
      onError(err);
    }
    if (resetInterval && isCurrentLifecycle(id)) resetAnnouncementInterval();
  }
  function scheduleAnnounce2(ownerPubkey, { immediate = false, resetInterval = false } = {}) {
    if (!initialized) return;
    const id = lifecycleId;
    if (ownerPubkey) pendingAnnounceOwners.add(ownerPubkey);
    else pendingAnnounceOwners.add(ANNOUNCE_ALL);
    pendingResetInterval = pendingResetInterval || resetInterval;
    if (announceTimer && !immediate) return;
    if (announceTimer) _clearTimeout(announceTimer);
    announceTimer = _setTimeout(() => flushAnnouncements(id), immediate ? 0 : ANNOUNCE_DEBOUNCE_MS);
    announceTimer?.unref?.();
  }
  function scheduleAnnounceAll2(options) {
    scheduleAnnounce2("", options);
  }
  function onContentKeyChange(ownerPubkey) {
    if (!_secrets.isUnlocked()) return;
    if (!messenger) refresh2();
    scheduleAnnounce2(ownerPubkey, { immediate: true, resetInterval: true });
  }
  function nostrDbRuntimeContext() {
    return {
      messenger,
      trustedByPubkey,
      channelPubkeyForOwner,
      ownerPubkeyForChannel,
      ownerPubkeys: new Set(nostrDbOwnerPubkeys(_store)),
      readyOwnerPubkeys: new Set([...readyOwnerPubkeys].filter((pubkey) => HEX326.test(pubkey))),
      debug
    };
  }
  function requestNostrDbAppBackfill2({ ownerPubkey, appId } = {}) {
    const owner = typeof ownerPubkey === "string" ? ownerPubkey.toLowerCase() : "";
    const app = typeof appId === "string" ? appId : "";
    if (!HEX326.test(owner) || !app || app.length > APP_ID_MAX_LENGTH2 || !nostrDbOwnerPubkeys(_store).includes(owner)) return false;
    const context = nostrDbRuntimeContext();
    if (_secrets.isUnlocked() && !context.trustedByPubkey.size) {
      context.trustedByPubkey = trustedMap(_trustedSigners.list());
    }
    context.deferAppBackfillPeerResolution = !_secrets.isUnlocked();
    const accepted = nostrDbSync.requestAppBackfill({ ownerPubkey: owner, appId: app }, context);
    if (accepted && initialized && _secrets.isUnlocked() && !readyOwnerPubkeys.has(owner)) {
      refresh2().catch(onError);
    }
    return accepted || _secrets.isUnlocked();
  }
  async function scheduleRotationsForRemovedRecords(records = []) {
    if (!records.length || !_secrets.isUnlocked()) return;
    let localActorPubkey = devicePubkey;
    if (!localActorPubkey && typeof _secrets.getDeviceSignerPubkey === "function") {
      localActorPubkey = await _secrets.getDeviceSignerPubkey().catch(() => "");
    }
    for (const record of records) {
      if (!record?.pubkey || record.pubkey === localActorPubkey) continue;
      await _revocationRotation.scheduleRevocationRotationsForRemovedSigner({
        removedSignerPubkey: record.pubkey,
        removalUpdatedAt: record.updatedAt,
        actorPubkey: record.actorPubkey,
        localActorPubkey
      });
    }
    await _revocationRotation.runDueRevocationRotations?.();
    await _revocationRotation.startRevocationRotation?.();
  }
  function onTrustedSignerChange(detail = {}) {
    if (detail.action !== "clear-active") {
      Promise.resolve(scheduleRotationsForRemovedRecords(detail.removedRecords || [])).catch(onError);
    }
    const promise = refresh2().then(() => {
      if (initialized && _secrets.isUnlocked()) {
        scheduleAnnounceAll2({ immediate: true, resetInterval: true });
      }
    });
    return promise;
  }
  function stop2() {
    const currentMessenger = messenger;
    messenger = null;
    drainQueued = false;
    drainScheduled = false;
    clearRelayListWatcher();
    channelPubkeyByOwnerPubkey.clear();
    ownerPubkeyByChannelPubkey.clear();
    signerChannelPubkeyByPeerPubkey.clear();
    readRelaysByOwnerPubkey.clear();
    relayListRevision += 1;
    knownOwnerPubkeys.clear();
    readyOwnerPubkeys.clear();
    channelBuildFailuresByOwner.clear();
    devicePubkey = "";
    clearAnnouncementTimers();
    nostrDbSync.stop();
    _contentKeys.resetDebugSources?.();
    return Promise.resolve(currentMessenger?.close?.()).catch(onError);
  }
  async function refreshNow(id = lifecycleId) {
    if (!isCurrentLifecycle(id)) return null;
    if (!_secrets.isUnlocked()) {
      await stop2();
      return null;
    }
    const userSigner = await _secrets.getDeviceSigner();
    if (!isCurrentLifecycle(id)) return null;
    devicePubkey = await userSigner.getPublicKey();
    await _trustedSigners.forgetLocal?.(devicePubkey);
    trustedByPubkey = trustedMap(_trustedSigners.list());
    const snapshot = await buildChannels(userSigner);
    if (!isCurrentLifecycle(id)) return null;
    if (!snapshot.channels.length) {
      const currentMessenger = messenger;
      messenger = null;
      clearAnnouncementTimers({ clearPending: false });
      await Promise.resolve(currentMessenger?.close?.()).catch(onError);
      if (!isCurrentLifecycle(id)) return null;
      publishChannelSnapshot(snapshot);
      ensureRelayListWatcher();
      nostrDbSync.ensureSubscriptions(nostrDbRuntimeContext());
      return null;
    }
    const options = {
      userSigner,
      contentKeySigner: null,
      channels: snapshot.channels,
      relays: [],
      mode: "seeder"
    };
    if (!messenger) {
      const nextMessenger = new MessengerClass({ onMessageQueued: scheduleDrain, onError, useContentKeys: false, onDebug: debug });
      messenger = nextMessenger;
      try {
        await nextMessenger.init(options);
      } catch (err) {
        if (messenger === nextMessenger) messenger = null;
        await Promise.resolve(nextMessenger.close?.()).catch(onError);
        throw err;
      }
      if (!isCurrentLifecycle(id)) {
        if (messenger === nextMessenger) {
          messenger = null;
          await nextMessenger.close?.();
        }
        return null;
      }
    } else {
      const currentMessenger = messenger;
      await currentMessenger.update(options);
      if (!isCurrentLifecycle(id) || messenger !== currentMessenger) return null;
    }
    publishChannelSnapshot(snapshot);
    ensureRelayListWatcher();
    nostrDbSync.ensureSubscriptions(nostrDbRuntimeContext());
    ensureAnnouncementInterval();
    scheduleAnnounceAll2();
    scheduleDrain();
    return messenger;
  }
  function refresh2() {
    if (refreshPromise) {
      refreshQueued = true;
      return refreshPromise;
    }
    const id = lifecycleId;
    const promise = Promise.resolve().then(async () => {
      let result = null;
      do {
        refreshQueued = false;
        result = await refreshNow(id);
      } while (refreshQueued && isCurrentLifecycle(id));
      return result;
    }).catch((err) => {
      onError(err);
      return null;
    }).finally(() => {
      if (refreshPromise === promise) refreshPromise = null;
    });
    refreshPromise = promise;
    return refreshPromise;
  }
  function refreshOnStoreIdentityChange() {
    if (_hasPendingMutation()) return null;
    const nextKey = syncAccountIdentityKey(_store);
    if (nextKey === lastStoreIdentityKey) return null;
    lastStoreIdentityKey = nextKey;
    return refresh2();
  }
  function refreshAfterAccountMutation() {
    if (!initialized || _hasPendingMutation()) return null;
    if (refreshPromise) {
      return refreshPromise.then(() => {
        if (!initialized || _hasPendingMutation()) return null;
        return refreshOnStoreIdentityChange();
      });
    }
    return refreshOnStoreIdentityChange();
  }
  function onSecretsChange() {
    if (!initialized) return null;
    if (!_secrets.isUnlocked()) {
      lifecycleId += 1;
      refreshPromise = null;
      refreshQueued = false;
      return stop2();
    }
    if (_hasPendingMutation()) return null;
    return refresh2();
  }
  function init2() {
    if (initialized) return refresh2();
    PrivateMessenger.maintainStorage().catch(onError);
    initialized = true;
    lifecycleId += 1;
    lastStoreIdentityKey = syncAccountIdentityKey(_store);
    unsubscribers.push(_secrets.subscribe(onSecretsChange));
    if (_secrets.subscribeContentKeys) unsubscribers.push(_secrets.subscribeContentKeys(onContentKeyChange));
    unsubscribers.push(_store.subscribe(refreshOnStoreIdentityChange));
    unsubscribers.push(_subscribePendingMutations(refreshAfterAccountMutation));
    unsubscribers.push(_trustedSigners.subscribe(onTrustedSignerChange));
    return refresh2();
  }
  function close2() {
    lifecycleId += 1;
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
    initialized = false;
    refreshPromise = null;
    refreshQueued = false;
    return stop2();
  }
  return {
    init: init2,
    refresh: refresh2,
    refreshNow,
    stop: stop2,
    close: close2,
    scheduleAnnounce: scheduleAnnounce2,
    scheduleAnnounceAll: scheduleAnnounceAll2,
    get messenger() {
      return messenger;
    },
    get trustedByPubkey() {
      return trustedByPubkey;
    },
    getDebugSnapshot: _contentKeys.getDebugSnapshot,
    subscribeDebug: _contentKeys.subscribeDebug,
    generateAndPublishContentKey: (ownerPubkey, options = {}) => _contentKeys.generateAndPublishContentKey({
      ownerPubkey,
      ...options
    }),
    requestNostrDbAppBackfill: requestNostrDbAppBackfill2
  };
}
var controller = createSyncController();
var init = controller.init;
var refresh = controller.refresh;
var stop = controller.stop;
var close = controller.close;
var scheduleAnnounce = controller.scheduleAnnounce;
var scheduleAnnounceAll = controller.scheduleAnnounceAll;
var getDebugSnapshot2 = controller.getDebugSnapshot;
var subscribeDebug2 = controller.subscribeDebug;
var generateAndPublishContentKey2 = controller.generateAndPublishContentKey;
var requestNostrDbAppBackfill = controller.requestNostrDbAppBackfill;

export {
  serializeError,
  ask,
  reply,
  tell,
  connect,
  disconnect,
  startDeviceRelayListRefresh,
  startRevocationRotation,
  init,
  getDebugSnapshot2 as getDebugSnapshot,
  subscribeDebug2 as subscribeDebug,
  generateAndPublishContentKey2 as generateAndPublishContentKey,
  requestNostrDbAppBackfill
};
