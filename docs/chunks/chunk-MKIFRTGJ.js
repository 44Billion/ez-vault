import {
  persistSecretsBlob,
  restoreSecretsBlobSnapshot,
  snapshotSecretsBlob
} from "./chunk-YIXC4UXQ.js";
import {
  applyRecords,
  finalizeLegacyBunkerMigrations,
  getState,
  hasState,
  isUnlocked,
  listSecretRefs,
  reload,
  removeState,
  restoreContentKeySecrets,
  sealCurrentEntries,
  secretStateFingerprint,
  setState,
  snapshotContentKeySecrets,
  waitForVaultTransition
} from "./chunk-NHHPGB6R.js";

// src/services/account-mutation-journal.js
var KEY = "account-mutation";
var listeners = /* @__PURE__ */ new Set();
function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.warn("account-mutation listener threw", err);
    }
  }
}
function normalizeAccountList(accounts) {
  return Array.isArray(accounts) ? accounts.filter((a) => a?.pubkey).map(cloneJson) : [];
}
function normalizeSecretRefs(refs) {
  return Array.isArray(refs) ? refs.filter((r) => (r?.type === "nsec" || r?.type === "bunker") && r.pubkey).map((r) => ({ type: r.type, pubkey: r.pubkey })) : [];
}
function normalizeFingerprint(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : "";
}
function uniquePubkeys(...groups) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const group of groups) {
    for (const pubkey of group || []) {
      if (!pubkey || seen.has(pubkey)) continue;
      seen.add(pubkey);
      out.push(pubkey);
    }
  }
  return out;
}
function read() {
  try {
    const parsed = getState(KEY);
    if (!parsed || typeof parsed !== "object") return null;
    const beforeAccounts = normalizeAccountList(parsed.beforeAccounts);
    const afterAccounts = normalizeAccountList(parsed.afterAccounts);
    const beforeSecretRefs = normalizeSecretRefs(parsed.beforeSecretRefs);
    const afterSecretRefs = normalizeSecretRefs(parsed.afterSecretRefs);
    const affectedPubkeys2 = uniquePubkeys(
      Array.isArray(parsed.affectedPubkeys) ? parsed.affectedPubkeys : [],
      beforeAccounts.map((a) => a.pubkey),
      afterAccounts.map((a) => a.pubkey),
      beforeSecretRefs.map((r) => r.pubkey),
      afterSecretRefs.map((r) => r.pubkey)
    );
    return {
      id: String(parsed.id || ""),
      operation: String(parsed.operation || "unknown"),
      affectedPubkeys: affectedPubkeys2,
      beforeAccounts,
      afterAccounts,
      beforeSecretRefs,
      afterSecretRefs,
      beforeSecretFingerprint: normalizeFingerprint(parsed.beforeSecretFingerprint),
      afterSecretFingerprint: normalizeFingerprint(parsed.afterSecretFingerprint),
      createdAt: Math.max(0, Math.floor(Number(parsed.createdAt) || 0))
    };
  } catch {
    return null;
  }
}
async function begin({
  operation,
  affectedPubkeys: affectedPubkeys2 = [],
  beforeAccounts = [],
  afterAccounts = [],
  beforeSecretRefs = [],
  afterSecretRefs = [],
  beforeSecretFingerprint = ""
}) {
  if (read()) throw new Error("ACCOUNT_MUTATION_IN_PROGRESS");
  const tx = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    operation: operation || "unknown",
    affectedPubkeys: uniquePubkeys(
      affectedPubkeys2,
      beforeAccounts.map((a) => a?.pubkey),
      afterAccounts.map((a) => a?.pubkey),
      beforeSecretRefs.map((r) => r?.pubkey),
      afterSecretRefs.map((r) => r?.pubkey)
    ),
    beforeAccounts: normalizeAccountList(beforeAccounts),
    afterAccounts: normalizeAccountList(afterAccounts),
    beforeSecretRefs: normalizeSecretRefs(beforeSecretRefs),
    afterSecretRefs: normalizeSecretRefs(afterSecretRefs),
    beforeSecretFingerprint: normalizeFingerprint(beforeSecretFingerprint),
    afterSecretFingerprint: "",
    createdAt: Math.floor(Date.now() / 1e3)
  };
  await setState(KEY, tx);
  notify();
  return tx;
}
async function setAfterSecretFingerprint(fingerprint) {
  const tx = read();
  if (!tx) throw new Error("ACCOUNT_MUTATION_NOT_FOUND");
  tx.afterSecretFingerprint = normalizeFingerprint(fingerprint);
  await setState(KEY, tx);
  return tx;
}
async function clear() {
  if (!hasState(KEY)) return;
  await removeState(KEY);
  notify();
}
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function affectedPubkeys() {
  return read()?.affectedPubkeys || [];
}
function filterVisibleAccounts(accounts) {
  const hidden = new Set(affectedPubkeys());
  if (!hidden.size) return accounts;
  return accounts.filter((account) => !hidden.has(account.pubkey));
}
function needsUnlock(tx = read()) {
  return Boolean(tx && (tx.beforeSecretRefs.length || tx.afterSecretRefs.length));
}

// src/services/account-mutations.js
function cloneJson2(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function cleanAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : []).filter((a) => a?.pubkey).map(cloneJson2);
}
function uniquePubkeys2(...groups) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const group of groups) {
    for (const pubkey of group || []) {
      if (!pubkey || seen.has(pubkey)) continue;
      seen.add(pubkey);
      out.push(pubkey);
    }
  }
  return out;
}
function refKey(ref) {
  return `${ref.type}:${ref.pubkey}`;
}
function sortRefs(refs) {
  return [...refs || []].filter((r) => (r?.type === "nsec" || r?.type === "bunker") && r.pubkey).map((r) => ({ type: r.type, pubkey: r.pubkey })).sort((a, b) => refKey(a).localeCompare(refKey(b)));
}
function refsEqual(a, b) {
  const left = sortRefs(a);
  const right = sortRefs(b);
  if (left.length !== right.length) return false;
  return left.every((ref, i) => ref.type === right[i].type && ref.pubkey === right[i].pubkey);
}
function secretRefForAccount(account) {
  if (!account || account.type !== "nsec" && account.type !== "bunker") return null;
  return { type: account.type, pubkey: account.pubkey };
}
function secretRefsForAccounts(accounts) {
  return sortRefs(cleanAccounts(accounts).map(secretRefForAccount).filter(Boolean));
}
function secretRefsForPubkeys(pubkeys) {
  const wanted = new Set(pubkeys);
  return sortRefs(listSecretRefs().filter((ref) => wanted.has(ref.pubkey)));
}
function affectedFromAccounts(beforeAccounts, afterAccounts) {
  return uniquePubkeys2(
    beforeAccounts.map((a) => a.pubkey),
    afterAccounts.map((a) => a.pubkey)
  );
}
async function rollbackAccountState(affectedPubkeys2, beforeAccounts, priorMemoryBlob, priorLocalBlob, priorContentKeysBlob) {
  let succeeded = true;
  try {
    await applyRecords(affectedPubkeys2, beforeAccounts);
  } catch (err) {
    succeeded = false;
    console.warn("account rollback failed", err?.message ?? err);
  }
  if (priorMemoryBlob !== null) {
    try {
      reload(priorMemoryBlob);
    } catch (err) {
      succeeded = false;
      console.warn("secrets rollback failed", err?.message ?? err);
    }
  }
  try {
    await restoreSecretsBlobSnapshot(priorLocalBlob);
  } catch (err) {
    succeeded = false;
    console.warn("ciphertext rollback failed", err?.message ?? err);
  }
  if (priorContentKeysBlob !== null) {
    try {
      await restoreContentKeySecrets(priorContentKeysBlob);
    } catch (err) {
      succeeded = false;
      console.warn("content-key rollback failed", err?.message ?? err);
    }
  }
  return succeeded;
}
async function runSecretAccountMutation({
  operation,
  beforeAccounts = [],
  afterAccounts = [],
  apply,
  finalize
}) {
  await waitForVaultTransition();
  const cleanBefore = cleanAccounts(beforeAccounts);
  const cleanAfter = cleanAccounts(afterAccounts);
  const affectedPubkeys2 = affectedFromAccounts(cleanBefore, cleanAfter);
  const beforeSecretRefs = secretRefsForPubkeys(affectedPubkeys2);
  const afterSecretRefs = secretRefsForAccounts(cleanAfter);
  const beforeSecretFingerprint = secretStateFingerprint(affectedPubkeys2);
  const priorMemoryBlob = sealCurrentEntries();
  const priorLocalBlob = snapshotSecretsBlob();
  const priorContentKeysBlob = snapshotContentKeySecrets();
  await begin({
    operation,
    affectedPubkeys: affectedPubkeys2,
    beforeAccounts: cleanBefore,
    afterAccounts: cleanAfter,
    beforeSecretRefs,
    afterSecretRefs,
    beforeSecretFingerprint
  });
  try {
    await apply();
    await finalize?.();
    await setAfterSecretFingerprint(secretStateFingerprint(affectedPubkeys2));
    await persistSecretsBlob();
  } catch (err) {
    if (err?.persistenceMayHaveCommitted) throw err;
    const rolledBack = await rollbackAccountState(
      affectedPubkeys2,
      cleanBefore,
      priorMemoryBlob,
      priorLocalBlob,
      priorContentKeysBlob
    );
    if (rolledBack) await clear();
    throw err;
  }
  await clear();
  try {
    await finalizeLegacyBunkerMigrations();
  } catch (err) {
    console.warn("legacy bunker migration cleanup failed", err?.message ?? err);
  }
}
function accountsByPubkey(accounts) {
  return new Map(cleanAccounts(accounts).map((account) => [account.pubkey, account]));
}
function accountMatchesRef(account, ref) {
  const accountRef = secretRefForAccount(account);
  return Boolean(accountRef && ref && accountRef.type === ref.type && accountRef.pubkey === ref.pubkey);
}
async function reconcileMixedState(tx, actualRefs) {
  const before = accountsByPubkey(tx.beforeAccounts);
  const after = accountsByPubkey(tx.afterAccounts);
  const actualByPubkey = new Map(actualRefs.map((ref) => [ref.pubkey, ref]));
  const records = [];
  for (const pubkey of tx.affectedPubkeys) {
    const ref = actualByPubkey.get(pubkey);
    const afterAccount = after.get(pubkey);
    const beforeAccount = before.get(pubkey);
    if (accountMatchesRef(afterAccount, ref)) records.push(afterAccount);
    else if (accountMatchesRef(beforeAccount, ref)) records.push(beforeAccount);
    else if (!ref && afterAccount?.type === "npub") records.push(afterAccount);
    else if (!ref && beforeAccount?.type === "npub") records.push(beforeAccount);
    else if (ref) console.warn("dropping account record with mismatched secret ref", pubkey);
  }
  await applyRecords(tx.affectedPubkeys, records);
}
async function recoverPendingMutation() {
  const tx = read();
  if (!tx) return { recovered: false, outcome: "none" };
  if (needsUnlock(tx) && !isUnlocked()) {
    return { recovered: false, outcome: "locked" };
  }
  const actualRefs = secretRefsForPubkeys(tx.affectedPubkeys);
  const actualFingerprint = secretStateFingerprint(tx.affectedPubkeys);
  let outcome = "mixed";
  if (tx.afterSecretFingerprint && actualFingerprint === tx.afterSecretFingerprint) {
    await applyRecords(tx.affectedPubkeys, tx.afterAccounts);
    outcome = "after";
  } else if (tx.beforeSecretFingerprint && actualFingerprint === tx.beforeSecretFingerprint) {
    await applyRecords(tx.affectedPubkeys, tx.beforeAccounts);
    outcome = "before";
  } else if (!tx.afterSecretFingerprint && refsEqual(actualRefs, tx.afterSecretRefs)) {
    await applyRecords(tx.affectedPubkeys, tx.afterAccounts);
    outcome = "after";
  } else if (!tx.beforeSecretFingerprint && refsEqual(actualRefs, tx.beforeSecretRefs)) {
    await applyRecords(tx.affectedPubkeys, tx.beforeAccounts);
    outcome = "before";
  } else {
    console.warn("recovering mixed account mutation state", {
      operation: tx.operation,
      affectedPubkeys: tx.affectedPubkeys
    });
    await reconcileMixedState(tx, actualRefs);
  }
  await clear();
  return { recovered: true, outcome };
}
function filterVisibleAccounts2(accounts) {
  return filterVisibleAccounts(accounts);
}
function hasPendingMutation() {
  return Boolean(read());
}
function pendingMutationNeedsUnlock() {
  return needsUnlock();
}
var subscribePendingMutations = subscribe;

export {
  read,
  subscribe,
  runSecretAccountMutation,
  recoverPendingMutation,
  filterVisibleAccounts2 as filterVisibleAccounts,
  hasPendingMutation,
  pendingMutationNeedsUnlock,
  subscribePendingMutations
};
