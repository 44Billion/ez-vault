import { secp256k1 } from '@noble/curves/secp256k1.js'
import { extract, expand } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes } from '@noble/hashes/utils.js'
import { hexToBytes } from './index.js'

const textEncoder = new TextEncoder()

// HKDF extract salt, equivalent in role to NIP-44 v3's "nip44-v3\x00" salt.
// This names the generic multi-DH key schedule; it is not tied to ez-vault or
// to private-channel so other implementations can derive the same key.
const MULTI_DH_SALT = textEncoder.encode('nip44-multi-dh-v1\x00')

// Multi-DH transcript sizes:
// - identity mode uses no Multi-DH transcript; callers fall back to identity NIP-44 v3.
// - one content key uses 2 DH outputs: identity/identity plus identity/content.
// - two content keys use 3 DH outputs: cross-identity uses both identity/content sides
//   plus content/content; self-encryption uses identity/identity, identity/content,
//   and content/content.
// A/B step ids refer to lexicographically ordered identity pubkeys, not sender/receiver.
const STEP = Object.freeze({
  IDENTITY_IDENTITY: 0,
  IDENTITY_CONTENT: 1,
  CONTENT_CONTENT: 2,
  A_CONTENT_B_IDENTITY: 3,
  A_IDENTITY_B_CONTENT: 4,
  A_CONTENT_B_CONTENT: 5
})

function u32be (n) {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n >>> 0, false)
  return b
}

function normalizeKind (kind) {
  const n = typeof kind === 'string' && kind.trim() !== '' ? Number(kind) : kind
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error('INVALID_KIND')
  return n
}

function publicKeyBytes (pubkey) {
  // Nostr pubkeys are x-only. secp256k1 ECDH expects a compressed point, so
  // use the even-y prefix, matching nostr-tools' NIP-44 implementation.
  return hexToBytes(`02${pubkey}`)
}

function sharedX (secretKey, pubkey) {
  return secp256k1.getSharedSecret(secretKey, publicKeyBytes(pubkey)).subarray(1, 33)
}

function stepBytes (stepId, secretKey, pubkey) {
  // The step id tags the DH output before HKDF extract. In self-encryption,
  // DH(identitySecret, contentPubkey) and DH(contentSecret, identityPubkey)
  // are the same raw sharedX; the tag keeps that value's role unambiguous.
  return concatBytes(u32be(stepId), sharedX(secretKey, pubkey))
}

function modeFor ({ senderContentPubkey, receiverContentPubkey }) {
  if (senderContentPubkey && receiverContentPubkey) return 'both-content'
  if (senderContentPubkey) return 'sender-content'
  if (receiverContentPubkey) return 'receiver-content'
  return 'identity'
}

function orderedPair ({ identityPubkey, contentPubkey, peerIdentityPubkey, peerContentPubkey }) {
  const self = { identityPubkey, contentPubkey: contentPubkey || '', isSelf: true }
  const peer = { identityPubkey: peerIdentityPubkey, contentPubkey: peerContentPubkey || '', isSelf: false }
  return identityPubkey <= peerIdentityPubkey ? [self, peer] : [peer, self]
}

function hkdfInfo ({ kind, scope = '' }) {
  const scopeBytes = textEncoder.encode(scope || '')
  // Match NIP-44 v3's public context encoding so the Multi-DH conversation key
  // is separated by the same kind/scope the ciphertext envelope authenticates.
  // The salt names/versions the Multi-DH schedule; HKDF info stays context-only.
  return concatBytes(u32be(normalizeKind(kind)), u32be(scopeBytes.length), scopeBytes)
}

function stepFor ({ stepId, a, b, identitySecretKey, contentSecretKey }) {
  if (stepId === STEP.IDENTITY_IDENTITY) {
    return stepBytes(stepId, identitySecretKey, b.isSelf ? a.identityPubkey : b.identityPubkey)
  }
  if (stepId === STEP.A_CONTENT_B_IDENTITY) {
    return a.isSelf
      ? stepBytes(stepId, contentSecretKey, b.identityPubkey)
      : stepBytes(stepId, identitySecretKey, a.contentPubkey)
  }
  if (stepId === STEP.A_IDENTITY_B_CONTENT) {
    return a.isSelf
      ? stepBytes(stepId, identitySecretKey, b.contentPubkey)
      : stepBytes(stepId, contentSecretKey, a.identityPubkey)
  }
  if (stepId === STEP.A_CONTENT_B_CONTENT) {
    return a.isSelf
      ? stepBytes(stepId, contentSecretKey, b.contentPubkey)
      : stepBytes(stepId, contentSecretKey, a.contentPubkey)
  }
  throw new Error('UNKNOWN_MULTI_DH_STEP')
}

export function deriveMultiDhConversationKey ({
  role,
  identitySecretKey,
  identityPubkey,
  contentSecretKey,
  contentPubkey = '',
  peerIdentityPubkey,
  peerContentPubkey = '',
  kind,
  scope = ''
}) {
  if (role !== 'sender' && role !== 'receiver') throw new Error('INVALID_MULTI_DH_ROLE')
  if (!identitySecretKey || !identityPubkey || !peerIdentityPubkey) throw new Error('MULTI_DH_IDENTITY_REQUIRED')

  const isSender = role === 'sender'
  const senderContentPubkey = isSender ? contentPubkey : peerContentPubkey
  const receiverContentPubkey = isSender ? peerContentPubkey : contentPubkey
  const mode = modeFor({ senderContentPubkey, receiverContentPubkey })

  if (mode === 'identity') return { mode, conversationKey: null }
  if (isSender && senderContentPubkey && !contentSecretKey) throw new Error('SENDER_CONTENT_KEY_REQUIRED')
  if (!isSender && receiverContentPubkey && !contentSecretKey) throw new Error('RECEIVER_CONTENT_KEY_REQUIRED')

  const [a, b] = orderedPair({ identityPubkey, contentPubkey, peerIdentityPubkey, peerContentPubkey })
  const steps = []

  if (identityPubkey === peerIdentityPubkey) {
    const ownContentPubkey = contentPubkey || peerContentPubkey
    steps.push(stepBytes(STEP.IDENTITY_IDENTITY, identitySecretKey, identityPubkey))
    if (ownContentPubkey) {
      steps.push(contentSecretKey
        ? stepBytes(STEP.IDENTITY_CONTENT, contentSecretKey, identityPubkey)
        : stepBytes(STEP.IDENTITY_CONTENT, identitySecretKey, ownContentPubkey))
    }
    if (contentPubkey && peerContentPubkey) {
      steps.push(stepBytes(STEP.CONTENT_CONTENT, contentSecretKey, peerContentPubkey))
    }
  } else {
    const includeIdentityIdentity = mode !== 'both-content'
    if (includeIdentityIdentity) {
      steps.push(stepFor({ stepId: STEP.IDENTITY_IDENTITY, a, b, identitySecretKey, contentSecretKey }))
    }
    if (a.contentPubkey) {
      steps.push(stepFor({ stepId: STEP.A_CONTENT_B_IDENTITY, a, b, identitySecretKey, contentSecretKey }))
    }
    if (b.contentPubkey) {
      steps.push(stepFor({ stepId: STEP.A_IDENTITY_B_CONTENT, a, b, identitySecretKey, contentSecretKey }))
    }
    if (a.contentPubkey && b.contentPubkey) {
      steps.push(stepFor({ stepId: STEP.A_CONTENT_B_CONTENT, a, b, identitySecretKey, contentSecretKey }))
    }
  }

  const ikm = concatBytes(...steps)
  const prk = extract(sha256, ikm, MULTI_DH_SALT)
  return {
    mode,
    conversationKey: expand(sha256, prk, hkdfInfo({ kind, scope }), 32)
  }
}
