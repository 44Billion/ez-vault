import { generateSecretKey } from 'nostr-tools'
import { isOnline } from '../helpers/network.js'
import { bytesToHex } from '../helpers/nostr/index.js'
import { getIykcProofs, upsertContentKeyEvent } from './content-key/index.js'
import * as secrets from './secrets.js'
import * as store from './accounts-store.js'
import { claimSigner } from './signer.js'

const SUPPORTED_METHODS = new Set(['encrypt', 'decrypt'])

function firstParamObject (params) {
  if (params && !Array.isArray(params) && typeof params === 'object') return params
  const [options] = params || []
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('OPTIONS_REQUIRED')
  return options
}

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

async function ownContentSignerForEncrypt ({ account, userSigner, useOwnContentKey, warnings, internals }) {
  if (!useOwnContentKey) return null
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

async function encrypt ({ account, signer, options, internals }) {
  const {
    peerPubkey,
    plaintext,
    peerContentPubkey: forcedPeerContentPubkey,
    useOwnContentKey = true,
    usePeerContentKey = true
  } = options
  if (!peerPubkey) throw new Error('PEER_PUBKEY_REQUIRED')
  if (typeof plaintext !== 'string') throw new Error('PLAINTEXT_REQUIRED')

  const warnings = []
  if (!signer.nip44EncryptMulti || account.type !== 'nsec') {
    warning(warnings, 'MULTI_DH_UNSUPPORTED')
    return {
      ciphertext: await signer.nip44Encrypt(peerPubkey, plaintext),
      senderPubkey: account.pubkey,
      receiverPubkey: peerPubkey,
      senderContentPubkey: '',
      receiverContentPubkey: '',
      mode: 'identity',
      warnings
    }
  }

  const ownContentSigner = await ownContentSignerForEncrypt({ account, userSigner: signer, useOwnContentKey, warnings, internals })
  const peerContentPubkey = forcedPeerContentPubkey || (usePeerContentKey
    ? (await lookupContentPubkey(peerPubkey, warnings, internals)).pubkey
    : '')

  const result = await signer.nip44EncryptMulti({
    peerPubkey,
    peerContentPubkey,
    ownContentSigner,
    plaintext
  })
  return {
    ciphertext: result.ciphertext,
    senderPubkey: account.pubkey,
    receiverPubkey: peerPubkey,
    senderContentPubkey: result.ownContentPubkey,
    receiverContentPubkey: result.peerContentPubkey,
    mode: result.mode,
    warnings
  }
}

async function decrypt ({ account, signer, options }) {
  const {
    peerPubkey,
    ciphertext,
    ownContentPubkey = '',
    peerContentPubkey = ''
  } = options
  if (!peerPubkey) throw new Error('PEER_PUBKEY_REQUIRED')
  if (typeof ciphertext !== 'string') throw new Error('CIPHERTEXT_REQUIRED')

  const ownContentSigner = ownContentPubkey
    ? secrets.getContentKeySigner(account.pubkey, ownContentPubkey)
    : null
  if (ownContentPubkey && !ownContentSigner) throw new Error('CONTENT_KEY_NOT_FOUND')

  if (!signer.nip44DecryptMulti || account.type !== 'nsec') {
    return {
      plaintext: await signer.nip44Decrypt(peerPubkey, ciphertext),
      senderPubkey: peerPubkey,
      receiverPubkey: account.pubkey,
      senderContentPubkey: '',
      receiverContentPubkey: '',
      mode: 'identity'
    }
  }

  const result = await signer.nip44DecryptMulti({
    peerPubkey,
    peerContentPubkey,
    ownContentSigner,
    ciphertext
  })
  return {
    plaintext: result.plaintext,
    senderPubkey: peerPubkey,
    receiverPubkey: account.pubkey,
    senderContentPubkey: result.peerContentPubkey,
    receiverContentPubkey: result.ownContentPubkey,
    mode: result.mode
  }
}

export async function run ({ pubkey, method, params = [], options, internals = {} }) {
  const account = store.get(pubkey)
  if (!account) throw new Error('UNKNOWN_ACCOUNT')
  if (!SUPPORTED_METHODS.has(method)) throw new Error('UNSUPPORTED_METHOD')
  const signer = claimSigner(account)
  const request = options || firstParamObject(params)

  if (method === 'encrypt') return encrypt({ account, signer, options: request, internals })
  if (method === 'decrypt') return decrypt({ account, signer, options: request })
}
