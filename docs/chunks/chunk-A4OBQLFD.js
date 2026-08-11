import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  decodeSecretEntries,
  decryptWithConversationKey,
  encodeSecretEntries,
  encryptWithConversationKey,
  getPublicKey,
  getState,
  hasState,
  hexToBytes,
  isUnlocked,
  removeState,
  requestPersistentStorage,
  sealCurrentEntries,
  sharedXOnlySecret,
  unlock,
  updateState
} from "./chunk-GUYFWDAK.js";

// src/helpers/platform.js
function detectPlatform() {
  const uad = navigator.userAgentData;
  if (uad) {
    const os2 = uad.platform || "unknown OS";
    const brand = uad.brands?.toReversed()?.find((b) => !/Not.*A.Brand/i.test(b.brand))?.brand;
    return `${os2} / ${brand || "unknown browser"}`;
  }
  const ua = navigator.userAgent || "";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "unknown OS";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "unknown browser";
  return `${os} / ${browser}`;
}

// src/helpers/favicon.js
function faviconUrl() {
  const base = typeof window !== "undefined" ? window.location.href : void 0;
  return new URL("./favicon.png", base).href;
}
var MAX_BYTES = 100 * 1024;
async function fetchFaviconBase64() {
  try {
    const res = await fetch(faviconUrl(), { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    if (blob.size > MAX_BYTES) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// src/services/passkey.js
var PRF_SALT = "ez-vault";
var RP_NAME = "44billion \xB7 EZ Vault";
var CREATE_HINTS = ["client-device", "hybrid", "security-key"];
var LEGACY_GET_TRANSPORTS = ["internal"];
var CRED_ID_KEY = "ez-vault:passkey:credential-id";
var TRANSPORTS_KEY = "ez-vault:passkey:transports";
var USER_ID_KEY = "ez-vault:passkey:user-id";
var ICON_KEY = "ez-vault:passkey:icon";
var PRF_BACKUP_KEY = "ez-vault:passkey:prf";
var SECRETS_BLOB_KEY = "ez-vault:passkey:blob";
var STORAGE_POLICY_KEY = "ez-vault:passkey:storage-policy";
var MODE_IDB = "idb";
var MODE_LARGE_BLOB = "largeblob";
var MODE_IDB_COMPAT = "idb-compat";
var SUPPORT_SUPPORTED = "supported";
var SUPPORT_UNSUPPORTED = "unsupported";
var SUPPORT_UNKNOWN = "unknown";
var VAULT_NIP44_KIND = 2;
var VAULT_SECRETS_SCOPE = "vault-secrets-v1";
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
var PRF_SALT_BYTES = textEncoder.encode(PRF_SALT);
var pendingIconUpdate = null;
function bufferToUint8(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}
function extractExtensions(credential) {
  return credential?.getClientExtensionResults?.() ?? {};
}
function extractPrfBytes(extensions) {
  return bufferToUint8(extensions?.prf?.results?.first);
}
function extractLargeBlobBytes(extensions) {
  const blob = extensions?.largeBlob?.blob;
  const bytes = bufferToUint8(blob);
  return bytes && bytes.length ? bytes : null;
}
function bytesEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
function storagePolicy(mode, largeBlobSupport, cleanupPending = false) {
  return { mode, largeBlobSupport, cleanupPending: Boolean(cleanupPending) };
}
function largeBlobSupportFromCreate(extensions) {
  if (extensions?.largeBlob?.supported === true) return SUPPORT_SUPPORTED;
  if (extensions?.largeBlob?.supported === false) return SUPPORT_UNSUPPORTED;
  return SUPPORT_UNKNOWN;
}
function readStoragePolicy() {
  const policy = getState(STORAGE_POLICY_KEY);
  if (!policy || typeof policy !== "object") return null;
  if (![MODE_IDB, MODE_LARGE_BLOB, MODE_IDB_COMPAT].includes(policy.mode)) return null;
  if (![SUPPORT_SUPPORTED, SUPPORT_UNSUPPORTED, SUPPORT_UNKNOWN].includes(policy.largeBlobSupport)) return null;
  return storagePolicy(policy.mode, policy.largeBlobSupport, policy.cleanupPending);
}
function normalizeTransports(transports) {
  if (!Array.isArray(transports)) return [];
  return [...new Set(transports.filter((transport) => typeof transport === "string" && transport))];
}
function transportsFromCredential(credential) {
  const getTransports = credential?.response?.getTransports;
  if (typeof getTransports !== "function") return [];
  try {
    return normalizeTransports(getTransports.call(credential.response));
  } catch {
    return [];
  }
}
function readStoredTransports() {
  const transports = getState(TRANSPORTS_KEY, null);
  return Array.isArray(transports) ? normalizeTransports(transports) : LEGACY_GET_TRANSPORTS;
}
function descriptorFromCredentialId(credentialId, transports = readStoredTransports()) {
  if (!credentialId) return null;
  return {
    id: base64UrlToBytes(credentialId),
    type: "public-key",
    ...transports.length && { transports }
  };
}
function generateUserId() {
  return crypto.getRandomValues(new Uint8Array(64));
}
function readStoredUserId() {
  const stored = getState(USER_ID_KEY, "");
  if (!stored) return null;
  try {
    return { bytes: base64UrlToBytes(stored), base64url: stored };
  } catch {
    return null;
  }
}
function buildUserName(userId) {
  const platform = detectPlatform();
  const known = !/unknown OS|unknown browser/.test(platform);
  const base = known ? `${RP_NAME} \xB7 ${platform}` : RP_NAME;
  const suffix = bytesToBase64Url(userId).slice(0, 6);
  return `${base} (${suffix})`;
}
async function fetchPrfViaGet(rawId, transports) {
  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [descriptorFromCredentialId(
          bytesToBase64Url(new Uint8Array(rawId)),
          transports
        )],
        userVerification: "discouraged",
        extensions: {
          prf: { eval: { first: PRF_SALT_BYTES } }
        }
      }
    });
    return extractPrfBytes(extractExtensions(credential));
  } catch (err) {
    console.warn("PRF follow-up get() failed", err?.message ?? err);
    return null;
  }
}
async function discardCredential(rawId) {
  const signalFn = window?.PublicKeyCredential?.signalUnknownCredential;
  if (typeof signalFn !== "function") return;
  try {
    await signalFn({
      rpId: window.location.hostname,
      credentialId: bytesToBase64Url(new Uint8Array(rawId))
    });
  } catch (err) {
    console.warn("signalUnknownCredential failed", err?.message ?? err);
  }
}
function hasPasskey() {
  return hasState(CRED_ID_KEY);
}
async function ensureRegistered() {
  if (hasPasskey() && isUnlocked()) return;
  if (hasPasskey()) {
    await unlock2();
    return;
  }
  await register();
}
async function register() {
  const userId = generateUserId();
  const iconURL = await fetchFaviconBase64();
  const userEntity = {
    id: userId,
    name: buildUserName(userId),
    displayName: RP_NAME,
    ...iconURL && { iconURL }
  };
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: window.location.hostname, name: RP_NAME },
      user: userEntity,
      pubKeyCredParams: [
        { alg: -8, type: "public-key" },
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" }
      ],
      authenticatorSelection: {
        // Preferred: non-discoverable where the authenticator honors it, but
        // Android then creates a Google Password Manager passkey — the only
        // Android credential type that exposes PRF. Platform sync may
        // happen, but it is never the intended cross-device path (that's
        // `nostrpair`); the random `user.id` above is the belt against a
        // synced credential being overwritten by a future registration on
        // another device.
        residentKey: "preferred",
        userVerification: "discouraged"
      },
      hints: CREATE_HINTS,
      extensions: {
        prf: { eval: { first: PRF_SALT_BYTES } },
        largeBlob: { support: "preferred" },
        // Diagnostic: reports whether the created credential is actually
        // discoverable (rk). This is intentionally diagnostic only: rk,
        // residentKey, backup eligibility (BE), and backup state (BS) are
        // distinct properties, and none gives the RP control over sync.
        credProps: true
      }
    }
  });
  if (!credential) throw new Error("PASSKEY_CREATE_FAILED");
  const ext = extractExtensions(credential);
  const transports = transportsFromCredential(credential);
  const prfFromCreate = extractPrfBytes(ext);
  const largeBlobSupport = largeBlobSupportFromCreate(ext);
  const isDiscoverable = Boolean(ext.credProps?.rk);
  console.info("[passkey] probing assertion PRF after create", {
    rk: isDiscoverable,
    createPrf: Boolean(prfFromCreate?.length)
  });
  const prfFromAssertion = await fetchPrfViaGet(credential.rawId, transports);
  if (prfFromCreate?.length && prfFromAssertion?.length && !bytesEqual(prfFromCreate, prfFromAssertion)) {
    await discardCredential(credential.rawId);
    throw new Error("PASSKEY_PRF_MISMATCH");
  }
  const prfBytes = prfFromAssertion?.length ? prfFromAssertion : prfFromCreate;
  if (!prfBytes?.length) {
    await discardCredential(credential.rawId);
    throw new Error("PASSKEY_PRF_REQUIRED");
  }
  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId));
  const policy = prfFromAssertion?.length ? storagePolicy(MODE_IDB, largeBlobSupport) : largeBlobSupport === SUPPORT_SUPPORTED ? storagePolicy(MODE_LARGE_BLOB, SUPPORT_SUPPORTED) : storagePolicy(MODE_IDB_COMPAT, largeBlobSupport);
  await updateState({
    set: {
      [CRED_ID_KEY]: credentialId,
      [TRANSPORTS_KEY]: transports,
      [USER_ID_KEY]: bytesToBase64Url(userId),
      ...!prfFromAssertion?.length && { [PRF_BACKUP_KEY]: bytesToHex(prfBytes) },
      [STORAGE_POLICY_KEY]: policy,
      ...iconURL ? { [ICON_KEY]: iconURL } : {}
    },
    // Avoid even a transient plaintext IDB copy when the assertion path is
    // already known to provide PRF. Also clears debris from an interrupted
    // prior registration attempt.
    remove: prfFromAssertion?.length ? [PRF_BACKUP_KEY] : []
  });
  unlock(prfBytes, null);
  await requestPersistentStorage();
}
function sealEmptyVault(prfBytes) {
  const ck = sharedXOnlySecret(prfBytes, getPublicKey(prfBytes));
  return encryptWithConversationKey(
    ck,
    VAULT_NIP44_KIND,
    VAULT_SECRETS_SCOPE,
    bytesToBase64(encodeSecretEntries([]))
  );
}
function readPrfBackup() {
  const stored = getState(PRF_BACKUP_KEY, "");
  return stored ? hexToBytes(stored) : null;
}
function resolvePrfMaterial(extensions, { assertionRequired = false } = {}) {
  const assertion = extractPrfBytes(extensions);
  const backup = readPrfBackup();
  if (assertion?.length && backup?.length && !bytesEqual(assertion, backup)) {
    throw new Error("PASSKEY_PRF_MISMATCH");
  }
  if (assertionRequired && !assertion?.length) throw new Error("PASSKEY_PRF_MISSING");
  const selected = assertion?.length ? assertion : backup;
  if (!selected?.length) throw new Error("PASSKEY_PRF_MISSING");
  return { assertion, backup, selected };
}
function decodeLargeBlob(extensions) {
  const bytes = extractLargeBlobBytes(extensions);
  return bytes ? textDecoder.decode(bytes) : "";
}
function validateCiphertext(prfBytes, ciphertext) {
  unsealEntries(prfBytes, ciphertext);
  return ciphertext;
}
function assertionRequest(policy, localCiphertext) {
  const extensions = { prf: { eval: { first: PRF_SALT_BYTES } } };
  if (!policy) {
    extensions.largeBlob = { read: true };
    return { extensions, action: "read" };
  }
  if (policy.mode === MODE_IDB && policy.cleanupPending) {
    extensions.largeBlob = { write: new Uint8Array(0) };
    return { extensions, action: "cleanup" };
  }
  if (policy.mode === MODE_LARGE_BLOB) {
    if (localCiphertext) {
      extensions.largeBlob = { write: textEncoder.encode(localCiphertext) };
      return { extensions, action: "write-fallback" };
    }
    extensions.largeBlob = { read: true };
    return { extensions, action: "read" };
  }
  return { extensions, action: "none" };
}
async function promoteToIdb(ciphertext, largeBlobSupport, cleanupPending) {
  await updateState({
    set: {
      [SECRETS_BLOB_KEY]: ciphertext,
      [STORAGE_POLICY_KEY]: storagePolicy(MODE_IDB, largeBlobSupport, cleanupPending)
    },
    remove: [PRF_BACKUP_KEY]
  });
}
async function resolveLegacyAccess(extensions, localCiphertext) {
  const remoteCiphertext = decodeLargeBlob(extensions);
  const { assertion, selected } = resolvePrfMaterial(extensions);
  const ciphertext = localCiphertext || remoteCiphertext || sealEmptyVault(selected);
  validateCiphertext(selected, ciphertext);
  if (assertion?.length) {
    await promoteToIdb(
      ciphertext,
      remoteCiphertext ? SUPPORT_SUPPORTED : SUPPORT_UNKNOWN,
      Boolean(remoteCiphertext)
    );
  } else {
    await updateState({
      set: {
        [STORAGE_POLICY_KEY]: storagePolicy(
          MODE_LARGE_BLOB,
          remoteCiphertext ? SUPPORT_SUPPORTED : SUPPORT_UNKNOWN
        )
      }
    });
  }
  return { prfBytes: selected, ciphertext };
}
async function resolveIdbAccess(policy, extensions, localCiphertext, action) {
  const { assertion } = resolvePrfMaterial(extensions, { assertionRequired: true });
  const ciphertext = localCiphertext || sealEmptyVault(assertion);
  validateCiphertext(assertion, ciphertext);
  const cleanupPending = action === "cleanup" && extensions?.largeBlob?.written === true ? false : policy.cleanupPending;
  await updateState({
    set: {
      [SECRETS_BLOB_KEY]: ciphertext,
      [STORAGE_POLICY_KEY]: storagePolicy(MODE_IDB, policy.largeBlobSupport, cleanupPending)
    },
    remove: [PRF_BACKUP_KEY]
  });
  return { prfBytes: assertion, ciphertext };
}
async function resolveCompatAccess(policy, extensions, localCiphertext) {
  const { assertion, selected } = resolvePrfMaterial(extensions);
  const ciphertext = localCiphertext || sealEmptyVault(selected);
  validateCiphertext(selected, ciphertext);
  if (assertion?.length) {
    await promoteToIdb(ciphertext, policy.largeBlobSupport, false);
  } else if (!localCiphertext) {
    await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } });
  }
  return { prfBytes: selected, ciphertext };
}
async function resolveLargeBlobAccess(policy, extensions, localCiphertext, action) {
  const remoteCiphertext = action === "read" ? decodeLargeBlob(extensions) : "";
  const { assertion, selected } = resolvePrfMaterial(extensions);
  const ciphertext = localCiphertext || remoteCiphertext || sealEmptyVault(selected);
  validateCiphertext(selected, ciphertext);
  if (assertion?.length) {
    const cleanupPending = action === "write-fallback" || Boolean(remoteCiphertext);
    const support = extensions?.largeBlob?.written === true ? SUPPORT_SUPPORTED : policy.largeBlobSupport;
    await promoteToIdb(ciphertext, support, cleanupPending);
  } else if (action === "write-fallback" && extensions?.largeBlob?.written === true) {
    await updateState({
      set: { [STORAGE_POLICY_KEY]: storagePolicy(MODE_LARGE_BLOB, SUPPORT_SUPPORTED) },
      remove: [SECRETS_BLOB_KEY]
    });
  } else if (remoteCiphertext && policy.largeBlobSupport !== SUPPORT_SUPPORTED) {
    await updateState({
      set: { [STORAGE_POLICY_KEY]: storagePolicy(MODE_LARGE_BLOB, SUPPORT_SUPPORTED) }
    });
  }
  return { prfBytes: selected, ciphertext };
}
async function resolveVaultMaterial(policy, extensions, localCiphertext, action) {
  if (!policy) return resolveLegacyAccess(extensions, localCiphertext);
  if (policy.mode === MODE_IDB) return resolveIdbAccess(policy, extensions, localCiphertext, action);
  if (policy.mode === MODE_IDB_COMPAT) return resolveCompatAccess(policy, extensions, localCiphertext);
  return resolveLargeBlobAccess(policy, extensions, localCiphertext, action);
}
async function obtainVaultMaterial({ freshVerification = false } = {}) {
  const credentialId = getState(CRED_ID_KEY, "");
  if (!credentialId) throw new Error("PASSKEY_NOT_REGISTERED");
  const descriptor = descriptorFromCredentialId(credentialId);
  const policy = readStoragePolicy();
  const localCiphertext = getState(SECRETS_BLOB_KEY, "");
  const { extensions, action } = assertionRequest(policy, localCiphertext);
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [descriptor],
      userVerification: "required",
      extensions
    },
    ...freshVerification && { mediation: "required" }
  });
  if (!credential) throw new Error("PASSKEY_GET_FAILED");
  return resolveVaultMaterial(policy, extractExtensions(credential), localCiphertext, action);
}
async function unlock2() {
  const { prfBytes, ciphertext } = await obtainVaultMaterial();
  unlock(prfBytes, ciphertext);
  await requestPersistentStorage();
}
async function writeLargeBlob(ciphertext, policy) {
  const credentialId = getState(CRED_ID_KEY, "");
  const descriptor = descriptorFromCredentialId(credentialId);
  const previousFallback = getState(SECRETS_BLOB_KEY, "");
  if (previousFallback) await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } });
  let credential;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [descriptor],
        userVerification: "discouraged",
        extensions: {
          prf: { eval: { first: PRF_SALT_BYTES } },
          largeBlob: { write: textEncoder.encode(ciphertext) }
        }
      }
    });
  } catch (err) {
    if (err?.name === "NotAllowedError") {
      await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } });
      return;
    }
    await restoreSecretsBlobSnapshot(previousFallback || null);
    throw err;
  }
  const extensions = extractExtensions(credential);
  const written = extensions?.largeBlob?.written === true;
  let prf;
  try {
    prf = resolvePrfMaterial(extensions);
  } catch (err) {
    if (written) err.persistenceMayHaveCommitted = true;
    else await restoreSecretsBlobSnapshot(previousFallback || null);
    throw err;
  }
  if (prf.assertion?.length) {
    try {
      validateCiphertext(prf.assertion, ciphertext);
    } catch (err) {
      if (written) err.persistenceMayHaveCommitted = true;
      else await restoreSecretsBlobSnapshot(previousFallback || null);
      throw err;
    }
    try {
      await promoteToIdb(
        ciphertext,
        written ? SUPPORT_SUPPORTED : policy.largeBlobSupport,
        true
      );
    } catch (err) {
      if (written || previousFallback) {
        console.warn("storage-policy promotion deferred", err?.message ?? err);
        return;
      }
      throw err;
    }
    return;
  }
  if (written) {
    try {
      await updateState({
        set: { [STORAGE_POLICY_KEY]: storagePolicy(MODE_LARGE_BLOB, SUPPORT_SUPPORTED) },
        remove: [SECRETS_BLOB_KEY]
      });
    } catch (err) {
      console.warn("largeBlob post-write state update failed", err?.message ?? err);
    }
    return;
  }
  await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } });
}
async function persistSecretsBlob(ciphertext = null) {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  if (!hasPasskey()) throw new Error("PASSKEY_NOT_REGISTERED");
  const sealed = ciphertext ?? sealCurrentEntries();
  const policy = readStoragePolicy();
  if (!policy) throw new Error("PASSKEY_STORAGE_POLICY_MISSING");
  if (policy.mode === MODE_LARGE_BLOB) return writeLargeBlob(sealed, policy);
  await updateState({ set: { [SECRETS_BLOB_KEY]: sealed } });
}
function snapshotSecretsBlob() {
  return getState(SECRETS_BLOB_KEY, "") || null;
}
function restoreSecretsBlobSnapshot(ciphertext) {
  return ciphertext ? updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } }) : removeState(SECRETS_BLOB_KEY);
}
function unsealEntries(prfBytes, ciphertext) {
  const ck = sharedXOnlySecret(prfBytes, getPublicKey(prfBytes));
  const plaintextBase64 = decryptWithConversationKey(ck, VAULT_NIP44_KIND, VAULT_SECRETS_SCOPE, ciphertext);
  return decodeSecretEntries(base64ToBytes(plaintextBase64));
}
async function openSecrets() {
  const { prfBytes, ciphertext } = await obtainVaultMaterial({ freshVerification: true });
  return unsealEntries(prfBytes, ciphertext);
}
async function checkForIconUpdate() {
  if (!hasPasskey()) return;
  const fresh = await fetchFaviconBase64();
  if (!fresh) return;
  if (fresh === getState(ICON_KEY, "")) return;
  pendingIconUpdate = fresh;
}
async function flushPendingIconUpdate() {
  if (!pendingIconUpdate) return;
  const iconURL = pendingIconUpdate;
  pendingIconUpdate = null;
  const userId = readStoredUserId();
  const signalFn = window?.PublicKeyCredential?.signalCurrentUserDetails;
  if (userId && typeof signalFn === "function") {
    try {
      await signalFn({
        rpId: window.location.hostname,
        userId: userId.base64url,
        name: buildUserName(userId.bytes),
        displayName: RP_NAME,
        iconURL
      });
    } catch (err) {
      console.warn("signalCurrentUserDetails failed", err?.message ?? err);
    }
  }
  await updateState({ set: { [ICON_KEY]: iconURL } });
}

export {
  detectPlatform,
  hasPasskey,
  ensureRegistered,
  unlock2 as unlock,
  persistSecretsBlob,
  snapshotSecretsBlob,
  restoreSecretsBlobSnapshot,
  openSecrets,
  checkForIconUpdate,
  flushPendingIconUpdate
};
