import { isOnline } from 'libp2r2p/network'
import { getIykcProofs, upsertContentKeyEvent, scheduleContentKeyPublication, recordContentKeyTiming } from './content-key/index.js'
import * as secrets from './secrets.js'
import { normalizeKind } from 'libp2r2p/nip44-v3'

function warning (warnings, code, message = '') {
  warnings.push(message ? { code, message } : { code })
}

function publishSucceeded (result) {
  return result?.success !== false
}

async function lookupContentPubkey (pubkey, warnings, { _getIykcProofs = getIykcProofs, _isOnline = isOnline } = {}) {
  try {
    const found = await _getIykcProofs([pubkey])
    const proof = found?.[pubkey]
    const timestamp = Number(proof?.iykcProof?.split(':')[0])
    return { pubkey: proof?.iykcPubkey || '', createdAt: Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : 0, failed: false }
  } catch (err) {
    const online = await _isOnline().catch(() => false)
    warning(warnings, online ? 'CONTENT_KEY_LOOKUP_FAILED' : 'OFFLINE_CONTENT_KEY_LOOKUP_SKIPPED', err?.message || '')
    return { pubkey: '', failed: true }
  }
}

async function publishLocalContentKey ({ userSigner, contentKeySigner, createdAt, warnings, _upsertContentKeyEvent = upsertContentKeyEvent }) {
  try {
    const { result } = await _upsertContentKeyEvent({ userSigner, contentKeySigner, createdAt })
    if (publishSucceeded(result)) return true
    warning(warnings, 'CONTENT_KEY_PUBLISH_FAILED')
  } catch (err) {
    warning(warnings, 'CONTENT_KEY_PUBLISH_FAILED', err?.message || '')
  }
  return false
}

async function createPersistedContentSigner ({ ownerPubkey, warnings }) {
  try {
    return await secrets.createContentKeySecret(ownerPubkey)
  } catch (err) {
    warning(warnings, 'CONTENT_KEY_PERSIST_FAILED', err?.message || '')
    return null
  }
}

// Personal copies never need a publicly advertised key. Persist the ordinary
// encrypted content-key sidecar so local signing works before any relay access.
export async function localOwnContentSigner ({ account, warnings = [] }) {
  if (account.type !== 'nsec') {
    warning(warnings, 'OWN_CONTENT_KEY_UNSUPPORTED')
    return null
  }
  return secrets.getLatestContentKeySigner(account.pubkey) ||
    await createPersistedContentSigner({ ownerPubkey: account.pubkey, warnings })
}

export async function publishedOwnContentSigner ({ account, userSigner, contentKeySigner, warnings = [], internals = {} }) {
  if (account.type !== 'nsec') {
    warning(warnings, 'OWN_CONTENT_KEY_UNSUPPORTED')
    return null
  }

  const ownerPubkey = account.pubkey
  const localSigner = contentKeySigner === undefined
    ? await localOwnContentSigner({ account, warnings })
    : contentKeySigner
  if (!localSigner) return null
  const lookupStartedAt = performance.now()
  const advertised = await lookupContentPubkey(ownerPubkey, warnings, internals)
  recordContentKeyTiming('own-content-key-lookup', localSigner.getPublicKey(), lookupStartedAt, internals.diagnostics)
  if (advertised.failed) return null
  if (advertised.pubkey === await localSigner.getPublicKey()) return localSigner

  const createdAt = Math.max(Math.floor(Date.now() / 1000), advertised.createdAt + 1)
  return await publishLocalContentKey({ userSigner, contentKeySigner: localSigner, createdAt, warnings, ...internals })
    ? localSigner
    : null
}

function encryptParams (params) {
  const [peerPubkey, kind, scope = '', plaintextBytes, peerContentPubkey = ''] = params || []
  return { peerPubkey, kind, scope, plaintextBytes, peerContentPubkey }
}

function decryptParams (params) {
  const [peerPubkey, kind, scope = '', ciphertext, peerContentPubkey = '', ownContentPubkey = ''] = params || []
  return { peerPubkey, kind, scope, ciphertext, peerContentPubkey, ownContentPubkey }
}

async function encrypt ({ account, signer, params, internals }) {
  const { peerPubkey, kind, scope, plaintextBytes, peerContentPubkey } = encryptParams(params)
  if (!peerPubkey) throw new Error('PEER_PUBKEY_REQUIRED')
  if (!(plaintextBytes instanceof Uint8Array)) throw new Error('PLAINTEXT_REQUIRED')
  const normalizedKind = normalizeKind(kind)

  const warnings = []
  const contentKeySigner = await localOwnContentSigner({ account, warnings })
  if (contentKeySigner) {
    scheduleContentKeyPublication({
      ownerPubkey: account.pubkey, accountPubkey: internals.accountPubkey, contentKeySigner,
      run: async signal => {
        const startedAt = performance.now()
        const published = await publishedOwnContentSigner({
          account, userSigner: signer, contentKeySigner, warnings: [],
          internals: {
            ...internals, _upsertContentKeyEvent: options => {
              signal.throwIfAborted()
              return (internals._upsertContentKeyEvent || upsertContentKeyEvent)({ ...options, signal })
            }
          }
        })
        signal.throwIfAborted()
        if (!published) throw new Error('CONTENT_KEY_PUBLISH_FAILED')
        recordContentKeyTiming('own-content-key-announcement', contentKeySigner.getPublicKey(), startedAt, internals.diagnostics)
        return { pubkey: account.pubkey }
      }
    }).catch(() => {})
  }

  const [ciphertext, senderContentPubkey = ''] = await signer.nip44EncryptDoubleDHBytes(
    peerPubkey,
    normalizedKind,
    scope,
    plaintextBytes,
    peerContentPubkey,
    contentKeySigner
  )
  return [ciphertext, senderContentPubkey]
}

async function decrypt ({ account, signer, params }) {
  const { peerPubkey, kind, scope, ciphertext, peerContentPubkey, ownContentPubkey } = decryptParams(params)
  if (!peerPubkey) throw new Error('PEER_PUBKEY_REQUIRED')
  if (typeof ciphertext !== 'string') throw new Error('CIPHERTEXT_REQUIRED')
  const normalizedKind = normalizeKind(kind)

  const hasOwnContentKey = !ownContentPubkey || Boolean(secrets.getContentKeySigner(account.pubkey, ownContentPubkey))
  const context = { stage: 'double-dh', ownContentPubkey, peerContentPubkey, receiverPubkey: account.pubkey, senderPubkey: peerPubkey, hasOwnContentKey }
  if (!hasOwnContentKey) throw Object.assign(new Error('CONTENT_KEY_NOT_FOUND'), { code: 'CONTENT_KEY_NOT_FOUND', ...context })
  try {
    return await signer.nip44DecryptDoubleDHBytes(
      peerPubkey,
      normalizedKind,
      scope,
      ciphertext,
      peerContentPubkey,
      ownContentPubkey
    )
  } catch (cause) {
    throw Object.assign(new Error(cause.message, { cause }), { name: cause.name, ...(cause.code ? { code: cause.code } : {}), ...context })
  }
}

export async function nip44EncryptDoubleDH ({ account, signer, params = [], internals = {} }) {
  if (account.type !== 'nsec') return signer.nip44EncryptDoubleDHBytes(...params)
  return encrypt({ account, signer, params, internals })
}

export async function nip44DecryptDoubleDH ({ account, signer, params = [] }) {
  if (account.type !== 'nsec') return signer.nip44DecryptDoubleDHBytes(...params)
  return decrypt({ account, signer, params })
}
