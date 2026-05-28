import { secp256k1 } from '@noble/curves/secp256k1.js'
import { extract, expand } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { concatBytes } from '@noble/hashes/utils.js'
import { hexToBytes } from './index.js'

const textEncoder = new TextEncoder()

// HKDF extract salt, equivalent in role to NIP-44's "nip44-v2" salt. This
// names the generic multi-DH key schedule; it is not tied to ez-vault or to
// private-channel so other implementations can derive the same key.
const MULTI_DH_SALT = textEncoder.encode('nip44-multi-dh-v1')

function publicKeyBytes (pubkey) {
  // Nostr pubkeys are x-only. secp256k1 ECDH expects a compressed point, so
  // use the even-y prefix, matching nostr-tools' NIP-44 implementation.
  return hexToBytes(`02${pubkey}`)
}

function sharedX (secretKey, pubkey) {
  return secp256k1.getSharedSecret(secretKey, publicKeyBytes(pubkey)).subarray(1, 33)
}

function stepBytes (stepName, secretKey, pubkey) {
  // A step name is local transcript metadata, not HKDF info. It says which
  // pair of keys produced this DH output. In self-encryption,
  // DH(identitySecret, contentPubkey) and DH(contentSecret, identityPubkey)
  // are the same raw sharedX, so naming the step keeps that value's role
  // unambiguous. The "both keys are needed" property comes from including
  // identity/identity and content/content self-encryption steps below.
  const name = textEncoder.encode(stepName)
  if (name.length > 255) throw new Error('MULTI_DH_STEP_NAME_TOO_LONG')
  return concatBytes(Uint8Array.of(name.length), name, sharedX(secretKey, pubkey))
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

function stableContextValue (value) {
  if (value == null || value === '') return null
  if (Array.isArray(value)) return value.map(stableContextValue)
  if (typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      const child = stableContextValue(value[key])
      if (child != null) out[key] = child
    }
    return out
  }
  return value
}

function participantInfo ({ identityPubkey, contentPubkey }) {
  return { identityPubkey, contentPubkey }
}

function hkdfInfo ({ pair, context }) {
  // HKDF expand info, not salt. It binds the pair of public keys without
  // saying who sent the message. Context is optional public domain separation;
  // for example, private-channel passes the channel pubkey so a leaked final
  // key is only useful inside that channel.
  return textEncoder.encode(JSON.stringify({
    version: 'nip44-multi-dh-v1',
    participants: pair.map(participantInfo),
    context: stableContextValue(context)
  }))
}

function stepFor ({ stepName, a, b, identitySecretKey, contentSecretKey }) {
  if (stepName === 'identity/identity') {
    return stepBytes(stepName, identitySecretKey, b.isSelf ? a.identityPubkey : b.identityPubkey)
  }
  if (stepName === 'a-content/b-identity') {
    return a.isSelf
      ? stepBytes(stepName, contentSecretKey, b.identityPubkey)
      : stepBytes(stepName, identitySecretKey, a.contentPubkey)
  }
  if (stepName === 'a-identity/b-content') {
    return a.isSelf
      ? stepBytes(stepName, identitySecretKey, b.contentPubkey)
      : stepBytes(stepName, contentSecretKey, a.identityPubkey)
  }
  if (stepName === 'a-content/b-content') {
    return a.isSelf
      ? stepBytes(stepName, contentSecretKey, b.contentPubkey)
      : stepBytes(stepName, contentSecretKey, a.contentPubkey)
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
  context
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
    steps.push(stepBytes('identity/identity', identitySecretKey, identityPubkey))
    if (ownContentPubkey) {
      steps.push(contentSecretKey
        ? stepBytes('identity/content', contentSecretKey, identityPubkey)
        : stepBytes('identity/content', identitySecretKey, ownContentPubkey))
    }
    if (contentPubkey && peerContentPubkey) {
      steps.push(stepBytes('content/content', contentSecretKey, peerContentPubkey))
    }
  } else {
    const includeIdentityIdentity = mode !== 'both-content'
    if (includeIdentityIdentity) {
      steps.push(stepFor({ stepName: 'identity/identity', a, b, identitySecretKey, contentSecretKey }))
    }
    if (a.contentPubkey) {
      steps.push(stepFor({ stepName: 'a-content/b-identity', a, b, identitySecretKey, contentSecretKey }))
    }
    if (b.contentPubkey) {
      steps.push(stepFor({ stepName: 'a-identity/b-content', a, b, identitySecretKey, contentSecretKey }))
    }
    if (a.contentPubkey && b.contentPubkey) {
      steps.push(stepFor({ stepName: 'a-content/b-content', a, b, identitySecretKey, contentSecretKey }))
    }
  }

  const ikm = concatBytes(...steps)
  const prk = extract(sha256, ikm, MULTI_DH_SALT)
  return {
    mode,
    conversationKey: expand(sha256, prk, hkdfInfo({ pair: [a, b], context }), 32)
  }
}
