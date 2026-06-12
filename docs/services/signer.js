import * as store from './accounts-store.js'
import * as secrets from './secrets.js'
import * as nip44MultiDh from './nip44-multi-dh.js'
import { doubleSignEvent } from './content-key/index.js'

// NIP-07 / NIP-46 method whitelist. Anything outside this set is rejected
// before we hit the per-type signer, so typos and unknown methods fail fast
// with a uniform error instead of a TypeError from the concrete signer.
const SUPPORTED_METHODS = new Set([
  'getPublicKey',
  'signEvent',
  'getRelays',
  'nip04Encrypt',
  'nip04Decrypt',
  'nip44Encrypt',
  'nip44Decrypt',
  'nip44v3Encrypt',
  'nip44v3Decrypt',
  'nip44EncryptMultiDH',
  'nip44DecryptMultiDH',
  'doubleSignEvent'
])

const METHOD_ALIASES = {
  nip44v3_encrypt_multi_dh: 'nip44EncryptMultiDH',
  nip44v3_decrypt_multi_dh: 'nip44DecryptMultiDH',
  double_sign_event: 'doubleSignEvent'
}

// NIP-07 wire methods are snake_case (get_public_key, nip44_encrypt, ...)
// while our JS impls are camelCase. Normalize here so callers can forward
// the wire form untouched.
function normalizeMethod (method) {
  if (METHOD_ALIASES[method]) return METHOD_ALIASES[method]
  const normalized = method.includes('_')
    ? method.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
    : method
  return METHOD_ALIASES[normalized] || normalized
}

export function claimSigner (account) {
  if (!account) throw new Error('UNKNOWN_ACCOUNT')
  switch (account.type) {
    case 'nsec': {
      const signer = secrets.getNsecSigner(account.pubkey)
      if (!signer) throw new Error('VAULT_LOCKED')
      return signer
    }
    case 'bunker': {
      const handle = secrets.getBunkerHandle(account.pubkey)
      if (!handle) throw new Error('VAULT_LOCKED')
      return handle
    }
    case 'npub': throw new Error('READ_ONLY_ACCOUNT')
    default: throw new Error('UNKNOWN_ACCOUNT_TYPE')
  }
}

async function contentSignerForDoubleSign (account, userSigner, internals = {}) {
  if (account.type !== 'nsec') throw new Error('OWN_CONTENT_KEY_UNSUPPORTED')
  const warnings = []
  const signer = await nip44MultiDh.publishedOwnContentSigner({
    account,
    userSigner,
    warnings,
    internals
  })
  if (signer) return signer
  const code = warnings[warnings.length - 1]?.code || 'CONTENT_KEY_UNAVAILABLE'
  const err = new Error(code)
  err.warnings = warnings
  throw err
}

async function applyWithSharedKey ({ account, signer, withSharedKey }) {
  if (withSharedKey == null) return { account, signer }
  if (!Array.isArray(withSharedKey)) throw new Error('WITH_SHARED_KEY_PARAMS_REQUIRED')
  if (!withSharedKey.length) return { account, signer }
  if (!signer?.withSharedKey) throw new Error('WITH_SHARED_KEY_UNSUPPORTED')

  const scopedSigner = signer.withSharedKey(...withSharedKey)
  if (account.type !== 'nsec') return { account, signer: scopedSigner }
  return {
    account: { ...account, pubkey: await scopedSigner.getPublicKey() },
    signer: scopedSigner
  }
}

// Single entry point for the (future) messenger's NIP-07/46 dispatch. Looks
// up the account, picks the right signer, and invokes the method. Throws on
// unknown account, read-only account, or unsupported method; the messenger
// layer is responsible for translating thrown errors into the postMessage
// error shape.
export async function run ({ pubkey, method, params = [], internals = {}, withSharedKey = null }) {
  const storedAccount = store.get(pubkey)
  if (!storedAccount) throw new Error('UNKNOWN_ACCOUNT')
  const normalized = normalizeMethod(method)
  if (!SUPPORTED_METHODS.has(normalized)) throw new Error('UNSUPPORTED_METHOD')
  const scoped = await applyWithSharedKey({
    account: storedAccount,
    signer: claimSigner(storedAccount),
    withSharedKey
  })
  const { account, signer } = scoped
  if (normalized === 'nip44EncryptMultiDH') {
    return nip44MultiDh.nip44EncryptMultiDH({ account, signer, params, internals })
  }
  if (normalized === 'nip44DecryptMultiDH') {
    return nip44MultiDh.nip44DecryptMultiDH({ account, signer, params })
  }
  if (normalized === 'doubleSignEvent') {
    const [event] = params || []
    if (account.type === 'bunker') return signer.doubleSignEvent(event)
    return doubleSignEvent({
      userSigner: signer,
      contentKeySigner: await contentSignerForDoubleSign(account, signer, internals),
      event
    })
  }
  return signer[normalized](...params)
}
