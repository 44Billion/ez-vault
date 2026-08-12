import {
  appendMessengerLog,
  isUnlocked,
  listMessengerLogs,
  removeMessengerLogsForPubkey,
  updateMessengerLogAppMetadata,
  vaultDecrypt,
  vaultEncrypt
} from "./chunk-D6BLQV4I.js";

// src/services/messenger-log/index.js
var MAX_ENTRIES_PER_APP = 500;
var MAX_LOG_BYTES = 64 * 1024 * 1024;
var PAGE_SIZE = 100;
var listeners = /* @__PURE__ */ new Set();
var propagatedAppMetadata = /* @__PURE__ */ new Map();
function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.warn("messenger-log listener threw", err);
    }
  }
}
function appKey(entry) {
  const id = String(entry?.app?.id || "").trim();
  return id ? `app:${id}` : "launcher";
}
function inflate(entry) {
  const publicEntry = { ...entry };
  delete publicEntry.appKey;
  delete publicEntry.byteSize;
  if (!publicEntry.sealed) return publicEntry;
  if (!isUnlocked()) return publicEntry;
  try {
    const { sealed, ...rest } = publicEntry;
    const opened = JSON.parse(vaultDecrypt(sealed));
    return { ...rest, ...opened };
  } catch (err) {
    console.warn("messenger-log decrypt failed", err?.message ?? err);
    return publicEntry;
  }
}
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
async function append(entry) {
  try {
    const { params, result, ...rest } = entry;
    const sealedFields = {};
    if (params !== void 0) sealedFields.params = params;
    if (result !== void 0) sealedFields.result = result;
    const stored = {
      ts: Math.floor(Date.now() / 1e3),
      ...rest,
      appKey: appKey(entry)
    };
    if (Object.keys(sealedFields).length && isUnlocked()) {
      stored.sealed = vaultEncrypt(JSON.stringify(sealedFields));
    }
    await appendMessengerLog(stored, {
      maxEntriesPerApp: MAX_ENTRIES_PER_APP,
      maxBytes: MAX_LOG_BYTES
    });
    const richApp = stored.app && (stored.app.name || stored.app.icon || stored.app.alias);
    if (richApp) {
      const cacheKey = JSON.stringify([stored.app.name, stored.app.icon, stored.app.alias]);
      if (propagatedAppMetadata.get(stored.appKey) !== cacheKey) {
        await updateMessengerLogAppMetadata(stored.appKey, stored.app);
        propagatedAppMetadata.set(stored.appKey, cacheKey);
      }
    }
    notify();
  } catch (err) {
    console.warn("messenger-log write failed", err?.message ?? err);
  }
}
async function list(options = {}) {
  return (await listMessengerLogs({ limit: PAGE_SIZE, ...options })).map(inflate);
}
async function removeForPubkey(pubkey) {
  try {
    if (await removeMessengerLogsForPubkey(pubkey)) notify();
  } catch (err) {
    console.warn("messenger-log removal failed", err?.message ?? err);
  }
}

export {
  subscribe,
  append,
  list,
  removeForPubkey
};
