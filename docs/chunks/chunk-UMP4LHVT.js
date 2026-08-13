import {
  seededAvatarDataUrl,
  seededNeutralAvatarDataUrl
} from "./chunk-3RWQBTGN.js";
import {
  runSecretAccountMutation
} from "./chunk-7VBC3JAI.js";
import {
  add as add2,
  restore,
  snapshot
} from "./chunk-AZYRZ53H.js";
import {
  ensureRegistered
} from "./chunk-4QDFHAFY.js";
import {
  add,
  extractBunkerClientKey,
  fetchBunkerUserPubkey,
  fetchLatestProfile,
  fetchRelayListEvent,
  freeRelays,
  get,
  getDeviceSignerPubkey,
  keypairFromSeckey,
  parseProfileEvent,
  parseRelayListEvent,
  pubkeyFromNpub,
  publicBunkerRecord,
  remove,
  replace,
  setNsecSecret
} from "./chunk-2IRIIQPD.js";

// src/services/account-intake.js
function createIntakeToken() {
  const token = {
    cancelled: false,
    cancelReject: null,
    cleanups: [],
    cancelPromise: null
  };
  token.cancelPromise = new Promise((_resolve, reject) => {
    token.cancelReject = reject;
  });
  token.cancelPromise.catch(() => {
  });
  return token;
}
function abortIntake(token) {
  if (!token || token.cancelled) return;
  token.cancelled = true;
  for (const fn of token.cleanups) {
    try {
      fn();
    } catch (err) {
      console.warn("intake cleanup failed", err?.message ?? err);
    }
  }
  token.cleanups.length = 0;
  token.cancelReject?.(new Error("IMPORT_CANCELLED"));
}
function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function cleanProfile(profile) {
  if (!isPlainObject(profile)) return {};
  const out = {};
  const name = cleanString(profile.name);
  const about = cleanString(profile.about);
  const picture = cleanString(profile.picture);
  if (name) out.name = name;
  if (about) out.about = about;
  if (picture) out.picture = picture;
  return out;
}
function profileEventFromProfile(pubkey, profile) {
  if (!Object.keys(profile).length) return void 0;
  const tags = [];
  if (profile.name) tags.push(["name", profile.name]);
  if (profile.picture) tags.push(["picture", profile.picture]);
  return {
    kind: 0,
    pubkey,
    created_at: 0,
    tags,
    content: JSON.stringify(profile)
  };
}
async function fetchOrNull(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}
async function resolveMetadata(pubkey, {
  pairedProfile = {},
  _fetchRelayListEvent = fetchRelayListEvent,
  _fetchLatestProfile = fetchLatestProfile
} = {}) {
  const paired = cleanProfile(pairedProfile);
  const fetchedRelayListEvent = await fetchOrNull(() => _fetchRelayListEvent(pubkey));
  const relayListEvent = fetchedRelayListEvent || void 0;
  const parsed = relayListEvent ? parseRelayListEvent(relayListEvent) : { write: [] };
  const writeRelays = parsed.write.length ? parsed.write : freeRelays.slice(0, 2);
  const fetchedProfileEvent = await fetchOrNull(() => _fetchLatestProfile(pubkey, { writeRelays }));
  const profileEvent = fetchedProfileEvent || profileEventFromProfile(pubkey, paired);
  const parsedProfile = profileEvent ? parseProfileEvent(profileEvent) : { name: "", picture: "" };
  return {
    profileEvent: profileEvent || void 0,
    relayListEvent: relayListEvent || void 0,
    writeRelays,
    name: parsedProfile.name || paired.name || "",
    picture: parsedProfile.picture || paired.picture || ""
  };
}
async function prepareSeckey(raw, options = {}) {
  const { pubkey, seckey } = keypairFromSeckey(raw);
  const existing = get(pubkey);
  if (existing && existing.type === "nsec") {
    return { type: "nsec", pubkey, skipped: true, reason: "ACCOUNT_EXISTS" };
  }
  const meta = await resolveMetadata(pubkey, {
    pairedProfile: options.pairedProfile
  });
  const picture = meta.picture || existing?.picture || await seededAvatarDataUrl(pubkey);
  const record = {
    type: "nsec",
    pubkey,
    picture,
    name: meta.name || existing?.name || "",
    profileEvent: meta.profileEvent || existing?.profileEvent,
    relayListEvent: meta.relayListEvent || existing?.relayListEvent,
    writeRelays: meta.writeRelays
  };
  return { type: "nsec", pubkey, record, seckey };
}
async function prepareNpub(npub, options = {}) {
  const pubkey = pubkeyFromNpub(npub);
  if (get(pubkey)) {
    return { type: "npub", pubkey, skipped: true, reason: "ACCOUNT_EXISTS" };
  }
  const meta = await resolveMetadata(pubkey, {
    pairedProfile: options.pairedProfile
  });
  const picture = meta.picture || await seededAvatarDataUrl(pubkey);
  const record = {
    type: "npub",
    pubkey,
    picture,
    name: meta.name || "",
    profileEvent: meta.profileEvent,
    relayListEvent: meta.relayListEvent,
    writeRelays: meta.writeRelays
  };
  return { type: "npub", pubkey, record };
}
async function prepareBunker(bunkerUrlInput, token, options = {}) {
  const { url: cleanedUrl, clientKey: suppliedClientKey } = extractBunkerClientKey(bunkerUrlInput);
  let bunkerHandle = null;
  let committed = false;
  const cleanup = () => {
    if (committed) return;
    try {
      bunkerHandle?.close();
    } catch {
    }
  };
  token?.cleanups.push(cleanup);
  try {
    const { pubkey, bunkerUrl } = await fetchBunkerUserPubkey(cleanedUrl, {
      clientKey: suppliedClientKey ?? void 0,
      onHandle: (h) => {
        bunkerHandle = h;
      }
    });
    if (token?.cancelled) throw new Error("IMPORT_CANCELLED");
    const existing = get(pubkey);
    if (existing && existing.type !== "bunker" && existing.type !== "npub") {
      cleanup();
      if (token) {
        const idx = token.cleanups.indexOf(cleanup);
        if (idx >= 0) token.cleanups.splice(idx, 1);
      }
      return { type: "bunker", pubkey, skipped: true, reason: "ACCOUNT_EXISTS" };
    }
    const meta = await resolveMetadata(pubkey, {
      pairedProfile: options.pairedProfile
    });
    if (token?.cancelled) throw new Error("IMPORT_CANCELLED");
    const picture = meta.picture || existing?.picture || await (options.neutralAvatar ? seededNeutralAvatarDataUrl(pubkey) : seededAvatarDataUrl(pubkey));
    if (token?.cancelled) throw new Error("IMPORT_CANCELLED");
    const record = {
      type: "bunker",
      pubkey,
      ...publicBunkerRecord(bunkerUrl),
      picture,
      name: meta.name || existing?.name || "",
      profileEvent: meta.profileEvent || existing?.profileEvent,
      relayListEvent: meta.relayListEvent || existing?.relayListEvent,
      writeRelays: meta.writeRelays
    };
    return {
      type: "bunker",
      pubkey,
      record,
      bunkerHandle,
      markCommitted: () => {
        committed = true;
        if (token) {
          const idx = token.cleanups.indexOf(cleanup);
          if (idx >= 0) token.cleanups.splice(idx, 1);
        }
      }
    };
  } catch (err) {
    cleanup();
    if (token) {
      const idx = token.cleanups.indexOf(cleanup);
      if (idx >= 0) token.cleanups.splice(idx, 1);
    }
    throw err;
  }
}
async function commitPrepared(prepared, options = {}) {
  const { peerSigner = null, protectionReady = false } = options;
  if (!prepared.length && !peerSigner) return;
  const needsSecretsPersist = prepared.some((p) => p.type !== "npub");
  if ((needsSecretsPersist || peerSigner) && !protectionReady) await ensureRegistered();
  const peerSignerActorPubkey = peerSigner ? await getDeviceSignerPubkey().catch(() => "") : "";
  const priorStoreRecords = /* @__PURE__ */ new Map();
  for (const p of prepared) priorStoreRecords.set(p.pubkey, get(p.pubkey));
  const priorTrustedSignersBlob = peerSigner ? snapshot() : null;
  let committedCount = 0;
  let trustedSignerWritten = false;
  const applyPrepared = async () => {
    for (const p of prepared) {
      const prior = priorStoreRecords.get(p.pubkey);
      if (prior) await replace(p.pubkey, p.record);
      else await add(p.record);
      if (p.type === "nsec") {
        await setNsecSecret(p.pubkey, p.seckey);
      } else if (p.type === "bunker") {
        await p.bunkerHandle.commit();
        p.markCommitted();
      }
      committedCount++;
    }
    if (peerSigner) {
      await add2({ ...peerSigner, actorPubkey: peerSignerActorPubkey });
      trustedSignerWritten = true;
    }
  };
  const rollbackPrepared = async () => {
    for (let i = 0; i < committedCount; i++) {
      const p = prepared[i];
      const prior = priorStoreRecords.get(p.pubkey);
      try {
        if (prior) await replace(p.pubkey, prior);
        else await remove(p.pubkey);
      } catch {
      }
    }
    if (trustedSignerWritten) {
      try {
        await restore(priorTrustedSignersBlob);
      } catch (e) {
        console.warn("trusted-signers rollback failed", e?.message ?? e);
      }
    }
  };
  try {
    if (needsSecretsPersist) {
      await runSecretAccountMutation({
        operation: "commit-prepared",
        beforeAccounts: [...priorStoreRecords.values()].filter(Boolean),
        afterAccounts: prepared.map((p) => p.record).filter(Boolean),
        apply: applyPrepared,
        finalize: () => {
        }
      });
    } else {
      await applyPrepared();
    }
  } catch (err) {
    if (needsSecretsPersist) {
      if (trustedSignerWritten) {
        try {
          await restore(priorTrustedSignersBlob);
        } catch (e) {
          console.warn("trusted-signers rollback failed", e?.message ?? e);
        }
      }
    } else {
      await rollbackPrepared();
    }
    throw err;
  }
}
function normalizeAccountEntry(entry) {
  if (typeof entry === "string") {
    if (entry.startsWith("bunker://")) return { type: "bunker", value: entry, profile: {} };
    if (entry.startsWith("npub1")) return { type: "npub", value: entry, profile: {} };
    if (entry.startsWith("nsec1")) return { type: "nsec", value: entry, profile: {} };
    throw new Error(`unknown entry: ${entry.slice(0, 16)}\u2026`);
  }
  if (!isPlainObject(entry) || typeof entry.value !== "string") throw new Error("invalid entry");
  return {
    type: typeof entry.type === "string" ? entry.type : "",
    value: entry.value,
    pubkey: cleanString(entry.pubkey),
    profile: cleanProfile(entry.profile)
  };
}
async function prepareBareKey(entry, token, options = {}) {
  const account = normalizeAccountEntry(entry);
  const prepareOptions = { ...options, pairedProfile: account.profile };
  if (account.type === "bunker") return prepareBunker(account.value, token, prepareOptions);
  if (account.type === "npub") return prepareNpub(account.value, prepareOptions);
  if (account.type === "nsec") return prepareSeckey(account.value, prepareOptions);
  throw new Error(`unknown entry: ${account.type || account.value.slice(0, 16)}\u2026`);
}

export {
  createIntakeToken,
  abortIntake,
  prepareSeckey,
  prepareNpub,
  prepareBunker,
  commitPrepared,
  prepareBareKey
};
