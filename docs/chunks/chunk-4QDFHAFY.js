import {
  base64ToBytes,
  base64UrlToBytes,
  beginVaultTransition,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  commitVaultProtectionUpgrade,
  createVaultRekeyer,
  decodeSecretEntries,
  decryptWithConversationKey,
  discloseCurrentEntries,
  encodeSecretEntries,
  encryptWithConversationKey,
  getPublicKey,
  getState,
  hasState,
  hexToBytes,
  isUnlocked,
  lock,
  removeState,
  requestPersistentStorage,
  sealCurrentEntries,
  sharedXOnlySecret,
  unlock,
  updateState,
  waitForVaultTransition
} from "./chunk-2IRIIQPD.js";

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
var LOCAL_KEY = "ez-vault:passkey:local-key";
var UPGRADE_PENDING_KEY = "ez-vault:passkey:upgrade-pending";
var CONTENT_KEYS_KEY = "ez-vault:content-keys";
var TRUSTED_SIGNERS_KEY = "ez-vault:trusted-signers";
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
var registrationPromise = null;
var requiredPasskeyPromise = null;
var fallbackDecisionOverride = null;
var preparedRegistrationIconURL;
var registrationIconPreparation = null;
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
function readLocalKey() {
  const stored = getState(LOCAL_KEY, "");
  if (!stored) return null;
  if (!/^[0-9a-f]{64}$/.test(stored)) throw new Error("LOCAL_VAULT_KEY_INVALID");
  return hexToBytes(stored);
}
function readUpgradePending() {
  const pending = getState(UPGRADE_PENDING_KEY);
  if (!pending || typeof pending !== "object") return null;
  const policy = pending.targetPolicy;
  if (!policy || ![MODE_IDB, MODE_LARGE_BLOB, MODE_IDB_COMPAT].includes(policy.mode)) return null;
  if (![SUPPORT_SUPPORTED, SUPPORT_UNSUPPORTED, SUPPORT_UNKNOWN].includes(policy.largeBlobSupport)) return null;
  return { targetPolicy: storagePolicy(policy.mode, policy.largeBlobSupport, policy.cleanupPending) };
}
function hasLocalVault() {
  return hasState(LOCAL_KEY);
}
function hasPendingUpgrade() {
  return hasState(UPGRADE_PENDING_KEY);
}
function isUnprotectedLocalVault() {
  return hasLocalVault() && !hasPasskey() && !hasPendingUpgrade();
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
function isExpectedPasskeyRegistrationFailure(err) {
  if (err?.message === "PASSKEY_PRF_REQUIRED" || err?.message === "PASSKEY_API_UNAVAILABLE") return true;
  return ["NotAllowedError", "NotSupportedError", "ConstraintError", "SecurityError"].includes(err?.name);
}
function cancelledRegistrationError() {
  try {
    return new DOMException("PASSKEY_REGISTRATION_CANCELLED", "NotAllowedError");
  } catch {
    return Object.assign(new Error("PASSKEY_REGISTRATION_CANCELLED"), { name: "NotAllowedError" });
  }
}
async function chooseRegistrationFallback(err) {
  if (fallbackDecisionOverride) return fallbackDecisionOverride(err);
  const { requestPasskeyFallback } = await import("./passkey-fallback-dialog-IXSLPTIB.js");
  return requestPasskeyFallback(err);
}
function preparePasskeyRegistration() {
  if (preparedRegistrationIconURL !== void 0) return Promise.resolve(preparedRegistrationIconURL);
  if (!registrationIconPreparation) {
    registrationIconPreparation = fetchFaviconBase64().then((iconURL) => {
      preparedRegistrationIconURL = iconURL || null;
      return preparedRegistrationIconURL;
    }).finally(() => {
      registrationIconPreparation = null;
    });
  }
  return registrationIconPreparation;
}
async function enableLocalVault() {
  const existing = readLocalKey();
  if (existing) {
    if (!isUnlocked()) unlock(existing, getState(SECRETS_BLOB_KEY, "") || null);
    return;
  }
  const localKey = crypto.getRandomValues(new Uint8Array(32));
  const ciphertext = sealEmptyVault(localKey);
  try {
    await updateState({
      set: {
        [LOCAL_KEY]: bytesToHex(localKey),
        [SECRETS_BLOB_KEY]: ciphertext
      },
      remove: [UPGRADE_PENDING_KEY, STORAGE_POLICY_KEY, PRF_BACKUP_KEY]
    });
    unlock(localKey, ciphertext);
    await requestPersistentStorage();
  } finally {
    localKey.fill(0);
  }
}
function continueWithoutPasskey() {
  if (hasPasskey() || hasPendingUpgrade()) throw new Error("PASSKEY_DOWNGRADE_FORBIDDEN");
  return enableLocalVault();
}
async function ensureRegisteredOnce() {
  if (hasPasskey() && isUnlocked() && !hasPendingUpgrade()) return;
  if (hasPasskey()) return unlock2();
  while (true) {
    try {
      if (hasLocalVault()) await promoteLocalVault();
      else await register();
      return;
    } catch (err) {
      if (!isExpectedPasskeyRegistrationFailure(err) || hasPasskey()) throw err;
      const choice = await chooseRegistrationFallback(err);
      if (choice === "retry") continue;
      if (choice === "local") return enableLocalVault();
      throw cancelledRegistrationError();
    }
  }
}
function ensureRegistered() {
  if (!registrationPromise) {
    registrationPromise = ensureRegisteredOnce().finally(() => {
      registrationPromise = null;
    });
  }
  return registrationPromise;
}
async function requirePasskeyOnce() {
  if (hasPasskey() && isUnlocked() && !hasPendingUpgrade()) return;
  if (hasPasskey()) return unlock2();
  if (hasLocalVault()) return promoteLocalVault();
  return register();
}
function requirePasskey() {
  if (!requiredPasskeyPromise) {
    requiredPasskeyPromise = requirePasskeyOnce().finally(() => {
      requiredPasskeyPromise = null;
    });
  }
  return requiredPasskeyPromise;
}
async function initializeVaultProtection() {
  const localKey = readLocalKey();
  const pending = readUpgradePending();
  if (pending) {
    if (!localKey || !hasPasskey()) throw new Error("PASSKEY_UPGRADE_STATE_INVALID");
    return;
  }
  if (!localKey) return;
  if (hasPasskey()) throw new Error("PASSKEY_LOCAL_STATE_INVALID");
  let ciphertext = getState(SECRETS_BLOB_KEY, "");
  if (!ciphertext) {
    ciphertext = sealEmptyVault(localKey);
    await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } });
  }
  unlock(localKey, ciphertext);
  localKey.fill(0);
}
async function createPasskeyMaterial() {
  if (!(globalThis.PublicKeyCredential || globalThis.window?.PublicKeyCredential) || !globalThis.navigator?.credentials?.create) {
    throw new Error("PASSKEY_API_UNAVAILABLE");
  }
  const userId = generateUserId();
  const iconURL = preparedRegistrationIconURL || null;
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
  return {
    rawId: credential.rawId,
    prfBytes,
    prfFromAssertion: Boolean(prfFromAssertion?.length),
    policy,
    metadata: {
      [CRED_ID_KEY]: credentialId,
      [TRANSPORTS_KEY]: transports,
      [USER_ID_KEY]: bytesToBase64Url(userId),
      ...iconURL ? { [ICON_KEY]: iconURL } : {}
    }
  };
}
async function register() {
  if (hasLocalVault()) return promoteLocalVault();
  const material = await createPasskeyMaterial();
  const ciphertext = sealEmptyVault(material.prfBytes);
  try {
    await updateState({
      set: {
        ...material.metadata,
        ...!material.prfFromAssertion && { [PRF_BACKUP_KEY]: bytesToHex(material.prfBytes) },
        [STORAGE_POLICY_KEY]: material.policy,
        ...material.policy.mode !== MODE_LARGE_BLOB && { [SECRETS_BLOB_KEY]: ciphertext }
      },
      remove: [LOCAL_KEY, UPGRADE_PENDING_KEY, ...material.prfFromAssertion ? [PRF_BACKUP_KEY] : []]
    });
  } catch (err) {
    await discardCredential(material.rawId);
    throw err;
  }
  unlock(material.prfBytes, material.policy.mode === MODE_LARGE_BLOB ? null : ciphertext);
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
function upgradeStageState(material) {
  return {
    ...material.metadata,
    ...!material.prfFromAssertion && { [PRF_BACKUP_KEY]: bytesToHex(material.prfBytes) },
    [UPGRADE_PENDING_KEY]: { targetPolicy: material.policy }
  };
}
async function recipherLocalVault(material, { stage = true } = {}) {
  const localKey = readLocalKey();
  if (!localKey) throw new Error("LOCAL_VAULT_KEY_MISSING");
  const oldMainOverride = isUnlocked() ? sealCurrentEntries() : null;
  const releaseTransition = beginVaultTransition();
  let committed = false;
  try {
    const result = await commitVaultProtectionUpgrade(async (snapshot) => {
      const rekeyer = createVaultRekeyer(localKey, material.prfBytes);
      try {
        const oldMain = oldMainOverride || snapshot.state[SECRETS_BLOB_KEY] || sealEmptyVault(localKey);
        const newMain = rekeyer.secrets(oldMain);
        const set = {
          [SECRETS_BLOB_KEY]: newMain,
          [STORAGE_POLICY_KEY]: material.policy
        };
        if (snapshot.state[CONTENT_KEYS_KEY]) {
          set[CONTENT_KEYS_KEY] = rekeyer.contentKeys(snapshot.state[CONTENT_KEYS_KEY]);
        }
        if (snapshot.state[TRUSTED_SIGNERS_KEY]) {
          set[TRUSTED_SIGNERS_KEY] = rekeyer.localState(snapshot.state[TRUSTED_SIGNERS_KEY], (parsed) => {
            if (!Array.isArray(parsed)) throw new Error("INVALID_TRUSTED_SIGNERS");
          });
        }
        const messengerLogs = [];
        for (const record of snapshot.messengerLogs) {
          if (!record?.sealed) {
            messengerLogs.push(record);
            continue;
          }
          try {
            messengerLogs.push({
              ...record,
              sealed: rekeyer.localState(record.sealed, (parsed) => {
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_ACTIVITY_LOG");
              })
            });
          } catch {
            console.warn("dropping corrupt activity-log entry during passkey promotion", record.id);
          }
        }
        return {
          ...stage && {
            stageSet: upgradeStageState(material),
            stageRemove: material.prfFromAssertion ? [PRF_BACKUP_KEY] : []
          },
          set,
          remove: [
            LOCAL_KEY,
            UPGRADE_PENDING_KEY,
            ...material.policy.mode === MODE_IDB ? [PRF_BACKUP_KEY] : []
          ],
          messengerLogs,
          result: { ciphertext: newMain }
        };
      } finally {
        rekeyer.destroy();
      }
    });
    committed = true;
    unlock(material.prfBytes, result.ciphertext);
    releaseTransition();
    await requestPersistentStorage();
  } catch (err) {
    if (hasPendingUpgrade()) lock();
    else if (!committed && material.rawId) await discardCredential(material.rawId);
    else if (committed) lock();
    throw err;
  } finally {
    localKey.fill(0);
    releaseTransition();
    if (!committed && hasPendingUpgrade() && isUnlocked()) lock();
  }
}
async function promoteLocalVault() {
  if (!hasLocalVault()) throw new Error("LOCAL_VAULT_KEY_MISSING");
  const material = await createPasskeyMaterial();
  return recipherLocalVault(material);
}
async function resumePendingUpgrade({ freshVerification = false } = {}) {
  const pending = readUpgradePending();
  if (!pending || !hasPasskey() || !hasLocalVault()) throw new Error("PASSKEY_UPGRADE_STATE_INVALID");
  const credentialId = getState(CRED_ID_KEY, "");
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [descriptorFromCredentialId(credentialId)],
      userVerification: "required",
      extensions: { prf: { eval: { first: PRF_SALT_BYTES } } }
    },
    ...freshVerification && { mediation: "required" }
  });
  if (!credential) throw new Error("PASSKEY_GET_FAILED");
  const extensions = extractExtensions(credential);
  const resolved = resolvePrfMaterial(extensions, {
    assertionRequired: pending.targetPolicy.mode === MODE_IDB
  });
  const policy = resolved.assertion?.length ? storagePolicy(MODE_IDB, pending.targetPolicy.largeBlobSupport) : pending.targetPolicy;
  return recipherLocalVault({
    rawId: null,
    prfBytes: resolved.selected,
    prfFromAssertion: Boolean(resolved.assertion?.length),
    policy,
    metadata: {}
  }, { stage: false });
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
  if (hasPendingUpgrade()) return resumePendingUpgrade();
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
  await waitForVaultTransition();
  if (!isUnlocked()) throw new Error("VAULT_LOCKED");
  const sealed = ciphertext ?? sealCurrentEntries();
  if (!hasPasskey()) {
    if (!hasLocalVault()) throw new Error("PASSKEY_NOT_REGISTERED");
    await updateState({ set: { [SECRETS_BLOB_KEY]: sealed } });
    return;
  }
  if (hasPendingUpgrade()) throw new Error("PASSKEY_UPGRADE_PENDING");
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
  if (!hasPasskey()) {
    if (!hasLocalVault()) throw new Error("PASSKEY_NOT_REGISTERED");
    return discloseCurrentEntries();
  }
  if (hasPendingUpgrade()) {
    await resumePendingUpgrade({ freshVerification: true });
    return discloseCurrentEntries();
  }
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
  isUnprotectedLocalVault,
  hasPasskey,
  isExpectedPasskeyRegistrationFailure,
  preparePasskeyRegistration,
  continueWithoutPasskey,
  ensureRegistered,
  requirePasskey,
  initializeVaultProtection,
  unlock2 as unlock,
  persistSecretsBlob,
  snapshotSecretsBlob,
  restoreSecretsBlobSnapshot,
  openSecrets,
  checkForIconUpdate,
  flushPendingIconUpdate
};
