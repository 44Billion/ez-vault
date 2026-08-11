import {
  __export
} from "./chunk-NZLE2WMY.js";

// node_modules/libp2r2p/error/index.js
var ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;
var ValidationError = class extends Error {
  constructor(code, messageOrOptions = code, causeOrOptions) {
    if (typeof code !== "string" || !ERROR_CODE.test(code)) {
      throw new TypeError("Validation error code should be uppercase snake case");
    }
    const objectOptions = messageOrOptions && typeof messageOrOptions === "object" ? messageOrOptions : null;
    const message = objectOptions === messageOrOptions ? objectOptions.message ?? code : messageOrOptions ?? code;
    const cause = objectOptions ? objectOptions.cause : causeOrOptions && typeof causeOrOptions === "object" && Object.hasOwn(causeOrOptions, "cause") ? causeOrOptions.cause : causeOrOptions;
    super(message, cause === void 0 ? void 0 : { cause });
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "ValidationError",
      writable: true
    });
    Object.defineProperty(this, "code", {
      configurable: false,
      enumerable: true,
      value: code,
      writable: false
    });
  }
};

// node_modules/libp2r2p/idb/index.js
var READ_METHODS = /* @__PURE__ */ new Set([
  "count",
  "get",
  "getAll",
  "getAllKeys",
  "getKey",
  "openCursor",
  "openKeyCursor"
]);
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
async function run(method, args = [], storeName, indexName, {
  db,
  p = deferred(),
  tx,
  txMode = tx?.mode,
  storeOrIndex
} = {}) {
  if (!tx) {
    if (!db) throw new ValidationError("IDB_DATABASE_REQUIRED");
    if (!storeName) throw new ValidationError("IDB_STORE_REQUIRED");
    txMode ??= READ_METHODS.has(method) ? "readonly" : "readwrite";
    tx = db.transaction([storeName], txMode);
  }
  if (!storeOrIndex) {
    if (!storeName) throw new ValidationError("IDB_STORE_REQUIRED");
    const store = tx.objectStore(storeName);
    storeOrIndex = indexName ? store.index(indexName) : store;
  }
  let request;
  try {
    request = storeOrIndex[method](...args);
  } catch (err) {
    p.reject(err);
    try {
      tx.abort();
    } catch {
    }
    return p.promise;
  }
  request.onsuccess = () => {
    p.resolve({ result: request.result, tx, storeOrIndex });
  };
  request.onerror = () => {
    p.reject(request.error || new Error("IDB_REQUEST_FAILED"));
    try {
      tx.abort();
    } catch {
    }
  };
  return p.promise;
}

// src/services/storage/index.js
var DATABASE_NAME = "ez-vault";
var DATABASE_VERSION = 1;
var ACCOUNTS_STORE = "accounts";
var STATE_STORE = "state";
var MESSENGER_LOG_STORE = "messengerLog";
var REVOCATION_ROTATIONS_STORE = "revocationRotations";
var NOSTRDB_SYNC_STORE = "nostrDbSync";
var LOG_USAGE_KEY = "messenger-log:usage";
var textEncoder = new TextEncoder();
var factory = null;
var dbPromise = null;
var readyPromise = null;
var database = null;
var mutationTail = Promise.resolve();
var accountCache = [];
var stateCache = /* @__PURE__ */ new Map();
var recordCaches = /* @__PURE__ */ new Map([
  [REVOCATION_ROTATIONS_STORE, []],
  [NOSTRDB_SYNC_STORE, []]
]);
function deferred2() {
  let resolve;
  let reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
}
function transactionDone(tx) {
  const pending = deferred2();
  tx.oncomplete = () => pending.resolve();
  tx.onabort = () => pending.reject(tx.error || new Error("IDB_TRANSACTION_ABORTED"));
  tx.onerror = () => pending.reject(tx.error || new Error("IDB_TRANSACTION_FAILED"));
  return pending.promise;
}
function clone(value) {
  return value === void 0 ? void 0 : structuredClone(value);
}
function openDatabase(indexedDB) {
  if (!indexedDB?.open) return Promise.reject(new Error("IDB_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error("IDB_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("IDB_DATABASE_BLOCKED"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ACCOUNTS_STORE)) {
        db.createObjectStore(ACCOUNTS_STORE, { keyPath: "pubkey" });
      }
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(REVOCATION_ROTATIONS_STORE)) {
        db.createObjectStore(REVOCATION_ROTATIONS_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(NOSTRDB_SYNC_STORE)) {
        db.createObjectStore(NOSTRDB_SYNC_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(MESSENGER_LOG_STORE)) {
        const log = db.createObjectStore(MESSENGER_LOG_STORE, { keyPath: "id", autoIncrement: true });
        log.createIndex("byApp", ["appKey", "id"]);
        log.createIndex("byPubkey", "pubkey");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
async function transaction(storeNames, mode, work) {
  const db = await ensureDatabase();
  const tx = db.transaction(storeNames, mode);
  const done = transactionDone(tx);
  try {
    const result = await work(tx);
    await done;
    return result;
  } catch (err) {
    try {
      tx.abort();
    } catch {
    }
    try {
      await done;
    } catch {
    }
    throw err;
  }
}
function ensureDatabase() {
  if (!dbPromise) {
    dbPromise = openDatabase(factory).then((db) => {
      database = db;
      return db;
    });
  }
  return dbPromise;
}
function enqueueMutation(operation) {
  const pending = mutationTail.then(operation);
  mutationTail = pending.catch(() => {
  });
  return pending;
}
function cleanAccountRecord(record) {
  if (!record?.pubkey) return null;
  const account = clone(record);
  delete account.__order;
  return account;
}
function initializeStorage({ indexedDB = globalThis.indexedDB } = {}) {
  if (readyPromise) {
    if (factory !== indexedDB) throw new Error("IDB_FACTORY_ALREADY_SELECTED");
    return readyPromise;
  }
  factory = indexedDB;
  readyPromise = (async () => {
    await ensureDatabase();
    const snapshot = await transaction([ACCOUNTS_STORE, STATE_STORE, REVOCATION_ROTATIONS_STORE, NOSTRDB_SYNC_STORE], "readonly", async (tx) => {
      const accounts = (await run("getAll", [], ACCOUNTS_STORE, null, { tx })).result;
      const state = (await run("getAll", [], STATE_STORE, null, { tx })).result;
      const revocations = (await run("getAll", [], REVOCATION_ROTATIONS_STORE, null, { tx })).result;
      const nostrDbSync = (await run("getAll", [], NOSTRDB_SYNC_STORE, null, { tx })).result;
      return { accounts, state, revocations, nostrDbSync };
    });
    accountCache = snapshot.accounts.sort((left, right) => (left.__order || 0) - (right.__order || 0)).map(cleanAccountRecord).filter(Boolean);
    stateCache.clear();
    for (const record of snapshot.state) stateCache.set(record.key, clone(record.value));
    recordCaches.set(REVOCATION_ROTATIONS_STORE, clone(snapshot.revocations));
    recordCaches.set(NOSTRDB_SYNC_STORE, clone(snapshot.nostrDbSync));
    return true;
  })();
  return readyPromise;
}
function listAccounts() {
  return clone(accountCache);
}
async function mutateAccounts(mutator) {
  if (typeof mutator !== "function") throw new TypeError("ACCOUNT_MUTATOR_REQUIRED");
  await initializeStorage();
  return enqueueMutation(async () => {
    const mutation = mutator(clone(accountCache)) || {};
    if (typeof mutation?.then === "function") throw new TypeError("ACCOUNT_MUTATOR_MUST_BE_SYNCHRONOUS");
    const next = (Array.isArray(mutation.accounts) ? mutation.accounts : []).map(cleanAccountRecord).filter(Boolean);
    await transaction([ACCOUNTS_STORE], "readwrite", async (tx) => {
      await run("clear", [], ACCOUNTS_STORE, null, { tx });
      for (let index = 0; index < next.length; index++) {
        await run("put", [{ ...next[index], __order: index }], ACCOUNTS_STORE, null, { tx });
      }
    });
    accountCache = clone(next);
    return mutation.result;
  });
}
function getState(key, fallback = null) {
  return stateCache.has(key) ? clone(stateCache.get(key)) : clone(fallback);
}
function hasState(key) {
  return stateCache.has(key);
}
async function updateState({ set = {}, remove: remove2 = [] } = {}) {
  const entries = Object.entries(set).map(([key, value]) => [String(key), clone(value)]);
  const removals = [...new Set(remove2.map(String))];
  await initializeStorage();
  return enqueueMutation(async () => {
    await transaction([STATE_STORE], "readwrite", async (tx) => {
      for (const key of removals) await run("delete", [key], STATE_STORE, null, { tx });
      for (const [key, value] of entries) await run("put", [{ key, value }], STATE_STORE, null, { tx });
    });
    for (const key of removals) stateCache.delete(key);
    for (const [key, value] of entries) stateCache.set(key, clone(value));
  });
}
function setState(key, value) {
  return updateState({ set: { [key]: value } });
}
function removeState(key) {
  return updateState({ remove: [key] });
}
function byteLength(record) {
  return textEncoder.encode(JSON.stringify(record)).byteLength;
}
function idRangeForApp(appKey) {
  const keyRange = globalThis.IDBKeyRange;
  if (!keyRange?.bound) throw new Error("IDB_KEY_RANGE_UNAVAILABLE");
  return keyRange.bound([appKey, 0], [appKey, Number.MAX_SAFE_INTEGER]);
}
async function readLogUsage(tx) {
  const record = (await run("get", [LOG_USAGE_KEY], STATE_STORE, null, { tx })).result;
  return Number.isSafeInteger(record?.value) && record.value >= 0 ? record.value : 0;
}
async function removeLogInTransaction(tx, id, usage) {
  const record = (await run("get", [id], MESSENGER_LOG_STORE, null, { tx })).result;
  if (!record) return usage;
  await run("delete", [id], MESSENGER_LOG_STORE, null, { tx });
  return Math.max(0, usage - (Number(record.byteSize) || byteLength(record)));
}
async function appendMessengerLog(entry, {
  maxEntriesPerApp = 500,
  maxBytes = 64 * 1024 * 1024
} = {}) {
  const prepared = clone(entry);
  prepared.byteSize = 0;
  while (true) {
    const nextSize = byteLength(prepared);
    if (nextSize === prepared.byteSize) break;
    prepared.byteSize = nextSize;
  }
  await initializeStorage();
  return enqueueMutation(async () => {
    return transaction([MESSENGER_LOG_STORE, STATE_STORE], "readwrite", async (tx) => {
      let usage = await readLogUsage(tx);
      const id = (await run("add", [prepared], MESSENGER_LOG_STORE, null, { tx })).result;
      usage += prepared.byteSize;
      const appKeys = (await run("getAllKeys", [idRangeForApp(prepared.appKey)], MESSENGER_LOG_STORE, "byApp", { tx })).result;
      const perAppExcess = Math.max(0, appKeys.length - maxEntriesPerApp);
      for (let index = 0; index < perAppExcess; index++) {
        usage = await removeLogInTransaction(tx, appKeys[index], usage);
      }
      while (usage > maxBytes) {
        const oldest = (await run("getAll", [void 0, 1], MESSENGER_LOG_STORE, null, { tx })).result[0];
        if (!oldest) break;
        usage = await removeLogInTransaction(tx, oldest.id, usage);
      }
      await run("put", [{ key: LOG_USAGE_KEY, value: usage }], STATE_STORE, null, { tx });
      return id;
    });
  });
}
function mergeLogAppMetadata(existing, incoming) {
  if (!incoming || typeof incoming !== "object") return existing;
  const merged = { ...existing && typeof existing === "object" ? existing : {} };
  let changed = false;
  for (const field of ["name", "icon", "alias"]) {
    if (incoming[field] && !merged[field]) {
      merged[field] = incoming[field];
      changed = true;
    }
  }
  return changed ? merged : existing;
}
async function updateMessengerLogAppMetadata(appKey, app) {
  await initializeStorage();
  return enqueueMutation(async () => {
    return transaction([MESSENGER_LOG_STORE, STATE_STORE], "readwrite", async (tx) => {
      let usage = await readLogUsage(tx);
      const keys = (await run("getAllKeys", [idRangeForApp(appKey)], MESSENGER_LOG_STORE, "byApp", { tx })).result;
      let updated = 0;
      for (const id of keys) {
        const record = (await run("get", [id], MESSENGER_LOG_STORE, null, { tx })).result;
        if (!record) continue;
        const patchedApp = mergeLogAppMetadata(record.app, app);
        if (patchedApp === record.app) continue;
        usage = Math.max(0, usage - (Number(record.byteSize) || byteLength(record)));
        record.app = patchedApp;
        record.byteSize = byteLength(record);
        usage += record.byteSize;
        await run("put", [record], MESSENGER_LOG_STORE, null, { tx });
        updated++;
      }
      if (updated > 0) {
        await run("put", [{ key: LOG_USAGE_KEY, value: usage }], STATE_STORE, null, { tx });
      }
      return updated;
    });
  });
}
function cursorPage(tx, { beforeId, limit }) {
  const store = tx.objectStore(MESSENGER_LOG_STORE);
  const range = Number.isSafeInteger(beforeId) && beforeId > 0 ? globalThis.IDBKeyRange.upperBound(beforeId, true) : null;
  return new Promise((resolve, reject) => {
    const records = [];
    const request = store.openCursor(range, "prev");
    request.onerror = () => reject(request.error || new Error("IDB_REQUEST_FAILED"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= limit) return resolve(records);
      records.push(cursor.value);
      cursor.continue();
    };
  });
}
async function listMessengerLogs({ beforeId, limit = 100 } = {}) {
  await initializeStorage();
  const pageSize = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
  return transaction([MESSENGER_LOG_STORE], "readonly", (tx) => cursorPage(tx, { beforeId, limit: pageSize }));
}
async function removeMessengerLogsForPubkey(pubkey) {
  if (!pubkey) return 0;
  await initializeStorage();
  return enqueueMutation(async () => {
    return transaction([MESSENGER_LOG_STORE, STATE_STORE], "readwrite", async (tx) => {
      let usage = await readLogUsage(tx);
      const keys = (await run("getAllKeys", [pubkey], MESSENGER_LOG_STORE, "byPubkey", { tx })).result;
      for (const id of keys) usage = await removeLogInTransaction(tx, id, usage);
      await run("put", [{ key: LOG_USAGE_KEY, value: usage }], STATE_STORE, null, { tx });
      return keys.length;
    });
  });
}
function readRecords(storeName) {
  if (storeName !== REVOCATION_ROTATIONS_STORE && storeName !== NOSTRDB_SYNC_STORE) throw new Error("IDB_STORE_UNSUPPORTED");
  return clone(recordCaches.get(storeName) || []);
}
async function replaceRecords(storeName, records) {
  if (storeName !== REVOCATION_ROTATIONS_STORE && storeName !== NOSTRDB_SYNC_STORE) throw new Error("IDB_STORE_UNSUPPORTED");
  const snapshot = clone(records || []);
  await initializeStorage();
  return enqueueMutation(async () => {
    await transaction([storeName], "readwrite", async (tx) => {
      await run("clear", [], storeName, null, { tx });
      for (const record of snapshot) await run("put", [record], storeName, null, { tx });
    });
    recordCaches.set(storeName, clone(snapshot));
  });
}
var REVOCATION_ROTATIONS = REVOCATION_ROTATIONS_STORE;
var NOSTRDB_SYNC = NOSTRDB_SYNC_STORE;
async function requestPersistentStorage() {
  try {
    return await globalThis.navigator?.storage?.persist?.() === true;
  } catch {
    return false;
  }
}

// src/services/accounts-store.js
var accounts_store_exports = {};
__export(accounts_store_exports, {
  add: () => add,
  applyRecords: () => applyRecords,
  get: () => get,
  list: () => list,
  remove: () => remove,
  replace: () => replace,
  subscribe: () => subscribe,
  update: () => update
});
var listeners = /* @__PURE__ */ new Set();
function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.warn("accounts-store listener threw", err);
    }
  }
}
async function mutate(fn) {
  const result = await mutateAccounts(fn);
  notify();
  return result;
}
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function list() {
  return listAccounts();
}
function get(pubkey) {
  return list().find((account) => account.pubkey === pubkey) || null;
}
async function add(account) {
  await mutate((all) => {
    if (all.some((existing) => existing.pubkey === account.pubkey)) throw new Error("ACCOUNT_EXISTS");
    all.unshift(account);
    return { accounts: all };
  });
}
async function replace(pubkey, account) {
  await mutate((all) => {
    const index = all.findIndex((existing) => existing.pubkey === pubkey);
    if (index === -1) throw new Error("ACCOUNT_NOT_FOUND");
    all[index] = account;
    return { accounts: all };
  });
}
async function update(pubkey, patch) {
  return mutate((all) => {
    const index = all.findIndex((account) => account.pubkey === pubkey);
    if (index === -1) return { accounts: all, result: false };
    all[index] = { ...all[index], ...patch };
    return { accounts: all, result: true };
  });
}
async function remove(pubkey) {
  return mutate((all) => {
    const next = all.filter((account) => account.pubkey !== pubkey);
    return { accounts: next, result: next.length !== all.length };
  });
}
async function applyRecords(affectedPubkeys, records) {
  const affected = new Set((affectedPubkeys || []).filter(Boolean));
  const nextRecords = Array.isArray(records) ? records : [];
  const byPubkey = new Map(nextRecords.filter((account) => account?.pubkey).map((account) => [account.pubkey, account]));
  const inserted = /* @__PURE__ */ new Set();
  await mutate((all) => {
    const next = [];
    for (const account of all) {
      if (!affected.has(account.pubkey)) {
        next.push(account);
        continue;
      }
      const replacement = byPubkey.get(account.pubkey);
      if (replacement) {
        next.push(replacement);
        inserted.add(account.pubkey);
      }
    }
    for (let index = nextRecords.length - 1; index >= 0; index--) {
      const record = nextRecords[index];
      if (!record?.pubkey || inserted.has(record.pubkey)) continue;
      next.unshift(record);
      inserted.add(record.pubkey);
    }
    return { accounts: next };
  });
}

// src/services/secrets.js
var secrets_exports = {};
__export(secrets_exports, {
  adoptBunkerHandle: () => adoptBunkerHandle,
  deleteSecret: () => deleteSecret,
  getBunkerHandle: () => getBunkerHandle,
  getContentKeySigner: () => getContentKeySigner,
  getDeviceSigner: () => getDeviceSigner,
  getDeviceSignerPubkey: () => getDeviceSignerPubkey,
  getLatestContentKeySigner: () => getLatestContentKeySigner,
  getNsecSigner: () => getNsecSigner,
  hasSecretRef: () => hasSecretRef,
  isUnlocked: () => isUnlocked,
  listContentKeys: () => listContentKeys,
  listSecretRefs: () => listSecretRefs,
  lock: () => lock,
  reload: () => reload,
  replaceContentKeySecret: () => replaceContentKeySecret,
  replyWithContentKeySecrets: () => replyWithContentKeySecrets,
  restoreContentKeySecrets: () => restoreContentKeySecrets,
  sealCurrentEntries: () => sealCurrentEntries,
  setContentKeySecret: () => setContentKeySecret,
  setNsecSecret: () => setNsecSecret,
  snapshotContentKeySecrets: () => snapshotContentKeySecrets,
  subscribe: () => subscribe3,
  subscribeContentKeys: () => subscribeContentKeys,
  transferBunkerSecret: () => transferBunkerSecret,
  unlock: () => unlock,
  vaultDecrypt: () => vaultDecrypt,
  vaultEncrypt: () => vaultEncrypt,
  withDeviceSignerSeckey: () => withDeviceSignerSeckey
});

// node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
function anumber(n, title = "") {
  if (typeof n !== "number") {
    const prefix = title && `"${title}" `;
    throw new TypeError(`${prefix}expected number, got ${typeof n}`);
  }
  if (!Number.isSafeInteger(n) || n < 0) {
    const prefix = title && `"${title}" `;
    throw new RangeError(`${prefix}expected integer >= 0, got ${n}`);
  }
}
function abytes(value, length, title = "") {
  const bytes = isBytes(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    const message = prefix + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes)
      throw new TypeError(message);
    throw new RangeError(message);
  }
  return value;
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new TypeError("Hash must wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
  if (h.outputLen < 1)
    throw new Error('"outputLen" must be >= 1');
  if (h.blockLen < 1)
    throw new Error('"blockLen" must be >= 1');
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "digestInto() output");
  const min = instance.outputLen;
  if (out.length < min) {
    throw new RangeError('"digestInto() output" expected to be of length >=' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  if (hasHexBuiltin) {
    try {
      return Uint8Array.fromHex(hex);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new RangeError(error.message);
      throw error;
    }
  }
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new TypeError("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad2 = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad2);
    pad2 += a.length;
  }
  return res;
}
function createHasher(hashCons, info = {}) {
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
function randomBytes(bytesLength = 32) {
  anumber(bytesLength, "bytesLength");
  const cr = typeof globalThis === "object" ? globalThis.crypto : null;
  if (typeof cr?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (bytesLength > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
  return cr.getRandomValues(new Uint8Array(bytesLength));
}
var oidNist = (suffix) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  canXOF = false;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE2) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE2;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE2 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE2);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen must be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE2);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to ||= new this.constructor();
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  constructor(outputLen) {
    super(64, outputLen, 8, false);
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.destroyed = true;
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = SHA256_IV[0] | 0;
  B = SHA256_IV[1] | 0;
  C = SHA256_IV[2] | 0;
  D = SHA256_IV[3] | 0;
  E = SHA256_IV[4] | 0;
  F = SHA256_IV[5] | 0;
  G = SHA256_IV[6] | 0;
  H = SHA256_IV[7] | 0;
  constructor() {
    super(32);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// node_modules/@noble/curves/utils.js
var abytes2 = (value, length, title) => abytes(value, length, title);
var anumber2 = anumber;
var bytesToHex2 = bytesToHex;
var concatBytes2 = (...arrays) => concatBytes(...arrays);
var hexToBytes2 = (hex) => hexToBytes(hex);
var isBytes2 = isBytes;
var randomBytes2 = (bytesLength) => randomBytes(bytesLength);
var _0n = /* @__PURE__ */ BigInt(0);
var _1n = /* @__PURE__ */ BigInt(1);
function abool(value, title = "") {
  if (typeof value !== "boolean") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected boolean, got type=" + typeof value);
  }
  return value;
}
function abignumber(n) {
  if (typeof n === "bigint") {
    if (!isPosBig(n))
      throw new RangeError("positive bigint expected, got " + n);
  } else
    anumber2(n);
  return n;
}
function asafenumber(value, title = "") {
  if (typeof value !== "number") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected number, got type=" + typeof value);
  }
  if (!Number.isSafeInteger(value)) {
    const prefix = title && `"${title}" `;
    throw new RangeError(prefix + "expected safe integer, got " + value);
  }
}
function numberToHexUnpadded(num2) {
  const hex = abignumber(num2).toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  return hexToNumber(bytesToHex(copyBytes(abytes(bytes)).reverse()));
}
function numberToBytesBE(n, len) {
  anumber(len);
  if (len === 0)
    throw new RangeError("zero length");
  n = abignumber(n);
  const hex = n.toString(16);
  if (hex.length > len * 2)
    throw new RangeError("number too large");
  return hexToBytes(hex.padStart(len * 2, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function copyBytes(bytes) {
  return Uint8Array.from(abytes2(bytes));
}
function asciiToBytes(ascii) {
  if (typeof ascii !== "string")
    throw new TypeError("ascii string expected, got " + typeof ascii);
  return Uint8Array.from(ascii, (c, i) => {
    const charCode = c.charCodeAt(0);
    if (c.length !== 1 || charCode > 127) {
      throw new RangeError(`string contains non-ASCII character "${ascii[i]}" with code ${charCode} at position ${i}`);
    }
    return charCode;
  });
}
var isPosBig = (n) => typeof n === "bigint" && _0n <= n;
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new RangeError("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  if (n < _0n)
    throw new Error("expected non-negative bigint, got " + n);
  let len;
  for (len = 0; n > _0n; n >>= _1n, len += 1)
    ;
  return len;
}
var bitMask = (n) => (_1n << BigInt(n)) - _1n;
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  anumber(hashLen, "hashLen");
  anumber(qByteLen, "qByteLen");
  if (typeof hmacFn !== "function")
    throw new TypeError("hmacFn must be a function");
  const u8n = (len) => new Uint8Array(len);
  const NULL = Uint8Array.of();
  const byte0 = Uint8Array.of(0);
  const byte1 = Uint8Array.of(1);
  const _maxDrbgIters = 1e3;
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i = 0;
  };
  const h = (...msgs) => hmacFn(k, concatBytes2(v, ...msgs));
  const reseed = (seed = NULL) => {
    k = h(byte0, seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(byte1, seed);
    v = h();
  };
  const gen = () => {
    if (i++ >= _maxDrbgIters)
      throw new Error("drbg: tried max amount of iterations");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes2(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while ((res = pred(gen())) === void 0)
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
function validateObject(object, fields = {}, optFields = {}) {
  if (Object.prototype.toString.call(object) !== "[object Object]")
    throw new TypeError("expected valid options object");
  function checkField(fieldName, expectedType, isOpt) {
    if (!isOpt && expectedType !== "function" && !Object.hasOwn(object, fieldName))
      throw new TypeError(`param "${fieldName}" is invalid: expected own property`);
    const val = object[fieldName];
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new TypeError(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
  }
  const iter = (f, isOpt) => Object.entries(f).forEach(([k, v]) => checkField(k, v, isOpt));
  iter(fields, false);
  iter(optFields, true);
}

// node_modules/@noble/curves/abstract/modular.js
var _0n2 = /* @__PURE__ */ BigInt(0);
var _1n2 = /* @__PURE__ */ BigInt(1);
var _2n = /* @__PURE__ */ BigInt(2);
var _3n = /* @__PURE__ */ BigInt(3);
var _4n = /* @__PURE__ */ BigInt(4);
var _5n = /* @__PURE__ */ BigInt(5);
var _7n = /* @__PURE__ */ BigInt(7);
var _8n = /* @__PURE__ */ BigInt(8);
var _9n = /* @__PURE__ */ BigInt(9);
var _16n = /* @__PURE__ */ BigInt(16);
function mod(a, b) {
  if (b <= _0n2)
    throw new Error("mod: expected positive modulus, got " + b);
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow2(x, power, modulo) {
  if (power < _0n2)
    throw new Error("pow2: expected non-negative exponent, got " + power);
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _0n2)
    throw new Error("invert: expected positive modulus, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, y = _1n2, u = _1n2, v = _0n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b - a * q;
    const m = x - u * q;
    const n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  const gcd2 = b;
  if (gcd2 !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function assertIsSquare(Fp, root, n) {
  const F = Fp;
  if (!F.eql(F.sqr(root), n))
    throw new Error("Cannot find square root");
}
function sqrt3mod4(Fp, n) {
  const F = Fp;
  const p1div4 = (F.ORDER + _1n2) / _4n;
  const root = F.pow(n, p1div4);
  assertIsSquare(F, root, n);
  return root;
}
function sqrt5mod8(Fp, n) {
  const F = Fp;
  const p5div8 = (F.ORDER - _5n) / _8n;
  const n2 = F.mul(n, _2n);
  const v = F.pow(n2, p5div8);
  const nv = F.mul(n, v);
  const i = F.mul(F.mul(nv, _2n), v);
  const root = F.mul(nv, F.sub(i, F.ONE));
  assertIsSquare(F, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return ((Fp, n) => {
    const F = Fp;
    let tv1 = F.pow(n, c4);
    let tv2 = F.mul(tv1, c1);
    const tv3 = F.mul(tv1, c2);
    const tv4 = F.mul(tv1, c3);
    const e1 = F.eql(F.sqr(tv2), n);
    const e2 = F.eql(F.sqr(tv3), n);
    tv1 = F.cmov(tv1, tv2, e1);
    tv2 = F.cmov(tv4, tv3, e2);
    const e3 = F.eql(F.sqr(tv2), n);
    const root = F.cmov(tv1, tv2, e3);
    assertIsSquare(F, root, n);
    return root;
  });
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp, n) {
    const F = Fp;
    if (F.is0(n))
      return n;
    if (FpLegendre(F, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = F.mul(F.ONE, cc);
    let t = F.pow(n, Q);
    let R = F.pow(n, Q1div2);
    while (!F.eql(t, F.ONE)) {
      if (F.is0(t))
        return F.ZERO;
      let i = 1;
      let t_tmp = F.sqr(t);
      while (!F.eql(t_tmp, F.ONE)) {
        i++;
        t_tmp = F.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = F.pow(c, exponent);
      M = i;
      c = F.sqr(b);
      t = F.mul(t, c);
      R = F.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P) {
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
var FIELD_FIELDS = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  };
  const opts = FIELD_FIELDS.reduce((map, val) => {
    map[val] = "function";
    return map;
  }, initial);
  validateObject(field, opts);
  asafenumber(field.BYTES, "BYTES");
  asafenumber(field.BITS, "BITS");
  if (field.BYTES < 1 || field.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (field.ORDER <= _1n2)
    throw new Error("invalid field: expected ORDER > 1, got " + field.ORDER);
  return field;
}
function FpPow(Fp, num2, power) {
  const F = Fp;
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return F.ONE;
  if (power === _1n2)
    return num2;
  let p = F.ONE;
  let d = num2;
  while (power > _0n2) {
    if (power & _1n2)
      p = F.mul(p, d);
    d = F.sqr(d);
    power >>= _1n2;
  }
  return p;
}
function FpInvertBatch(Fp, nums, passZero = false) {
  const F = Fp;
  const inverted = new Array(nums.length).fill(passZero ? F.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num2, i) => {
    if (F.is0(num2))
      return acc;
    inverted[i] = acc;
    return F.mul(acc, num2);
  }, F.ONE);
  const invertedAcc = F.inv(multipliedAcc);
  nums.reduceRight((acc, num2, i) => {
    if (F.is0(num2))
      return acc;
    inverted[i] = F.mul(acc, inverted[i]);
    return F.mul(acc, num2);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp, n) {
  const F = Fp;
  const p1mod2 = (F.ORDER - _1n2) / _2n;
  const powered = F.pow(n, p1mod2);
  const yes = F.eql(powered, F.ONE);
  const zero = F.eql(powered, F.ZERO);
  const no = F.eql(powered, F.neg(F.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber2(nBitLength);
  if (n <= _0n2)
    throw new Error("invalid n length: expected positive n, got " + n);
  if (nBitLength !== void 0 && nBitLength < 1)
    throw new Error("invalid n length: expected positive bit length, got " + nBitLength);
  const bits = bitLen(n);
  if (nBitLength !== void 0 && nBitLength < bits)
    throw new Error(`invalid n length: expected bit length (${bits}) >= n.length (${nBitLength})`);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : bits;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
var FIELD_SQRT = /* @__PURE__ */ new WeakMap();
var _Field = class {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = _0n2;
  ONE = _1n2;
  _lengths;
  _mod;
  constructor(ORDER, opts = {}) {
    if (ORDER <= _1n2)
      throw new Error("invalid field: expected ORDER > 1, got " + ORDER);
    let _nbitLength = void 0;
    this.isLE = false;
    if (opts != null && typeof opts === "object") {
      if (typeof opts.BITS === "number")
        _nbitLength = opts.BITS;
      if (typeof opts.sqrt === "function")
        Object.defineProperty(this, "sqrt", { value: opts.sqrt, enumerable: true });
      if (typeof opts.isLE === "boolean")
        this.isLE = opts.isLE;
      if (opts.allowedLengths)
        this._lengths = Object.freeze(opts.allowedLengths.slice());
      if (typeof opts.modFromBytes === "boolean")
        this._mod = opts.modFromBytes;
    }
    const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
    if (nByteLength > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = ORDER;
    this.BITS = nBitLength;
    this.BYTES = nByteLength;
    Object.freeze(this);
  }
  create(num2) {
    return mod(num2, this.ORDER);
  }
  isValid(num2) {
    if (typeof num2 !== "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof num2);
    return _0n2 <= num2 && num2 < this.ORDER;
  }
  is0(num2) {
    return num2 === _0n2;
  }
  // is valid and invertible
  isValidNot0(num2) {
    return !this.is0(num2) && this.isValid(num2);
  }
  isOdd(num2) {
    return (num2 & _1n2) === _1n2;
  }
  neg(num2) {
    return mod(-num2, this.ORDER);
  }
  eql(lhs, rhs) {
    return lhs === rhs;
  }
  sqr(num2) {
    return mod(num2 * num2, this.ORDER);
  }
  add(lhs, rhs) {
    return mod(lhs + rhs, this.ORDER);
  }
  sub(lhs, rhs) {
    return mod(lhs - rhs, this.ORDER);
  }
  mul(lhs, rhs) {
    return mod(lhs * rhs, this.ORDER);
  }
  pow(num2, power) {
    return FpPow(this, num2, power);
  }
  div(lhs, rhs) {
    return mod(lhs * invert(rhs, this.ORDER), this.ORDER);
  }
  // Same as above, but doesn't normalize
  sqrN(num2) {
    return num2 * num2;
  }
  addN(lhs, rhs) {
    return lhs + rhs;
  }
  subN(lhs, rhs) {
    return lhs - rhs;
  }
  mulN(lhs, rhs) {
    return lhs * rhs;
  }
  inv(num2) {
    return invert(num2, this.ORDER);
  }
  sqrt(num2) {
    let sqrt = FIELD_SQRT.get(this);
    if (!sqrt)
      FIELD_SQRT.set(this, sqrt = FpSqrt(this.ORDER));
    return sqrt(this, num2);
  }
  toBytes(num2) {
    return this.isLE ? numberToBytesLE(num2, this.BYTES) : numberToBytesBE(num2, this.BYTES);
  }
  fromBytes(bytes, skipValidation = false) {
    abytes2(bytes);
    const { _lengths: allowedLengths, BYTES, isLE: isLE2, ORDER, _mod: modFromBytes } = this;
    if (allowedLengths) {
      if (bytes.length < 1 || !allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
        throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
      }
      const padded = new Uint8Array(BYTES);
      padded.set(bytes, isLE2 ? 0 : padded.length - bytes.length);
      bytes = padded;
    }
    if (bytes.length !== BYTES)
      throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
    let scalar = isLE2 ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
    if (modFromBytes)
      scalar = mod(scalar, ORDER);
    if (!skipValidation) {
      if (!this.isValid(scalar))
        throw new Error("invalid field element: outside of range 0..ORDER");
    }
    return scalar;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(lst) {
    return FpInvertBatch(this, lst);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(a, b, condition) {
    abool(condition, "condition");
    return condition ? b : a;
  }
};
Object.freeze(_Field.prototype);
function Field(ORDER, opts = {}) {
  return new _Field(ORDER, opts);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  if (fieldOrder <= _1n2)
    throw new Error("field order must be greater than 1");
  const bitLength = bitLen(fieldOrder - _1n2);
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE2 = false) {
  abytes2(key);
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = Math.max(getMinHashLength(fieldOrder), 16);
  if (len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num2 = isLE2 ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod(num2, fieldOrder - _1n2) + _1n2;
  return isLE2 ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}

// node_modules/@noble/curves/abstract/curve.js
var _0n3 = /* @__PURE__ */ BigInt(0);
var _1n3 = /* @__PURE__ */ BigInt(1);
function negateCt(condition, item) {
  const neg = item.negate();
  return condition ? neg : item;
}
function normalizeZ(c, points) {
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits) {
  if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
    throw new Error("invalid window size, expected [1.." + bits + "], got W=" + W);
}
function calcWOpts(W, scalarBits) {
  validateW(W, scalarBits);
  const windows = Math.ceil(scalarBits / W) + 1;
  const windowSize = 2 ** (W - 1);
  const maxNumber = 2 ** W;
  const mask = bitMask(W);
  const shiftBy = BigInt(W);
  return { windows, windowSize, mask, maxNumber, shiftBy };
}
function calcOffsets(n, window2, wOpts) {
  const { windowSize, mask, maxNumber, shiftBy } = wOpts;
  let wbits = Number(n & mask);
  let nextN = n >> shiftBy;
  if (wbits > windowSize) {
    wbits -= maxNumber;
    nextN += _1n3;
  }
  const offsetStart = window2 * windowSize;
  const offset = offsetStart + Math.abs(wbits) - 1;
  const isZero = wbits === 0;
  const isNeg = wbits < 0;
  const isNegF = window2 % 2 !== 0;
  const offsetF = offsetStart;
  return { nextN, offset, isZero, isNeg, isNegF, offsetF };
}
var pointPrecomputes = /* @__PURE__ */ new WeakMap();
var pointWindowSizes = /* @__PURE__ */ new WeakMap();
function getW(P) {
  return pointWindowSizes.get(P) || 1;
}
function assert0(n) {
  if (n !== _0n3)
    throw new Error("invalid wNAF");
}
var wNAF = class {
  BASE;
  ZERO;
  Fn;
  bits;
  // Parametrized with a given Point class (not individual point)
  constructor(Point, bits) {
    this.BASE = Point.BASE;
    this.ZERO = Point.ZERO;
    this.Fn = Point.Fn;
    this.bits = bits;
  }
  // non-const time multiplication ladder
  _unsafeLadder(elm, n, p = this.ZERO) {
    let d = elm;
    while (n > _0n3) {
      if (n & _1n3)
        p = p.add(d);
      d = d.double();
      n >>= _1n3;
    }
    return p;
  }
  /**
   * Creates a wNAF precomputation window. Used for caching.
   * Default window size is set by `utils.precompute()` and is equal to 8.
   * Number of precomputed points depends on the curve size:
   * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
   * - 𝑊 is the window size
   * - 𝑛 is the bitlength of the curve order.
   * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
   * @param point - Point instance
   * @param W - window size
   * @returns precomputed point tables flattened to a single array
   */
  precomputeWindow(point, W) {
    const { windows, windowSize } = calcWOpts(W, this.bits);
    const points = [];
    let p = point;
    let base = p;
    for (let window2 = 0; window2 < windows; window2++) {
      base = p;
      points.push(base);
      for (let i = 1; i < windowSize; i++) {
        base = base.add(p);
        points.push(base);
      }
      p = base.double();
    }
    return points;
  }
  /**
   * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
   * More compact implementation:
   * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
   * @returns real and fake (for const-time) points
   */
  wNAF(W, precomputes, n) {
    if (!this.Fn.isValid(n))
      throw new Error("invalid scalar");
    let p = this.ZERO;
    let f = this.BASE;
    const wo = calcWOpts(W, this.bits);
    for (let window2 = 0; window2 < wo.windows; window2++) {
      const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window2, wo);
      n = nextN;
      if (isZero) {
        f = f.add(negateCt(isNegF, precomputes[offsetF]));
      } else {
        p = p.add(negateCt(isNeg, precomputes[offset]));
      }
    }
    assert0(n);
    return { p, f };
  }
  /**
   * Implements unsafe EC multiplication using precomputed tables
   * and w-ary non-adjacent form.
   * @param acc - accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
    const wo = calcWOpts(W, this.bits);
    for (let window2 = 0; window2 < wo.windows; window2++) {
      if (n === _0n3)
        break;
      const { nextN, offset, isZero, isNeg } = calcOffsets(n, window2, wo);
      n = nextN;
      if (isZero) {
        continue;
      } else {
        const item = precomputes[offset];
        acc = acc.add(isNeg ? item.negate() : item);
      }
    }
    assert0(n);
    return acc;
  }
  getPrecomputes(W, point, transform) {
    let comp = pointPrecomputes.get(point);
    if (!comp) {
      comp = this.precomputeWindow(point, W);
      if (W !== 1) {
        if (typeof transform === "function")
          comp = transform(comp);
        pointPrecomputes.set(point, comp);
      }
    }
    return comp;
  }
  cached(point, scalar, transform) {
    const W = getW(point);
    return this.wNAF(W, this.getPrecomputes(W, point, transform), scalar);
  }
  unsafe(point, scalar, transform, prev) {
    const W = getW(point);
    if (W === 1)
      return this._unsafeLadder(point, scalar, prev);
    return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform), scalar, prev);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(P, W) {
    validateW(W, this.bits);
    pointWindowSizes.set(P, W);
    pointPrecomputes.delete(P);
  }
  hasCache(elm) {
    return getW(elm) !== 1;
  }
};
function mulEndoUnsafe(Point, point, k1, k2) {
  let acc = point;
  let p1 = Point.ZERO;
  let p2 = Point.ZERO;
  while (k1 > _0n3 || k2 > _0n3) {
    if (k1 & _1n3)
      p1 = p1.add(acc);
    if (k2 & _1n3)
      p2 = p2.add(acc);
    acc = acc.double();
    k1 >>= _1n3;
    k2 >>= _1n3;
  }
  return { p1, p2 };
}
function createField(order, field, isLE2) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE: isLE2 });
  }
}
function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(typeof val === "bigint" && val > _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp, Fn };
}
function createKeygen(randomSecretKey, getPublicKey2) {
  return function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey2(secretKey) };
  };
}

// node_modules/@noble/hashes/hmac.js
var _HMAC = class {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = false;
  finished = false;
  destroyed = false;
  constructor(hash, key) {
    ahash(hash);
    abytes(key, void 0, "key");
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad2 = new Uint8Array(blockLen);
    pad2.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad2.length; i++)
      pad2[i] ^= 54;
    this.iHash.update(pad2);
    this.oHash = hash.create();
    for (let i = 0; i < pad2.length; i++)
      pad2[i] ^= 54 ^ 92;
    this.oHash.update(pad2);
    clean(pad2);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const buf = out.subarray(0, this.outputLen);
    this.iHash.digestInto(buf);
    this.oHash.update(buf);
    this.oHash.digestInto(buf);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = /* @__PURE__ */ (() => {
  const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
  hmac_.create = (hash, key) => new _HMAC(hash, key);
  return hmac_;
})();

// node_modules/@noble/curves/abstract/weierstrass.js
var divNearest = (num2, den) => (num2 + (num2 >= 0 ? den : -den) / _2n2) / den;
function _splitEndoScalar(k, basis, n) {
  aInRange("scalar", k, _0n4, n);
  const [[a1, b1], [a2, b2]] = basis;
  const c1 = divNearest(b2 * k, n);
  const c2 = divNearest(-b1 * k, n);
  let k1 = k - c1 * a1 - c2 * a2;
  let k2 = -c1 * b1 - c2 * b2;
  const k1neg = k1 < _0n4;
  const k2neg = k2 < _0n4;
  if (k1neg)
    k1 = -k1;
  if (k2neg)
    k2 = -k2;
  const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n4;
  if (k1 < _0n4 || k1 >= MAX_NUM || k2 < _0n4 || k2 >= MAX_NUM) {
    throw new Error("splitScalar (endomorphism): failed for k");
  }
  return { k1neg, k1, k2neg, k2 };
}
function validateSigFormat(format) {
  if (!["compact", "recovered", "der"].includes(format))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return format;
}
function validateSigOpts(opts, def) {
  validateObject(opts);
  const optsn = {};
  for (let optName of Object.keys(def)) {
    optsn[optName] = opts[optName] === void 0 ? def[optName] : opts[optName];
  }
  abool(optsn.lowS, "lowS");
  abool(optsn.prehash, "prehash");
  if (optsn.format !== void 0)
    validateSigFormat(optsn.format);
  return optsn;
}
var DERErr = class extends Error {
  constructor(m = "") {
    super(m);
  }
};
var DER = {
  // asn.1 DER encoding utils
  Err: DERErr,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (tag, data) => {
      const { Err: E } = DER;
      asafenumber(tag, "tag");
      if (tag < 0 || tag > 255)
        throw new E("tlv.encode: wrong tag");
      if (typeof data !== "string")
        throw new TypeError('"data" expected string, got type=' + typeof data);
      if (data.length & 1)
        throw new E("tlv.encode: unpadded data");
      const dataLen = data.length / 2;
      const len = numberToHexUnpadded(dataLen);
      if (len.length / 2 & 128)
        throw new E("tlv.encode: long form length too big");
      const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
      const t = numberToHexUnpadded(tag);
      return t + lenLen + len + data;
    },
    // v - value, l - left bytes (unparsed)
    decode(tag, data) {
      const { Err: E } = DER;
      data = abytes2(data, void 0, "DER data");
      let pos = 0;
      if (tag < 0 || tag > 255)
        throw new E("tlv.encode: wrong tag");
      if (data.length < 2 || data[pos++] !== tag)
        throw new E("tlv.decode: wrong tlv");
      const first = data[pos++];
      const isLong = !!(first & 128);
      let length = 0;
      if (!isLong)
        length = first;
      else {
        const lenLen = first & 127;
        if (!lenLen)
          throw new E("tlv.decode(long): indefinite length not supported");
        if (lenLen > 4)
          throw new E("tlv.decode(long): byte length is too big");
        const lengthBytes = data.subarray(pos, pos + lenLen);
        if (lengthBytes.length !== lenLen)
          throw new E("tlv.decode: length bytes not complete");
        if (lengthBytes[0] === 0)
          throw new E("tlv.decode(long): zero leftmost byte");
        for (const b of lengthBytes)
          length = length << 8 | b;
        pos += lenLen;
        if (length < 128)
          throw new E("tlv.decode(long): not minimal encoding");
      }
      const v = data.subarray(pos, pos + length);
      if (v.length !== length)
        throw new E("tlv.decode: wrong value length");
      return { v, l: data.subarray(pos + length) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(num2) {
      const { Err: E } = DER;
      abignumber(num2);
      if (num2 < _0n4)
        throw new E("integer: negative integers are not allowed");
      let hex = numberToHexUnpadded(num2);
      if (Number.parseInt(hex[0], 16) & 8)
        hex = "00" + hex;
      if (hex.length & 1)
        throw new E("unexpected DER parsing assertion: unpadded hex");
      return hex;
    },
    decode(data) {
      const { Err: E } = DER;
      if (data.length < 1)
        throw new E("invalid signature integer: empty");
      if (data[0] & 128)
        throw new E("invalid signature integer: negative");
      if (data.length > 1 && data[0] === 0 && !(data[1] & 128))
        throw new E("invalid signature integer: unnecessary leading zero");
      return bytesToNumberBE(data);
    }
  },
  toSig(bytes) {
    const { Err: E, _int: int, _tlv: tlv } = DER;
    const data = abytes2(bytes, void 0, "signature");
    const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
    if (seqLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
    const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
    if (sLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    return { r: int.decode(rBytes), s: int.decode(sBytes) };
  },
  hexFromSig(sig) {
    const { _tlv: tlv, _int: int } = DER;
    const rs = tlv.encode(2, int.encode(sig.r));
    const ss = tlv.encode(2, int.encode(sig.s));
    const seq = rs + ss;
    return tlv.encode(48, seq);
  }
};
Object.freeze(DER._tlv);
Object.freeze(DER._int);
Object.freeze(DER);
var _0n4 = /* @__PURE__ */ BigInt(0);
var _1n4 = /* @__PURE__ */ BigInt(1);
var _2n2 = /* @__PURE__ */ BigInt(2);
var _3n2 = /* @__PURE__ */ BigInt(3);
var _4n2 = /* @__PURE__ */ BigInt(4);
function weierstrass(params, extraOpts = {}) {
  const validated = createCurveFields("weierstrass", params, extraOpts);
  const Fp = validated.Fp;
  const Fn = validated.Fn;
  let CURVE = validated.CURVE;
  const { h: cofactor, n: CURVE_ORDER } = CURVE;
  validateObject(extraOpts, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object"
  });
  const { endo, allowInfinityPoint } = extraOpts;
  if (endo) {
    if (!Fp.is0(CURVE.a) || typeof endo.beta !== "bigint" || !Array.isArray(endo.basises)) {
      throw new Error('invalid endo: expected "beta": bigint and "basises": array');
    }
  }
  const lengths = getWLengths(Fp, Fn);
  function assertCompressionIsSupported() {
    if (!Fp.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function pointToBytes2(_c, point, isCompressed) {
    if (allowInfinityPoint && point.is0())
      return Uint8Array.of(0);
    const { x, y } = point.toAffine();
    const bx = Fp.toBytes(x);
    abool(isCompressed, "isCompressed");
    if (isCompressed) {
      assertCompressionIsSupported();
      const hasEvenY = !Fp.isOdd(y);
      return concatBytes2(pprefix(hasEvenY), bx);
    } else {
      return concatBytes2(Uint8Array.of(4), bx, Fp.toBytes(y));
    }
  }
  function pointFromBytes(bytes) {
    abytes2(bytes, void 0, "Point");
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    if (allowInfinityPoint && length === 1 && head === 0)
      return { x: Fp.ZERO, y: Fp.ZERO };
    if (length === comp && (head === 2 || head === 3)) {
      const x = Fp.fromBytes(tail);
      if (!Fp.isValid(x))
        throw new Error("bad point: is not on curve, wrong x");
      const y2 = weierstrassEquation(x);
      let y;
      try {
        y = Fp.sqrt(y2);
      } catch (sqrtError) {
        const err = sqrtError instanceof Error ? ": " + sqrtError.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + err);
      }
      assertCompressionIsSupported();
      const evenY = Fp.isOdd(y);
      const evenH = (head & 1) === 1;
      if (evenH !== evenY)
        y = Fp.neg(y);
      return { x, y };
    } else if (length === uncomp && head === 4) {
      const L = Fp.BYTES;
      const x = Fp.fromBytes(tail.subarray(0, L));
      const y = Fp.fromBytes(tail.subarray(L, L * 2));
      if (!isValidXY(x, y))
        throw new Error("bad point: is not on curve");
      return { x, y };
    } else {
      throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
    }
  }
  const encodePoint = extraOpts.toBytes === void 0 ? pointToBytes2 : extraOpts.toBytes;
  const decodePoint = extraOpts.fromBytes === void 0 ? pointFromBytes : extraOpts.fromBytes;
  function weierstrassEquation(x) {
    const x2 = Fp.sqr(x);
    const x3 = Fp.mul(x2, x);
    return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b);
  }
  function isValidXY(x, y) {
    const left = Fp.sqr(y);
    const right = weierstrassEquation(x);
    return Fp.eql(left, right);
  }
  if (!isValidXY(CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n2), _4n2);
  const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
  if (Fp.is0(Fp.add(_4a3, _27b2)))
    throw new Error("bad curve params: a or b");
  function acoord(title, n, banZero = false) {
    if (!Fp.isValid(n) || banZero && Fp.is0(n))
      throw new Error(`bad point coordinate ${title}`);
    return n;
  }
  function aprjpoint(other) {
    if (!(other instanceof Point))
      throw new Error("Weierstrass Point expected");
  }
  function splitEndoScalarN(k) {
    if (!endo || !endo.basises)
      throw new Error("no endo");
    return _splitEndoScalar(k, endo.basises, Fn.ORDER);
  }
  function finishEndo(endoBeta, k1p, k2p, k1neg, k2neg) {
    k2p = new Point(Fp.mul(k2p.X, endoBeta), k2p.Y, k2p.Z);
    k1p = negateCt(k1neg, k1p);
    k2p = negateCt(k2neg, k2p);
    return k1p.add(k2p);
  }
  class Point {
    // base / generator point
    static BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
    // zero / infinity / identity point
    static ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
    // 0, 1, 0
    // math field
    static Fp = Fp;
    // scalar field
    static Fn = Fn;
    X;
    Y;
    Z;
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(X, Y, Z) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y, true);
      this.Z = acoord("z", Z);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point)
        throw new Error("projective point not allowed");
      if (Fp.is0(x) && Fp.is0(y))
        return Point.ZERO;
      return new Point(x, y, Fp.ONE);
    }
    static fromBytes(bytes) {
      const P = Point.fromAffine(decodePoint(abytes2(bytes, void 0, "point")));
      P.assertValidity();
      return P;
    }
    static fromHex(hex) {
      return Point.fromBytes(hexToBytes2(hex));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     *
     * @param windowSize
     * @param isLazy - true will defer table computation until the first multiplication
     * @returns
     */
    precompute(windowSize = 8, isLazy = true) {
      wnaf.createCache(this, windowSize);
      if (!isLazy)
        this.multiply(_3n2);
      return this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const p = this;
      if (p.is0()) {
        if (extraOpts.allowInfinityPoint && Fp.is0(p.X) && Fp.eql(p.Y, Fp.ONE) && Fp.is0(p.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      const { x, y } = p.toAffine();
      if (!Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("bad point: x or y not field elements");
      if (!isValidXY(x, y))
        throw new Error("bad point: equation left != right");
      if (!p.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (!Fp.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !Fp.isOdd(y);
    }
    /** Compare one point to another. */
    equals(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
      const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
      return U1 && U2;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new Point(this.X, Fp.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a, b } = CURVE;
      const b3 = Fp.mul(b, _3n2);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X1);
      let t1 = Fp.mul(Y1, Y1);
      let t2 = Fp.mul(Z1, Z1);
      let t3 = Fp.mul(X1, Y1);
      t3 = Fp.add(t3, t3);
      Z3 = Fp.mul(X1, Z1);
      Z3 = Fp.add(Z3, Z3);
      X3 = Fp.mul(a, Z3);
      Y3 = Fp.mul(b3, t2);
      Y3 = Fp.add(X3, Y3);
      X3 = Fp.sub(t1, Y3);
      Y3 = Fp.add(t1, Y3);
      Y3 = Fp.mul(X3, Y3);
      X3 = Fp.mul(t3, X3);
      Z3 = Fp.mul(b3, Z3);
      t2 = Fp.mul(a, t2);
      t3 = Fp.sub(t0, t2);
      t3 = Fp.mul(a, t3);
      t3 = Fp.add(t3, Z3);
      Z3 = Fp.add(t0, t0);
      t0 = Fp.add(Z3, t0);
      t0 = Fp.add(t0, t2);
      t0 = Fp.mul(t0, t3);
      Y3 = Fp.add(Y3, t0);
      t2 = Fp.mul(Y1, Z1);
      t2 = Fp.add(t2, t2);
      t0 = Fp.mul(t2, t3);
      X3 = Fp.sub(X3, t0);
      Z3 = Fp.mul(t2, t1);
      Z3 = Fp.add(Z3, Z3);
      Z3 = Fp.add(Z3, Z3);
      return new Point(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      const a = CURVE.a;
      const b3 = Fp.mul(CURVE.b, _3n2);
      let t0 = Fp.mul(X1, X2);
      let t1 = Fp.mul(Y1, Y2);
      let t2 = Fp.mul(Z1, Z2);
      let t3 = Fp.add(X1, Y1);
      let t4 = Fp.add(X2, Y2);
      t3 = Fp.mul(t3, t4);
      t4 = Fp.add(t0, t1);
      t3 = Fp.sub(t3, t4);
      t4 = Fp.add(X1, Z1);
      let t5 = Fp.add(X2, Z2);
      t4 = Fp.mul(t4, t5);
      t5 = Fp.add(t0, t2);
      t4 = Fp.sub(t4, t5);
      t5 = Fp.add(Y1, Z1);
      X3 = Fp.add(Y2, Z2);
      t5 = Fp.mul(t5, X3);
      X3 = Fp.add(t1, t2);
      t5 = Fp.sub(t5, X3);
      Z3 = Fp.mul(a, t4);
      X3 = Fp.mul(b3, t2);
      Z3 = Fp.add(X3, Z3);
      X3 = Fp.sub(t1, Z3);
      Z3 = Fp.add(t1, Z3);
      Y3 = Fp.mul(X3, Z3);
      t1 = Fp.add(t0, t0);
      t1 = Fp.add(t1, t0);
      t2 = Fp.mul(a, t2);
      t4 = Fp.mul(b3, t4);
      t1 = Fp.add(t1, t2);
      t2 = Fp.sub(t0, t2);
      t2 = Fp.mul(a, t2);
      t4 = Fp.add(t4, t2);
      t0 = Fp.mul(t1, t4);
      Y3 = Fp.add(Y3, t0);
      t0 = Fp.mul(t5, t4);
      X3 = Fp.mul(t3, X3);
      X3 = Fp.sub(X3, t0);
      t0 = Fp.mul(t3, t1);
      Z3 = Fp.mul(t5, Z3);
      Z3 = Fp.add(Z3, t0);
      return new Point(X3, Y3, Z3);
    }
    subtract(other) {
      aprjpoint(other);
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar - by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      const { endo: endo2 } = extraOpts;
      if (!Fn.isValidNot0(scalar))
        throw new RangeError("invalid scalar: out of range");
      let point, fake;
      const mul3 = (n) => wnaf.cached(this, n, (p) => normalizeZ(Point, p));
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(scalar);
        const { p: k1p, f: k1f } = mul3(k1);
        const { p: k2p, f: k2f } = mul3(k2);
        fake = k1f.add(k2f);
        point = finishEndo(endo2.beta, k1p, k2p, k1neg, k2neg);
      } else {
        const { p, f } = mul3(scalar);
        point = p;
        fake = f;
      }
      return normalizeZ(Point, [point, fake])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(scalar) {
      const { endo: endo2 } = extraOpts;
      const p = this;
      const sc = scalar;
      if (!Fn.isValid(sc))
        throw new RangeError("invalid scalar: out of range");
      if (sc === _0n4 || p.is0())
        return Point.ZERO;
      if (sc === _1n4)
        return p;
      if (wnaf.hasCache(this))
        return this.multiply(sc);
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(sc);
        const { p1, p2 } = mulEndoUnsafe(Point, p, k1, k2);
        return finishEndo(endo2.beta, p1, p2, k1neg, k2neg);
      } else {
        return wnaf.unsafe(p, sc);
      }
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(invertedZ) {
      const p = this;
      let iz = invertedZ;
      const { X, Y, Z } = p;
      if (Fp.eql(Z, Fp.ONE))
        return { x: X, y: Y };
      const is0 = p.is0();
      if (iz == null)
        iz = is0 ? Fp.ONE : Fp.inv(Z);
      const x = Fp.mul(X, iz);
      const y = Fp.mul(Y, iz);
      const zz = Fp.mul(Z, iz);
      if (is0)
        return { x: Fp.ZERO, y: Fp.ZERO };
      if (!Fp.eql(zz, Fp.ONE))
        throw new Error("invZ was invalid");
      return { x, y };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree } = extraOpts;
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point, this);
      return wnaf.unsafe(this, CURVE_ORDER).is0();
    }
    clearCofactor() {
      const { clearCofactor } = extraOpts;
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point, this);
      return this.multiplyUnsafe(cofactor);
    }
    isSmallOrder() {
      if (cofactor === _1n4)
        return this.is0();
      return this.clearCofactor().is0();
    }
    toBytes(isCompressed = true) {
      abool(isCompressed, "isCompressed");
      this.assertValidity();
      return encodePoint(Point, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex2(this.toBytes(isCompressed));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const bits = Fn.BITS;
  const wnaf = new wNAF(Point, extraOpts.endo ? Math.ceil(bits / 2) : bits);
  if (bits >= 8)
    Point.BASE.precompute(8);
  Object.freeze(Point.prototype);
  Object.freeze(Point);
  return Point;
}
function pprefix(hasEvenY) {
  return Uint8Array.of(hasEvenY ? 2 : 3);
}
function getWLengths(Fp, Fn) {
  return {
    secretKey: Fn.BYTES,
    publicKey: 1 + Fp.BYTES,
    publicKeyUncompressed: 1 + 2 * Fp.BYTES,
    publicKeyHasPrefix: true,
    // Raw compact `(r || s)` signature width; DER and recovered signatures use
    // different lengths outside this helper.
    signature: 2 * Fn.BYTES
  };
}
function ecdh(Point, ecdhOpts = {}) {
  const { Fn } = Point;
  const randomBytes_ = ecdhOpts.randomBytes === void 0 ? randomBytes2 : ecdhOpts.randomBytes;
  const lengths = Object.assign(getWLengths(Point.Fp, Fn), {
    seed: Math.max(getMinHashLength(Fn.ORDER), 16)
  });
  function isValidSecretKey(secretKey) {
    try {
      const num2 = Fn.fromBytes(secretKey);
      return Fn.isValidNot0(num2);
    } catch (error) {
      return false;
    }
  }
  function isValidPublicKey(publicKey, isCompressed) {
    const { publicKey: comp, publicKeyUncompressed } = lengths;
    try {
      const l = publicKey.length;
      if (isCompressed === true && l !== comp)
        return false;
      if (isCompressed === false && l !== publicKeyUncompressed)
        return false;
      return !!Point.fromBytes(publicKey);
    } catch (error) {
      return false;
    }
  }
  function randomSecretKey(seed) {
    seed = seed === void 0 ? randomBytes_(lengths.seed) : seed;
    return mapHashToField(abytes2(seed, lengths.seed, "seed"), Fn.ORDER);
  }
  function getPublicKey2(secretKey, isCompressed = true) {
    return Point.BASE.multiply(Fn.fromBytes(secretKey)).toBytes(isCompressed);
  }
  function isProbPub(item) {
    const { secretKey, publicKey, publicKeyUncompressed } = lengths;
    const allowedLengths = Fn._lengths;
    if (!isBytes2(item))
      return void 0;
    const l = abytes2(item, void 0, "key").length;
    const isPub = l === publicKey || l === publicKeyUncompressed;
    const isSec = l === secretKey || !!allowedLengths?.includes(l);
    if (isPub && isSec)
      return void 0;
    return isPub;
  }
  function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
    if (isProbPub(secretKeyA) === true)
      throw new Error("first arg must be private key");
    if (isProbPub(publicKeyB) === false)
      throw new Error("second arg must be public key");
    const s = Fn.fromBytes(secretKeyA);
    const b = Point.fromBytes(publicKeyB);
    return b.multiply(s).toBytes(isCompressed);
  }
  const utils = {
    isValidSecretKey,
    isValidPublicKey,
    randomSecretKey
  };
  const keygen = createKeygen(randomSecretKey, getPublicKey2);
  Object.freeze(utils);
  Object.freeze(lengths);
  return Object.freeze({ getPublicKey: getPublicKey2, getSharedSecret, keygen, Point, utils, lengths });
}
function ecdsa(Point, hash, ecdsaOpts = {}) {
  const hash_ = hash;
  ahash(hash_);
  validateObject(ecdsaOpts, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  ecdsaOpts = Object.assign({}, ecdsaOpts);
  const randomBytes4 = ecdsaOpts.randomBytes === void 0 ? randomBytes2 : ecdsaOpts.randomBytes;
  const hmac2 = ecdsaOpts.hmac === void 0 ? (key, msg) => hmac(hash_, key, msg) : ecdsaOpts.hmac;
  const { Fp, Fn } = Point;
  const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
  const { keygen, getPublicKey: getPublicKey2, getSharedSecret, utils, lengths } = ecdh(Point, ecdsaOpts);
  const defaultSigOpts = {
    prehash: true,
    lowS: typeof ecdsaOpts.lowS === "boolean" ? ecdsaOpts.lowS : true,
    format: "compact",
    extraEntropy: false
  };
  const hasLargeRecoveryLifts = CURVE_ORDER * _2n2 + _1n4 < Fp.ORDER;
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER >> _1n4;
    return number > HALF;
  }
  function validateRS(title, num2) {
    if (!Fn.isValidNot0(num2))
      throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
    return num2;
  }
  function assertRecoverableCurve() {
    if (hasLargeRecoveryLifts)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function validateSigLength(bytes, format) {
    validateSigFormat(format);
    const size = lengths.signature;
    const sizer = format === "compact" ? size : format === "recovered" ? size + 1 : void 0;
    return abytes2(bytes, sizer);
  }
  class Signature {
    r;
    s;
    recovery;
    constructor(r, s, recovery) {
      this.r = validateRS("r", r);
      this.s = validateRS("s", s);
      if (recovery != null) {
        assertRecoverableCurve();
        if (![0, 1, 2, 3].includes(recovery))
          throw new Error("invalid recovery id");
        this.recovery = recovery;
      }
      Object.freeze(this);
    }
    static fromBytes(bytes, format = defaultSigOpts.format) {
      validateSigLength(bytes, format);
      let recid;
      if (format === "der") {
        const { r: r2, s: s2 } = DER.toSig(abytes2(bytes));
        return new Signature(r2, s2);
      }
      if (format === "recovered") {
        recid = bytes[0];
        format = "compact";
        bytes = bytes.subarray(1);
      }
      const L = lengths.signature / 2;
      const r = bytes.subarray(0, L);
      const s = bytes.subarray(L, L * 2);
      return new Signature(Fn.fromBytes(r), Fn.fromBytes(s), recid);
    }
    static fromHex(hex, format) {
      return this.fromBytes(hexToBytes2(hex), format);
    }
    assertRecovery() {
      const { recovery } = this;
      if (recovery == null)
        throw new Error("invalid recovery id: must be present");
      return recovery;
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    // Unlike the top-level helper below, this method expects a digest that has
    // already been hashed to the curve's message representative.
    recoverPublicKey(messageHash) {
      const { r, s } = this;
      const recovery = this.assertRecovery();
      const radj = recovery === 2 || recovery === 3 ? r + CURVE_ORDER : r;
      if (!Fp.isValid(radj))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const x = Fp.toBytes(radj);
      const R = Point.fromBytes(concatBytes2(pprefix((recovery & 1) === 0), x));
      const ir = Fn.inv(radj);
      const h = bits2int_modN(abytes2(messageHash, void 0, "msgHash"));
      const u1 = Fn.create(-h * ir);
      const u2 = Fn.create(s * ir);
      const Q = Point.BASE.multiplyUnsafe(u1).add(R.multiplyUnsafe(u2));
      if (Q.is0())
        throw new Error("invalid recovery: point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    toBytes(format = defaultSigOpts.format) {
      validateSigFormat(format);
      if (format === "der")
        return hexToBytes2(DER.hexFromSig(this));
      const { r, s } = this;
      const rb = Fn.toBytes(r);
      const sb = Fn.toBytes(s);
      if (format === "recovered") {
        assertRecoverableCurve();
        return concatBytes2(Uint8Array.of(this.assertRecovery()), rb, sb);
      }
      return concatBytes2(rb, sb);
    }
    toHex(format) {
      return bytesToHex2(this.toBytes(format));
    }
  }
  Object.freeze(Signature.prototype);
  Object.freeze(Signature);
  const bits2int = ecdsaOpts.bits2int === void 0 ? function bits2int_def(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num2 = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - fnBits;
    return delta > 0 ? num2 >> BigInt(delta) : num2;
  } : ecdsaOpts.bits2int;
  const bits2int_modN = ecdsaOpts.bits2int_modN === void 0 ? function bits2int_modN_def(bytes) {
    return Fn.create(bits2int(bytes));
  } : ecdsaOpts.bits2int_modN;
  const ORDER_MASK = bitMask(fnBits);
  function int2octets(num2) {
    aInRange("num < 2^" + fnBits, num2, _0n4, ORDER_MASK);
    return Fn.toBytes(num2);
  }
  function validateMsgAndHash(message, prehash) {
    abytes2(message, void 0, "message");
    return prehash ? abytes2(hash_(message), void 0, "prehashed message") : message;
  }
  function prepSig(message, secretKey, opts) {
    const { lowS, prehash, extraEntropy } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    const h1int = bits2int_modN(message);
    const d = Fn.fromBytes(secretKey);
    if (!Fn.isValidNot0(d))
      throw new Error("invalid private key");
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (extraEntropy != null && extraEntropy !== false) {
      const e = extraEntropy === true ? randomBytes4(lengths.secretKey) : extraEntropy;
      seedArgs.push(abytes2(e, void 0, "extraEntropy"));
    }
    const seed = concatBytes2(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!Fn.isValidNot0(k))
        return;
      const ik = Fn.inv(k);
      const q = Point.BASE.multiply(k).toAffine();
      const r = Fn.create(q.x);
      if (r === _0n4)
        return;
      const s = Fn.create(ik * Fn.create(m + r * d));
      if (s === _0n4)
        return;
      let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n4);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = Fn.neg(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, hasLargeRecoveryLifts ? void 0 : recovery);
    }
    return { seed, k2sig };
  }
  function sign(message, secretKey, opts = {}) {
    const { seed, k2sig } = prepSig(message, secretKey, opts);
    const drbg = createHmacDrbg(hash_.outputLen, Fn.BYTES, hmac2);
    const sig = drbg(seed, k2sig);
    return sig.toBytes(opts.format);
  }
  function verify(signature, message, publicKey, opts = {}) {
    const { lowS, prehash, format } = validateSigOpts(opts, defaultSigOpts);
    publicKey = abytes2(publicKey, void 0, "publicKey");
    message = validateMsgAndHash(message, prehash);
    if (!isBytes2(signature)) {
      const end = signature instanceof Signature ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + end);
    }
    validateSigLength(signature, format);
    try {
      const sig = Signature.fromBytes(signature, format);
      const P = Point.fromBytes(publicKey);
      if (lowS && sig.hasHighS())
        return false;
      const { r, s } = sig;
      const h = bits2int_modN(message);
      const is = Fn.inv(s);
      const u1 = Fn.create(h * is);
      const u2 = Fn.create(r * is);
      const R = Point.BASE.multiplyUnsafe(u1).add(P.multiplyUnsafe(u2));
      if (R.is0())
        return false;
      const v = Fn.create(R.x);
      return v === r;
    } catch (e) {
      return false;
    }
  }
  function recoverPublicKey(signature, message, opts = {}) {
    const { prehash } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    return Signature.fromBytes(signature, "recovered").recoverPublicKey(message).toBytes();
  }
  return Object.freeze({
    keygen,
    getPublicKey: getPublicKey2,
    getSharedSecret,
    utils,
    lengths,
    Point,
    sign,
    verify,
    recoverPublicKey,
    Signature,
    hash: hash_
  });
}

// node_modules/@noble/curves/secp256k1.js
var secp256k1_CURVE = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
};
var secp256k1_ENDO = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
};
var _0n5 = /* @__PURE__ */ BigInt(0);
var _2n3 = /* @__PURE__ */ BigInt(2);
function sqrtMod(y) {
  const P = secp256k1_CURVE.p;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n3, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n3, P);
  if (!Fpk1.eql(Fpk1.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var Fpk1 = Field(secp256k1_CURVE.p, { sqrt: sqrtMod });
var Pointk1 = /* @__PURE__ */ weierstrass(secp256k1_CURVE, {
  Fp: Fpk1,
  endo: secp256k1_ENDO
});
var secp256k1 = /* @__PURE__ */ ecdsa(Pointk1, sha256);
var TAGGED_HASH_PREFIXES = {};
function taggedHash(tag, ...messages) {
  let tagP = TAGGED_HASH_PREFIXES[tag];
  if (tagP === void 0) {
    const tagH = sha256(asciiToBytes(tag));
    tagP = concatBytes2(tagH, tagH);
    TAGGED_HASH_PREFIXES[tag] = tagP;
  }
  return sha256(concatBytes2(tagP, ...messages));
}
var pointToBytes = (point) => point.toBytes(true).slice(1);
var hasEven = (y) => y % _2n3 === _0n5;
function schnorrGetExtPubKey(priv) {
  const { Fn, BASE: BASE2 } = Pointk1;
  const d_ = Fn.fromBytes(priv);
  const p = BASE2.multiply(d_);
  const scalar = hasEven(p.y) ? d_ : Fn.neg(d_);
  return { scalar, bytes: pointToBytes(p) };
}
function lift_x(x) {
  const Fp = Fpk1;
  if (!Fp.isValidNot0(x))
    throw new Error("invalid x: Fail if x \u2265 p");
  const xx = Fp.create(x * x);
  const c = Fp.create(xx * x + BigInt(7));
  let y = Fp.sqrt(c);
  if (!hasEven(y))
    y = Fp.neg(y);
  const p = Pointk1.fromAffine({ x, y });
  p.assertValidity();
  return p;
}
var num = bytesToNumberBE;
function challenge(...args) {
  return Pointk1.Fn.create(num(taggedHash("BIP0340/challenge", ...args)));
}
function schnorrGetPublicKey(secretKey) {
  return schnorrGetExtPubKey(secretKey).bytes;
}
function schnorrSign(message, secretKey, auxRand = randomBytes(32)) {
  const { Fn, BASE: BASE2 } = Pointk1;
  const m = abytes2(message, void 0, "message");
  const { bytes: px, scalar: d } = schnorrGetExtPubKey(secretKey);
  const a = abytes2(auxRand, 32, "auxRand");
  const t = Fn.toBytes(d ^ num(taggedHash("BIP0340/aux", a)));
  const rand = taggedHash("BIP0340/nonce", t, px, m);
  const k_ = Fn.create(num(rand));
  if (k_ === 0n)
    throw new Error("sign failed: k is zero");
  const p = BASE2.multiply(k_);
  const k = hasEven(p.y) ? k_ : Fn.neg(k_);
  const rx = pointToBytes(p);
  const e = challenge(rx, px, m);
  const sig = new Uint8Array(64);
  sig.set(rx, 0);
  sig.set(Fn.toBytes(Fn.create(k + e * d)), 32);
  if (!schnorrVerify(sig, m, px))
    throw new Error("sign: Invalid signature produced");
  return sig;
}
function schnorrVerify(signature, message, publicKey) {
  const { Fp, Fn, BASE: BASE2 } = Pointk1;
  const sig = abytes2(signature, 64, "signature");
  const m = abytes2(message, void 0, "message");
  const pub = abytes2(publicKey, 32, "publicKey");
  try {
    const P = lift_x(num(pub));
    const r = num(sig.subarray(0, 32));
    if (!Fp.isValidNot0(r))
      return false;
    const s = num(sig.subarray(32, 64));
    if (!Fn.isValidNot0(s))
      return false;
    const e = challenge(Fn.toBytes(r), pointToBytes(P), m);
    const R = BASE2.multiplyUnsafe(s).add(P.multiplyUnsafe(Fn.neg(e)));
    const { x, y } = R.toAffine();
    if (R.is0() || !hasEven(y) || x !== r)
      return false;
    return true;
  } catch (error) {
    return false;
  }
}
var schnorr = /* @__PURE__ */ (() => {
  const size = 32;
  const seedLength = 48;
  const randomSecretKey = (seed) => {
    seed = seed === void 0 ? randomBytes(seedLength) : seed;
    return mapHashToField(seed, secp256k1_CURVE.n);
  };
  return Object.freeze({
    keygen: createKeygen(randomSecretKey, schnorrGetPublicKey),
    getPublicKey: schnorrGetPublicKey,
    sign: schnorrSign,
    verify: schnorrVerify,
    Point: Pointk1,
    utils: Object.freeze({
      randomSecretKey,
      taggedHash,
      lift_x,
      pointToBytes
    }),
    lengths: Object.freeze({
      secretKey: size,
      publicKey: size,
      publicKeyHasPrefix: false,
      signature: size * 2,
      seed: seedLength
    })
  });
})();

// node_modules/libp2r2p/base16/index.js
function bytesToBase16(bytes) {
  if (!bytes || typeof bytes[Symbol.iterator] !== "function") throw new ValidationError("INVALID_BYTE_ARRAY");
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
function base16ToBytes(base16) {
  if (typeof base16 !== "string") throw new ValidationError("INVALID_BASE16_TYPE", { message: "Base16 value should be a string" });
  if (base16.length % 2 !== 0) throw new ValidationError("INVALID_BASE16_LENGTH", { message: "Invalid Base16 length" });
  if (!/^[0-9a-f]*$/i.test(base16)) throw new ValidationError("INVALID_BASE16_CHARACTER", { message: "Invalid Base16 character" });
  const out = new Uint8Array(base16.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(base16.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
var bytesToHex3 = bytesToBase16;
var hexToBytes3 = base16ToBytes;

// node_modules/libp2r2p/event/helpers/serialize.js
var HEX_32 = /^[0-9a-f]{64}$/;
function serializableEventError(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "INVALID_EVENT";
  if (!Number.isSafeInteger(event.kind) || event.kind < 0 || event.kind > 65535) return "INVALID_EVENT_KIND";
  if (!Number.isSafeInteger(event.created_at) || event.created_at < 0) return "INVALID_EVENT_CREATED_AT";
  if (typeof event.pubkey !== "string" || !HEX_32.test(event.pubkey)) return "INVALID_EVENT_PUBKEY";
  if (typeof event.content !== "string") return "INVALID_EVENT_CONTENT";
  if (!Array.isArray(event.tags) || !event.tags.every((tag) => Array.isArray(tag) && tag.length > 0 && tag.every((value) => typeof value === "string"))) {
    return "INVALID_EVENT_TAGS";
  }
  return null;
}
function isSerializableEvent(event) {
  return serializableEventError(event) === null;
}
function assertSerializableEvent(event) {
  const code = serializableEventError(event);
  if (code) throw new ValidationError(code);
  return event;
}
function serializeEvent(event) {
  assertSerializableEvent(event);
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

// node_modules/libp2r2p/event/index.js
var HEX_322 = /^[0-9a-f]{64}$/;
var HEX_64 = /^[0-9a-f]{128}$/;
var textEncoder2 = new TextEncoder();
function copyTags(tags) {
  return Array.isArray(tags) ? tags.map((tag) => Array.isArray(tag) ? tag.slice() : tag) : tags;
}
function getEventHash(event) {
  return bytesToBase16(sha256(textEncoder2.encode(serializeEvent(event))));
}
function finalizeEvent(template, secretKey) {
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== 32 || !secp256k1.utils.isValidSecretKey(secretKey)) {
    throw new ValidationError("INVALID_SECRET_KEY");
  }
  const pubkey = bytesToBase16(schnorr.getPublicKey(secretKey));
  const event = { ...template, tags: copyTags(template?.tags), pubkey };
  const id = getEventHash(event);
  return { ...event, id, sig: bytesToBase16(schnorr.sign(base16ToBytes(id), secretKey)) };
}
function eventValidationError(event) {
  const structureError = serializableEventError(event);
  if (structureError) return structureError;
  if (typeof event.id !== "string" || !HEX_322.test(event.id)) return "INVALID_EVENT_ID";
  if (typeof event.sig !== "string" || !HEX_64.test(event.sig)) return "INVALID_EVENT_SIGNATURE";
  try {
    const id = getEventHash(event);
    if (id !== event.id) return "EVENT_ID_MISMATCH";
    if (!schnorr.verify(base16ToBytes(event.sig), base16ToBytes(id), base16ToBytes(event.pubkey))) {
      return "INVALID_EVENT_SIGNATURE";
    }
  } catch {
    return "INVALID_EVENT_SIGNATURE";
  }
  return null;
}
function isValidEvent(event) {
  return eventValidationError(event) === null;
}

// node_modules/@scure/base/index.js
function isBytes3(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function isArrayOf(isString, arr) {
  if (!Array.isArray(arr))
    return false;
  if (arr.length === 0)
    return true;
  if (isString) {
    return arr.every((item) => typeof item === "string");
  } else {
    return arr.every((item) => Number.isSafeInteger(item));
  }
}
function afn(input) {
  if (typeof input !== "function")
    throw new Error("function expected");
  return true;
}
function astr(label, input) {
  if (typeof input !== "string")
    throw new Error(`${label}: string expected`);
  return true;
}
function anumber3(n) {
  if (!Number.isSafeInteger(n))
    throw new Error(`invalid integer: ${n}`);
}
function aArr(input) {
  if (!Array.isArray(input))
    throw new Error("array expected");
}
function astrArr(label, input) {
  if (!isArrayOf(true, input))
    throw new Error(`${label}: array of strings expected`);
}
function anumArr(label, input) {
  if (!isArrayOf(false, input))
    throw new Error(`${label}: array of numbers expected`);
}
// @__NO_SIDE_EFFECTS__
function chain(...args) {
  const id = (a) => a;
  const wrap = (a, b) => (c) => a(b(c));
  const encode = args.map((x) => x.encode).reduceRight(wrap, id);
  const decode = args.map((x) => x.decode).reduce(wrap, id);
  return { encode, decode };
}
// @__NO_SIDE_EFFECTS__
function alphabet(letters) {
  const lettersA = typeof letters === "string" ? letters.split("") : letters;
  const len = lettersA.length;
  astrArr("alphabet", lettersA);
  const indexes = new Map(lettersA.map((l, i) => [l, i]));
  return {
    encode: (digits) => {
      aArr(digits);
      return digits.map((i) => {
        if (!Number.isSafeInteger(i) || i < 0 || i >= len)
          throw new Error(`alphabet.encode: digit index outside alphabet "${i}". Allowed: ${letters}`);
        return lettersA[i];
      });
    },
    decode: (input) => {
      aArr(input);
      return input.map((letter) => {
        astr("alphabet.decode", letter);
        const i = indexes.get(letter);
        if (i === void 0)
          throw new Error(`Unknown letter: "${letter}". Allowed: ${letters}`);
        return i;
      });
    }
  };
}
// @__NO_SIDE_EFFECTS__
function join(separator = "") {
  astr("join", separator);
  return {
    encode: (from) => {
      astrArr("join.decode", from);
      return from.join(separator);
    },
    decode: (to) => {
      astr("join.decode", to);
      return to.split(separator);
    }
  };
}
var gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
var radix2carry = /* @__NO_SIDE_EFFECTS__ */ (from, to) => from + (to - gcd(from, to));
var powers = /* @__PURE__ */ (() => {
  let res = [];
  for (let i = 0; i < 40; i++)
    res.push(2 ** i);
  return res;
})();
function convertRadix2(data, from, to, padding) {
  aArr(data);
  if (from <= 0 || from > 32)
    throw new Error(`convertRadix2: wrong from=${from}`);
  if (to <= 0 || to > 32)
    throw new Error(`convertRadix2: wrong to=${to}`);
  if (/* @__PURE__ */ radix2carry(from, to) > 32) {
    throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${/* @__PURE__ */ radix2carry(from, to)}`);
  }
  let carry = 0;
  let pos = 0;
  const max = powers[from];
  const mask = powers[to] - 1;
  const res = [];
  for (const n of data) {
    anumber3(n);
    if (n >= max)
      throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
    carry = carry << from | n;
    if (pos + from > 32)
      throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
    pos += from;
    for (; pos >= to; pos -= to)
      res.push((carry >> pos - to & mask) >>> 0);
    const pow = powers[pos];
    if (pow === void 0)
      throw new Error("invalid carry");
    carry &= pow - 1;
  }
  carry = carry << to - pos & mask;
  if (!padding && pos >= from)
    throw new Error("Excess padding");
  if (!padding && carry > 0)
    throw new Error(`Non-zero padding: ${carry}`);
  if (padding && pos > 0)
    res.push(carry >>> 0);
  return res;
}
// @__NO_SIDE_EFFECTS__
function radix2(bits, revPadding = false) {
  anumber3(bits);
  if (bits <= 0 || bits > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (/* @__PURE__ */ radix2carry(8, bits) > 32 || /* @__PURE__ */ radix2carry(bits, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: (bytes) => {
      if (!isBytes3(bytes))
        throw new Error("radix2.encode input should be Uint8Array");
      return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
    },
    decode: (digits) => {
      anumArr("radix2.decode", digits);
      return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
    }
  };
}
function unsafeWrapper(fn) {
  afn(fn);
  return function(...args) {
    try {
      return fn.apply(null, args);
    } catch (e) {
    }
  };
}
var BECH_ALPHABET = /* @__PURE__ */ chain(/* @__PURE__ */ alphabet("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), /* @__PURE__ */ join(""));
var POLYMOD_GENERATORS = [996825010, 642813549, 513874426, 1027748829, 705979059];
function bech32Polymod(pre) {
  const b = pre >> 25;
  let chk = (pre & 33554431) << 5;
  for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
    if ((b >> i & 1) === 1)
      chk ^= POLYMOD_GENERATORS[i];
  }
  return chk;
}
function bechChecksum(prefix, words, encodingConst = 1) {
  const len = prefix.length;
  let chk = 1;
  for (let i = 0; i < len; i++) {
    const c = prefix.charCodeAt(i);
    if (c < 33 || c > 126)
      throw new Error(`Invalid prefix (${prefix})`);
    chk = bech32Polymod(chk) ^ c >> 5;
  }
  chk = bech32Polymod(chk);
  for (let i = 0; i < len; i++)
    chk = bech32Polymod(chk) ^ prefix.charCodeAt(i) & 31;
  for (let v of words)
    chk = bech32Polymod(chk) ^ v;
  for (let i = 0; i < 6; i++)
    chk = bech32Polymod(chk);
  chk ^= encodingConst;
  return BECH_ALPHABET.encode(convertRadix2([chk % powers[30]], 30, 5, false));
}
// @__NO_SIDE_EFFECTS__
function genBech32(encoding) {
  const ENCODING_CONST = encoding === "bech32" ? 1 : 734539939;
  const _words = /* @__PURE__ */ radix2(5);
  const fromWords = _words.decode;
  const toWords = _words.encode;
  const fromWordsUnsafe = unsafeWrapper(fromWords);
  function encode(prefix, words, limit = 90) {
    astr("bech32.encode prefix", prefix);
    if (isBytes3(words))
      words = Array.from(words);
    anumArr("bech32.encode", words);
    const plen = prefix.length;
    if (plen === 0)
      throw new TypeError(`Invalid prefix length ${plen}`);
    const actualLength = plen + 7 + words.length;
    if (limit !== false && actualLength > limit)
      throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
    const lowered = prefix.toLowerCase();
    const sum = bechChecksum(lowered, words, ENCODING_CONST);
    return `${lowered}1${BECH_ALPHABET.encode(words)}${sum}`;
  }
  function decode(str, limit = 90) {
    astr("bech32.decode input", str);
    const slen = str.length;
    if (slen < 8 || limit !== false && slen > limit)
      throw new TypeError(`invalid string length: ${slen} (${str}). Expected (8..${limit})`);
    const lowered = str.toLowerCase();
    if (str !== lowered && str !== str.toUpperCase())
      throw new Error(`String must be lowercase or uppercase`);
    const sepIndex = lowered.lastIndexOf("1");
    if (sepIndex === 0 || sepIndex === -1)
      throw new Error(`Letter "1" must be present between prefix and data only`);
    const prefix = lowered.slice(0, sepIndex);
    const data = lowered.slice(sepIndex + 1);
    if (data.length < 6)
      throw new Error("Data must be at least 6 characters long");
    const words = BECH_ALPHABET.decode(data).slice(0, -6);
    const sum = bechChecksum(prefix, words, ENCODING_CONST);
    if (!data.endsWith(sum))
      throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
    return { prefix, words };
  }
  const decodeUnsafe = unsafeWrapper(decode);
  function decodeToBytes(str) {
    const { prefix, words } = decode(str, false);
    return { prefix, words, bytes: fromWords(words) };
  }
  function encodeFromBytes(prefix, bytes) {
    return encode(prefix, toWords(bytes));
  }
  return {
    encode,
    decode,
    encodeFromBytes,
    decodeToBytes,
    decodeUnsafe,
    fromWords,
    fromWordsUnsafe,
    toWords
  };
}
var bech32 = /* @__PURE__ */ genBech32("bech32");

// node_modules/libp2r2p/base62/index.js
var BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
var BASE = BigInt(BASE62_ALPHABET.length);
var LEADER = BASE62_ALPHABET[0];
var CHAR_MAP = new Map(
  [...BASE62_ALPHABET].map((character, index) => [character, BigInt(index)])
);

// node_modules/libp2r2p/nip19/index.js
var MAX_ENTITY_SIZE = 5e3;
var NAPP_ENTITY_REGEX = new RegExp(
  `^\\+{1,3}[${BASE62_ALPHABET}]{48,${MAX_ENTITY_SIZE}}$`
);
var textEncoder3 = new TextEncoder();
var textDecoder = new TextDecoder();
var fatalTextDecoder = new TextDecoder("utf-8", { fatal: true });
var kindByChannel = {
  main: 35128,
  next: 35129,
  draft: 35130
};
var channelByKind = Object.fromEntries(
  Object.entries(kindByChannel).map(([channel, kind]) => [kind, channel])
);
var prefixByChannel = {
  main: "+",
  next: "++",
  draft: "+++"
};
var channelByPrefix = Object.fromEntries(
  Object.entries(prefixByChannel).map(([channel, prefix]) => [prefix, channel])
);
function invalid(code, message, cause) {
  return new ValidationError(code, { message, cause });
}
function bytesToHex4(bytes) {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}
function hexToBytes4(hex, fieldName = "hex value") {
  if (typeof hex !== "string" || !/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw invalid("INVALID_NIP19_HEX", `Invalid ${fieldName}`);
  }
  const result = new Uint8Array(hex.length / 2);
  for (let index = 0; index < result.length; index++) {
    result[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}
function fixedHexToBytes(hex, byteLength3, fieldName) {
  const bytes = hexToBytes4(hex, fieldName);
  if (bytes.length !== byteLength3) throw invalid("INVALID_NIP19_FIELD_LENGTH", `${fieldName} should be ${byteLength3} bytes`);
  return bytes;
}
function decodeBech32Bytes(entity, prefix) {
  if (typeof entity !== "string" || entity !== entity.toLowerCase() || !entity.startsWith(`${prefix}1`)) {
    throw invalid("NON_CANONICAL_NIP19_ENTITY", `${prefix} should use canonical lowercase Bech32`);
  }
  let decoded;
  try {
    decoded = bech32.decode(entity, MAX_ENTITY_SIZE);
  } catch (error) {
    throw invalid("INVALID_NIP19_ENTITY", `Invalid ${prefix}: ${error.message}`, error);
  }
  if (decoded.prefix !== prefix) throw invalid("INVALID_NIP19_PREFIX", `Invalid ${prefix} prefix`);
  try {
    return new Uint8Array(bech32.fromWords(decoded.words));
  } catch (error) {
    throw invalid("INVALID_NIP19_DATA", `Invalid ${prefix} data: ${error.message}`, error);
  }
}
function npubEncode(hex) {
  return bech32.encode("npub", bech32.toWords(fixedHexToBytes(hex, 32, "pubkey")));
}
function npubDecode(entity) {
  return decodeSimpleEntity(entity, "npub", "pubkey");
}
function nsecEncode(hex) {
  return bech32.encode("nsec", bech32.toWords(fixedHexToBytes(hex, 32, "secret key")));
}
function nsecDecode(entity) {
  return decodeSimpleEntity(entity, "nsec", "secret key");
}
function decodeSimpleEntity(entity, prefix, fieldName) {
  try {
    const bytes = decodeBech32Bytes(entity, prefix);
    if (bytes.length !== 32) throw invalid("INVALID_NIP19_FIELD_LENGTH", `Invalid ${fieldName} length`);
    return bytesToHex4(bytes);
  } catch (error) {
    if (error instanceof ValidationError && error.code === "INVALID_NIP19_FIELD_LENGTH") throw error;
    throw invalid("INVALID_NIP19_ENTITY", `Failed to decode ${prefix}: ${error.message}`, error);
  }
}

// node_modules/libp2r2p/key/index.js
var HEX_SECKEY_REGEX = /^[0-9a-f]{64}$/i;
function generateSecretKey() {
  return schnorr.utils.randomSecretKey();
}
function getPublicKey(secretKey) {
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== 32 || !secp256k1.utils.isValidSecretKey(secretKey)) {
    throw new ValidationError("INVALID_SECRET_KEY");
  }
  return bytesToHex3(schnorr.getPublicKey(secretKey));
}
function generateKeypair() {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  return {
    secretKey,
    seckey: bytesToHex3(secretKey),
    pubkey,
    nsec: nsecEncode(bytesToHex3(secretKey)),
    npub: npubEncode(pubkey)
  };
}
function keypairFromSeckey(raw) {
  let secretKey;
  if (HEX_SECKEY_REGEX.test(raw)) {
    secretKey = hexToBytes3(raw.toLowerCase());
  } else {
    try {
      secretKey = hexToBytes3(nsecDecode(raw));
    } catch (cause) {
      throw new ValidationError("NOT_A_SECRET_KEY", { cause });
    }
  }
  const pubkey = getPublicKey(secretKey);
  return {
    secretKey,
    seckey: bytesToHex3(secretKey),
    pubkey,
    nsec: nsecEncode(bytesToHex3(secretKey)),
    npub: npubEncode(pubkey)
  };
}
function pubkeyFromNpub(npub) {
  try {
    return npubDecode(npub);
  } catch (cause) {
    throw new ValidationError("NOT_AN_NPUB", { cause });
  }
}
function nsecFromHex(hex) {
  return nsecEncode(hex);
}
function npubFromPubkey(pubkey) {
  return npubEncode(pubkey);
}
function cleanProfileValue(value) {
  return String(value ?? "").trim();
}
function profileContentFromEvent(event) {
  if (!event?.content) return {};
  try {
    const parsed = JSON.parse(event.content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
  }
  return {};
}
function profileEventTemplate({ name = "", picture = "", profileEvent = null } = {}) {
  const cleanName = cleanProfileValue(name);
  const cleanPicture = cleanProfileValue(picture);
  const content = profileContentFromEvent(profileEvent);
  if (cleanName) content.name = cleanName;
  else delete content.name;
  if (cleanPicture) content.picture = cleanPicture;
  else delete content.picture;
  const tags = Array.isArray(profileEvent?.tags) ? profileEvent.tags.filter((t) => Array.isArray(t) && t[0] !== "name" && t[0] !== "picture").map((t) => t.slice()) : [];
  if (cleanName) tags.push(["name", cleanName]);
  if (cleanPicture) tags.push(["picture", cleanPicture]);
  return {
    kind: 0,
    created_at: Math.floor(Date.now() / 1e3),
    tags,
    content: JSON.stringify(content)
  };
}
function signProfileEvent({ secretKey, name = "", picture, profileEvent = null }) {
  return finalizeEvent(profileEventTemplate({ name, picture, profileEvent }), secretKey);
}
function signRelayListEvent({ secretKey, writeRelays = [], readRelays = [] }) {
  const write = new Set(writeRelays);
  const read = new Set(readRelays);
  const all = /* @__PURE__ */ new Set([...write, ...read]);
  const tags = [];
  for (const url of all) {
    const isWrite = write.has(url);
    const isRead = read.has(url);
    if (isWrite && isRead) tags.push(["r", url]);
    else if (isWrite) tags.push(["r", url, "write"]);
    else tags.push(["r", url, "read"]);
  }
  return finalizeEvent({
    kind: 10002,
    created_at: Math.floor(Date.now() / 1e3),
    tags,
    content: ""
  }, secretKey);
}
function parseProfileEvent(event) {
  if (!event || event.kind !== 0) return { name: "", picture: "" };
  let parsed = {};
  try {
    parsed = JSON.parse(event.content);
  } catch {
    parsed = {};
  }
  const fromTag = (name) => event.tags.find((t) => t[0] === name)?.[1];
  return {
    name: (fromTag("name") || parsed.name || parsed.display_name || "").trim(),
    about: (parsed.about || "").trim(),
    picture: (fromTag("picture") || parsed.picture || "").trim()
  };
}

// node_modules/libp2r2p/nip04/index.js
var nip04_exports = {};
__export(nip04_exports, {
  decrypt: () => decrypt2,
  encrypt: () => encrypt2
});

// node_modules/@noble/ciphers/utils.js
function isBytes4(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
function abool2(b) {
  if (typeof b !== "boolean")
    throw new TypeError(`boolean expected, not ${b}`);
}
function anumber4(n) {
  if (typeof n !== "number")
    throw new TypeError("number expected, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError("positive integer expected, got " + n);
}
function abytes3(value, length, title = "") {
  const bytes = isBytes4(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    const message = prefix + "expected Uint8Array" + ofLen + ", got " + got;
    if (!bytes)
      throw new TypeError(message);
    throw new RangeError(message);
  }
  return value;
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean2(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
var byteSwap = (word) => word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
var byteSwap32 = (arr) => {
  for (let i = 0; i < arr.length; i++)
    arr[i] = byteSwap(arr[i]);
  return arr;
};
var swap32IfBE = isLE ? (u) => u : byteSwap32;
function overlapBytes(a, b) {
  if (!a.byteLength || !b.byteLength)
    return false;
  return a.buffer === b.buffer && // best we can do, may fail with an obscure Proxy
  a.byteOffset < b.byteOffset + b.byteLength && // a starts before b end
  b.byteOffset < a.byteOffset + a.byteLength;
}
function complexOverlapBytes(input, output) {
  if (overlapBytes(input, output) && input.byteOffset < output.byteOffset)
    throw new Error("complex overlap of input and output is not supported");
}
function checkOpts(defaults, opts) {
  if (opts == null || typeof opts !== "object")
    throw new Error("options must be defined");
  const merged = Object.assign(defaults, opts);
  return merged;
}
function equalBytes(a, b) {
  if (a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a[i] ^ b[i];
  return diff === 0;
}
var wrapCipher = /* @__NO_SIDE_EFFECTS__ */ (params, constructor) => {
  function wrappedCipher(key, ...args) {
    abytes3(key, void 0, "key");
    if (params.nonceLength !== void 0) {
      const nonce = args[0];
      abytes3(nonce, params.varSizeNonce ? void 0 : params.nonceLength, "nonce");
    }
    const tagl = params.tagLength;
    if (tagl && args[1] !== void 0)
      abytes3(args[1], void 0, "AAD");
    const cipher = constructor(key, ...args);
    const checkOutput = (fnLength, output) => {
      if (output !== void 0) {
        if (fnLength !== 2)
          throw new Error("cipher output not supported");
        abytes3(output, void 0, "output");
      }
    };
    let called = false;
    const wrCipher = {
      encrypt(data, output) {
        if (called)
          throw new Error("cannot encrypt() twice with same key + nonce");
        called = true;
        abytes3(data);
        checkOutput(cipher.encrypt.length, output);
        return cipher.encrypt(data, output);
      },
      decrypt(data, output) {
        abytes3(data);
        if (tagl && data.length < tagl)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + tagl);
        checkOutput(cipher.decrypt.length, output);
        return cipher.decrypt(data, output);
      }
    };
    return wrCipher;
  }
  Object.assign(wrappedCipher, params);
  return wrappedCipher;
};
function getOutput(expectedLength, out, onlyAligned = true) {
  if (out === void 0)
    return new Uint8Array(expectedLength);
  abytes3(out, void 0, "output");
  if (out.length !== expectedLength)
    throw new Error('"output" expected Uint8Array of length ' + expectedLength + ", got: " + out.length);
  if (onlyAligned && !isAligned32(out))
    throw new Error("invalid output, must be aligned");
  return out;
}
function isAligned32(bytes) {
  return bytes.byteOffset % 4 === 0;
}
function copyBytes2(bytes) {
  return Uint8Array.from(abytes3(bytes));
}
function randomBytes3(bytesLength = 32) {
  anumber4(bytesLength);
  const cr = typeof globalThis === "object" ? globalThis.crypto : null;
  if (typeof cr?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined");
  return cr.getRandomValues(new Uint8Array(bytesLength));
}

// node_modules/@noble/ciphers/aes.js
var BLOCK_SIZE = 16;
var POLY = 283;
function validateKeyLength(key) {
  if (![16, 24, 32].includes(key.length))
    throw new Error('"aes key" expected Uint8Array of length 16/24/32, got length=' + key.length);
}
function mul2(n) {
  return n << 1 ^ POLY & -(n >> 7);
}
function mul(a, b) {
  let res = 0;
  for (; b > 0; b >>= 1) {
    res ^= a & -(b & 1);
    a = mul2(a);
  }
  return res;
}
var sbox = /* @__PURE__ */ (() => {
  const t = new Uint8Array(256);
  for (let i = 0, x = 1; i < 256; i++, x ^= mul2(x))
    t[i] = x;
  const box = new Uint8Array(256);
  box[0] = 99;
  for (let i = 0; i < 255; i++) {
    let x = t[255 - i];
    x |= x << 8;
    box[t[i]] = (x ^ x >> 4 ^ x >> 5 ^ x >> 6 ^ x >> 7 ^ 99) & 255;
  }
  clean2(t);
  return box;
})();
var invSbox = /* @__PURE__ */ sbox.map((_, j) => sbox.indexOf(j));
var rotr32_8 = (n) => n << 24 | n >>> 8;
var rotl32_8 = (n) => n << 8 | n >>> 24;
function genTtable(sbox2, fn) {
  if (sbox2.length !== 256)
    throw new Error("Wrong sbox length");
  const T0 = new Uint32Array(256).map((_, j) => fn(sbox2[j]));
  const T1 = T0.map(rotl32_8);
  const T2 = T1.map(rotl32_8);
  const T3 = T2.map(rotl32_8);
  const T01 = new Uint32Array(256 * 256);
  const T23 = new Uint32Array(256 * 256);
  const sbox22 = new Uint16Array(256 * 256);
  for (let i = 0; i < 256; i++) {
    for (let j = 0; j < 256; j++) {
      const idx = i * 256 + j;
      T01[idx] = T0[i] ^ T1[j];
      T23[idx] = T2[i] ^ T3[j];
      sbox22[idx] = sbox2[i] << 8 | sbox2[j];
    }
  }
  return { sbox: sbox2, sbox2: sbox22, T0, T1, T2, T3, T01, T23 };
}
var tableEncoding = /* @__PURE__ */ genTtable(sbox, (s) => mul(s, 3) << 24 | s << 16 | s << 8 | mul(s, 2));
var tableDecoding = /* @__PURE__ */ genTtable(invSbox, (s) => mul(s, 11) << 24 | mul(s, 13) << 16 | mul(s, 9) << 8 | mul(s, 14));
var xPowers = /* @__PURE__ */ (() => {
  const p = new Uint8Array(16);
  for (let i = 0, x = 1; i < 16; i++, x = mul2(x))
    p[i] = x;
  return p;
})();
function expandKeyLE(key) {
  abytes3(key);
  const len = key.length;
  validateKeyLength(key);
  const { sbox2 } = tableEncoding;
  const toClean = [];
  if (!isLE || !isAligned32(key))
    toClean.push(key = copyBytes2(key));
  const k32 = swap32IfBE(u32(key));
  const Nk = k32.length;
  const subByte = (n) => applySbox(sbox2, n, n, n, n);
  const xk = new Uint32Array(len + 28);
  xk.set(k32);
  for (let i = Nk; i < xk.length; i++) {
    let t = xk[i - 1];
    if (i % Nk === 0)
      t = subByte(rotr32_8(t)) ^ xPowers[i / Nk - 1];
    else if (Nk > 6 && i % Nk === 4)
      t = subByte(t);
    xk[i] = xk[i - Nk] ^ t;
  }
  clean2(...toClean);
  return xk;
}
function expandKeyDecLE(key) {
  const encKey = expandKeyLE(key);
  const xk = encKey.slice();
  const Nk = encKey.length;
  const { sbox2 } = tableEncoding;
  const { T0, T1, T2, T3 } = tableDecoding;
  for (let i = 0; i < Nk; i += 4) {
    for (let j = 0; j < 4; j++)
      xk[i + j] = encKey[Nk - i - 4 + j];
  }
  clean2(encKey);
  for (let i = 4; i < Nk - 4; i++) {
    const x = xk[i];
    const w = applySbox(sbox2, x, x, x, x);
    xk[i] = T0[w & 255] ^ T1[w >>> 8 & 255] ^ T2[w >>> 16 & 255] ^ T3[w >>> 24];
  }
  return xk;
}
function apply0123(T01, T23, s0, s1, s2, s3) {
  return T01[s0 << 8 & 65280 | s1 >>> 8 & 255] ^ T23[s2 >>> 8 & 65280 | s3 >>> 24 & 255];
}
function applySbox(sbox2, s0, s1, s2, s3) {
  return sbox2[s0 & 255 | s1 & 65280] | sbox2[s2 >>> 16 & 255 | s3 >>> 16 & 65280] << 16;
}
function encrypt(xk, s0, s1, s2, s3) {
  const { sbox2, T01, T23 } = tableEncoding;
  let k = 0;
  s0 ^= xk[k++], s1 ^= xk[k++], s2 ^= xk[k++], s3 ^= xk[k++];
  const rounds = xk.length / 4 - 2;
  for (let i = 0; i < rounds; i++) {
    const t02 = xk[k++] ^ apply0123(T01, T23, s0, s1, s2, s3);
    const t12 = xk[k++] ^ apply0123(T01, T23, s1, s2, s3, s0);
    const t22 = xk[k++] ^ apply0123(T01, T23, s2, s3, s0, s1);
    const t32 = xk[k++] ^ apply0123(T01, T23, s3, s0, s1, s2);
    s0 = t02, s1 = t12, s2 = t22, s3 = t32;
  }
  const t0 = xk[k++] ^ applySbox(sbox2, s0, s1, s2, s3);
  const t1 = xk[k++] ^ applySbox(sbox2, s1, s2, s3, s0);
  const t2 = xk[k++] ^ applySbox(sbox2, s2, s3, s0, s1);
  const t3 = xk[k++] ^ applySbox(sbox2, s3, s0, s1, s2);
  return { s0: t0, s1: t1, s2: t2, s3: t3 };
}
function decrypt(xk, s0, s1, s2, s3) {
  const { sbox2, T01, T23 } = tableDecoding;
  let k = 0;
  s0 ^= xk[k++], s1 ^= xk[k++], s2 ^= xk[k++], s3 ^= xk[k++];
  const rounds = xk.length / 4 - 2;
  for (let i = 0; i < rounds; i++) {
    const t02 = xk[k++] ^ apply0123(T01, T23, s0, s3, s2, s1);
    const t12 = xk[k++] ^ apply0123(T01, T23, s1, s0, s3, s2);
    const t22 = xk[k++] ^ apply0123(T01, T23, s2, s1, s0, s3);
    const t32 = xk[k++] ^ apply0123(T01, T23, s3, s2, s1, s0);
    s0 = t02, s1 = t12, s2 = t22, s3 = t32;
  }
  const t0 = xk[k++] ^ applySbox(sbox2, s0, s3, s2, s1);
  const t1 = xk[k++] ^ applySbox(sbox2, s1, s0, s3, s2);
  const t2 = xk[k++] ^ applySbox(sbox2, s2, s1, s0, s3);
  const t3 = xk[k++] ^ applySbox(sbox2, s3, s2, s1, s0);
  return { s0: t0, s1: t1, s2: t2, s3: t3 };
}
function validateBlockDecrypt(data) {
  abytes3(data);
  if (data.length % BLOCK_SIZE !== 0) {
    throw new Error("aes-(cbc/ecb).decrypt ciphertext should consist of blocks with size " + BLOCK_SIZE);
  }
}
function validateBlockEncrypt(plaintext, pkcs5, dst) {
  abytes3(plaintext);
  let outLen = plaintext.length;
  const remaining = outLen % BLOCK_SIZE;
  if (!pkcs5 && remaining !== 0)
    throw new Error("aec/(cbc-ecb): unpadded plaintext with disabled padding");
  if (pkcs5) {
    let left = BLOCK_SIZE - remaining;
    if (!left)
      left = BLOCK_SIZE;
    outLen = outLen + left;
  }
  dst = getOutput(outLen, dst);
  complexOverlapBytes(plaintext, dst);
  if (!isLE || !isAligned32(plaintext))
    plaintext = copyBytes2(plaintext);
  const b = u32(plaintext);
  swap32IfBE(b);
  const o = u32(dst);
  return { b, o, out: dst };
}
function validatePKCS(data, pkcs5) {
  if (!pkcs5)
    return data;
  const len = data.length;
  if (len === 0)
    throw new Error("aes/pkcs7: empty ciphertext not allowed");
  const lastByte = data[len - 1];
  let valid = 1;
  valid &= lastByte - 1 >>> 31 ^ 1;
  valid &= 16 - lastByte >>> 31 ^ 1;
  for (let i = 0; i < 16; i++) {
    const shouldCheck = i - lastByte >>> 31;
    const eq = (data[len - 1 - i] ^ lastByte) === 0 ? 1 : 0;
    valid &= eq | shouldCheck ^ 1;
  }
  if (!valid)
    throw new Error("aes/pkcs7: wrong padding");
  return data.subarray(0, len - lastByte);
}
function padPCKS(left) {
  const tmp = new Uint8Array(16);
  const tmp32 = u32(tmp);
  tmp.set(left);
  const paddingByte = BLOCK_SIZE - left.length;
  for (let i = BLOCK_SIZE - paddingByte; i < BLOCK_SIZE; i++)
    tmp[i] = paddingByte;
  return tmp32;
}
var cbc = /* @__PURE__ */ wrapCipher({ blockSize: 16, nonceLength: 16 }, function aescbc(key, iv, opts = {}) {
  const pkcs5 = !opts.disablePadding;
  return {
    encrypt(plaintext, dst) {
      const xk = expandKeyLE(key);
      const { b, o, out: _out } = validateBlockEncrypt(plaintext, pkcs5, dst);
      let _iv = iv;
      const toClean = [xk];
      if (!isLE || !isAligned32(_iv))
        toClean.push(_iv = copyBytes2(_iv));
      const n32 = u32(_iv);
      swap32IfBE(n32);
      let s0 = n32[0], s1 = n32[1], s2 = n32[2], s3 = n32[3];
      let i = 0;
      for (; i + 4 <= b.length; ) {
        s0 ^= b[i + 0], s1 ^= b[i + 1], s2 ^= b[i + 2], s3 ^= b[i + 3];
        ({ s0, s1, s2, s3 } = encrypt(xk, s0, s1, s2, s3));
        o[i++] = s0, o[i++] = s1, o[i++] = s2, o[i++] = s3;
      }
      if (pkcs5) {
        const tmp32 = padPCKS(plaintext.subarray(i * 4));
        swap32IfBE(tmp32);
        s0 ^= tmp32[0], s1 ^= tmp32[1], s2 ^= tmp32[2], s3 ^= tmp32[3];
        ({ s0, s1, s2, s3 } = encrypt(xk, s0, s1, s2, s3));
        o[i++] = s0, o[i++] = s1, o[i++] = s2, o[i++] = s3;
      }
      swap32IfBE(o);
      clean2(...toClean);
      return _out;
    },
    decrypt(ciphertext, dst) {
      validateBlockDecrypt(ciphertext);
      const xk = expandKeyDecLE(key);
      let _iv = iv;
      const toClean = [xk];
      if (!isLE || !isAligned32(_iv))
        toClean.push(_iv = copyBytes2(_iv));
      const n32 = u32(_iv);
      swap32IfBE(n32);
      dst = getOutput(ciphertext.length, dst);
      complexOverlapBytes(ciphertext, dst);
      if (!isLE || !isAligned32(ciphertext))
        toClean.push(ciphertext = copyBytes2(ciphertext));
      const b = u32(ciphertext);
      const o = u32(dst);
      swap32IfBE(b);
      let s0 = n32[0], s1 = n32[1], s2 = n32[2], s3 = n32[3];
      for (let i = 0; i + 4 <= b.length; ) {
        const ps0 = s0, ps1 = s1, ps2 = s2, ps3 = s3;
        s0 = b[i + 0], s1 = b[i + 1], s2 = b[i + 2], s3 = b[i + 3];
        const { s0: o0, s1: o1, s2: o2, s3: o3 } = decrypt(xk, s0, s1, s2, s3);
        o[i++] = o0 ^ ps0, o[i++] = o1 ^ ps1, o[i++] = o2 ^ ps2, o[i++] = o3 ^ ps3;
      }
      swap32IfBE(o);
      clean2(...toClean);
      return validatePKCS(dst, pkcs5);
    }
  };
});

// node_modules/libp2r2p/base64/index.js
function bytesToBase64(bytes) {
  if (!bytes || !Number.isSafeInteger(bytes.length) || typeof bytes[Symbol.iterator] !== "function") {
    throw new ValidationError("INVALID_BYTE_ARRAY");
  }
  if (typeof Buffer === "function" && typeof Buffer.from === "function") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function base64ToBytes(b64) {
  if (typeof b64 !== "string") throw new ValidationError("INVALID_BASE64_TYPE", { message: "Base64 value should be a string" });
  let bin;
  try {
    bin = atob(b64);
  } catch (cause) {
    throw new ValidationError("INVALID_BASE64", { cause });
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(base64url) {
  if (typeof base64url !== "string") throw new ValidationError("INVALID_BASE64URL_TYPE", { message: "Base64URL value should be a string" });
  const value = String(base64url);
  const pad2 = value.length % 4 === 0 ? "" : "=".repeat(4 - value.length % 4);
  try {
    return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/") + pad2);
  } catch (cause) {
    throw new ValidationError("INVALID_BASE64URL", { cause });
  }
}

// node_modules/libp2r2p/ecdh/index.js
function sharedXOnlySecret(seckey, pubkey) {
  if (!(seckey instanceof Uint8Array) || seckey.length !== 32 || !secp256k1.utils.isValidSecretKey(seckey)) {
    throw new ValidationError("INVALID_SECRET_KEY");
  }
  if (typeof pubkey !== "string" || !/^[0-9a-f]{64}$/.test(pubkey)) {
    throw new ValidationError("INVALID_PUBLIC_KEY");
  }
  try {
    return secp256k1.getSharedSecret(seckey, hexToBytes3(`02${pubkey}`)).subarray(1, 33);
  } catch (cause) {
    throw new ValidationError("INVALID_PUBLIC_KEY", { cause });
  }
}

// node_modules/libp2r2p/nip04/index.js
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8", { fatal: true });
function decodeBase64(value) {
  if (typeof value !== "string" || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new ValidationError("INVALID_BASE64");
  }
  const bytes = base64ToBytes(value);
  if (bytesToBase64(bytes) !== value) throw new ValidationError("NON_CANONICAL_BASE64");
  return bytes;
}
function conversationKey(secretKey, pubkey) {
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== 32) throw new ValidationError("INVALID_SECRET_KEY");
  if (typeof pubkey !== "string" || !/^[0-9a-f]{64}$/.test(pubkey)) throw new ValidationError("INVALID_PUBLIC_KEY");
  return sharedXOnlySecret(secretKey, pubkey);
}
function encrypt2(secretKey, pubkey, plaintext) {
  if (typeof plaintext !== "string") throw new ValidationError("PLAINTEXT_SHOULD_BE_A_STRING");
  const iv = randomBytes3(16);
  const ciphertext = cbc(conversationKey(secretKey, pubkey), iv).encrypt(encoder.encode(plaintext));
  return `${bytesToBase64(ciphertext)}?iv=${bytesToBase64(iv)}`;
}
function decrypt2(secretKey, pubkey, payload) {
  if (typeof payload !== "string") throw new ValidationError("CIPHERTEXT_SHOULD_BE_A_STRING");
  const parts = payload.split("?iv=");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new ValidationError("INVALID_NIP04_ENVELOPE");
  const ciphertext = decodeBase64(parts[0]);
  const iv = decodeBase64(parts[1]);
  if (iv.length !== 16 || ciphertext.length === 0 || ciphertext.length % 16 !== 0) throw new ValidationError("INVALID_NIP04_ENVELOPE");
  try {
    return decoder.decode(cbc(conversationKey(secretKey, pubkey), iv).decrypt(ciphertext));
  } catch (cause) {
    if (cause instanceof ValidationError && cause.code !== "INVALID_NIP04_CIPHERTEXT") throw cause;
    throw new ValidationError("INVALID_NIP04_CIPHERTEXT", { cause });
  }
}

// node_modules/libp2r2p/nip44/index.js
var nip44_exports = {};
__export(nip44_exports, {
  decrypt: () => decrypt3,
  encrypt: () => encrypt3,
  getConversationKey: () => getConversationKey
});

// node_modules/@noble/ciphers/_arx.js
var encodeStr = (str) => Uint8Array.from(str.split(""), (c) => c.charCodeAt(0));
var sigma16_32 = /* @__PURE__ */ (() => swap32IfBE(u32(encodeStr("expand 16-byte k"))))();
var sigma32_32 = /* @__PURE__ */ (() => swap32IfBE(u32(encodeStr("expand 32-byte k"))))();
function rotl(a, b) {
  return a << b | a >>> 32 - b;
}
var BLOCK_LEN = 64;
var BLOCK_LEN32 = 16;
var MAX_COUNTER = /* @__PURE__ */ (() => 2 ** 32 - 1)();
var U32_EMPTY = /* @__PURE__ */ Uint32Array.of();
function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
  const len = data.length;
  const block = new Uint8Array(BLOCK_LEN);
  const b32 = u32(block);
  const isAligned = isLE && isAligned32(data) && isAligned32(output);
  const d32 = isAligned ? u32(data) : U32_EMPTY;
  const o32 = isAligned ? u32(output) : U32_EMPTY;
  if (!isLE) {
    for (let pos = 0; pos < len; counter++) {
      core(sigma, key, nonce, b32, counter, rounds);
      swap32IfBE(b32);
      if (counter >= MAX_COUNTER)
        throw new Error("arx: counter overflow");
      const take = Math.min(BLOCK_LEN, len - pos);
      for (let j = 0, posj; j < take; j++) {
        posj = pos + j;
        output[posj] = data[posj] ^ block[j];
      }
      pos += take;
    }
    return;
  }
  for (let pos = 0; pos < len; counter++) {
    core(sigma, key, nonce, b32, counter, rounds);
    if (counter >= MAX_COUNTER)
      throw new Error("arx: counter overflow");
    const take = Math.min(BLOCK_LEN, len - pos);
    if (isAligned && take === BLOCK_LEN) {
      const pos32 = pos / 4;
      if (pos % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let j = 0, posj; j < BLOCK_LEN32; j++) {
        posj = pos32 + j;
        o32[posj] = d32[posj] ^ b32[j];
      }
      pos += BLOCK_LEN;
      continue;
    }
    for (let j = 0, posj; j < take; j++) {
      posj = pos + j;
      output[posj] = data[posj] ^ block[j];
    }
    pos += take;
  }
}
function createCipher(core, opts) {
  const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = checkOpts({ allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 }, opts);
  if (typeof core !== "function")
    throw new Error("core must be a function");
  anumber4(counterLength);
  anumber4(rounds);
  abool2(counterRight);
  abool2(allowShortKeys);
  return (key, nonce, data, output, counter = 0) => {
    abytes3(key, void 0, "key");
    abytes3(nonce, void 0, "nonce");
    abytes3(data, void 0, "data");
    const len = data.length;
    output = getOutput(len, output, false);
    anumber4(counter);
    if (counter < 0 || counter >= MAX_COUNTER)
      throw new Error("arx: counter overflow");
    const toClean = [];
    let l = key.length;
    let k;
    let sigma;
    if (l === 32) {
      toClean.push(k = copyBytes2(key));
      sigma = sigma32_32;
    } else if (l === 16 && allowShortKeys) {
      k = new Uint8Array(32);
      k.set(key);
      k.set(key, 16);
      sigma = sigma16_32;
      toClean.push(k);
    } else {
      abytes3(key, 32, "arx key");
      throw new Error("invalid key size");
    }
    if (!isLE || !isAligned32(nonce))
      toClean.push(nonce = copyBytes2(nonce));
    let k32 = u32(k);
    if (extendNonceFn) {
      if (nonce.length !== 24)
        throw new Error(`arx: extended nonce must be 24 bytes`);
      const n16 = nonce.subarray(0, 16);
      if (isLE)
        extendNonceFn(sigma, k32, u32(n16), k32);
      else {
        const sigmaRaw = swap32IfBE(Uint32Array.from(sigma));
        extendNonceFn(sigmaRaw, k32, u32(n16), k32);
        clean2(sigmaRaw);
        swap32IfBE(k32);
      }
      nonce = nonce.subarray(16);
    } else if (!isLE)
      swap32IfBE(k32);
    const nonceNcLen = 16 - counterLength;
    if (nonceNcLen !== nonce.length)
      throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
    if (nonceNcLen !== 12) {
      const nc = new Uint8Array(12);
      nc.set(nonce, counterRight ? 0 : 12 - nonce.length);
      nonce = nc;
      toClean.push(nonce);
    }
    const n32 = swap32IfBE(u32(nonce));
    try {
      runCipher(core, sigma, k32, n32, data, output, counter, rounds);
      return output;
    } finally {
      clean2(...toClean);
    }
  };
}

// node_modules/@noble/ciphers/chacha.js
function chachaCore(s, k, n, out, cnt, rounds = 20) {
  let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2];
  let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
  for (let r = 0; r < rounds; r += 2) {
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 16);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 12);
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 8);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 7);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 16);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 12);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 8);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 7);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 16);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 12);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 8);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 7);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 16);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 12);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 8);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 7);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 16);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 12);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 8);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 7);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 16);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 12);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 8);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 7);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 16);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 12);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 8);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 7);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 16);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 12);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 8);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 7);
  }
  let oi = 0;
  out[oi++] = y00 + x00 | 0;
  out[oi++] = y01 + x01 | 0;
  out[oi++] = y02 + x02 | 0;
  out[oi++] = y03 + x03 | 0;
  out[oi++] = y04 + x04 | 0;
  out[oi++] = y05 + x05 | 0;
  out[oi++] = y06 + x06 | 0;
  out[oi++] = y07 + x07 | 0;
  out[oi++] = y08 + x08 | 0;
  out[oi++] = y09 + x09 | 0;
  out[oi++] = y10 + x10 | 0;
  out[oi++] = y11 + x11 | 0;
  out[oi++] = y12 + x12 | 0;
  out[oi++] = y13 + x13 | 0;
  out[oi++] = y14 + x14 | 0;
  out[oi++] = y15 + x15 | 0;
}
var chacha20 = /* @__PURE__ */ createCipher(chachaCore, {
  counterRight: false,
  counterLength: 4,
  allowShortKeys: false
});

// node_modules/@noble/hashes/hkdf.js
function extract(hash, ikm, salt) {
  ahash(hash);
  if (salt === void 0)
    salt = new Uint8Array(hash.outputLen);
  return hmac(hash, salt, ikm);
}
var HKDF_COUNTER = /* @__PURE__ */ Uint8Array.of(0);
var EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
function expand(hash, prk, info, length = 32) {
  ahash(hash);
  anumber(length, "length");
  abytes(prk, void 0, "prk");
  const olen = hash.outputLen;
  if (prk.length < olen)
    throw new Error('"prk" must be at least HashLen octets');
  if (length > 255 * olen)
    throw new Error("Length must be <= 255*HashLen");
  const blocks = Math.ceil(length / olen);
  if (info === void 0)
    info = EMPTY_BUFFER;
  else
    abytes(info, void 0, "info");
  const okm = new Uint8Array(blocks * olen);
  const HMAC = hmac.create(hash, prk);
  const HMACTmp = HMAC._cloneInto();
  const T = new Uint8Array(HMAC.outputLen);
  for (let counter = 0; counter < blocks; counter++) {
    HKDF_COUNTER[0] = counter + 1;
    HMACTmp.update(counter === 0 ? EMPTY_BUFFER : T).update(info).update(HKDF_COUNTER).digestInto(T);
    okm.set(T, olen * counter);
    HMAC._cloneInto(HMACTmp);
  }
  HMAC.destroy();
  HMACTmp.destroy();
  clean(T, HKDF_COUNTER);
  return okm.slice(0, length);
}

// node_modules/libp2r2p/nip44/helpers.js
var encoder2 = new TextEncoder();
var decoder2 = new TextDecoder("utf-8", { fatal: true });
var minPlaintextSize = 1;
var maxPlaintextSize = 4294967295;
var maxRawPayloadSize = 1 + 32 + 6 + 4294967296 + 32;
var maxEncodedPayloadSize = Math.ceil(maxRawPayloadSize / 3) * 4;
function concatBytes4(...arrays) {
  const output = new Uint8Array(arrays.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of arrays) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}
function getMessageKeys(conversationKey2, nonce) {
  if (!(conversationKey2 instanceof Uint8Array) || conversationKey2.length !== 32) throw new ValidationError("INVALID_CONVERSATION_KEY");
  if (!(nonce instanceof Uint8Array) || nonce.length !== 32) throw new ValidationError("INVALID_NONCE");
  const keys = expand(sha256, conversationKey2, nonce, 76);
  return { key: keys.subarray(0, 32), nonce: keys.subarray(32, 44), hmacKey: keys.subarray(44) };
}
function calcPaddedLen(length) {
  if (!Number.isSafeInteger(length) || length < minPlaintextSize || length > maxPlaintextSize) throw new ValidationError("INVALID_PLAINTEXT_SIZE");
  if (length <= 32) return 32;
  const nextPower = 2 ** (Math.floor(Math.log2(length - 1)) + 1);
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((length - 1) / chunk) + 1);
}
function pad(plaintext) {
  if (typeof plaintext !== "string") throw new ValidationError("PLAINTEXT_SHOULD_BE_A_STRING");
  const bytes = encoder2.encode(plaintext);
  const length = bytes.length;
  calcPaddedLen(length);
  const prefixLength = length < 65536 ? 2 : 6;
  const prefix = new Uint8Array(prefixLength);
  const view = new DataView(prefix.buffer);
  if (prefixLength === 2) view.setUint16(0, length, false);
  else view.setUint32(2, length, false);
  return concatBytes4(prefix, bytes, new Uint8Array(calcPaddedLen(length) - length));
}
function unpad(padded) {
  if (!(padded instanceof Uint8Array) || padded.length < 2) throw new ValidationError("INVALID_PADDING");
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  const shortLength = view.getUint16(0, false);
  const prefixLength = shortLength === 0 ? 6 : 2;
  if (padded.length < prefixLength) throw new ValidationError("INVALID_PADDING");
  const length = shortLength === 0 ? view.getUint32(2, false) : shortLength;
  if (shortLength === 0 && length < 65536) throw new ValidationError("INVALID_PADDING");
  let expected;
  try {
    expected = prefixLength + calcPaddedLen(length);
  } catch (cause) {
    throw new ValidationError("INVALID_PADDING", { cause });
  }
  if (padded.length !== expected || prefixLength + length > padded.length) throw new ValidationError("INVALID_PADDING");
  try {
    return decoder2.decode(padded.subarray(prefixLength, prefixLength + length));
  } catch (cause) {
    throw new ValidationError("INVALID_UTF8", { cause });
  }
}
function encodePayload(conversationKey2, plaintext, nonce = randomBytes3(32)) {
  const messageKeys = getMessageKeys(conversationKey2, nonce);
  const ciphertext = chacha20(messageKeys.key, messageKeys.nonce, pad(plaintext));
  const mac = hmac(sha256, messageKeys.hmacKey, concatBytes4(nonce, ciphertext));
  return bytesToBase64(concatBytes4(new Uint8Array([2]), nonce, ciphertext, mac));
}
function decodePayload(conversationKey2, payload) {
  if (typeof payload !== "string" || payload.length < 132 || payload.length > maxEncodedPayloadSize || payload[0] === "#") throw new ValidationError("INVALID_NIP44_PAYLOAD");
  if (payload.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) throw new ValidationError("INVALID_BASE64");
  const data = base64ToBytes(payload);
  if (bytesToBase64(data) !== payload || data.length < 99 || data[0] !== 2) throw new ValidationError("INVALID_NIP44_PAYLOAD");
  const nonce = data.subarray(1, 33);
  const ciphertext = data.subarray(33, -32);
  const mac = data.subarray(-32);
  const messageKeys = getMessageKeys(conversationKey2, nonce);
  const calculated = hmac(sha256, messageKeys.hmacKey, concatBytes4(nonce, ciphertext));
  if (!equalBytes(mac, calculated)) throw new ValidationError("INVALID_MAC");
  return unpad(chacha20(messageKeys.key, messageKeys.nonce, ciphertext));
}
function extractConversationKey(sharedSecret, salt = "nip44-v2") {
  if (typeof salt !== "string") throw new ValidationError("SALT_SHOULD_BE_A_STRING");
  const saltBytes = encoder2.encode(salt);
  if (saltBytes.length === 0 || saltBytes.length > 32) throw new ValidationError("INVALID_SALT");
  return extract(sha256, sharedSecret, saltBytes);
}

// node_modules/libp2r2p/nip44/index.js
function getConversationKey(secretKey, pubkey, { salt = "nip44-v2" } = {}) {
  return extractConversationKey(sharedXOnlySecret(secretKey, pubkey), salt);
}
function encrypt3(plaintext, conversationKey2, nonce) {
  return encodePayload(conversationKey2, plaintext, nonce);
}
function decrypt3(ciphertext, conversationKey2) {
  return decodePayload(conversationKey2, ciphertext);
}

// src/helpers/crypto.js
var textEncoder4 = new TextEncoder();
var SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
var SHARED_KEY_SALT = textEncoder4.encode("nostr-shared-key-v1");
function bytesToBigInt(bytes) {
  return BigInt("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
}
function bigIntTo32Bytes(n) {
  const hex = n.toString(16).padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function deriveSecretKey(masterKeyBytes, info = new Uint8Array(), salt = new Uint8Array()) {
  if (typeof salt === "string") salt = textEncoder4.encode(salt);
  if (typeof info === "string") info = textEncoder4.encode(info);
  const baseKey = await globalThis.crypto.subtle.importKey(
    "raw",
    masterKeyBytes,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );
  const buffer = await globalThis.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info
    },
    baseKey,
    48 * 8
  );
  const wide = bytesToBigInt(new Uint8Array(buffer));
  return bigIntTo32Bytes(wide % (SECP256K1_N - 1n) + 1n);
}
async function deriveSharedKey(mySeckey, theirPubkey, info = "") {
  const sharedSecret = sharedXOnlySecret(mySeckey, theirPubkey);
  return await deriveSecretKey(
    sharedSecret,
    // Caller/protocol context. The fixed salt below names this shared-key
    // scalar derivation, while info separates uses within that derivation.
    info,
    SHARED_KEY_SALT
  );
}

// node_modules/libp2r2p/double-dh/index.js
var textEncoder5 = new TextEncoder();
var DOUBLE_DH_SALT = textEncoder5.encode("nostr-double-dh-v1");
function u32be(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}
function normalizeKind(kind) {
  const n = typeof kind === "string" && kind.trim() !== "" ? Number(kind) : kind;
  if (!Number.isInteger(n) || n < 0 || n > 4294967295) throw new ValidationError("INVALID_KIND");
  return n;
}
function sharedX(secretKey, pubkey) {
  return sharedXOnlySecret(secretKey, pubkey);
}
function modeFor({ senderContentPubkey, receiverContentPubkey }) {
  if (senderContentPubkey && receiverContentPubkey) return "both-content";
  if (senderContentPubkey) return "sender-content";
  if (receiverContentPubkey) return "receiver-content";
  return "identity";
}
function orderedPair({ identityPubkey, contentPubkey, peerIdentityPubkey, peerContentPubkey }) {
  const self = { identityPubkey, contentPubkey: contentPubkey || "", isSelf: true };
  const peer = { identityPubkey: peerIdentityPubkey, contentPubkey: peerContentPubkey || "", isSelf: false };
  return identityPubkey <= peerIdentityPubkey ? [self, peer] : [peer, self];
}
function hkdfInfo({ kind, scope = "" }) {
  const scopeBytes = textEncoder5.encode(scope || "");
  return concatBytes(u32be(normalizeKind(kind)), u32be(scopeBytes.length), scopeBytes);
}
function identityIdentity({ a, b, identitySecretKey }) {
  return sharedX(identitySecretKey, b.isSelf ? a.identityPubkey : b.identityPubkey);
}
function aContentBIdentity({ a, b, identitySecretKey, contentSecretKey }) {
  return a.isSelf ? sharedX(contentSecretKey, b.identityPubkey) : sharedX(identitySecretKey, a.contentPubkey);
}
function aIdentityBContent({ a, b, identitySecretKey, contentSecretKey }) {
  return a.isSelf ? sharedX(identitySecretKey, b.contentPubkey) : sharedX(contentSecretKey, a.identityPubkey);
}
function contentContent({ a, b, contentSecretKey }) {
  return a.isSelf ? sharedX(contentSecretKey, b.contentPubkey) : sharedX(contentSecretKey, a.contentPubkey);
}
function deriveDoubleDhConversationKey({
  role,
  identitySecretKey,
  identityPubkey,
  contentSecretKey,
  contentPubkey = "",
  peerIdentityPubkey,
  peerContentPubkey = "",
  kind,
  scope = ""
}) {
  if (role !== "sender" && role !== "receiver") throw new ValidationError("INVALID_DOUBLE_DH_ROLE");
  if (!identitySecretKey || !identityPubkey || !peerIdentityPubkey) throw new ValidationError("DOUBLE_DH_IDENTITY_REQUIRED");
  if (!(identitySecretKey instanceof Uint8Array) || !secp256k1.utils.isValidSecretKey(identitySecretKey)) {
    throw new ValidationError("INVALID_SECRET_KEY");
  }
  for (const pubkey of [identityPubkey, peerIdentityPubkey, contentPubkey, peerContentPubkey]) {
    if (pubkey && (typeof pubkey !== "string" || !/^[0-9a-f]{64}$/.test(pubkey))) {
      throw new ValidationError("INVALID_PUBLIC_KEY");
    }
  }
  if (contentSecretKey != null && (!(contentSecretKey instanceof Uint8Array) || !secp256k1.utils.isValidSecretKey(contentSecretKey))) {
    throw new ValidationError("INVALID_CONTENT_SECRET_KEY");
  }
  if (typeof scope !== "string") throw new ValidationError("INVALID_SCOPE");
  const isSender = role === "sender";
  const senderContentPubkey = isSender ? contentPubkey : peerContentPubkey;
  const receiverContentPubkey = isSender ? peerContentPubkey : contentPubkey;
  const mode = modeFor({ senderContentPubkey, receiverContentPubkey });
  if (mode === "identity") return { mode, conversationKey: null };
  if (isSender && senderContentPubkey && !contentSecretKey) throw new ValidationError("SENDER_CONTENT_KEY_REQUIRED");
  if (!isSender && receiverContentPubkey && !contentSecretKey) throw new ValidationError("RECEIVER_CONTENT_KEY_REQUIRED");
  const [a, b] = orderedPair({ identityPubkey, contentPubkey, peerIdentityPubkey, peerContentPubkey });
  const steps = [];
  if (identityPubkey === peerIdentityPubkey) {
    const ownContentPubkey = contentPubkey || peerContentPubkey;
    if (ownContentPubkey && !contentSecretKey) {
      throw new ValidationError(isSender ? "SENDER_CONTENT_KEY_REQUIRED" : "RECEIVER_CONTENT_KEY_REQUIRED");
    }
    steps.push(sharedX(identitySecretKey, identityPubkey));
    if (ownContentPubkey) {
      steps.push(sharedX(contentSecretKey, ownContentPubkey));
    }
  } else {
    steps.push(identityIdentity({ a, b, identitySecretKey }));
    if (a.contentPubkey && b.contentPubkey) {
      steps.push(contentContent({ a, b, contentSecretKey }));
    } else if (a.contentPubkey) {
      steps.push(aContentBIdentity({ a, b, identitySecretKey, contentSecretKey }));
    } else if (b.contentPubkey) {
      steps.push(aIdentityBContent({ a, b, identitySecretKey, contentSecretKey }));
    }
  }
  const ikm = concatBytes(...steps);
  const prk = extract(sha256, ikm, DOUBLE_DH_SALT);
  return {
    mode,
    conversationKey: expand(sha256, prk, hkdfInfo({ kind, scope }), 32)
  };
}

// node_modules/libp2r2p/nip44-v3/index.js
var PAD = { minimum_size: 32, subdivs_small: 4, subdivs_large: 8, large_threshold: 32768 };
var VERSION = 3;
var ZERO_NONCE = new Uint8Array(12);
var textDecoder2 = new TextDecoder("utf-8", { ignoreBOM: true });
var fatalTextDecoder2 = new TextDecoder("utf-8", { fatal: true });
function targetSize(len) {
  if (len <= 0) return PAD.minimum_size;
  const nextPower = 2 ** Math.ceil(Math.log2(len));
  const subdivs = nextPower >= PAD.large_threshold ? PAD.subdivs_large : PAD.subdivs_small;
  const chunkSize = Math.max(PAD.minimum_size, Math.floor(nextPower / subdivs));
  return chunkSize * Math.ceil(len / chunkSize);
}
function u32be2(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}
function readU32be(b, off) {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(off, false);
}
function areBytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function randomBytes32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}
function assertBytes(value, code, length) {
  if (!(value instanceof Uint8Array) || length !== void 0 && value.length !== length) {
    throw new ValidationError(code);
  }
  return value;
}
function chacha(key, data) {
  return chacha20(key, ZERO_NONCE, data);
}
function base64EncodedByteLength(byteLength3) {
  return Math.ceil(byteLength3 / 3) * 4;
}
function payloadByteLength(plaintextByteLength, scopeByteLength = 0) {
  return base64EncodedByteLength(73 + scopeByteLength + targetSize(plaintextByteLength + 4));
}
function deriveKeysFromConversationKey(conversationKey2, nonce) {
  assertBytes(conversationKey2, "INVALID_CONVERSATION_KEY", 32);
  assertBytes(nonce, "INVALID_NONCE", 32);
  const salt = concatBytes(utf8ToBytes("nip44-v3\0"), nonce);
  const prk = extract(sha256, conversationKey2, salt);
  return {
    prk,
    encryption_key: expand(sha256, prk, utf8ToBytes("encryption_key"), 32),
    mac_key: expand(sha256, prk, utf8ToBytes("mac_key"), 32)
  };
}
function encryptBytes(seckey, pubkey, kind, scope, plaintext, nonce) {
  return encryptWithConversationKeyBytes(deriveSharedConversationKey(seckey, pubkey), kind, scope, plaintext, nonce);
}
function encryptWithConversationKeyBytes(conversationKey2, kind, scope, plaintext, nonce) {
  nonce ??= randomBytes32();
  assertBytes(conversationKey2, "INVALID_CONVERSATION_KEY", 32);
  kind = normalizeKind2(kind);
  assertBytes(scope, "INVALID_SCOPE");
  assertBytes(plaintext, "INVALID_PLAINTEXT");
  assertBytes(nonce, "INVALID_NONCE", 32);
  const { encryption_key: encryptionKey, mac_key: macKey } = deriveKeysFromConversationKey(conversationKey2, nonce);
  const prefixed = concatBytes(u32be2(plaintext.length), plaintext);
  const padded = new Uint8Array(targetSize(prefixed.length));
  padded.set(prefixed);
  const ct = chacha(encryptionKey, padded);
  const stuffing = concatBytes(u32be2(kind), u32be2(scope.length), scope, ct);
  const mac = hmac(sha256, macKey, concatBytes(nonce, stuffing));
  return bytesToBase64(concatBytes(new Uint8Array([VERSION]), nonce, mac, stuffing));
}
function decryptBytes(seckey, pubkey, expectedKind, expectedScope, ciphertext) {
  return decryptWithConversationKeyBytes(deriveSharedConversationKey(seckey, pubkey), expectedKind, expectedScope, ciphertext);
}
function decryptWithConversationKeyBytes(conversationKey2, expectedKind, expectedScope, ciphertext) {
  assertBytes(conversationKey2, "INVALID_CONVERSATION_KEY", 32);
  expectedKind = normalizeKind2(expectedKind);
  assertBytes(expectedScope, "INVALID_SCOPE");
  if (typeof ciphertext !== "string" || ciphertext.length === 0) throw new ValidationError("EMPTY_CIPHERTEXT", { message: "empty ciphertext" });
  if (ciphertext[0] === "#") throw new ValidationError("UNSUPPORTED_NIP44_VERSION", { message: "unsupported future version" });
  let decoded;
  try {
    decoded = base64ToBytes(ciphertext);
  } catch (cause) {
    throw new ValidationError("INVALID_BASE64", { message: "invalid base64", cause });
  }
  if (decoded.length < 77) throw new ValidationError("NIP44_CIPHERTEXT_TOO_SHORT", { message: "ciphertext too short" });
  if (decoded[0] !== VERSION) throw new ValidationError("UNSUPPORTED_NIP44_VERSION", { message: `unsupported version ${decoded[0]}` });
  const nonce = decoded.subarray(1, 33);
  const mac = decoded.subarray(33, 65);
  const kind = readU32be(decoded, 65);
  const scopeLength = readU32be(decoded, 69);
  if (scopeLength > decoded.length - 73) throw new ValidationError("INVALID_NIP44_SCOPE_LENGTH", { message: "invalid scope length" });
  const scope = decoded.subarray(73, 73 + scopeLength);
  try {
    fatalTextDecoder2.decode(scope);
  } catch (cause) {
    throw new ValidationError("INVALID_NIP44_SCOPE_UTF8", { message: "scope is not valid UTF-8", cause });
  }
  const ct = decoded.subarray(73 + scopeLength);
  if (ct.length < 4) throw new ValidationError("NIP44_CIPHERTEXT_TOO_SHORT", { message: "ciphertext too short" });
  if (kind !== expectedKind) throw new ValidationError("NIP44_KIND_MISMATCH", { message: `kind mismatch: got ${kind}, expected ${expectedKind}` });
  if (!areBytesEqual(scope, expectedScope)) throw new ValidationError("NIP44_SCOPE_MISMATCH", { message: "scope mismatch" });
  const { encryption_key: encryptionKey, mac_key: macKey } = deriveKeysFromConversationKey(conversationKey2, nonce);
  const authData = concatBytes(nonce, u32be2(kind), u32be2(scope.length), scope, ct);
  if (!areBytesEqual(mac, hmac(sha256, macKey, authData))) throw new ValidationError("INVALID_MAC", { message: "invalid MAC" });
  const padded = chacha(encryptionKey, ct);
  const plaintextLength = readU32be(padded, 0);
  if (plaintextLength + 4 > padded.length) throw new ValidationError("INVALID_PLAINTEXT_LENGTH", { message: "invalid plaintext length" });
  if (plaintextLength > 2 ** 31 - 1) throw new ValidationError("PLAINTEXT_TOO_LONG", { message: "plaintext too long" });
  const padding = padded.subarray(4 + plaintextLength);
  if (!areBytesEqual(padding, new Uint8Array(padding.length))) throw new ValidationError("INVALID_PADDING", { message: "invalid padding" });
  return padded.subarray(4, 4 + plaintextLength);
}
function deriveSharedConversationKey(seckey, pubkey) {
  return sharedXOnlySecret(seckey, pubkey);
}
function normalizeKind2(kind) {
  const n = typeof kind === "string" && kind.trim() !== "" ? Number(kind) : kind;
  if (!Number.isInteger(n) || n < 0 || n > 4294967295) throw new ValidationError("INVALID_KIND");
  return n;
}
function encrypt4(seckey, pubkey, kind, scope, plaintext) {
  return encryptBytes(seckey, pubkey, normalizeKind2(kind), utf8ToBytes(scope || ""), utf8ToBytes(plaintext));
}
function decrypt4(seckey, pubkey, kind, scope, ciphertext) {
  return textDecoder2.decode(decryptBytes(seckey, pubkey, normalizeKind2(kind), utf8ToBytes(scope || ""), ciphertext));
}
function encryptWithConversationKey(conversationKey2, kind, scope, plaintext) {
  return encryptWithConversationKeyBytes(conversationKey2, normalizeKind2(kind), utf8ToBytes(scope || ""), utf8ToBytes(plaintext));
}
function decryptWithConversationKey(conversationKey2, kind, scope, ciphertext) {
  return textDecoder2.decode(decryptWithConversationKeyBytes(conversationKey2, normalizeKind2(kind), utf8ToBytes(scope || ""), ciphertext));
}
function nip07Encrypt(seckey, pubkey, kind, scope, plaintextB64) {
  return encryptBytes(seckey, pubkey, normalizeKind2(kind), utf8ToBytes(scope || ""), base64ToBytes(plaintextB64));
}
function nip07Decrypt(seckey, pubkey, kind, scope, ciphertext) {
  return bytesToBase64(decryptBytes(seckey, pubkey, normalizeKind2(kind), utf8ToBytes(scope || ""), ciphertext));
}
var b64encode = bytesToBase64;
var b64decode = base64ToBytes;
var toBytes = utf8ToBytes;

// node_modules/libp2r2p/relay/constants/index.js
var seedRelays = [
  "wss://relay.44billion.net",
  "wss://purplepag.es",
  "wss://user.kindpag.es",
  "wss://relay.nos.social",
  // Disabled 2026-08-05: accepted kind:10002 with OK but did not broadcast it
  // to a live subscription within 15 seconds. Keep for future retesting.
  // 'wss://nostr.land',
  "wss://indexer.coracle.social"
];
var freeRelays = [
  "wss://relay.44billion.net",
  "wss://nos.lol",
  "wss://relay.primal.net"
];

// node_modules/libp2r2p/relay/helpers/routing.js
var DEFAULT_RELAYS_PER_PUBKEY = 2;
function pickRelaysForPubkeys(pubkeys, relaysByPubkey2, { maxPerPubkey = DEFAULT_RELAYS_PER_PUBKEY, relayType = "write" } = {}) {
  const type = relayType === "read" ? "read" : "write";
  const pkToPossibleRelays = /* @__PURE__ */ new Map();
  for (const pk of pubkeys) {
    const relays = relaysByPubkey2[pk]?.[type] || [];
    pkToPossibleRelays.set(pk, new Set(relays.length ? relays : freeRelays.slice(0, DEFAULT_RELAYS_PER_PUBKEY)));
  }
  const relayCounts = /* @__PURE__ */ new Map();
  for (const relays of pkToPossibleRelays.values()) {
    for (const relay of relays) relayCounts.set(relay, (relayCounts.get(relay) || 0) + 1);
  }
  const rankedRelays = [...relayCounts.keys()].sort((a, b) => relayCounts.get(b) - relayCounts.get(a));
  const relayToAuthors = /* @__PURE__ */ new Map();
  for (const pk of pubkeys) {
    const possibleRelays = pkToPossibleRelays.get(pk);
    let assigned = 0;
    for (const relay of rankedRelays) {
      if (assigned >= maxPerPubkey) break;
      if (!possibleRelays.has(relay)) continue;
      if (!relayToAuthors.has(relay)) relayToAuthors.set(relay, []);
      relayToAuthors.get(relay).push(pk);
      assigned++;
    }
  }
  return relayToAuthors;
}

// node_modules/libp2r2p/relay/helpers/hll.js
var REGISTER_COUNT = 256;
var HLL_HEX_LENGTH = REGISTER_COUNT * 2;
function assertRegisters(registers) {
  if (!(registers instanceof Uint8Array) || registers.length !== REGISTER_COUNT) {
    throw new ValidationError("INVALID_HLL_REGISTERS");
  }
}
function decodeHll(value) {
  if (typeof value !== "string" || value.length !== HLL_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(value)) {
    return null;
  }
  const registers = new Uint8Array(REGISTER_COUNT);
  for (let index = 0; index < REGISTER_COUNT; index++) {
    registers[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return registers;
}
function encodeHll(registers) {
  assertRegisters(registers);
  let value = "";
  for (const register of registers) value += register.toString(16).padStart(2, "0");
  return value;
}
function mergeHll(target, source) {
  assertRegisters(target);
  assertRegisters(source);
  for (let index = 0; index < REGISTER_COUNT; index++) {
    if (source[index] > target[index]) target[index] = source[index];
  }
  return target;
}
function estimateHllCount(registers) {
  assertRegisters(registers);
  let zeroes = 0;
  let sum = 0;
  for (const register of registers) {
    if (register === 0) zeroes++;
    sum += 1 / 2 ** register;
  }
  if (zeroes > 0) {
    const linearCount = REGISTER_COUNT * Math.log(REGISTER_COUNT / zeroes);
    if (linearCount <= 220) return Math.floor(linearCount);
    if (sum > 0 && 0.7182725932495458 * REGISTER_COUNT * REGISTER_COUNT / sum <= REGISTER_COUNT * 3) {
      return Math.floor(linearCount);
    }
  }
  return Math.floor(0.7182725932495458 * REGISTER_COUNT * REGISTER_COUNT / sum);
}

// node_modules/libp2r2p/relay/helpers/timer.js
function maybeUnref(timer) {
  timer?.unref?.();
  return timer;
}

// node_modules/libp2r2p/relay/helpers/publish.js
function publishTimeoutError() {
  return new Error("PUBLISH_TIMEOUT");
}
function firstFulfillment(promises, timeout, { fallback } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let rejected = 0;
    let timer = null;
    const finish = (success) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(success);
    };
    if (timeout !== null) timer = maybeUnref(setTimeout(() => finish(false), timeout));
    for (const promise of promises) {
      Promise.resolve(promise).then(
        () => finish(true),
        () => {
          rejected++;
          if (rejected === promises.length) finish(false);
        }
      );
    }
    if (fallback) Promise.resolve(fallback).then(finish, () => finish(false));
  });
}
function createPublishSettlements(promises, timeout, { onSettled } = {}) {
  const settlements = new Array(promises.length);
  let remaining = promises.length;
  let timer = null;
  let isFinished = false;
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  const finish = () => {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(timer);
    resolve(settlements);
  };
  const settle = (index, settlement) => {
    if (settlements[index]) return;
    settlements[index] = settlement;
    onSettled?.(settlement, index);
    remaining--;
    if (remaining === 0) finish();
  };
  const timeoutPending = () => {
    if (isFinished) return;
    for (let index = 0; index < settlements.length; index++) {
      settle(index, { status: "rejected", outcome: "timed-out", reason: publishTimeoutError() });
    }
  };
  if (remaining === 0) finish();
  else {
    if (timeout !== null) timer = maybeUnref(setTimeout(timeoutPending, timeout));
    promises.forEach((promise2, index) => {
      Promise.resolve(promise2).then(
        (value) => settle(index, { status: "fulfilled", value }),
        (reason) => settle(index, { status: "rejected", outcome: "failed", reason })
      );
    });
  }
  return { promise, timeout: timeoutPending };
}
function publishSummary(settlements, relays, { includeSucceededRelays = false } = {}) {
  const succeededRelays = [];
  const errors = [];
  settlements.forEach((settlement, index) => {
    if (settlement.status === "fulfilled") succeededRelays.push(relays[index]);
    else errors.push({ relay: relays[index], reason: settlement.reason });
  });
  const summary = {
    success: succeededRelays.length > 0,
    total: relays.length,
    fulfilled: succeededRelays.length,
    errors
  };
  if (includeSucceededRelays) summary.succeededRelays = succeededRelays;
  return summary;
}

// node_modules/libp2r2p/url/index.js
function removeEmptyQuerySegments(url) {
  const entries = [...url.searchParams];
  url.search = "";
  for (const [key, value] of entries) url.searchParams.append(key, value);
  url.searchParams.sort();
}
function normalizeRelayUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError("INVALID_RELAY_URL", { message: "URL_SHOULD_BE_A_STRING" });
  }
  let input = value.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `wss://${input}`;
  let url;
  try {
    url = new URL(input);
  } catch (cause) {
    throw new ValidationError("INVALID_RELAY_URL", { cause });
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new ValidationError("INVALID_RELAY_PROTOCOL");
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (url.pathname === "/") url.pathname = "";
  if (url.protocol === "ws:" && url.port === "80" || url.protocol === "wss:" && url.port === "443") url.port = "";
  removeEmptyQuerySegments(url);
  url.hash = "";
  return url.toString().replace(/^(wss?:\/\/[^/?#]+)\/(?=[?#]|$)/, "$1");
}

// node_modules/libp2r2p/relay/services/relay-connection.js
var DEFAULT_CONNECT_TIMEOUT = 3e3;
var DEFAULT_OPERATION_TIMEOUT = 3e4;
function errorFrom(reason, fallback) {
  return reason instanceof Error ? reason : new Error(String(reason || fallback));
}
function hasMatchingPrefix(values, candidate) {
  return !values || values.some((value) => typeof value === "string" && candidate.startsWith(value));
}
function doesEventMatchFilter(filter, event) {
  if (filter.ids && !hasMatchingPrefix(filter.ids, event.id)) return false;
  if (filter.authors && !hasMatchingPrefix(filter.authors, event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since != null && event.created_at < filter.since) return false;
  if (filter.until != null && event.created_at > filter.until) return false;
  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith("#") || !Array.isArray(values)) continue;
    const name = key.slice(1);
    if (!event.tags.some((tag) => tag[0] === name && values.includes(tag[1]))) return false;
  }
  return true;
}
function doesEventMatchAnyFilter(filters, event) {
  return filters.some((filter) => doesEventMatchFilter(filter, event));
}
async function messageText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  if (typeof data?.text === "function") return await data.text();
  throw new ValidationError("INVALID_RELAY_MESSAGE");
}
var RelayConnection = class {
  #WebSocket;
  #connectPromise = null;
  #challenge = null;
  #serial = 0;
  #subscriptions = /* @__PURE__ */ new Map();
  #publishes = /* @__PURE__ */ new Map();
  #authentications = /* @__PURE__ */ new Map();
  #counts = /* @__PURE__ */ new Map();
  constructor(url, { WebSocket: WebSocketImpl = globalThis.WebSocket } = {}) {
    this.url = url;
    this.#WebSocket = WebSocketImpl;
    this.ws = null;
    this.publishTimeout = DEFAULT_OPERATION_TIMEOUT;
    this.onnotice = null;
    this.onerror = null;
    this.onclose = null;
    this.onauth = null;
  }
  async connect({ timeout = DEFAULT_CONNECT_TIMEOUT, signal } = {}) {
    if (this.ws?.readyState === 1) return;
    if (this.#connectPromise) return await this.#connectPromise;
    if (signal?.aborted) throw new Error("CONNECT_ABORTED");
    if (typeof this.#WebSocket !== "function") throw new Error("WEBSOCKET_UNAVAILABLE");
    this.#connectPromise = new Promise((resolve, reject) => {
      const socket = new this.#WebSocket(this.url);
      this.ws = socket;
      let settled = false;
      const finish = (reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (reason) {
          try {
            socket.close();
          } catch {
          }
          reject(reason);
        } else resolve();
      };
      const onAbort = () => finish(new Error("CONNECT_ABORTED"));
      const timer = timeout === null ? null : maybeUnref(setTimeout(() => finish(new Error("CONNECT_TIMEOUT")), timeout));
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.onopen = () => finish();
      socket.onerror = (event) => {
        const reason = errorFrom(event?.error, "CONNECTION_ERROR");
        if (!settled) finish(reason);
        else this.onerror?.(reason);
      };
      socket.onmessage = (event) => {
        this.#handleMessage(event).catch((reason) => this.onerror?.(reason));
      };
      socket.onclose = (event) => {
        if (!settled) finish(new Error("CONNECTION_CLOSED"));
        if (this.ws === socket) this.ws = null;
        this.#handleClose(event);
      };
    }).finally(() => {
      this.#connectPromise = null;
    });
    return await this.#connectPromise;
  }
  send(message) {
    if (this.ws?.readyState !== 1) throw new Error("CONNECTION_CLOSED");
    this.ws.send(message);
  }
  subscribe(filters, handlers = {}) {
    if (!Array.isArray(filters) || !filters.length) throw new ValidationError("SUBSCRIPTION_FILTERS_REQUIRED");
    const id = `p2r2p-sub:${++this.#serial}`;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      const subscription = this.#subscriptions.get(id);
      if (!subscription) return;
      this.#subscriptions.delete(id);
      try {
        this.send(JSON.stringify(["CLOSE", id]));
      } catch {
      }
      handlers.onclose?.();
    };
    this.#subscriptions.set(id, { filters, handlers, close });
    try {
      this.send(JSON.stringify(["REQ", id, ...filters]));
    } catch (error) {
      this.#subscriptions.delete(id);
      throw error;
    }
    return { id, close };
  }
  publish(event) {
    if (!isValidEvent(event)) return Promise.reject(new Error("INVALID_EVENT"));
    return this.#sendEventOperation("EVENT", event, this.#publishes, "PUBLISH_TIMEOUT");
  }
  async authenticate(getAuthEvent) {
    if (!this.#challenge) throw new Error("AUTH_CHALLENGE_MISSING");
    const event = await getAuthEvent({ relay: this.url, challenge: this.#challenge });
    if (!isValidEvent(event)) throw new ValidationError("INVALID_AUTH_EVENT");
    return await this.#sendEventOperation("AUTH", event, this.#authentications, "AUTH_TIMEOUT");
  }
  #sendEventOperation(type, event, map, timeoutCode) {
    if (map.has(event.id)) return map.get(event.id).promise;
    const deferred6 = Promise.withResolvers();
    const timer = maybeUnref(setTimeout(() => this.#settleEvent(map, event.id, new Error(timeoutCode)), this.publishTimeout));
    map.set(event.id, { ...deferred6, timer, promise: deferred6.promise });
    try {
      this.send(JSON.stringify([type, event]));
    } catch (error) {
      this.#settleEvent(map, event.id, error);
    }
    return deferred6.promise;
  }
  countWithHll(filters, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(new Error("COUNT_ABORTED"));
    const id = `p2r2p-count:${++this.#serial}`;
    const deferred6 = Promise.withResolvers();
    const onAbort = () => this.#settleCount(id, null, new Error("COUNT_ABORTED"));
    this.#counts.set(id, { ...deferred6, signal, onAbort });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      this.send(JSON.stringify(["COUNT", id, ...filters]));
    } catch (error) {
      this.#settleCount(id, null, error);
    }
    return deferred6.promise;
  }
  #settleEvent(map, id, reason, value) {
    const pending = map.get(id);
    if (!pending) return;
    map.delete(id);
    clearTimeout(pending.timer);
    if (reason) pending.reject(errorFrom(reason, "OPERATION_REJECTED"));
    else pending.resolve(value);
  }
  #settleCount(id, payload, reason) {
    const pending = this.#counts.get(id);
    if (!pending) return;
    this.#counts.delete(id);
    pending.signal?.removeEventListener("abort", pending.onAbort);
    if (reason) pending.reject(errorFrom(reason, "COUNT_REJECTED"));
    else pending.resolve(payload);
  }
  async #handleMessage(message) {
    let data;
    try {
      data = JSON.parse(await messageText(message.data));
    } catch (cause) {
      if (cause instanceof ValidationError) throw cause;
      throw new ValidationError("INVALID_RELAY_MESSAGE", { cause });
    }
    if (!Array.isArray(data) || typeof data[0] !== "string") throw new ValidationError("INVALID_RELAY_MESSAGE");
    if (data[0] === "EVENT") {
      const subscription = this.#subscriptions.get(data[1]);
      if (!subscription) return;
      const event = data[2];
      if (!isValidEvent(event) || !doesEventMatchAnyFilter(subscription.filters, event)) subscription.handlers.oninvalidevent?.(event);
      else subscription.handlers.onevent?.(event);
      return;
    }
    if (data[0] === "EOSE") {
      this.#subscriptions.get(data[1])?.handlers.oneose?.();
      return;
    }
    if (data[0] === "CLOSED") {
      const id = data[1];
      const subscription = this.#subscriptions.get(id);
      if (subscription) {
        this.#subscriptions.delete(id);
        subscription.handlers.onclose?.(errorFrom(data[2], "SUBSCRIPTION_CLOSED"));
      } else this.#settleCount(id, null, errorFrom(data[2], "COUNT_CLOSED"));
      return;
    }
    if (data[0] === "OK") {
      const reason = data[2] === true ? null : errorFrom(data[3], "EVENT_REJECTED");
      this.#settleEvent(this.#publishes, data[1], reason, data[3]);
      this.#settleEvent(this.#authentications, data[1], reason, data[3]);
      return;
    }
    if (data[0] === "AUTH" && typeof data[1] === "string") {
      this.#challenge = data[1];
      this.onauth?.(data[1]);
      return;
    }
    if (data[0] === "COUNT") {
      this.#settleCount(data[1], data[2]);
      return;
    }
    if (data[0] === "NOTICE") this.onnotice?.(String(data[1] ?? ""));
  }
  #handleClose(event) {
    this.#challenge = null;
    const reason = errorFrom(event?.reason, "CONNECTION_CLOSED");
    for (const [id, subscription] of this.#subscriptions) {
      this.#subscriptions.delete(id);
      subscription.handlers.onclose?.(reason);
    }
    for (const id of [...this.#publishes.keys()]) this.#settleEvent(this.#publishes, id, reason);
    for (const id of [...this.#authentications.keys()]) this.#settleEvent(this.#authentications, id, reason);
    for (const id of [...this.#counts.keys()]) this.#settleCount(id, null, reason);
    this.onclose?.(reason);
  }
  async close() {
    const socket = this.ws;
    this.ws = null;
    this.#challenge = null;
    const reason = new Error("CONNECTION_CLOSED");
    for (const [id, subscription] of this.#subscriptions) {
      this.#subscriptions.delete(id);
      subscription.handlers.onclose?.();
    }
    for (const id of [...this.#publishes.keys()]) this.#settleEvent(this.#publishes, id, reason);
    for (const id of [...this.#authentications.keys()]) this.#settleEvent(this.#authentications, id, reason);
    for (const id of [...this.#counts.keys()]) this.#settleCount(id, null, reason);
    if (socket && socket.readyState < 2) socket.close();
  }
};

// node_modules/libp2r2p/relay/services/relay-pool.js
var CONNECTION_TIMEOUT_MS = 3e3;
var COUNT_TIMEOUT_MS = 5e3;
var COUNT_TIMEOUT_AFTER_FIRST_COUNT_MS = 500;
var SEND_TIMEOUT_UNTIL_FIRST_FULFILLMENT_MS = 3e3;
var SEND_TIMEOUT_MS = 3e4;
function makeEarlyCloseChecker(filter, onSatisfied) {
  let count = 0;
  const remainingIds = filter.ids?.length > 0 ? new Set(filter.ids) : null;
  const limit = filter.limit > 0 ? filter.limit : null;
  let satisfied = false;
  return (event) => {
    if (satisfied) return;
    count++;
    if (remainingIds && event?.id) remainingIds.delete(event.id);
    if (limit !== null && count >= limit || remainingIds !== null && remainingIds.size === 0) {
      satisfied = true;
      onSatisfied();
    }
  };
}
function relayResultForSettlement(relay, settlement) {
  if (settlement.status === "fulfilled") {
    return {
      relay,
      success: true,
      outcome: settlement.value || "published"
    };
  }
  return {
    relay,
    success: false,
    outcome: settlement.outcome || "failed",
    reason: settlement.reason
  };
}
function notifyRelayResult(onRelayResult, result) {
  if (!onRelayResult) return;
  try {
    Promise.resolve(onRelayResult(result)).catch((error) => {
      console.error("RelayPool onRelayResult failed:", error);
    });
  } catch (error) {
    console.error("RelayPool onRelayResult failed:", error);
  }
}
function requiresNip42Auth(reason) {
  return reason.message.startsWith("auth-required:") || reason.message.startsWith("restricted:");
}
function countResponseError() {
  return new Error("INVALID_COUNT_RESPONSE");
}
function countTimeoutError() {
  return new Error("COUNT_TIMEOUT");
}
function getEventsTimeoutError() {
  return new Error("GET_EVENTS_TIMEOUT");
}
function normalizedRelayUrls(relays) {
  const urls = [];
  const seen = /* @__PURE__ */ new Set();
  for (const relay of relays || []) {
    const normalizedUrl = normalizeRelayUrl(relay);
    if (seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    urls.push(relay);
  }
  return urls;
}
function isCountResponse(payload) {
  return Number.isSafeInteger(payload?.count) && payload.count >= 0;
}
var Nip42AuthenticationError = class extends Error {
  constructor(reason) {
    super(reason.message, { cause: reason });
    this.name = "Nip42AuthenticationError";
  }
};
var RelayPool = class {
  #relays = /* @__PURE__ */ new Map();
  #relayTimeouts = /* @__PURE__ */ new Map();
  #liveSubCounts = /* @__PURE__ */ new Map();
  // url -> number of active live subscriptions
  #timeout = 3e4;
  // 30 seconds
  #createRelay;
  constructor({ _createRelay = (url) => new RelayConnection(url) } = {}) {
    this.#createRelay = _createRelay;
  }
  #scheduleIdleDisconnect(url) {
    clearTimeout(this.#relayTimeouts.get(url));
    this.#relayTimeouts.set(url, maybeUnref(setTimeout(() => this.disconnect(url), this.#timeout)));
  }
  // Opens a normalized pooled connection. Failed connects are evicted so a later
  // retry creates a fresh RelayConnection instead of reusing broken socket state.
  async #getRelay(url) {
    const normalizedUrl = normalizeRelayUrl(url);
    let relay = this.#relays.get(normalizedUrl);
    if (!relay) {
      relay = this.#createRelay(normalizedUrl);
      this.#relays.set(normalizedUrl, relay);
    }
    try {
      await relay.connect({ timeout: CONNECTION_TIMEOUT_MS });
    } catch (error) {
      if (this.#relays.get(normalizedUrl) === relay) {
        this.#relays.delete(normalizedUrl);
        clearTimeout(this.#relayTimeouts.get(normalizedUrl));
        this.#relayTimeouts.delete(normalizedUrl);
      }
      try {
        await relay.close();
      } catch {
      }
      throw error;
    }
    if (!this.#liveSubCounts.get(normalizedUrl)) this.#scheduleIdleDisconnect(normalizedUrl);
    return relay;
  }
  #incrementLiveSub(url) {
    const normalizedUrl = normalizeRelayUrl(url);
    this.#liveSubCounts.set(normalizedUrl, (this.#liveSubCounts.get(normalizedUrl) ?? 0) + 1);
    clearTimeout(this.#relayTimeouts.get(normalizedUrl));
    this.#relayTimeouts.delete(normalizedUrl);
  }
  #decrementLiveSub(url) {
    const normalizedUrl = normalizeRelayUrl(url);
    const next = (this.#liveSubCounts.get(normalizedUrl) ?? 1) - 1;
    if (next <= 0) {
      this.#liveSubCounts.delete(normalizedUrl);
      if (this.#relays.has(normalizedUrl)) {
        this.#scheduleIdleDisconnect(normalizedUrl);
      }
    } else {
      this.#liveSubCounts.set(normalizedUrl, next);
    }
  }
  // Disconnect from a relay
  async disconnect(url) {
    const normalizedUrl = normalizeRelayUrl(url);
    if (this.#relays.has(normalizedUrl)) {
      const relay = this.#relays.get(normalizedUrl);
      if (relay.ws?.readyState < 2) await relay.close()?.catch(console.log);
      this.#relays.delete(normalizedUrl);
      clearTimeout(this.#relayTimeouts.get(normalizedUrl));
      this.#relayTimeouts.delete(normalizedUrl);
    }
  }
  // Disconnect from all relays
  async disconnectAll() {
    for (const url of [...this.#relays.keys()]) {
      await this.disconnect(url);
    }
  }
  // NIP-42 retries happen inside one relay attempt, so sendEvent still reports
  // exactly one terminal outcome for each relay URL.
  async #publishEvent(relay, event, getAuthEvent) {
    try {
      await relay.publish(event);
      return "published";
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      if (!getAuthEvent || !requiresNip42Auth(reason)) throw reason;
      try {
        await relay.authenticate(getAuthEvent);
      } catch (error2) {
        const authReason = error2 instanceof Error ? error2 : new Error(String(error2));
        throw new Nip42AuthenticationError(authReason);
      }
      await relay.publish(event);
      return "published";
    }
  }
  // Collects COUNT replies only until they are useful: the first usable reply
  // opens a short window for a higher count or a mergeable HLL from peers.
  // null disables either timer: no grace waits for all relays or the deadline.
  async countEvents(filter, relays, {
    timeout = COUNT_TIMEOUT_MS,
    timeoutAfterFirstCount = COUNT_TIMEOUT_AFTER_FIRST_COUNT_MS,
    signal
  } = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new ValidationError("COUNT_FILTER_REQUIRED");
    }
    if (signal?.aborted) throw new Error("Aborted");
    const urls = normalizedRelayUrls(relays);
    if (!urls.length) {
      return { count: null, approximate: false, errors: [], success: false };
    }
    const countController = new AbortController();
    const pending = new Set(urls);
    const errors = [];
    let count = null;
    let approximate = false;
    let registers = null;
    let isResolved = false;
    let graceTimer = null;
    let timeoutTimer = null;
    return await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutTimer);
        clearTimeout(graceTimer);
        signal?.removeEventListener("abort", onAbort);
        countController.abort();
      };
      const finish = ({ timedOut = false, aborted = false } = {}) => {
        if (isResolved) return;
        isResolved = true;
        if (timedOut) {
          for (const relay of pending) errors.push({ relay, reason: countTimeoutError() });
        }
        cleanup();
        if (aborted) {
          reject(new Error("Aborted"));
          return;
        }
        const result = {
          count,
          approximate,
          errors,
          success: count !== null
        };
        if (registers) {
          result.hll = encodeHll(registers);
          result.hllCount = estimateHllCount(registers);
        }
        resolve(result);
      };
      const onAbort = () => finish({ aborted: true });
      signal?.addEventListener("abort", onAbort, { once: true });
      if (timeout !== null) {
        timeoutTimer = maybeUnref(setTimeout(() => finish({ timedOut: true }), timeout));
      }
      const settleRelay = (relay) => pending.delete(relay);
      const finishIfComplete = () => {
        if (pending.size === 0) finish();
      };
      const handleResponse = (relay, payload) => {
        if (isResolved || !settleRelay(relay)) return;
        if (!isCountResponse(payload)) {
          errors.push({ relay, reason: countResponseError() });
          finishIfComplete();
          return;
        }
        if (count === null || payload.count > count || payload.count === count && approximate && payload.approximate !== true) {
          count = payload.count;
          approximate = payload.approximate === true;
        }
        const hll = decodeHll(payload.hll);
        if (hll) {
          if (!registers) registers = new Uint8Array(hll.length);
          mergeHll(registers, hll);
        }
        if (count !== null && timeoutAfterFirstCount !== null && !graceTimer && pending.size > 0) {
          graceTimer = maybeUnref(setTimeout(finish, timeoutAfterFirstCount));
        }
        finishIfComplete();
      };
      const handleError = (relay, error) => {
        if (isResolved || !settleRelay(relay)) return;
        const reason = error instanceof Error ? error : new Error(String(error));
        errors.push({ relay, reason });
        finishIfComplete();
      };
      for (const relay of urls) {
        this.#getRelay(relay).then(async (connection) => {
          if (isResolved) return null;
          return await connection.countWithHll([filter], { signal: countController.signal });
        }).then(
          (payload) => {
            if (payload !== null) handleResponse(relay, payload);
          },
          (error) => handleError(relay, error)
        );
      }
    });
  }
  // Collects a one-shot relay read. The first EOSE with events opens a short
  // grace window; null disables that window so callers wait for every relay or
  // the operation deadline. Event ids are deduplicated across relay responses.
  async getEvents(filter, relays, { timeout = 5e3, timeoutAfterFirstEose = 500, callback, signal } = {}) {
    const urls = normalizedRelayUrls(relays);
    if (!urls.length) return { result: [], errors: [], success: false };
    if (signal?.aborted) throw new Error("Aborted");
    const subscriptions = /* @__PURE__ */ new Map();
    const pending = new Set(urls);
    const normalCloseUrls = /* @__PURE__ */ new Set();
    const errors = [];
    const events = [];
    const eventIds = /* @__PURE__ */ new Set();
    let completed = 0;
    let isResolved = false;
    let eoseTimer = null;
    let timeoutTimer = null;
    return await new Promise((resolve, reject) => {
      const closeSubscriptions = () => {
        for (const sub of subscriptions.values()) sub.close();
        subscriptions.clear();
      };
      const cleanup = () => {
        clearTimeout(timeoutTimer);
        clearTimeout(eoseTimer);
        signal?.removeEventListener("abort", onAbort);
        closeSubscriptions();
      };
      const finish = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        resolve({
          result: events,
          errors,
          success: events.length > 0 || completed > 0
        });
      };
      const finishIfComplete = () => {
        if (pending.size === 0) finish();
      };
      const settleRelay = (url, reason) => {
        if (isResolved || !pending.delete(url)) return;
        subscriptions.delete(url);
        if (reason) {
          errors.push({ reason, relay: url });
          if (callback) callback({ type: "error", error: reason, relay: url });
        } else {
          completed++;
        }
        finishIfComplete();
      };
      const onAbort = () => {
        if (isResolved) return;
        isResolved = true;
        cleanup();
        reject(new Error("Aborted"));
      };
      const timeoutPending = () => {
        if (isResolved) return;
        for (const url of pending) {
          errors.push({ reason: getEventsTimeoutError(), relay: url });
        }
        finish();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (timeout !== null) timeoutTimer = maybeUnref(setTimeout(timeoutPending, timeout));
      for (const url of urls) {
        this.#getRelay(url).then((relay) => {
          if (isResolved || !pending.has(url)) return;
          let hasEvents = false;
          let sub;
          const handleEose = () => {
            if (isResolved || !pending.has(url)) return;
            normalCloseUrls.add(url);
            sub.close();
            if (hasEvents && timeoutAfterFirstEose !== null && !eoseTimer && !isResolved) {
              eoseTimer = maybeUnref(setTimeout(finish, timeoutAfterFirstEose));
            }
          };
          const checkEarlyClose = makeEarlyCloseChecker(filter, handleEose);
          sub = relay.subscribe([filter], {
            onevent: (event) => {
              if (isResolved || !pending.has(url)) return;
              hasEvents = true;
              if (!event?.id || !eventIds.has(event.id)) {
                if (event?.id) eventIds.add(event.id);
                event.meta = { relay: url };
                events.push(event);
                if (callback) callback({ type: "event", event, relay: url });
              }
              checkEarlyClose(event);
            },
            oninvalidevent: () => {
              if (!isResolved && pending.has(url)) checkEarlyClose();
            },
            onclose: (error) => {
              const reason = normalCloseUrls.delete(url) || error === void 0 ? null : error instanceof Error ? error : new Error(String(error));
              settleRelay(url, reason);
            },
            oneose: handleEose
          });
          if (isResolved || !pending.has(url)) sub.close();
          else subscriptions.set(url, sub);
        }).catch((error) => {
          const reason = error instanceof Error ? error : new Error(String(error));
          settleRelay(url, reason);
        });
      }
    });
  }
  async *getEventsGenerator(filter, relays, options = {}) {
    const queue = [];
    let p = Promise.withResolvers();
    let isDone = false;
    const userCallback = options.callback;
    const callback = (item) => {
      queue.push(item);
      if (userCallback) userCallback(item);
      p.resolve();
      p = Promise.withResolvers();
    };
    const methodPromise = this.getEvents(filter, relays, { ...options, callback }).catch((err) => {
      if (err?.message !== "Aborted") console.error("Error in getEvents:", err);
    }).finally(() => {
      isDone = true;
      p.resolve();
    });
    while (!isDone || queue.length > 0) {
      if (queue.length > 0) yield queue.shift();
      else await p.promise;
    }
    return await methodPromise;
  }
  // Returns a strictly-live stream. `ready` reports the first initial EOSE window,
  // while `readyRelays` follows relays that are currently past their own EOSE.
  getLiveEventsGenerator(filter, relays, options = {}) {
    const ready = Promise.withResolvers();
    const readyRelays = /* @__PURE__ */ new Set();
    const stream = this.#getLiveEventsGenerator(filter, relays, options, { ready, readyRelays });
    Object.defineProperties(stream, {
      ready: {
        enumerable: false,
        value: ready.promise
      },
      readyRelays: {
        enumerable: false,
        get: () => Object.freeze([...readyRelays])
      }
    });
    return stream;
  }
  // Each relay becomes live after its own EOSE. This prevents a slow peer from
  // suppressing already-live events from another relay.
  async *#getLiveEventsGenerator(filter, relays, {
    signal,
    timeoutAfterFirstEose = 500,
    timeoutForReconnectGap = 5e3,
    timeoutAfterFirstReconnectGapEose = 500,
    _gapEventsGenerator = (...args) => this.getEventsGenerator(...args)
  } = {}, { ready, readyRelays }) {
    const urls = normalizedRelayUrls(relays);
    const queue = [];
    let p = Promise.withResolvers();
    let isDone = false;
    const liveSubs = /* @__PURE__ */ new Map();
    const retryTimers2 = /* @__PURE__ */ new Map();
    const initialPending = new Set(urls);
    const initialErrors = [];
    let readyTimer = null;
    let isReady = false;
    const gapAc = new AbortController();
    const baseFilter = { ...filter };
    delete baseFilter.since;
    delete baseFilter.until;
    const filterUntil = filter.until > 0 ? filter.until : null;
    let lastSeenAt = filter.since > 0 ? filter.since : null;
    const seenIds = /* @__PURE__ */ new Set();
    let untilTimer = null;
    const finishReady = () => {
      if (isReady) return;
      isReady = true;
      clearTimeout(readyTimer);
      ready.resolve(Object.freeze({
        relays: Object.freeze([...readyRelays]),
        errors: Object.freeze([...initialErrors])
      }));
    };
    const teardown = () => {
      if (isDone) return;
      isDone = true;
      clearTimeout(untilTimer);
      finishReady();
      gapAc.abort();
      for (const timer of retryTimers2.values()) clearTimeout(timer);
      retryTimers2.clear();
      liveSubs.forEach((sub) => sub.close());
      liveSubs.clear();
      p.resolve();
    };
    const pushEvent = (event, url) => {
      if (isDone || event.id && seenIds.has(event.id)) return;
      if (event.id) {
        if (seenIds.size >= 500) seenIds.delete(seenIds.values().next().value);
        seenIds.add(event.id);
      }
      if (event.created_at > (lastSeenAt ?? 0)) lastSeenAt = event.created_at;
      event.meta = { relay: url };
      queue.push(event);
      p.resolve();
      p = Promise.withResolvers();
    };
    if (signal?.aborted) {
      finishReady();
      return;
    }
    signal?.addEventListener("abort", teardown, { once: true });
    const maybeFinishInitialReady = () => {
      if (initialPending.size === 0) finishReady();
    };
    const markInitialEose = (url) => {
      readyRelays.add(url);
      if (isReady) return;
      initialPending.delete(url);
      if (timeoutAfterFirstEose !== null && !readyTimer) {
        readyTimer = maybeUnref(setTimeout(finishReady, timeoutAfterFirstEose));
      }
      maybeFinishInitialReady();
    };
    const markInitialError = (url, reason) => {
      if (!initialPending.delete(url)) return;
      initialErrors.push({ relay: url, reason });
      maybeFinishInitialReady();
    };
    const scheduleReconnect = (url, reconnectDelay) => {
      if (isDone || retryTimers2.has(url)) return;
      const nextDelay = Math.min(reconnectDelay * 2, 5 * 6e4);
      const timer = maybeUnref(setTimeout(() => {
        retryTimers2.delete(url);
        subscribeToRelay(url, lastSeenAt, nextDelay);
      }, reconnectDelay));
      retryTimers2.set(url, timer);
    };
    if (filterUntil !== null) {
      const msUntil = filterUntil * 1e3 - Date.now();
      untilTimer = maybeUnref(setTimeout(teardown, Math.max(0, msUntil)));
    }
    const runReconnectGapFill = (url, gapSince, now) => {
      const gapUntil = filterUntil !== null ? Math.min(now, filterUntil) : now;
      const gapFilter = { ...baseFilter, since: gapSince, until: gapUntil };
      const gapGen = _gapEventsGenerator(gapFilter, [url], {
        timeout: timeoutForReconnectGap,
        timeoutAfterFirstEose: timeoutAfterFirstReconnectGapEose,
        signal: gapAc.signal
      });
      return (async () => {
        for await (const item of gapGen) {
          if (item?.type === "event") pushEvent(item.event, url);
        }
      })().catch((err) => {
        if (!isDone) console.error(`Reconnect gap fill error for ${url}:`, err);
      });
    };
    const subscribeToRelay = (url, gapSince, reconnectDelay = 1e3) => {
      const now = Math.floor(Date.now() / 1e3);
      if (filterUntil !== null && now >= filterUntil) return;
      this.#getRelay(url).then((relay) => {
        if (isDone) return;
        let liveBuffer = gapSince !== null && gapSince > 0 ? [] : null;
        let liveEose = false;
        const liveFilter = { ...baseFilter, since: now, limit: 0 };
        if (filterUntil !== null) liveFilter.until = filterUntil;
        const liveSub = relay.subscribe([liveFilter], {
          onevent: (event) => {
            if (!liveEose) return;
            if (liveBuffer) liveBuffer.push(event);
            else pushEvent(event, url);
          },
          onclose: (error) => {
            if (liveSubs.get(url) === liveSub) liveSubs.delete(url);
            else if (liveSubs.has(url)) return;
            readyRelays.delete(url);
            if (!liveEose && !isDone) {
              const reason = error instanceof Error ? error : new Error(error ? String(error) : "LIVE_SUBSCRIPTION_CLOSED");
              markInitialError(url, reason);
            }
            if (isDone) return;
            scheduleReconnect(url, reconnectDelay);
          },
          oneose: () => {
            if (isDone || liveSubs.has(url) && liveSubs.get(url) !== liveSub) return;
            liveEose = true;
            markInitialEose(url);
          }
        });
        if (isDone) {
          liveSub.close();
          return;
        }
        liveSubs.set(url, liveSub);
        if (gapSince !== null && gapSince > 0) {
          runReconnectGapFill(url, gapSince, now).then(() => {
            if (isDone) return;
            const buf = liveBuffer;
            liveBuffer = null;
            for (const event of buf) pushEvent(event, url);
          });
        }
      }).catch((err) => {
        readyRelays.delete(url);
        const reason = err instanceof Error ? err : new Error(String(err));
        markInitialError(url, reason);
        if (isDone) return;
        console.error(`Live subscription error at ${url}:`, reason);
        scheduleReconnect(url, reconnectDelay);
      });
    };
    if (!urls.length) {
      finishReady();
      return;
    }
    for (const url of urls) {
      this.#incrementLiveSub(url);
      subscribeToRelay(url, null);
    }
    try {
      while (!isDone || queue.length > 0) {
        if (queue.length > 0) yield queue.shift();
        else await p.promise;
      }
    } finally {
      signal?.removeEventListener("abort", teardown);
      for (const url of urls) this.#decrementLiveSub(url);
      teardown();
    }
  }
  // All-in-one event feed generator. For live:true, handles the full sequence:
  //
  // - live:true (default): unless filter.limit === 0, starts the live sub immediately
  //   (so no incoming events are missed), runs an initial one-shot fetch of stored events
  //   concurrently, yields stored events first, then flushes buffered live events (deduped
  //   against stored ones), then yields live events indefinitely. With limit:0 the relay
  //   sends no stored events, so the fetch is skipped and only the live sub runs.
  // - live:false: one-shot fetch via getEventsGenerator. timeoutAfterFirstEose
  //   short-circuits after the fastest relay with events EOSEs, or waits for all
  //   relays when null.
  //
  // All underlying generators are injectable for testing.
  async *getEventsFeedGenerator(filter, relays, {
    signal,
    live = true,
    timeout = 5e3,
    timeoutAfterFirstEose = 500,
    _liveGenerator = (...args) => this.getLiveEventsGenerator(...args),
    _eventsGenerator = (...args) => this.getEventsGenerator(...args)
  } = {}) {
    if (!live) {
      const gen = _eventsGenerator(filter, relays, { timeout, timeoutAfterFirstEose, signal });
      for await (const item of gen) {
        if (item?.type === "event") yield item.event;
      }
      return;
    }
    if (filter.limit === 0) {
      for await (const event of _liveGenerator(filter, relays, { signal })) {
        yield event;
      }
      return;
    }
    const liveGen = _liveGenerator(filter, relays, { signal });
    const liveBuffer = [];
    let liveDone = false;
    let liveWake = Promise.withResolvers();
    const bgLoop = (async () => {
      try {
        for await (const event of liveGen) {
          liveBuffer.push(event);
          liveWake.resolve();
          liveWake = Promise.withResolvers();
        }
      } finally {
        liveDone = true;
        liveWake.resolve();
      }
    })();
    try {
      const fetchGen = _eventsGenerator(filter, relays, { timeout, timeoutAfterFirstEose, signal });
      const seenIds = /* @__PURE__ */ new Set();
      for await (const item of fetchGen) {
        if (item?.type === "event" && !seenIds.has(item.event.id)) {
          seenIds.add(item.event.id);
          yield item.event;
        }
      }
      while (liveBuffer.length > 0) {
        const event = liveBuffer.shift();
        if (!seenIds.has(event.id)) {
          seenIds.add(event.id);
          yield event;
        }
      }
      while (!liveDone || liveBuffer.length > 0) {
        while (liveBuffer.length > 0) yield liveBuffer.shift();
        if (!liveDone) await liveWake.promise;
      }
    } finally {
      liveGen.return();
      await bgLoop;
    }
  }
  // Returns after the first acknowledgement window. timeout is one deadline for
  // the whole operation, while timeoutUntilFirstFulfillment controls only this
  // initial return and closes pending reports when it fails. null disables either
  // timer independently. onRelayResult receives one
  // { relay, success, outcome, reason? } result per relay as it settles; outcome
  // is published, duplicate, muted, failed, or timed-out. getAuthEvent is used
  // only after auth-required or restricted publish failures, then retries once.
  // Await `promise` for the complete report, including every relay outcome.
  async sendEvent(event, relays, {
    timeout = SEND_TIMEOUT_MS,
    timeoutUntilFirstFulfillment = SEND_TIMEOUT_UNTIL_FIRST_FULFILLMENT_MS,
    getAuthEvent,
    onRelayResult
  } = {}) {
    const urls = normalizedRelayUrls(relays);
    if (!urls.length) {
      const promise2 = Promise.resolve(publishSummary([], urls, {
        includeSucceededRelays: true
      }));
      return { total: 0, success: false, promise: promise2 };
    }
    const eventToSend = event.meta ? { ...event } : event;
    if (eventToSend.meta) delete eventToSend.meta;
    const sendDeferreds = urls.map(() => Promise.withResolvers());
    const sendPromises = sendDeferreds.map(({ promise: promise2 }) => promise2);
    const settlement = createPublishSettlements(sendPromises, timeout, {
      onSettled: (settlement2, index) => {
        notifyRelayResult(onRelayResult, relayResultForSettlement(urls[index], settlement2));
      }
    });
    const promise = settlement.promise.then((settlements) => publishSummary(settlements, urls, {
      includeSucceededRelays: true
    }));
    urls.forEach((url, index) => {
      const deferred6 = sendDeferreds[index];
      (async () => {
        try {
          const relay = await this.#getRelay(url);
          return await this.#publishEvent(relay, eventToSend, getAuthEvent);
        } catch (err) {
          const reason = err instanceof Error ? err : new Error(String(err));
          if (reason instanceof Nip42AuthenticationError) throw reason;
          if (reason.message.startsWith("duplicate:")) return "duplicate";
          if (reason.message.startsWith("mute:")) {
            console.info([url, reason.message].filter(Boolean).join(" - "));
            return "muted";
          }
          throw reason;
        }
      })().then(deferred6.resolve, deferred6.reject);
    });
    const success = await firstFulfillment(sendPromises, timeoutUntilFirstFulfillment, {
      fallback: promise.then((report) => report.success)
    });
    if (!success) settlement.timeout();
    return {
      total: urls.length,
      success,
      promise
    };
  }
};
var relayPool = new RelayPool();

// node_modules/libp2r2p/relay/services/query.js
var QUERY_CACHE_MS = 40 * 60 * 1e3;
var RELAY_CACHE_MAX_ITEMS = 500;
var HEX_PUBKEY = /^[0-9a-f]{64}$/i;
var relaysByPubkey = /* @__PURE__ */ Object.create(null);
var relayCacheTimersByPubkey = /* @__PURE__ */ Object.create(null);
var relayCacheAddedAtByPubkey = /* @__PURE__ */ Object.create(null);
var relayCacheEventCreatedAtByPubkey = /* @__PURE__ */ Object.create(null);
var getEvents = (...args) => relayPool.getEvents(...args);
var getEventsFeedGenerator = (...args) => relayPool.getEventsFeedGenerator(...args);
function hasCachedKey(cache, key) {
  return Object.prototype.hasOwnProperty.call(cache, key);
}
function maybeUnref2(timer) {
  timer?.unref?.();
  return timer;
}
function cloneRelays(relays) {
  return {
    read: [...relays?.read || []],
    write: [...relays?.write || []]
  };
}
function parseRelayListEvent(event) {
  const out = { read: [], write: [] };
  if (!event || event.kind !== 10002) return out;
  for (const tag of event.tags) {
    if (tag[0] !== "r" || typeof tag[1] !== "string") continue;
    if (tag[2] === "read") out.read.push(tag[1]);
    else if (tag[2] === "write") out.write.push(tag[1]);
    else {
      out.read.push(tag[1]);
      out.write.push(tag[1]);
    }
  }
  out.read = [...new Set(out.read)];
  out.write = [...new Set(out.write)];
  return out;
}
function uniquePubkeys(pubkeys, { requireHex = false } = {}) {
  const values = [...new Set(pubkeys || [])].filter(Boolean);
  return requireHex ? values.filter((pubkey) => HEX_PUBKEY.test(pubkey)) : values;
}
function relayListCreatedAt(event) {
  return Number.isFinite(event?.created_at) ? event.created_at : 0;
}
function areRelaySetsEqual(a, b) {
  const left = new Set(a || []);
  const right = new Set(b || []);
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}
function relaySetChanges(previous, next) {
  const read = !areRelaySetsEqual(previous?.read, next?.read);
  const write = !areRelaySetsEqual(previous?.write, next?.write);
  return {
    read,
    write,
    both: read || write
  };
}
function relayTypeChanged(changes, relayType) {
  if (relayType === "read") return changes.read;
  if (relayType === "write") return changes.write;
  return changes.both;
}
function deleteCachedRelay(pubkey) {
  clearTimeout(relayCacheTimersByPubkey[pubkey]);
  delete relaysByPubkey[pubkey];
  delete relayCacheTimersByPubkey[pubkey];
  delete relayCacheAddedAtByPubkey[pubkey];
  delete relayCacheEventCreatedAtByPubkey[pubkey];
}
function setCachedRelays(pubkey, relays, createdAt, cacheMs) {
  relaysByPubkey[pubkey] = cloneRelays(relays);
  relayCacheAddedAtByPubkey[pubkey] = Date.now();
  relayCacheEventCreatedAtByPubkey[pubkey] = createdAt;
  clearTimeout(relayCacheTimersByPubkey[pubkey]);
  if (cacheMs > 0) {
    relayCacheTimersByPubkey[pubkey] = maybeUnref2(setTimeout(() => {
      deleteCachedRelay(pubkey);
    }, cacheMs));
  } else {
    delete relayCacheTimersByPubkey[pubkey];
  }
}
function pruneRelayCache() {
  const keys = Object.keys(relaysByPubkey);
  if (keys.length <= RELAY_CACHE_MAX_ITEMS) return;
  keys.sort((a, b) => (relayCacheAddedAtByPubkey[a] || 0) - (relayCacheAddedAtByPubkey[b] || 0)).slice(0, keys.length - RELAY_CACHE_MAX_ITEMS).forEach(deleteCachedRelay);
}
function cacheRelayListEvent(event, { cacheMs = QUERY_CACHE_MS } = {}) {
  if (!event || event.kind !== 10002 || !event.pubkey) return null;
  const createdAt = relayListCreatedAt(event);
  const previousCreatedAt = relayCacheEventCreatedAtByPubkey[event.pubkey];
  if (previousCreatedAt != null && createdAt <= previousCreatedAt) return null;
  const previousRelays = hasCachedKey(relaysByPubkey, event.pubkey) ? cloneRelays(relaysByPubkey[event.pubkey]) : null;
  const relays = parseRelayListEvent(event);
  const changes = relaySetChanges(previousRelays, relays);
  setCachedRelays(event.pubkey, relays, createdAt, cacheMs);
  pruneRelayCache();
  return {
    pubkey: event.pubkey,
    event,
    relays: cloneRelays(relays),
    previousRelays,
    changes
  };
}
function subscribeRelayListUpdates(pubkeys, {
  relayType = "both",
  onChange,
  relays = seedRelays,
  cacheMs = QUERY_CACHE_MS,
  _eventsFeedGenerator = getEventsFeedGenerator
} = {}) {
  const authors = uniquePubkeys(pubkeys, { requireHex: _eventsFeedGenerator === getEventsFeedGenerator });
  if (!authors.length) return () => {
  };
  let closed = false;
  const controller = new AbortController();
  async function consumeRelayListUpdates() {
    try {
      for await (const event of _eventsFeedGenerator({
        kinds: [10002],
        authors
      }, relays, {
        signal: controller.signal,
        timeout: 5e3,
        timeoutAfterFirstEose: null
      })) {
        if (closed || !authors.includes(event.pubkey)) continue;
        const update2 = cacheRelayListEvent(event, { cacheMs });
        if (!update2 || !relayTypeChanged(update2.changes, relayType)) continue;
        onChange?.({
          ...update2,
          relayType
        });
      }
    } catch (error) {
      if (!closed && error?.message !== "Aborted") console.error("relay-list watch failed:", error);
    }
  }
  consumeRelayListUpdates();
  return () => {
    closed = true;
    controller.abort();
  };
}
async function getRelaysByPubkey(pubkeys, { _getEvents = getEvents, cacheMs = QUERY_CACHE_MS } = {}) {
  const pubkeyList = uniquePubkeys(pubkeys, { requireHex: _getEvents === getEvents });
  if (!pubkeyList.length) return {};
  const out = {};
  const missingPubkeys = [];
  for (const pubkey of pubkeyList) {
    if (hasCachedKey(relaysByPubkey, pubkey)) out[pubkey] = cloneRelays(relaysByPubkey[pubkey]);
    else missingPubkeys.push(pubkey);
  }
  if (!missingPubkeys.length) return out;
  const { result: events } = await _getEvents({
    kinds: [10002],
    authors: missingPubkeys,
    limit: missingPubkeys.length
  }, seedRelays, {
    timeout: 5e3,
    timeoutAfterFirstEose: null
  });
  const latestByPubkey = {};
  for (const event of events) {
    if (!missingPubkeys.includes(event.pubkey)) continue;
    if (!latestByPubkey[event.pubkey] || event.created_at > latestByPubkey[event.pubkey].created_at) {
      latestByPubkey[event.pubkey] = event;
    }
  }
  for (const pubkey of missingPubkeys) {
    const relays = latestByPubkey[pubkey] ? parseRelayListEvent(latestByPubkey[pubkey]) : { read: freeRelays.slice(0, 2), write: freeRelays.slice(0, 2) };
    setCachedRelays(pubkey, relays, relayListCreatedAt(latestByPubkey[pubkey]), cacheMs);
    out[pubkey] = relays;
  }
  pruneRelayCache();
  return out;
}

// src/services/relay.js
var READ_TIMEOUT_MS = 5e3;
var READ_TIMEOUT_AFTER_FIRST_EOSE_MS = 500;
function latestEvent(events) {
  let latest = null;
  for (const event of events) {
    if (!latest || event.created_at > latest.created_at) latest = event;
  }
  return latest;
}
async function fetchLatestEvent(filter, relays, { _relayPool = relayPool } = {}) {
  const { result } = await _relayPool.getEvents(filter, relays, {
    timeout: READ_TIMEOUT_MS,
    timeoutAfterFirstEose: READ_TIMEOUT_AFTER_FIRST_EOSE_MS
  });
  return latestEvent(result);
}
function fetchRelayListEvent(pubkey, options) {
  return fetchLatestEvent({ kinds: [10002], authors: [pubkey], limit: 1 }, seedRelays, options);
}
function parseRelayListEvent2(event) {
  const out = { read: [], write: [] };
  if (!event || event.kind !== 10002) return out;
  for (const tag of event.tags) {
    if (tag[0] !== "r" || typeof tag[1] !== "string") continue;
    const marker = tag[2];
    if (marker === "read") out.read.push(tag[1]);
    else if (marker === "write") out.write.push(tag[1]);
    else {
      out.read.push(tag[1]);
      out.write.push(tag[1]);
    }
  }
  out.read = [...new Set(out.read)];
  out.write = [...new Set(out.write)];
  return out;
}
async function resolveWriteRelays(pubkey, { _fetchRelayListEvent = fetchRelayListEvent } = {}) {
  try {
    const event = await _fetchRelayListEvent(pubkey);
    const { write } = parseRelayListEvent2(event);
    if (write.length) return write;
  } catch (error) {
    console.warn("resolveWriteRelays failed", error?.message ?? error);
  }
  return freeRelays.slice(0, 2);
}
async function fetchLatestProfile(pubkey, {
  writeRelays,
  _relayPool = relayPool,
  _resolveWriteRelays = resolveWriteRelays
} = {}) {
  const relays = writeRelays?.length ? writeRelays : await _resolveWriteRelays(pubkey);
  return fetchLatestEvent({ kinds: [0], authors: [pubkey], limit: 1 }, relays, { _relayPool });
}

// src/services/nsec-signer.js
var nip44GetConversationKey = getConversationKey.bind(nip44_exports);
var nip44Encrypt = encrypt3.bind(nip44_exports);
var nip44Decrypt = decrypt3.bind(nip44_exports);
var nip04Encrypt = encrypt2.bind(nip04_exports);
var nip04Decrypt = decrypt2.bind(nip04_exports);
var OBFUSCATE_SALT = utf8ToBytes("nostr-obfuscate-v1");
var secretKeys = /* @__PURE__ */ new WeakMap();
var createToken = Symbol("createToken");
var SharedKeySigner = class _SharedKeySigner {
  #signer;
  #peerPubkey;
  #info;
  #sharedSignerPromise = null;
  constructor(signer, peerPubkey, info = "") {
    this.#signer = signer;
    this.#peerPubkey = peerPubkey;
    this.#info = info;
    Object.preventExtensions(this);
  }
  async #sharedSigner() {
    this.#sharedSignerPromise ??= (async () => {
      const sharedSecretKey = await deriveSharedKey(secretKeys.get(this.#signer), this.#peerPubkey, this.#info);
      return NsecSigner.getOrCreate(bytesToHex3(sharedSecretKey));
    })();
    return this.#sharedSignerPromise;
  }
  async getPublicKey() {
    return (await this.#sharedSigner()).getPublicKey();
  }
  async signEvent(event) {
    return (await this.#sharedSigner()).signEvent(event);
  }
  async nip04Encrypt(peerPubkey, plaintext) {
    return (await this.#sharedSigner()).nip04Encrypt(peerPubkey, plaintext);
  }
  async nip04Decrypt(peerPubkey, ciphertext) {
    return (await this.#sharedSigner()).nip04Decrypt(peerPubkey, ciphertext);
  }
  async nip44Encrypt(peerPubkey, plaintext) {
    return (await this.#sharedSigner()).nip44Encrypt(peerPubkey, plaintext);
  }
  async nip44Decrypt(peerPubkey, ciphertext) {
    return (await this.#sharedSigner()).nip44Decrypt(peerPubkey, ciphertext);
  }
  async nip44v3Encrypt(peerPubkey, kind, scope, plaintextB64) {
    return (await this.#sharedSigner()).nip44v3Encrypt(peerPubkey, kind, scope, plaintextB64);
  }
  async nip44v3Decrypt(peerPubkey, kind, scope, ciphertext) {
    return (await this.#sharedSigner()).nip44v3Decrypt(peerPubkey, kind, scope, ciphertext);
  }
  async obfuscate(value, kind, scope) {
    return this.#signer.obfuscate(value, kind, scope);
  }
  async nip44EncryptDoubleDH(...params) {
    return (await this.#sharedSigner()).nip44EncryptDoubleDH(...params);
  }
  async nip44DecryptDoubleDH(...params) {
    return (await this.#sharedSigner()).nip44DecryptDoubleDH(...params);
  }
  withSharedKey(peerPubkey, info = this.#info) {
    return new _SharedKeySigner(this.#signer, peerPubkey, info);
  }
};
var NsecSigner = class _NsecSigner {
  static #signersByPubkey = {};
  static #contentSignersByOwnerSigner = /* @__PURE__ */ new WeakMap();
  #pubkey;
  #conversationKeyGcTimeout;
  #conversationKeys = {};
  // Pubkeys with a live in-memory signer. Useful later for the messenger's
  // "is this account ready to sign?" probe.
  static get activePubkeys() {
    return Object.keys(this.#signersByPubkey);
  }
  // Memoize per pubkey so repeated calls from different callers share caches.
  static getOrCreate(seckey) {
    if (!seckey) throw new Error("MISSING_SECKEY");
    const pubkey = getPublicKey(hexToBytes3(seckey));
    return this.#signersByPubkey[pubkey] ??= new this(createToken, seckey, pubkey);
  }
  constructor(token, seckey, pubkey) {
    if (token !== createToken) throw new Error("USE_GET_OR_CREATE");
    secretKeys.set(this, hexToBytes3(seckey));
    this.#pubkey = pubkey;
    Object.preventExtensions(this);
    this.#scheduleConversationKeyGc();
  }
  get #secretKey() {
    return secretKeys.get(this);
  }
  static release(pubkey) {
    const signer = this.#signersByPubkey[pubkey];
    if (!signer) return;
    signer.#cleanup();
    delete this.#signersByPubkey[pubkey];
  }
  static releaseAll() {
    for (const pubkey of Object.keys(this.#signersByPubkey)) this.release(pubkey);
  }
  static setContentSigners(ownerSigner, contentSigners = []) {
    if (!secretKeys.has(ownerSigner)) throw new Error("OWNER_SIGNER_UNSUPPORTED");
    const signers = /* @__PURE__ */ new Map();
    for (const signer of contentSigners || []) {
      if (!secretKeys.has(signer)) throw new Error("CONTENT_SIGNER_UNSUPPORTED");
      signers.set(signer.getPublicKey(), signer);
    }
    if (signers.size) this.#contentSignersByOwnerSigner.set(ownerSigner, signers);
    else this.#contentSignersByOwnerSigner.delete(ownerSigner);
  }
  #cleanup() {
    this.#conversationKeys = {};
    clearTimeout(this.#conversationKeyGcTimeout);
  }
  getPublicKey() {
    return this.#pubkey;
  }
  signEvent(event) {
    return finalizeEvent(event, this.#secretKey);
  }
  // NIP-07 shape: { read: [], write: [] }. Falls back to the first two
  // freeRelays when the user has no published kind:10002.
  async getRelays() {
    const event = await fetchRelayListEvent(this.#pubkey);
    const { read, write } = parseRelayListEvent2(event);
    if (!read.length && !write.length) {
      const fallback = freeRelays.slice(0, 2);
      return { read: fallback, write: fallback };
    }
    return { read, write };
  }
  nip04Encrypt(peerPubkey, plaintext) {
    return nip04Encrypt(this.#secretKey, peerPubkey, plaintext);
  }
  nip04Decrypt(peerPubkey, ciphertext) {
    return nip04Decrypt(this.#secretKey, peerPubkey, ciphertext);
  }
  // Bounded LRU-ish cap on cached conversation keys. Each key is a 32-byte
  // HKDF output, so the absolute memory cost is small — the cap is mostly to
  // keep the cache from growing without bound for long-lived signers.
  #scheduleConversationKeyGc() {
    this.#conversationKeyGcTimeout = setTimeout(() => {
      Object.keys(this.#conversationKeys).reverse().slice(10).forEach((v) => delete this.#conversationKeys[v]);
      this.#scheduleConversationKeyGc();
    }, 6e4);
    this.#conversationKeyGcTimeout?.unref?.();
  }
  nip44Encrypt(peerPubkey, plaintext) {
    const ck = this.#conversationKeys[peerPubkey] ??= nip44GetConversationKey(this.#secretKey, peerPubkey);
    return nip44Encrypt(plaintext, ck);
  }
  nip44Decrypt(peerPubkey, ciphertext) {
    const ck = this.#conversationKeys[peerPubkey] ??= nip44GetConversationKey(this.#secretKey, peerPubkey);
    return nip44Decrypt(ciphertext, ck);
  }
  nip44v3Encrypt(peerPubkey, kind, scope, plaintextB64) {
    return nip07Encrypt(this.#secretKey, peerPubkey, kind, scope, plaintextB64);
  }
  nip44v3Decrypt(peerPubkey, kind, scope, ciphertext) {
    return nip07Decrypt(this.#secretKey, peerPubkey, kind, scope, ciphertext);
  }
  obfuscate(value, kind, scope) {
    if (typeof value !== "string") throw new Error("INVALID_OBFUSCATE_VALUE");
    if (typeof scope !== "string") throw new Error("INVALID_OBFUSCATE_SCOPE");
    const normalizedKind = normalizeKind2(kind);
    const key = extract(sha256, this.#secretKey, OBFUSCATE_SALT);
    return bytesToHex3(hmac(sha256, key, frameObfuscateMessage({ value, kind: normalizedKind, scope })));
  }
  async #contentKeyMaterial(contentSigner, requestedContentPubkey = "") {
    if (!contentSigner && requestedContentPubkey) {
      contentSigner = _NsecSigner.#contentSignersByOwnerSigner.get(this)?.get(requestedContentPubkey) || null;
    }
    if (!contentSigner) return { contentPubkey: requestedContentPubkey || "", contentSecretKey: null };
    if (!secretKeys.has(contentSigner)) throw new Error("CONTENT_SIGNER_UNSUPPORTED");
    const contentPubkey = await contentSigner.getPublicKey();
    if (requestedContentPubkey && requestedContentPubkey !== contentPubkey) throw new Error("CONTENT_SIGNER_MISMATCH");
    return {
      contentPubkey,
      contentSecretKey: secretKeys.get(contentSigner)
    };
  }
  async #latestContentKeyMaterial() {
    const signers = _NsecSigner.#contentSignersByOwnerSigner.get(this);
    const contentSigner = signers?.size ? [...signers.values()].at(-1) : null;
    return this.#contentKeyMaterial(contentSigner);
  }
  async nip44EncryptDoubleDH(peerPubkey, kind, scope = "", plaintextB64, peerContentPubkey = "") {
    const normalizedKind = normalizeKind2(kind);
    const { contentPubkey, contentSecretKey } = await this.#latestContentKeyMaterial();
    const { conversationKey: conversationKey2 } = deriveDoubleDhConversationKey({
      role: "sender",
      identitySecretKey: this.#secretKey,
      identityPubkey: this.#pubkey,
      contentSecretKey,
      contentPubkey,
      peerIdentityPubkey: peerPubkey,
      peerContentPubkey,
      kind: normalizedKind,
      scope
    });
    const ciphertext = conversationKey2 ? encryptWithConversationKeyBytes(
      conversationKey2,
      normalizedKind,
      toBytes(scope || ""),
      b64decode(plaintextB64)
    ) : nip07Encrypt(this.#secretKey, peerPubkey, normalizedKind, scope, plaintextB64);
    return [ciphertext, contentPubkey];
  }
  async nip44DecryptDoubleDH(peerPubkey, kind, scope = "", ciphertext, peerContentPubkey = "", ownContentPubkey = "") {
    const normalizedKind = normalizeKind2(kind);
    const { contentPubkey, contentSecretKey } = await this.#contentKeyMaterial(null, ownContentPubkey);
    const { conversationKey: conversationKey2 } = deriveDoubleDhConversationKey({
      role: "receiver",
      identitySecretKey: this.#secretKey,
      identityPubkey: this.#pubkey,
      contentSecretKey,
      contentPubkey,
      peerIdentityPubkey: peerPubkey,
      peerContentPubkey,
      kind: normalizedKind,
      scope
    });
    return conversationKey2 ? b64encode(decryptWithConversationKeyBytes(
      conversationKey2,
      normalizedKind,
      toBytes(scope || ""),
      ciphertext
    )) : nip07Decrypt(this.#secretKey, peerPubkey, normalizedKind, scope, ciphertext);
  }
  withSharedKey(peerPubkey, info) {
    return new SharedKeySigner(this, peerPubkey, info);
  }
};
function u32be3(n) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, n >>> 0, false);
  return bytes;
}
function frameObfuscateMessage({ value, kind, scope }) {
  const scopeBytes = utf8ToBytes(scope);
  const valueBytes = utf8ToBytes(value);
  return concatBytes(
    u32be3(kind),
    u32be3(scopeBytes.length),
    scopeBytes,
    valueBytes
  );
}
Object.freeze(SharedKeySigner.prototype);
Object.freeze(NsecSigner.prototype);
Object.freeze(NsecSigner);

// node_modules/libp2r2p/nip46/constants/index.js
var NIP46_KIND = 24133;
var DEFAULT_TIMEOUT = 3e4;
var DEFAULT_TIMEOUT_AFTER_FIRST_EOSE = 500;
var RELAY_SWITCH_WAIT_TIMEOUT = 1e3;

// node_modules/libp2r2p/nip46/helpers/url.js
var PUBKEY = /^[0-9a-f]{64}$/;
function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string" && value))];
}
function isValidPubkey(value) {
  return typeof value === "string" && PUBKEY.test(value);
}
function normalizeBunkerPointer(pointer) {
  if (!pointer || typeof pointer !== "object") return null;
  const remoteSignerPubkey = String(pointer.remoteSignerPubkey || "").toLowerCase();
  const relays = uniqueStrings(pointer.relays);
  if (!isValidPubkey(remoteSignerPubkey) || !relays.length) return null;
  return {
    remoteSignerPubkey,
    relays,
    secret: typeof pointer.secret === "string" && pointer.secret ? pointer.secret : null
  };
}
function parseBunkerUrl(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== "bunker:") return null;
    return normalizeBunkerPointer({
      remoteSignerPubkey: url.hostname,
      relays: url.searchParams.getAll("relay"),
      secret: url.searchParams.get("secret")
    });
  } catch {
    return null;
  }
}
function toBunkerUrl(pointer) {
  const normalized = normalizeBunkerPointer(pointer);
  if (!normalized) throw new ValidationError("INVALID_BUNKER_POINTER");
  const url = new URL(`bunker://${normalized.remoteSignerPubkey}`);
  for (const relay of normalized.relays) url.searchParams.append("relay", relay);
  if (normalized.secret) url.searchParams.set("secret", normalized.secret);
  return url.toString();
}
function parseNostrConnectURI(input) {
  try {
    const url = new URL(input);
    const clientPubkey = url.hostname.toLowerCase();
    const relays = uniqueStrings(url.searchParams.getAll("relay"));
    const secret = url.searchParams.get("secret") || "";
    if (url.protocol !== "nostrconnect:" || !isValidPubkey(clientPubkey) || !relays.length || !secret) return null;
    return {
      clientPubkey,
      relays,
      secret,
      perms: uniqueStrings((url.searchParams.get("perms") || "").split(",")),
      clientMetadata: {
        ...url.searchParams.get("name") ? { name: url.searchParams.get("name") } : {},
        ...url.searchParams.get("url") ? { url: url.searchParams.get("url") } : {},
        ...url.searchParams.get("image") ? { image: url.searchParams.get("image") } : {}
      }
    };
  } catch {
    return null;
  }
}

// node_modules/libp2r2p/nip46/helpers/frame.js
var PUBKEY2 = /^[0-9a-f]{64}$/;
function isValidPubkey2(value) {
  return typeof value === "string" && PUBKEY2.test(value);
}
function hasPTag(event, pubkey) {
  return Array.isArray(event?.tags) && event.tags.some((tag) => tag?.[0] === "p" && tag?.[1] === pubkey);
}
function isNip46EventFor(event, pubkey) {
  return event?.kind === NIP46_KIND && isValidPubkey2(event.pubkey) && hasPTag(event, pubkey) && isValidEvent(event);
}
function decodeNip46Frame(event, secretKey) {
  try {
    const plaintext = decrypt3(event.content, getConversationKey(secretKey, event.pubkey));
    const frame = JSON.parse(plaintext);
    return frame && typeof frame === "object" && !Array.isArray(frame) ? frame : null;
  } catch {
    return null;
  }
}
function createNip46Event({ secretKey, recipientPubkey, payload }) {
  return finalizeEvent({
    kind: NIP46_KIND,
    created_at: Math.floor(Date.now() / 1e3),
    tags: [["p", recipientPubkey]],
    content: encrypt3(JSON.stringify(payload), getConversationKey(secretKey, recipientPubkey))
  }, secretKey);
}
function isValidRequestFrame(frame) {
  return typeof frame?.id === "string" && frame.id && typeof frame.method === "string" && frame.method && Array.isArray(frame.params) && frame.params.every((param) => typeof param === "string");
}
function requestError(reason = "NIP46_REQUEST_REJECTED") {
  return reason instanceof Error ? reason : new Error(typeof reason === "string" && reason ? reason : "NIP46_REQUEST_REJECTED");
}

// node_modules/libp2r2p/nip46/services/transport.js
var RETIRE_CONTEXT_AFTER_MS = 5e3;
var SEEN_EVENT_LIMIT = 500;
function requestId() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function requestExtension(value) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new ValidationError("NIP46_REQUEST_EXTENSION_REQUIRED");
  for (const key of ["id", "method", "params"]) {
    if (Object.hasOwn(value, key)) throw new ValidationError(`NIP46_REQUEST_EXTENSION_CANNOT_SET_${key.toUpperCase()}`);
  }
  return value;
}
function waitForNip46(promise, { timeout = null, signal, label = "NIP46_TIMEOUT" } = {}) {
  if (signal?.aborted) return Promise.reject(new Error("Aborted"));
  if (timeout === null && !signal) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    let timer = null;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn(value);
    };
    const onAbort = () => finish(reject, new Error("Aborted"));
    if (timeout !== null) timer = setTimeout(() => finish(reject, new Error(label)), timeout);
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error)
    );
  });
}
function areRelaySetsEqual2(left, right) {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return right.every((value) => values.has(value));
}
var Nip46Transport = class {
  #secretKey;
  #pubkey;
  #relayPool;
  #networkTimeout;
  #timeoutAfterFirstEose;
  #onError;
  #contexts = /* @__PURE__ */ new Set();
  #activeContext = null;
  #retireTimers = /* @__PURE__ */ new Set();
  #pending = /* @__PURE__ */ new Map();
  #seenEventIds = /* @__PURE__ */ new Set();
  #closed = false;
  constructor(secretKey, {
    relayPool: relayPool2 = relayPool,
    networkTimeout = DEFAULT_TIMEOUT,
    timeoutAfterFirstEose = DEFAULT_TIMEOUT_AFTER_FIRST_EOSE,
    onError
  } = {}) {
    if (!(secretKey instanceof Uint8Array)) throw new ValidationError("NIP46_SECRET_KEY_REQUIRED");
    if (!relayPool2?.getLiveEventsGenerator || !relayPool2?.sendEvent) throw new ValidationError("RELAY_POOL_REQUIRED");
    this.#secretKey = secretKey;
    this.#pubkey = getPublicKey(secretKey);
    this.#relayPool = relayPool2;
    this.#networkTimeout = networkTimeout;
    this.#timeoutAfterFirstEose = timeoutAfterFirstEose;
    this.#onError = onError;
  }
  get pubkey() {
    return this.#pubkey;
  }
  get closed() {
    return this.#closed;
  }
  get activeContext() {
    return this.#activeContext;
  }
  get readyRelays() {
    return this.#activeContext?.stream.readyRelays || Object.freeze([]);
  }
  openContext({ filter, relays, onEvent }) {
    if (this.#closed) throw new Error("NIP46_CLOSED");
    const controller = new AbortController();
    const stream = this.#relayPool.getLiveEventsGenerator(filter, relays, {
      signal: controller.signal,
      timeoutAfterFirstEose: this.#timeoutAfterFirstEose
    });
    const context = { controller, stream, relays: [...relays], consume: null };
    this.#contexts.add(context);
    context.consume = (async () => {
      try {
        for await (const event of stream) {
          Promise.resolve(onEvent(event)).catch((error) => this.#reportError(error));
        }
      } catch (error) {
        if (!this.#closed && error?.message !== "Aborted") this.#reportError(error);
      }
    })();
    return context;
  }
  async awaitContextReady(context, { timeout = this.#networkTimeout, signal } = {}) {
    const report = await waitForNip46(context.stream.ready, {
      timeout,
      signal,
      label: "NIP46_LISTENER_TIMEOUT"
    });
    if (!context.stream.readyRelays.length) {
      throw requestError(report.errors?.[0]?.reason || "NIP46_NO_READY_RELAYS");
    }
    return context.stream.readyRelays;
  }
  activateContext(context, { retirePrevious = true } = {}) {
    const previous = this.#activeContext;
    this.#activeContext = context;
    if (retirePrevious && previous && previous !== context) this.retireContext(previous);
    return previous;
  }
  retireContext(context, delay = RETIRE_CONTEXT_AFTER_MS) {
    if (!context || !this.#contexts.has(context)) return;
    const timer = setTimeout(() => {
      this.#retireTimers.delete(timer);
      this.closeContext(context);
    }, delay);
    this.#retireTimers.add(timer);
  }
  async closeContext(context) {
    if (!context || !this.#contexts.delete(context)) return;
    context.controller.abort();
    try {
      await context.consume;
    } catch {
    }
  }
  isNewEvent(event) {
    if (!event?.id) return true;
    if (this.#seenEventIds.has(event.id)) return false;
    if (this.#seenEventIds.size >= SEEN_EVENT_LIMIT) {
      this.#seenEventIds.delete(this.#seenEventIds.values().next().value);
    }
    this.#seenEventIds.add(event.id);
    return true;
  }
  async sendRequest(peerPubkey, method, params = [], {
    timeout = null,
    signal,
    extension
  } = {}) {
    if (this.#closed) throw new Error("NIP46_CLOSED");
    if (typeof method !== "string" || !method) throw new ValidationError("NIP46_METHOD_REQUIRED");
    if (!Array.isArray(params) || !params.every((param) => typeof param === "string")) {
      throw new ValidationError("NIP46_PARAMS_REQUIRED");
    }
    if (signal?.aborted) throw new Error("Aborted");
    const context = this.#activeContext;
    if (!context) throw new Error("NIP46_LISTENER_UNAVAILABLE");
    await this.awaitContextReady(context, { signal });
    const id = requestId();
    const response = Promise.withResolvers();
    const extra = requestExtension(extension);
    this.#pending.set(id, { ...response, peerPubkey });
    try {
      await this.publish(peerPubkey, { id, method, params, ...extra || {} }, { context });
      return await waitForNip46(response.promise, {
        timeout,
        signal,
        label: "NIP46_REQUEST_TIMEOUT"
      });
    } finally {
      const pending = this.#pending.get(id);
      if (pending?.promise === response.promise) this.#pending.delete(id);
    }
  }
  receiveResponse(peerPubkey, response, { onAuthUrl } = {}) {
    if (!response || typeof response.id !== "string") return false;
    const pending = this.#pending.get(response.id);
    if (!pending || pending.peerPubkey !== peerPubkey) return false;
    if (response.result === "auth_url") {
      try {
        onAuthUrl?.(typeof response.error === "string" ? response.error : "");
      } catch (error) {
        this.#reportError(error);
      }
      return true;
    }
    this.#pending.delete(response.id);
    if (Object.hasOwn(response, "error") && response.error !== null && response.error !== void 0) {
      pending.reject(requestError(response.error));
    } else if (Object.hasOwn(response, "result")) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error("NIP46_INVALID_RESPONSE"));
    }
    return true;
  }
  reply(peerPubkey, id, result, error = null, options) {
    return this.publish(peerPubkey, { id, result, error }, options);
  }
  async publish(peerPubkey, payload, { context = this.#activeContext } = {}) {
    if (this.#closed) throw new Error("NIP46_CLOSED");
    if (!context) throw new Error("NIP46_LISTENER_UNAVAILABLE");
    await this.awaitContextReady(context);
    const relays = context.stream.readyRelays;
    if (!relays.length) throw new Error("NIP46_NO_READY_RELAYS");
    const event = createNip46Event({ secretKey: this.#secretKey, recipientPubkey: peerPubkey, payload });
    const published = await this.#relayPool.sendEvent(event, relays, {
      timeout: this.#networkTimeout,
      timeoutUntilFirstFulfillment: null
    });
    if (!published.success) {
      const report = await published.promise;
      throw requestError(report.errors?.[0]?.reason || "NIP46_PUBLISH_FAILED");
    }
    return event;
  }
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const timer of this.#retireTimers) clearTimeout(timer);
    this.#retireTimers.clear();
    const contexts = [...this.#contexts];
    for (const context of contexts) context.controller.abort();
    await Promise.all(contexts.map((context) => this.closeContext(context)));
    this.#activeContext = null;
    for (const pending of this.#pending.values()) pending.reject(new Error("NIP46_CLOSED"));
    this.#pending.clear();
  }
  #reportError(error) {
    try {
      if (this.#onError) {
        Promise.resolve(this.#onError(error)).catch((callbackError) => {
          console.error("NIP46 onError failed:", callbackError);
        });
      } else console.error("NIP46 stream failed:", error);
    } catch (callbackError) {
      console.error("NIP46 onError failed:", callbackError);
    }
  }
};

// node_modules/libp2r2p/nip46/services/client.js
function cleanClientMetadata(value) {
  if (!value || typeof value !== "object") return null;
  const metadata = {};
  for (const key of ["name", "url", "image"]) {
    if (typeof value[key] === "string" && value[key]) metadata[key] = value[key];
  }
  return Object.keys(metadata).length ? metadata : null;
}
var Nip46Client = class {
  #secretKey;
  #transport;
  #pointer;
  #onAuthUrl;
  #onRequest;
  constructor(clientSecretKey, pointer, {
    relayPool: relayPool2 = relayPool,
    onAuthUrl,
    onRequest,
    onError,
    timeout = DEFAULT_TIMEOUT,
    timeoutAfterFirstEose = DEFAULT_TIMEOUT_AFTER_FIRST_EOSE
  } = {}) {
    const normalized = normalizeBunkerPointer(pointer);
    if (!normalized) throw new ValidationError("INVALID_BUNKER_POINTER");
    this.#secretKey = clientSecretKey;
    this.#pointer = normalized;
    this.#onAuthUrl = onAuthUrl;
    this.#onRequest = onRequest;
    this.#transport = new Nip46Transport(clientSecretKey, {
      relayPool: relayPool2,
      networkTimeout: timeout,
      timeoutAfterFirstEose,
      onError
    });
    this.#transport.activateContext(this.#openResponseContext(normalized), { retirePrevious: false });
  }
  // Creates a client for a parsed direct `bunker://` pointer.
  static fromBunker(clientSecretKey, pointer, options = {}) {
    return new this(clientSecretKey, pointer, options);
  }
  // Waits for a signer response to a client-created `nostrconnect://` URI.
  static async fromURI(clientSecretKey, uri, options = {}) {
    const parsed = parseNostrConnectURI(uri);
    const clientPubkey = getPublicKey(clientSecretKey);
    if (!parsed || clientPubkey !== parsed.clientPubkey) throw new ValidationError("INVALID_NOSTRCONNECT_URI");
    const relayPool2 = options.relayPool || relayPool;
    const controller = new AbortController();
    const stream = relayPool2.getLiveEventsGenerator({
      kinds: [NIP46_KIND],
      "#p": [clientPubkey],
      limit: 0
    }, parsed.relays, {
      signal: controller.signal,
      timeoutAfterFirstEose: options.timeoutAfterFirstEose ?? DEFAULT_TIMEOUT_AFTER_FIRST_EOSE
    });
    const found = Promise.withResolvers();
    const consume = (async () => {
      try {
        for await (const event of stream) {
          if (!isNip46EventFor(event, clientPubkey)) continue;
          const response = decodeNip46Frame(event, clientSecretKey);
          if (response?.result === parsed.secret) {
            found.resolve({
              remoteSignerPubkey: event.pubkey,
              relays: parsed.relays,
              secret: parsed.secret
            });
          }
        }
      } catch (error) {
        if (error?.message !== "Aborted") found.reject(error);
      }
    })();
    try {
      const timeout = options.timeout ?? DEFAULT_TIMEOUT;
      const report = await waitForNip46(stream.ready, {
        timeout,
        signal: options.signal,
        label: "NIP46_LISTENER_TIMEOUT"
      });
      if (!stream.readyRelays.length) {
        throw requestError(report.errors?.[0]?.reason || "NIP46_NO_READY_RELAYS");
      }
      const pointer = await waitForNip46(found.promise, {
        timeout,
        signal: options.signal,
        label: "NIP46_CONNECTION_TIMEOUT"
      });
      controller.abort();
      await consume;
      const client = new this(clientSecretKey, pointer, options);
      await client.#awaitReady({ timeout, signal: options.signal });
      await client.#switchRelaysAfterConnect();
      return client;
    } catch (error) {
      controller.abort();
      await consume.catch(() => {
      });
      throw error;
    }
  }
  get clientPubkey() {
    return this.#transport.pubkey;
  }
  get pointer() {
    return { ...this.#pointer, relays: [...this.#pointer.relays] };
  }
  // Connects and immediately asks the remote signer for its preferred relays.
  async connect({ requestedPermissions = [], clientMetadata, timeout = null, signal } = {}) {
    const permissions = Array.isArray(requestedPermissions) ? requestedPermissions.filter((permission) => typeof permission === "string" && permission).join(",") : "";
    const metadata = cleanClientMetadata(clientMetadata);
    const params = [this.#pointer.remoteSignerPubkey, this.#pointer.secret || ""];
    if (permissions || metadata) params.push(permissions);
    if (metadata) params.push(JSON.stringify(metadata));
    await this.sendRequest("connect", params, { timeout, signal });
    return this.#switchRelaysAfterConnect();
  }
  // Sends a positional-string request after the response listener is ready.
  sendRequest(method, params = [], options = {}) {
    return this.#transport.sendRequest(this.#pointer.remoteSignerPubkey, method, params, options);
  }
  async ping(options) {
    const response = await this.sendRequest("ping", [], options);
    if (response !== "pong") throw new Error(`NIP46_PING_FAILED:${response}`);
  }
  async logout(options) {
    const response = await this.sendRequest("logout", [], options);
    if (response !== "ack") throw new Error(`NIP46_LOGOUT_FAILED:${response}`);
    await this.close();
  }
  // Moves to the relay list returned by the remote signer, if it changed.
  async switchRelays(options) {
    const response = await this.sendRequest("switch_relays", [], options);
    if (response === null) return false;
    let relays;
    try {
      relays = JSON.parse(response);
    } catch {
      return false;
    }
    if (relays === null) return false;
    const nextPointer = normalizeBunkerPointer({ ...this.#pointer, relays });
    if (!nextPointer || areRelaySetsEqual2(nextPointer.relays, this.#pointer.relays)) return false;
    const nextContext = this.#openResponseContext(nextPointer);
    try {
      await this.#transport.awaitContextReady(nextContext);
    } catch {
      await this.#transport.closeContext(nextContext);
      return false;
    }
    this.#pointer = nextPointer;
    this.#transport.activateContext(nextContext);
    return true;
  }
  close() {
    return this.#transport.close();
  }
  async #switchRelaysAfterConnect() {
    try {
      return await this.switchRelays({ timeout: RELAY_SWITCH_WAIT_TIMEOUT });
    } catch {
      return false;
    }
  }
  #openResponseContext(pointer) {
    const context = this.#transport.openContext({
      filter: {
        kinds: [NIP46_KIND],
        authors: [pointer.remoteSignerPubkey],
        "#p": [this.#transport.pubkey],
        limit: 0
      },
      relays: pointer.relays,
      onEvent: (event) => this.#receiveEvent(event, context)
    });
    return context;
  }
  #awaitReady(options) {
    return this.#transport.awaitContextReady(this.#transport.activeContext, options);
  }
  #receiveEvent(event, context) {
    if (event?.pubkey !== this.#pointer.remoteSignerPubkey || !isNip46EventFor(event, this.#transport.pubkey) || !this.#transport.isNewEvent(event)) return;
    const frame = decodeNip46Frame(event, this.#secretKey);
    if (!frame) return;
    if (Object.hasOwn(frame, "method")) {
      return this.#handleRequest(event.pubkey, frame, context);
    }
    this.#transport.receiveResponse(event.pubkey, frame, { onAuthUrl: this.#onAuthUrl });
  }
  async #handleRequest(peerPubkey, request, context) {
    if (!isValidRequestFrame(request)) {
      if (typeof request?.id === "string") {
        await this.#transport.reply(peerPubkey, request.id, null, "NIP46_INVALID_REQUEST", { context });
      }
      return;
    }
    try {
      if (!this.#onRequest) throw new Error("NIP46_METHOD_NOT_SUPPORTED");
      const result = await this.#onRequest({
        method: request.method,
        params: [...request.params],
        peerPubkey
      });
      if (typeof result !== "string") throw new Error("NIP46_RESULT_REQUIRED");
      await this.#transport.reply(peerPubkey, request.id, result, null, { context });
    } catch (error) {
      await this.#transport.reply(peerPubkey, request.id, null, error?.message || "NIP46_REQUEST_REJECTED", { context });
    }
  }
};

// node_modules/libp2r2p/nip46/services/bunker-signer.js
var BunkerSigner = class extends Nip46Client {
  #cachedPubkey = null;
  constructor(...args) {
    super(...args);
    Object.preventExtensions(this);
  }
  async getPublicKey(options) {
    if (!options?.extension && this.#cachedPubkey) return this.#cachedPubkey;
    const pubkey = await this.sendRequest("get_public_key", [], options);
    if (!isValidPubkey2(pubkey)) throw new ValidationError("NIP46_INVALID_PUBLIC_KEY");
    if (!options?.extension) this.#cachedPubkey = pubkey;
    return pubkey;
  }
  async signEvent(event, options) {
    const response = await this.sendRequest("sign_event", [JSON.stringify(event)], options);
    let signed;
    try {
      signed = JSON.parse(response);
    } catch (cause) {
      throw new ValidationError("NIP46_INVALID_SIGNED_EVENT", { cause });
    }
    if (!isValidEvent(signed)) throw new ValidationError("NIP46_INVALID_SIGNED_EVENT");
    return signed;
  }
  nip04Encrypt(pubkey, plaintext, options) {
    return this.sendRequest("nip04_encrypt", [pubkey, plaintext], options);
  }
  nip04Decrypt(pubkey, ciphertext, options) {
    return this.sendRequest("nip04_decrypt", [pubkey, ciphertext], options);
  }
  nip44Encrypt(pubkey, plaintext, options) {
    return this.sendRequest("nip44_encrypt", [pubkey, plaintext], options);
  }
  nip44Decrypt(pubkey, ciphertext, options) {
    return this.sendRequest("nip44_decrypt", [pubkey, ciphertext], options);
  }
};

// node_modules/libp2r2p/nip46/services/server-session.js
function cleanRelays(relays) {
  return [...new Set((Array.isArray(relays) ? relays : []).filter((relay) => typeof relay === "string" && relay))];
}
function parseClientMetadata(value) {
  if (!value) return null;
  try {
    const metadata = JSON.parse(value);
    return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : null;
  } catch {
    return null;
  }
}
var Nip46ServerSession = class {
  #secretKey;
  #secret;
  #secretConsumed = false;
  #transport;
  #relays;
  #clientPubkey = null;
  #connectingPubkey = null;
  #pendingContext = null;
  #onConnect;
  #onRequest;
  #onLogout;
  constructor(serverSecretKey, {
    relays,
    secret = "",
    relayPool: relayPool2 = relayPool,
    onConnect,
    onRequest,
    onLogout,
    onError,
    timeout = DEFAULT_TIMEOUT,
    timeoutAfterFirstEose = DEFAULT_TIMEOUT_AFTER_FIRST_EOSE
  } = {}) {
    this.#relays = cleanRelays(relays);
    if (!this.#relays.length) throw new ValidationError("NIP46_RELAYS_REQUIRED");
    if (typeof secret !== "string") throw new ValidationError("NIP46_SECRET_REQUIRED");
    this.#secretKey = serverSecretKey;
    this.#secret = secret;
    this.#onConnect = onConnect;
    this.#onRequest = onRequest;
    this.#onLogout = onLogout;
    this.#transport = new Nip46Transport(serverSecretKey, {
      relayPool: relayPool2,
      networkTimeout: timeout,
      timeoutAfterFirstEose,
      onError
    });
  }
  get serverPubkey() {
    return this.#transport.pubkey;
  }
  get clientPubkey() {
    return this.#clientPubkey;
  }
  get relays() {
    return Object.freeze([...this.#relays]);
  }
  get readyRelays() {
    return this.#transport.readyRelays;
  }
  // Opens the live request listener and waits until at least one relay is ready.
  start(options) {
    if (!this.#transport.activeContext) {
      this.#transport.activateContext(this.#openContext(this.#relays), { retirePrevious: false });
    }
    return this.#transport.awaitContextReady(this.#transport.activeContext, options);
  }
  // Sends an application-defined request to the connected client.
  sendRequest(method, params = [], options = {}) {
    if (!this.#clientPubkey) return Promise.reject(new Error("NIP46_NOT_CONNECTED"));
    return this.#transport.sendRequest(this.#clientPubkey, method, params, options);
  }
  // Opens replacements now and switches only after the client requests them.
  async updateRelays(relays) {
    const nextRelays = cleanRelays(relays);
    if (!nextRelays.length) throw new ValidationError("NIP46_RELAYS_REQUIRED");
    if (areRelaySetsEqual2(nextRelays, this.#relays)) return false;
    if (!this.#transport.activeContext) {
      this.#relays = nextRelays;
      return true;
    }
    const nextContext = this.#openContext(nextRelays);
    try {
      await this.#transport.awaitContextReady(nextContext);
    } catch (error) {
      await this.#transport.closeContext(nextContext);
      throw error;
    }
    if (this.#pendingContext) await this.#transport.closeContext(this.#pendingContext);
    this.#relays = nextRelays;
    this.#pendingContext = nextContext;
    return true;
  }
  close() {
    this.#pendingContext = null;
    return this.#transport.close();
  }
  #openContext(relays) {
    const context = this.#transport.openContext({
      filter: {
        kinds: [NIP46_KIND],
        "#p": [this.#transport.pubkey],
        limit: 0
      },
      relays,
      onEvent: (event) => this.#receiveEvent(event, context)
    });
    return context;
  }
  #receiveEvent(event, context) {
    if (!isNip46EventFor(event, this.#transport.pubkey) || !this.#transport.isNewEvent(event)) return;
    const frame = decodeNip46Frame(event, this.#secretKey);
    if (!frame) return;
    if (!Object.hasOwn(frame, "method")) {
      if (event.pubkey === this.#clientPubkey) this.#transport.receiveResponse(event.pubkey, frame);
      return;
    }
    return this.#handleRequest(event.pubkey, frame, context);
  }
  async #handleRequest(peerPubkey, request, context) {
    if (!isValidRequestFrame(request)) {
      if (typeof request?.id === "string") {
        await this.#transport.reply(peerPubkey, request.id, null, "NIP46_INVALID_REQUEST", { context });
      }
      return;
    }
    if (request.method === "connect") {
      await this.#handleConnect(peerPubkey, request, context);
      return;
    }
    if (!this.#clientPubkey || peerPubkey !== this.#clientPubkey) {
      await this.#transport.reply(peerPubkey, request.id, null, "NIP46_NOT_CONNECTED", { context });
      return;
    }
    try {
      if (request.method === "ping") {
        await this.#transport.reply(peerPubkey, request.id, "pong", null, { context });
        return;
      }
      if (request.method === "switch_relays") {
        await this.#transport.reply(peerPubkey, request.id, JSON.stringify(this.#relays), null, { context });
        if (this.#pendingContext) {
          const nextContext = this.#pendingContext;
          this.#pendingContext = null;
          const previous = this.#transport.activateContext(nextContext, { retirePrevious: false });
          if (previous && previous !== nextContext) this.#transport.retireContext(previous);
        }
        return;
      }
      if (request.method === "logout") {
        await this.#transport.reply(peerPubkey, request.id, "ack", null, { context });
        await this.#onLogout?.({ clientPubkey: peerPubkey });
        await this.close();
        return;
      }
      if (!this.#onRequest) throw new Error("NIP46_METHOD_NOT_SUPPORTED");
      const result = await this.#onRequest({
        method: request.method,
        params: [...request.params],
        clientPubkey: peerPubkey
      });
      if (typeof result !== "string") throw new Error("NIP46_RESULT_REQUIRED");
      await this.#transport.reply(peerPubkey, request.id, result, null, { context });
    } catch (error) {
      await this.#transport.reply(peerPubkey, request.id, null, error?.message || "NIP46_REQUEST_REJECTED", { context });
    }
  }
  async #handleConnect(peerPubkey, request, context) {
    if (this.#clientPubkey || this.#connectingPubkey || this.#secretConsumed) {
      await this.#transport.reply(peerPubkey, request.id, null, "NIP46_ALREADY_CONNECTED", { context });
      return;
    }
    if (request.params[0] !== this.#transport.pubkey || request.params[1] !== this.#secret) {
      await this.#transport.reply(peerPubkey, request.id, null, "NIP46_INVALID_SECRET", { context });
      return;
    }
    const requestedPermissions = request.params[2] ? request.params[2].split(",").filter(Boolean) : [];
    const clientMetadata = parseClientMetadata(request.params[3]);
    this.#connectingPubkey = peerPubkey;
    try {
      await this.#onConnect?.({ peerPubkey, requestedPermissions, clientMetadata });
    } catch (error) {
      this.#connectingPubkey = null;
      await this.#transport.reply(peerPubkey, request.id, null, error?.message || "NIP46_CONNECT_REJECTED", { context });
      return;
    }
    this.#clientPubkey = peerPubkey;
    this.#secretConsumed = true;
    try {
      await this.#transport.reply(peerPubkey, request.id, "ack", null, { context });
    } catch (error) {
      this.#clientPubkey = null;
      this.#secretConsumed = false;
      throw error;
    } finally {
      this.#connectingPubkey = null;
    }
  }
};

// src/services/bunker.js
var PING_INTERVAL_MS = 6e4;
var PING_TIMEOUT_MS = 1e4;
var IDLE_TIMEOUT_MS = 5 * 6e4;
var clientKeysByHandle = /* @__PURE__ */ new WeakMap();
var handleCreateToken = Symbol("BunkerHandle-create");
function withTimeout(promise, ms, label = "TIMEOUT") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
function parseJsonResult(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}
function vaultClientMetadata() {
  const metadata = { name: "ez-vault" };
  const origin = globalThis.location?.origin;
  if (typeof origin === "string" && origin && origin !== "null") metadata.url = origin;
  return metadata;
}
async function fetchRelaysForPubkey(pubkey) {
  const event = await fetchRelayListEvent(pubkey);
  const { read, write } = parseRelayListEvent2(event);
  if (!read.length && !write.length) {
    const fallback = freeRelays.slice(0, 2);
    return { read: fallback, write: fallback };
  }
  return { read, write };
}
async function openSigner(bunkerUrl, clientSecretKey) {
  const pointer = parseBunkerUrl(bunkerUrl);
  if (!pointer) throw new Error("INVALID_BUNKER_URL");
  const signer = BunkerSigner.fromBunker(clientSecretKey, pointer, { relayPool });
  try {
    await signer.connect({ clientMetadata: vaultClientMetadata() });
  } catch (err) {
    const msg = typeof err === "string" ? err : err?.message ?? "";
    if (!/already connected/i.test(msg)) {
      try {
        await signer.close();
      } catch {
      }
      throw err;
    }
    await signer.switchRelays({ timeout: 1e3 }).catch(() => false);
  }
  return signer;
}
async function persistHandleState({ pubkey, bunkerUrl }) {
  if (!pubkey) return;
  const rec = get(pubkey);
  if (!rec || rec.bunker === bunkerUrl) return;
  await update(pubkey, { bunker: bunkerUrl });
}
var BunkerHandle = class _BunkerHandle {
  #state;
  #onStateChange;
  #signerPromise = null;
  #pingTimer = null;
  #lastUsedAt = 0;
  #closed = false;
  #onClose;
  static create(params) {
    return new _BunkerHandle(handleCreateToken, params);
  }
  constructor(token, { pubkey = null, bunkerUrl, clientKey = null, onStateChange, onClose } = {}) {
    if (token !== handleCreateToken) throw new Error("USE_BunkerHandle_create");
    if (!bunkerUrl) throw new Error("BUNKER_URL_REQUIRED");
    const finalClientKey = clientKey || bytesToHex3(generateSecretKey());
    this.#state = { pubkey, bunkerUrl };
    clientKeysByHandle.set(this, finalClientKey);
    this.#onStateChange = onStateChange;
    this.#onClose = onClose;
    this.#lastUsedAt = Date.now();
    Object.preventExtensions(this);
    this.#scheduleTick();
  }
  // Read-only snapshot. Note: clientKey is intentionally absent.
  get state() {
    return { ...this.#state };
  }
  async getPublicKey() {
    const pubkey = await this.#request((s) => s.getPublicKey());
    if (!this.#state.pubkey) {
      this.#state.pubkey = pubkey;
      this.#notifyStateChange();
    }
    return pubkey;
  }
  async signEvent(event) {
    return this.#request((s) => s.signEvent(event));
  }
  async nip04Encrypt(pk, pt) {
    return this.#request((s) => s.nip04Encrypt(pk, pt));
  }
  async nip04Decrypt(pk, ct) {
    return this.#request((s) => s.nip04Decrypt(pk, ct));
  }
  async nip44Encrypt(pk, pt) {
    return this.#request((s) => s.nip44Encrypt(pk, pt));
  }
  async nip44Decrypt(pk, ct) {
    return this.#request((s) => s.nip44Decrypt(pk, ct));
  }
  async nip44v3Encrypt(pk, kind, scope = "", pt) {
    return this.#sendRequest("nip44v3_encrypt", [pk, String(kind), scope || "", pt]);
  }
  async nip44v3Decrypt(pk, kind, scope = "", ct) {
    return this.#sendRequest("nip44v3_decrypt", [pk, String(kind), scope || "", ct]);
  }
  async obfuscate(value, kind, scope) {
    return this.#sendRequest("obfuscate", [value, String(kind), scope]);
  }
  async nip44EncryptDoubleDH(pk, kind, scope = "", pt, peerContentPubkey = "") {
    return parseJsonResult(await this.#sendRequest("nip44v3_encrypt_double_dh", [pk, String(kind), scope || "", pt, peerContentPubkey || ""]));
  }
  async nip44DecryptDoubleDH(pk, kind, scope = "", ct, peerContentPubkey = "", ownContentPubkey = "") {
    return parseJsonResult(await this.#sendRequest("nip44v3_decrypt_double_dh", [pk, String(kind), scope || "", ct, peerContentPubkey || "", ownContentPubkey || ""]));
  }
  async doubleSignEvent(event) {
    return parseJsonResult(await this.#sendRequest("double_sign_event", [JSON.stringify(event || {})]));
  }
  async getRelays() {
    return fetchRelaysForPubkey(await this.getPublicKey());
  }
  withSharedKey(peerPubkey, info) {
    return new BunkerSharedKeyHandle(this, peerPubkey, info);
  }
  // Adopt this freshly-imported handle into the secrets pool. Called by the
  // import flow after `passkey.ensureRegistered()` succeeds. The clientKey
  // is read out of the WeakMap and threaded straight into secrets's
  // adopt-call without flowing through any return value.
  async commit() {
    const pubkey = this.#state.pubkey;
    if (!pubkey) throw new Error("PUBKEY_NOT_READY");
    const clientKey = clientKeysByHandle.get(this);
    if (!clientKey) throw new Error("NO_CLIENT_KEY");
    await adoptBunkerHandle(pubkey, this, clientKey);
  }
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    clearTimeout(this.#pingTimer);
    this.#pingTimer = null;
    this.#onClose?.(this);
    const p = this.#signerPromise;
    this.#signerPromise = null;
    if (p) {
      try {
        const signer = await p;
        try {
          await signer.close();
        } catch {
        }
      } catch {
      }
    }
  }
  #notifyStateChange() {
    try {
      Promise.resolve(this.#onStateChange?.({ pubkey: this.#state.pubkey, bunkerUrl: this.#state.bunkerUrl })).catch((err) => console.warn("bunker state persistence failed", err?.message ?? err));
    } catch (err) {
      console.warn("bunker state persistence failed", err?.message ?? err);
    }
  }
  async #request(fn) {
    if (this.#closed) throw new Error("BUNKER_CLOSED");
    this.#lastUsedAt = Date.now();
    const signer = await this.#getSigner();
    if (this.#closed) throw new Error("BUNKER_CLOSED");
    return fn(signer);
  }
  async #sendRequest(method, params = []) {
    return this.#request((signer) => signer.sendRequest(method, params));
  }
  async tweakedSendRequest(tweak, method, params = []) {
    return this.#withTweakedSendRequest(tweak, (signer, options) => signer.sendRequest(method, params, options));
  }
  async tweakedRequest(tweak, method, params = []) {
    return this.#withTweakedSendRequest(tweak, (signer, options) => signer[method](...params, options));
  }
  async #withTweakedSendRequest(tweak, fn) {
    return this.#request((signer) => fn(signer, { extension: { tweak } }));
  }
  #getSigner() {
    if (this.#closed) return Promise.reject(new Error("BUNKER_CLOSED"));
    if (!this.#signerPromise) {
      const promise = this.#connect();
      this.#signerPromise = promise;
      promise.catch(() => {
        if (this.#signerPromise === promise) this.#signerPromise = null;
      });
    }
    return this.#signerPromise;
  }
  async #connect() {
    const clientKey = clientKeysByHandle.get(this);
    const signer = await openSigner(this.#state.bunkerUrl, hexToBytes3(clientKey));
    const connectedUrl = toBunkerUrl({ ...signer.pointer, secret: null });
    if (connectedUrl !== this.#state.bunkerUrl) {
      this.#state.bunkerUrl = connectedUrl;
      this.#notifyStateChange();
    }
    this.#scheduleTick();
    return signer;
  }
  #scheduleTick() {
    clearTimeout(this.#pingTimer);
    this.#pingTimer = setTimeout(() => this.#tick(), PING_INTERVAL_MS);
  }
  async #tick() {
    if (this.#closed) return;
    if (Date.now() - this.#lastUsedAt >= IDLE_TIMEOUT_MS) {
      this.close();
      return;
    }
    if (this.#signerPromise) {
      try {
        const signer = await this.#signerPromise;
        await withTimeout(signer.ping(), PING_TIMEOUT_MS, "PING_TIMEOUT");
      } catch (err) {
        console.warn("bunker ping failed, reconnecting", err?.message ?? err);
        const stale = this.#signerPromise;
        this.#signerPromise = null;
        try {
          const signer = await stale;
          try {
            await signer.close();
          } catch {
          }
        } catch {
        }
        this.#getSigner().catch((e) => {
          console.warn("bunker reconnect failed", e?.message ?? e);
        });
      }
    }
    this.#scheduleTick();
  }
};
Object.freeze(BunkerHandle.prototype);
Object.freeze(BunkerHandle);
var BunkerSharedKeyHandle = class _BunkerSharedKeyHandle {
  #handle;
  #peerPubkey;
  #info;
  constructor(handle, peerPubkey, info = "") {
    this.#handle = handle;
    this.#peerPubkey = peerPubkey;
    this.#info = info;
    Object.preventExtensions(this);
  }
  #tweak() {
    return ["withSharedKey", this.#peerPubkey, this.#info];
  }
  #request(method, params = []) {
    return this.#handle.tweakedRequest(this.#tweak(), method, params);
  }
  #sendRequest(method, params = []) {
    return this.#handle.tweakedSendRequest(this.#tweak(), method, params);
  }
  getPublicKey() {
    return this.#request("getPublicKey");
  }
  signEvent(event) {
    return this.#request("signEvent", [event]);
  }
  nip04Encrypt(pk, pt) {
    return this.#request("nip04Encrypt", [pk, pt]);
  }
  nip04Decrypt(pk, ct) {
    return this.#request("nip04Decrypt", [pk, ct]);
  }
  nip44Encrypt(pk, pt) {
    return this.#request("nip44Encrypt", [pk, pt]);
  }
  nip44Decrypt(pk, ct) {
    return this.#request("nip44Decrypt", [pk, ct]);
  }
  nip44v3Encrypt(pk, kind, scope = "", pt) {
    return this.#sendRequest("nip44v3_encrypt", [pk, String(kind), scope || "", pt]);
  }
  nip44v3Decrypt(pk, kind, scope = "", ct) {
    return this.#sendRequest("nip44v3_decrypt", [pk, String(kind), scope || "", ct]);
  }
  obfuscate(value, kind, scope) {
    return this.#sendRequest("obfuscate", [value, String(kind), scope]);
  }
  async nip44EncryptDoubleDH(pk, kind, scope = "", pt, peerContentPubkey = "") {
    return parseJsonResult(await this.#sendRequest("nip44v3_encrypt_double_dh", [pk, String(kind), scope || "", pt, peerContentPubkey || ""]));
  }
  async nip44DecryptDoubleDH(pk, kind, scope = "", ct, peerContentPubkey = "", ownContentPubkey = "") {
    return parseJsonResult(await this.#sendRequest("nip44v3_decrypt_double_dh", [pk, String(kind), scope || "", ct, peerContentPubkey || "", ownContentPubkey || ""]));
  }
  async doubleSignEvent(event) {
    return parseJsonResult(await this.#sendRequest("double_sign_event", [JSON.stringify(event || {})]));
  }
  async getRelays() {
    return fetchRelaysForPubkey(await this.getPublicKey());
  }
  withSharedKey(peerPubkey, info = this.#info) {
    return new _BunkerSharedKeyHandle(this.#handle, peerPubkey, info);
  }
};
Object.freeze(BunkerSharedKeyHandle.prototype);
async function fetchBunkerUserPubkey(bunkerUrl, { clientKey, onHandle } = {}) {
  const handle = BunkerHandle.create({ bunkerUrl, clientKey, onStateChange: persistHandleState });
  onHandle?.(handle);
  try {
    const pubkey = await handle.getPublicKey();
    return {
      pubkey,
      bunkerUrl: handle.state.bunkerUrl
    };
  } catch (err) {
    await handle.close();
    throw err;
  }
}

// src/helpers/tlv.js
function encodeTlv(records) {
  let total = 0;
  for (const [, value] of records) {
    if (value.length > 255) throw new Error("TLV_VALUE_TOO_LONG");
    total += 2 + value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const [type, value] of records) {
    out[offset++] = type;
    out[offset++] = value.length;
    out.set(value, offset);
    offset += value.length;
  }
  return out;
}
function decodeTlv(bytes) {
  const out = {};
  let i = 0;
  while (i < bytes.length) {
    if (i + 2 > bytes.length) throw new Error("TLV_TRUNCATED_HEADER");
    const type = bytes[i];
    const length = bytes[i + 1];
    const valueStart = i + 2;
    const valueEnd = valueStart + length;
    if (valueEnd > bytes.length) throw new Error("TLV_TRUNCATED_VALUE");
    (out[type] ??= []).push(bytes.slice(valueStart, valueEnd));
    i = valueEnd;
  }
  return out;
}

// src/services/secret-blob.js
var TLV_NSEC = 1;
var TLV_BUNKER = 2;
var TLV_DEVICE_SIGNER = 4;
var TLV_PADDING = 0;
function encodeSecretEntries(entries) {
  const records = [];
  for (const e of entries) {
    if (e.type === "nsec") {
      records.push([TLV_NSEC, hexToBytes3(e.seckey)]);
    } else if (e.type === "bunker") {
      const value = new Uint8Array(64);
      value.set(hexToBytes3(e.pubkey), 0);
      value.set(hexToBytes3(e.clientKey), 32);
      records.push([TLV_BUNKER, value]);
    } else if (e.type === "device-signer") {
      records.push([TLV_DEVICE_SIGNER, hexToBytes3(e.seckey)]);
    }
  }
  if (!records.length) records.push([TLV_PADDING, new Uint8Array(0)]);
  return encodeTlv(records);
}
function decodeSecretEntries(bytes) {
  const tlv = decodeTlv(bytes);
  const entries = [];
  for (const v of tlv[TLV_NSEC] || []) {
    if (v.length !== 32) continue;
    entries.push({
      type: "nsec",
      pubkey: getPublicKey(v),
      seckey: bytesToHex3(v)
    });
  }
  for (const v of tlv[TLV_BUNKER] || []) {
    if (v.length !== 64) continue;
    entries.push({
      type: "bunker",
      pubkey: bytesToHex3(v.slice(0, 32)),
      clientKey: bytesToHex3(v.slice(32, 64))
    });
  }
  for (const v of tlv[TLV_DEVICE_SIGNER] || []) {
    if (v.length !== 32) continue;
    entries.push({
      type: "device-signer",
      seckey: bytesToHex3(v)
    });
  }
  return entries;
}

// node_modules/libp2r2p/private-message/index.js
var private_message_exports = {};
__export(private_message_exports, {
  ASK_KIND: () => ASK_KIND,
  REPLY_KIND: () => REPLY_KIND,
  TELL_KIND: () => TELL_KIND,
  ask: () => ask,
  broadcastEvent: () => broadcastEvent,
  broadcastNymEvent: () => broadcastNymEvent,
  broadcastNymRumor: () => broadcastNymRumor,
  broadcastRumor: () => broadcastRumor,
  clearChannelState: () => clearChannelState,
  parseRumorContent: () => parseRumorContent,
  reply: () => reply,
  tell: () => tell,
  unwatch: () => unwatch,
  watch: () => watch,
  yell: () => yell
});

// node_modules/libp2r2p/private-channel/index.js
var private_channel_exports = {};
__export(private_channel_exports, {
  EXPIRATION_SECONDS: () => EXPIRATION_SECONDS,
  MAX_EVENT_BYTES: () => MAX_EVENT_BYTES,
  NYM_CARRIER_KIND: () => NYM_CARRIER_KIND,
  PRIVATE_BROADCAST_KIND: () => PRIVATE_BROADCAST_KIND,
  ROUTER_KIND: () => ROUTER_KIND,
  eventFromNymCarriers: () => eventFromNymCarriers,
  fetch: () => fetch,
  getJsonlChunkByteSize: () => getJsonlChunkByteSize,
  getNymCarrierChunkSize: () => getNymCarrierChunkSize,
  publish: () => publish,
  publishNymEvent: () => publishNymEvent,
  subscribe: () => subscribe2,
  unwrapEvent: () => unwrapEvent,
  wrapEvent: () => wrapEvent,
  wrapEvents: () => wrapEvents,
  wrapNymEvent: () => wrapNymEvent,
  wrapNymEvents: () => wrapNymEvents
});

// node_modules/libp2r2p/content-key/event/index.js
var CONTENT_KEY_KIND = 18716;
var HEX_PUBKEY2 = /^[0-9a-f]{64}$/;
var HEX_SIG = /^[0-9a-f]{128}$/i;
function nowSeconds() {
  return Math.floor(Date.now() / 1e3);
}
async function makeContentKeyEventForPubkey({ userSigner, contentPubkey, createdAt = nowSeconds() }) {
  if (!userSigner?.getPublicKey || !userSigner?.signEvent) throw new ValidationError("USER_SIGNER_REQUIRED");
  if (!HEX_PUBKEY2.test(contentPubkey || "")) throw new ValidationError("CONTENT_PUBKEY_REQUIRED");
  return userSigner.signEvent({
    kind: CONTENT_KEY_KIND,
    created_at: createdAt,
    tags: [["cp", contentPubkey]],
    content: ""
  });
}
async function makeContentKeyEvent({ userSigner, contentKeySigner, createdAt = nowSeconds() }) {
  if (!contentKeySigner?.getPublicKey) throw new ValidationError("CONTENT_KEY_SIGNER_REQUIRED");
  return makeContentKeyEventForPubkey({
    userSigner,
    contentPubkey: await contentKeySigner.getPublicKey(),
    createdAt
  });
}
function parseContentKeyEvent(event) {
  if (!event || event.kind !== CONTENT_KEY_KIND || event.content !== "") return null;
  if (!HEX_PUBKEY2.test(event.pubkey) || !Number.isSafeInteger(event.created_at)) return null;
  if (!Array.isArray(event.tags) || event.tags.length !== 1) return null;
  if (!isValidEvent(event)) return null;
  const [name, contentPubkey, ...rest] = event.tags[0] || [];
  if (name !== "cp" || rest.length || !HEX_PUBKEY2.test(contentPubkey || "")) return null;
  return { iykcPubkey: contentPubkey, iykcProof: makeContentKeyProof(event) };
}
function makeContentKeyProof(contentKeyEvent) {
  if (!Number.isSafeInteger(contentKeyEvent?.created_at) || !HEX_SIG.test(contentKeyEvent?.sig || "")) return "";
  return `${contentKeyEvent.created_at}:${contentKeyEvent.sig}`;
}
function parseContentKeyProof(proof) {
  if (typeof proof !== "string") return null;
  const [createdAtString, sig, extra] = proof.split(":");
  if (extra != null || !/^\d+$/.test(createdAtString || "") || !HEX_SIG.test(sig || "")) return null;
  const created_at = Number(createdAtString);
  if (!Number.isSafeInteger(created_at)) return null;
  return { created_at, sig };
}
function contentKeyProofError({ ownerPubkey, contentPubkey, proof }) {
  if (!HEX_PUBKEY2.test(ownerPubkey || "")) return "INVALID_CONTENT_KEY_OWNER_PUBKEY";
  if (!HEX_PUBKEY2.test(contentPubkey || "")) return "INVALID_CONTENT_KEY_PUBKEY";
  const parsed = parseContentKeyProof(proof);
  if (!parsed) return "INVALID_CONTENT_KEY_PROOF";
  const event = {
    kind: CONTENT_KEY_KIND,
    pubkey: ownerPubkey,
    created_at: parsed.created_at,
    tags: [["cp", contentPubkey]],
    content: "",
    sig: parsed.sig
  };
  event.id = getEventHash(event);
  return isValidEvent(event) ? null : "INVALID_CONTENT_KEY_PROOF_SIGNATURE";
}
function iykcProofError({ receiverPubkey, iykcPubkey, iykcProof }) {
  const error = contentKeyProofError({
    ownerPubkey: receiverPubkey,
    contentPubkey: iykcPubkey,
    proof: iykcProof
  });
  return {
    INVALID_CONTENT_KEY_OWNER_PUBKEY: "INVALID_IYKC_RECEIVER_PUBKEY",
    INVALID_CONTENT_KEY_PUBKEY: "INVALID_IYKC_PUBKEY",
    INVALID_CONTENT_KEY_PROOF: "INVALID_IYKC_PROOF",
    INVALID_CONTENT_KEY_PROOF_SIGNATURE: "INVALID_IYKC_PROOF_SIGNATURE"
  }[error] ?? null;
}
function isValidContentKeyProof(value) {
  return contentKeyProofError(value ?? {}) === null;
}
function isValidIykcProof(value) {
  return iykcProofError(value ?? {}) === null;
}

// node_modules/libp2r2p/content-key/services/iykc-proof.js
var QUERY_CACHE_MS2 = 40 * 60 * 1e3;
var IYKC_CACHE_MAX_ITEMS = 1e4;
var HEX_PUBKEY3 = /^[0-9a-f]{64}$/i;
var contentKeysByPubkey = /* @__PURE__ */ Object.create(null);
var iykcCacheTimersByPubkey = /* @__PURE__ */ Object.create(null);
var iykcCacheAddedAtByPubkey = /* @__PURE__ */ Object.create(null);
var getEvents2 = (...args) => relayPool.getEvents(...args);
function hasCachedKey2(cache, key) {
  return Object.prototype.hasOwnProperty.call(cache, key);
}
function maybeUnref3(timer) {
  timer?.unref?.();
  return timer;
}
function uniquePubkeys2(pubkeys, { requireHex = false } = {}) {
  const values = [...new Set(pubkeys || [])].filter(Boolean);
  return requireHex ? values.filter((pubkey) => HEX_PUBKEY3.test(pubkey)) : values;
}
function cloneContentKey(contentKey) {
  return contentKey ? {
    iykcPubkey: contentKey.iykcPubkey,
    iykcProof: contentKey.iykcProof
  } : null;
}
function deleteCachedValue(cache, timers, addedAt, key) {
  clearTimeout(timers[key]);
  delete cache[key];
  delete timers[key];
  delete addedAt[key];
}
function pruneCache(cache, timers, addedAt, maxItems) {
  const keys = Object.keys(cache);
  if (keys.length <= maxItems) return;
  keys.sort((a, b) => (addedAt[a] || 0) - (addedAt[b] || 0)).slice(0, keys.length - maxItems).forEach((key) => deleteCachedValue(cache, timers, addedAt, key));
}
function setCachedValue(cache, timers, addedAt, key, value, cacheMs) {
  cache[key] = value;
  addedAt[key] = Date.now();
  clearTimeout(timers[key]);
  if (cacheMs > 0) {
    timers[key] = maybeUnref3(setTimeout(() => {
      deleteCachedValue(cache, timers, addedAt, key);
    }, cacheMs));
  } else {
    delete timers[key];
  }
}
async function getIykcProofs(pubkeys, {
  _getEvents = getEvents2,
  _getRelaysByPubkey = getRelaysByPubkey,
  cacheMs = QUERY_CACHE_MS2
} = {}) {
  const pubkeyList = uniquePubkeys2(pubkeys, { requireHex: _getEvents === getEvents2 });
  if (!pubkeyList.length) return {};
  const out = {};
  const missingPubkeys = [];
  for (const pubkey of pubkeyList) {
    if (!hasCachedKey2(contentKeysByPubkey, pubkey)) {
      missingPubkeys.push(pubkey);
      continue;
    }
    const cached = cloneContentKey(contentKeysByPubkey[pubkey]);
    if (cached) out[pubkey] = cached;
  }
  if (!missingPubkeys.length) return out;
  const relaysByPubkey2 = await _getRelaysByPubkey(missingPubkeys, { _getEvents, cacheMs });
  const relayToAuthors = pickRelaysForPubkeys(missingPubkeys, relaysByPubkey2);
  const eventGroups = await Promise.all(
    [...relayToAuthors.entries()].map(async ([relay, authors]) => {
      const { result } = await _getEvents({
        kinds: [CONTENT_KEY_KIND],
        authors,
        limit: authors.length
      }, [relay], {
        timeout: 5e3,
        timeoutAfterFirstEose: null
      });
      return result;
    })
  );
  const latestByPubkey = {};
  for (const event of eventGroups.flat()) {
    const parsed = parseContentKeyEvent(event);
    if (!parsed) continue;
    if (!latestByPubkey[event.pubkey] || event.created_at > latestByPubkey[event.pubkey].created_at) {
      latestByPubkey[event.pubkey] = { created_at: event.created_at, ...parsed };
    }
  }
  for (const pubkey of missingPubkeys) {
    const entry = latestByPubkey[pubkey];
    const proof = entry ? { iykcPubkey: entry.iykcPubkey, iykcProof: entry.iykcProof } : null;
    setCachedValue(contentKeysByPubkey, iykcCacheTimersByPubkey, iykcCacheAddedAtByPubkey, pubkey, cloneContentKey(proof), cacheMs);
    if (proof) out[pubkey] = proof;
  }
  pruneCache(contentKeysByPubkey, iykcCacheTimersByPubkey, iykcCacheAddedAtByPubkey, IYKC_CACHE_MAX_ITEMS);
  return out;
}

// node_modules/libp2r2p/private-channel/constants/index.js
var PRIVATE_BROADCAST_KIND = 3560;
var ROUTER_KIND = 26300;
var NYM_CARRIER_KIND = 26400;
var MAX_EVENT_BYTES = 65536;
var EXPIRATION_SECONDS = 2 * 24 * 60 * 60;

// node_modules/libp2r2p/private-channel/helpers/event.js
var encoder3 = new TextEncoder();
function nowSeconds2() {
  return Math.floor(Date.now() / 1e3);
}
function eventByteLength(event) {
  return encoder3.encode(JSON.stringify(event)).length;
}
function readReceiverTag(event) {
  return event.tags?.find((t) => t[0] === "r")?.[1] || "";
}
function readSenderTag(event) {
  const senderPubkey = event.tags?.find((t) => t[0] === "f")?.[1];
  if (!senderPubkey) throw new ValidationError("MISSING_SENDER_TAG");
  return senderPubkey;
}
function readImkcTag(event) {
  return event.tags?.find((t) => t[0] === "imkc")?.[1] || "";
}
function hasImkcTag(event) {
  return event.tags?.some((t) => t[0] === "imkc") || false;
}
function readImkcProof(event) {
  return event.tags?.find((t) => t[0] === "imkc")?.[2] || "";
}
function readIdTag(event) {
  return event.tags?.find((t) => t[0] === "id")?.[1] || "";
}
function readChunkTag(event) {
  const tag = event.tags?.find((t) => t[0] === "c");
  const index = Number(tag?.[1]);
  const total = Number(tag?.[2]);
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1) {
    throw new ValidationError("INVALID_CHUNK_TAG");
  }
  return { index, total };
}
function makeRouterEvent({ pubkey, senderPubkey, imkcPubkey, imkcProof, receiverPubkey, chunkIndex, chunkTotal, content }) {
  const tags = [["f", senderPubkey]];
  if (imkcPubkey) {
    if (!imkcProof) throw new ValidationError("INVALID_IMKC_PROOF");
    tags.push(["imkc", imkcPubkey, imkcProof]);
  }
  tags.push(["c", String(chunkIndex), String(chunkTotal)]);
  if (receiverPubkey) tags.push(["r", receiverPubkey]);
  return { kind: ROUTER_KIND, pubkey, created_at: nowSeconds2(), tags, content };
}
function makeNymCarrierEvent({ innerId, chunkIndex, chunkTotal, content, createdAt = nowSeconds2() }) {
  if (!innerId) throw new ValidationError("INNER_EVENT_ID_REQUIRED");
  return {
    kind: NYM_CARRIER_KIND,
    created_at: createdAt,
    tags: [["id", innerId], ["c", String(chunkIndex), String(chunkTotal)]],
    content
  };
}

// node_modules/libp2r2p/private-channel/helpers/chunk-size.js
var MAX_TIME_SECONDS = 9999999999;
var MAX_CHUNK_TAG_VALUE = "9999999999";
var SAMPLE_PUBKEY = "f".repeat(64);
var SAMPLE_SIGNATURE = "f".repeat(128);
function base64EncodedByteLength2(byteLength3) {
  return Math.ceil(byteLength3 / 3) * 4;
}
function routerPlaintextByteLengthForChunk(jsonlByteLength) {
  return eventByteLength({
    kind: ROUTER_KIND,
    pubkey: SAMPLE_PUBKEY,
    created_at: MAX_TIME_SECONDS,
    tags: [["f", SAMPLE_PUBKEY], ["imkc", SAMPLE_PUBKEY, `${MAX_TIME_SECONDS}:${SAMPLE_SIGNATURE}`], ["c", MAX_CHUNK_TAG_VALUE, MAX_CHUNK_TAG_VALUE], ["r", SAMPLE_PUBKEY]],
    content: "A".repeat(base64EncodedByteLength2(jsonlByteLength)),
    id: SAMPLE_PUBKEY,
    sig: SAMPLE_SIGNATURE
  });
}
function outerEventByteLengthForChunk(jsonlByteLength) {
  const contentByteLength = payloadByteLength(routerPlaintextByteLengthForChunk(jsonlByteLength), 0);
  if (!Number.isFinite(contentByteLength)) return Infinity;
  return eventByteLength({
    kind: PRIVATE_BROADCAST_KIND,
    created_at: MAX_TIME_SECONDS,
    // Reserve the deletion capability tag used by high-level private sends.
    tags: [["s", SAMPLE_PUBKEY], ["expiration", String(MAX_TIME_SECONDS)]],
    content: "A".repeat(contentByteLength),
    pubkey: SAMPLE_PUBKEY,
    id: SAMPLE_PUBKEY,
    sig: SAMPLE_SIGNATURE
  });
}
function maxJsonlChunkByteSize() {
  let min = 1;
  let max = MAX_EVENT_BYTES;
  while (min < max) {
    const mid = Math.ceil((min + max) / 2);
    if (outerEventByteLengthForChunk(mid) <= MAX_EVENT_BYTES) min = mid;
    else max = mid - 1;
  }
  return min;
}
var JSONL_CHUNK_BYTES = maxJsonlChunkByteSize();
var NYM_CARRIER_CHUNK_CHARS = JSONL_CHUNK_BYTES;

// node_modules/libp2r2p/temporary-storage/index.js
var TEMPORARY_STORAGE_KEYS_KEY = "libp2r2p:temporary-storage:keys";
function normalizeKeys(keys) {
  if (!Array.isArray(keys)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const key of keys) {
    if (typeof key !== "string" || !key || key === TEMPORARY_STORAGE_KEYS_KEY || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
function createTemporaryStorage({ storageArea = globalThis.sessionStorage } = {}) {
  function storage() {
    return storageArea;
  }
  function readTrackedKeys() {
    try {
      return normalizeKeys(JSON.parse(storage().getItem(TEMPORARY_STORAGE_KEYS_KEY) || "[]"));
    } catch {
      return [];
    }
  }
  function writeTrackedKeys(keys) {
    const normalized = normalizeKeys(keys);
    if (normalized.length) storage().setItem(TEMPORARY_STORAGE_KEYS_KEY, JSON.stringify(normalized));
    else storage().removeItem(TEMPORARY_STORAGE_KEYS_KEY);
  }
  function trackTemporaryKey(key) {
    const tracked = readTrackedKeys();
    if (tracked.includes(key)) return;
    writeTrackedKeys(tracked.concat(key));
  }
  function untrackTemporaryKeys(keys) {
    const remove2 = new Set(normalizeKeys(keys));
    if (!remove2.size) return;
    writeTrackedKeys(readTrackedKeys().filter((key) => !remove2.has(key)));
  }
  function cleanup() {
    for (const key of readTrackedKeys()) storage().removeItem(key);
    storage().removeItem(TEMPORARY_STORAGE_KEYS_KEY);
  }
  function getItem(key) {
    return storage().getItem(key);
  }
  function setItem(key, value) {
    if (typeof key !== "string" || !key || key === TEMPORARY_STORAGE_KEYS_KEY) throw new ValidationError("INVALID_TEMPORARY_STORAGE_KEY");
    trackTemporaryKey(key);
    storage().setItem(key, value);
  }
  function removeItems(keys) {
    const normalized = normalizeKeys(keys);
    for (const key of normalized) storage().removeItem(key);
    untrackTemporaryKeys(normalized);
  }
  return { cleanup, getItem, setItem, removeItems };
}
function cleanupTemporaryStorage({ storageArea = globalThis.sessionStorage } = {}) {
  createTemporaryStorage({ storageArea }).cleanup();
}

// node_modules/libp2r2p/private-channel/helpers/chunks.js
var encoder4 = new TextEncoder();
var decoder3 = new TextDecoder();
var STORAGE_PREFIX = "libp2r2p:private-channel:";
function appendBytes(left, right) {
  const out = new Uint8Array(left.length + right.length);
  out.set(left);
  out.set(right, left.length);
  return out;
}
function tempKey(id, index) {
  return `${STORAGE_PREFIX}${id}:${index}`;
}
function rowTempKey(id, index) {
  return `${STORAGE_PREFIX}${id}:row:${index}`;
}
function normalizeContentKey({ receiverPubkey, iykcPubkey = "", iykcProof = "" } = {}) {
  if (!iykcPubkey) return { iykcPubkey: "", iykcProof: "" };
  if (!isValidIykcProof({ receiverPubkey, iykcPubkey, iykcProof })) throw new ValidationError("INVALID_IYKC_PROOF");
  return { iykcPubkey, iykcProof };
}
function receiverRecord(receiver, receiverContentKeys) {
  if (typeof receiver === "string") {
    const fetchedContentKey2 = normalizeContentKey({ receiverPubkey: receiver, ...receiverContentKeys[receiver] });
    return {
      receiverPubkey: receiver,
      ...fetchedContentKey2
    };
  }
  if (Array.isArray(receiver)) {
    const [receiverPubkey2, iykcPubkey = "", iykcProof = ""] = receiver;
    const explicitContentKey2 = normalizeContentKey({ receiverPubkey: receiverPubkey2, iykcPubkey, iykcProof });
    const fetchedContentKey2 = normalizeContentKey({ receiverPubkey: receiverPubkey2, ...receiverContentKeys[receiverPubkey2] });
    const contentKey = explicitContentKey2.iykcPubkey ? explicitContentKey2 : fetchedContentKey2;
    return {
      receiverPubkey: receiverPubkey2,
      ...contentKey
    };
  }
  const receiverPubkey = receiver?.receiverPubkey || receiver?.pubkey || "";
  const explicitContentKey = normalizeContentKey({ receiverPubkey, ...receiver });
  const fetchedContentKey = normalizeContentKey({ receiverPubkey, ...receiverContentKeys[receiverPubkey] });
  const resolvedContentKey = explicitContentKey.iykcPubkey ? explicitContentKey : fetchedContentKey;
  return {
    receiverPubkey,
    ...resolvedContentKey
  };
}
function buildRecipientRow({ receiverPubkey, iykcPubkey, iykcProof }, ciphertext) {
  const line = [receiverPubkey, ciphertext];
  if (iykcPubkey) line.push(iykcPubkey, iykcProof);
  return JSON.stringify(line);
}
function buildPayloadRow(ciphertext) {
  return JSON.stringify([ciphertext]);
}
function encryptedPayload({ messageSecretKey, event }) {
  const messagePubkey = getPublicKey(messageSecretKey);
  return encrypt4(messageSecretKey, messagePubkey, ROUTER_KIND, "", JSON.stringify(event));
}
function appendLine(chunk, line, id, chunkIndex, temporaryStorage) {
  while (line.length) {
    const available = JSONL_CHUNK_BYTES - chunk.length;
    chunk = appendBytes(chunk, line.slice(0, available));
    line = line.slice(available);
    if (chunk.length === JSONL_CHUNK_BYTES) {
      temporaryStorage.setItem(tempKey(id, chunkIndex++), bytesToBase64(chunk));
      chunk = new Uint8Array();
    }
  }
  return { chunk, chunkIndex };
}
function appendRow(chunk, row, id, chunkIndex, temporaryStorage) {
  return appendLine(chunk, encoder4.encode(`${row}
`), id, chunkIndex, temporaryStorage);
}
function storageFor(temporaryStorage) {
  return temporaryStorage || createTemporaryStorage();
}
function readChunkContent(id, index, temporaryStorage) {
  return storageFor(temporaryStorage).getItem(tempKey(id, index));
}
function decodeChunkLines(content) {
  return decodeChunkText(content).split("\n").filter(Boolean);
}
function decodeChunkText(content) {
  return decoder3.decode(base64ToBytes(content));
}
function receiverPubkeys(receivers) {
  return receivers.map((receiver) => receiverRecord(receiver, {}).receiverPubkey).filter(Boolean);
}
function receiverPubkeysWithoutContentKeys(receivers) {
  return receivers.map((receiver) => receiverRecord(receiver, {})).filter((receiver) => receiver.receiverPubkey && !receiver.iykcPubkey).map((receiver) => receiver.receiverPubkey);
}
function temporaryId() {
  return `${Date.now()}:${Math.random().toString(16).slice(2)}`;
}
function cleanupPreparedRows(id, totalRows, temporaryStorage) {
  const keys = [];
  for (let i = 0; i < totalRows; i++) keys.push(rowTempKey(id, i));
  storageFor(temporaryStorage).removeItems(keys);
}
function setPreparedRow(id, index, row, temporaryStorage) {
  storageFor(temporaryStorage).setItem(rowTempKey(id, index), row);
}
function readPreparedRow(preparedRows, index) {
  const row = storageFor(preparedRows.temporaryStorage).getItem(rowTempKey(preparedRows.id, index));
  if (typeof row !== "string") throw new ValidationError("MISSING_PREPARED_ROW");
  return row;
}
async function prepareEnvelopeRowsOnce({ id, senderSigner, receivers, receiverContentKeys = {}, event, rowScope = "", temporaryStorage }) {
  const useDoubleDh = typeof senderSigner?.nip44EncryptDoubleDH === "function";
  let foundOwnContentPubkey = false;
  let usedOwnContentPubkey = "";
  const messageSecretKey = generateSecretKey();
  const messageSeckey = bytesToHex3(messageSecretKey);
  const rowIndexes = [];
  const receiverPubkeys2 = [];
  const receiverRowIndexesByPubkey = {};
  setPreparedRow(id, 0, buildPayloadRow(encryptedPayload({ messageSecretKey, event })), temporaryStorage);
  for (const receiver of receivers) {
    const row = receiverRecord(receiver, useDoubleDh ? receiverContentKeys : {});
    let ciphertext;
    if (useDoubleDh) {
      const encrypted = await senderSigner.nip44EncryptDoubleDH(
        row.receiverPubkey,
        ROUTER_KIND,
        rowScope,
        bytesToBase64(encoder4.encode(messageSeckey)),
        row.iykcPubkey
      );
      ciphertext = encrypted[0];
      const nextContentPubkey = encrypted[1] || "";
      if (foundOwnContentPubkey && nextContentPubkey !== usedOwnContentPubkey) {
        throw new ValidationError("INCONSISTENT_IMKC_PUBKEY");
      }
      foundOwnContentPubkey = true;
      if (nextContentPubkey) usedOwnContentPubkey = nextContentPubkey;
    } else {
      ciphertext = await senderSigner.nip44v3Encrypt(row.receiverPubkey, ROUTER_KIND, rowScope, bytesToBase64(encoder4.encode(messageSeckey)));
    }
    const rowIndex = rowIndexes.length + 1;
    setPreparedRow(id, rowIndex, buildRecipientRow(row, ciphertext), temporaryStorage);
    rowIndexes.push(rowIndex);
    receiverPubkeys2.push(row.receiverPubkey);
    if (row.receiverPubkey && receiverRowIndexesByPubkey[row.receiverPubkey] === void 0) {
      receiverRowIndexesByPubkey[row.receiverPubkey] = rowIndex;
    }
  }
  return {
    id,
    totalRows: rowIndexes.length + 1,
    rowIndexes,
    receiverPubkeys: receiverPubkeys2,
    receiverRowIndexesByPubkey,
    ownContentPubkey: usedOwnContentPubkey,
    temporaryStorage
  };
}
async function prepareEnvelopeRows({ temporaryStorageArea, ...options } = {}) {
  const temporaryStorage = createTemporaryStorage({ storageArea: temporaryStorageArea });
  const maxRows = (options.receivers?.length || 0) + 1;
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = temporaryId();
    try {
      return await prepareEnvelopeRowsOnce({ ...options, id, temporaryStorage });
    } catch (err) {
      cleanupPreparedRows(id, maxRows, temporaryStorage);
      if (err?.message === "INCONSISTENT_IMKC_PUBKEY" && attempt === 0) continue;
      throw err;
    }
  }
}
function cleanupEnvelopeRows(preparedRows) {
  if (!preparedRows?.id || !Number.isSafeInteger(preparedRows.totalRows)) return;
  cleanupPreparedRows(preparedRows.id, preparedRows.totalRows, preparedRows.temporaryStorage);
}
function preparedRowIndexesForReceivers(preparedRows, receivers) {
  const indexes = [];
  const seen = /* @__PURE__ */ new Set();
  for (const receiver of receivers || []) {
    const pubkey = receiverRecord(receiver, {}).receiverPubkey;
    const index = preparedRows?.receiverRowIndexesByPubkey?.[pubkey];
    if (!pubkey || index === void 0) throw new ValidationError("MISSING_PREPARED_RECEIVER");
    if (seen.has(index)) continue;
    seen.add(index);
    indexes.push(index);
  }
  return indexes;
}
function writeChunksFromPreparedRows(preparedRows, rowIndexes = preparedRows?.rowIndexes || []) {
  const temporaryStorage = storageFor(preparedRows?.temporaryStorage);
  const id = temporaryId();
  let chunk = new Uint8Array();
  let chunkIndex = 0;
  try {
    ;
    ({ chunk, chunkIndex } = appendRow(chunk, readPreparedRow(preparedRows, 0), id, chunkIndex, temporaryStorage));
    for (const rowIndex of rowIndexes) {
      ;
      ({ chunk, chunkIndex } = appendRow(chunk, readPreparedRow(preparedRows, rowIndex), id, chunkIndex, temporaryStorage));
    }
    if (chunk.length || chunkIndex === 0) temporaryStorage.setItem(tempKey(id, chunkIndex++), bytesToBase64(chunk));
    return { id, total: chunkIndex, ownContentPubkey: preparedRows.ownContentPubkey || "" };
  } catch (err) {
    cleanupChunks(id, chunkIndex + 1, temporaryStorage);
    throw err;
  }
}
function cleanupChunks(id, total, temporaryStorage) {
  const keys = [];
  for (let i = 0; i < total; i++) keys.push(tempKey(id, i));
  storageFor(temporaryStorage).removeItems(keys);
}

// node_modules/libp2r2p/private-channel/services/received-chunks.js
var DEFAULT_RECEIVED_CHUNK_TTL_MS = 60 * 60 * 1e3;
var DEFAULT_RECEIVED_CHUNK_MAX_BYTES = 16 * 1024 * 1024;
var DEFAULT_PREFIX = "libp2r2p:private-channel:received";
var DATABASE_VERSION2 = 2;
var GROUPS_STORE = "groups";
var CHUNKS_STORE = "chunks";
var STATE_STORE2 = "state";
var USAGE_KEY = "usage";
var DRAIN_LEASE_MS = 3e4;
var decoder4 = new TextDecoder();
function deferred3() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
function transactionDone2(tx) {
  const p = deferred3();
  tx.oncomplete = () => p.resolve();
  tx.onabort = () => p.reject(tx.error || new Error("IDB_TRANSACTION_ABORTED"));
  tx.onerror = () => p.reject(tx.error || new Error("IDB_TRANSACTION_FAILED"));
  return p.promise;
}
function openDatabase2(indexedDB, name) {
  if (!indexedDB?.open) return Promise.reject(new Error("IDB_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION2);
    request.onerror = () => reject(request.error || new Error("IDB_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("IDB_DATABASE_BLOCKED"));
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      let groups;
      if (!db.objectStoreNames.contains(GROUPS_STORE)) {
        groups = db.createObjectStore(GROUPS_STORE, { keyPath: "groupKey" });
      } else {
        groups = tx.objectStore(GROUPS_STORE);
      }
      if (!groups.indexNames.contains("byUpdatedAt")) groups.createIndex("byUpdatedAt", "updatedAt");
      if (!groups.indexNames.contains("byExpiresAt")) groups.createIndex("byExpiresAt", "expiresAt");
      let chunks;
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        chunks = db.createObjectStore(CHUNKS_STORE, { keyPath: ["groupKey", "index"] });
      } else {
        chunks = tx.objectStore(CHUNKS_STORE);
      }
      if (!chunks.indexNames.contains("byGroup")) chunks.createIndex("byGroup", "groupKey");
      if (!db.objectStoreNames.contains(STATE_STORE2)) db.createObjectStore(STATE_STORE2, { keyPath: "key" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
function normalizeBytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new ValidationError("RECEIVED_CHUNK_BYTES_REQUIRED");
}
function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function normalizeReceived(received) {
  if (!received || typeof received !== "object" || Array.isArray(received)) return {};
  return Object.fromEntries(
    Object.entries(received).filter(([index, hasChunk]) => hasChunk && Number.isSafeInteger(Number(index)) && Number(index) >= 0).map(([index]) => [String(Number(index)), true])
  );
}
function normalizeMeta(meta, fallbackTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS) {
  if (!meta || typeof meta !== "object") return null;
  const total = Number(meta.total);
  const nextIndex = Number(meta.nextIndex);
  const rowIndex = Number(meta.rowIndex);
  if (!meta.groupKey || !Number.isSafeInteger(total) || total < 1) return null;
  const updatedAt = Number(meta.updatedAt) || Date.now();
  const ttlMs = Number.isFinite(meta.ttlMs) && meta.ttlMs >= 0 ? meta.ttlMs : fallbackTtlMs;
  return {
    groupKey: String(meta.groupKey),
    channelPubkey: String(meta.channelPubkey || ""),
    routerPubkey: String(meta.routerPubkey || ""),
    total,
    received: normalizeReceived(meta.received),
    receivedCount: Math.max(0, Number(meta.receivedCount) || 0),
    nextIndex: Number.isSafeInteger(nextIndex) && nextIndex >= 0 ? nextIndex : 0,
    rowIndex: Number.isSafeInteger(rowIndex) && rowIndex >= 0 ? rowIndex : 0,
    carry: typeof meta.carry === "string" ? meta.carry : "",
    payloadCiphertext: typeof meta.payloadCiphertext === "string" ? meta.payloadCiphertext : "",
    receiverPubkeys: uniq(meta.receiverPubkeys),
    byteSize: Math.max(0, Number(meta.byteSize) || 0),
    createdAt: Number(meta.createdAt) || Date.now(),
    updatedAt,
    ttlMs,
    expiresAt: Number(meta.expiresAt) || updatedAt + ttlMs,
    drainToken: typeof meta.drainToken === "string" ? meta.drainToken : "",
    drainUntil: Math.max(0, Number(meta.drainUntil) || 0)
  };
}
function normalizeUsage(value) {
  return {
    key: USAGE_KEY,
    usedBytes: Number.isSafeInteger(value?.usedBytes) && value.usedBytes >= 0 ? value.usedBytes : 0
  };
}
function isQuotaExceeded(err) {
  return err?.name === "QuotaExceededError" || err?.name === "NS_ERROR_DOM_QUOTA_REACHED" || err?.code === 22 || err?.code === 1014 || /quota/i.test(err?.message || "");
}
function randomToken() {
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (bytes) return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${Date.now().toString(16)}:${Math.random().toString(16).slice(2)}`;
}
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function createReceivedChunkStore({
  prefix = DEFAULT_PREFIX,
  indexedDB = globalThis.indexedDB,
  ttlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS,
  maxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES
} = {}) {
  const configuredTtlMs = Number.isFinite(ttlMs) && ttlMs >= 0 ? ttlMs : DEFAULT_RECEIVED_CHUNK_TTL_MS;
  const configuredMaxBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : Infinity;
  let dbPromise2;
  let readyPromise2;
  let closed = false;
  function database2() {
    if (closed) return Promise.reject(new Error("RECEIVED_CHUNK_STORE_CLOSED"));
    dbPromise2 ||= openDatabase2(indexedDB, `${prefix}:idb`);
    return dbPromise2.then((db) => {
      if (closed) {
        db.close();
        throw new Error("RECEIVED_CHUNK_STORE_CLOSED");
      }
      return db;
    });
  }
  async function transaction3(storeNames, mode, work) {
    const db = await database2();
    const tx = db.transaction(storeNames, mode);
    const done = transactionDone2(tx);
    try {
      const result = await work(tx);
      await done;
      return result;
    } catch (err) {
      try {
        tx.abort();
      } catch {
      }
      try {
        await done;
      } catch {
      }
      throw err;
    }
  }
  function groupKeyFor(channelPubkey, routerPubkey) {
    return `${channelPubkey}:${routerPubkey}`;
  }
  async function readUsage(tx) {
    return normalizeUsage((await run("get", [USAGE_KEY], STATE_STORE2, null, { tx })).result);
  }
  async function writeUsage(tx, usage) {
    await run("put", [normalizeUsage(usage)], STATE_STORE2, null, { tx });
  }
  async function deleteGroupInTransaction(tx, groupKey, usage, knownMeta) {
    const meta = knownMeta || normalizeMeta((await run("get", [groupKey], GROUPS_STORE, null, { tx })).result, configuredTtlMs);
    const keys = (await run("getAllKeys", [globalThis.IDBKeyRange?.only?.(groupKey) ?? groupKey], CHUNKS_STORE, "byGroup", { tx })).result;
    for (const key of keys) await run("delete", [key], CHUNKS_STORE, null, { tx });
    await run("delete", [groupKey], GROUPS_STORE, null, { tx });
    if (usage && meta) usage.usedBytes = Math.max(0, usage.usedBytes - meta.byteSize);
    return Boolean(meta || keys.length);
  }
  async function oldestGroupsInTransaction(tx, except = "") {
    const values = (await run("getAll", [], GROUPS_STORE, null, { tx })).result;
    return values.map((value) => normalizeMeta(value, configuredTtlMs)).filter((meta) => meta && meta.groupKey !== except).sort((left, right) => left.updatedAt - right.updatedAt || left.groupKey.localeCompare(right.groupKey));
  }
  async function cleanupStaleRaw(nowMs = Date.now()) {
    return transaction3([GROUPS_STORE, CHUNKS_STORE, STATE_STORE2], "readwrite", async (tx) => {
      const usage = await readUsage(tx);
      const groups = await oldestGroupsInTransaction(tx);
      let removed = 0;
      for (const meta of groups) {
        if (meta.expiresAt > nowMs && (!Number.isFinite(configuredMaxBytes) || usage.usedBytes <= configuredMaxBytes)) continue;
        await deleteGroupInTransaction(tx, meta.groupKey, usage, meta);
        removed++;
      }
      await writeUsage(tx, usage);
      return removed;
    });
  }
  function ready(nowMs = Date.now()) {
    readyPromise2 ||= cleanupStaleRaw(nowMs);
    return readyPromise2;
  }
  async function cleanupStale(nowMs = Date.now()) {
    await ready(nowMs);
    return cleanupStaleRaw(nowMs);
  }
  async function putOnce({ channelPubkey, routerPubkey, index, total, contentBytes, ttlMs: ttlMs2 }) {
    const groupKey = groupKeyFor(channelPubkey, routerPubkey);
    const bytes = normalizeBytes(contentBytes);
    const now = Date.now();
    const groupTtlMs = Number.isFinite(ttlMs2) && ttlMs2 >= 0 ? ttlMs2 : configuredTtlMs;
    return transaction3([GROUPS_STORE, CHUNKS_STORE, STATE_STORE2], "readwrite", async (tx) => {
      const usage = await readUsage(tx);
      let meta = normalizeMeta((await run("get", [groupKey], GROUPS_STORE, null, { tx })).result, configuredTtlMs);
      if (meta && meta.expiresAt <= now) {
        await deleteGroupInTransaction(tx, groupKey, usage, meta);
        meta = null;
      }
      if (meta && meta.total !== total) {
        await deleteGroupInTransaction(tx, groupKey, usage, meta);
        meta = null;
      }
      if (!meta) {
        meta = normalizeMeta({
          groupKey,
          channelPubkey,
          routerPubkey,
          total,
          received: {},
          receivedCount: 0,
          nextIndex: 0,
          rowIndex: 0,
          carry: "",
          payloadCiphertext: "",
          receiverPubkeys: [],
          byteSize: 0,
          createdAt: now,
          updatedAt: now,
          ttlMs: groupTtlMs,
          expiresAt: now + groupTtlMs
        }, configuredTtlMs);
      }
      const existing = (await run("get", [[groupKey, index]], CHUNKS_STORE, null, { tx })).result;
      if (!existing) {
        if (bytes.byteLength > configuredMaxBytes || meta.byteSize + bytes.byteLength > configuredMaxBytes) {
          await deleteGroupInTransaction(tx, groupKey, usage, meta);
          await writeUsage(tx, usage);
          return { tooLarge: true, meta: null };
        }
        const requiredBytes = bytes.byteLength;
        const candidates = await oldestGroupsInTransaction(tx, groupKey);
        for (const candidate of candidates) {
          if (candidate.expiresAt > now) continue;
          await deleteGroupInTransaction(tx, candidate.groupKey, usage, candidate);
        }
        for (const candidate of candidates) {
          if (candidate.expiresAt <= now) continue;
          if (!Number.isFinite(configuredMaxBytes) || usage.usedBytes + requiredBytes <= configuredMaxBytes) break;
          await deleteGroupInTransaction(tx, candidate.groupKey, usage, candidate);
        }
        if (Number.isFinite(configuredMaxBytes) && usage.usedBytes + requiredBytes > configuredMaxBytes) {
          await deleteGroupInTransaction(tx, groupKey, usage, meta);
          await writeUsage(tx, usage);
          return { tooLarge: true, meta: null };
        }
        await run("put", [{ groupKey, index, bytes }], CHUNKS_STORE, null, { tx });
        meta.received[String(index)] = true;
        meta.receivedCount++;
        meta.byteSize += requiredBytes;
        usage.usedBytes += requiredBytes;
      }
      meta.total = total;
      meta.updatedAt = now;
      meta.expiresAt = now + meta.ttlMs;
      await run("put", [meta], GROUPS_STORE, null, { tx });
      await writeUsage(tx, usage);
      return { tooLarge: false, meta };
    });
  }
  async function evictOldestGroup(except = "") {
    return transaction3([GROUPS_STORE, CHUNKS_STORE, STATE_STORE2], "readwrite", async (tx) => {
      const usage = await readUsage(tx);
      const oldest = (await oldestGroupsInTransaction(tx, except))[0];
      if (!oldest) return false;
      await deleteGroupInTransaction(tx, oldest.groupKey, usage, oldest);
      await writeUsage(tx, usage);
      return true;
    });
  }
  async function put({ channelPubkey, routerPubkey, index, total, contentBytes, ttlMs: ttlMs2 }) {
    if (!channelPubkey || !routerPubkey) throw new ValidationError("RECEIVED_CHUNK_GROUP_REQUIRED");
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(total) || index < 0 || total < 1 || index >= total) {
      throw new ValidationError("INVALID_RECEIVED_CHUNK_INDEX");
    }
    const bytes = normalizeBytes(contentBytes);
    await ready();
    while (true) {
      try {
        const result = await putOnce({ channelPubkey, routerPubkey, index, total, contentBytes: bytes, ttlMs: ttlMs2 });
        if (result.tooLarge) throw new Error("RECEIVED_CHUNK_GROUP_TOO_LARGE");
        return result.meta;
      } catch (err) {
        if (!isQuotaExceeded(err) || !await evictOldestGroup(groupKeyFor(channelPubkey, routerPubkey))) throw err;
      }
    }
  }
  async function readMeta(groupKey) {
    await ready();
    return transaction3([GROUPS_STORE], "readonly", async (tx) => {
      return normalizeMeta((await run("get", [groupKey], GROUPS_STORE, null, { tx })).result, configuredTtlMs);
    });
  }
  async function status(metaOrGroupKey) {
    const meta = typeof metaOrGroupKey === "string" ? await readMeta(metaOrGroupKey) : normalizeMeta(metaOrGroupKey, configuredTtlMs);
    if (!meta) return { received: 0, missing: [] };
    const missing = [];
    let received = 0;
    for (let index = 0; index < meta.total; index++) {
      if (index < meta.nextIndex || meta.received[String(index)]) received++;
      else missing.push(index);
    }
    return { received, missing };
  }
  function rememberReceiverPubkey(meta, pubkey) {
    if (pubkey && !meta.receiverPubkeys.includes(pubkey)) meta.receiverPubkeys.push(pubkey);
  }
  function rememberPayloadCiphertext(meta, ciphertext) {
    if (!meta.payloadCiphertext) meta.payloadCiphertext = ciphertext;
  }
  async function claimDrain(groupKey, token) {
    while (true) {
      const now = Date.now();
      const result = await transaction3([GROUPS_STORE], "readwrite", async (tx) => {
        const meta = normalizeMeta((await run("get", [groupKey], GROUPS_STORE, null, { tx })).result, configuredTtlMs);
        if (!meta) return { meta: null, waitMs: 0 };
        if (meta.drainToken && meta.drainToken !== token && meta.drainUntil > now) {
          return { meta: null, waitMs: Math.min(DRAIN_LEASE_MS, meta.drainUntil - now) };
        }
        meta.drainToken = token;
        meta.drainUntil = now + DRAIN_LEASE_MS;
        meta.updatedAt = now;
        meta.expiresAt = now + meta.ttlMs;
        await run("put", [meta], GROUPS_STORE, null, { tx });
        return { meta, waitMs: 0 };
      });
      if (!result.waitMs) return result.meta;
      await wait(result.waitMs);
    }
  }
  async function readDrainChunk(groupKey, token) {
    return transaction3([GROUPS_STORE, CHUNKS_STORE], "readonly", async (tx) => {
      const meta = normalizeMeta((await run("get", [groupKey], GROUPS_STORE, null, { tx })).result, configuredTtlMs);
      if (!meta || meta.drainToken !== token) return { meta: null, bytes: null };
      if (meta.nextIndex >= meta.total) return { meta, bytes: null };
      const chunk = (await run("get", [[groupKey, meta.nextIndex]], CHUNKS_STORE, null, { tx })).result;
      return { meta, bytes: chunk ? normalizeBytes(chunk.bytes) : null };
    });
  }
  async function commitDrainMeta(nextMeta, token) {
    return transaction3([GROUPS_STORE], "readwrite", async (tx) => {
      const current = normalizeMeta((await run("get", [nextMeta.groupKey], GROUPS_STORE, null, { tx })).result, configuredTtlMs);
      if (!current || current.drainToken !== token) return null;
      current.nextIndex = nextMeta.nextIndex;
      current.rowIndex = nextMeta.rowIndex;
      current.carry = nextMeta.carry;
      current.payloadCiphertext = nextMeta.payloadCiphertext;
      current.receiverPubkeys = uniq(nextMeta.receiverPubkeys);
      current.updatedAt = nextMeta.updatedAt;
      current.expiresAt = current.updatedAt + current.ttlMs;
      current.drainUntil = Date.now() + DRAIN_LEASE_MS;
      await run("put", [current], GROUPS_STORE, null, { tx });
      return current;
    });
  }
  async function releaseDrain(groupKey, token) {
    return transaction3([GROUPS_STORE], "readwrite", async (tx) => {
      const meta = normalizeMeta((await run("get", [groupKey], GROUPS_STORE, null, { tx })).result, configuredTtlMs);
      if (!meta || meta.drainToken !== token) return false;
      meta.drainToken = "";
      meta.drainUntil = 0;
      await run("put", [meta], GROUPS_STORE, null, { tx });
      return true;
    });
  }
  async function drainAvailable(groupKey, { onLine } = {}) {
    await ready();
    const token = randomToken();
    let meta = await claimDrain(groupKey, token);
    if (!meta) return { complete: false, stopped: false, meta: null };
    try {
      while (meta.nextIndex < meta.total) {
        const snapshot = await readDrainChunk(groupKey, token);
        meta = snapshot.meta;
        if (!meta || !snapshot.bytes) break;
        const text = `${meta.carry}${decoder4.decode(snapshot.bytes)}`;
        let start = 0;
        let end = text.indexOf("\n", start);
        while (end !== -1) {
          const line = text.slice(start, end);
          start = end + 1;
          if (line) {
            const result = await onLine?.(line, meta.rowIndex, meta, { rememberPayloadCiphertext, rememberReceiverPubkey });
            meta.rowIndex++;
            if (result?.stop) {
              meta.updatedAt = Date.now();
              meta = await commitDrainMeta(meta, token);
              return { complete: false, stopped: true, meta };
            }
          }
          end = text.indexOf("\n", start);
        }
        meta.carry = text.slice(start);
        meta.nextIndex++;
        meta.updatedAt = Date.now();
        meta = await commitDrainMeta(meta, token);
        if (!meta) break;
      }
      if (meta && meta.nextIndex >= meta.total) {
        if (meta.carry) {
          const result = await onLine?.(meta.carry, meta.rowIndex, meta, { rememberPayloadCiphertext, rememberReceiverPubkey });
          meta.rowIndex++;
          meta.carry = "";
          if (result?.stop) {
            meta.updatedAt = Date.now();
            meta = await commitDrainMeta(meta, token);
            return { complete: false, stopped: true, meta };
          }
        }
        meta.updatedAt = Date.now();
        meta = await commitDrainMeta(meta, token);
        return { complete: Boolean(meta), stopped: false, meta };
      }
      return { complete: false, stopped: false, meta };
    } finally {
      await releaseDrain(groupKey, token).catch(() => {
      });
    }
  }
  async function readChunkBytes(groupKey) {
    await ready();
    return transaction3([GROUPS_STORE, CHUNKS_STORE], "readonly", async (tx) => {
      const meta = normalizeMeta((await run("get", [groupKey], GROUPS_STORE, null, { tx })).result, configuredTtlMs);
      if (!meta) return { meta: null, chunks: [] };
      const chunks = [];
      for (let index = 0; index < meta.total; index++) {
        const chunk = (await run("get", [[groupKey, index]], CHUNKS_STORE, null, { tx })).result;
        if (!chunk) throw new Error("RECEIVED_CHUNK_MISSING");
        chunks.push(normalizeBytes(chunk.bytes));
      }
      return { meta, chunks };
    });
  }
  async function readChunkContents(groupKey) {
    return (await readChunkBytes(groupKey)).chunks.map((bytes) => decoder4.decode(bytes));
  }
  async function readEnvelopeBundleContent(groupKey) {
    const { chunks } = await readChunkBytes(groupKey);
    return bytesToBase64(joinChunks(chunks));
  }
  function joinChunks(chunks) {
    let length = 0;
    for (const chunk of chunks) length += chunk.byteLength;
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return joined;
  }
  async function readEnvelopeBundleText(groupKey) {
    return decoder4.decode(joinChunks((await readChunkBytes(groupKey)).chunks));
  }
  async function removeGroup(groupKey) {
    await ready();
    return transaction3([GROUPS_STORE, CHUNKS_STORE, STATE_STORE2], "readwrite", async (tx) => {
      const usage = await readUsage(tx);
      const removed = await deleteGroupInTransaction(tx, groupKey, usage);
      await writeUsage(tx, usage);
      return removed;
    });
  }
  function close() {
    if (closed) return;
    closed = true;
    dbPromise2?.then((db) => db.close()).catch(() => {
    });
  }
  return {
    cleanupStale,
    drainAvailable,
    groupKeyFor,
    put,
    readChunkContents,
    readEnvelopeBundleContent,
    readEnvelopeBundleText,
    ready,
    removeGroup,
    status,
    close
  };
}
async function cleanupReceivedChunkStorage({
  indexedDB = globalThis.indexedDB,
  prefix = DEFAULT_PREFIX,
  now = Date.now()
} = {}) {
  const store = createReceivedChunkStore({ prefix, indexedDB });
  try {
    return await store.cleanupStale(now);
  } finally {
    store.close();
  }
}

// node_modules/libp2r2p/private-channel/index.js
var DEFAULT_IGNORED_GROUP_TTL_MS = 30 * 60 * 1e3;
var DEFAULT_IGNORED_GROUP_MAX_ENTRIES = 5e3;
var HEX_SECKEY = /^[0-9a-f]{64}$/i;
var HEX_PUBKEY4 = /^[0-9a-f]{64}$/i;
var encoder5 = new TextEncoder();
var decoder5 = new TextDecoder();
var NIP44_V3_SCOPE = "";
var sendToRelays = (...args) => relayPool.sendEvent(...args);
var getEvents3 = (...args) => relayPool.getEvents(...args);
var getLiveEventsGenerator = (...args) => relayPool.getLiveEventsGenerator(...args);
var getEventsFeedGenerator2 = (...args) => relayPool.getEventsFeedGenerator(...args);
function uniq2(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function normalizeDeletionPubkey(deletionPubkey) {
  if (deletionPubkey === void 0) return void 0;
  if (typeof deletionPubkey !== "string" || !HEX_PUBKEY4.test(deletionPubkey)) {
    throw new ValidationError("INVALID_DELETION_PUBKEY");
  }
  return deletionPubkey.toLowerCase();
}
function privateBroadcastTags({ deletionPubkey, createdAt, expirationSeconds }) {
  return [
    ...deletionPubkey ? [["s", deletionPubkey]] : [],
    ["expiration", String(createdAt + expirationSeconds)]
  ];
}
function getJsonlChunkByteSize() {
  return JSONL_CHUNK_BYTES;
}
function getNymCarrierChunkSize() {
  return NYM_CARRIER_CHUNK_CHARS;
}
function textToBase64(text) {
  return bytesToBase64(encoder5.encode(text));
}
function base64ToText(b64) {
  return decoder5.decode(base64ToBytes(b64));
}
async function nip44v3EncryptText(signer, peerPubkey, kind, plaintext) {
  return signer.nip44v3Encrypt(peerPubkey, kind, NIP44_V3_SCOPE, textToBase64(plaintext));
}
async function nip44v3DecryptText(signer, peerPubkey, kind, ciphertext) {
  return base64ToText(await signer.nip44v3Decrypt(peerPubkey, kind, NIP44_V3_SCOPE, ciphertext));
}
function doesModeStoreRecoverySeeds(mode) {
  return mode === "seeder" || mode === "watchtower";
}
async function makeImkcProof({ senderSigner, senderPubkey, imkcPubkey }) {
  const event = await makeContentKeyEventForPubkey({ userSigner: senderSigner, contentPubkey: imkcPubkey });
  const parsed = parseContentKeyEvent(event);
  if (event.pubkey !== senderPubkey || parsed?.iykcPubkey !== imkcPubkey || !isValidContentKeyProof({ ownerPubkey: senderPubkey, contentPubkey: imkcPubkey, proof: parsed?.iykcProof })) throw new ValidationError("INVALID_IMKC_PROOF");
  return parsed.iykcProof;
}
async function prepareRoutedMessage({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, privateChannelReaderPubkey, receivers, event, temporaryStorageArea, _getIykcProofs = getIykcProofs }) {
  if (!senderSigner?.getPublicKey) throw new ValidationError("SENDER_SIGNER_REQUIRED");
  if (!senderSigner?.nip44EncryptDoubleDH && !senderSigner?.nip44v3Encrypt) throw new ValidationError("SIGNER_NIP44V3_ENCRYPT_UNSUPPORTED");
  if (!privateChannelSigner?.getPublicKey || !privateChannelSigner?.nip44v3Encrypt || !privateChannelSigner?.signEvent) throw new ValidationError("PRIVATE_CHANNEL_SIGNER_REQUIRED");
  if (!Array.isArray(receivers) || !receivers.length) throw new ValidationError("NO_RECEIVERS");
  const senderPubkey = await senderSigner.getPublicKey();
  const useDoubleDh = typeof senderSigner.nip44EncryptDoubleDH === "function";
  const channelPubkey = await privateChannelSigner.getPublicKey();
  const channelReaderPubkey = privateChannelReaderPubkey || channelPubkey;
  const receiverContentKeys = useDoubleDh ? await _getIykcProofs(receiverPubkeysWithoutContentKeys(receivers)) : {};
  const preparedRows = await prepareEnvelopeRows({
    senderSigner,
    imkcSigner: useDoubleDh ? imkcSigner : null,
    receivers,
    receiverContentKeys,
    event,
    rowScope: channelPubkey,
    temporaryStorageArea
  });
  const imkcPubkey = preparedRows.ownContentPubkey || "";
  const imkcProof = imkcPubkey ? await makeImkcProof({ senderSigner, senderPubkey, imkcPubkey }) : "";
  return {
    senderPubkey,
    channelPubkey,
    channelReaderPubkey,
    preparedRows,
    imkcPubkey,
    imkcProof
  };
}
async function* wrapPreparedEvents({ privateChannelSigner, receivers, receiverTag, deletionPubkey, expirationSeconds = EXPIRATION_SECONDS, context }) {
  const routerSeckey = generateSecretKey();
  const routerPubkey = getPublicKey(routerSeckey);
  const receiverPubkeyList = receiverPubkeys(receivers);
  const routerReceiverTag = receiverTag ?? (receiverPubkeyList.length === 1 ? receiverPubkeyList[0] : "");
  const rowIndexes = preparedRowIndexesForReceivers(context.preparedRows, receivers);
  const {
    id,
    total
  } = writeChunksFromPreparedRows(context.preparedRows, rowIndexes);
  const temporaryStorage = context.preparedRows.temporaryStorage;
  try {
    for (let index = 0; index < total; index++) {
      const content = readChunkContent(id, index, temporaryStorage);
      const router = finalizeEvent(makeRouterEvent({
        pubkey: routerPubkey,
        senderPubkey: context.senderPubkey,
        imkcPubkey: context.imkcPubkey,
        imkcProof: context.imkcProof,
        receiverPubkey: routerReceiverTag,
        chunkIndex: index,
        chunkTotal: total,
        content
      }), routerSeckey);
      const createdAt = nowSeconds2();
      const outer = await privateChannelSigner.signEvent({
        kind: PRIVATE_BROADCAST_KIND,
        created_at: createdAt,
        tags: privateBroadcastTags({ deletionPubkey, createdAt, expirationSeconds }),
        content: await nip44v3EncryptText(privateChannelSigner, context.channelReaderPubkey, PRIVATE_BROADCAST_KIND, JSON.stringify(router))
      });
      if (eventByteLength(outer) > MAX_EVENT_BYTES) throw new ValidationError("EVENT_TOO_LARGE");
      yield outer;
    }
  } finally {
    cleanupChunks(id, total, temporaryStorage);
  }
}
async function* wrapEvents({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, privateChannelReaderPubkey, receivers, receiverTag, deletionPubkey, event, expirationSeconds = EXPIRATION_SECONDS, temporaryStorageArea, _getIykcProofs = getIykcProofs }) {
  const normalizedDeletionPubkey = normalizeDeletionPubkey(deletionPubkey);
  const context = await prepareRoutedMessage({
    senderSigner,
    imkcSigner,
    privateChannelSigner,
    privateChannelReaderPubkey,
    receivers,
    event,
    temporaryStorageArea,
    _getIykcProofs
  });
  try {
    yield* wrapPreparedEvents({ privateChannelSigner, receivers, receiverTag, deletionPubkey: normalizedDeletionPubkey, expirationSeconds, context });
  } finally {
    cleanupEnvelopeRows(context.preparedRows);
  }
}
async function wrapEvent(options) {
  const events = [];
  for await (const event of wrapEvents(options)) events.push(event);
  return events;
}
async function* wrapNymEvents({ nymSigner, privateChannelSigner, privateChannelReaderPubkey, deletionPubkey, event, expirationSeconds = EXPIRATION_SECONDS }) {
  if (!nymSigner?.getPublicKey || !nymSigner?.signEvent) throw new ValidationError("NYM_SIGNER_REQUIRED");
  if (!privateChannelSigner?.getPublicKey || !privateChannelSigner?.nip44v3Encrypt || !privateChannelSigner?.signEvent) throw new ValidationError("PRIVATE_CHANNEL_SIGNER_REQUIRED");
  const normalizedDeletionPubkey = normalizeDeletionPubkey(deletionPubkey);
  const nymPubkey = await nymSigner.getPublicKey();
  const channelPubkey = await privateChannelSigner.getPublicKey();
  const channelReaderPubkey = privateChannelReaderPubkey || channelPubkey;
  const wireEvent = hasEventSignature(event) ? assertValidSignedInnerEvent(event) : wireNymRumor({ ...event, created_at: event?.created_at !== void 0 ? event.created_at : nowSeconds2() });
  const innerEvent = hasEventSignature(wireEvent) ? wireEvent : normalizeNymRumor(wireEvent, nymPubkey);
  const encoded = bytesToBase64(encoder5.encode(JSON.stringify(wireEvent)));
  const total = Math.max(1, Math.ceil(encoded.length / NYM_CARRIER_CHUNK_CHARS));
  const carrierCreatedAt = nowSeconds2();
  for (let index = 0; index < total; index++) {
    const carrier = assertValidNymCarrierEvent(await nymSigner.signEvent(makeNymCarrierEvent({
      innerId: innerEvent.id,
      chunkIndex: index,
      chunkTotal: total,
      content: encoded.slice(index * NYM_CARRIER_CHUNK_CHARS, (index + 1) * NYM_CARRIER_CHUNK_CHARS),
      createdAt: carrierCreatedAt
    })));
    const createdAt = nowSeconds2();
    const outer = await privateChannelSigner.signEvent({
      kind: PRIVATE_BROADCAST_KIND,
      created_at: createdAt,
      tags: privateBroadcastTags({ deletionPubkey: normalizedDeletionPubkey, createdAt, expirationSeconds }),
      content: await nip44v3EncryptText(privateChannelSigner, channelReaderPubkey, PRIVATE_BROADCAST_KIND, JSON.stringify(carrier))
    });
    if (eventByteLength(outer) > MAX_EVENT_BYTES) throw new ValidationError("EVENT_TOO_LARGE");
    yield outer;
  }
}
async function wrapNymEvent(options) {
  const events = [];
  for await (const event of wrapNymEvents(options)) events.push(event);
  return events;
}
function joinedRouter(router, content = "") {
  return {
    ...router,
    content,
    tags: router.tags.filter((t) => t[0] !== "c").concat([["c", "0", "1"]])
  };
}
function parsePayloadEnvelope(line, index = 0) {
  const record = JSON.parse(line);
  if (!Array.isArray(record) || record.length !== 1 || typeof record[0] !== "string") throw new ValidationError("INVALID_PAYLOAD_ENVELOPE");
  return { index, type: "payload", ciphertext: record[0] };
}
function parseRecipientEnvelope(line, index = 0) {
  const record = JSON.parse(line);
  if (!Array.isArray(record) || record.length !== 2 && record.length !== 4) throw new ValidationError("INVALID_RECIPIENT_ENVELOPE");
  const [receiverPubkey, ciphertext, iykcPubkey = "", iykcProof = ""] = record;
  return { index, receiverPubkey, ciphertext, iykcPubkey, iykcProof };
}
function hasEventSignature(event) {
  return Object.prototype.hasOwnProperty.call(event || {}, "sig");
}
function assertValidSignedInnerEvent(event) {
  if (!isValidEvent(event)) {
    throw new ValidationError("INVALID_SIGNED_INNER_EVENT");
  }
  return event;
}
function normalizeNymRumor(event, pubkey) {
  const normalized = { ...event, pubkey };
  if (!isSerializableEvent(normalized)) throw new ValidationError("INVALID_NYM_RUMOR");
  return { ...normalized, id: getEventHash(normalized) };
}
function wireNymRumor(event = {}) {
  return {
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    created_at: event.created_at
  };
}
function assertValidNymCarrierEvent(carrier) {
  if (!isValidEvent(carrier)) {
    throw new ValidationError("INVALID_NYM_CARRIER");
  }
  if (carrier.kind !== NYM_CARRIER_KIND) throw new ValidationError("INVALID_NYM_CARRIER_KIND");
  if (!readIdTag(carrier)) throw new ValidationError("MISSING_NYM_CARRIER_ID");
  readChunkTag(carrier);
  return carrier;
}
function nymCarrierGroupId(carrier) {
  return `nym:${carrier.pubkey}:${readIdTag(carrier)}:${readChunkTag(carrier).total}`;
}
function validateNymCarriers(carriers) {
  if (!Array.isArray(carriers) || !carriers.length) throw new ValidationError("NYM_CARRIERS_REQUIRED");
  const chunks = [];
  let nymPubkey = "";
  let innerId = "";
  let total = 0;
  for (const carrier of carriers) {
    assertValidNymCarrierEvent(carrier);
    const nextInnerId = readIdTag(carrier);
    const { index, total: nextTotal } = readChunkTag(carrier);
    if (!nymPubkey) {
      nymPubkey = carrier.pubkey;
      innerId = nextInnerId;
      total = nextTotal;
    }
    if (carrier.pubkey !== nymPubkey || nextInnerId !== innerId || nextTotal !== total) {
      throw new ValidationError("MISMATCHED_NYM_CARRIER_CHUNKS");
    }
    if (chunks[index] !== void 0) throw new ValidationError("DUPLICATE_NYM_CARRIER_CHUNK");
    chunks[index] = carrier.content;
  }
  if (chunks.length !== total) throw new ValidationError("MISSING_NYM_CARRIER_CHUNK");
  for (let index = 0; index < total; index++) {
    if (chunks[index] == null) throw new ValidationError("MISSING_NYM_CARRIER_CHUNK");
  }
  return { nymPubkey, innerId, content: chunks.join("") };
}
function eventFromNymCarriers(carriers) {
  const { nymPubkey, innerId, content } = validateNymCarriers(carriers);
  let parsed;
  try {
    parsed = JSON.parse(decoder5.decode(base64ToBytes(content)));
  } catch {
    throw new ValidationError("INVALID_NYM_CARRIER_PAYLOAD");
  }
  if (hasEventSignature(parsed)) {
    const event2 = assertValidSignedInnerEvent(parsed);
    if (event2.id !== innerId) throw new ValidationError("INVALID_NYM_CARRIER_INNER_ID");
    return event2;
  }
  const event = normalizeNymRumor(parsed, nymPubkey);
  if (event.id !== innerId) throw new ValidationError("INVALID_NYM_CARRIER_INNER_ID");
  return event;
}
function assertValidEnvelopeIykcProof(envelope) {
  if (!envelope.iykcPubkey) return;
  if (!isValidIykcProof({
    receiverPubkey: envelope.receiverPubkey,
    iykcPubkey: envelope.iykcPubkey,
    iykcProof: envelope.iykcProof
  })) throw new ValidationError("INVALID_IYKC_PROOF");
}
function assertValidRouterImkcProof({ router, senderPubkey, imkcPubkey, imkcProof }) {
  if (!hasImkcTag(router)) return;
  if (!isValidContentKeyProof({
    ownerPubkey: senderPubkey,
    contentPubkey: imkcPubkey,
    proof: imkcProof
  })) throw new ValidationError("INVALID_IMKC_PROOF");
}
function eventFromPayload({ payloadCiphertext, messageSeckey, senderPubkey }) {
  if (!HEX_SECKEY.test(messageSeckey || "")) throw new ValidationError("INVALID_MESSAGE_SECKEY");
  const messageSecretKey = hexToBytes3(messageSeckey);
  const messagePubkey = getPublicKey(messageSecretKey);
  const decrypted = JSON.parse(decrypt4(messageSecretKey, messagePubkey, ROUTER_KIND, NIP44_V3_SCOPE, payloadCiphertext));
  if (hasEventSignature(decrypted)) return assertValidSignedInnerEvent(decrypted);
  const normalized = { ...decrypted, pubkey: senderPubkey };
  return { ...normalized, id: getEventHash(normalized) };
}
async function unwrapRecipientEnvelope({ payloadCiphertext, envelope, receiverSigner, receiverPubkey, senderPubkey, imkcPubkey, rowScope = "" }) {
  if (receiverPubkey && envelope.receiverPubkey !== receiverPubkey) return null;
  let messageSeckey;
  if (envelope.iykcPubkey || imkcPubkey) {
    if (!receiverSigner?.nip44DecryptDoubleDH) throw new ValidationError("RECEIVER_DOUBLE_DH_UNSUPPORTED");
    if (envelope.iykcPubkey) {
      assertValidEnvelopeIykcProof(envelope);
    }
    messageSeckey = base64ToText(await receiverSigner.nip44DecryptDoubleDH(
      senderPubkey,
      ROUTER_KIND,
      rowScope,
      envelope.ciphertext,
      imkcPubkey,
      envelope.iykcPubkey || ""
    ));
  } else {
    if (!receiverSigner?.nip44v3Decrypt) throw new ValidationError("RECEIVER_SIGNER_NIP44V3_DECRYPT_UNSUPPORTED");
    messageSeckey = base64ToText(await receiverSigner.nip44v3Decrypt(senderPubkey, ROUTER_KIND, rowScope, envelope.ciphertext));
  }
  return eventFromPayload({ payloadCiphertext, messageSeckey, senderPubkey });
}
async function unwrapEvent({ receiverSigner, privateChannelSigner = receiverSigner, privateChannelReaderSigner = privateChannelSigner, privateChannelReaderPubkey, event, receiverPubkey }) {
  if (!event || event.kind !== PRIVATE_BROADCAST_KIND) return null;
  if (!receiverSigner?.nip44DecryptDoubleDH && !receiverSigner?.nip44v3Decrypt) throw new ValidationError("RECEIVER_SIGNER_NIP44V3_DECRYPT_UNSUPPORTED");
  const channelReaderSigner = privateChannelReaderSigner || privateChannelSigner;
  if (!channelReaderSigner?.nip44v3Decrypt) throw new ValidationError("PRIVATE_CHANNEL_READER_REQUIRED");
  const channelPubkey = event.pubkey || await privateChannelSigner?.getPublicKey?.();
  if (!channelPubkey) throw new ValidationError("PRIVATE_CHANNEL_PUBKEY_REQUIRED");
  const router = await decryptRouter({
    content: event.content,
    channelPubkey,
    channelSigner: privateChannelSigner,
    channelReaderSigner,
    channelReaderPubkey: privateChannelReaderPubkey
  });
  if (router.kind !== ROUTER_KIND) throw new ValidationError("INVALID_ROUTER_KIND");
  if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey) return null;
  const senderPubkey = readSenderTag(router);
  const imkcPubkey = readImkcTag(router);
  assertValidRouterImkcProof({ router, senderPubkey, imkcPubkey, imkcProof: readImkcProof(router) });
  const lines = decodeChunkLines(router.content);
  if (!lines.length) throw new ValidationError("MISSING_PAYLOAD_ENVELOPE");
  const payload = parsePayloadEnvelope(lines[0], 0);
  for (let index = 1; index < lines.length; index++) {
    const event2 = await unwrapRecipientEnvelope({
      payloadCiphertext: payload.ciphertext,
      envelope: parseRecipientEnvelope(lines[index], index),
      receiverSigner,
      receiverPubkey,
      senderPubkey,
      imkcPubkey,
      rowScope: channelPubkey
    });
    if (event2) return event2;
  }
  return null;
}
function receiverPubkeyFor(receiver) {
  return receiverPubkeys([receiver])[0] || "";
}
function relayReceiverEntries(relayToReceivers) {
  if (!relayToReceivers) return [];
  if (relayToReceivers instanceof Map) return [...relayToReceivers.entries()];
  if (typeof relayToReceivers === "object") return Object.entries(relayToReceivers);
  throw new ValidationError("INVALID_RELAY_RECEIVERS");
}
function groupedRelayReceivers({ relayToReceivers, receivers }) {
  const entries = relayReceiverEntries(relayToReceivers);
  if (!entries.length) return null;
  const receiverByPubkey = /* @__PURE__ */ new Map();
  const orderedPubkeys = [];
  for (const receiver of receivers || []) {
    const pubkey = receiverPubkeyFor(receiver);
    if (!pubkey || receiverByPubkey.has(pubkey)) continue;
    receiverByPubkey.set(pubkey, receiver);
    orderedPubkeys.push(pubkey);
  }
  const wanted = new Set(orderedPubkeys);
  const covered = /* @__PURE__ */ new Set();
  const groupsByKey = /* @__PURE__ */ new Map();
  for (const [relay, value] of entries) {
    if (!relay) continue;
    const pubkeys = uniq2(Array.isArray(value) ? value : [value]);
    if (!pubkeys.length) continue;
    for (const pubkey of pubkeys) {
      if (!wanted.has(pubkey)) throw new ValidationError("RELAY_RECEIVER_NOT_REQUESTED");
      covered.add(pubkey);
    }
    const key = [...pubkeys].sort().join(",");
    if (!groupsByKey.has(key)) {
      const set = new Set(pubkeys);
      groupsByKey.set(key, {
        pubkeys: set,
        relays: []
      });
    }
    groupsByKey.get(key).relays.push(relay);
  }
  if (!groupsByKey.size) throw new ValidationError("NO_RELAYS");
  for (const pubkey of orderedPubkeys) {
    if (!covered.has(pubkey)) throw new ValidationError("RELAY_RECEIVER_MISSING");
  }
  return [...groupsByKey.values()].map((group) => ({
    relays: uniq2(group.relays),
    receivers: orderedPubkeys.filter((pubkey) => group.pubkeys.has(pubkey)).map((pubkey) => receiverByPubkey.get(pubkey))
  }));
}
function relaysFromRelayReceivers(relayToReceivers) {
  return uniq2(relayReceiverEntries(relayToReceivers).map(([relay]) => relay));
}
function withRecoveryRelays(relays, recoveryRelays) {
  return uniq2([...relays || [], ...recoveryRelays || []]);
}
async function publish({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, privateChannelReaderPubkey, receivers, receiverTag, deletionPubkey, event, relays, relayToReceivers, recoveryRelays, expirationSeconds, temporaryStorageArea, _getIykcProofs = getIykcProofs, _publish = sendToRelays }) {
  const normalizedDeletionPubkey = normalizeDeletionPubkey(deletionPubkey);
  const results = [];
  const groups = groupedRelayReceivers({ relayToReceivers, receivers });
  if (groups) {
    const context = await prepareRoutedMessage({
      senderSigner,
      imkcSigner,
      privateChannelSigner,
      privateChannelReaderPubkey,
      receivers,
      event,
      temporaryStorageArea,
      _getIykcProofs
    });
    try {
      for (const group of groups) {
        for await (const wrappedEvent of wrapPreparedEvents({ privateChannelSigner, receivers: group.receivers, receiverTag, deletionPubkey: normalizedDeletionPubkey, expirationSeconds, context })) {
          results.push(await _publish(wrappedEvent, withRecoveryRelays(group.relays, recoveryRelays)));
        }
      }
    } finally {
      cleanupEnvelopeRows(context.preparedRows);
    }
    return results;
  }
  for await (const wrappedEvent of wrapEvents({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers, receiverTag, deletionPubkey: normalizedDeletionPubkey, event, expirationSeconds, temporaryStorageArea, _getIykcProofs })) {
    results.push(await _publish(wrappedEvent, withRecoveryRelays(relays, recoveryRelays)));
  }
  return results;
}
async function publishNymEvent({ nymSigner, privateChannelSigner, privateChannelReaderPubkey, deletionPubkey, event, relays, relayToReceivers, recoveryRelays, expirationSeconds, _publish = sendToRelays }) {
  const normalizedDeletionPubkey = normalizeDeletionPubkey(deletionPubkey);
  const results = [];
  const publishRelays = withRecoveryRelays(relayToReceivers ? relaysFromRelayReceivers(relayToReceivers) : relays, recoveryRelays);
  for await (const wrappedEvent of wrapNymEvents({ nymSigner, privateChannelSigner, privateChannelReaderPubkey, deletionPubkey: normalizedDeletionPubkey, event, expirationSeconds })) {
    results.push(await _publish(wrappedEvent, publishRelays));
  }
  return results;
}
function readSignerFromMap(signersByPubkey, pubkey) {
  if (!signersByPubkey || !pubkey) return null;
  if (signersByPubkey instanceof Map) return signersByPubkey.get(pubkey) || null;
  return signersByPubkey[pubkey] || null;
}
async function decryptRouter({ content, channelPubkey, channelSigner, channelReaderSigner, channelReaderPubkey }) {
  const signer = channelReaderSigner || channelSigner;
  if (!signer?.nip44v3Decrypt) throw new ValidationError("PRIVATE_CHANNEL_READER_REQUIRED");
  const readerPubkey = channelReaderPubkey || channelPubkey;
  const signerPubkey = await signer.getPublicKey?.();
  const isWriterSide = readerPubkey !== channelPubkey && (signer === channelSigner || signerPubkey === channelPubkey);
  const peerPubkey = isWriterSide ? readerPubkey : channelPubkey;
  return JSON.parse(await nip44v3DecryptText(signer, peerPubkey, PRIVATE_BROADCAST_KIND, content));
}
function readValueFromMap(map, key) {
  if (!map || !key) return null;
  if (map instanceof Map) return map.get(key) ?? null;
  return map[key] ?? null;
}
function privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys }) {
  return [...new Set([
    ...privateChannelPubkeys || [],
    ...privateChannelPubkey ? [privateChannelPubkey] : []
  ].filter(Boolean))];
}
function createTtlSet({ ttlMs, maxEntries }) {
  const entries = /* @__PURE__ */ new Map();
  function prune(now = Date.now()) {
    if (Number.isFinite(ttlMs)) {
      for (const [key, expiresAt] of entries) {
        if (expiresAt > now) break;
        entries.delete(key);
      }
    }
    if (Number.isFinite(maxEntries)) {
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    }
  }
  return {
    add(key) {
      if (!key || maxEntries <= 0 || ttlMs <= 0) return;
      const now = Date.now();
      const expiresAt = Number.isFinite(ttlMs) ? now + ttlMs : Infinity;
      if (entries.has(key)) entries.delete(key);
      entries.set(key, expiresAt);
      prune(now);
    },
    has(key) {
      prune();
      return entries.has(key);
    }
  };
}
function contentKeyUsageBase({ outer, router, channelPubkey, receiverPubkeys: receiverPubkeys2 = [] }) {
  const senderPubkey = readSenderTag(router);
  const routerReceiverPubkey = readReceiverTag(router);
  return {
    outer,
    router,
    channelPubkey,
    senderPubkey,
    routerReceiverPubkey,
    receiverPubkeys: receiverPubkeys2,
    isBroadcast: !routerReceiverPubkey
  };
}
function emitSentContentKeyUsage({ outer, router, channelPubkey, receiverPubkey, receiverPubkeys: receiverPubkeys2, onContentKeyUsage }) {
  if (!receiverPubkey || !onContentKeyUsage) return;
  const base = contentKeyUsageBase({ outer, router, channelPubkey, receiverPubkeys: receiverPubkeys2 });
  if (base.senderPubkey !== receiverPubkey) return;
  onContentKeyUsage({
    ...base,
    direction: "sent",
    keyRole: "sender",
    receiverPubkey: base.routerReceiverPubkey || "",
    contentKeyPubkey: readImkcTag(router),
    contentKeyProof: readImkcProof(router)
  });
}
function emitReceivedContentKeyUsage({ outer, router, channelPubkey, receiverPubkey, receiverPubkeys: receiverPubkeys2, envelope, onContentKeyUsage }) {
  if (!receiverPubkey || !onContentKeyUsage || envelope.receiverPubkey !== receiverPubkey) return;
  onContentKeyUsage({
    ...contentKeyUsageBase({ outer, router, channelPubkey, receiverPubkeys: receiverPubkeys2 }),
    direction: "received",
    keyRole: "receiver",
    receiverPubkey: envelope.receiverPubkey,
    contentKeyPubkey: envelope.iykcPubkey,
    contentKeyProof: envelope.iykcProof,
    rowIndex: envelope.index
  });
}
function createProcessor({
  receiverSigner,
  privateChannelSigner,
  privateChannelSignersByPubkey,
  privateChannelReaderSigner = privateChannelSigner,
  privateChannelReaderSignersByPubkey,
  privateChannelReaderPubkey,
  privateChannelReaderPubkeysByPubkey,
  receiverPubkey,
  mode = "leecher",
  modeByPubkey,
  onChunk,
  onEvent,
  onNymEvent,
  onSeedEvent,
  onContentKeyUsage,
  onError,
  receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS,
  receivedChunkTtlMsByPubkey,
  receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES,
  receivedChunkIndexedDB = globalThis.indexedDB,
  ignoredGroupTtlMs = DEFAULT_IGNORED_GROUP_TTL_MS,
  ignoredGroupMaxEntries = DEFAULT_IGNORED_GROUP_MAX_ENTRIES
}) {
  const receivedChunks = createReceivedChunkStore({
    ttlMs: receivedChunkTtlMs,
    maxBytes: receivedChunkMaxBytes,
    indexedDB: receivedChunkIndexedDB
  });
  const ignoredGroups = createTtlSet({
    ttlMs: ignoredGroupTtlMs,
    maxEntries: ignoredGroupMaxEntries
  });
  const storeReady = receivedChunks.ready();
  storeReady.catch(() => {
  });
  async function processOuterEvent(outer) {
    await storeReady;
    let groupKey = "";
    try {
      const channelPubkey = outer.pubkey || await privateChannelSigner?.getPublicKey?.();
      const channelSigner = readSignerFromMap(privateChannelSignersByPubkey, channelPubkey) || privateChannelSigner;
      const channelReaderSigner = readSignerFromMap(privateChannelReaderSignersByPubkey, channelPubkey) || privateChannelReaderSigner || channelSigner;
      const channelReaderPubkey = readValueFromMap(privateChannelReaderPubkeysByPubkey, channelPubkey) || privateChannelReaderPubkey || channelPubkey;
      const channelMode = readValueFromMap(modeByPubkey, channelPubkey) || mode;
      const channelReceivedChunkTtlMs = readValueFromMap(receivedChunkTtlMsByPubkey, channelPubkey) ?? receivedChunkTtlMs;
      if (!channelPubkey) throw new ValidationError("PRIVATE_CHANNEL_PUBKEY_REQUIRED");
      const decrypted = await decryptRouter({
        content: outer.content,
        channelPubkey,
        channelSigner,
        channelReaderSigner,
        channelReaderPubkey
      });
      if (decrypted.kind === NYM_CARRIER_KIND) {
        const carrier = assertValidNymCarrierEvent(decrypted);
        const { index: index2, total: total2 } = readChunkTag(carrier);
        groupKey = receivedChunks.groupKeyFor(channelPubkey, nymCarrierGroupId(carrier));
        if (ignoredGroups.has(groupKey)) return;
        const meta2 = await receivedChunks.put({
          channelPubkey,
          routerPubkey: nymCarrierGroupId(carrier),
          index: index2,
          total: total2,
          contentBytes: encoder5.encode(JSON.stringify(carrier)),
          ttlMs: channelReceivedChunkTtlMs
        });
        const status2 = await receivedChunks.status(meta2);
        onChunk?.({
          outer,
          nymCarrier: carrier,
          channelPubkey,
          index: index2,
          total: total2,
          received: status2.received,
          missing: status2.missing
        });
        if (status2.received < total2) return;
        const carriers = (await receivedChunks.readChunkContents(groupKey)).map((raw) => JSON.parse(raw));
        const event2 = eventFromNymCarriers(carriers);
        const shouldSeed2 = doesModeStoreRecoverySeeds(channelMode);
        if (shouldSeed2) {
          await onSeedEvent?.({
            recordType: "nymCarrier_v1",
            outer,
            carriers,
            carrier: carriers[0],
            channelPubkey,
            event: event2
          });
        }
        await onNymEvent?.(event2, outer, {
          carrier: carriers[0],
          carriers,
          channelPubkey
        });
        await receivedChunks.removeGroup(groupKey);
        return;
      }
      const router = decrypted;
      if (router.kind !== ROUTER_KIND) return;
      const senderPubkey = readSenderTag(router);
      if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey && senderPubkey !== receiverPubkey) return;
      const { index, total } = readChunkTag(router);
      groupKey = receivedChunks.groupKeyFor(channelPubkey, router.pubkey);
      if (ignoredGroups.has(groupKey)) return;
      const imkcPubkey = readImkcTag(router);
      assertValidRouterImkcProof({ router, senderPubkey, imkcPubkey, imkcProof: readImkcProof(router) });
      const meta = await receivedChunks.put({
        channelPubkey,
        routerPubkey: router.pubkey,
        index,
        total,
        contentBytes: base64ToBytes(router.content),
        ttlMs: channelReceivedChunkTtlMs
      });
      const status = await receivedChunks.status(meta);
      onChunk?.({
        outer,
        router,
        channelPubkey,
        index,
        total,
        received: status.received,
        missing: status.missing
      });
      const shouldSeed = doesModeStoreRecoverySeeds(channelMode);
      const sentByReceiver = receiverPubkey && senderPubkey === receiverPubkey;
      const mustScanWholeBundle = shouldSeed || sentByReceiver;
      let event = null;
      const innerEventIdsByRowIndex = {};
      const drained = await receivedChunks.drainAvailable(groupKey, {
        onLine: async (line, rowIndex, groupMeta, helpers) => {
          if (rowIndex === 0) {
            helpers.rememberPayloadCiphertext(groupMeta, parsePayloadEnvelope(line, rowIndex).ciphertext);
            return;
          }
          if (!groupMeta.payloadCiphertext) throw new ValidationError("MISSING_PAYLOAD_ENVELOPE");
          const envelope = parseRecipientEnvelope(line, rowIndex);
          helpers.rememberReceiverPubkey(groupMeta, envelope.receiverPubkey);
          if (receiverPubkey && envelope.receiverPubkey === receiverPubkey) {
            assertValidEnvelopeIykcProof(envelope);
            emitReceivedContentKeyUsage({
              outer,
              router,
              channelPubkey,
              receiverPubkey,
              receiverPubkeys: groupMeta.receiverPubkeys,
              envelope,
              onContentKeyUsage
            });
            if (receiverSigner && !event) {
              event = await unwrapRecipientEnvelope({
                payloadCiphertext: groupMeta.payloadCiphertext,
                envelope,
                receiverSigner,
                receiverPubkey,
                senderPubkey,
                imkcPubkey,
                rowScope: channelPubkey
              });
              if (event) {
                innerEventIdsByRowIndex[rowIndex] = event.id;
                if (!mustScanWholeBundle) return { stop: true };
              }
            }
          }
        }
      });
      if (event && !mustScanWholeBundle) {
        await onEvent?.(event, outer, { router: joinedRouter(router), channelPubkey });
        ignoredGroups.add(groupKey);
        await receivedChunks.removeGroup(groupKey);
        return;
      }
      if (!drained.complete) return;
      const receiverPubkeys2 = drained.meta?.receiverPubkeys || [];
      const content = shouldSeed ? await receivedChunks.readEnvelopeBundleContent(groupKey) : "";
      const jsonl = shouldSeed ? await receivedChunks.readEnvelopeBundleText(groupKey) : "";
      const completeRouter = joinedRouter(router, content);
      emitSentContentKeyUsage({
        outer,
        router: completeRouter,
        channelPubkey,
        receiverPubkey,
        receiverPubkeys: receiverPubkeys2,
        onContentKeyUsage
      });
      if (shouldSeed) await onSeedEvent?.({ recordType: "routerRow_v1", outer, router: completeRouter, channelPubkey, jsonl, innerEventIdsByRowIndex });
      if (event) await onEvent?.(event, outer, { router: completeRouter, channelPubkey, jsonl });
      await receivedChunks.removeGroup(groupKey);
    } catch (err) {
      if (shouldIgnoreGroupError(err) && groupKey) {
        ignoredGroups.add(groupKey);
        await receivedChunks.removeGroup(groupKey).catch(() => {
        });
      }
      onError?.(err);
    }
  }
  processOuterEvent.close = () => receivedChunks.close();
  return processOuterEvent;
}
function shouldIgnoreGroupError(err) {
  return [
    "DUPLICATE_NYM_CARRIER_CHUNK",
    "INVALID_IYKC_PROOF",
    "INVALID_IMKC_PROOF",
    "INVALID_MESSAGE_SECKEY",
    "INVALID_NYM_CARRIER",
    "INVALID_NYM_CARRIER_ID",
    "INVALID_NYM_CARRIER_INNER_ID",
    "INVALID_NYM_CARRIER_KIND",
    "INVALID_NYM_CARRIER_PAYLOAD",
    "INVALID_NYM_RUMOR",
    "INVALID_PAYLOAD_ENVELOPE",
    "INVALID_RECIPIENT_ENVELOPE",
    "INVALID_SIGNED_INNER_EVENT",
    "MISSING_PAYLOAD_ENVELOPE",
    "RECEIVED_CHUNK_GROUP_TOO_LARGE",
    "MISMATCHED_NYM_CARRIER_CHUNKS",
    "MISSING_NYM_CARRIER_CHUNK",
    "MISSING_NYM_CARRIER_ID"
  ].includes(err?.message);
}
async function fetch({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelReaderSigner = privateChannelSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onNymEvent, onSeedEvent, onContentKeyUsage, onError, since, until, limit, mode = "leecher", modeByPubkey, receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS, receivedChunkTtlMsByPubkey, receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES, receivedChunkIndexedDB = globalThis.indexedDB, ignoredGroupTtlMs = DEFAULT_IGNORED_GROUP_TTL_MS, ignoredGroupMaxEntries = DEFAULT_IGNORED_GROUP_MAX_ENTRIES, _getEvents = getEvents3 }) {
  if (!relays?.length) throw new ValidationError("NO_RELAYS");
  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys });
  const filter = { kinds: [PRIVATE_BROADCAST_KIND] };
  if (authors.length) filter.authors = authors;
  if (since != null) filter.since = since;
  if (until != null) filter.until = until;
  if (limit != null) filter.limit = limit;
  const { result: events } = await _getEvents(filter, relays, {
    timeout: 5e3,
    timeoutAfterFirstEose: null
  });
  events.sort((a, b) => a.created_at - b.created_at);
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, privateChannelReaderSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onNymEvent, onSeedEvent, onContentKeyUsage, onError, receivedChunkTtlMs, receivedChunkTtlMsByPubkey, receivedChunkMaxBytes, receivedChunkIndexedDB, ignoredGroupTtlMs, ignoredGroupMaxEntries });
  try {
    for (const event of events) await processOuterEvent(event);
    return events;
  } finally {
    processOuterEvent.close();
  }
}
function subscribe2({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelReaderSigner = privateChannelSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onNymEvent, onSeedEvent, onContentKeyUsage, onError, since = nowSeconds2() - 5, limit, liveOnly = false, mode = "leecher", modeByPubkey, receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS, receivedChunkTtlMsByPubkey, receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES, receivedChunkIndexedDB = globalThis.indexedDB, ignoredGroupTtlMs = DEFAULT_IGNORED_GROUP_TTL_MS, ignoredGroupMaxEntries = DEFAULT_IGNORED_GROUP_MAX_ENTRIES, _liveEventsGenerator = getLiveEventsGenerator, _eventsFeedGenerator = getEventsFeedGenerator2 }) {
  if (!relays?.length) throw new ValidationError("NO_RELAYS");
  if (receiverSigner && !receiverSigner?.nip44DecryptDoubleDH && !receiverSigner?.nip44v3Decrypt) throw new ValidationError("RECEIVER_SIGNER_NIP44V3_DECRYPT_UNSUPPORTED");
  if (!privateChannelReaderSigner && !privateChannelReaderSignersByPubkey && !privateChannelSigner && !privateChannelSignersByPubkey) throw new ValidationError("PRIVATE_CHANNEL_READER_REQUIRED");
  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys });
  const filter = { kinds: [PRIVATE_BROADCAST_KIND], since };
  if (authors.length) filter.authors = authors;
  if (limit != null) filter.limit = limit;
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, privateChannelReaderSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onNymEvent, onSeedEvent, onContentKeyUsage, onError, receivedChunkTtlMs, receivedChunkTtlMsByPubkey, receivedChunkMaxBytes, receivedChunkIndexedDB, ignoredGroupTtlMs, ignoredGroupMaxEntries });
  const controller = new AbortController();
  const events = liveOnly ? _liveEventsGenerator(filter, relays, {
    signal: controller.signal
  }) : _eventsFeedGenerator(filter, relays, {
    signal: controller.signal,
    timeout: 5e3,
    timeoutAfterFirstEose: null
  });
  async function consumeEvents() {
    try {
      for await (const outer of events) {
        if (controller.signal.aborted) continue;
        await processOuterEvent(outer);
      }
    } catch (error) {
      if (!controller.signal.aborted && error?.message !== "Aborted") onError?.(error);
    } finally {
      processOuterEvent.close();
    }
  }
  const consumePromise = consumeEvents();
  return {
    close() {
      controller.abort();
      return consumePromise;
    }
  };
}

// node_modules/libp2r2p/private-message/index.js
var ASK_KIND = 7329;
var REPLY_KIND = 7330;
var TELL_KIND = 7331;
var RESUBSCRIBE_GRACE_MS = 500;
var PRIVATE_MESSAGE_KINDS = [ASK_KIND, REPLY_KIND, TELL_KIND];
var HEX_PUBKEY5 = /^[0-9a-f]{64}$/i;
var watchesByChannel = /* @__PURE__ */ new Map();
var subsByRelay = /* @__PURE__ */ new Map();
var nextWatchRevision = 1;
function nowSeconds3() {
  return Math.floor(Date.now() / 1e3);
}
function uniq3(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function normalizeDeletionPubkey2(deletionPubkey) {
  if (deletionPubkey === void 0) return void 0;
  if (typeof deletionPubkey !== "string" || !HEX_PUBKEY5.test(deletionPubkey)) {
    throw new ValidationError("INVALID_DELETION_PUBKEY");
  }
  return deletionPubkey.toLowerCase();
}
function resolveDeletionCapability({ deletionPubkey, deletionSeckey, autoDeletionCapability = true }) {
  if (deletionSeckey !== void 0) throw new ValidationError("DELETION_SECKEY_NOT_ACCEPTED");
  if (typeof autoDeletionCapability !== "boolean") throw new ValidationError("AUTO_DELETION_CAPABILITY_BOOLEAN_REQUIRED");
  const normalizedDeletionPubkey = normalizeDeletionPubkey2(deletionPubkey);
  if (normalizedDeletionPubkey) return { deletionPubkey: normalizedDeletionPubkey };
  if (!autoDeletionCapability) return {};
  const { pubkey, seckey } = generateKeypair();
  return { deletionPubkey: pubkey, deletionSeckey: seckey };
}
function withDelivery(result, reports, deletionSeckey) {
  const delivery = { reports };
  if (deletionSeckey !== void 0) delivery.deletionSeckey = deletionSeckey;
  return {
    ...result,
    delivery
  };
}
function areSetsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
function normalizePayloadContent(payload) {
  if (payload == null || payload === "") return "";
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
}
function normalizeMessage(message = {}) {
  if (typeof message === "string") return { content: normalizePayloadContent(message), code: "", error: "" };
  const hasPayload = Object.prototype.hasOwnProperty.call(message, "payload");
  const payload = hasPayload ? message.payload : message.content;
  return {
    content: normalizePayloadContent(payload),
    code: message.code == null ? "" : String(message.code),
    error: message.error == null ? "" : String(message.error)
  };
}
function addHeaderTag(tags, { code, error }) {
  const out = cloneTags(tags);
  if (!code && !error) return out;
  const header = ["h", code || ""];
  if (error) header.push(error);
  return out.concat([header]);
}
function makeMessageRumor({ kind, tags, message }) {
  const normalized = normalizeMessage(message);
  return {
    kind,
    tags: addHeaderTag(tags, normalized),
    content: normalized.content
  };
}
function parsePayloadContent(content) {
  if (content === "") return null;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}
function parseMessageContent(event) {
  const payload = parsePayloadContent(event.content);
  const header = event.tags?.find((tag) => tag[0] === "h") || [];
  const message = {};
  if (payload !== null) message.payload = payload;
  if (header[1]) message.code = header[1];
  if (header[2]) message.error = header[2];
  return message;
}
function parseRumorContent(event) {
  if (PRIVATE_MESSAGE_KINDS.includes(event.kind)) return parseMessageContent(event);
  return parsePayloadContent(event.content);
}
function cloneTags(tags) {
  if (!Array.isArray(tags)) return tags;
  return tags.map((tag) => Array.isArray(tag) ? [...tag] : tag);
}
async function makeOutgoingRumor({ senderSigner, rumor }) {
  if (!senderSigner?.getPublicKey) throw new ValidationError("SENDER_SIGNER_REQUIRED");
  const senderPubkey = await senderSigner.getPublicKey();
  const wireEvent = {
    kind: rumor.kind,
    tags: cloneTags(rumor.tags),
    content: rumor.content,
    created_at: rumor.created_at !== void 0 ? rumor.created_at : nowSeconds3()
  };
  const event = normalizeRumor(wireEvent, senderPubkey);
  return { event, wireEvent };
}
function normalizeRumor(event, pubkey) {
  const normalized = { ...event, pubkey };
  if (!isSerializableEvent(normalized)) throw new ValidationError("INVALID_RUMOR");
  return { ...normalized, id: getEventHash(normalized) };
}
function assertValidSignedEvent(event) {
  if (!isValidEvent(event)) {
    throw new ValidationError("INVALID_SIGNED_EVENT");
  }
  return event;
}
function readTag(event, name) {
  return event.tags?.find((tag) => tag[0] === name)?.[1] || "";
}
async function ownPrivateChannelPubkey(signer) {
  if (!signer?.getPublicKey) throw new ValidationError("PRIVATE_CHANNEL_SIGNER_REQUIRED");
  return signer.getPublicKey();
}
function assertWatching(channelPubkey) {
  if (!watchesByChannel.has(channelPubkey)) throw new Error("PRIVATE_MESSAGE_NOT_WATCHING");
}
function watchCallbacks(channelPubkey) {
  return watchesByChannel.get(channelPubkey)?.callbacks || {};
}
function dispatchWatchedEvent(event, outer, meta) {
  const callbacks = watchCallbacks(meta.channelPubkey);
  const payload = parseRumorContent(event);
  const message = { event, outer, meta, payload };
  if (event.kind === ASK_KIND) {
    callbacks.onAsk?.({ ...message, question: event });
  } else if (event.kind === REPLY_KIND) {
    const questionId = readTag(event, "q");
    callbacks.onReply?.({ ...message, questionId, reply: event });
  } else if (event.kind === TELL_KIND) {
    const receiverTag = readTag(event, "r");
    if (receiverTag) callbacks.onTell?.({ ...message, tell: event });
    else callbacks.onYell?.({ ...message, yell: event });
  }
  callbacks.onMessage?.(message);
}
function dispatchWatchedNymEvent(event, outer, meta) {
  const callbacks = watchCallbacks(meta.channelPubkey);
  callbacks.onNym?.({
    event,
    outer,
    meta,
    payload: parseRumorContent(event),
    nym: event
  });
}
function dispatchSeedEvent(seed) {
  watchCallbacks(seed.channelPubkey).onSeed?.(seed);
}
function dispatchContentKeyUsage(usage) {
  watchCallbacks(usage.channelPubkey).onContentKeyUsage?.(usage);
}
function handleChunk(chunk) {
  watchCallbacks(chunk.channelPubkey).onChunk?.(chunk);
}
function desiredRelayState() {
  const relayToChannels = /* @__PURE__ */ new Map();
  for (const [channelPubkey, watch2] of watchesByChannel) {
    for (const relay of watch2.relays) {
      if (!relayToChannels.has(relay)) relayToChannels.set(relay, /* @__PURE__ */ new Set());
      relayToChannels.get(relay).add(channelPubkey);
    }
  }
  return relayToChannels;
}
function signersForChannels(channels) {
  const out = {};
  for (const channel of channels) {
    const signer = watchesByChannel.get(channel)?.privateChannelSigner;
    if (signer) out[channel] = signer;
  }
  return out;
}
function readerSignersForChannels(channels) {
  const out = {};
  for (const channel of channels) {
    const signer = watchesByChannel.get(channel)?.privateChannelReaderSigner;
    if (signer) out[channel] = signer;
  }
  return out;
}
function readerPubkeysForChannels(channels) {
  const out = {};
  for (const channel of channels) {
    const pubkey = watchesByChannel.get(channel)?.privateChannelReaderPubkey;
    if (pubkey) out[channel] = pubkey;
  }
  return out;
}
function modesForChannels(channels) {
  const out = {};
  for (const channel of channels) out[channel] = watchesByChannel.get(channel)?.mode || "leecher";
  return out;
}
function maxWatchNumber(channels, field) {
  const values = channels.map((channel) => watchesByChannel.get(channel)?.[field]).filter((value) => Number.isFinite(value));
  return values.length ? Math.max(...values) : void 0;
}
function watchNumbersForChannels(channels, field) {
  const out = {};
  for (const channel of channels) {
    const value = watchesByChannel.get(channel)?.[field];
    if (Number.isFinite(value)) out[channel] = value;
  }
  return out;
}
function watchRevisionsForChannels(channels) {
  return Object.fromEntries(channels.map((channel) => [channel, watchesByChannel.get(channel)?.revision || 0]));
}
function doesSubscriptionMatch(current, channels) {
  if (!current || !areSetsEqual(current.channels, channels)) return false;
  for (const channel of channels) {
    if (current.revisions?.[channel] !== watchesByChannel.get(channel)?.revision) return false;
  }
  return true;
}
function firstWatchValue(channels, field) {
  for (const channel of channels) {
    const value = watchesByChannel.get(channel)?.[field];
    if (value !== void 0) return value;
  }
  return void 0;
}
function closeSubscription(sub, gracefulClose) {
  if (gracefulClose) {
    setTimeout(() => Promise.resolve().then(() => sub.close()).catch(() => {
    }), RESUBSCRIBE_GRACE_MS);
    return null;
  }
  try {
    return Promise.resolve(sub.close());
  } catch (err) {
    return Promise.reject(err);
  }
}
function rebuildSubscriptions({ _subscribe = subscribe2, gracefulClose = true } = {}) {
  const desired = desiredRelayState();
  const closing = [];
  for (const [relay, current] of subsByRelay) {
    const nextChannels = desired.get(relay);
    if (nextChannels && doesSubscriptionMatch(current, nextChannels)) continue;
    if (!nextChannels) {
      const close = closeSubscription(current.sub, gracefulClose);
      if (close) closing.push(close);
      subsByRelay.delete(relay);
    }
  }
  for (const [relay, channels] of desired) {
    const current = subsByRelay.get(relay);
    if (doesSubscriptionMatch(current, channels)) continue;
    const channelList = [...channels];
    const firstWatch = watchesByChannel.get(channelList[0]);
    const sub = _subscribe({
      receiverSigner: firstWatch.receiverSigner,
      iykcSigner: firstWatch.iykcSigner,
      privateChannelSigner: firstWatch.privateChannelSigner,
      privateChannelSignersByPubkey: signersForChannels(channelList),
      privateChannelReaderSigner: firstWatch.privateChannelReaderSigner,
      privateChannelReaderSignersByPubkey: readerSignersForChannels(channelList),
      privateChannelReaderPubkey: firstWatch.privateChannelReaderPubkey,
      privateChannelReaderPubkeysByPubkey: readerPubkeysForChannels(channelList),
      privateChannelPubkeys: channelList,
      receiverPubkey: firstWatch.receiverPubkey,
      relays: [relay],
      mode: firstWatch.mode,
      modeByPubkey: modesForChannels(channelList),
      receivedChunkTtlMs: maxWatchNumber(channelList, "receivedChunkTtlMs"),
      receivedChunkTtlMsByPubkey: watchNumbersForChannels(channelList, "receivedChunkTtlMs"),
      receivedChunkMaxBytes: maxWatchNumber(channelList, "receivedChunkMaxBytes"),
      receivedChunkIndexedDB: firstWatchValue(channelList, "receivedChunkIndexedDB"),
      ignoredGroupTtlMs: maxWatchNumber(channelList, "ignoredGroupTtlMs"),
      ignoredGroupMaxEntries: maxWatchNumber(channelList, "ignoredGroupMaxEntries"),
      limit: 0,
      since: nowSeconds3(),
      liveOnly: true,
      onChunk: handleChunk,
      onEvent: (event, outer, meta) => {
        dispatchWatchedEvent(event, outer, meta);
      },
      onNymEvent: (event, outer, meta) => {
        dispatchWatchedNymEvent(event, outer, meta);
      },
      onSeedEvent: (seed) => {
        dispatchSeedEvent(seed);
      },
      onContentKeyUsage: dispatchContentKeyUsage,
      onError: (err) => firstWatch.callbacks.onError?.(err)
    });
    subsByRelay.set(relay, {
      channels: new Set(channels),
      revisions: watchRevisionsForChannels(channelList),
      sub
    });
    if (current) {
      const close = closeSubscription(current.sub, gracefulClose);
      if (close) closing.push(close);
    }
  }
  return Promise.allSettled(closing);
}
async function watch({
  channels,
  relays,
  receiverSigner,
  iykcSigner,
  privateChannelSigner = receiverSigner,
  privateChannelReaderSigner = privateChannelSigner,
  privateChannelReaderPubkey,
  receiverPubkey,
  mode = "leecher",
  onAsk,
  onReply,
  onTell,
  onYell,
  onNym,
  onMessage,
  onSeed,
  onChunk,
  onContentKeyUsage,
  onError,
  receivedChunkTtlMs,
  receivedChunkMaxBytes,
  receivedChunkIndexedDB,
  ignoredGroupTtlMs,
  ignoredGroupMaxEntries,
  since = nowSeconds3(),
  _subscribe = subscribe2
}) {
  if (!relays?.length) throw new ValidationError("NO_RELAYS");
  const channelList = uniq3(channels?.length ? channels : [await ownPrivateChannelPubkey(privateChannelSigner)]);
  const ownPubkey = receiverPubkey || await receiverSigner?.getPublicKey?.();
  const callbacks = { onAsk, onReply, onTell, onYell, onNym, onMessage, onSeed, onChunk, onContentKeyUsage, onError };
  let changed = false;
  for (const channel of channelList) {
    const next = {
      relays: uniq3(relays),
      receiverSigner,
      iykcSigner,
      privateChannelSigner,
      privateChannelReaderSigner: privateChannelReaderSigner || privateChannelSigner,
      privateChannelReaderPubkey,
      receiverPubkey: ownPubkey,
      mode,
      receivedChunkTtlMs,
      receivedChunkMaxBytes,
      receivedChunkIndexedDB,
      ignoredGroupTtlMs,
      ignoredGroupMaxEntries,
      callbacks,
      since
    };
    const current = watchesByChannel.get(channel);
    const areSettingsEqual = Boolean(
      current && current.receiverSigner === next.receiverSigner && current.iykcSigner === next.iykcSigner && current.privateChannelSigner === next.privateChannelSigner && current.privateChannelReaderSigner === next.privateChannelReaderSigner && current.privateChannelReaderPubkey === next.privateChannelReaderPubkey && current.receiverPubkey === next.receiverPubkey && current.mode === next.mode && current.receivedChunkTtlMs === next.receivedChunkTtlMs && current.receivedChunkMaxBytes === next.receivedChunkMaxBytes && current.receivedChunkIndexedDB === next.receivedChunkIndexedDB && current.ignoredGroupTtlMs === next.ignoredGroupTtlMs && current.ignoredGroupMaxEntries === next.ignoredGroupMaxEntries
    );
    next.revision = areSettingsEqual ? current.revision : nextWatchRevision++;
    if (areSettingsEqual && areSetsEqual(new Set(current.relays), new Set(next.relays))) {
      current.callbacks = callbacks;
      continue;
    }
    watchesByChannel.set(channel, next);
    changed = true;
  }
  if (changed) await rebuildSubscriptions({ _subscribe });
  return () => unwatch(channelList);
}
function unwatch(channels) {
  const channelList = channels ? uniq3(Array.isArray(channels) ? channels : [channels]) : [...watchesByChannel.keys()];
  for (const channel of channelList) watchesByChannel.delete(channel);
  return rebuildSubscriptions({ gracefulClose: false });
}
function clearChannelState(channelPubkey) {
  if (watchesByChannel.has(channelPubkey)) return unwatch(channelPubkey);
  return Promise.resolve([]);
}
async function sendPrivateMessage({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  privateChannelReaderPubkey,
  receivers,
  receiverTag,
  event,
  relays,
  relayToReceivers,
  recoveryRelays,
  expirationSeconds,
  temporaryStorageArea,
  deletionPubkey,
  _getIykcProofs,
  _publish = publish
}) {
  if (!privateChannelSigner?.getPublicKey) throw new ValidationError("PRIVATE_CHANNEL_WRITER_REQUIRED");
  return _publish({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers, receiverTag, deletionPubkey, event, relays, relayToReceivers, recoveryRelays, expirationSeconds, temporaryStorageArea, _getIykcProofs });
}
async function sendNymMessage({
  nymSigner,
  privateChannelSigner,
  privateChannelReaderPubkey,
  event,
  relays,
  relayToReceivers,
  recoveryRelays,
  expirationSeconds,
  deletionPubkey,
  _publish = publishNymEvent
}) {
  if (!nymSigner?.getPublicKey) throw new ValidationError("NYM_SIGNER_REQUIRED");
  if (!privateChannelSigner?.getPublicKey) throw new ValidationError("PRIVATE_CHANNEL_WRITER_REQUIRED");
  return _publish({ nymSigner, privateChannelSigner, privateChannelReaderPubkey, deletionPubkey, event, relays, relayToReceivers, recoveryRelays, expirationSeconds });
}
async function ask({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  privateChannelReaderPubkey,
  receiverPubkey,
  relays,
  relayToReceivers,
  recoveryRelays,
  message,
  code,
  payload,
  error,
  content,
  expirationSeconds,
  temporaryStorageArea,
  _getIykcProofs,
  deletionPubkey,
  deletionSeckey,
  autoDeletionCapability = true,
  _publish = publish
}) {
  if (!receiverPubkey) throw new ValidationError("RECEIVER_PUBKEY_REQUIRED");
  if (!privateChannelSigner?.getPublicKey) throw new ValidationError("PRIVATE_CHANNEL_WRITER_REQUIRED");
  const privateChannelPubkey = await ownPrivateChannelPubkey(privateChannelSigner);
  assertWatching(privateChannelPubkey);
  const { event: question, wireEvent } = await makeOutgoingRumor({
    senderSigner,
    rumor: makeMessageRumor({
      kind: ASK_KIND,
      tags: [["r", receiverPubkey]],
      message: message || { code, payload, error, content }
    })
  });
  const deletion = resolveDeletionCapability({ deletionPubkey, deletionSeckey, autoDeletionCapability });
  const reports = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers: [receiverPubkey], receiverTag: receiverPubkey, deletionPubkey: deletion.deletionPubkey, event: wireEvent, relays, relayToReceivers, recoveryRelays, expirationSeconds, temporaryStorageArea, _getIykcProofs, _publish });
  return withDelivery({ question }, reports, deletion.deletionSeckey);
}
async function reply({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  privateChannelReaderPubkey,
  question,
  receiverPubkey = question?.pubkey,
  relays,
  relayToReceivers,
  recoveryRelays,
  message,
  code,
  payload,
  error,
  content,
  expirationSeconds,
  temporaryStorageArea,
  _getIykcProofs,
  deletionPubkey,
  deletionSeckey,
  autoDeletionCapability = true,
  _publish = publish
}) {
  if (!question?.id) throw new ValidationError("QUESTION_REQUIRED");
  if (!receiverPubkey) throw new ValidationError("RECEIVER_PUBKEY_REQUIRED");
  const { event, wireEvent } = await makeOutgoingRumor({
    senderSigner,
    rumor: makeMessageRumor({
      kind: REPLY_KIND,
      tags: [["q", question.id], ["r", receiverPubkey]],
      message: message || { code, payload, error, content }
    })
  });
  const deletion = resolveDeletionCapability({ deletionPubkey, deletionSeckey, autoDeletionCapability });
  const reports = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers: [receiverPubkey], receiverTag: receiverPubkey, deletionPubkey: deletion.deletionPubkey, event: wireEvent, relays, relayToReceivers, recoveryRelays, expirationSeconds, temporaryStorageArea, _getIykcProofs, _publish });
  return withDelivery({ reply: event }, reports, deletion.deletionSeckey);
}
async function tell({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  privateChannelReaderPubkey,
  receiverPubkey,
  relays,
  relayToReceivers,
  recoveryRelays,
  message,
  code,
  payload,
  error,
  content,
  expirationSeconds,
  temporaryStorageArea,
  _getIykcProofs,
  deletionPubkey,
  deletionSeckey,
  autoDeletionCapability = true,
  _publish = publish
}) {
  if (!receiverPubkey) throw new ValidationError("RECEIVER_PUBKEY_REQUIRED");
  const { event, wireEvent } = await makeOutgoingRumor({
    senderSigner,
    rumor: makeMessageRumor({
      kind: TELL_KIND,
      tags: [["r", receiverPubkey]],
      message: message || { code, payload, error, content }
    })
  });
  const deletion = resolveDeletionCapability({ deletionPubkey, deletionSeckey, autoDeletionCapability });
  const reports = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers: [receiverPubkey], receiverTag: receiverPubkey, deletionPubkey: deletion.deletionPubkey, event: wireEvent, relays, relayToReceivers, recoveryRelays, expirationSeconds, temporaryStorageArea, _getIykcProofs, _publish });
  return withDelivery({ tell: event }, reports, deletion.deletionSeckey);
}
async function yell({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  privateChannelReaderPubkey,
  receiverPubkeys: receiverPubkeys2,
  relays,
  relayToReceivers,
  recoveryRelays,
  message,
  code,
  payload,
  error,
  content,
  expirationSeconds,
  temporaryStorageArea,
  _getIykcProofs,
  deletionPubkey,
  deletionSeckey,
  autoDeletionCapability = true,
  _publish = publish
}) {
  const receivers = uniq3(receiverPubkeys2);
  if (!receivers.length) throw new ValidationError("NO_RECEIVERS");
  const { event, wireEvent } = await makeOutgoingRumor({
    senderSigner,
    rumor: makeMessageRumor({
      kind: TELL_KIND,
      tags: [],
      message: message || { code, payload, error, content }
    })
  });
  const deletion = resolveDeletionCapability({ deletionPubkey, deletionSeckey, autoDeletionCapability });
  const reports = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers, receiverTag: "", deletionPubkey: deletion.deletionPubkey, event: wireEvent, relays, relayToReceivers, recoveryRelays, expirationSeconds, temporaryStorageArea, _getIykcProofs, _publish });
  return withDelivery({ yell: event }, reports, deletion.deletionSeckey);
}
async function broadcastRumor({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  privateChannelReaderPubkey,
  receiverPubkeys: receiverPubkeys2,
  relays,
  relayToReceivers,
  recoveryRelays,
  rumor,
  expirationSeconds,
  temporaryStorageArea,
  _getIykcProofs,
  deletionPubkey,
  deletionSeckey,
  autoDeletionCapability = true,
  _publish = publish
}) {
  const receivers = uniq3(receiverPubkeys2);
  if (!receivers.length) throw new ValidationError("NO_RECEIVERS");
  const { event, wireEvent } = await makeOutgoingRumor({ senderSigner, rumor });
  const deletion = resolveDeletionCapability({ deletionPubkey, deletionSeckey, autoDeletionCapability });
  const reports = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers, receiverTag: "", deletionPubkey: deletion.deletionPubkey, event: wireEvent, relays, relayToReceivers, recoveryRelays, expirationSeconds, temporaryStorageArea, _getIykcProofs, _publish });
  return withDelivery({ rumor: event }, reports, deletion.deletionSeckey);
}
async function broadcastEvent({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  privateChannelReaderPubkey,
  receiverPubkeys: receiverPubkeys2,
  relays,
  relayToReceivers,
  recoveryRelays,
  event,
  expirationSeconds,
  temporaryStorageArea,
  _getIykcProofs,
  deletionPubkey,
  deletionSeckey,
  autoDeletionCapability = true,
  _publish = publish
}) {
  const receivers = uniq3(receiverPubkeys2);
  if (!receivers.length) throw new ValidationError("NO_RECEIVERS");
  const wireEvent = assertValidSignedEvent({ ...event, tags: cloneTags(event?.tags) });
  const deletion = resolveDeletionCapability({ deletionPubkey, deletionSeckey, autoDeletionCapability });
  const reports = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers, receiverTag: "", deletionPubkey: deletion.deletionPubkey, event: wireEvent, relays, relayToReceivers, recoveryRelays, expirationSeconds, temporaryStorageArea, _getIykcProofs, _publish });
  return withDelivery({ event: wireEvent }, reports, deletion.deletionSeckey);
}
async function broadcastNymRumor({
  nymSigner,
  privateChannelSigner,
  privateChannelReaderPubkey,
  relays,
  relayToReceivers,
  recoveryRelays,
  rumor,
  expirationSeconds,
  deletionPubkey,
  deletionSeckey,
  autoDeletionCapability = true,
  _publish = publishNymEvent
}) {
  if (!nymSigner?.getPublicKey) throw new ValidationError("NYM_SIGNER_REQUIRED");
  const { event, wireEvent } = await makeOutgoingRumor({ senderSigner: nymSigner, rumor });
  const deletion = resolveDeletionCapability({ deletionPubkey, deletionSeckey, autoDeletionCapability });
  const reports = await sendNymMessage({ nymSigner, privateChannelSigner, privateChannelReaderPubkey, deletionPubkey: deletion.deletionPubkey, event: wireEvent, relays, relayToReceivers, recoveryRelays, expirationSeconds, _publish });
  return withDelivery({ rumor: event }, reports, deletion.deletionSeckey);
}
async function broadcastNymEvent({
  nymSigner,
  privateChannelSigner,
  privateChannelReaderPubkey,
  relays,
  relayToReceivers,
  recoveryRelays,
  event,
  expirationSeconds,
  deletionPubkey,
  deletionSeckey,
  autoDeletionCapability = true,
  _publish = publishNymEvent
}) {
  if (!nymSigner?.getPublicKey) throw new ValidationError("NYM_SIGNER_REQUIRED");
  const wireEvent = assertValidSignedEvent({ ...event, tags: cloneTags(event?.tags) });
  const deletion = resolveDeletionCapability({ deletionPubkey, deletionSeckey, autoDeletionCapability });
  const reports = await sendNymMessage({ nymSigner, privateChannelSigner, privateChannelReaderPubkey, deletionPubkey: deletion.deletionPubkey, event: wireEvent, relays, relayToReceivers, recoveryRelays, expirationSeconds, _publish });
  return withDelivery({ event: wireEvent }, reports, deletion.deletionSeckey);
}

// node_modules/libp2r2p/idb-queue/index.js
var encoder6 = new TextEncoder();
var ITEMS_STORE = "items";
var STATE_STORE3 = "state";
var STATE_KEY = "queue";
var DEFAULT_EVICTION_HEADROOM_RATIO = 0.1;
var MAX_EVICTION_HEADROOM_BYTES = 64 * 1024;
function deferred4() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
function transactionDone3(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("IDB_TRANSACTION_ABORTED"));
    tx.onerror = () => reject(tx.error || new Error("IDB_TRANSACTION_FAILED"));
  });
}
function byteLength2(value) {
  return encoder6.encode(String(value)).length;
}
function normalizeEvictionPolicy(policy) {
  if (policy === "opposite-end" || policy === void 0 || policy === null) return "opposite-end";
  if (policy === "fifo" || policy === "head") return "head";
  if (policy === "lifo" || policy === "tail") return "tail";
  throw new ValidationError("QUEUE_INVALID_EVICTION_POLICY");
}
function normalizeState(value) {
  const head = Number.isSafeInteger(value?.head) ? value.head : 0;
  const tail = Number.isSafeInteger(value?.tail) && value.tail >= head ? value.tail : head;
  const usedBytes = Number.isSafeInteger(value?.usedBytes) && value.usedBytes >= 0 ? value.usedBytes : 0;
  return { head, tail, usedBytes };
}
function normalizeIndexes(indexes = {}) {
  if (!indexes || typeof indexes !== "object" || Array.isArray(indexes)) throw new ValidationError("QUEUE_INDEXES_INVALID");
  return Object.entries(indexes).map(([name, definition]) => {
    const options = typeof definition === "string" || Array.isArray(definition) ? { keyPath: definition } : definition;
    const keyPath = options?.keyPath;
    if (!name || !Array.isArray(keyPath) && typeof keyPath !== "string") throw new ValidationError("QUEUE_INDEX_INVALID");
    if (Array.isArray(keyPath) && keyPath.some((path) => typeof path !== "string" || !path)) throw new ValidationError("QUEUE_INDEX_INVALID");
    if (typeof keyPath === "string" && !keyPath) throw new ValidationError("QUEUE_INDEX_INVALID");
    if (options.multiEntry && Array.isArray(keyPath)) throw new ValidationError("QUEUE_INDEX_MULTI_ENTRY_COMPOUND");
    return {
      name,
      keyPath,
      storedKeyPath: Array.isArray(keyPath) ? keyPath.map((path) => `item.${path}`) : `item.${keyPath}`,
      unique: Boolean(options.unique),
      multiEntry: Boolean(options.multiEntry)
    };
  });
}
function areKeyPathsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function openDatabase3(indexedDB, name, version, onUpgrade) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = version === void 0 ? indexedDB.open(name) : indexedDB.open(name, version);
    } catch (err) {
      reject(err);
      return;
    }
    request.onerror = () => reject(request.error || new Error("IDB_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("IDB_DATABASE_BLOCKED"));
    request.onupgradeneeded = (event) => {
      try {
        onUpgrade(request.result, event.target.transaction);
      } catch (err) {
        try {
          event.target.transaction.abort();
        } catch {
        }
        reject(err);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
function ensureSchema(db, tx, indexDefinitions) {
  let items;
  if (!db.objectStoreNames.contains(ITEMS_STORE)) {
    items = db.createObjectStore(ITEMS_STORE, { keyPath: "position" });
  } else {
    items = tx.objectStore(ITEMS_STORE);
    if (!areKeyPathsEqual(items.keyPath, "position")) throw new Error("QUEUE_SCHEMA_MISMATCH");
  }
  if (!db.objectStoreNames.contains(STATE_STORE3)) {
    db.createObjectStore(STATE_STORE3, { keyPath: "key" });
  } else if (!areKeyPathsEqual(tx.objectStore(STATE_STORE3).keyPath, "key")) {
    throw new Error("QUEUE_SCHEMA_MISMATCH");
  }
  for (const definition of indexDefinitions) {
    if (!items.indexNames.contains(definition.name)) {
      items.createIndex(definition.name, definition.storedKeyPath, {
        unique: definition.unique,
        multiEntry: definition.multiEntry
      });
      continue;
    }
    const existing = items.index(definition.name);
    if (!areKeyPathsEqual(existing.keyPath, definition.storedKeyPath) || existing.unique !== definition.unique || existing.multiEntry !== definition.multiEntry) {
      throw new Error("QUEUE_INDEX_SCHEMA_MISMATCH");
    }
  }
}
async function inspectSchema(db, indexDefinitions) {
  if (!db.objectStoreNames.contains(ITEMS_STORE) || !db.objectStoreNames.contains(STATE_STORE3)) {
    return { missing: true, incompatible: false };
  }
  const tx = db.transaction([ITEMS_STORE, STATE_STORE3], "readonly");
  const done = transactionDone3(tx);
  const items = tx.objectStore(ITEMS_STORE);
  const state = tx.objectStore(STATE_STORE3);
  if (!areKeyPathsEqual(items.keyPath, "position") || !areKeyPathsEqual(state.keyPath, "key")) {
    await done;
    return { missing: false, incompatible: true };
  }
  let missing = false;
  for (const definition of indexDefinitions) {
    if (!items.indexNames.contains(definition.name)) {
      missing = true;
      continue;
    }
    const existing = items.index(definition.name);
    if (!areKeyPathsEqual(existing.keyPath, definition.storedKeyPath) || existing.unique !== definition.unique || existing.multiEntry !== definition.multiEntry) {
      await done;
      return { missing: false, incompatible: true };
    }
  }
  await done;
  return { missing, incompatible: false };
}
async function openQueueDatabase(indexedDB, prefix, indexDefinitions) {
  if (!indexedDB?.open) throw new Error("IDB_UNAVAILABLE");
  const name = `${prefix}:idb-queue`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const db = await openDatabase3(indexedDB, name, void 0, (nextDb, tx) => ensureSchema(nextDb, tx, indexDefinitions));
    const schema = await inspectSchema(db, indexDefinitions);
    if (schema.incompatible) {
      db.close();
      throw new Error("QUEUE_INDEX_SCHEMA_MISMATCH");
    }
    if (!schema.missing) return db;
    const version = db.version + 1;
    db.close();
    try {
      const upgraded = await openDatabase3(indexedDB, name, version, (nextDb, tx) => ensureSchema(nextDb, tx, indexDefinitions));
      const upgradedSchema = await inspectSchema(upgraded, indexDefinitions);
      if (upgradedSchema.incompatible || upgradedSchema.missing) {
        upgraded.close();
        throw new Error(upgradedSchema.incompatible ? "QUEUE_INDEX_SCHEMA_MISMATCH" : "QUEUE_SCHEMA_UPGRADE_FAILED");
      }
      return upgraded;
    } catch (err) {
      if (err?.name !== "VersionError" || attempt === 2) throw err;
    }
  }
  throw new Error("QUEUE_SCHEMA_UPGRADE_FAILED");
}
function itemForStorage(position, item) {
  const storedItem = { ...item };
  let byteSize = 0;
  let serialized = "";
  while (true) {
    serialized = JSON.stringify({ byteSize, item: storedItem });
    const nextByteSize = byteLength2(serialized);
    if (nextByteSize === byteSize) break;
    byteSize = nextByteSize;
  }
  return { position, byteSize, item: storedItem };
}
function assertIndex(index, length, { allowEnd = false } = {}) {
  const max = allowEnd ? length : length - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index > max) throw new ValidationError("QUEUE_INDEX_OUT_OF_RANGE");
}
function normalizeDirection(direction) {
  if (direction === void 0 || direction === "next") return "next";
  if (direction === "prev") return "prev";
  throw new ValidationError("QUEUE_INVALID_DIRECTION");
}
function isQuotaExceeded2(err) {
  return err?.name === "QuotaExceededError" || err?.name === "NS_ERROR_DOM_QUOTA_REACHED" || err?.code === 22 || err?.code === 1014 || /quota/i.test(err?.message || "");
}
async function createQueue({
  prefix,
  indexes = {},
  maxBytes,
  evictionPolicy = "opposite-end",
  indexedDB = globalThis.indexedDB
} = {}) {
  if (!prefix) throw new ValidationError("QUEUE_PREFIX_REQUIRED");
  const indexDefinitions = normalizeIndexes(indexes);
  const db = await openQueueDatabase(indexedDB, prefix, indexDefinitions);
  const configuredMaxBytes = Number.isSafeInteger(maxBytes) && maxBytes > 0 ? maxBytes : Infinity;
  const configuredEvictionPolicy = normalizeEvictionPolicy(evictionPolicy);
  const waiters = /* @__PURE__ */ new Set();
  let sessionMaxBytes = configuredMaxBytes;
  let revision = 0;
  let closed = false;
  let activeTransactions = 0;
  let closePromise = null;
  const closeWaiters = /* @__PURE__ */ new Set();
  function hasByteLimit() {
    return Number.isFinite(sessionMaxBytes);
  }
  function evictionDirectionFor(operation, { index = 0, length = 0 } = {}) {
    if (configuredEvictionPolicy === "head") return "head";
    if (configuredEvictionPolicy === "tail") return "tail";
    if (operation === "unshift") return "tail";
    if (operation === "setAt" || operation === "insertAt") return index <= length / 2 ? "tail" : "head";
    return "head";
  }
  function evictionHeadroomBytes() {
    if (!hasByteLimit()) return 0;
    return Math.min(Math.max(1, Math.floor(sessionMaxBytes * DEFAULT_EVICTION_HEADROOM_RATIO)), MAX_EVICTION_HEADROOM_BYTES);
  }
  function targetBytesAfterWrite(requiredBytes) {
    if (!hasByteLimit()) return Infinity;
    return Math.max(requiredBytes, sessionMaxBytes - evictionHeadroomBytes());
  }
  function lowerSessionMaxBytes(requiredBytes) {
    if (!hasByteLimit()) return;
    const next = Math.max(requiredBytes, Math.floor(sessionMaxBytes * 0.8));
    if (next < sessionMaxBytes) sessionMaxBytes = next;
  }
  function wake() {
    revision++;
    for (const resolve of waiters) resolve();
    waiters.clear();
  }
  async function waitForChange(knownRevision) {
    if (revision !== knownRevision) return;
    await new Promise((resolve) => waiters.add(resolve));
  }
  async function transaction3(mode, work) {
    if (closed) throw new Error("QUEUE_CLOSED");
    activeTransactions++;
    try {
      const tx = db.transaction([ITEMS_STORE, STATE_STORE3], mode);
      const done = transactionDone3(tx);
      try {
        const value = await work(tx);
        await done;
        return value;
      } catch (err) {
        try {
          tx.abort();
        } catch {
        }
        try {
          await done;
        } catch {
        }
        throw err;
      }
    } finally {
      activeTransactions--;
      if (!activeTransactions) {
        for (const resolve of closeWaiters) resolve();
        closeWaiters.clear();
      }
    }
  }
  async function readState(tx) {
    const { result } = await run("get", [STATE_KEY], STATE_STORE3, null, { tx });
    return normalizeState(result);
  }
  async function writeState(tx, state) {
    if (state.head >= state.tail) {
      await run("delete", [STATE_KEY], STATE_STORE3, null, { tx });
      return;
    }
    await run("put", [{ key: STATE_KEY, ...state }], STATE_STORE3, null, { tx });
  }
  async function allRecords(tx) {
    const { result } = await run("getAll", [], ITEMS_STORE, null, { tx });
    return result.sort((a, b) => a.position - b.position);
  }
  async function recordsForState(tx, state) {
    const records = await allRecords(tx);
    return records.filter((record) => record.position >= state.head && record.position < state.tail);
  }
  function applyBounds(state, records) {
    if (!records.length) {
      state.head = 0;
      state.tail = 0;
      state.usedBytes = 0;
      return;
    }
    state.head = records[0].position;
    state.tail = records[records.length - 1].position + 1;
    state.usedBytes = records.reduce((total, record) => total + (record.byteSize || 0), 0);
  }
  function extendBounds(state, position) {
    if (state.head >= state.tail) {
      state.head = position;
      state.tail = position + 1;
      return;
    }
    state.head = Math.min(state.head, position);
    state.tail = Math.max(state.tail, position + 1);
  }
  async function getRecord(tx, position) {
    return run("get", [position], ITEMS_STORE, null, { tx }).then((value) => value.result || null);
  }
  async function putRecord(tx, record) {
    await run("put", [record], ITEMS_STORE, null, { tx });
  }
  async function deleteRecord(tx, position) {
    await run("delete", [position], ITEMS_STORE, null, { tx });
  }
  async function nextCursor(cursor, p) {
    Object.assign(p, deferred4());
    cursor.continue();
    return (await p.promise).result;
  }
  async function storedRecordAtEnd(tx, state, direction, excludedPositions = /* @__PURE__ */ new Set()) {
    const p = deferred4();
    const args = direction === "tail" ? [void 0, "prev"] : [];
    let cursor = (await run("openCursor", args, ITEMS_STORE, null, { tx, p })).result;
    while (cursor) {
      const record = cursor.value;
      if (record.position < state.head) {
        if (direction === "tail") return null;
      } else if (record.position >= state.tail) {
        if (direction === "head") return null;
      } else if (!excludedPositions.has(record.position)) {
        return record;
      }
      cursor = await nextCursor(cursor, p);
    }
    return null;
  }
  async function trimBounds(tx, state, protectedPositions = /* @__PURE__ */ new Set()) {
    const headRecord = await storedRecordAtEnd(tx, state, "head");
    const tailRecord = await storedRecordAtEnd(tx, state, "tail");
    let head = headRecord?.position ?? Infinity;
    let tail = tailRecord?.position ?? -Infinity;
    for (const position of protectedPositions) {
      if (!Number.isSafeInteger(position) || position < state.head || position >= state.tail) continue;
      head = Math.min(head, position);
      tail = Math.max(tail, position);
    }
    if (head === Infinity) {
      state.head = 0;
      state.tail = 0;
      state.usedBytes = 0;
      return;
    }
    state.head = head;
    state.tail = tail + 1;
  }
  async function evictOne(tx, state, { direction, protectedPositions = /* @__PURE__ */ new Set() } = {}) {
    const record = await storedRecordAtEnd(tx, state, direction, protectedPositions);
    if (!record) return false;
    await deleteRecord(tx, record.position);
    state.usedBytes = Math.max(0, state.usedBytes - (record.byteSize || 0));
    await trimBounds(tx, state, protectedPositions);
    return true;
  }
  async function evictToFit(tx, state, requiredBytes, options = {}) {
    if (!hasByteLimit()) return;
    if (requiredBytes > sessionMaxBytes) throw new Error("QUEUE_ITEM_TOO_LARGE");
    const targetBytes = targetBytesAfterWrite(requiredBytes);
    while (state.usedBytes + requiredBytes > targetBytes) {
      if (!await evictOne(tx, state, options)) break;
    }
    if (state.usedBytes + requiredBytes > sessionMaxBytes) throw new Error("QUEUE_CAPACITY_EXCEEDED");
  }
  async function evictToBytes(tx, state, targetBytes, options = {}) {
    if (!hasByteLimit()) return;
    while (state.usedBytes > targetBytes) {
      if (!await evictOne(tx, state, options)) break;
    }
  }
  async function putItem(tx, state, position, item, options = {}) {
    const previous = await getRecord(tx, position);
    const stored = itemForStorage(position, item);
    const previousByteSize = previous?.byteSize || 0;
    const delta = stored.byteSize - previousByteSize;
    if (hasByteLimit() && stored.byteSize > sessionMaxBytes) throw new Error("QUEUE_ITEM_TOO_LARGE");
    if (delta > 0) await evictToFit(tx, state, delta, options);
    await putRecord(tx, stored);
    state.usedBytes = Math.max(0, state.usedBytes - previousByteSize + stored.byteSize);
    extendBounds(state, position);
    return stored;
  }
  async function pushInTransaction(tx, state, item) {
    const direction = evictionDirectionFor("push");
    let position = state.tail;
    let stored = itemForStorage(position, item);
    if (hasByteLimit() && stored.byteSize > sessionMaxBytes) throw new Error("QUEUE_ITEM_TOO_LARGE");
    await evictToFit(tx, state, stored.byteSize, { direction });
    position = state.tail;
    stored = itemForStorage(position, item);
    await putRecord(tx, stored);
    if (state.head >= state.tail) state.head = position;
    state.tail = position + 1;
    state.usedBytes += stored.byteSize;
    return state.tail - state.head;
  }
  async function unshiftInTransaction(tx, state, item) {
    const direction = evictionDirectionFor("unshift");
    let position = state.head - 1;
    let stored = itemForStorage(position, item);
    if (hasByteLimit() && stored.byteSize > sessionMaxBytes) throw new Error("QUEUE_ITEM_TOO_LARGE");
    await evictToFit(tx, state, stored.byteSize, { direction });
    position = state.head - 1;
    stored = itemForStorage(position, item);
    await putRecord(tx, stored);
    if (state.head >= state.tail) state.tail = position + 1;
    state.head = position;
    state.usedBytes += stored.byteSize;
    return state.tail - state.head;
  }
  async function insertAtInTransaction(tx, state, index, item) {
    const length = state.tail - state.head;
    assertIndex(index, length, { allowEnd: true });
    let slot = state.head + index;
    let stored = itemForStorage(slot, item);
    if (hasByteLimit() && stored.byteSize > sessionMaxBytes) throw new Error("QUEUE_ITEM_TOO_LARGE");
    await evictToFit(tx, state, stored.byteSize, { direction: evictionDirectionFor("insertAt", { index, length }) });
    const nextLength = state.tail - state.head;
    const nextIndex = Math.min(index, nextLength);
    slot = state.head + nextIndex;
    stored = itemForStorage(slot, item);
    if (hasByteLimit() && stored.byteSize > sessionMaxBytes) throw new Error("QUEUE_ITEM_TOO_LARGE");
    await evictToFit(tx, state, stored.byteSize, { direction: evictionDirectionFor("insertAt", { index: nextIndex, length: nextLength }) });
    const records = await recordsForState(tx, state);
    for (const record of [...records].reverse()) {
      if (record.position < slot) continue;
      await putRecord(tx, { ...record, position: record.position + 1 });
      await deleteRecord(tx, record.position);
    }
    if (state.head >= state.tail) state.head = slot;
    state.tail++;
    await putRecord(tx, stored);
    state.usedBytes += stored.byteSize;
    return nextIndex;
  }
  async function removeAtInTransaction(tx, state, index) {
    const length = state.tail - state.head;
    assertIndex(index, length);
    const slot = state.head + index;
    const removed = await getRecord(tx, slot);
    const records = await recordsForState(tx, state);
    await deleteRecord(tx, slot);
    for (const record of records) {
      if (record.position <= slot) continue;
      await putRecord(tx, { ...record, position: record.position - 1 });
      await deleteRecord(tx, record.position);
    }
    const oldTail = state.tail;
    state.tail--;
    await deleteRecord(tx, oldTail - 1);
    state.usedBytes = Math.max(0, state.usedBytes - (removed?.byteSize || 0));
    applyBounds(state, await recordsForState(tx, { head: state.head, tail: state.tail, usedBytes: state.usedBytes }));
    return removed?.item || null;
  }
  async function mutate2(operation, { requiredBytes = 0, wakeWaiters = false } = {}) {
    let retried = false;
    while (true) {
      try {
        const value = await transaction3("readwrite", async (tx) => {
          const state = await readState(tx);
          const result = await operation(tx, state);
          await writeState(tx, state);
          return result;
        });
        if (wakeWaiters) wake();
        return value;
      } catch (err) {
        if (retried || !hasByteLimit() || !isQuotaExceeded2(err)) throw err;
        lowerSessionMaxBytes(requiredBytes);
        retried = true;
      }
    }
  }
  async function snapshot(select) {
    return transaction3("readonly", async (tx) => select(tx));
  }
  async function push(item) {
    const requiredBytes = itemForStorage(0, item).byteSize;
    return mutate2((tx, state) => pushInTransaction(tx, state, item), { requiredBytes, wakeWaiters: true });
  }
  async function unshift(item) {
    const requiredBytes = itemForStorage(0, item).byteSize;
    return mutate2((tx, state) => unshiftInTransaction(tx, state, item), { requiredBytes, wakeWaiters: true });
  }
  async function shift() {
    return mutate2(async (tx, state) => {
      while (state.head < state.tail) {
        const position = state.head;
        state.head++;
        const stored = await getRecord(tx, position);
        await deleteRecord(tx, position);
        if (!stored?.item) continue;
        state.usedBytes = Math.max(0, state.usedBytes - (stored.byteSize || 0));
        return stored.item;
      }
      state.usedBytes = 0;
      return null;
    });
  }
  async function pop() {
    return mutate2(async (tx, state) => {
      while (state.tail > state.head) {
        const position = state.tail - 1;
        state.tail--;
        const stored = await getRecord(tx, position);
        await deleteRecord(tx, position);
        if (!stored?.item) continue;
        state.usedBytes = Math.max(0, state.usedBytes - (stored.byteSize || 0));
        return stored.item;
      }
      state.usedBytes = 0;
      return null;
    });
  }
  async function setAt(index, item) {
    const requiredBytes = itemForStorage(0, item).byteSize;
    return mutate2(async (tx, state) => {
      const length = state.tail - state.head;
      assertIndex(index, length);
      const position = state.head + index;
      await putItem(tx, state, position, item, {
        direction: evictionDirectionFor("setAt", { index, length }),
        protectedPositions: /* @__PURE__ */ new Set([position])
      });
      return index;
    }, { requiredBytes, wakeWaiters: true });
  }
  async function insertAt(index, item) {
    const requiredBytes = itemForStorage(0, item).byteSize;
    return mutate2((tx, state) => insertAtInTransaction(tx, state, index, item), { requiredBytes, wakeWaiters: true });
  }
  async function insertWhere(predicate, item, { appendIfMissing = false } = {}) {
    if (typeof predicate !== "function") throw new ValidationError("QUEUE_PREDICATE_REQUIRED");
    const requiredBytes = itemForStorage(0, item).byteSize;
    return mutate2(async (tx, state) => {
      const records = await recordsForState(tx, state);
      const byPosition = new Map(records.map((record) => [record.position, record]));
      const length = state.tail - state.head;
      for (let index = 0; index < length; index++) {
        const record = byPosition.get(state.head + index);
        if (record?.item && predicate(record.item, index)) return insertAtInTransaction(tx, state, index, item);
      }
      if (appendIfMissing) return insertAtInTransaction(tx, state, length, item);
      return null;
    }, { requiredBytes, wakeWaiters: true });
  }
  async function removeAt(index) {
    return mutate2((tx, state) => removeAtInTransaction(tx, state, index), { wakeWaiters: true });
  }
  async function removeWhere(predicate) {
    if (typeof predicate !== "function") throw new ValidationError("QUEUE_PREDICATE_REQUIRED");
    return mutate2(async (tx, state) => {
      const records = await recordsForState(tx, state);
      const removed = /* @__PURE__ */ new Set();
      for (const record of records) {
        let matches = false;
        try {
          matches = Boolean(predicate(record.item));
        } catch {
          matches = true;
        }
        if (!matches) continue;
        removed.add(record.position);
        await deleteRecord(tx, record.position);
      }
      if (removed.size) applyBounds(state, records.filter((record) => !removed.has(record.position)));
    });
  }
  async function some(predicate) {
    if (typeof predicate !== "function") throw new ValidationError("QUEUE_PREDICATE_REQUIRED");
    return snapshot(async (tx) => {
      const state = await readState(tx);
      const records = await recordsForState(tx, state);
      return records.some((record) => predicate(record.item));
    });
  }
  async function clear() {
    return mutate2(async (tx, state) => {
      await run("clear", [], ITEMS_STORE, null, { tx });
      state.head = 0;
      state.tail = 0;
      state.usedBytes = 0;
    });
  }
  async function getBy(indexName, query) {
    return snapshot(async (tx) => {
      const { result } = await run("get", [query], ITEMS_STORE, indexName, { tx });
      return result?.item || null;
    });
  }
  async function someBy(indexName, query) {
    return snapshot(async (tx) => {
      const { result } = await run("getKey", [query], ITEMS_STORE, indexName, { tx });
      return result !== void 0;
    });
  }
  async function removeBy(indexName, query) {
    return mutate2(async (tx, state) => {
      const { result } = await run("getAll", [query], ITEMS_STORE, indexName, { tx });
      for (const record of result) await deleteRecord(tx, record.position);
      if (result.length) {
        const removedBytes = result.reduce((total, record) => total + (record.byteSize || 0), 0);
        state.usedBytes = Math.max(0, state.usedBytes - removedBytes);
        await trimBounds(tx, state);
      }
      return result.map((record) => record.item);
    });
  }
  async function snapshotStoredItems() {
    return snapshot(async (tx) => {
      const state = await readState(tx);
      return recordsForState(tx, state);
    });
  }
  async function* items() {
    while (true) {
      const knownRevision = revision;
      const item = await shift();
      if (item) {
        yield item;
      } else {
        await waitForChange(knownRevision);
      }
    }
  }
  async function* reverseItems() {
    while (true) {
      const knownRevision = revision;
      const item = await pop();
      if (item) {
        yield item;
      } else {
        await waitForChange(knownRevision);
      }
    }
  }
  async function* storedItems() {
    for (const record of await snapshotStoredItems()) yield record.item;
  }
  async function* reverseStoredItems() {
    for (const record of (await snapshotStoredItems()).reverse()) yield record.item;
  }
  function close() {
    if (closePromise) return closePromise;
    closed = true;
    wake();
    closePromise = (activeTransactions ? new Promise((resolve) => closeWaiters.add(resolve)) : Promise.resolve()).then(() => {
      db.close();
    });
    return closePromise;
  }
  async function* storedItemsBy(indexName, query, { direction = "next" } = {}) {
    direction = normalizeDirection(direction);
    const records = await snapshot(async (tx) => {
      const { result } = await run("getAll", [query], ITEMS_STORE, indexName, { tx });
      return result;
    });
    if (direction === "prev") records.reverse();
    for (const record of records) yield record.item;
  }
  await mutate2(async (tx, state) => {
    const records = await allRecords(tx);
    applyBounds(state, records);
    if (hasByteLimit()) {
      await evictToBytes(tx, state, Math.min(sessionMaxBytes, targetBytesAfterWrite(0)), {
        direction: evictionDirectionFor("recover")
      });
    }
  });
  return {
    enqueue: push,
    push,
    pop,
    unshift,
    shift,
    items,
    reverseItems,
    storedItems,
    reverseStoredItems,
    setAt,
    insertAt,
    insertWhere,
    removeAt,
    removeWhere,
    some,
    clear,
    getBy,
    someBy,
    removeBy,
    storedItemsBy,
    close
  };
}

// node_modules/libp2r2p/private-messenger/services/channel-state.js
var DATABASE_VERSION3 = 1;
var CHANNELS_STORE = "channels";
function deferred5() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
function transactionDone4(tx) {
  const pending = deferred5();
  tx.oncomplete = () => pending.resolve();
  tx.onabort = () => pending.reject(tx.error || new Error("IDB_TRANSACTION_ABORTED"));
  tx.onerror = () => pending.reject(tx.error || new Error("IDB_TRANSACTION_FAILED"));
  return pending.promise;
}
function openDatabase4(indexedDB, name) {
  if (!indexedDB?.open) return Promise.reject(new Error("IDB_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION3);
    request.onerror = () => reject(request.error || new Error("IDB_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("IDB_DATABASE_BLOCKED"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHANNELS_STORE)) {
        db.createObjectStore(CHANNELS_STORE, { keyPath: "pubkey" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
async function transaction2(db, mode, work) {
  const tx = db.transaction([CHANNELS_STORE], mode);
  const done = transactionDone4(tx);
  try {
    const result = await work(tx);
    await done;
    return result;
  } catch (err) {
    try {
      tx.abort();
    } catch {
    }
    try {
      await done;
    } catch {
    }
    throw err;
  }
}
function cloneChannels(channels) {
  return structuredClone(channels || {});
}
async function createChannelStateStore({ prefix, indexedDB = globalThis.indexedDB } = {}) {
  if (!prefix) throw new ValidationError("PRIVATE_MESSENGER_STATE_PREFIX_REQUIRED");
  const db = await openDatabase4(indexedDB, `${prefix}:state:idb`);
  let closed = false;
  let activeTransactions = 0;
  let closePromise = null;
  const closeWaiters = /* @__PURE__ */ new Set();
  async function runTransaction(mode, work) {
    if (closed) throw new Error("PRIVATE_MESSENGER_STATE_CLOSED");
    activeTransactions++;
    try {
      return await transaction2(db, mode, work);
    } finally {
      activeTransactions--;
      if (!activeTransactions) {
        for (const resolve of closeWaiters) resolve();
        closeWaiters.clear();
      }
    }
  }
  async function load() {
    return runTransaction("readonly", async (tx) => {
      const records = (await run("getAll", [], CHANNELS_STORE, null, { tx })).result;
      return Object.fromEntries(records.filter((record) => typeof record?.pubkey === "string" && record.pubkey).map(({ pubkey, value }) => [pubkey, value && typeof value === "object" ? value : {}]));
    });
  }
  async function update2(channels, removedPubkeys = []) {
    const snapshot = cloneChannels(channels);
    const removals = [...new Set(removedPubkeys || [])];
    await runTransaction("readwrite", async (tx) => {
      for (const pubkey of removals) await run("delete", [pubkey], CHANNELS_STORE, null, { tx });
      for (const [pubkey, value] of Object.entries(snapshot)) {
        await run("put", [{ pubkey, value }], CHANNELS_STORE, null, { tx });
      }
    });
  }
  async function touch(pubkeys, lastWatchedAt) {
    const uniquePubkeys3 = [...new Set(pubkeys || [])];
    if (!uniquePubkeys3.length) return;
    await runTransaction("readwrite", async (tx) => {
      for (const pubkey of uniquePubkeys3) {
        const current = (await run("get", [pubkey], CHANNELS_STORE, null, { tx })).result;
        await run("put", [{
          pubkey,
          value: {
            ...current?.value && typeof current.value === "object" ? current.value : {},
            lastWatchedAt
          }
        }], CHANNELS_STORE, null, { tx });
      }
    });
  }
  function close() {
    if (closePromise) return closePromise;
    closed = true;
    closePromise = (activeTransactions ? new Promise((resolve) => closeWaiters.add(resolve)) : Promise.resolve()).then(() => {
      db.close();
    });
    return closePromise;
  }
  return { load, update: update2, touch, close };
}

// node_modules/libp2r2p/private-messenger/constants/index.js
var DEFAULT_STALE_CHANNEL_SECONDS = 45 * 24 * 60 * 60;

// node_modules/libp2r2p/private-messenger/services/storage-maintenance.js
var REGISTRY_DATABASE = "libp2r2p:private-messenger:registry:idb";
var REGISTRY_VERSION = 1;
var STORAGE_SETS_STORE = "storageSets";
var LEASES_STORE = "leases";
var LOCK_NAME = "libp2r2p:private-messenger:storage-maintenance";
var LEASE_MS = 2 * 60 * 60 * 1e3;
var DEFAULT_IDENTITY_STORAGE_RETENTION_SECONDS = 60 * 24 * 60 * 60;
var MAX_RETENTION_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1e3);
var MAX_RETRY_MS = 5 * 60 * 1e3;
var localLocks = /* @__PURE__ */ new WeakMap();
var retryTimers = /* @__PURE__ */ new WeakMap();
function transactionDone5(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("IDB_TRANSACTION_ABORTED"));
    tx.onerror = () => reject(tx.error || new Error("IDB_TRANSACTION_FAILED"));
  });
}
function openRegistry(indexedDB) {
  if (!indexedDB?.open) return Promise.reject(new Error("IDB_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REGISTRY_DATABASE, REGISTRY_VERSION);
    request.onerror = () => reject(request.error || new Error("IDB_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("IDB_DATABASE_BLOCKED"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORAGE_SETS_STORE)) {
        db.createObjectStore(STORAGE_SETS_STORE, { keyPath: "userPubkey" });
      }
      if (!db.objectStoreNames.contains(LEASES_STORE)) {
        const leases = db.createObjectStore(LEASES_STORE, { keyPath: "key" });
        leases.createIndex("byUserPubkey", "userPubkey");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
async function withRegistryTransaction(indexedDB, mode, work) {
  const db = await openRegistry(indexedDB);
  try {
    const tx = db.transaction([STORAGE_SETS_STORE, LEASES_STORE], mode);
    const done = transactionDone5(tx);
    try {
      const result = await work(tx);
      await done;
      return result;
    } catch (err) {
      try {
        tx.abort();
      } catch {
      }
      try {
        await done;
      } catch {
      }
      throw err;
    }
  } finally {
    db.close();
  }
}
function leaseKey(userPubkey, leaseId) {
  return `${userPubkey}:${leaseId}`;
}
async function readLeases(tx, userPubkey) {
  const keyRange = globalThis.IDBKeyRange;
  const records = keyRange?.only ? (await run("getAll", [keyRange.only(userPubkey)], LEASES_STORE, "byUserPubkey", { tx })).result : (await run("getAll", [], LEASES_STORE, null, { tx })).result;
  return records.filter((record) => record?.userPubkey === userPubkey);
}
function normalizeRetentionSeconds(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_RETENTION_SECONDS ? value : fallback;
}
function normalizeActiveChannelPubkeys(values) {
  return [...new Set((values || []).filter((value) => typeof value === "string" && value))].sort();
}
async function refreshLeaseState(tx, storageSet, now, { removeExpired = false } = {}) {
  const leases = await readLeases(tx, storageSet.userPubkey);
  let leaseUntil = 0;
  const activeChannelPubkeys = /* @__PURE__ */ new Set();
  for (const lease of leases) {
    const expiresAt = Math.max(0, Number(lease.leaseUntil) || 0);
    if (expiresAt <= now) {
      if (removeExpired) await run("delete", [lease.key], LEASES_STORE, null, { tx });
      continue;
    }
    leaseUntil = Math.max(leaseUntil, expiresAt);
    for (const pubkey of normalizeActiveChannelPubkeys(lease.activeChannelPubkeys)) {
      activeChannelPubkeys.add(pubkey);
    }
  }
  storageSet.leaseUntil = leaseUntil;
  return {
    leaseUntil,
    activeChannelPubkeys: [...activeChannelPubkeys].sort()
  };
}
function normalizeStorageSet(record) {
  if (!record?.userPubkey) return null;
  return {
    userPubkey: String(record.userPubkey),
    lastUsedAt: Math.max(0, Number(record.lastUsedAt) || 0),
    leaseUntil: Math.max(0, Number(record.leaseUntil) || 0),
    status: record.status === "delete_pending" ? "delete_pending" : "ready",
    attempts: Math.max(0, Math.floor(Number(record.attempts) || 0)),
    nextAttemptAt: Math.max(0, Number(record.nextAttemptAt) || 0),
    staleChannelSeconds: normalizeRetentionSeconds(
      record.staleChannelSeconds,
      DEFAULT_STALE_CHANNEL_SECONDS
    ),
    identityStorageRetentionSeconds: normalizeRetentionSeconds(
      record.identityStorageRetentionSeconds,
      DEFAULT_IDENTITY_STORAGE_RETENTION_SECONDS
    ),
    policyRevision: Math.max(0, Math.floor(Number(record.policyRevision) || 0))
  };
}
function storagePolicy(storageSet) {
  return {
    staleChannelSeconds: storageSet.staleChannelSeconds,
    identityStorageRetentionSeconds: storageSet.identityStorageRetentionSeconds,
    policyRevision: storageSet.policyRevision
  };
}
function withLocalLock(indexedDB, work) {
  const prior = localLocks.get(indexedDB) || Promise.resolve();
  const next = prior.catch(() => {
  }).then(work);
  localLocks.set(indexedDB, next.catch(() => {
  }));
  return next;
}
function withMaintenanceLock(indexedDB, work) {
  if (!indexedDB?.open) return Promise.reject(new Error("IDB_UNAVAILABLE"));
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request === "function") return locks.request(LOCK_NAME, work);
  return withLocalLock(indexedDB, work);
}
function storageDatabaseNames(userPubkey) {
  const prefix = `libp2r2p:private-messenger:${userPubkey}`;
  return [
    `${prefix}:idb-queue`,
    `${prefix}:seeds:idb-queue`,
    `${prefix}:state:idb`
  ];
}
function deleteDatabase(indexedDB, name) {
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.deleteDatabase(name);
    } catch {
      resolve(false);
      return;
    }
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => {
    };
  });
}
async function deleteStorageSet(indexedDB, userPubkey) {
  const results = await Promise.all(storageDatabaseNames(userPubkey).map((name) => deleteDatabase(indexedDB, name)));
  return results.every(Boolean);
}
function retryDelay(attempts) {
  return Math.min(MAX_RETRY_MS, 1e3 * 2 ** Math.min(9, Math.max(0, attempts - 1)));
}
async function markAndListDueStorageSets(indexedDB, now) {
  return withRegistryTransaction(indexedDB, "readwrite", async (tx) => {
    const records = (await run("getAll", [], STORAGE_SETS_STORE, null, { tx })).result;
    const due = [];
    for (const raw of records) {
      const storageSet = normalizeStorageSet(raw);
      if (!storageSet) continue;
      await refreshLeaseState(tx, storageSet, now, { removeExpired: true });
      const leaseActive = storageSet.leaseUntil > now;
      const retentionMs = storageSet.identityStorageRetentionSeconds * 1e3;
      const expired = storageSet.lastUsedAt + retentionMs <= now;
      if (leaseActive || !expired) {
        storageSet.status = "ready";
        storageSet.attempts = 0;
        storageSet.nextAttemptAt = 0;
      } else if (storageSet.status === "ready") {
        storageSet.status = "delete_pending";
        storageSet.attempts = 0;
        storageSet.nextAttemptAt = now;
      }
      await run("put", [storageSet], STORAGE_SETS_STORE, null, { tx });
      if (storageSet.status === "delete_pending" && !leaseActive && storageSet.nextAttemptAt <= now) {
        due.push(storageSet);
      }
    }
    return due;
  });
}
async function finishDeleteAttempt(indexedDB, attempted, deleted, now) {
  return withRegistryTransaction(indexedDB, "readwrite", async (tx) => {
    const current = normalizeStorageSet((await run("get", [attempted.userPubkey], STORAGE_SETS_STORE, null, { tx })).result);
    if (!current || current.status !== "delete_pending") return false;
    await refreshLeaseState(tx, current, now, { removeExpired: true });
    if (current.leaseUntil > now) {
      current.status = "ready";
      current.attempts = 0;
      current.nextAttemptAt = 0;
      await run("put", [current], STORAGE_SETS_STORE, null, { tx });
      return false;
    }
    if (deleted) {
      for (const lease of await readLeases(tx, attempted.userPubkey)) {
        await run("delete", [lease.key], LEASES_STORE, null, { tx });
      }
      await run("delete", [attempted.userPubkey], STORAGE_SETS_STORE, null, { tx });
      return true;
    }
    current.attempts++;
    current.nextAttemptAt = now + retryDelay(current.attempts);
    await run("put", [current], STORAGE_SETS_STORE, null, { tx });
    return false;
  });
}
async function maintainRegistry(indexedDB, now) {
  const due = await markAndListDueStorageSets(indexedDB, now);
  for (const storageSet of due) {
    const deleted = await deleteStorageSet(indexedDB, storageSet.userPubkey);
    await finishDeleteAttempt(indexedDB, storageSet, deleted, now);
  }
  const nextAttemptAt = await withRegistryTransaction(indexedDB, "readonly", async (tx) => {
    const records = (await run("getAll", [], STORAGE_SETS_STORE, null, { tx })).result;
    let earliest = Infinity;
    for (const raw of records) {
      const storageSet = normalizeStorageSet(raw);
      if (storageSet?.status !== "delete_pending" || storageSet.leaseUntil > now) continue;
      earliest = Math.min(earliest, storageSet.nextAttemptAt);
    }
    return Number.isFinite(earliest) ? earliest : null;
  });
  return { processed: due.length, nextAttemptAt };
}
function schedulePendingRetry(indexedDB, temporaryStorageArea, nextAttemptAt, now) {
  const previous = retryTimers.get(indexedDB);
  if (previous) clearTimeout(previous);
  if (nextAttemptAt === null) {
    retryTimers.delete(indexedDB);
    return;
  }
  const timer = setTimeout(() => {
    retryTimers.delete(indexedDB);
    maintainPrivateMessengerStorage({ indexedDB, temporaryStorageArea }).catch(() => {
    });
  }, Math.min(MAX_RETRY_MS, Math.max(0, nextAttemptAt - now)));
  timer?.unref?.();
  retryTimers.set(indexedDB, timer);
}
async function maintainPrivateMessengerStorage({
  indexedDB = globalThis.indexedDB,
  temporaryStorageArea = globalThis.sessionStorage,
  now = Date.now()
} = {}) {
  if (temporaryStorageArea) cleanupTemporaryStorage({ storageArea: temporaryStorageArea });
  await cleanupReceivedChunkStorage({ indexedDB, now });
  const result = await withMaintenanceLock(indexedDB, () => maintainRegistry(indexedDB, now));
  schedulePendingRetry(indexedDB, temporaryStorageArea, result.nextAttemptAt, now);
  return result.processed;
}
function activatePrivateMessengerStorage({
  userPubkey,
  leaseId,
  activeChannelPubkeys,
  storagePolicy: nextPolicy,
  indexedDB = globalThis.indexedDB,
  now = Date.now()
} = {}) {
  if (!userPubkey) return Promise.reject(new Error("USER_PUBKEY_REQUIRED"));
  if (!leaseId) return Promise.reject(new Error("PRIVATE_MESSENGER_LEASE_ID_REQUIRED"));
  return withMaintenanceLock(indexedDB, () => withRegistryTransaction(indexedDB, "readwrite", async (tx) => {
    userPubkey = String(userPubkey);
    leaseId = String(leaseId);
    const current = normalizeStorageSet((await run("get", [userPubkey], STORAGE_SETS_STORE, null, { tx })).result);
    const currentLease = (await run("get", [leaseKey(userPubkey, leaseId)], LEASES_STORE, null, { tx })).result;
    const channels = activeChannelPubkeys === void 0 ? normalizeActiveChannelPubkeys(currentLease?.activeChannelPubkeys) : normalizeActiveChannelPubkeys(activeChannelPubkeys);
    await run("put", [{
      key: leaseKey(userPubkey, leaseId),
      userPubkey,
      leaseId,
      leaseUntil: now + LEASE_MS,
      activeChannelPubkeys: channels
    }], LEASES_STORE, null, { tx });
    const hasPolicy = nextPolicy !== void 0;
    const storageSet = {
      userPubkey,
      lastUsedAt: now,
      leaseUntil: Math.max(current?.leaseUntil || 0, now + LEASE_MS),
      status: "ready",
      attempts: 0,
      nextAttemptAt: 0,
      staleChannelSeconds: hasPolicy ? nextPolicy.staleChannelSeconds : current?.staleChannelSeconds ?? DEFAULT_STALE_CHANNEL_SECONDS,
      identityStorageRetentionSeconds: hasPolicy ? nextPolicy.identityStorageRetentionSeconds : current?.identityStorageRetentionSeconds ?? DEFAULT_IDENTITY_STORAGE_RETENTION_SECONDS,
      policyRevision: hasPolicy ? (current?.policyRevision || 0) + 1 : current?.policyRevision || 0
    };
    await run("put", [storageSet], STORAGE_SETS_STORE, null, { tx });
    const leaseState = await refreshLeaseState(tx, storageSet, now);
    return {
      ...storagePolicy(storageSet),
      activeChannelPubkeys: leaseState.activeChannelPubkeys
    };
  }));
}
function readPrivateMessengerStorage({
  userPubkey,
  indexedDB = globalThis.indexedDB,
  now = Date.now()
} = {}) {
  if (!userPubkey) return Promise.reject(new Error("USER_PUBKEY_REQUIRED"));
  return withMaintenanceLock(indexedDB, () => withRegistryTransaction(indexedDB, "readwrite", async (tx) => {
    userPubkey = String(userPubkey);
    const storageSet = normalizeStorageSet((await run("get", [userPubkey], STORAGE_SETS_STORE, null, { tx })).result);
    if (!storageSet) return null;
    const leaseState = await refreshLeaseState(tx, storageSet, now, { removeExpired: true });
    await run("put", [storageSet], STORAGE_SETS_STORE, null, { tx });
    return {
      ...storagePolicy(storageSet),
      activeChannelPubkeys: leaseState.activeChannelPubkeys
    };
  }));
}
function releasePrivateMessengerStorage({
  userPubkey,
  leaseId,
  indexedDB = globalThis.indexedDB,
  now = Date.now()
} = {}) {
  if (!userPubkey) return Promise.resolve(false);
  if (!leaseId) return Promise.reject(new Error("PRIVATE_MESSENGER_LEASE_ID_REQUIRED"));
  return withMaintenanceLock(indexedDB, () => withRegistryTransaction(indexedDB, "readwrite", async (tx) => {
    userPubkey = String(userPubkey);
    leaseId = String(leaseId);
    const current = normalizeStorageSet((await run("get", [userPubkey], STORAGE_SETS_STORE, null, { tx })).result);
    if (!current) return false;
    await run("delete", [leaseKey(userPubkey, leaseId)], LEASES_STORE, null, { tx });
    await refreshLeaseState(tx, current, now, { removeExpired: true });
    current.lastUsedAt = now;
    current.status = "ready";
    current.attempts = 0;
    current.nextAttemptAt = 0;
    await run("put", [current], STORAGE_SETS_STORE, null, { tx });
    return true;
  }));
}
var PRIVATE_MESSENGER_STORAGE_HEARTBEAT_MS = 60 * 60 * 1e3;
var PRIVATE_MESSENGER_STORAGE_MAINTENANCE_MS = 6 * 60 * 60 * 1e3;
var PRIVATE_MESSENGER_IDENTITY_STORAGE_RETENTION_MS = DEFAULT_IDENTITY_STORAGE_RETENTION_SECONDS * 1e3;

// node_modules/libp2r2p/private-messenger/recovery/index.js
var SEEDER_PRESENCE_CODE = "seederPresence_8mj8";
var MISSING_MESSAGES_ASK_CODE = "missingMessages_ask_8mj8";
var MISSING_MESSAGES_REPLY_CODE = "missingMessages_reply_8mj8";
var ROUTER_SEED_RECORD_TYPE = "routerEnvelopeRow_v1";
var NYM_CARRIER_SEED_RECORD_TYPE = "nymCarrier_v1";
var DEFAULT_EVENTS_PER_CHUNK = 100;
var encoder7 = new TextEncoder();
var decoder6 = new TextDecoder();
var HASH_PUBKEY = "0".repeat(64);
function nowSeconds4() {
  return Math.floor(Date.now() / 1e3);
}
function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function parseEventContent(event) {
  return parseRumorContent(event);
}
function splitJsonl(jsonl) {
  return String(jsonl || "").split("\n").filter(Boolean);
}
function decodeJsonl(content) {
  try {
    return decoder6.decode(base64ToBytes(content || ""));
  } catch {
    return "";
  }
}
function encodeJsonlRows(...rows) {
  return bytesToBase64(encoder7.encode(rows.map((row) => String(row).endsWith("\n") ? row : `${row}
`).join("")));
}
function isEventInRange(event, since, until) {
  if (!Number.isFinite(event?.created_at)) return true;
  if (since != null && event.created_at < since) return false;
  if (until != null && event.created_at > until) return false;
  return true;
}
function compactRouter(router = {}) {
  return {
    kind: router.kind,
    pubkey: router.pubkey,
    created_at: router.created_at,
    tags: (router.tags || []).filter((tag) => tag[0] !== "c")
  };
}
function cloneTags2(tags) {
  return (tags || []).map((tag) => Array.isArray(tag) ? [...tag] : tag);
}
function parseRouterRow(line) {
  try {
    const record = JSON.parse(line);
    if (!Array.isArray(record) || record.length === 1) return null;
    return {
      receiverPubkey: record[0] || "",
      iykcPubkey: record[2] || ""
    };
  } catch {
    return null;
  }
}
function parsePayloadRow(line) {
  try {
    const record = JSON.parse(line);
    if (!Array.isArray(record) || record.length !== 1 || typeof record[0] !== "string") return "";
    return line;
  } catch {
    return "";
  }
}
function rowHash(payloadRow, row) {
  return getEventHash({
    kind: 0,
    pubkey: HASH_PUBKEY,
    created_at: 0,
    tags: [],
    content: `${payloadRow}
${row}`
  });
}
function compactSeedRouterRows(seed = {}) {
  const router = compactRouter(seed.router);
  const createdAt = router.created_at || seed.outer?.created_at || nowSeconds4();
  const rows = [];
  const innerEventIdsByRowIndex = seed.innerEventIdsByRowIndex || {};
  const lines = splitJsonl(seed.jsonl || decodeJsonl(seed.router?.content));
  const payloadRow = parsePayloadRow(lines[0]);
  if (!payloadRow) return [];
  for (let index = 0; index < lines.length; index++) {
    const row = lines[index];
    const parsed = parseRouterRow(row);
    if (!parsed?.receiverPubkey) continue;
    const innerEventId = innerEventIdsByRowIndex[index] || innerEventIdsByRowIndex[String(index)] || "";
    rows.push({
      type: "seed",
      recordType: ROUTER_SEED_RECORD_TYPE,
      router,
      receiverPubkey: parsed.receiverPubkey,
      iykcPubkey: parsed.iykcPubkey,
      innerEventId,
      rowHash: innerEventId ? "" : rowHash(payloadRow, row),
      payloadRow,
      row,
      firstSeenAt: createdAt,
      lastSeenAt: createdAt
    });
  }
  return rows;
}
function routerSeedRowKey(seed = {}) {
  const row = seed.row ? parseRouterRow(seed.row) : null;
  const innerEventId = seed.innerEventId || "";
  const fallbackRowHash = seed.rowHash || (seed.payloadRow && seed.row ? rowHash(seed.payloadRow, seed.row) : "");
  return [
    seed.channelPubkey || "",
    seed.receiverPubkey || row?.receiverPubkey || "",
    innerEventId ? `event:${innerEventId}` : `row:${fallbackRowHash}`
  ].join(":");
}
function compactSeedNymCarriers(carriers = []) {
  return carriers.map((carrier) => ({
    id: carrier.id,
    kind: carrier.kind,
    pubkey: carrier.pubkey,
    created_at: carrier.created_at,
    tags: cloneTags2(carrier.tags),
    content: carrier.content || "",
    sig: carrier.sig
  }));
}
function routerWithSingleRow(router, payloadRow, row) {
  const compact = compactRouter(router);
  return {
    ...compact,
    tags: compact.tags.concat([["c", "0", "1"]]),
    content: encodeJsonlRows(payloadRow, row)
  };
}
function isSeedRowInRange(seed, since, until) {
  const firstSeenAt = seed.firstSeenAt ?? seed.router?.created_at;
  const lastSeenAt = seed.lastSeenAt ?? seed.router?.created_at;
  if (!Number.isFinite(firstSeenAt) || !Number.isFinite(lastSeenAt)) return isEventInRange(seed.router, since, until);
  if (since != null && lastSeenAt < since) return false;
  if (until != null && firstSeenAt > until) return false;
  return true;
}
function compactRoutersFromSeed(seed, { receiverPubkey, since, until }) {
  if (!seed?.payloadRow || !seed?.row || !seed?.router || !isSeedRowInRange(seed, since, until)) return [];
  if (receiverPubkey && seed.receiverPubkey !== receiverPubkey) return [];
  return [{
    recordType: ROUTER_SEED_RECORD_TYPE,
    router: routerWithSingleRow(seed.router, seed.payloadRow, seed.row)
  }];
}
function nymCarrierRecordTime(seed) {
  return seed?.carriers?.reduce((max, carrier) => Math.max(max, carrier.created_at || 0), 0) || 0;
}
function compactNymCarriersFromSeed(seed, { since, until }) {
  const created_at = nymCarrierRecordTime(seed);
  if (!seed?.carriers?.length || !isEventInRange({ created_at }, since, until)) return [];
  return [{
    recordType: NYM_CARRIER_SEED_RECORD_TYPE,
    carriers: compactSeedNymCarriers(seed.carriers)
  }];
}
function compactRecordsFromSeed(seed, { receiverPubkey, since, until }) {
  if (seed?.recordType === NYM_CARRIER_SEED_RECORD_TYPE) {
    return compactNymCarriersFromSeed(seed, { since, until });
  }
  if (seed?.recordType === ROUTER_SEED_RECORD_TYPE) {
    return compactRoutersFromSeed(seed, { receiverPubkey, since, until });
  }
  return [];
}
function backfillRequestRange(question, since, until) {
  const content = parseEventContent({ ...question, kind: ASK_KIND });
  const payload = isPlainObject(content?.payload) ? content.payload : {};
  return {
    since: since ?? payload.since ?? 0,
    until: until ?? payload.until ?? nowSeconds4()
  };
}
function eventRecordFromInput(event) {
  return Number.isInteger(event?.kind) ? [event] : [];
}
function createEventReplyPacker({
  messenger,
  channelPubkey,
  question,
  receiverPubkey = question?.pubkey,
  code,
  payload = {},
  eventsPerChunk = DEFAULT_EVENTS_PER_CHUNK,
  recordsFromInput = eventRecordFromInput,
  sendEmptyReply = false
}) {
  if (!messenger?.reply) throw new ValidationError("MESSENGER_REQUIRED");
  if (!question?.id) throw new ValidationError("QUESTION_REQUIRED");
  if (!receiverPubkey) throw new ValidationError("RECEIVER_PUBKEY_REQUIRED");
  if (!Number.isSafeInteger(eventsPerChunk) || eventsPerChunk < 1) throw new ValidationError("INVALID_EVENTS_PER_CHUNK");
  let chunk = "";
  let chunkEvents = 0;
  let index = 0;
  let finalized = false;
  let published = false;
  async function publish2(isLast) {
    const jsonl = chunk;
    chunk = "";
    chunkEvents = 0;
    published = true;
    await messenger.reply({
      channelPubkey,
      question,
      receiverPubkey,
      code,
      payload: {
        ...payload,
        index: index++,
        isLast,
        jsonl
      }
    });
  }
  async function appendRecord(record, { flush = true } = {}) {
    chunk += `${JSON.stringify(record)}
`;
    chunkEvents++;
    if (flush && chunkEvents >= eventsPerChunk) await publish2(false);
  }
  async function appendRecords(records, { final = false } = {}) {
    for (let i = 0; i < records.length; i++) {
      const isLast = final && i === records.length - 1;
      await appendRecord(records[i], { flush: !isLast });
    }
  }
  async function update2(input) {
    if (finalized) throw new Error("PACKER_FINALIZED");
    await appendRecords(await recordsFromInput(input));
  }
  async function finalize(input) {
    if (finalized) return;
    if (input != null) await appendRecords(await recordsFromInput(input), { final: true });
    finalized = true;
    if (!chunk && !sendEmptyReply && !published) return;
    await publish2(true);
  }
  return {
    update: update2,
    finalize
  };
}
function createMissingMessageReplyPacker({
  messenger,
  channelPubkey,
  question,
  receiverPubkey = question?.pubkey,
  since,
  until,
  eventsPerChunk = DEFAULT_EVENTS_PER_CHUNK,
  sendEmptyReply = false
}) {
  if (!messenger?.reply) throw new ValidationError("MESSENGER_REQUIRED");
  if (!question?.id) throw new ValidationError("QUESTION_REQUIRED");
  if (!receiverPubkey) throw new ValidationError("RECEIVER_PUBKEY_REQUIRED");
  if (!Number.isSafeInteger(eventsPerChunk) || eventsPerChunk < 1) throw new ValidationError("INVALID_EVENTS_PER_CHUNK");
  const range = backfillRequestRange(question, since, until);
  return createEventReplyPacker({
    messenger,
    channelPubkey,
    question,
    receiverPubkey,
    code: MISSING_MESSAGES_REPLY_CODE,
    payload: { since: range.since, until: range.until },
    eventsPerChunk,
    sendEmptyReply,
    recordsFromInput: (seed) => compactRecordsFromSeed(seed, { receiverPubkey, since: range.since, until: range.until })
  });
}

// node_modules/libp2r2p/private-messenger/index.js
var DEFAULT_OFFLINE_RECOVERY_SECONDS = 7 * 24 * 60 * 60;
var MAX_OFFLINE_RECOVERY_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1e3);
var STORAGE_POLICY_BROADCAST_CHANNEL = "libp2r2p:private-messenger:storage-policy";
var DEFAULT_OFFLINE_SKEW_SECONDS = 30;
var DEFAULT_RELOAD_GAP_DELAY_MS = 500;
var DEFAULT_SEEDER_PRESENCE_INTERVAL_MS = 10 * 60 * 1e3;
var DEFAULT_SEEDER_ONLINE_SECONDS = 20 * 60;
var DEFAULT_MAX_DYNAMIC_RECOVERY_SEEDERS = 8;
var DEFAULT_MESSAGE_QUEUE_MAX_BYTES = 16 * 1024 * 1024;
var DEFAULT_SEED_QUEUE_MAX_BYTES = 64 * 1024 * 1024;
var SEED_KEY = "__p2r2pSeedKey";
var SEED_TIME = "__p2r2pSeedTime";
var MESSAGE_QUEUE_INDEXES = {
  byChannel: "channelPubkey",
  byChannelTypeEventId: {
    keyPath: ["channelPubkey", "type", "event.id"],
    unique: true
  }
};
var SEED_QUEUE_INDEXES = {
  byChannel: "channelPubkey",
  bySeedKey: { keyPath: SEED_KEY, unique: true },
  byChannelTime: ["channelPubkey", SEED_TIME],
  byTime: SEED_TIME
};
var encoder8 = new TextEncoder();
var noContentKeys = async () => ({});
function textToBase642(text) {
  return bytesToBase64(encoder8.encode(text));
}
function defaultOnError(err) {
  console.warn("private-messenger failed", err?.message ?? err);
}
function nowSeconds5() {
  return Math.floor(Date.now() / 1e3);
}
function normalizeOfflineRecoverySeconds(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_OFFLINE_RECOVERY_SECONDS) {
    throw new ValidationError("INVALID_OFFLINE_RECOVERY_SECONDS");
  }
  return value;
}
function normalizeStaleChannelSeconds(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_OFFLINE_RECOVERY_SECONDS) {
    throw new ValidationError("INVALID_STALE_CHANNEL_SECONDS");
  }
  return value;
}
function normalizeIdentityStorageRetentionSeconds(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_OFFLINE_RECOVERY_SECONDS) {
    throw new ValidationError("INVALID_IDENTITY_STORAGE_RETENTION_SECONDS");
  }
  return value;
}
function uniq4(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function normalizeAutoDeletionCapability(value) {
  if (typeof value !== "boolean") throw new ValidationError("AUTO_DELETION_CAPABILITY_BOOLEAN_REQUIRED");
  return value;
}
function isPlainObject2(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw || "");
  } catch {
    return fallback;
  }
}
function areStateValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function doesModeStoreRecoverySeeds2(mode) {
  return mode === "seeder" || mode === "watchtower";
}
function randomStorageLeaseId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (bytes) return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}
var PrivateMessenger = class _PrivateMessenger {
  static maintainStorage({
    indexedDB = globalThis.indexedDB,
    temporaryStorageArea = globalThis.sessionStorage
  } = {}) {
    return maintainPrivateMessengerStorage({ indexedDB, temporaryStorageArea });
  }
  constructor({
    offlineRecoverySeconds = DEFAULT_OFFLINE_RECOVERY_SECONDS,
    staleChannelSeconds = DEFAULT_STALE_CHANNEL_SECONDS,
    identityStorageRetentionSeconds = DEFAULT_IDENTITY_STORAGE_RETENTION_SECONDS,
    offlineSkewSeconds = DEFAULT_OFFLINE_SKEW_SECONDS,
    reloadGapDelayMs = DEFAULT_RELOAD_GAP_DELAY_MS,
    seederPresenceIntervalMs = DEFAULT_SEEDER_PRESENCE_INTERVAL_MS,
    seederOnlineSeconds = DEFAULT_SEEDER_ONLINE_SECONDS,
    maxDynamicRecoverySeeders = DEFAULT_MAX_DYNAMIC_RECOVERY_SEEDERS,
    messageQueueMaxBytes = DEFAULT_MESSAGE_QUEUE_MAX_BYTES,
    seedQueueMaxBytes = DEFAULT_SEED_QUEUE_MAX_BYTES,
    temporaryStorageArea = globalThis.sessionStorage,
    autoDeletionCapability = true,
    _indexedDB = globalThis.indexedDB,
    useContentKeys = true,
    onContentKeyChange,
    onMessageQueued,
    onDebug,
    onError = defaultOnError,
    _privateMessage = private_message_exports,
    _privateChannel = private_channel_exports,
    _getRelaysByPubkey = getRelaysByPubkey,
    _pickRelaysForPubkeys = pickRelaysForPubkeys,
    _subscribeRelayListUpdates = subscribeRelayListUpdates,
    _setTimeout = globalThis.setTimeout.bind(globalThis),
    _clearTimeout = globalThis.clearTimeout.bind(globalThis),
    _setInterval = globalThis.setInterval.bind(globalThis),
    _clearInterval = globalThis.clearInterval.bind(globalThis),
    _storageSetInterval = globalThis.setInterval.bind(globalThis),
    _storageClearInterval = globalThis.clearInterval.bind(globalThis),
    _BroadcastChannel = _indexedDB === globalThis.indexedDB ? globalThis.BroadcastChannel : void 0
  } = {}) {
    this.offlineRecoverySeconds = normalizeOfflineRecoverySeconds(offlineRecoverySeconds);
    this.staleChannelSeconds = normalizeStaleChannelSeconds(staleChannelSeconds);
    this.identityStorageRetentionSeconds = normalizeIdentityStorageRetentionSeconds(identityStorageRetentionSeconds);
    this.offlineSkewSeconds = offlineSkewSeconds;
    this.reloadGapDelayMs = reloadGapDelayMs;
    this.seederPresenceIntervalMs = seederPresenceIntervalMs;
    this.seederOnlineSeconds = seederOnlineSeconds;
    this.maxDynamicRecoverySeeders = maxDynamicRecoverySeeders;
    this.messageQueueMaxBytes = messageQueueMaxBytes;
    this.seedQueueMaxBytes = seedQueueMaxBytes;
    this.temporaryStorageArea = temporaryStorageArea;
    this.autoDeletionCapability = normalizeAutoDeletionCapability(autoDeletionCapability);
    this._indexedDB = _indexedDB;
    this.useContentKeys = useContentKeys;
    this.onContentKeyChange = onContentKeyChange;
    this.onMessageQueued = onMessageQueued;
    this.onDebug = onDebug;
    this.onError = onError;
    this._privateMessage = _privateMessage;
    this._privateChannel = _privateChannel;
    this._getRelaysByPubkey = _getRelaysByPubkey;
    this._pickRelaysForPubkeys = _pickRelaysForPubkeys;
    this._subscribeRelayListUpdates = _subscribeRelayListUpdates;
    this._setTimeout = _setTimeout;
    this._clearTimeout = _clearTimeout;
    this._setInterval = _setInterval;
    this._clearInterval = _clearInterval;
    this._storageSetInterval = _storageSetInterval;
    this._storageClearInterval = _storageClearInterval;
    this._BroadcastChannel = _BroadcastChannel;
    this.userSigner = null;
    this.contentKeySigner = null;
    this.nymSigner = null;
    this.userPubkey = "";
    this.contentKeyPubkey = "";
    this.prefix = "";
    this.queue = null;
    this.seedQueue = null;
    this.stateStore = null;
    this.state = { channels: {} };
    this.stateWriteTail = Promise.resolve();
    this.channels = /* @__PURE__ */ new Map();
    this.stopByChannel = /* @__PURE__ */ new Map();
    this.reloadGapTimers = /* @__PURE__ */ new Map();
    this.watchRevisionByChannel = /* @__PURE__ */ new Map();
    this.presenceTimers = /* @__PURE__ */ new Map();
    this.stopRelayListWatcher = null;
    this.relayListWatcherPubkey = "";
    this.relayListRefreshPromise = null;
    this.stopOnline = null;
    this.stopOffline = null;
    this.queueOperationTail = Promise.resolve();
    this.storageActive = false;
    this.storageLeaseId = randomStorageLeaseId();
    this.lastStorageTouch = 0;
    this.storageTouchPromise = null;
    this.storageHeartbeatTimer = null;
    this.storageMaintenanceTimer = null;
    this.storageMaintenancePromise = null;
    this.storagePolicyRevision = 0;
    this.storagePolicyNeedsApply = false;
    this.storagePolicyBroadcast = null;
    this.storagePolicyRefreshTail = Promise.resolve();
    this.closePromise = null;
    this.initSettledPromise = null;
    this.initialized = false;
  }
  async init({ userSigner, contentKeySigner, nymSigner, channels = [], relays = [], mode = "leecher" }) {
    if (!userSigner?.getPublicKey) throw new ValidationError("USER_SIGNER_REQUIRED");
    this.assertOpen();
    if (this.initSettledPromise) throw new Error("PRIVATE_MESSENGER_INIT_IN_PROGRESS");
    if (this.initialized) throw new Error("PRIVATE_MESSENGER_ALREADY_INITIALIZED");
    let settleInit;
    const initSettledPromise = new Promise((resolve) => {
      settleInit = resolve;
    });
    this.initSettledPromise = initSettledPromise;
    try {
      this.userSigner = userSigner;
      this.contentKeySigner = contentKeySigner || null;
      this.nymSigner = nymSigner || null;
      this.userPubkey = await userSigner.getPublicKey();
      this.prefix = `libp2r2p:private-messenger:${this.userPubkey}`;
      const storageSnapshot = await activatePrivateMessengerStorage({
        userPubkey: this.userPubkey,
        leaseId: this.storageLeaseId,
        activeChannelPubkeys: [],
        storagePolicy: {
          staleChannelSeconds: this.staleChannelSeconds,
          identityStorageRetentionSeconds: this.identityStorageRetentionSeconds
        },
        indexedDB: this._indexedDB
      });
      this.applyStoragePolicySnapshot(storageSnapshot);
      this.storageActive = true;
      this.lastStorageTouch = Date.now();
      this.startStoragePolicyBroadcast();
      this.assertOpen();
      await _PrivateMessenger.maintainStorage({
        indexedDB: this._indexedDB,
        temporaryStorageArea: this.temporaryStorageArea
      });
      this.assertOpen();
      this.contentKeyPubkey = await this.contentKeySigner?.getPublicKey?.() || "";
      this.assertOpen();
      this.queue = await createQueue({
        prefix: this.prefix,
        indexes: MESSAGE_QUEUE_INDEXES,
        maxBytes: this.messageQueueMaxBytes,
        evictionPolicy: "fifo",
        indexedDB: this._indexedDB
      });
      this.assertOpen();
      this.seedQueue = await createQueue({
        prefix: `${this.prefix}:seeds`,
        indexes: SEED_QUEUE_INDEXES,
        maxBytes: this.seedQueueMaxBytes,
        evictionPolicy: "fifo",
        indexedDB: this._indexedDB
      });
      this.assertOpen();
      this.stateStore = await createChannelStateStore({
        prefix: this.prefix,
        indexedDB: this._indexedDB
      });
      this.assertOpen();
      this.startStorageMaintenance();
      this.state = { channels: await this.stateStore.load() };
      await this.update({ userSigner, contentKeySigner, nymSigner: this.nymSigner, channels, relays, mode });
      await this.pruneStoredSeeds();
      this.initialized = true;
      await this.refreshAndApplyStoragePolicy();
      this.broadcastStoragePolicyChange();
      return this;
    } catch (err) {
      this.stopStorageMaintenance();
      this.stopStoragePolicyBroadcast();
      try {
        await this.queueOperationTail;
      } catch {
      }
      try {
        await this.stateWriteTail;
      } catch {
      }
      await Promise.allSettled([
        this.queue?.close?.(),
        this.seedQueue?.close?.(),
        this.stateStore?.close?.()
      ]);
      if (this.storageActive) {
        try {
          await releasePrivateMessengerStorage({
            userPubkey: this.userPubkey,
            leaseId: this.storageLeaseId,
            indexedDB: this._indexedDB
          });
        } catch {
        }
      }
      this.storageActive = false;
      this.initialized = false;
      throw err;
    } finally {
      settleInit();
      if (this.initSettledPromise === initSettledPromise) this.initSettledPromise = null;
    }
  }
  assertOpen() {
    if (this.closePromise) throw new Error("PRIVATE_MESSENGER_CLOSED");
  }
  applyStoragePolicySnapshot(snapshot) {
    if (!snapshot) return false;
    const staleChannelSeconds = normalizeStaleChannelSeconds(snapshot.staleChannelSeconds);
    const identityStorageRetentionSeconds = normalizeIdentityStorageRetentionSeconds(
      snapshot.identityStorageRetentionSeconds
    );
    const policyRevision = Math.max(0, Number(snapshot.policyRevision) || 0);
    const changed = this.staleChannelSeconds !== staleChannelSeconds || this.identityStorageRetentionSeconds !== identityStorageRetentionSeconds;
    this.staleChannelSeconds = staleChannelSeconds;
    this.identityStorageRetentionSeconds = identityStorageRetentionSeconds;
    this.storagePolicyRevision = policyRevision;
    if (changed && this.initialized) this.storagePolicyNeedsApply = true;
    return changed;
  }
  startStoragePolicyBroadcast() {
    if (this.storagePolicyBroadcast || typeof this._BroadcastChannel !== "function") return;
    try {
      const channel = new this._BroadcastChannel(STORAGE_POLICY_BROADCAST_CHANNEL);
      channel.unref?.();
      channel.onmessage = (event) => {
        const message = event?.data;
        if (message?.userPubkey !== this.userPubkey) return;
        if (!Number.isSafeInteger(message.policyRevision) || message.policyRevision <= (this.storagePolicyRevision || 0)) return;
        this.refreshAndApplyStoragePolicy().catch((err) => {
          try {
            this.onError?.(err);
          } catch {
          }
        });
      };
      this.storagePolicyBroadcast = channel;
    } catch {
    }
  }
  stopStoragePolicyBroadcast() {
    const channel = this.storagePolicyBroadcast;
    this.storagePolicyBroadcast = null;
    if (!channel) return;
    channel.onmessage = null;
    channel.close?.();
  }
  broadcastStoragePolicyChange() {
    try {
      this.storagePolicyBroadcast?.postMessage({
        userPubkey: this.userPubkey,
        policyRevision: this.storagePolicyRevision || 0
      });
    } catch (err) {
      try {
        this.onError?.(err);
      } catch {
      }
    }
  }
  async readStoragePolicySnapshot() {
    if (!this.userPubkey) return null;
    const snapshot = await readPrivateMessengerStorage({
      userPubkey: this.userPubkey,
      indexedDB: this._indexedDB
    });
    this.applyStoragePolicySnapshot(snapshot);
    return snapshot;
  }
  async applyPendingStoragePolicy() {
    if (!this.storagePolicyNeedsApply || !this.initialized || this.closePromise) return false;
    this.storagePolicyNeedsApply = false;
    try {
      const channels = [...this.channels.values()];
      await this.applyRecoveryPolicies(channels);
      await this.cleanupStaleChannels();
      const pubkeys = [...this.channels.keys()];
      if (pubkeys.length) {
        await this.unwatch(pubkeys);
        await this.watch(pubkeys);
      }
      await this.reconcilePresencePublishers();
      return true;
    } catch (err) {
      this.storagePolicyNeedsApply = true;
      throw err;
    }
  }
  refreshAndApplyStoragePolicy() {
    const previous = this.storagePolicyRefreshTail || Promise.resolve();
    const refresh = previous.catch(() => {
    }).then(async () => {
      await this.readStoragePolicySnapshot();
      return this.applyPendingStoragePolicy();
    });
    this.storagePolicyRefreshTail = refresh;
    return refresh;
  }
  startStorageMaintenance() {
    if (this.storageHeartbeatTimer || this.storageMaintenanceTimer) return;
    this.storageHeartbeatTimer = this._storageSetInterval(() => this.runStorageHeartbeat().catch((err) => {
      try {
        this.onError?.(err);
      } catch {
      }
    }), PRIVATE_MESSENGER_STORAGE_HEARTBEAT_MS);
    this.storageMaintenanceTimer = this._storageSetInterval(
      () => this.runStorageMaintenance(),
      PRIVATE_MESSENGER_STORAGE_MAINTENANCE_MS
    );
    this.storageHeartbeatTimer?.unref?.();
    this.storageMaintenanceTimer?.unref?.();
  }
  stopStorageMaintenance() {
    if (this.storageHeartbeatTimer) this._storageClearInterval(this.storageHeartbeatTimer);
    if (this.storageMaintenanceTimer) this._storageClearInterval(this.storageMaintenanceTimer);
    this.storageHeartbeatTimer = null;
    this.storageMaintenanceTimer = null;
  }
  runStorageMaintenance() {
    if (this.storageMaintenancePromise) return this.storageMaintenancePromise;
    const maintenance = (async () => {
      await _PrivateMessenger.maintainStorage({
        indexedDB: this._indexedDB,
        temporaryStorageArea: this.temporaryStorageArea
      });
      await this.refreshAndApplyStoragePolicy();
      await this.cleanupStaleChannels();
      await this.pruneStoredSeeds();
    })().catch((err) => {
      try {
        this.onError?.(err);
      } catch {
      }
    }).finally(() => {
      if (this.storageMaintenancePromise === maintenance) this.storageMaintenancePromise = null;
    });
    this.storageMaintenancePromise = maintenance;
    return maintenance;
  }
  async runStorageHeartbeat() {
    await this.stampActiveChannelActivity();
    await this.touchStorageActivity({ force: true });
    await this.applyPendingStoragePolicy();
  }
  async touchStorageActivity({ force = false } = {}) {
    if (!this.storageActive || this.closePromise) return false;
    if (this.storageTouchPromise) return this.storageTouchPromise;
    const now = Date.now();
    if (!force && now - this.lastStorageTouch < PRIVATE_MESSENGER_STORAGE_HEARTBEAT_MS) return false;
    const previousTouch = this.lastStorageTouch;
    this.lastStorageTouch = now;
    const touch = activatePrivateMessengerStorage({
      userPubkey: this.userPubkey,
      leaseId: this.storageLeaseId,
      activeChannelPubkeys: [...this.channels.keys()],
      indexedDB: this._indexedDB,
      now
    }).then((snapshot) => {
      this.applyStoragePolicySnapshot(snapshot);
      return true;
    }, (err) => {
      this.lastStorageTouch = previousTouch;
      throw err;
    }).finally(() => {
      if (this.storageTouchPromise === touch) this.storageTouchPromise = null;
    });
    this.storageTouchPromise = touch;
    return touch;
  }
  runQueueOperation(operation) {
    if (this.closePromise) return Promise.reject(new Error("PRIVATE_MESSENGER_CLOSED"));
    this.touchStorageActivity().catch((err) => this.onError?.(err));
    const run2 = this.queueOperationTail.then(operation);
    this.queueOperationTail = run2.catch((err) => {
      try {
        this.onError?.(err);
      } catch {
      }
    });
    return run2;
  }
  queueIncoming(operation) {
    return this.runQueueOperation(operation).catch(() => void 0);
  }
  debug(action, detail = {}) {
    try {
      this.onDebug?.({ source: "private-messenger", action, ...detail });
    } catch (err) {
      this.onError?.(err);
    }
  }
  debugSend(method, channelPubkey, detail = {}) {
    const receiverPubkeys2 = uniq4(detail.receiverPubkeys || (detail.receiverPubkey ? [detail.receiverPubkey] : []));
    this.debug("send", {
      method,
      type: method,
      code: detail.code || "",
      channelPubkey,
      senderPubkey: this.userPubkey,
      receiverPubkey: detail.receiverPubkey || "",
      receiverPubkeys: receiverPubkeys2,
      receiverCount: receiverPubkeys2.length
    });
  }
  async update(options = {}) {
    this.assertOpen();
    const {
      userSigner = this.userSigner,
      contentKeySigner = this.contentKeySigner,
      nymSigner = this.nymSigner,
      channels = [...this.channels.values()],
      relays = [],
      mode = "leecher"
    } = options;
    const updatesStalePolicy = Object.hasOwn(options, "staleChannelSeconds");
    const updatesIdentityPolicy = Object.hasOwn(options, "identityStorageRetentionSeconds");
    let nextStaleChannelSeconds = updatesStalePolicy ? normalizeStaleChannelSeconds(options.staleChannelSeconds) : this.staleChannelSeconds;
    let nextIdentityStorageRetentionSeconds = updatesIdentityPolicy ? normalizeIdentityStorageRetentionSeconds(options.identityStorageRetentionSeconds) : this.identityStorageRetentionSeconds;
    if (userSigner) {
      const userPubkey = await userSigner.getPublicKey?.();
      if (!userPubkey) throw new ValidationError("USER_SIGNER_REQUIRED");
      if (this.userPubkey && userPubkey !== this.userPubkey) throw new ValidationError("USER_SIGNER_MISMATCH");
      this.userSigner = userSigner;
    }
    this.contentKeySigner = contentKeySigner || null;
    this.nymSigner = nymSigner || null;
    this.contentKeyPubkey = await this.contentKeySigner?.getPublicKey?.() || "";
    const nextChannels = await this.normalizeChannels(channels, { relays, mode });
    this.assertOpen();
    const nextPubkeys = new Set(nextChannels.map((channel) => channel.pubkey));
    const removedPubkeys = [...this.channels.keys()].filter((pubkey) => !nextPubkeys.has(pubkey));
    const updatesStoragePolicy = updatesStalePolicy || updatesIdentityPolicy;
    if (updatesStoragePolicy) {
      const currentPolicy = await this.readStoragePolicySnapshot();
      if (!updatesStalePolicy) nextStaleChannelSeconds = currentPolicy?.staleChannelSeconds ?? this.staleChannelSeconds;
      if (!updatesIdentityPolicy) {
        nextIdentityStorageRetentionSeconds = currentPolicy?.identityStorageRetentionSeconds ?? this.identityStorageRetentionSeconds;
      }
    }
    if (removedPubkeys.length) {
      await this.stampChannelActivity(removedPubkeys);
    }
    const storageSnapshot = await activatePrivateMessengerStorage({
      userPubkey: this.userPubkey,
      leaseId: this.storageLeaseId,
      activeChannelPubkeys: [...nextPubkeys],
      storagePolicy: updatesStoragePolicy ? {
        staleChannelSeconds: nextStaleChannelSeconds,
        identityStorageRetentionSeconds: nextIdentityStorageRetentionSeconds
      } : void 0,
      indexedDB: this._indexedDB
    });
    this.applyStoragePolicySnapshot(storageSnapshot);
    this.lastStorageTouch = Date.now();
    if (updatesStoragePolicy) this.broadcastStoragePolicyChange();
    await this.unwatch(removedPubkeys);
    for (const pubkey of removedPubkeys) this.channels.delete(pubkey);
    for (const channel of nextChannels) this.channels.set(channel.pubkey, channel);
    await this.cleanupStaleChannels({ storageSnapshot });
    await this.applyRecoveryPolicies(nextChannels);
    await this.watch([...nextPubkeys]);
    await this.reconcilePresencePublishers();
    if (this.storagePolicyRevision === storageSnapshot.policyRevision) {
      this.storagePolicyNeedsApply = false;
    }
    return this;
  }
  async normalizeChannels(channels, defaults) {
    const out = [];
    for (const entry of channels || []) {
      const channel = typeof entry === "string" ? { pubkey: entry } : entry;
      const signer = channel.signer || channel.privateChannelSigner || null;
      const readerSigner = channel.readerSigner || channel.privateChannelReaderSigner || signer || null;
      const nymSigner = channel.nymSigner || null;
      const hasChannelRelays = Boolean(channel.relays?.length);
      const hasChannelSendRelays = Boolean(channel.sendRelays?.length);
      const hasDefaultRelays = Boolean(defaults.relays?.length);
      const pubkey = channel.pubkey || await signer?.getPublicKey?.();
      if (!pubkey) throw new ValidationError("CHANNEL_PUBKEY_REQUIRED");
      if (!signer && !readerSigner) throw new ValidationError("CHANNEL_SIGNER_REQUIRED");
      const mode = channel.mode || defaults.mode || "leecher";
      if (!signer && doesModeStoreRecoverySeeds2(mode)) throw new ValidationError("PRIVATE_CHANNEL_WRITER_REQUIRED");
      const readerPubkey = channel.readerPubkey || channel.privateChannelReaderPubkey || await readerSigner?.getPublicKey?.() || pubkey;
      const autoDeletionCapability = channel.autoDeletionCapability === void 0 ? void 0 : normalizeAutoDeletionCapability(channel.autoDeletionCapability);
      const offlineRecoverySeconds = normalizeOfflineRecoverySeconds(
        channel.offlineRecoverySeconds ?? this.offlineRecoverySeconds
      );
      out.push({
        pubkey,
        signer,
        readerSigner,
        readerPubkey,
        nymSigner,
        relays: uniq4(hasChannelRelays ? channel.relays : defaults.relays),
        sendRelays: uniq4(hasChannelSendRelays ? channel.sendRelays : []),
        usesNip65WatchRelays: !hasChannelRelays && !hasDefaultRelays,
        mode,
        seeders: uniq4(channel.seeders),
        offlineRecoverySeconds,
        autoDeletionCapability
      });
    }
    return out;
  }
  async readRelayToReceivers(receiverPubkeys2) {
    const pubkeys = uniq4(receiverPubkeys2);
    if (!pubkeys.length) return /* @__PURE__ */ new Map();
    const relaysByPubkey2 = await this._getRelaysByPubkey(pubkeys);
    return this._pickRelaysForPubkeys(pubkeys, relaysByPubkey2, { relayType: "read" });
  }
  async readRelaysForPubkey(pubkey) {
    const relaysByPubkey2 = await this._getRelaysByPubkey([pubkey]);
    const readRelays = uniq4(relaysByPubkey2?.[pubkey]?.read);
    if (readRelays.length) return readRelays;
    return relayMapRelays(this._pickRelaysForPubkeys([pubkey], relaysByPubkey2, { relayType: "read" }));
  }
  async recoveryMirrorRelays(channelPubkey) {
    if (!this.offlineRecoverySecondsFor(channelPubkey)) return [];
    const seeders = this.recoverySeeders(channelPubkey);
    if (!seeders.length) return [];
    try {
      return relayMapRelays(await this.readRelayToReceivers(seeders));
    } catch (err) {
      this.onError?.(err);
      return [];
    }
  }
  async resolveWatchRelays(channel) {
    if (!channel.usesNip65WatchRelays && channel.relays.length) return channel.relays;
    return this.readRelaysForPubkey(this.userPubkey);
  }
  async resolveSendRouting({ channel, receiverPubkeys: receiverPubkeys2, relays, relayToReceivers }) {
    const recoveryRelays = await this.recoveryMirrorRelays(channel.pubkey);
    if (relayToReceivers) return { relayToReceivers, recoveryRelays };
    if (relays?.length) return { relays: uniq4(relays), recoveryRelays };
    if (channel.sendRelays.length) return { relays: channel.sendRelays, recoveryRelays };
    if (channel.relays.length) return { relays: channel.relays, recoveryRelays };
    const derived = await this.readRelayToReceivers(receiverPubkeys2);
    if (!relayMapRelays(derived).length) throw new ValidationError("NO_RELAYS");
    return { relayToReceivers: derived, recoveryRelays };
  }
  readState() {
    return structuredClone(this.state);
  }
  writeState(state, { touchStorage = true } = {}) {
    if (touchStorage) this.touchStorageActivity().catch((err) => this.onError?.(err));
    const previous = this.state?.channels || {};
    const next = {
      channels: isPlainObject2(state?.channels) ? structuredClone(state.channels) : {}
    };
    const changed = Object.fromEntries(Object.entries(next.channels).filter(([pubkey, value]) => !areStateValuesEqual(previous[pubkey], value)));
    const removed = Object.keys(previous).filter((pubkey) => !Object.hasOwn(next.channels, pubkey));
    this.state = next;
    if (!Object.keys(changed).length && !removed.length) return this.stateWriteTail;
    const snapshot = structuredClone(changed);
    const write = this.stateWriteTail.then(() => this.stateStore.update(snapshot, removed));
    this.stateWriteTail = write.catch((err) => {
      try {
        this.onError?.(err);
      } catch {
      }
    });
    return write;
  }
  async flushStateWrites() {
    await this.stateWriteTail;
  }
  async stampChannelActivity(pubkeys) {
    if (!this.stateStore || !this.state) return false;
    pubkeys = [...new Set(pubkeys || [])].filter((pubkey) => this.state.channels[pubkey]);
    if (!pubkeys.length) return false;
    const lastWatchedAt = nowSeconds5();
    for (const pubkey of pubkeys) {
      this.state.channels[pubkey] = {
        ...this.state.channels[pubkey],
        lastWatchedAt
      };
    }
    const write = this.stateWriteTail.then(() => this.stateStore.touch(pubkeys, lastWatchedAt));
    this.stateWriteTail = write.catch((err) => {
      try {
        this.onError?.(err);
      } catch {
      }
    });
    await write;
    return true;
  }
  stampActiveChannelActivity() {
    return this.stampChannelActivity([...this.channels.keys()]);
  }
  updateChannelState(pubkey, patch) {
    const state = this.readState();
    const current = state.channels[pubkey] || {};
    state.channels[pubkey] = { ...current, ...patch };
    this.writeState(state);
    return state.channels[pubkey];
  }
  removeChannelState(pubkey) {
    this.removeChannelStates([pubkey]);
  }
  removeChannelStates(pubkeys) {
    pubkeys = [...new Set(pubkeys || [])];
    for (const pubkey of pubkeys) delete this.state.channels[pubkey];
    if (!pubkeys.length) return this.stateWriteTail;
    this.touchStorageActivity().catch((err) => this.onError?.(err));
    const write = this.stateWriteTail.then(() => this.stateStore.update({}, pubkeys));
    this.stateWriteTail = write.catch((err) => {
      try {
        this.onError?.(err);
      } catch {
      }
    });
    return write;
  }
  markSeen(pubkey, createdAt = nowSeconds5()) {
    const state = this.readState();
    const current = state.channels[pubkey] || {};
    current.lastSeenAt = Math.max(current.lastSeenAt || 0, createdAt || 0);
    state.channels[pubkey] = current;
    this.writeState(state);
  }
  knownSeeders(pubkey) {
    const channel = this.channels.get(pubkey);
    if (channel?.seeders?.length) return channel.seeders;
    const activity = this.readState().channels[pubkey]?.seederActivity || {};
    return Object.keys(activity);
  }
  recoverySeeders(pubkey) {
    if (!this.offlineRecoverySecondsFor(pubkey)) return [];
    const channel = this.channels.get(pubkey);
    const configuredSeeders = channel?.seeders || [];
    if (configuredSeeders.length) return configuredSeeders.filter((seeder) => seeder !== this.userPubkey);
    const activity = this.readState().channels[pubkey]?.seederActivity || {};
    const cutoff = nowSeconds5() - this.seederOnlineSeconds;
    return Object.entries(activity).filter(([seeder, entry]) => seeder !== this.userPubkey && (entry.lastActiveAt || 0) >= cutoff).sort((a, b) => (b[1].lastActiveAt || 0) - (a[1].lastActiveAt || 0)).slice(0, this.maxDynamicRecoverySeeders).map(([seeder]) => seeder);
  }
  markSeederActive(channelPubkey, seederPubkey, { announced = false, at = nowSeconds5() } = {}) {
    if (!this.offlineRecoverySecondsFor(channelPubkey)) return false;
    const state = this.readState();
    const current = state.channels[channelPubkey] || {};
    const activity = current.seederActivity || {};
    const entry = activity[seederPubkey] || {};
    activity[seederPubkey] = {
      ...entry,
      firstSeenAt: entry.firstSeenAt || at,
      lastActiveAt: Math.max(entry.lastActiveAt || 0, at)
    };
    if (announced) activity[seederPubkey].announcedAt = at;
    current.seederActivity = activity;
    state.channels[channelPubkey] = current;
    this.writeState(state);
    return true;
  }
  trackSeederActivity(channelPubkey, message) {
    const senderPubkey = message.event?.pubkey;
    if (!senderPubkey) return false;
    const channel = this.channels.get(channelPubkey);
    if (!channel) return false;
    const activity = this.readState().channels[channelPubkey]?.seederActivity || {};
    const isPresence = messageCode(message) === SEEDER_PRESENCE_CODE;
    const configuredSeeders = channel.seeders || [];
    const isConfiguredSeeder = configuredSeeders.includes(senderPubkey);
    const isKnownDynamicSeeder = Boolean(activity[senderPubkey]);
    const at = messageTime(message);
    if (isPresence) {
      if (configuredSeeders.length && !isConfiguredSeeder) return false;
      this.markSeederActive(channelPubkey, senderPubkey, { announced: true, at });
      return true;
    }
    if (!isConfiguredSeeder && !isKnownDynamicSeeder) return false;
    this.markSeederActive(channelPubkey, senderPubkey, { at });
    return true;
  }
  contentKeyStatus(contentKeyPubkey) {
    if (!contentKeyPubkey) return "none";
    return contentKeyPubkey === this.contentKeyPubkey ? "known" : "unknown";
  }
  handleContentKeyUsage(channelPubkey, usage) {
    const direction = usage.direction === "sent" ? "sent" : "received";
    const contentKeyPubkey = usage.contentKeyPubkey || "";
    const state = this.readState();
    const current = state.channels[channelPubkey] || {};
    const contentKeyUsage = current.contentKeyUsage || {};
    const previous = contentKeyUsage[direction] || null;
    const contentKeyStatus = this.contentKeyStatus(contentKeyPubkey);
    if (previous && (previous.contentKeyPubkey || "") === contentKeyPubkey && previous.contentKeyStatus === contentKeyStatus) {
      return false;
    }
    const event = {
      type: "content-key-change",
      channelPubkey,
      direction,
      keyRole: usage.keyRole || (direction === "sent" ? "sender" : "receiver"),
      contentKeyPubkey,
      hasContentKey: Boolean(contentKeyPubkey),
      contentKeyStatus,
      previousContentKeyPubkey: previous?.contentKeyPubkey ?? null,
      previousContentKeyStatus: previous?.contentKeyStatus ?? null,
      senderPubkey: usage.senderPubkey || "",
      receiverPubkey: usage.receiverPubkey || "",
      receiverPubkeys: usage.receiverPubkeys || [],
      counterpartyPubkey: direction === "sent" ? usage.receiverPubkey || "" : usage.senderPubkey || "",
      isBroadcast: Boolean(usage.isBroadcast),
      outerId: usage.outer?.id || "",
      outerCreatedAt: usage.outer?.created_at || 0,
      routerPubkey: usage.router?.pubkey || "",
      routerCreatedAt: usage.router?.created_at || 0
    };
    contentKeyUsage[direction] = {
      contentKeyPubkey,
      contentKeyStatus,
      changedAt: nowSeconds5(),
      senderPubkey: event.senderPubkey,
      receiverPubkey: event.receiverPubkey,
      isBroadcast: event.isBroadcast
    };
    current.contentKeyUsage = contentKeyUsage;
    state.channels[channelPubkey] = current;
    this.writeState(state);
    this.onContentKeyChange?.(event);
    return true;
  }
  addOfflineRange(pubkey, start, end) {
    const recoverySeconds = this.offlineRecoverySecondsFor(pubkey);
    if (!recoverySeconds) return;
    const now = nowSeconds5();
    const minStart = now - recoverySeconds;
    const normalized = {
      start: Math.max(0, Math.floor(start)),
      end: Math.floor(end)
    };
    if (normalized.end <= normalized.start || normalized.end < minStart) return;
    normalized.start = Math.max(normalized.start, minStart);
    const state = this.readState();
    const current = state.channels[pubkey] || {};
    const ranges = (current.offlineRanges || []).filter((range) => range.end >= minStart).concat([normalized]).sort((a, b) => a.start - b.start);
    current.offlineRanges = mergeRanges(ranges);
    state.channels[pubkey] = current;
    this.writeState(state);
  }
  closeOpenOfflineRanges() {
    const state = this.readState();
    const end = nowSeconds5();
    for (const pubkey of Object.keys(state.channels)) {
      const current = state.channels[pubkey];
      if (!current.openOfflineStart) continue;
      const recoverySeconds = this.offlineRecoverySecondsFor(pubkey);
      if (!recoverySeconds) {
        delete current.openOfflineStart;
        current.offlineRanges = [];
        state.channels[pubkey] = current;
        continue;
      }
      const minStart = end - recoverySeconds;
      const start = Math.max(minStart, Math.max(0, current.openOfflineStart));
      if (end > start) {
        current.offlineRanges = mergeRanges((current.offlineRanges || []).concat([{ start, end }]));
      }
      delete current.openOfflineStart;
      state.channels[pubkey] = current;
    }
    this.writeState(state);
  }
  async watch(channels = [...this.channels.keys()], { scheduleReloadGap = true } = {}) {
    this.assertOpen();
    const channelPubkeys = uniq4(channels);
    for (const pubkey of channelPubkeys) {
      const channel = this.channels.get(pubkey);
      if (!channel) throw new ValidationError("UNKNOWN_CHANNEL");
      const watchRelays = await this.resolveWatchRelays(channel);
      this.assertOpen();
      const stop = await this._privateMessage.watch({
        channels: [pubkey],
        relays: watchRelays,
        receiverSigner: this.userSigner,
        iykcSigner: this.contentKeySigner,
        privateChannelSigner: channel.signer,
        privateChannelReaderSigner: channel.readerSigner,
        privateChannelReaderPubkey: channel.readerPubkey,
        mode: channel.mode,
        onAsk: (message) => this.queueIncoming(() => this.handleAsk(pubkey, message)),
        onReply: (message) => this.queueIncoming(() => this.handleReply(pubkey, message)),
        onTell: (message) => this.queueIncoming(() => this.handleTell(pubkey, message)),
        onYell: (message) => this.queueIncoming(() => this.handleYell(pubkey, message)),
        onNym: (message) => this.queueIncoming(() => this.handleNym(pubkey, message)),
        onMessage: (message) => this.queueIncoming(() => this.handleMessage(pubkey, message)),
        onSeed: (seed) => this.queueIncoming(() => this.enqueueSeed(pubkey, seed)),
        onContentKeyUsage: (usage) => this.handleContentKeyUsage(pubkey, usage),
        receivedChunkTtlMs: this.receivedChunkTtlMsFor(channel),
        receivedChunkIndexedDB: this._indexedDB,
        onError: (err) => this.onError?.(err)
      });
      if (this.closePromise) {
        await stop?.();
        this.assertOpen();
      }
      this.stopByChannel.set(pubkey, stop);
      this.watchRevisionByChannel.set(pubkey, (this.watchRevisionByChannel.get(pubkey) || 0) + 1);
      this.updateChannelState(pubkey, {
        lastWatchedAt: nowSeconds5(),
        mode: channel.mode,
        relays: watchRelays,
        seeders: channel.seeders,
        offlineRecoverySeconds: channel.offlineRecoverySeconds
      });
      this.debug("watch", {
        channelPubkey: pubkey,
        relays: watchRelays,
        mode: channel.mode,
        seeders: channel.seeders,
        seederCount: channel.seeders.length
      });
      if (scheduleReloadGap) this.scheduleReloadGap(pubkey);
    }
    this.ensureNetworkWatchers();
    this.ensureRelayListWatcher();
    return this;
  }
  unwatch(channels) {
    const channelPubkeys = channels ? uniq4(Array.isArray(channels) ? channels : [channels]) : [...this.stopByChannel.keys()];
    const closing = [];
    for (const pubkey of channelPubkeys) {
      this.cancelReloadGap(pubkey);
      this.watchRevisionByChannel.set(pubkey, (this.watchRevisionByChannel.get(pubkey) || 0) + 1);
      const close = this.stopByChannel.get(pubkey)?.();
      if (close && typeof close.then === "function") closing.push(close);
      this.stopByChannel.delete(pubkey);
      this.stopPresencePublisher(pubkey);
    }
    this.ensureRelayListWatcher();
    return Promise.allSettled(closing);
  }
  nip65WatchChannelPubkeys() {
    return [...this.channels.values()].filter((channel) => channel.usesNip65WatchRelays && this.stopByChannel.has(channel.pubkey)).map((channel) => channel.pubkey);
  }
  ensureRelayListWatcher() {
    const channelPubkeys = this.nip65WatchChannelPubkeys();
    if (!channelPubkeys.length) {
      this.stopRelayListWatcher?.();
      this.stopRelayListWatcher = null;
      this.relayListWatcherPubkey = "";
      return;
    }
    if (this.stopRelayListWatcher && this.relayListWatcherPubkey === this.userPubkey) return;
    this.stopRelayListWatcher?.();
    if (typeof window === "undefined" && this._subscribeRelayListUpdates === subscribeRelayListUpdates) return;
    this.relayListWatcherPubkey = this.userPubkey;
    this.stopRelayListWatcher = this._subscribeRelayListUpdates([this.userPubkey], {
      relayType: "read",
      onChange: () => this.refreshNip65WatchRelays()
    });
  }
  refreshNip65WatchRelays() {
    if (!this.relayListRefreshPromise) {
      this.relayListRefreshPromise = Promise.resolve().then(() => this.refreshNip65WatchRelaysNow()).catch((err) => this.onError?.(err)).finally(() => {
        this.relayListRefreshPromise = null;
      });
    }
    return this.relayListRefreshPromise;
  }
  async refreshNip65WatchRelaysNow() {
    const channelPubkeys = this.nip65WatchChannelPubkeys();
    if (!channelPubkeys.length) {
      this.ensureRelayListWatcher();
      return;
    }
    const until = nowSeconds5();
    for (const pubkey of channelPubkeys) {
      const lastSeenAt = this.readState().channels[pubkey]?.lastSeenAt;
      if (lastSeenAt) this.addOfflineRange(pubkey, Math.max(0, lastSeenAt - this.offlineSkewSeconds), until);
    }
    await this.watch(channelPubkeys, { scheduleReloadGap: false });
    await this.recoverOfflineRanges(channelPubkeys);
  }
  async handleAsk(channelPubkey, message) {
    this.trackSeederActivity(channelPubkey, message);
    if (doesModeStoreRecoverySeeds2(this.channels.get(channelPubkey)?.mode) && messageCode(message) === MISSING_MESSAGES_ASK_CODE) {
      await this.replyWithStoredSeeds(channelPubkey, message);
      return;
    }
    await this.enqueueRumor("ask", channelPubkey, message);
  }
  async handleReply(channelPubkey, message) {
    this.trackSeederActivity(channelPubkey, message);
    if (messageCode(message) === MISSING_MESSAGES_REPLY_CODE) {
      await this.consumeMissingMessagesReply(channelPubkey, message);
      return;
    }
    await this.enqueueRumor("reply", channelPubkey, message);
  }
  async handleTell(channelPubkey, message) {
    this.trackSeederActivity(channelPubkey, message);
    await this.enqueueRumor("tell", channelPubkey, message);
  }
  async handleYell(channelPubkey, message) {
    this.trackSeederActivity(channelPubkey, message);
    if (messageCode(message) === SEEDER_PRESENCE_CODE) return;
    await this.enqueueRumor("yell", channelPubkey, message);
  }
  async handleNym(channelPubkey, message) {
    await this.enqueueRumor("nym", channelPubkey, message);
  }
  async handleMessage(channelPubkey, message) {
    if (eventType(message.event) !== "message") return;
    this.trackSeederActivity(channelPubkey, message);
    await this.enqueueRumor("message", channelPubkey, message);
  }
  async enqueueRumor(type, channelPubkey, message) {
    const channel = this.channels.get(channelPubkey);
    if (channel?.mode === "watchtower" && type !== "ask") return;
    this.markSeen(channelPubkey, message.outer?.created_at || message.event?.created_at || nowSeconds5());
    const eventId = message.event?.id || "";
    const dedupeKey = eventId ? [channelPubkey, type, eventId] : null;
    if (dedupeKey && await this.queue.someBy("byChannelTypeEventId", dedupeKey)) {
      this.debug("dedupe", debugMessageInfo(type, channelPubkey, message));
      return;
    }
    try {
      await this.queue.enqueue({
        type,
        channelPubkey,
        receivedAt: nowSeconds5(),
        event: message.event,
        payload: message.payload,
        question: message.question || null,
        questionId: message.questionId || null,
        outer: message.outer || null,
        meta: message.meta || null
      });
    } catch (err) {
      if (dedupeKey && err?.name === "ConstraintError") {
        this.debug("dedupe", debugMessageInfo(type, channelPubkey, message));
        return;
      }
      throw err;
    }
    this.debug("enqueue", debugMessageInfo(type, channelPubkey, message));
    this.onMessageQueued?.();
  }
  async enqueueSeed(channelPubkey, seed) {
    if (!this.offlineRecoverySecondsFor(channelPubkey)) return;
    const receivedAt = nowSeconds5();
    if (seed.recordType === NYM_CARRIER_SEED_RECORD_TYPE || seed.carriers?.length) {
      const carriers = compactSeedNymCarriers(seed.carriers);
      const recordTime = nymCarrierRecordTime2({ carriers }) || seed.outer?.created_at || receivedAt;
      this.markSeen(channelPubkey, recordTime);
      const key = nymCarrierSeedKey({ channelPubkey, carriers });
      const seedKey = key ? `nym:${key}` : "";
      if (seedKey && await this.seedQueue.someBy("bySeedKey", seedKey)) return;
      await this.seedQueue.enqueue({
        type: "seed",
        recordType: NYM_CARRIER_SEED_RECORD_TYPE,
        channelPubkey,
        receivedAt,
        carriers,
        meta: { channelPubkey: seed.channelPubkey },
        [SEED_KEY]: seedKey || void 0,
        [SEED_TIME]: recordTime
      });
      await this.pruneStoredSeeds(channelPubkey);
      return;
    }
    const rows = compactSeedRouterRows(seed);
    let newest = seed.outer?.created_at || receivedAt;
    for (const row of rows) {
      const rowTime = row.lastSeenAt || row.router?.created_at || receivedAt;
      newest = Math.max(newest, rowTime);
      const rowKey = routerSeedRowKey({ ...row, channelPubkey });
      const seedKey = `router:${rowKey}`;
      const [previous] = await this.seedQueue.removeBy("bySeedKey", seedKey);
      const firstSeenAt = Math.min(previous?.firstSeenAt ?? rowTime, row.firstSeenAt ?? rowTime);
      const lastSeenAt = Math.max(previous?.lastSeenAt ?? rowTime, row.lastSeenAt ?? rowTime);
      await this.seedQueue.enqueue({
        ...row,
        type: "seed",
        recordType: ROUTER_SEED_RECORD_TYPE,
        channelPubkey,
        receivedAt,
        firstSeenAt,
        lastSeenAt,
        meta: { channelPubkey: seed.channelPubkey },
        [SEED_KEY]: seedKey,
        [SEED_TIME]: lastSeenAt || rowTime
      });
    }
    this.markSeen(channelPubkey, newest);
    await this.pruneStoredSeeds(channelPubkey);
  }
  async *messages() {
    for await (const item of this.queue.items()) yield withoutQueueMetadata(item);
  }
  async nextMessage() {
    this.touchStorageActivity().catch((err) => this.onError?.(err));
    await this.queueOperationTail;
    return withoutQueueMetadata(await this.queue.shift());
  }
  async ask({ channelPubkey = this.defaultChannelPubkey(), receiverPubkey, relays, relayToReceivers, message, code, payload, error, content, deletionPubkey }) {
    const channel = this.requireWritableChannel(channelPubkey);
    const routing = await this.resolveSendRouting({ channel, receiverPubkeys: [receiverPubkey], relays, relayToReceivers });
    this.debugSend("ask", channelPubkey, { code, receiverPubkey });
    return this._privateMessage.ask({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderPubkey: channel.readerPubkey,
      receiverPubkey,
      ...routing,
      expirationSeconds: this.eventExpirationSecondsFor(channel),
      temporaryStorageArea: this.temporaryStorageArea,
      deletionPubkey,
      autoDeletionCapability: this.autoDeletionCapabilityFor(channel),
      message,
      code,
      payload,
      error,
      content,
      _getIykcProofs: this.contentKeyLookup()
    });
  }
  async reply({ channelPubkey = this.defaultChannelPubkey(), question, receiverPubkey, relays, relayToReceivers, message, code, payload, error, content, deletionPubkey }) {
    const channel = this.requireWritableChannel(channelPubkey);
    const resolvedReceiverPubkey = receiverPubkey || question?.pubkey || "";
    const routing = await this.resolveSendRouting({ channel, receiverPubkeys: [resolvedReceiverPubkey], relays, relayToReceivers });
    this.debugSend("reply", channelPubkey, { code, receiverPubkey: receiverPubkey || question?.pubkey || "" });
    return this._privateMessage.reply({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderPubkey: channel.readerPubkey,
      question,
      receiverPubkey,
      ...routing,
      expirationSeconds: this.eventExpirationSecondsFor(channel),
      temporaryStorageArea: this.temporaryStorageArea,
      deletionPubkey,
      autoDeletionCapability: this.autoDeletionCapabilityFor(channel),
      message,
      code,
      payload,
      error,
      content,
      _getIykcProofs: this.contentKeyLookup()
    });
  }
  async tell({ channelPubkey = this.defaultChannelPubkey(), receiverPubkey, relays, relayToReceivers, message, code, payload, error, content, deletionPubkey }) {
    const channel = this.requireWritableChannel(channelPubkey);
    const routing = await this.resolveSendRouting({ channel, receiverPubkeys: [receiverPubkey], relays, relayToReceivers });
    this.debugSend("tell", channelPubkey, { code, receiverPubkey });
    return this._privateMessage.tell({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderPubkey: channel.readerPubkey,
      receiverPubkey,
      ...routing,
      expirationSeconds: this.eventExpirationSecondsFor(channel),
      temporaryStorageArea: this.temporaryStorageArea,
      deletionPubkey,
      autoDeletionCapability: this.autoDeletionCapabilityFor(channel),
      message,
      code,
      payload,
      error,
      content,
      _getIykcProofs: this.contentKeyLookup()
    });
  }
  async yell({ channelPubkey = this.defaultChannelPubkey(), receiverPubkeys: receiverPubkeys2, relays, relayToReceivers, message, code, payload, error, content, deletionPubkey }) {
    const channel = this.requireWritableChannel(channelPubkey);
    const routing = await this.resolveSendRouting({ channel, receiverPubkeys: receiverPubkeys2, relays, relayToReceivers });
    this.debugSend("yell", channelPubkey, { code, receiverPubkeys: receiverPubkeys2 });
    return this._privateMessage.yell({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderPubkey: channel.readerPubkey,
      receiverPubkeys: receiverPubkeys2,
      ...routing,
      expirationSeconds: this.eventExpirationSecondsFor(channel),
      temporaryStorageArea: this.temporaryStorageArea,
      deletionPubkey,
      autoDeletionCapability: this.autoDeletionCapabilityFor(channel),
      message,
      code,
      payload,
      error,
      content,
      _getIykcProofs: this.contentKeyLookup()
    });
  }
  async broadcastRumor({ channelPubkey = this.defaultChannelPubkey(), receiverPubkeys: receiverPubkeys2, relays, relayToReceivers, rumor, deletionPubkey }) {
    const channel = this.requireWritableChannel(channelPubkey);
    const routing = await this.resolveSendRouting({ channel, receiverPubkeys: receiverPubkeys2, relays, relayToReceivers });
    this.debugSend("broadcastRumor", channelPubkey, { receiverPubkeys: receiverPubkeys2 });
    return this._privateMessage.broadcastRumor({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderPubkey: channel.readerPubkey,
      receiverPubkeys: receiverPubkeys2,
      ...routing,
      expirationSeconds: this.eventExpirationSecondsFor(channel),
      temporaryStorageArea: this.temporaryStorageArea,
      deletionPubkey,
      autoDeletionCapability: this.autoDeletionCapabilityFor(channel),
      rumor,
      _getIykcProofs: this.contentKeyLookup()
    });
  }
  async broadcastEvent({ channelPubkey = this.defaultChannelPubkey(), receiverPubkeys: receiverPubkeys2, relays, relayToReceivers, event, deletionPubkey }) {
    const channel = this.requireWritableChannel(channelPubkey);
    const routing = await this.resolveSendRouting({ channel, receiverPubkeys: receiverPubkeys2, relays, relayToReceivers });
    this.debugSend("broadcastEvent", channelPubkey, { receiverPubkeys: receiverPubkeys2 });
    return this._privateMessage.broadcastEvent({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderPubkey: channel.readerPubkey,
      receiverPubkeys: receiverPubkeys2,
      ...routing,
      expirationSeconds: this.eventExpirationSecondsFor(channel),
      temporaryStorageArea: this.temporaryStorageArea,
      deletionPubkey,
      autoDeletionCapability: this.autoDeletionCapabilityFor(channel),
      event,
      _getIykcProofs: this.contentKeyLookup()
    });
  }
  async broadcastNymRumor({ channelPubkey = this.defaultChannelPubkey(), receiverPubkeys: receiverPubkeys2, relays, relayToReceivers, rumor, nymSigner, deletionPubkey }) {
    const channel = this.requireWritableChannel(channelPubkey);
    const resolvedNymSigner = this.requireNymSigner(channel, nymSigner);
    const routing = await this.resolveSendRouting({ channel, receiverPubkeys: receiverPubkeys2, relays, relayToReceivers });
    this.debugSend("broadcastNymRumor", channelPubkey, { receiverPubkeys: receiverPubkeys2 });
    return this._privateMessage.broadcastNymRumor({
      nymSigner: resolvedNymSigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderPubkey: channel.readerPubkey,
      ...routing,
      expirationSeconds: this.eventExpirationSecondsFor(channel),
      deletionPubkey,
      autoDeletionCapability: this.autoDeletionCapabilityFor(channel),
      rumor
    });
  }
  async broadcastNymEvent({ channelPubkey = this.defaultChannelPubkey(), receiverPubkeys: receiverPubkeys2, relays, relayToReceivers, event, nymSigner, deletionPubkey }) {
    const channel = this.requireWritableChannel(channelPubkey);
    const resolvedNymSigner = this.requireNymSigner(channel, nymSigner);
    const routing = await this.resolveSendRouting({ channel, receiverPubkeys: receiverPubkeys2, relays, relayToReceivers });
    this.debugSend("broadcastNymEvent", channelPubkey, { receiverPubkeys: receiverPubkeys2 });
    return this._privateMessage.broadcastNymEvent({
      nymSigner: resolvedNymSigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderPubkey: channel.readerPubkey,
      ...routing,
      expirationSeconds: this.eventExpirationSecondsFor(channel),
      deletionPubkey,
      autoDeletionCapability: this.autoDeletionCapabilityFor(channel),
      event
    });
  }
  async publishSeederPresence(channelPubkey = this.defaultChannelPubkey()) {
    const channel = this.requireWritableChannel(channelPubkey);
    if (!this.offlineRecoverySecondsFor(channel)) return null;
    const receiverPubkeys2 = uniq4([...this.knownSeeders(channelPubkey), this.userPubkey]);
    const routing = await this.resolveSendRouting({ channel, receiverPubkeys: receiverPubkeys2 });
    this.debugSend("yell", channelPubkey, { code: SEEDER_PRESENCE_CODE, receiverPubkeys: receiverPubkeys2 });
    return this._privateMessage.yell({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderPubkey: channel.readerPubkey,
      receiverPubkeys: receiverPubkeys2,
      ...routing,
      expirationSeconds: this.eventExpirationSecondsFor(channel),
      temporaryStorageArea: this.temporaryStorageArea,
      autoDeletionCapability: this.autoDeletionCapabilityFor(channel),
      code: SEEDER_PRESENCE_CODE,
      payload: {},
      _getIykcProofs: this.contentKeyLookup()
    });
  }
  async startPresencePublisher(channelPubkey) {
    if (!this.offlineRecoverySecondsFor(channelPubkey)) return;
    if (this.presenceTimers.has(channelPubkey)) return;
    try {
      await this.publishSeederPresence(channelPubkey);
    } catch (err) {
      console.warn("private-messenger seeder presence failed", err?.message ?? err);
    }
    const timer = this._setInterval(() => {
      return this.publishSeederPresence(channelPubkey).catch((err) => {
        console.warn("private-messenger seeder presence failed", err?.message ?? err);
      });
    }, this.seederPresenceIntervalMs);
    timer?.unref?.();
    this.presenceTimers.set(channelPubkey, timer);
  }
  stopPresencePublisher(channelPubkey) {
    const timer = this.presenceTimers.get(channelPubkey);
    if (timer) this._clearInterval(timer);
    this.presenceTimers.delete(channelPubkey);
  }
  async reconcilePresencePublishers() {
    const starts = [];
    for (const pubkey of [...this.presenceTimers.keys()]) {
      if (!doesModeStoreRecoverySeeds2(this.channels.get(pubkey)?.mode) || !this.offlineRecoverySecondsFor(pubkey)) this.stopPresencePublisher(pubkey);
    }
    for (const [pubkey, channel] of this.channels) {
      if (doesModeStoreRecoverySeeds2(channel.mode) && this.offlineRecoverySecondsFor(channel)) starts.push(this.startPresencePublisher(pubkey));
      else this.stopPresencePublisher(pubkey);
    }
    await Promise.all(starts);
  }
  createMissingMessageReplyPacker(options) {
    return createMissingMessageReplyPacker({ messenger: this, ...options });
  }
  createEventReplyPacker(options) {
    return createEventReplyPacker({ messenger: this, ...options });
  }
  defaultChannelPubkey() {
    return this.channels.keys().next().value;
  }
  requireChannel(pubkey) {
    const channel = this.channels.get(pubkey);
    if (!channel) throw new ValidationError("UNKNOWN_CHANNEL");
    return channel;
  }
  requireWritableChannel(pubkey) {
    const channel = this.requireChannel(pubkey);
    if (!channel.signer) throw new ValidationError("PRIVATE_CHANNEL_WRITER_REQUIRED");
    return channel;
  }
  autoDeletionCapabilityFor(channel) {
    return channel.autoDeletionCapability ?? this.autoDeletionCapability;
  }
  requestedOfflineRecoverySecondsFor(channelOrPubkey) {
    const channel = typeof channelOrPubkey === "string" ? this.channels.get(channelOrPubkey) : channelOrPubkey;
    if (channel?.offlineRecoverySeconds !== void 0) return channel.offlineRecoverySeconds;
    const pubkey = typeof channelOrPubkey === "string" ? channelOrPubkey : channelOrPubkey?.pubkey;
    const persisted = pubkey ? this.state.channels[pubkey]?.offlineRecoverySeconds : void 0;
    return persisted === void 0 ? this.offlineRecoverySeconds : normalizeOfflineRecoverySeconds(persisted);
  }
  offlineRecoverySecondsFor(channelOrPubkey) {
    return Math.min(
      this.requestedOfflineRecoverySecondsFor(channelOrPubkey),
      this.staleChannelSeconds,
      this.identityStorageRetentionSeconds
    );
  }
  staleChannelSecondsForCleanup() {
    return Math.min(this.staleChannelSeconds, this.identityStorageRetentionSeconds);
  }
  eventExpirationSecondsFor(channel) {
    return this.offlineRecoverySecondsFor(channel) || EXPIRATION_SECONDS;
  }
  receivedChunkTtlMsFor(channel) {
    const seconds = this.offlineRecoverySecondsFor(channel);
    return seconds ? seconds * 1e3 : DEFAULT_RECEIVED_CHUNK_TTL_MS;
  }
  async applyRecoveryPolicies(channels) {
    return this.runQueueOperation(async () => {
      const state = this.readState();
      const now = nowSeconds5();
      for (const channel of channels) {
        const current = state.channels[channel.pubkey] || {};
        const requestedSeconds = channel.offlineRecoverySeconds;
        const effectiveSeconds = this.offlineRecoverySecondsFor(channel);
        current.offlineRecoverySeconds = requestedSeconds;
        if (!effectiveSeconds) {
          delete current.openOfflineStart;
          current.offlineRanges = [];
        } else {
          const cutoff = now - effectiveSeconds;
          current.offlineRanges = mergeRanges((current.offlineRanges || []).filter((range) => range.end >= cutoff).map((range) => ({ ...range, start: Math.max(range.start, cutoff) })));
          if (current.openOfflineStart) current.openOfflineStart = Math.max(current.openOfflineStart, cutoff);
        }
        state.channels[channel.pubkey] = current;
      }
      this.writeState(state);
      await this.flushStateWrites();
      for (const channel of channels) await this.pruneStoredSeeds(channel.pubkey);
    });
  }
  requireNymSigner(channel, override) {
    const signer = override || channel?.nymSigner || this.nymSigner;
    if (!signer?.getPublicKey) throw new ValidationError("NYM_SIGNER_REQUIRED");
    return signer;
  }
  contentKeyLookup() {
    return this.useContentKeys ? void 0 : noContentKeys;
  }
  scheduleReloadGap(pubkey) {
    this.cancelReloadGap(pubkey);
    if (!this.offlineRecoverySecondsFor(pubkey)) return;
    const current = this.readState().channels[pubkey];
    const start = current?.openOfflineStart || current?.lastSeenAt;
    if (!start) return;
    const revision = this.watchRevisionByChannel.get(pubkey) || 0;
    const token = {};
    const timer = this._setTimeout(async () => {
      const scheduled = this.reloadGapTimers.get(pubkey);
      if (scheduled?.token !== token) return;
      this.reloadGapTimers.delete(pubkey);
      if (this.closePromise || !this.channels.has(pubkey) || !this.stopByChannel.has(pubkey)) return;
      if ((this.watchRevisionByChannel.get(pubkey) || 0) !== revision) return;
      this.addOfflineRange(pubkey, Math.max(0, start - this.offlineSkewSeconds), nowSeconds5());
      await this.recoverOfflineRanges([pubkey]);
    }, this.reloadGapDelayMs);
    this.reloadGapTimers.set(pubkey, { timer, token, revision });
  }
  cancelReloadGap(pubkey) {
    const scheduled = this.reloadGapTimers.get(pubkey);
    if (!scheduled) return;
    this.reloadGapTimers.delete(pubkey);
    this._clearTimeout(scheduled.timer);
  }
  // Browser-offline recovery owns durable gaps. Stop only the child live reads;
  // unwatch() would also stop seeder-presence publishing and alter channel state.
  #pauseLiveWatches() {
    for (const [pubkey, stop] of this.stopByChannel) {
      this.cancelReloadGap(pubkey);
      this.watchRevisionByChannel.set(pubkey, (this.watchRevisionByChannel.get(pubkey) || 0) + 1);
      stop?.();
    }
    this.stopByChannel.clear();
  }
  async #resumeLiveWatches() {
    const channelPubkeys = [...this.channels.keys()];
    await this.watch(channelPubkeys, { scheduleReloadGap: false });
    return channelPubkeys;
  }
  ensureNetworkWatchers() {
    if (typeof window === "undefined") return;
    if (!this.stopOffline) {
      const offline = () => {
        const state = this.readState();
        const start = Math.max(0, nowSeconds5() - this.offlineSkewSeconds);
        for (const pubkey of this.channels.keys()) {
          if (!this.offlineRecoverySecondsFor(pubkey)) continue;
          const current = state.channels[pubkey] || {};
          current.openOfflineStart ||= start;
          state.channels[pubkey] = current;
        }
        this.writeState(state);
        this.#pauseLiveWatches();
      };
      window.addEventListener("offline", offline);
      this.stopOffline = () => window.removeEventListener("offline", offline);
    }
    if (!this.stopOnline) {
      const online = async () => {
        this.closeOpenOfflineRanges();
        const channelPubkeys = await this.#resumeLiveWatches();
        await this.recoverOfflineRanges(channelPubkeys);
      };
      window.addEventListener("online", online);
      this.stopOnline = () => window.removeEventListener("online", online);
    }
  }
  async askSeedersForMissingRange(channelPubkey, since, until) {
    const { asks } = await this.#askSeedersForMissingRangeAttempt(channelPubkey, since, until);
    return asks;
  }
  async #askSeedersForMissingRangeAttempt(channelPubkey, since, until) {
    if (!this.offlineRecoverySecondsFor(channelPubkey)) return { asks: [], failures: [] };
    if (!this.channels.get(channelPubkey)?.signer) return { asks: [], failures: [] };
    const seeders = this.recoverySeeders(channelPubkey);
    if (!seeders.length || until < since) return { asks: [], failures: [] };
    const asks = [];
    const failures = [];
    for (const seeder of seeders) {
      try {
        const ask2 = await this.ask({
          channelPubkey,
          receiverPubkey: seeder,
          code: MISSING_MESSAGES_ASK_CODE,
          payload: { since, until }
        });
        asks.push(ask2);
        const reports = ask2?.delivery?.reports;
        if (!Array.isArray(reports) || !reports.length || reports.some((report) => report?.success !== true)) {
          throw new Error("PRIVATE_MESSAGE_NOT_PUBLISHED");
        }
      } catch (err) {
        failures.push({ seeder, error: err });
        console.warn("private-messenger seeder recovery ask failed", seeder, err?.message ?? err);
      }
    }
    return { asks, failures };
  }
  async askSeedersForRelayLeftEdge(channelPubkey, range, fetchedEvents) {
    const { asks } = await this.#askSeedersForRelayLeftEdgeAttempt(channelPubkey, range, fetchedEvents);
    return asks;
  }
  async #askSeedersForRelayLeftEdgeAttempt(channelPubkey, range, fetchedEvents) {
    const oldest = oldestCreatedAt(fetchedEvents);
    const until = oldest == null ? range.end : Math.min(range.end, oldest);
    if (until < range.start) return { asks: [], failures: [] };
    return this.#askSeedersForMissingRangeAttempt(channelPubkey, range.start, until);
  }
  async replyWithStoredSeeds(channelPubkey, message) {
    const payload = isPlainObject2(message.payload?.payload) ? message.payload.payload : {};
    const since = Number.isFinite(payload.since) ? payload.since : void 0;
    const until = Number.isFinite(payload.until) ? payload.until : void 0;
    const packer = this.createMissingMessageReplyPacker({
      channelPubkey,
      question: message.event,
      receiverPubkey: message.event?.pubkey,
      since,
      until,
      sendEmptyReply: !this.offlineRecoverySecondsFor(channelPubkey)
    });
    if (this.offlineRecoverySecondsFor(channelPubkey)) {
      for await (const seed of this.seedQueue.storedItemsBy("byChannel", channelPubkey)) {
        await packer.update(seed);
      }
    }
    await packer.finalize();
  }
  async consumeMissingMessagesReply(channelPubkey, message) {
    const payload = message.payload?.payload;
    const jsonl = typeof payload?.jsonl === "string" ? payload.jsonl : "";
    if (!jsonl) return;
    for (const line of splitJsonl2(jsonl)) {
      const record = parseJson(line, null);
      if (!record) continue;
      const recovered = await this.messageFromBackfillRecord(channelPubkey, record);
      if (!recovered) continue;
      await this.enqueueRumor(recovered.type, channelPubkey, {
        event: recovered.event,
        outer: recovered.outer,
        meta: { ...recovered.meta || {}, channelPubkey, recoveredFromSeeder: message.event?.pubkey || "" },
        payload: recovered.payload
      });
    }
  }
  async messageFromBackfillRecord(channelPubkey, record) {
    if (record?.recordType === NYM_CARRIER_SEED_RECORD_TYPE) {
      const event2 = this._privateChannel.eventFromNymCarriers(record.carriers);
      return {
        type: "nym",
        event: event2,
        outer: { id: "", created_at: nymCarrierRecordTime2(record) },
        meta: { channelPubkey, carriers: record.carriers },
        payload: parseEventContent2(event2)
      };
    }
    const routerRecord = record?.recordType === ROUTER_SEED_RECORD_TYPE ? record.router : null;
    if (!isPrivateChannelRouter(routerRecord)) return null;
    if (!this._privateChannel.unwrapEvent) throw new ValidationError("PRIVATE_CHANNEL_UNWRAP_UNSUPPORTED");
    const channel = this.requireChannel(channelPubkey);
    const router = {
      kind: ROUTER_KIND,
      pubkey: routerRecord.pubkey,
      created_at: routerRecord.created_at || nowSeconds5(),
      tags: (routerRecord.tags || []).filter((tag) => tag[0] !== "c").concat([["c", "0", "1"]]),
      content: routerRecord.content
    };
    const encryptSigner = channel.readerSigner && channel.readerSigner !== channel.signer ? channel.readerSigner : channel.signer;
    const encryptPeerPubkey = encryptSigner === channel.signer ? channel.readerPubkey : channelPubkey;
    const outer = {
      kind: PRIVATE_BROADCAST_KIND,
      pubkey: channelPubkey,
      created_at: router.created_at,
      tags: [],
      content: await encryptSigner.nip44v3Encrypt(
        encryptPeerPubkey,
        PRIVATE_BROADCAST_KIND,
        "",
        textToBase642(JSON.stringify(router))
      )
    };
    const event = await this._privateChannel.unwrapEvent({
      receiverSigner: this.userSigner,
      iykcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      privateChannelReaderSigner: channel.readerSigner,
      privateChannelReaderPubkey: channel.readerPubkey,
      event: outer,
      receiverPubkey: this.userPubkey
    });
    if (!event) return null;
    return {
      type: eventType(event),
      event,
      outer,
      meta: { channelPubkey },
      payload: parseEventContent2(event)
    };
  }
  async recoverOfflineRanges(channels = [...this.stopByChannel.keys()]) {
    const state = this.readState();
    const now = nowSeconds5();
    for (const pubkey of uniq4(channels)) {
      const channel = this.channels.get(pubkey);
      const current = state.channels[pubkey];
      if (!channel || !current?.offlineRanges?.length) continue;
      const recoverySeconds = this.offlineRecoverySecondsFor(channel);
      if (!recoverySeconds) continue;
      const minStart = now - recoverySeconds;
      const processedRanges = new Set(current.offlineRanges.map((range) => `${range.start}:${range.end}`));
      const remaining = [];
      for (const range of current.offlineRanges) {
        if (range.end < minStart) continue;
        const watchRevision = this.watchRevisionByChannel.get(pubkey) || 0;
        try {
          const fetchRelays = await this.resolveWatchRelays(channel);
          const fetchedEvents = await this._privateChannel.fetch({
            receiverSigner: this.userSigner,
            iykcSigner: this.contentKeySigner,
            privateChannelSigner: channel.signer,
            privateChannelReaderSigner: channel.readerSigner,
            privateChannelReaderPubkey: channel.readerPubkey,
            privateChannelPubkeys: [pubkey],
            receiverPubkey: this.userPubkey,
            relays: fetchRelays,
            since: Math.max(0, range.start),
            until: range.end,
            mode: channel.mode,
            modeByPubkey: { [pubkey]: channel.mode },
            receivedChunkTtlMs: this.receivedChunkTtlMsFor(channel),
            receivedChunkIndexedDB: this._indexedDB,
            onEvent: (event, outer, meta) => this.queueIncoming(() => this.enqueueRumor(eventType(event), pubkey, { event, outer, meta, payload: parseEventContent2(event) })),
            onNymEvent: (event, outer, meta) => this.queueIncoming(() => this.enqueueRumor("nym", pubkey, { event, outer, meta, payload: parseEventContent2(event) })),
            onSeedEvent: (seed) => this.queueIncoming(() => this.enqueueSeed(pubkey, seed)),
            onContentKeyUsage: (usage) => this.handleContentKeyUsage(pubkey, usage),
            onError: (err) => {
              throw err;
            }
          }) || [];
          const attempt = await this.#askSeedersForRelayLeftEdgeAttempt(pubkey, range, fetchedEvents);
          const lifecycleChanged = this.closePromise || !this.channels.has(pubkey) || !this.stopByChannel.has(pubkey) || (this.watchRevisionByChannel.get(pubkey) || 0) !== watchRevision;
          if (lifecycleChanged || attempt.failures.length) remaining.push(range);
        } catch (err) {
          this.onError?.(err);
          remaining.push(range);
        }
      }
      const fresh = this.readState();
      const concurrentRanges = (fresh.channels[pubkey]?.offlineRanges || []).filter((range) => !processedRanges.has(`${range.start}:${range.end}`));
      fresh.channels[pubkey] = {
        ...fresh.channels[pubkey] || {},
        offlineRanges: mergeRanges(concurrentRanges.concat(remaining))
      };
      this.writeState(fresh);
    }
  }
  async clearChannel(pubkey) {
    return this.runQueueOperation(async () => {
      await this.unwatch(pubkey);
      await this._privateMessage.clearChannelState?.(pubkey);
      this.channels.delete(pubkey);
      this.removeChannelState(pubkey);
      await this.flushStateWrites();
      await this.queue.removeBy("byChannel", pubkey);
      await this.seedQueue.removeBy("byChannel", pubkey);
      await this.touchStorageActivity({ force: true });
      this.ensureRelayListWatcher();
    });
  }
  async clearQueue() {
    return this.runQueueOperation(() => this.queue.clear());
  }
  async cleanupStaleChannels({ storageSnapshot } = {}) {
    if (!this.prefix) return;
    storageSnapshot ||= await this.readStoragePolicySnapshot();
    if (!storageSnapshot) return;
    const activeChannelPubkeys = new Set(storageSnapshot.activeChannelPubkeys || []);
    return this.runQueueOperation(async () => {
      await this.flushStateWrites();
      const state = { channels: await this.stateStore.load() };
      const cutoff = nowSeconds5() - this.staleChannelSecondsForCleanup();
      const stalePubkeys = [];
      for (const [pubkey, channel] of Object.entries(state.channels)) {
        if (activeChannelPubkeys.has(pubkey)) continue;
        if ((channel.lastWatchedAt || 0) >= cutoff) continue;
        delete state.channels[pubkey];
        stalePubkeys.push(pubkey);
        await this.queue?.removeBy("byChannel", pubkey);
        await this.seedQueue?.removeBy("byChannel", pubkey);
      }
      this.state = state;
      if (stalePubkeys.length) await this.removeChannelStates(stalePubkeys);
    });
  }
  async pruneStoredSeeds(channelPubkey) {
    if (!this.seedQueue) return;
    const keyRange = globalThis.IDBKeyRange;
    if (!channelPubkey) {
      const pubkeys = /* @__PURE__ */ new Set([...Object.keys(this.state.channels), ...this.channels.keys()]);
      for (const pubkey of pubkeys) await this.pruneStoredSeeds(pubkey);
      await this.seedQueue.removeWhere((item) => !pubkeys.has(item.channelPubkey));
      return;
    }
    const recoverySeconds = this.offlineRecoverySecondsFor(channelPubkey);
    if (!recoverySeconds) {
      await this.seedQueue.removeBy("byChannel", channelPubkey);
      return;
    }
    const cutoff = nowSeconds5() - recoverySeconds;
    if (cutoff <= 0) return;
    if (keyRange?.bound) {
      await this.seedQueue.removeBy("byChannelTime", keyRange.bound([channelPubkey, 0], [channelPubkey, cutoff], false, true));
      return;
    }
    await this.seedQueue.removeWhere((item) => {
      if (item.channelPubkey !== channelPubkey) return false;
      return (seedRecordTime(item) || item.receivedAt || 0) < cutoff;
    });
  }
  close() {
    if (this.closePromise) return this.closePromise;
    const initSettledPromise = this.initSettledPromise;
    let unwatchPromise;
    try {
      unwatchPromise = Promise.resolve(this.unwatch());
    } catch (err) {
      unwatchPromise = Promise.reject(err);
    }
    for (const pubkey of [...this.presenceTimers.keys()]) this.stopPresencePublisher(pubkey);
    this.stopRelayListWatcher?.();
    this.stopRelayListWatcher = null;
    this.relayListWatcherPubkey = "";
    this.stopOffline?.();
    this.stopOnline?.();
    this.stopOffline = null;
    this.stopOnline = null;
    this.stopStorageMaintenance();
    this.stopStoragePolicyBroadcast();
    this.closePromise = (async () => {
      let unwatchError;
      try {
        await unwatchPromise;
      } catch (err) {
        unwatchError = err;
      }
      await initSettledPromise;
      await this.stampActiveChannelActivity();
      await this.queueOperationTail;
      await this.stateWriteTail;
      try {
        await this.storageTouchPromise;
      } catch {
      }
      await this.storageMaintenancePromise;
      try {
        await this.storagePolicyRefreshTail;
      } catch {
      }
      await Promise.all([
        this.queue?.close?.(),
        this.seedQueue?.close?.(),
        this.stateStore?.close?.()
      ]);
      if (this.storageActive) {
        await releasePrivateMessengerStorage({
          userPubkey: this.userPubkey,
          leaseId: this.storageLeaseId,
          indexedDB: this._indexedDB
        });
      }
      this.storageActive = false;
      if (this.identityStorageRetentionSeconds === 0) {
        await _PrivateMessenger.maintainStorage({
          indexedDB: this._indexedDB,
          temporaryStorageArea: this.temporaryStorageArea
        });
      }
      if (unwatchError) throw unwatchError;
    })();
    return this.closePromise;
  }
};
function mergeRanges(ranges) {
  const out = [];
  for (const range of ranges) {
    const last = out[out.length - 1];
    if (!last || range.start > last.end + 1) out.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  return out;
}
function eventType(event) {
  if (event.kind === ASK_KIND) return "ask";
  if (event.kind === REPLY_KIND) return "reply";
  if (event.kind === TELL_KIND) return event.tags?.some((t) => t[0] === "r") ? "tell" : "yell";
  return "message";
}
function parseEventContent2(event) {
  return parseRumorContent(event);
}
function messageCode(message) {
  return isPlainObject2(message.payload) && Object.prototype.hasOwnProperty.call(message.payload, "code") ? message.payload.code : null;
}
function debugMessageInfo(type, channelPubkey, message) {
  return {
    type,
    code: messageCode(message) || "",
    channelPubkey,
    senderPubkey: message.event?.pubkey || "",
    eventId: message.event?.id || "",
    outerId: message.outer?.id || "",
    outerCreatedAt: message.outer?.created_at || message.event?.created_at || 0
  };
}
function messageTime(message) {
  return message.outer?.created_at || message.event?.created_at || nowSeconds5();
}
function oldestCreatedAt(events) {
  let oldest = null;
  for (const event of events || []) {
    if (!Number.isFinite(event?.created_at)) continue;
    oldest = oldest == null ? event.created_at : Math.min(oldest, event.created_at);
  }
  return oldest;
}
function relayMapRelays(relayToReceivers) {
  if (!relayToReceivers) return [];
  const entries = relayToReceivers instanceof Map ? relayToReceivers.entries() : Object.entries(relayToReceivers);
  return uniq4([...entries].map(([relay]) => relay));
}
function isPrivateChannelRouter(event) {
  return event?.kind === ROUTER_KIND && typeof event.content === "string" && event.tags?.some((tag) => tag[0] === "c");
}
function nymCarrierRecordTime2(record) {
  return record?.carriers?.reduce((max, carrier) => Math.max(max, carrier.created_at || 0), 0) || 0;
}
function nymCarrierSeedKey(record) {
  const carriers = record?.carriers || [];
  if (!carriers.length) return "";
  const ids = carriers.map((carrier) => carrier.id || "").join(",");
  return `${record.channelPubkey || ""}:${carriers[0]?.pubkey || ""}:${ids}`;
}
function withoutQueueMetadata(item) {
  if (!item) return null;
  const value = { ...item };
  delete value[SEED_KEY];
  delete value[SEED_TIME];
  return value;
}
function seedRecordTime(record) {
  if (record?.recordType === NYM_CARRIER_SEED_RECORD_TYPE || record?.carriers?.length) return nymCarrierRecordTime2(record);
  if (record?.recordType === ROUTER_SEED_RECORD_TYPE) return record.lastSeenAt || record.router?.created_at || 0;
  return record?.router?.created_at || 0;
}
function splitJsonl2(jsonl) {
  return String(jsonl || "").split("\n").filter(Boolean);
}

// src/helpers/signer-key.js
var SIGNER_KEY_SALT = "nostr-device-signer-v1";
var SIGNER_KEY_INFO = "";
async function deriveSignerSeckey(prfBytes) {
  return bytesToHex3(await deriveSecretKey(prfBytes, SIGNER_KEY_INFO, SIGNER_KEY_SALT));
}

// src/services/secrets.js
var CONTENT_KEYS_KEY = "ez-vault:content-keys";
var HEX32 = /^[0-9a-f]{64}$/i;
var VAULT_NIP44_KIND = 2;
var VAULT_SECRETS_SCOPE = "vault-secrets-v1";
var VAULT_CONTENT_KEYS_SCOPE = "vault-content-keys-v1";
var VAULT_LOCAL_STATE_SCOPE = "vault-local-state-v1";
var vaultPrivkey = null;
var vaultConversationKey = null;
var nsecSignersByPubkey = /* @__PURE__ */ new Map();
var bunkerHandlesByPubkey = /* @__PURE__ */ new Map();
var accountTypeByPubkey = /* @__PURE__ */ new Map();
var contentKeySignersByOwnerPubkey = /* @__PURE__ */ new Map();
var rawNsecHexByPubkey = /* @__PURE__ */ new Map();
var rawClientKeyHexByPubkey = /* @__PURE__ */ new Map();
var rawContentKeyHexByOwnerPubkey = /* @__PURE__ */ new Map();
var deviceSignerSeckey = null;
var listeners2 = /* @__PURE__ */ new Set();
var contentKeyListeners = /* @__PURE__ */ new Set();
function notify2() {
  for (const fn of listeners2) {
    try {
      fn();
    } catch (err) {
      console.warn("secrets listener threw", err);
    }
  }
}
function notifyContentKeys(ownerPubkey) {
  for (const fn of contentKeyListeners) {
    try {
      fn(ownerPubkey);
    } catch (err) {
      console.warn("content key listener threw", err);
    }
  }
}
function nowSeconds6() {
  return Math.floor(Date.now() / 1e3);
}
function deriveVaultConversationKey(vaultKeyBytes) {
  return sharedXOnlySecret(vaultKeyBytes, getPublicKey(vaultKeyBytes));
}
function vaultEncryptWithScope(plaintext, scope) {
  if (!vaultConversationKey) throw new Error("VAULT_LOCKED");
  return encryptWithConversationKey(vaultConversationKey, VAULT_NIP44_KIND, scope, plaintext);
}
function vaultDecryptWithScope(ciphertext, scope) {
  if (!vaultConversationKey) throw new Error("VAULT_LOCKED");
  return decryptWithConversationKey(vaultConversationKey, VAULT_NIP44_KIND, scope, ciphertext);
}
function dropPriorEntry(pubkey) {
  const t = accountTypeByPubkey.get(pubkey);
  if (!t) return false;
  let contentKeysChanged = false;
  if (t === "nsec") {
    NsecSigner.release(pubkey);
    nsecSignersByPubkey.delete(pubkey);
    rawNsecHexByPubkey.delete(pubkey);
    contentKeysChanged = dropContentKeysForOwner(pubkey) || contentKeysChanged;
  } else if (t === "bunker") {
    const handle = bunkerHandlesByPubkey.get(pubkey);
    if (handle) handle.close();
    bunkerHandlesByPubkey.delete(pubkey);
    rawClientKeyHexByPubkey.delete(pubkey);
    contentKeysChanged = dropContentKeysForOwner(pubkey) || contentKeysChanged;
  }
  accountTypeByPubkey.delete(pubkey);
  return contentKeysChanged;
}
function refreshContentSignerBindings(ownerPubkey) {
  const ownerSigner = nsecSignersByPubkey.get(ownerPubkey);
  if (!ownerSigner) return;
  NsecSigner.setContentSigners(ownerSigner, [...contentKeySignersByOwnerPubkey.get(ownerPubkey)?.values() || []]);
}
function clearContentSignerBindings() {
  for (const signer of nsecSignersByPubkey.values()) NsecSigner.setContentSigners(signer, []);
}
function dropContentKeysForOwner(ownerPubkey) {
  const signers = contentKeySignersByOwnerPubkey.get(ownerPubkey);
  const hadKeys = Boolean(signers?.size || rawContentKeyHexByOwnerPubkey.get(ownerPubkey)?.size);
  if (signers) {
    for (const pubkey of signers.keys()) NsecSigner.release(pubkey);
  }
  contentKeySignersByOwnerPubkey.delete(ownerPubkey);
  rawContentKeyHexByOwnerPubkey.delete(ownerPubkey);
  refreshContentSignerBindings(ownerPubkey);
  return hadKeys;
}
function dropContentKey(ownerPubkey, contentPubkey) {
  const signers = contentKeySignersByOwnerPubkey.get(ownerPubkey);
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey);
  const hadKey = Boolean(signers?.has(contentPubkey) || raw?.has(contentPubkey));
  if (!hadKey) return false;
  NsecSigner.release(contentPubkey);
  signers?.delete(contentPubkey);
  raw?.delete(contentPubkey);
  if (!signers?.size) contentKeySignersByOwnerPubkey.delete(ownerPubkey);
  if (!raw?.size) rawContentKeyHexByOwnerPubkey.delete(ownerPubkey);
  refreshContentSignerBindings(ownerPubkey);
  return true;
}
function dropAllContentKeys() {
  for (const signers of contentKeySignersByOwnerPubkey.values()) {
    for (const pubkey of signers.keys()) NsecSigner.release(pubkey);
  }
  contentKeySignersByOwnerPubkey.clear();
  rawContentKeyHexByOwnerPubkey.clear();
  clearContentSignerBindings();
}
function adoptNsec(pubkey, seckey) {
  const contentKeysChanged = dropPriorEntry(pubkey);
  rawNsecHexByPubkey.set(pubkey, seckey);
  nsecSignersByPubkey.set(pubkey, NsecSigner.getOrCreate(seckey));
  accountTypeByPubkey.set(pubkey, "nsec");
  refreshContentSignerBindings(pubkey);
  return contentKeysChanged;
}
function isStaleContentKeyCreatedAt(createdAt, now = nowSeconds6()) {
  return (createdAt || 0) <= now - DEFAULT_STALE_CHANNEL_SECONDS;
}
function newestContentKeyPubkey(entries) {
  let best = null;
  for (const [pubkey, entry] of entries) {
    if (!best || (entry.createdAt || 0) >= best.createdAt) {
      best = { pubkey, createdAt: entry.createdAt || 0 };
    }
  }
  return best?.pubkey || "";
}
function hasNewerContentKey(ownerPubkey, createdAt) {
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey);
  if (!raw?.size) return false;
  for (const entry of raw.values()) {
    if ((entry.createdAt || 0) > createdAt) return true;
  }
  return false;
}
function shouldSkipContentKeyStorage(ownerPubkey, createdAt, now = nowSeconds6()) {
  return isStaleContentKeyCreatedAt(createdAt, now) && hasNewerContentKey(ownerPubkey, createdAt);
}
function pruneStaleContentKeysForOwner(ownerPubkey, now = nowSeconds6()) {
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey);
  if (!raw || raw.size <= 1) return false;
  const newestPubkey = newestContentKeyPubkey(raw);
  let changed = false;
  for (const [pubkey, entry] of [...raw]) {
    if (pubkey === newestPubkey) continue;
    if (!isStaleContentKeyCreatedAt(entry.createdAt || 0, now)) continue;
    changed = dropContentKey(ownerPubkey, pubkey) || changed;
  }
  return changed;
}
function pruneStaleContentKeys(now = nowSeconds6()) {
  let changed = false;
  for (const ownerPubkey of [...rawContentKeyHexByOwnerPubkey.keys()]) {
    changed = pruneStaleContentKeysForOwner(ownerPubkey, now) || changed;
  }
  return changed;
}
function adoptBunkerWithHandle(pubkey, handle, clientKey) {
  const contentKeysChanged = dropPriorEntry(pubkey);
  rawClientKeyHexByPubkey.set(pubkey, clientKey);
  bunkerHandlesByPubkey.set(pubkey, handle);
  accountTypeByPubkey.set(pubkey, "bunker");
  return contentKeysChanged;
}
function adoptBunkerFromUnlock(pubkey, clientKey) {
  const account = get(pubkey);
  if (!account || account.type !== "bunker" || !account.bunker) {
    console.warn("bunker secret without matching store record \u2014 skipping", pubkey);
    return;
  }
  const handle = BunkerHandle.create({
    pubkey,
    bunkerUrl: account.bunker,
    clientKey,
    onStateChange: persistHandleState
  });
  adoptBunkerWithHandle(pubkey, handle, clientKey);
}
function clearAll() {
  for (const pubkey of nsecSignersByPubkey.keys()) NsecSigner.release(pubkey);
  dropAllContentKeys();
  for (const handle of bunkerHandlesByPubkey.values()) handle.close();
  nsecSignersByPubkey.clear();
  bunkerHandlesByPubkey.clear();
  accountTypeByPubkey.clear();
  rawNsecHexByPubkey.clear();
  rawClientKeyHexByPubkey.clear();
  deviceSignerSeckey = null;
}
function subscribe3(fn) {
  listeners2.add(fn);
  return () => listeners2.delete(fn);
}
function subscribeContentKeys(fn) {
  contentKeyListeners.add(fn);
  return () => contentKeyListeners.delete(fn);
}
function isUnlocked() {
  return vaultPrivkey !== null;
}
function unlock(vaultKeyBytes, ciphertext) {
  vaultPrivkey = vaultKeyBytes;
  vaultConversationKey = deriveVaultConversationKey(vaultKeyBytes);
  loadEntries(ciphertext);
  notify2();
}
function reload(ciphertext) {
  if (!vaultPrivkey) throw new Error("VAULT_LOCKED");
  loadEntries(ciphertext);
  notify2();
}
function loadEntries(ciphertext) {
  clearAll();
  if (ciphertext) {
    const tlvBytes = base64ToBytes(vaultDecryptWithScope(ciphertext, VAULT_SECRETS_SCOPE));
    for (const e of decodeSecretEntries(tlvBytes)) {
      if (e.type === "nsec") adoptNsec(e.pubkey, e.seckey);
      else if (e.type === "bunker") adoptBunkerFromUnlock(e.pubkey, e.clientKey);
      else if (e.type === "device-signer") deviceSignerSeckey = e.seckey;
    }
  }
  loadPersistedContentKeys();
}
function normalizeContentKeyEntry(entry) {
  const ownerPubkey = typeof entry?.ownerPubkey === "string" ? entry.ownerPubkey.toLowerCase() : "";
  const seckey = typeof entry?.seckey === "string" ? entry.seckey.toLowerCase() : "";
  const createdAt = Math.max(0, Math.floor(Number(entry?.createdAt) || 0));
  if (!HEX32.test(ownerPubkey) || !HEX32.test(seckey)) return null;
  return { ownerPubkey, seckey, createdAt };
}
function replaceContentKeyEntries(entries, { pruneStale = true } = {}) {
  dropAllContentKeys();
  for (const entry of entries) {
    const normalized = normalizeContentKeyEntry(entry);
    if (!normalized) continue;
    try {
      adoptContentKey(normalized.ownerPubkey, normalized.seckey, normalized.createdAt);
    } catch (err) {
      console.warn("content key skipped", err?.message ?? err);
    }
  }
  return pruneStale ? pruneStaleContentKeys() : false;
}
function readPersistedContentKeyEntries() {
  const raw = getState(CONTENT_KEYS_KEY);
  if (!raw) return [];
  if (!vaultConversationKey) return [];
  try {
    const parsed = JSON.parse(vaultDecryptWithScope(raw, VAULT_CONTENT_KEYS_SCOPE));
    return Array.isArray(parsed) ? parsed.map(normalizeContentKeyEntry).filter(Boolean) : [];
  } catch (err) {
    console.warn("content keys decrypt failed", err?.message ?? err);
    return [];
  }
}
function loadPersistedContentKeys() {
  if (replaceContentKeyEntries(readPersistedContentKeyEntries())) {
    persistContentKeyEntries().catch((err) => console.warn("content key pruning failed", err?.message ?? err));
  }
}
async function persistContentKeyEntries({ pruneStale = true } = {}) {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  if (pruneStale) pruneStaleContentKeys();
  const entries = listRawContentKeyEntriesInternal();
  if (!entries.length) {
    await removeState(CONTENT_KEYS_KEY);
    return;
  }
  await setState(CONTENT_KEYS_KEY, vaultEncryptWithScope(JSON.stringify(entries), VAULT_CONTENT_KEYS_SCOPE));
}
function snapshotContentKeySecrets() {
  return getState(CONTENT_KEYS_KEY);
}
async function restoreContentKeySecrets(priorCiphertext) {
  if (priorCiphertext === null) await removeState(CONTENT_KEYS_KEY);
  else await setState(CONTENT_KEYS_KEY, priorCiphertext);
  if (isUnlocked()) loadPersistedContentKeys();
  notify2();
}
function lock() {
  vaultPrivkey = null;
  vaultConversationKey = null;
  clearAll();
  notify2();
}
async function setNsecSecret(pubkey, seckey) {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  const priorContentKeys = snapshotContentKeySecrets();
  const contentKeysChanged = adoptNsec(pubkey, seckey);
  try {
    if (contentKeysChanged) await persistContentKeyEntries();
  } catch (err) {
    await restoreContentKeySecrets(priorContentKeys);
    throw err;
  }
  notify2();
}
function adoptContentKey(ownerPubkey, seckey, createdAt = Math.floor(Date.now() / 1e3)) {
  const signer = NsecSigner.getOrCreate(seckey);
  const pubkey = signer.getPublicKey();
  let signers = contentKeySignersByOwnerPubkey.get(ownerPubkey);
  if (!signers) {
    signers = /* @__PURE__ */ new Map();
    contentKeySignersByOwnerPubkey.set(ownerPubkey, signers);
  }
  let raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey);
  if (!raw) {
    raw = /* @__PURE__ */ new Map();
    rawContentKeyHexByOwnerPubkey.set(ownerPubkey, raw);
  }
  signers.set(pubkey, signer);
  raw.set(pubkey, { seckey, createdAt });
  refreshContentSignerBindings(ownerPubkey);
  return signer;
}
async function setContentKeySecret(ownerPubkey, seckey, createdAt = Math.floor(Date.now() / 1e3)) {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  const prior = listRawContentKeyEntriesInternal();
  try {
    const normalizedCreatedAt = Math.max(0, Math.floor(Number(createdAt) || 0));
    if (shouldSkipContentKeyStorage(ownerPubkey, normalizedCreatedAt)) return null;
    const signer = adoptContentKey(ownerPubkey, seckey, normalizedCreatedAt);
    await persistContentKeyEntries();
    notifyContentKeys(ownerPubkey);
    return signer;
  } catch (err) {
    replaceContentKeyEntries(prior, { pruneStale: false });
    throw err;
  }
}
async function replaceContentKeySecret(ownerPubkey, seckey, createdAt = Math.floor(Date.now() / 1e3)) {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  const prior = listRawContentKeyEntriesInternal();
  try {
    dropContentKeysForOwner(ownerPubkey);
    const signer = adoptContentKey(ownerPubkey, seckey, Math.max(0, Math.floor(Number(createdAt) || 0)));
    await persistContentKeyEntries({ pruneStale: false });
    notifyContentKeys(ownerPubkey);
    return signer;
  } catch (err) {
    replaceContentKeyEntries(prior, { pruneStale: false });
    throw err;
  }
}
function getContentKeySigner(ownerPubkey, contentPubkey) {
  if (!contentPubkey) return null;
  return contentKeySignersByOwnerPubkey.get(ownerPubkey)?.get(contentPubkey) ?? null;
}
function getLatestContentKeySigner(ownerPubkey) {
  const signers = contentKeySignersByOwnerPubkey.get(ownerPubkey);
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey);
  if (!signers?.size || !raw?.size) return null;
  let best = null;
  for (const [pubkey, entry] of raw) {
    if (!best || (entry.createdAt || 0) >= (best.createdAt || 0)) best = { pubkey, ...entry };
  }
  return best ? signers.get(best.pubkey) || null : null;
}
function listContentKeys(ownerPubkey) {
  const raw = rawContentKeyHexByOwnerPubkey.get(ownerPubkey);
  if (!raw?.size) return [];
  return [...raw].map(([pubkey, entry]) => ({
    ownerPubkey,
    pubkey,
    createdAt: entry.createdAt || 0
  }));
}
function getContentKeyRecordInternal(ownerPubkey, contentPubkey) {
  if (!contentPubkey) return null;
  const entry = rawContentKeyHexByOwnerPubkey.get(ownerPubkey)?.get(contentPubkey);
  if (!entry?.seckey) return null;
  return {
    ownerPubkey,
    pubkey: contentPubkey,
    seckey: entry.seckey,
    createdAt: entry.createdAt || 0
  };
}
async function replyWithContentKeySecrets({ ownerPubkey, pubkeys, send }) {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  if (typeof send !== "function") throw new Error("SEND_REQUIRED");
  const keys = [...new Set((Array.isArray(pubkeys) ? pubkeys : []).filter(Boolean))].map((pubkey) => getContentKeyRecordInternal(ownerPubkey, pubkey)).filter(Boolean).map((record) => ({
    pubkey: record.pubkey,
    seckey: record.seckey,
    createdAt: record.createdAt || 0
  }));
  if (!keys.length) return null;
  return send({ ownerPubkey, keys });
}
async function adoptBunkerHandle(pubkey, handle, clientKey) {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  const priorContentKeys = snapshotContentKeySecrets();
  const contentKeysChanged = adoptBunkerWithHandle(pubkey, handle, clientKey);
  try {
    if (contentKeysChanged) await persistContentKeyEntries();
  } catch (err) {
    await restoreContentKeySecrets(priorContentKeys);
    throw err;
  }
  notify2();
}
async function ensureDeviceSignerSeckey() {
  if (!vaultPrivkey) throw new Error("VAULT_LOCKED");
  if (!deviceSignerSeckey) deviceSignerSeckey = await deriveSignerSeckey(vaultPrivkey);
  return deviceSignerSeckey;
}
async function getDeviceSignerPubkey() {
  const seckey = await ensureDeviceSignerSeckey();
  return getPublicKey(hexToBytes3(seckey));
}
async function getDeviceSigner() {
  const seckey = await ensureDeviceSignerSeckey();
  return NsecSigner.getOrCreate(seckey);
}
async function withDeviceSignerSeckey(fn) {
  const seckey = await ensureDeviceSignerSeckey();
  return fn(hexToBytes3(seckey));
}
async function deleteSecret(pubkey) {
  const priorContentKeys = snapshotContentKeySecrets();
  let contentKeysChanged = false;
  if (!accountTypeByPubkey.has(pubkey)) {
    contentKeysChanged = dropContentKeysForOwner(pubkey);
    try {
      if (contentKeysChanged) await persistContentKeyEntries();
    } catch (err) {
      await restoreContentKeySecrets(priorContentKeys);
      throw err;
    }
    notify2();
    return;
  }
  contentKeysChanged = dropPriorEntry(pubkey);
  try {
    if (contentKeysChanged) await persistContentKeyEntries();
  } catch (err) {
    await restoreContentKeySecrets(priorContentKeys);
    throw err;
  }
  notify2();
}
async function transferBunkerSecret(oldPubkey, newPubkey) {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  if (accountTypeByPubkey.get(oldPubkey) !== "bunker") return;
  const clientKey = rawClientKeyHexByPubkey.get(oldPubkey);
  if (!clientKey) {
    await deleteSecret(oldPubkey);
    return;
  }
  await deleteSecret(oldPubkey);
  adoptBunkerFromUnlock(newPubkey, clientKey);
  notify2();
}
function getNsecSigner(pubkey) {
  return nsecSignersByPubkey.get(pubkey) ?? null;
}
function getBunkerHandle(pubkey) {
  return bunkerHandlesByPubkey.get(pubkey) ?? null;
}
function listSecretRefs() {
  const refs = [];
  for (const [pubkey, type] of accountTypeByPubkey) {
    if (type === "nsec" || type === "bunker") refs.push({ type, pubkey });
  }
  return refs;
}
function hasSecretRef({ type, pubkey } = {}) {
  return Boolean(pubkey && (type === "nsec" || type === "bunker") && accountTypeByPubkey.get(pubkey) === type);
}
function sealCurrentEntries() {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  const tlvBytes = encodeSecretEntries(listRawEntriesInternal());
  return vaultEncryptWithScope(bytesToBase64(tlvBytes), VAULT_SECRETS_SCOPE);
}
function listRawEntriesInternal() {
  const out = [];
  for (const [pubkey, type] of accountTypeByPubkey) {
    if (type === "nsec") {
      const seckey = rawNsecHexByPubkey.get(pubkey);
      if (seckey) out.push({ type: "nsec", pubkey, seckey });
    } else if (type === "bunker") {
      const clientKey = rawClientKeyHexByPubkey.get(pubkey);
      if (clientKey) out.push({ type: "bunker", pubkey, clientKey });
    }
  }
  if (deviceSignerSeckey) {
    out.push({ type: "device-signer", seckey: deviceSignerSeckey });
  }
  return out;
}
function listRawContentKeyEntriesInternal() {
  const out = [];
  for (const [ownerPubkey, entries] of rawContentKeyHexByOwnerPubkey) {
    for (const entry of entries.values()) {
      out.push({
        ownerPubkey,
        seckey: entry.seckey,
        createdAt: entry.createdAt || 0
      });
    }
  }
  return out;
}
function vaultEncrypt(plaintext) {
  return vaultEncryptWithScope(plaintext, VAULT_LOCAL_STATE_SCOPE);
}
function vaultDecrypt(ciphertext) {
  return vaultDecryptWithScope(ciphertext, VAULT_LOCAL_STATE_SCOPE);
}

export {
  bytesToHex3 as bytesToHex,
  hexToBytes3 as hexToBytes,
  generateSecretKey,
  getPublicKey,
  generateKeypair,
  keypairFromSeckey,
  pubkeyFromNpub,
  nsecFromHex,
  npubFromPubkey,
  profileEventTemplate,
  signProfileEvent,
  signRelayListEvent,
  parseProfileEvent,
  bytesToBase64,
  base64ToBytes,
  bytesToBase64Url,
  base64UrlToBytes,
  sharedXOnlySecret,
  getConversationKey,
  normalizeKind2 as normalizeKind,
  encryptWithConversationKey,
  decryptWithConversationKey,
  seedRelays,
  freeRelays,
  relayPool,
  subscribeRelayListUpdates,
  fetchRelayListEvent,
  parseRelayListEvent2 as parseRelayListEvent,
  resolveWriteRelays,
  fetchLatestProfile,
  Nip46Client,
  Nip46ServerSession,
  initializeStorage,
  getState,
  hasState,
  updateState,
  setState,
  removeState,
  appendMessengerLog,
  updateMessengerLogAppMetadata,
  listMessengerLogs,
  removeMessengerLogsForPubkey,
  readRecords,
  replaceRecords,
  REVOCATION_ROTATIONS,
  NOSTRDB_SYNC,
  requestPersistentStorage,
  subscribe,
  list,
  get,
  add,
  replace,
  update,
  remove,
  applyRecords,
  accounts_store_exports,
  fetchBunkerUserPubkey,
  encodeSecretEntries,
  decodeSecretEntries,
  CONTENT_KEY_KIND,
  makeContentKeyEventForPubkey,
  makeContentKeyEvent,
  parseContentKeyEvent,
  getIykcProofs,
  createEventReplyPacker,
  PrivateMessenger,
  subscribe3 as subscribe2,
  subscribeContentKeys,
  isUnlocked,
  unlock,
  reload,
  snapshotContentKeySecrets,
  restoreContentKeySecrets,
  setNsecSecret,
  setContentKeySecret,
  replaceContentKeySecret,
  getContentKeySigner,
  getLatestContentKeySigner,
  listContentKeys,
  replyWithContentKeySecrets,
  getDeviceSignerPubkey,
  getDeviceSigner,
  deleteSecret,
  transferBunkerSecret,
  getNsecSigner,
  getBunkerHandle,
  listSecretRefs,
  sealCurrentEntries,
  vaultEncrypt,
  vaultDecrypt,
  secrets_exports
};
/*! Bundled license information:

@noble/curves/utils.js:
@noble/curves/abstract/modular.js:
@noble/curves/abstract/curve.js:
@noble/curves/abstract/weierstrass.js:
@noble/curves/secp256k1.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@scure/base/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/ciphers/utils.js:
  (*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) *)
*/
