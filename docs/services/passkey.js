import { nip44, getPublicKey } from 'nostr-tools'
import { hexToBytes, bytesToHex } from '../helpers/nostr/index.js'
import { decodeSecretEntries } from './secret-blob.js'
import { base64ToBytes } from '../helpers/base64.js'
import { detectPlatform } from '../helpers/platform.js'
import { fetchFaviconBase64 } from '../helpers/favicon.js'
import * as secrets from './secrets.js'

// EZ Vault's passkey integration. One passkey custodies the encryption key
// (deterministic, derived from the WebAuthn PRF extension) for every
// account secret. This module is intentionally byte-thin: it talks to the
// authenticator and to localStorage, and hands the resulting ciphertext to
// `secrets` for sealing/unsealing. The TLV layout, the vault key, and the
// raw secret material all live inside `secrets.js` and never travel
// through this file.
//
// Syncing is intentionally discouraged — `residentKey: 'discouraged'` keeps
// the credential non-discoverable and we always address it by the
// credentialId persisted in localStorage. Some authenticators still promote
// the credential to discoverable and sync it across devices; to make sure a
// fresh registration on a second device can't *overwrite* the first one (the
// spec mandates overwrite when `(rpId, user.id)` collide for a discoverable
// credential), we randomize `user.id` per registration and persist it so we
// can later target the credential via `signalCurrentUserDetails`.
//
// LargeBlob and PRF are best-effort across authenticators:
// - largeBlob may refuse to write (legacy double-prompt cancellation, or
//   unsupported authenticator). We fall back to a localStorage copy of the
//   same ciphertext — same security model, just a different at-rest home.
// - PRF may only be exposed on credential creation, not on subsequent get().
//   We persist the creation-time PRF in localStorage and clear it the moment
//   a get() starts returning PRF (newer browsers will).

const PRF_SALT = 'ez-vault'
const RP_NAME = 'EZ Vault'
const CREATE_HINTS = ['client-device']
const GET_TRANSPORTS = ['internal']

const CRED_ID_KEY = 'ez-vault:passkey:credential-id'
const USER_ID_KEY = 'ez-vault:passkey:user-id'
const ICON_KEY = 'ez-vault:passkey:icon'
const PRF_BACKUP_KEY = 'ez-vault:passkey:prf'
const BLOB_FALLBACK_KEY = 'ez-vault:passkey:blob'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const PRF_SALT_BYTES = textEncoder.encode(PRF_SALT)

// Staged on page-load when a favicon change is detected against the stored
// copy. Flushed by `flushPendingIconUpdate()` right after a successful unlock
// — that timing piggybacks on the user-verification prompt the unlock just
// triggered, in case any platform decides `signalCurrentUserDetails` is not
// fully silent.
let pendingIconUpdate = null

function bufferToUint8 (value) {
  if (!value) return null
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

function base64UrlEncode (bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode (str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
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

function descriptorFromCredentialId (credentialId) {
  if (!credentialId) return null
  return {
    id: base64UrlDecode(credentialId),
    type: 'public-key',
    transports: GET_TRANSPORTS
  }
}

function generateUserId () {
  // Spec recommends <= 64 random bytes, opaque, non-correlatable across RPs.
  return crypto.getRandomValues(new Uint8Array(64))
}

function readStoredUserId () {
  const stored = localStorage.getItem(USER_ID_KEY)
  if (!stored) return null
  try {
    return { bytes: base64UrlDecode(stored), base64url: stored }
  } catch {
    return null
  }
}

// Some authenticators only surface `user.name` (not `displayName`), so we
// pack a platform hint plus a short slice of the random user.id into it.
// The suffix makes multiple synced entries distinguishable in the
// authenticator UI ("macOS / Safari (a3f9c1)" vs "iOS / Safari (b7c204)").
function buildUserName (userId) {
  const platform = detectPlatform()
  const known = !/unknown OS|unknown browser/.test(platform)
  const base = known ? platform : RP_NAME
  const suffix = base64UrlEncode(userId).slice(0, 6)
  return `${base} (${suffix})`
}

// Some platforms (notably older Android/Chrome and certain WebView contexts)
// only surface PRF on the assertion ceremony, not on creation. After a fresh
// `create()` that came back without PRF, this re-prompts via `get()` against
// the credential we just minted. `userVerification: 'discouraged'` lets
// platforms that cache UV across a recent create() skip the second prompt.
async function fetchPrfViaGet (rawId) {
  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [{
          id: new Uint8Array(rawId),
          type: 'public-key',
          transports: GET_TRANSPORTS
        }],
        userVerification: 'discouraged'
      },
      extensions: {
        prf: { eval: { first: PRF_SALT_BYTES } }
      }
    })
    return extractPrfBytes(extractExtensions(credential))
  } catch (err) {
    console.warn('PRF follow-up get() failed', err?.message ?? err)
    return null
  }
}

// Tell the platform to discard the credential we just created — used when a
// fresh registration cannot yield PRF and the credential is therefore
// useless to us. Best-effort: silently no-ops if the API isn't supported,
// and swallows errors so the caller's meaningful throw is never masked.
async function discardCredential (rawId) {
  const signalFn = window?.PublicKeyCredential?.signalUnknownCredential
  if (typeof signalFn !== 'function') return
  try {
    await signalFn({
      rpId: window.location.hostname,
      credentialId: base64UrlEncode(new Uint8Array(rawId))
    })
  } catch (err) {
    console.warn('signalUnknownCredential failed', err?.message ?? err)
  }
}

export function hasPasskey () {
  return !!localStorage.getItem(CRED_ID_KEY)
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
export async function ensureRegistered () {
  if (hasPasskey() && secrets.isUnlocked()) return
  if (hasPasskey()) {
    await unlock()
    return
  }
  await register()
}

// Create the passkey, derive the vault key from PRF, and mark the vault as
// unlocked with no secrets yet. Caller is expected to populate `secrets`
// with the new account's material and then call `writeSecretsBlob()`.
export async function register () {
  const userId = generateUserId()
  const iconURL = await fetchFaviconBase64()
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
        authenticatorAttachment: 'platform',
        // Non-discoverable: keeps the credential local-only and dodges the
        // sync paths used by major platform authenticators for discoverable
        // (resident) credentials. The random `user.id` above is the belt to
        // this suspenders — if the authenticator promotes the credential to
        // discoverable and syncs it anyway, a future registration on another
        // device won't collide on `(rpId, user.id)` and overwrite it.
        residentKey: 'discouraged',
        userVerification: 'discouraged'
      },
      hints: CREATE_HINTS,
      extensions: {
        prf: { eval: { first: PRF_SALT_BYTES } },
        largeBlob: { support: 'preferred' }
      }
    }
  })
  if (!credential) throw new Error('PASSKEY_CREATE_FAILED')
  if (credential.authenticatorAttachment !== 'platform') throw new Error('PASSKEY_NOT_PLATFORM')

  const ext = extractExtensions(credential)
  let prfBytes = extractPrfBytes(ext)
  // Some platforms (e.g. older Android/Chrome) only expose PRF on get(),
  // not on create(). Try one assertion against the just-minted credential
  // before giving up on this passkey.
  if (!prfBytes?.length) prfBytes = await fetchPrfViaGet(credential.rawId)
  if (!prfBytes?.length) {
    // Credential is useless to us without PRF — best-effort tell the
    // authenticator to forget it so the user isn't left with a dangling
    // entry, then bail.
    await discardCredential(credential.rawId)
    throw new Error('PASSKEY_PRF_REQUIRED')
  }

  const credentialId = base64UrlEncode(new Uint8Array(credential.rawId))
  localStorage.setItem(CRED_ID_KEY, credentialId)
  localStorage.setItem(USER_ID_KEY, base64UrlEncode(userId))
  if (iconURL) localStorage.setItem(ICON_KEY, iconURL)
  // Persist PRF eagerly. If a later get() returns PRF, we'll clear it then.
  // Authenticators that only expose PRF on create rely on this backup.
  localStorage.setItem(PRF_BACKUP_KEY, bytesToHex(prfBytes))

  secrets.unlock(prfBytes, null)
}

// Read the passkey, fetch the largeBlob ciphertext (or its localStorage
// fallback), and hand them to `secrets.unlock` for decryption + adoption.
export async function unlock () {
  const credentialId = localStorage.getItem(CRED_ID_KEY)
  if (!credentialId) throw new Error('PASSKEY_NOT_REGISTERED')
  const descriptor = descriptorFromCredentialId(credentialId)

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [descriptor],
      userVerification: 'required',
      hints: CREATE_HINTS
    },
    extensions: {
      prf: { eval: { first: PRF_SALT_BYTES } },
      largeBlob: { read: true }
    }
  })
  if (!credential) throw new Error('PASSKEY_GET_FAILED')

  const ext = extractExtensions(credential)
  const prfFromAssertion = extractPrfBytes(ext)
  let prfBytes = prfFromAssertion
  if (prfBytes?.length) {
    // Platform exposed PRF on get — the create-time backup is no longer
    // needed.
    localStorage.removeItem(PRF_BACKUP_KEY)
  } else {
    const stored = localStorage.getItem(PRF_BACKUP_KEY)
    if (stored) prfBytes = hexToBytes(stored)
  }
  if (!prfBytes?.length) throw new Error('PASSKEY_PRF_MISSING')

  let ciphertext = null
  const blobBytes = extractLargeBlobBytes(ext)
  if (blobBytes) {
    ciphertext = textDecoder.decode(blobBytes)
    // largeBlob just yielded a payload — drop any stale localStorage copy.
    localStorage.removeItem(BLOB_FALLBACK_KEY)
  } else {
    ciphertext = localStorage.getItem(BLOB_FALLBACK_KEY) || null
  }

  secrets.unlock(prfBytes, ciphertext)
}

// Re-seal the current secrets snapshot and push it into the passkey
// largeBlob. The plaintext never enters this module — `secrets` returns
// already-encrypted bytes via `sealCurrentEntries()`. Falls back to
// localStorage if the authenticator declines the write (or the user
// cancels the second prompt).
export async function writeSecretsBlob () {
  if (!secrets.isUnlocked()) throw new Error('VAULT_LOCKED')
  const credentialId = localStorage.getItem(CRED_ID_KEY)
  if (!credentialId) throw new Error('PASSKEY_NOT_REGISTERED')

  const ciphertext = secrets.sealCurrentEntries()

  const descriptor = descriptorFromCredentialId(credentialId)
  let credential
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        allowCredentials: [descriptor],
        // We just unlocked (or just created) — minimize re-prompting friction
        // for the largeBlob write.
        userVerification: 'discouraged'
      },
      extensions: {
        largeBlob: { write: textEncoder.encode(ciphertext) },
        // Opportunistically re-eval PRF: when an authenticator starts
        // exposing PRF on get() this is where we'll first see it and prune
        // the localStorage backup.
        prf: { eval: { first: PRF_SALT_BYTES } }
      }
    })
  } catch (err) {
    // NotAllowedError can mean the user cancelled the secondary prompt.
    // Treat as "largeBlob write didn't happen" and fall back below.
    if (err.name !== 'NotAllowedError') throw err
  }

  const ext = extractExtensions(credential)
  const prfBytes = extractPrfBytes(ext)
  if (prfBytes?.length) localStorage.removeItem(PRF_BACKUP_KEY)

  if (ext.largeBlob?.written) {
    // largeBlob is now authoritative — drop any stale localStorage copy.
    localStorage.removeItem(BLOB_FALLBACK_KEY)
  } else {
    localStorage.setItem(BLOB_FALLBACK_KEY, ciphertext)
  }
}

// Self-decrypt the largeBlob payload with a freshly-obtained PRF key. Kept
// inside this function's scope so prfBytes never escapes the call frame —
// `secrets.js` deliberately does not export a "give me plaintext if I hand
// you the prf" surface, which is the whole point of this approach.
function unsealEntries (prfBytes, ciphertext) {
  const ck = nip44.getConversationKey(prfBytes, getPublicKey(prfBytes))
  const plaintextBase64 = nip44.decrypt(ciphertext, ck)
  return decodeSecretEntries(base64ToBytes(plaintextBase64))
}

// Force a fresh user-verification prompt and return the decrypted secret
// entries. The PRF bytes and the resulting plaintext live only on this
// function's stack frame — there is no exported function on `secrets.js`
// that can hand the same plaintext back without going through a fresh
// passkey prompt. Used by the export and copy-nsec flows for the deliberate
// disclosures they perform.
//
// Throws if the user cancels the prompt or the authenticator declines.
export async function openSecrets () {
  const credentialId = localStorage.getItem(CRED_ID_KEY)
  if (!credentialId) throw new Error('PASSKEY_NOT_REGISTERED')
  const descriptor = descriptorFromCredentialId(credentialId)

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [descriptor],
      userVerification: 'required'
    },
    // Force a fresh prompt — never pulled from a recent-auth cache.
    mediation: 'required',
    extensions: {
      prf: { eval: { first: PRF_SALT_BYTES } },
      largeBlob: { read: true }
    }
  })
  if (!credential) throw new Error('PASSKEY_GET_FAILED')

  const ext = extractExtensions(credential)
  let prfBytes = extractPrfBytes(ext)
  if (prfBytes?.length) {
    // get() now returns PRF — the create-time localStorage backup is no
    // longer needed.
    localStorage.removeItem(PRF_BACKUP_KEY)
  } else {
    const stored = localStorage.getItem(PRF_BACKUP_KEY)
    if (stored) prfBytes = hexToBytes(stored)
  }
  if (!prfBytes?.length) throw new Error('PASSKEY_PRF_MISSING')

  let ciphertext = null
  const blobBytes = extractLargeBlobBytes(ext)
  if (blobBytes) {
    ciphertext = textDecoder.decode(blobBytes)
    localStorage.removeItem(BLOB_FALLBACK_KEY)
  } else {
    ciphertext = localStorage.getItem(BLOB_FALLBACK_KEY) || null
  }

  if (!ciphertext) return []
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
  if (fresh === localStorage.getItem(ICON_KEY)) return
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
  localStorage.setItem(ICON_KEY, iconURL)
}
