import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToHex,
  decodeSecretEntries,
  decryptWithConversationKey,
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
} from "./chunk-KDVVJYRE.js";

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
var CREATE_HINTS = ["client-device"];
var GET_TRANSPORTS = ["internal"];
var CRED_ID_KEY = "ez-vault:passkey:credential-id";
var USER_ID_KEY = "ez-vault:passkey:user-id";
var ICON_KEY = "ez-vault:passkey:icon";
var PRF_BACKUP_KEY = "ez-vault:passkey:prf";
var BLOB_FALLBACK_KEY = "ez-vault:passkey:blob";
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
function descriptorFromCredentialId(credentialId) {
  if (!credentialId) return null;
  return {
    id: base64UrlToBytes(credentialId),
    type: "public-key",
    transports: GET_TRANSPORTS
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
async function fetchPrfViaGet(rawId) {
  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [{
          id: new Uint8Array(rawId),
          type: "public-key",
          transports: GET_TRANSPORTS
        }],
        userVerification: "discouraged"
      },
      extensions: {
        prf: { eval: { first: PRF_SALT_BYTES } }
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
        authenticatorAttachment: "platform",
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
        // discoverable (rk), which we use to confirm the Android path.
        credProps: true
      }
    }
  });
  if (!credential) throw new Error("PASSKEY_CREATE_FAILED");
  if (credential.authenticatorAttachment !== "platform") throw new Error("PASSKEY_NOT_PLATFORM");
  const ext = extractExtensions(credential);
  let prfBytes = extractPrfBytes(ext);
  const isDiscoverable = Boolean(ext.credProps?.rk);
  if (prfBytes?.length) {
    console.info("[passkey] PRF returned on create", { rk: isDiscoverable });
  } else {
    console.info("[passkey] PRF missing on create \u2014 retrying via get()", { rk: isDiscoverable });
    prfBytes = await fetchPrfViaGet(credential.rawId);
  }
  if (!prfBytes?.length) {
    await discardCredential(credential.rawId);
    throw new Error("PASSKEY_PRF_REQUIRED");
  }
  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId));
  await updateState({
    set: {
      [CRED_ID_KEY]: credentialId,
      [USER_ID_KEY]: bytesToBase64Url(userId),
      [PRF_BACKUP_KEY]: bytesToHex(prfBytes),
      ...iconURL ? { [ICON_KEY]: iconURL } : {}
    }
  });
  unlock(prfBytes, null);
  await requestPersistentStorage();
}
async function unlock2() {
  const credentialId = getState(CRED_ID_KEY, "");
  if (!credentialId) throw new Error("PASSKEY_NOT_REGISTERED");
  const descriptor = descriptorFromCredentialId(credentialId);
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [descriptor],
      userVerification: "required",
      hints: CREATE_HINTS
    },
    extensions: {
      prf: { eval: { first: PRF_SALT_BYTES } },
      largeBlob: { read: true }
    }
  });
  if (!credential) throw new Error("PASSKEY_GET_FAILED");
  const ext = extractExtensions(credential);
  const prfFromAssertion = extractPrfBytes(ext);
  let prfBytes = prfFromAssertion;
  if (prfBytes?.length) {
    await removeState(PRF_BACKUP_KEY);
  } else {
    const stored = getState(PRF_BACKUP_KEY, "");
    if (stored) prfBytes = hexToBytes(stored);
  }
  if (!prfBytes?.length) throw new Error("PASSKEY_PRF_MISSING");
  let ciphertext = null;
  const blobBytes = extractLargeBlobBytes(ext);
  if (blobBytes) {
    ciphertext = textDecoder.decode(blobBytes);
    await removeState(BLOB_FALLBACK_KEY);
  } else {
    ciphertext = getState(BLOB_FALLBACK_KEY);
  }
  unlock(prfBytes, ciphertext);
  await requestPersistentStorage();
}
async function writeSecretsBlob({ fallbackOnCancel = true } = {}) {
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  const credentialId = getState(CRED_ID_KEY, "");
  if (!credentialId) throw new Error("PASSKEY_NOT_REGISTERED");
  const ciphertext = sealCurrentEntries();
  const descriptor = descriptorFromCredentialId(credentialId);
  let credential;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [descriptor],
        // We just unlocked (or just created) — minimize re-prompting friction
        // for the largeBlob write.
        userVerification: "discouraged"
      },
      extensions: {
        largeBlob: { write: textEncoder.encode(ciphertext) },
        // Opportunistically re-eval PRF: when an authenticator starts
        // exposing PRF on get() this is where we'll first see it and prune
        // the IndexedDB backup.
        prf: { eval: { first: PRF_SALT_BYTES } }
      }
    });
  } catch (err) {
    if (err.name !== "NotAllowedError" || !fallbackOnCancel) throw err;
  }
  const ext = extractExtensions(credential);
  const prfBytes = extractPrfBytes(ext);
  if (prfBytes?.length) await removeState(PRF_BACKUP_KEY);
  if (ext.largeBlob?.written) {
    await removeState(BLOB_FALLBACK_KEY);
  } else {
    await updateState({ set: { [BLOB_FALLBACK_KEY]: ciphertext } });
  }
}
function unsealEntries(prfBytes, ciphertext) {
  const ck = sharedXOnlySecret(prfBytes, getPublicKey(prfBytes));
  const plaintextBase64 = decryptWithConversationKey(ck, VAULT_NIP44_KIND, VAULT_SECRETS_SCOPE, ciphertext);
  return decodeSecretEntries(base64ToBytes(plaintextBase64));
}
async function openSecrets() {
  const credentialId = getState(CRED_ID_KEY, "");
  if (!credentialId) throw new Error("PASSKEY_NOT_REGISTERED");
  const descriptor = descriptorFromCredentialId(credentialId);
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [descriptor],
      userVerification: "required"
    },
    // Force a fresh prompt — never pulled from a recent-auth cache.
    mediation: "required",
    extensions: {
      prf: { eval: { first: PRF_SALT_BYTES } },
      largeBlob: { read: true }
    }
  });
  if (!credential) throw new Error("PASSKEY_GET_FAILED");
  const ext = extractExtensions(credential);
  let prfBytes = extractPrfBytes(ext);
  if (prfBytes?.length) {
    await removeState(PRF_BACKUP_KEY);
  } else {
    const stored = getState(PRF_BACKUP_KEY, "");
    if (stored) prfBytes = hexToBytes(stored);
  }
  if (!prfBytes?.length) throw new Error("PASSKEY_PRF_MISSING");
  let ciphertext = null;
  const blobBytes = extractLargeBlobBytes(ext);
  if (blobBytes) {
    ciphertext = textDecoder.decode(blobBytes);
    await removeState(BLOB_FALLBACK_KEY);
  } else {
    ciphertext = getState(BLOB_FALLBACK_KEY);
  }
  if (!ciphertext) return [];
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
  writeSecretsBlob,
  openSecrets,
  checkForIconUpdate,
  flushPendingIconUpdate
};
