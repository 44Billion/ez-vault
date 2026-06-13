import { generateSecretKey } from 'nostr-tools'
import { isOnline } from '../helpers/network.js'
import { bytesToHex } from '../helpers/nostr/index.js'
import { getIykcProofs, upsertContentKeyEvent } from './content-key/index.js'
import * as secrets from './secrets.js'
import { normalizeKind } from './nip44-v3.js'

function warning (warnings, code, message = '') {
  warnings.push(message ? { code, message } : { code })
}

function publishSucceeded (result) {
  return result?.success !== false
}

async function lookupContentPubkey (pubkey, warnings, { _getIykcProofs = getIykcProofs, _isOnline = isOnline } = {}) {
  try {
    const found = await _getIykcProofs([pubkey])
    return { pubkey: found?.[pubkey]?.iykcPubkey || '', failed: false }
  } catch (err) {
    const online = await _isOnline().catch(() => false)
    warning(warnings, online ? 'CONTENT_KEY_LOOKUP_FAILED' : 'OFFLINE_CONTENT_KEY_LOOKUP_SKIPPED', err?.message || '')
    return { pubkey: '', failed: true }
  }
}

async function publishLocalContentKey ({ userSigner, contentKeySigner, warnings, _upsertContentKeyEvent = upsertContentKeyEvent }) {
  try {
    const { result } = await _upsertContentKeyEvent({ userSigner, contentKeySigner })
    if (publishSucceeded(result)) return true
    warning(warnings, 'CONTENT_KEY_PUBLISH_FAILED')
  } catch (err) {
    warning(warnings, 'CONTENT_KEY_PUBLISH_FAILED', err?.message || '')
  }
  return false
}

async function createPersistedContentSigner ({ ownerPubkey, warnings }) {
  try {
    return secrets.setContentKeySecret(ownerPubkey, bytesToHex(generateSecretKey()))
  } catch (err) {
    warning(warnings, 'CONTENT_KEY_PERSIST_FAILED', err?.message || '')
    return null
  }
}

export async function publishedOwnContentSigner ({ account, userSigner, warnings = [], internals = {} }) {
  if (account.type !== 'nsec') {
    warning(warnings, 'OWN_CONTENT_KEY_UNSUPPORTED')
    return null
  }

  const ownerPubkey = account.pubkey
  const advertised = await lookupContentPubkey(ownerPubkey, warnings, internals)
  if (advertised.failed) return null
  const advertisedPubkey = advertised.pubkey
  if (advertisedPubkey) {
    const advertisedSigner = secrets.getContentKeySigner(ownerPubkey, advertisedPubkey)
    if (advertisedSigner) return advertisedSigner
  }

  const localSigner = secrets.getLatestContentKeySigner(ownerPubkey) ||
    await createPersistedContentSigner({ ownerPubkey, warnings, ...internals })
  if (!localSigner) return null
  return await publishLocalContentKey({ userSigner, contentKeySigner: localSigner, warnings, ...internals })
    ? localSigner
    : null
}

function encryptParams (params) {
  const [peerPubkey, kind, scope = '', plaintextB64, peerContentPubkey = ''] = params || []
  return { peerPubkey, kind, scope, plaintextB64, peerContentPubkey }
}

function decryptParams (params) {
  const [peerPubkey, kind, scope = '', ciphertext, peerContentPubkey = '', ownContentPubkey = ''] = params || []
  return { peerPubkey, kind, scope, ciphertext, peerContentPubkey, ownContentPubkey }
}

async function encrypt ({ account, signer, params, internals }) {
  const { peerPubkey, kind, scope, plaintextB64, peerContentPubkey } = encryptParams(params)
  if (!peerPubkey) throw new Error('PEER_PUBKEY_REQUIRED')
  if (typeof plaintextB64 !== 'string') throw new Error('PLAINTEXT_REQUIRED')
  const normalizedKind = normalizeKind(kind)

  const warnings = []
  await publishedOwnContentSigner({ account, userSigner: signer, warnings, internals })

  const [ciphertext, senderContentPubkey = ''] = await signer.nip44EncryptDoubleDH(
    peerPubkey,
    normalizedKind,
    scope,
    plaintextB64,
    peerContentPubkey
  )
  return [ciphertext, senderContentPubkey]
}

async function decrypt ({ account, signer, params }) {
  const { peerPubkey, kind, scope, ciphertext, peerContentPubkey, ownContentPubkey } = decryptParams(params)
  if (!peerPubkey) throw new Error('PEER_PUBKEY_REQUIRED')
  if (typeof ciphertext !== 'string') throw new Error('CIPHERTEXT_REQUIRED')
  const normalizedKind = normalizeKind(kind)

  if (ownContentPubkey && !secrets.getContentKeySigner(account.pubkey, ownContentPubkey)) throw new Error('CONTENT_KEY_NOT_FOUND')
  return signer.nip44DecryptDoubleDH(
    peerPubkey,
    normalizedKind,
    scope,
    ciphertext,
    peerContentPubkey,
    ownContentPubkey
  )
}

export async function nip44EncryptDoubleDH ({ account, signer, params = [], internals = {} }) {
  if (account.type !== 'nsec') return signer.nip44EncryptDoubleDH(...params)
  return encrypt({ account, signer, params, internals })
}

export async function nip44DecryptDoubleDH ({ account, signer, params = [] }) {
  if (account.type !== 'nsec') return signer.nip44DecryptDoubleDH(...params)
  return decrypt({ account, signer, params })
}
