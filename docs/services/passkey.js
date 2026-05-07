import { nip44, getPublicKey } from 'nostr-tools'
import { hexToBytes, bytesToHex } from './nostr.js'
import { decodeSecretEntries } from './secret-blob.js'
import { base64ToBytes } from '../helpers/base64.js'
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
// credentialId persisted in localStorage.
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
const PRF_BACKUP_KEY = 'ez-vault:passkey:prf'
const BLOB_FALLBACK_KEY = 'ez-vault:passkey:blob'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const PRF_SALT_BYTES = textEncoder.encode(PRF_SALT)
// The user.id is meant to disambiguate multiple users of the RP on one
// authenticator. We have one logical "vault user", so a stable label is fine.
const USER_ID = textEncoder.encode('ez-vault')

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
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: window.location.hostname, name: RP_NAME },
      user: { id: USER_ID, name: RP_NAME, displayName: RP_NAME },
      pubKeyCredParams: [
        { alg: -8, type: 'public-key' },
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' }
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        // Non-discoverable: keeps the credential local-only and dodges the
        // sync paths used by major platform authenticators for discoverable
        // (resident) credentials.
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
  const prfBytes = extractPrfBytes(ext)
  if (!prfBytes?.length) throw new Error('PASSKEY_PRF_REQUIRED')

  const credentialId = base64UrlEncode(new Uint8Array(credential.rawId))
  localStorage.setItem(CRED_ID_KEY, credentialId)
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
