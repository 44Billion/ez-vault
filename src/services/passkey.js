import { getPublicKey } from 'libp2r2p/key'
import { hexToBytes, bytesToHex } from 'libp2r2p/base16'
import { decodeSecretEntries, encodeSecretEntries } from './secret-blob.js'
import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url } from 'libp2r2p/base64'
import { detectPlatform } from '../helpers/platform.js'
import { fetchFaviconBase64 } from '../helpers/favicon.js'
import { sharedXOnlySecret } from 'libp2r2p/ecdh'
import * as nip44v3 from 'libp2r2p/nip44-v3'
import * as secrets from './secrets.js'
import {
  commitVaultProtectionUpgrade,
  getState,
  hasState,
  removeState,
  requestPersistentStorage,
  updateState
} from './storage/index.js'

// EZ Vault's vault-protection integration. Normally a passkey custodies the
// encryption key (deterministic, derived from WebAuthn PRF) for every account
// secret. The explicit no-passkey mode instead keeps a random key beside the
// ciphertext in IndexedDB, which is equivalent to plaintext against a local
// storage reader. This module is intentionally byte-thin: it talks to the
// authenticator and to IndexedDB, and hands the resulting ciphertext to
// `secrets` for sealing/unsealing. The TLV layout, the vault key, and the
// raw secret material all live inside `secrets.js` and never travel
// through this file.
//
// Cross-device portability is deliberately routed through the vault's own
// pairing flow (`nostrpair://` QR codes), never through authenticator sync.
// Vendor-backed sync (Google Password Manager, iCloud Keychain, ...) means
// the vendor holds the keys backing the synced credential, which is a weaker
// guarantee than our pairing flow provides — so authenticator sync is not
// the trust anchor. `residentKey: 'preferred'` is a pragmatic compromise:
// the credential stays non-discoverable where the authenticator allows it,
// while Android still gets a Google Password Manager passkey because that is
// the only Android path that exposes PRF. If the platform syncs the
// credential anyway, we don't rely on that sync — the vault always addresses
// the credential by the credentialId persisted in IndexedDB. The random
// `user.id` is the belt: for a discoverable credential the spec mandates
// overwrite when `(rpId, user.id)` collide, so randomizing it per
// registration keeps a fresh registration on a second device from clobbering
// the first; we persist it so `signalCurrentUserDetails` can later target
// the credential.
//
// Secret persistence adapts to the credential's current capabilities. When
// assertions return PRF, IndexedDB holds only the encrypted secret blob. When
// PRF is create-only, IndexedDB holds the compatibility PRF and largeBlob holds
// the ciphertext. If largeBlob is unavailable, both must coexist in IndexedDB
// as an explicit compatibility fallback. Promotion to assertion PRF + IDB blob
// is monotonic: the plaintext PRF backup is never recreated afterwards.
// Local-mode promotion reciphers every durable sensitive payload under PRF
// before atomically deleting the co-resident local key.

const PRF_SALT = 'ez-vault'
const RP_NAME = '44billion · EZ Vault'
// Hints are preferences, not filters. Ask browsers to foreground the current
// device while still allowing security keys and hybrid phone flows when no
// platform authenticator is available (notably Firefox on desktop Linux).
const CREATE_HINTS = ['client-device', 'hybrid', 'security-key']
const LEGACY_GET_TRANSPORTS = ['internal']

const CRED_ID_KEY = 'ez-vault:passkey:credential-id'
const TRANSPORTS_KEY = 'ez-vault:passkey:transports'
const USER_ID_KEY = 'ez-vault:passkey:user-id'
const ICON_KEY = 'ez-vault:passkey:icon'
const PRF_BACKUP_KEY = 'ez-vault:passkey:prf'
const SECRETS_BLOB_KEY = 'ez-vault:passkey:blob'
const STORAGE_POLICY_KEY = 'ez-vault:passkey:storage-policy'
const LOCAL_KEY = 'ez-vault:passkey:local-key'
const UPGRADE_PENDING_KEY = 'ez-vault:passkey:upgrade-pending'
const CONTENT_KEYS_KEY = 'ez-vault:content-keys'
const TRUSTED_SIGNERS_KEY = 'ez-vault:trusted-signers'
const MODE_IDB = 'idb'
const MODE_LARGE_BLOB = 'largeblob'
const MODE_IDB_COMPAT = 'idb-compat'
const SUPPORT_SUPPORTED = 'supported'
const SUPPORT_UNSUPPORTED = 'unsupported'
const SUPPORT_UNKNOWN = 'unknown'
const VAULT_NIP44_KIND = 2
const VAULT_SECRETS_SCOPE = 'vault-secrets-v1'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const PRF_SALT_BYTES = textEncoder.encode(PRF_SALT)

// Staged on page-load when a favicon change is detected against the stored
// copy. Flushed by `flushPendingIconUpdate()` right after a successful unlock
// — that timing piggybacks on the user-verification prompt the unlock just
// triggered, in case any platform decides `signalCurrentUserDetails` is not
// fully silent.
let pendingIconUpdate = null
let registrationPromise = null
let requiredPasskeyPromise = null
let fallbackDecisionOverride = null
let preparedRegistrationIconURL
let registrationIconPreparation = null

function bufferToUint8 (value) {
  if (!value) return null
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

function extractExtensions (credential) {
  return credential?.getClientExtensionResults?.() ?? {}
}

function extractPrfBytes (extensions) {
  return bufferToUint8(extensions?.prf?.results?.first)
}

function extractLargeBlobBytes (extensions) {
  const blob = extensions?.largeBlob?.blob
  const bytes = bufferToUint8(blob)
  return bytes && bytes.length ? bytes : null
}

function bytesEqual (left, right) {
  if (!left || !right || left.length !== right.length) return false
  let difference = 0
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i]
  return difference === 0
}

function storagePolicy (mode, largeBlobSupport, cleanupPending = false) {
  return { mode, largeBlobSupport, cleanupPending: Boolean(cleanupPending) }
}

function largeBlobSupportFromCreate (extensions) {
  if (extensions?.largeBlob?.supported === true) return SUPPORT_SUPPORTED
  if (extensions?.largeBlob?.supported === false) return SUPPORT_UNSUPPORTED
  return SUPPORT_UNKNOWN
}

function readStoragePolicy () {
  const policy = getState(STORAGE_POLICY_KEY)
  if (!policy || typeof policy !== 'object') return null
  if (![MODE_IDB, MODE_LARGE_BLOB, MODE_IDB_COMPAT].includes(policy.mode)) return null
  if (![SUPPORT_SUPPORTED, SUPPORT_UNSUPPORTED, SUPPORT_UNKNOWN].includes(policy.largeBlobSupport)) return null
  return storagePolicy(policy.mode, policy.largeBlobSupport, policy.cleanupPending)
}

function readLocalKey () {
  const stored = getState(LOCAL_KEY, '')
  if (!stored) return null
  if (!/^[0-9a-f]{64}$/.test(stored)) throw new Error('LOCAL_VAULT_KEY_INVALID')
  return hexToBytes(stored)
}

function readUpgradePending () {
  const pending = getState(UPGRADE_PENDING_KEY)
  if (!pending || typeof pending !== 'object') return null
  const policy = pending.targetPolicy
  if (!policy || ![MODE_IDB, MODE_LARGE_BLOB, MODE_IDB_COMPAT].includes(policy.mode)) return null
  if (![SUPPORT_SUPPORTED, SUPPORT_UNSUPPORTED, SUPPORT_UNKNOWN].includes(policy.largeBlobSupport)) return null
  return { targetPolicy: storagePolicy(policy.mode, policy.largeBlobSupport, policy.cleanupPending) }
}

export function hasLocalVault () {
  return hasState(LOCAL_KEY)
}

export function hasPendingUpgrade () {
  return hasState(UPGRADE_PENDING_KEY)
}

// Stable explicit local mode: there is no passkey credential and no staged
// promotion that must remain fail-closed. Copy and account-removal flows use
// this distinction to avoid offering an immediate security upgrade.
export function isUnprotectedLocalVault () {
  return hasLocalVault() && !hasPasskey() && !hasPendingUpgrade()
}

function normalizeTransports (transports) {
  if (!Array.isArray(transports)) return []
  return [...new Set(transports.filter(transport => typeof transport === 'string' && transport))]
}

function transportsFromCredential (credential) {
  const getTransports = credential?.response?.getTransports
  if (typeof getTransports !== 'function') return []
  try {
    return normalizeTransports(getTransports.call(credential.response))
  } catch {
    return []
  }
}

function readStoredTransports () {
  // Registrations made before transport metadata was introduced were
  // explicitly platform-only, so `internal` is exact for those credentials.
  // New registrations persist even an empty array, which means "unknown" and
  // deliberately omits the descriptor hint rather than excluding valid paths.
  const transports = getState(TRANSPORTS_KEY, null)
  return Array.isArray(transports)
    ? normalizeTransports(transports)
    : LEGACY_GET_TRANSPORTS
}

function descriptorFromCredentialId (credentialId, transports = readStoredTransports()) {
  if (!credentialId) return null
  return {
    id: base64UrlToBytes(credentialId),
    type: 'public-key',
    ...(transports.length && { transports })
  }
}

function generateUserId () {
  // Spec recommends <= 64 random bytes, opaque, non-correlatable across RPs.
  return crypto.getRandomValues(new Uint8Array(64))
}

function readStoredUserId () {
  const stored = getState(USER_ID_KEY, '')
  if (!stored) return null
  try {
    return { bytes: base64UrlToBytes(stored), base64url: stored }
  } catch {
    return null
  }
}

// Some authenticators only surface `user.name` (not `displayName`), so we
// pack a platform hint plus a short slice of the random user.id into it.
// The suffix makes multiple synced entries distinguishable in the
// authenticator UI ("44billion · EZ Vault · macOS / Safari (a3f9c1)" vs
// "44billion · EZ Vault · iOS / Safari (b7c204)").
function buildUserName (userId) {
  const platform = detectPlatform()
  const known = !/unknown OS|unknown browser/.test(platform)
  const base = known ? `${RP_NAME} · ${platform}` : RP_NAME
  const suffix = bytesToBase64Url(userId).slice(0, 6)
  return `${base} (${suffix})`
}

// Probe every freshly-created credential with an assertion. Some platforms
// expose PRF only on creation, others only on assertions, and assertion support
// lets us avoid persisting the creation-time PRF in plaintext. This is always
// attempted even when create() already returned PRF. `userVerification:
// 'discouraged'` minimizes the chance of a second visible prompt after the
// immediately preceding creation ceremony.
async function fetchPrfViaGet (rawId, transports) {
  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [descriptorFromCredentialId(
          bytesToBase64Url(new Uint8Array(rawId)),
          transports
        )],
        userVerification: 'discouraged',
        extensions: {
          prf: { eval: { first: PRF_SALT_BYTES } }
        }
      }
    })
    return extractPrfBytes(extractExtensions(credential))
  } catch (err) {
    console.warn('PRF follow-up get() failed', err?.message ?? err)
    return null
  }
}

// Tell the platform to discard the credential we just created — used when a
// fresh registration cannot yield PRF or returns inconsistent PRF outputs and
// is therefore unsafe/useless to us. Best-effort: silently no-ops if the API
// isn't supported, and swallows errors so the caller's meaningful throw is
// never masked.
async function discardCredential (rawId) {
  const signalFn = window?.PublicKeyCredential?.signalUnknownCredential
  if (typeof signalFn !== 'function') return
  try {
    await signalFn({
      rpId: window.location.hostname,
      credentialId: bytesToBase64Url(new Uint8Array(rawId))
    })
  } catch (err) {
    console.warn('signalUnknownCredential failed', err?.message ?? err)
  }
}

export function hasPasskey () {
  return hasState(CRED_ID_KEY)
}

// Ensure there's a passkey backing the vault and the vault is unlocked.
// No-op if both already hold; registers a fresh passkey if none exists.
//
// When a passkey already exists but the vault is locked we unlock it
// (which prompts) instead of refusing. This covers the case where the
// user deleted every account, the lock overlay went away (because no
// non-npub accounts remain to lock), and they then create or import a
// new account — without this branch, the silent "VAULT_LOCKED" throw
// dead-ends the create flow even though we still hold a perfectly good
// passkey credential.
export function isExpectedPasskeyRegistrationFailure (err) {
  if (err?.message === 'PASSKEY_PRF_REQUIRED' || err?.message === 'PASSKEY_API_UNAVAILABLE') return true
  return ['NotAllowedError', 'NotSupportedError', 'ConstraintError', 'SecurityError'].includes(err?.name)
}

function cancelledRegistrationError () {
  try {
    return new DOMException('PASSKEY_REGISTRATION_CANCELLED', 'NotAllowedError')
  } catch {
    return Object.assign(new Error('PASSKEY_REGISTRATION_CANCELLED'), { name: 'NotAllowedError' })
  }
}

async function chooseRegistrationFallback (err) {
  if (fallbackDecisionOverride) return fallbackDecisionOverride(err)
  const { requestPasskeyFallback } = await import('../components/passkey-fallback-dialog.js')
  return requestPasskeyFallback(err)
}

export function setFallbackDecisionForTests (fn = null) {
  fallbackDecisionOverride = typeof fn === 'function' ? fn : null
}

// Warm the only network-derived registration field before UI presents a
// button whose click must reach `navigator.credentials.create()` while its
// transient activation is still alive. Pomegranate calls this after OAuth and
// before showing its protection choice. `null` is a completed best-effort miss.
export function preparePasskeyRegistration () {
  if (preparedRegistrationIconURL !== undefined) return Promise.resolve(preparedRegistrationIconURL)
  if (!registrationIconPreparation) {
    registrationIconPreparation = fetchFaviconBase64()
      .then(iconURL => {
        preparedRegistrationIconURL = iconURL || null
        return preparedRegistrationIconURL
      })
      .finally(() => { registrationIconPreparation = null })
  }
  return registrationIconPreparation
}

async function enableLocalVault () {
  const existing = readLocalKey()
  if (existing) {
    if (!secrets.isUnlocked()) secrets.unlock(existing, getState(SECRETS_BLOB_KEY, '') || null)
    return
  }
  const localKey = crypto.getRandomValues(new Uint8Array(32))
  const ciphertext = sealEmptyVault(localKey)
  try {
    await updateState({
      set: {
        [LOCAL_KEY]: bytesToHex(localKey),
        [SECRETS_BLOB_KEY]: ciphertext
      },
      remove: [UPGRADE_PENDING_KEY, STORAGE_POLICY_KEY, PRF_BACKUP_KEY]
    })
    secrets.unlock(localKey, ciphertext)
    await requestPersistentStorage()
  } finally {
    localKey.fill(0)
  }
}

// Explicit opt-in used by a UI that has already explained the local mode.
// This must never turn an existing or staged passkey vault back into local
// storage; local-to-passkey promotion remains monotonic.
export function continueWithoutPasskey () {
  if (hasPasskey() || hasPendingUpgrade()) throw new Error('PASSKEY_DOWNGRADE_FORBIDDEN')
  return enableLocalVault()
}

async function ensureRegisteredOnce () {
  if (hasPasskey() && secrets.isUnlocked() && !hasPendingUpgrade()) return
  if (hasPasskey()) return unlock()

  while (true) {
    try {
      if (hasLocalVault()) await promoteLocalVault()
      else await register()
      return
    } catch (err) {
      if (!isExpectedPasskeyRegistrationFailure(err) || hasPasskey()) throw err
      const choice = await chooseRegistrationFallback(err)
      if (choice === 'retry') continue
      if (choice === 'local') return enableLocalVault()
      throw cancelledRegistrationError()
    }
  }
}

export function ensureRegistered () {
  if (!registrationPromise) {
    registrationPromise = ensureRegisteredOnce().finally(() => { registrationPromise = null })
  }
  return registrationPromise
}

// Require actual passkey protection without offering the deliberately weaker
// local fallback. Manual locking uses this path because a vault whose key is
// still present in local IndexedDB has not meaningfully been locked. Keep this
// operation separately single-flight from the opt-in fallback flow: normal UI
// coordination prevents the two entry points from racing, while callers of
// this stricter operation always share one registration/promotion ceremony.
async function requirePasskeyOnce () {
  if (hasPasskey() && secrets.isUnlocked() && !hasPendingUpgrade()) return
  if (hasPasskey()) return unlock()
  if (hasLocalVault()) return promoteLocalVault()
  return register()
}

export function requirePasskey () {
  if (!requiredPasskeyPromise) {
    requiredPasskeyPromise = requirePasskeyOnce().finally(() => { requiredPasskeyPromise = null })
  }
  return requiredPasskeyPromise
}

// Restore the deliberately-unprotected local mode before components decide
// whether to display the lock/create overlays. A staged promotion remains
// locked: its local key is recovery material, not an unlock bypass.
export async function initializeVaultProtection () {
  const localKey = readLocalKey()
  const pending = readUpgradePending()
  if (pending) {
    if (!localKey || !hasPasskey()) throw new Error('PASSKEY_UPGRADE_STATE_INVALID')
    return
  }
  if (!localKey) return
  if (hasPasskey()) throw new Error('PASSKEY_LOCAL_STATE_INVALID')
  let ciphertext = getState(SECRETS_BLOB_KEY, '')
  if (!ciphertext) {
    ciphertext = sealEmptyVault(localKey)
    await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } })
  }
  secrets.unlock(localKey, ciphertext)
  localKey.fill(0)
}

async function createPasskeyMaterial () {
  if (!(globalThis.PublicKeyCredential || globalThis.window?.PublicKeyCredential) ||
      !globalThis.navigator?.credentials?.create) {
    throw new Error('PASSKEY_API_UNAVAILABLE')
  }
  const userId = generateUserId()
  // This value was prepared before the user-facing action when possible.
  // Do not await network work here: cross-origin iframe registration requires
  // transient activation from the click that selected passkey protection.
  const iconURL = preparedRegistrationIconURL || null
  const userEntity = {
    id: userId,
    name: buildUserName(userId),
    displayName: RP_NAME,
    ...(iconURL && { iconURL })
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: window.location.hostname, name: RP_NAME },
      user: userEntity,
      pubKeyCredParams: [
        { alg: -8, type: 'public-key' },
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' }
      ],
      authenticatorSelection: {
        // Preferred: non-discoverable where the authenticator honors it, but
        // Android then creates a Google Password Manager passkey — the only
        // Android credential type that exposes PRF. Platform sync may
        // happen, but it is never the intended cross-device path (that's
        // `nostrpair`); the random `user.id` above is the belt against a
        // synced credential being overwritten by a future registration on
        // another device.
        residentKey: 'preferred',
        userVerification: 'discouraged'
      },
      hints: CREATE_HINTS,
      extensions: {
        prf: { eval: { first: PRF_SALT_BYTES } },
        largeBlob: { support: 'preferred' },
        // Diagnostic: reports whether the created credential is actually
        // discoverable (rk). This is intentionally diagnostic only: rk,
        // residentKey, backup eligibility (BE), and backup state (BS) are
        // distinct properties, and none gives the RP control over sync.
        credProps: true
      }
    }
  })
  if (!credential) throw new Error('PASSKEY_CREATE_FAILED')

  const ext = extractExtensions(credential)
  const transports = transportsFromCredential(credential)
  const prfFromCreate = extractPrfBytes(ext)
  const largeBlobSupport = largeBlobSupportFromCreate(ext)
  const isDiscoverable = Boolean(ext.credProps?.rk)
  console.info('[passkey] probing assertion PRF after create', {
    rk: isDiscoverable,
    createPrf: Boolean(prfFromCreate?.length)
  })
  const prfFromAssertion = await fetchPrfViaGet(credential.rawId, transports)

  if (prfFromCreate?.length && prfFromAssertion?.length && !bytesEqual(prfFromCreate, prfFromAssertion)) {
    await discardCredential(credential.rawId)
    throw new Error('PASSKEY_PRF_MISMATCH')
  }

  // Prefer the assertion result because that is the path every future unlock
  // uses. Fall back to create-time PRF only for create-only authenticators.
  const prfBytes = prfFromAssertion?.length ? prfFromAssertion : prfFromCreate
  if (!prfBytes?.length) {
    // Credential is useless to us without PRF — best-effort tell the
    // authenticator to forget it so the user isn't left with a dangling
    // entry, then bail.
    await discardCredential(credential.rawId)
    throw new Error('PASSKEY_PRF_REQUIRED')
  }

  const credentialId = bytesToBase64Url(new Uint8Array(credential.rawId))
  const policy = prfFromAssertion?.length
    ? storagePolicy(MODE_IDB, largeBlobSupport)
    : largeBlobSupport === SUPPORT_SUPPORTED
      ? storagePolicy(MODE_LARGE_BLOB, SUPPORT_SUPPORTED)
      : storagePolicy(MODE_IDB_COMPAT, largeBlobSupport)
  return {
    rawId: credential.rawId,
    prfBytes,
    prfFromAssertion: Boolean(prfFromAssertion?.length),
    policy,
    metadata: {
      [CRED_ID_KEY]: credentialId,
      [TRANSPORTS_KEY]: transports,
      [USER_ID_KEY]: bytesToBase64Url(userId),
      ...(iconURL ? { [ICON_KEY]: iconURL } : {})
    }
  }
}

// Create the passkey and activate a fresh, empty vault. Local-mode promotion
// uses the same credential ceremony but follows the reciphering path below.
export async function register () {
  if (hasLocalVault()) return promoteLocalVault()
  const material = await createPasskeyMaterial()
  const ciphertext = sealEmptyVault(material.prfBytes)
  try {
    await updateState({
      set: {
        ...material.metadata,
        ...(!material.prfFromAssertion && { [PRF_BACKUP_KEY]: bytesToHex(material.prfBytes) }),
        [STORAGE_POLICY_KEY]: material.policy,
        ...(material.policy.mode !== MODE_LARGE_BLOB && { [SECRETS_BLOB_KEY]: ciphertext })
      },
      remove: [LOCAL_KEY, UPGRADE_PENDING_KEY, ...(material.prfFromAssertion ? [PRF_BACKUP_KEY] : [])]
    })
  } catch (err) {
    await discardCredential(material.rawId)
    throw err
  }
  secrets.unlock(material.prfBytes, material.policy.mode === MODE_LARGE_BLOB ? null : ciphertext)
  await requestPersistentStorage()
}

function sealEmptyVault (prfBytes) {
  const ck = sharedXOnlySecret(prfBytes, getPublicKey(prfBytes))
  return nip44v3.encryptWithConversationKey(
    ck,
    VAULT_NIP44_KIND,
    VAULT_SECRETS_SCOPE,
    bytesToBase64(encodeSecretEntries([]))
  )
}

function upgradeStageState (material) {
  return {
    ...material.metadata,
    ...(!material.prfFromAssertion && { [PRF_BACKUP_KEY]: bytesToHex(material.prfBytes) }),
    [UPGRADE_PENDING_KEY]: { targetPolicy: material.policy }
  }
}

async function recipherLocalVault (material, { stage = true } = {}) {
  const localKey = readLocalKey()
  if (!localKey) throw new Error('LOCAL_VAULT_KEY_MISSING')
  const oldMainOverride = secrets.isUnlocked() ? secrets.sealCurrentEntries() : null
  const releaseTransition = secrets.beginVaultTransition()
  let committed = false
  try {
    const result = await commitVaultProtectionUpgrade(async snapshot => {
      const rekeyer = secrets.createVaultRekeyer(localKey, material.prfBytes)
      try {
        const oldMain = oldMainOverride || snapshot.state[SECRETS_BLOB_KEY] || sealEmptyVault(localKey)
        const newMain = rekeyer.secrets(oldMain)
        const set = {
          [SECRETS_BLOB_KEY]: newMain,
          [STORAGE_POLICY_KEY]: material.policy
        }
        if (snapshot.state[CONTENT_KEYS_KEY]) {
          set[CONTENT_KEYS_KEY] = rekeyer.contentKeys(snapshot.state[CONTENT_KEYS_KEY])
        }
        if (snapshot.state[TRUSTED_SIGNERS_KEY]) {
          set[TRUSTED_SIGNERS_KEY] = rekeyer.localState(snapshot.state[TRUSTED_SIGNERS_KEY], parsed => {
            if (!Array.isArray(parsed)) throw new Error('INVALID_TRUSTED_SIGNERS')
          })
        }

        const messengerLogs = []
        for (const record of snapshot.messengerLogs) {
          if (!record?.sealed) {
            messengerLogs.push(record)
            continue
          }
          try {
            messengerLogs.push({
              ...record,
              sealed: rekeyer.localState(record.sealed, parsed => {
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_ACTIVITY_LOG')
              })
            })
          } catch {
            console.warn('dropping corrupt activity-log entry during passkey promotion', record.id)
          }
        }

        return {
          ...(stage && {
            stageSet: upgradeStageState(material),
            stageRemove: material.prfFromAssertion ? [PRF_BACKUP_KEY] : []
          }),
          set,
          remove: [
            LOCAL_KEY,
            UPGRADE_PENDING_KEY,
            ...(material.policy.mode === MODE_IDB ? [PRF_BACKUP_KEY] : [])
          ],
          messengerLogs,
          result: { ciphertext: newMain }
        }
      } finally {
        rekeyer.destroy()
      }
    })
    committed = true
    secrets.unlock(material.prfBytes, result.ciphertext)
    releaseTransition()
    await requestPersistentStorage()
  } catch (err) {
    if (hasPendingUpgrade()) secrets.lock()
    else if (!committed && material.rawId) await discardCredential(material.rawId)
    else if (committed) secrets.lock()
    throw err
  } finally {
    localKey.fill(0)
    releaseTransition()
    if (!committed && hasPendingUpgrade() && secrets.isUnlocked()) secrets.lock()
  }
}

async function promoteLocalVault () {
  if (!hasLocalVault()) throw new Error('LOCAL_VAULT_KEY_MISSING')
  const material = await createPasskeyMaterial()
  return recipherLocalVault(material)
}

async function resumePendingUpgrade ({ freshVerification = false } = {}) {
  const pending = readUpgradePending()
  if (!pending || !hasPasskey() || !hasLocalVault()) throw new Error('PASSKEY_UPGRADE_STATE_INVALID')
  const credentialId = getState(CRED_ID_KEY, '')
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [descriptorFromCredentialId(credentialId)],
      userVerification: 'required',
      extensions: { prf: { eval: { first: PRF_SALT_BYTES } } }
    },
    ...(freshVerification && { mediation: 'required' })
  })
  if (!credential) throw new Error('PASSKEY_GET_FAILED')
  const extensions = extractExtensions(credential)
  const resolved = resolvePrfMaterial(extensions, {
    assertionRequired: pending.targetPolicy.mode === MODE_IDB
  })
  const policy = resolved.assertion?.length
    ? storagePolicy(MODE_IDB, pending.targetPolicy.largeBlobSupport)
    : pending.targetPolicy
  return recipherLocalVault({
    rawId: null,
    prfBytes: resolved.selected,
    prfFromAssertion: Boolean(resolved.assertion?.length),
    policy,
    metadata: {}
  }, { stage: false })
}

function readPrfBackup () {
  const stored = getState(PRF_BACKUP_KEY, '')
  return stored ? hexToBytes(stored) : null
}

function resolvePrfMaterial (extensions, { assertionRequired = false } = {}) {
  const assertion = extractPrfBytes(extensions)
  const backup = readPrfBackup()
  if (assertion?.length && backup?.length && !bytesEqual(assertion, backup)) {
    throw new Error('PASSKEY_PRF_MISMATCH')
  }
  if (assertionRequired && !assertion?.length) throw new Error('PASSKEY_PRF_MISSING')
  const selected = assertion?.length ? assertion : backup
  if (!selected?.length) throw new Error('PASSKEY_PRF_MISSING')
  return { assertion, backup, selected }
}

function decodeLargeBlob (extensions) {
  const bytes = extractLargeBlobBytes(extensions)
  return bytes ? textDecoder.decode(bytes) : ''
}

function validateCiphertext (prfBytes, ciphertext) {
  unsealEntries(prfBytes, ciphertext)
  return ciphertext
}

function assertionRequest (policy, localCiphertext) {
  const extensions = { prf: { eval: { first: PRF_SALT_BYTES } } }
  if (!policy) {
    extensions.largeBlob = { read: true }
    return { extensions, action: 'read' }
  }
  if (policy.mode === MODE_IDB && policy.cleanupPending) {
    extensions.largeBlob = { write: new Uint8Array(0) }
    return { extensions, action: 'cleanup' }
  }
  if (policy.mode === MODE_LARGE_BLOB) {
    if (localCiphertext) {
      extensions.largeBlob = { write: textEncoder.encode(localCiphertext) }
      return { extensions, action: 'write-fallback' }
    }
    extensions.largeBlob = { read: true }
    return { extensions, action: 'read' }
  }
  return { extensions, action: 'none' }
}

async function promoteToIdb (ciphertext, largeBlobSupport, cleanupPending) {
  await updateState({
    set: {
      [SECRETS_BLOB_KEY]: ciphertext,
      [STORAGE_POLICY_KEY]: storagePolicy(MODE_IDB, largeBlobSupport, cleanupPending)
    },
    remove: [PRF_BACKUP_KEY]
  })
}

async function resolveLegacyAccess (extensions, localCiphertext) {
  const remoteCiphertext = decodeLargeBlob(extensions)
  const { assertion, selected } = resolvePrfMaterial(extensions)
  const ciphertext = localCiphertext || remoteCiphertext || sealEmptyVault(selected)
  validateCiphertext(selected, ciphertext)

  if (assertion?.length) {
    await promoteToIdb(
      ciphertext,
      remoteCiphertext ? SUPPORT_SUPPORTED : SUPPORT_UNKNOWN,
      Boolean(remoteCiphertext)
    )
  } else {
    await updateState({
      set: {
        [STORAGE_POLICY_KEY]: storagePolicy(
          MODE_LARGE_BLOB,
          remoteCiphertext ? SUPPORT_SUPPORTED : SUPPORT_UNKNOWN
        )
      }
    })
  }
  return { prfBytes: selected, ciphertext }
}

async function resolveIdbAccess (policy, extensions, localCiphertext, action) {
  const { assertion } = resolvePrfMaterial(extensions, { assertionRequired: true })
  const ciphertext = localCiphertext || sealEmptyVault(assertion)
  validateCiphertext(assertion, ciphertext)
  const cleanupPending = action === 'cleanup' && extensions?.largeBlob?.written === true
    ? false
    : policy.cleanupPending
  await updateState({
    set: {
      [SECRETS_BLOB_KEY]: ciphertext,
      [STORAGE_POLICY_KEY]: storagePolicy(MODE_IDB, policy.largeBlobSupport, cleanupPending)
    },
    remove: [PRF_BACKUP_KEY]
  })
  return { prfBytes: assertion, ciphertext }
}

async function resolveCompatAccess (policy, extensions, localCiphertext) {
  const { assertion, selected } = resolvePrfMaterial(extensions)
  const ciphertext = localCiphertext || sealEmptyVault(selected)
  validateCiphertext(selected, ciphertext)
  if (assertion?.length) {
    await promoteToIdb(ciphertext, policy.largeBlobSupport, false)
  } else if (!localCiphertext) {
    await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } })
  }
  return { prfBytes: selected, ciphertext }
}

async function resolveLargeBlobAccess (policy, extensions, localCiphertext, action) {
  const remoteCiphertext = action === 'read' ? decodeLargeBlob(extensions) : ''
  const { assertion, selected } = resolvePrfMaterial(extensions)
  const ciphertext = localCiphertext || remoteCiphertext || sealEmptyVault(selected)
  validateCiphertext(selected, ciphertext)

  if (assertion?.length) {
    // A write means an older largeBlob may still exist even when this write
    // was declined, so cleanup is conservative in that branch.
    const cleanupPending = action === 'write-fallback' || Boolean(remoteCiphertext)
    const support = extensions?.largeBlob?.written === true
      ? SUPPORT_SUPPORTED
      : policy.largeBlobSupport
    await promoteToIdb(ciphertext, support, cleanupPending)
  } else if (action === 'write-fallback' && extensions?.largeBlob?.written === true) {
    await updateState({
      set: { [STORAGE_POLICY_KEY]: storagePolicy(MODE_LARGE_BLOB, SUPPORT_SUPPORTED) },
      remove: [SECRETS_BLOB_KEY]
    })
  } else if (remoteCiphertext && policy.largeBlobSupport !== SUPPORT_SUPPORTED) {
    await updateState({
      set: { [STORAGE_POLICY_KEY]: storagePolicy(MODE_LARGE_BLOB, SUPPORT_SUPPORTED) }
    })
  }
  return { prfBytes: selected, ciphertext }
}

async function resolveVaultMaterial (policy, extensions, localCiphertext, action) {
  if (!policy) return resolveLegacyAccess(extensions, localCiphertext)
  if (policy.mode === MODE_IDB) return resolveIdbAccess(policy, extensions, localCiphertext, action)
  if (policy.mode === MODE_IDB_COMPAT) return resolveCompatAccess(policy, extensions, localCiphertext)
  return resolveLargeBlobAccess(policy, extensions, localCiphertext, action)
}

async function obtainVaultMaterial ({ freshVerification = false } = {}) {
  const credentialId = getState(CRED_ID_KEY, '')
  if (!credentialId) throw new Error('PASSKEY_NOT_REGISTERED')
  const descriptor = descriptorFromCredentialId(credentialId)
  const policy = readStoragePolicy()
  const localCiphertext = getState(SECRETS_BLOB_KEY, '')
  const { extensions, action } = assertionRequest(policy, localCiphertext)

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [descriptor],
      userVerification: 'required',
      extensions
    },
    ...(freshVerification && { mediation: 'required' })
  })
  if (!credential) throw new Error('PASSKEY_GET_FAILED')

  return resolveVaultMaterial(policy, extractExtensions(credential), localCiphertext, action)
}

// Read the passkey and resolve the adaptive PRF/ciphertext storage policy.
export async function unlock () {
  if (hasPendingUpgrade()) return resumePendingUpgrade()
  const { prfBytes, ciphertext } = await obtainVaultMaterial()
  secrets.unlock(prfBytes, ciphertext)
  await requestPersistentStorage()
}

async function writeLargeBlob (ciphertext, policy) {
  const credentialId = getState(CRED_ID_KEY, '')
  const descriptor = descriptorFromCredentialId(credentialId)
  const previousFallback = getState(SECRETS_BLOB_KEY, '')

  // If a fallback already exists, keep it current before crossing the
  // non-transactional WebAuthn boundary. A crash can then never resurrect its
  // older contents over a newly-written largeBlob.
  if (previousFallback) await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } })

  let credential
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [descriptor],
        userVerification: 'discouraged',
        extensions: {
          prf: { eval: { first: PRF_SALT_BYTES } },
          largeBlob: { write: textEncoder.encode(ciphertext) }
        }
      }
    })
  } catch (err) {
    if (err?.name === 'NotAllowedError') {
      await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } })
      return
    }
    await restoreSecretsBlobSnapshot(previousFallback || null)
    throw err
  }

  const extensions = extractExtensions(credential)
  const written = extensions?.largeBlob?.written === true
  let prf
  try {
    prf = resolvePrfMaterial(extensions)
  } catch (err) {
    if (written) err.persistenceMayHaveCommitted = true
    else await restoreSecretsBlobSnapshot(previousFallback || null)
    throw err
  }

  if (prf.assertion?.length) {
    try {
      validateCiphertext(prf.assertion, ciphertext)
    } catch (err) {
      if (written) err.persistenceMayHaveCommitted = true
      else await restoreSecretsBlobSnapshot(previousFallback || null)
      throw err
    }
    try {
      await promoteToIdb(
        ciphertext,
        written ? SUPPORT_SUPPORTED : policy.largeBlobSupport,
        true
      )
    } catch (err) {
      // A successful remote write remains recoverable under the old policy;
      // a current pre-existing fallback does too. Only fail when neither
      // destination committed the new bytes.
      if (written || previousFallback) {
        console.warn('storage-policy promotion deferred', err?.message ?? err)
        return
      }
      throw err
    }
    return
  }

  if (written) {
    try {
      await updateState({
        set: { [STORAGE_POLICY_KEY]: storagePolicy(MODE_LARGE_BLOB, SUPPORT_SUPPORTED) },
        remove: [SECRETS_BLOB_KEY]
      })
    } catch (err) {
      // The authenticator has the current ciphertext. If a fallback existed,
      // it was pre-staged with the same bytes, so leaving it is also safe.
      console.warn('largeBlob post-write state update failed', err?.message ?? err)
    }
    return
  }

  await updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } })
}

// Re-seal the current secrets snapshot into the destination selected by the
// adaptive storage policy.
export async function persistSecretsBlob (ciphertext = null) {
  await secrets.waitForVaultTransition()
  if (!secrets.isUnlocked()) throw new Error('VAULT_LOCKED')
  const sealed = ciphertext ?? secrets.sealCurrentEntries()
  if (!hasPasskey()) {
    if (!hasLocalVault()) throw new Error('PASSKEY_NOT_REGISTERED')
    await updateState({ set: { [SECRETS_BLOB_KEY]: sealed } })
    return
  }
  if (hasPendingUpgrade()) throw new Error('PASSKEY_UPGRADE_PENDING')
  const policy = readStoragePolicy()
  if (!policy) throw new Error('PASSKEY_STORAGE_POLICY_MISSING')
  if (policy.mode === MODE_LARGE_BLOB) return writeLargeBlob(sealed, policy)
  await updateState({ set: { [SECRETS_BLOB_KEY]: sealed } })
}

// Ciphertext-only snapshot used by the account mutation rollback boundary.
// Keeping this accessor here avoids duplicating the storage key elsewhere.
export function snapshotSecretsBlob () {
  return getState(SECRETS_BLOB_KEY, '') || null
}

// Direct local restoration for mutation rollback. This deliberately bypasses
// the adaptive writer: a failed mutation must not open another WebAuthn prompt.
export function restoreSecretsBlobSnapshot (ciphertext) {
  return ciphertext
    ? updateState({ set: { [SECRETS_BLOB_KEY]: ciphertext } })
    : removeState(SECRETS_BLOB_KEY)
}

// Self-decrypt the local ciphertext with a freshly-obtained PRF key. Kept
// inside this function's scope so prfBytes never escapes the call frame —
// `secrets.js` deliberately does not export a "give me plaintext if I hand
// you the prf" surface, which is the whole point of this approach.
function unsealEntries (prfBytes, ciphertext) {
  const ck = sharedXOnlySecret(prfBytes, getPublicKey(prfBytes))
  const plaintextBase64 = nip44v3.decryptWithConversationKey(ck, VAULT_NIP44_KIND, VAULT_SECRETS_SCOPE, ciphertext)
  return decodeSecretEntries(base64ToBytes(plaintextBase64))
}

// Return the entries used by deliberate export/copy disclosures. Passkey
// modes force fresh user verification and keep PRF bytes on this stack. The
// explicitly unprotected local mode has no authentication boundary to add,
// so it returns a clone of the already-unlocked in-memory entries.
//
// Throws if the user cancels the prompt or the authenticator declines.
export async function openSecrets () {
  if (!hasPasskey()) {
    if (!hasLocalVault()) throw new Error('PASSKEY_NOT_REGISTERED')
    return secrets.discloseCurrentEntries()
  }
  if (hasPendingUpgrade()) {
    await resumePendingUpgrade({ freshVerification: true })
    return secrets.discloseCurrentEntries()
  }
  // `mediation: required` forces a fresh prompt — never pulled from a
  // recent-auth cache. The same assertion can migrate or clean largeBlob.
  const { prfBytes, ciphertext } = await obtainVaultMaterial({ freshVerification: true })
  return unsealEntries(prfBytes, ciphertext)
}

// Page-load entry point. If the favicon currently served at /favicon.ico
// differs from the copy we stashed at the last registration/signal, stage
// the fresh data URL so the next successful unlock can push it via
// `signalCurrentUserDetails`. No-op if there's no passkey, no favicon, or
// the favicon hasn't changed.
export async function checkForIconUpdate () {
  if (!hasPasskey()) return
  const fresh = await fetchFaviconBase64()
  if (!fresh) return
  if (fresh === getState(ICON_KEY, '')) return
  pendingIconUpdate = fresh
}

// Called by lock-overlay right after the user successfully unlocks. Fires
// `signalCurrentUserDetails` with the staged icon so the authenticator can
// refresh its row for our credential. Best-effort: swallows any error —
// signal failures must not derail the unlock UX. If signal isn't supported
// by the platform we still commit the new icon locally so we don't keep
// retrying the same data URL on every page load.
export async function flushPendingIconUpdate () {
  if (!pendingIconUpdate) return
  const iconURL = pendingIconUpdate
  pendingIconUpdate = null

  const userId = readStoredUserId()
  const signalFn = window?.PublicKeyCredential?.signalCurrentUserDetails
  if (userId && typeof signalFn === 'function') {
    try {
      await signalFn({
        rpId: window.location.hostname,
        userId: userId.base64url,
        name: buildUserName(userId.bytes),
        displayName: RP_NAME,
        iconURL
      })
    } catch (err) {
      console.warn('signalCurrentUserDetails failed', err?.message ?? err)
    }
  }
  await updateState({ set: { [ICON_KEY]: iconURL } })
}
