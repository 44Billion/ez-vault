import * as store from './accounts-store.js'
import * as secrets from './secrets.js'
import * as nip44MultiDh from './nip44-multi-dh.js'

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
  'nip44EncryptMultiDH',
  'nip44DecryptMultiDH'
  // 'withSharedKey'
])

const METHOD_ALIASES = {
  nip44EncryptMultiDh: 'nip44EncryptMultiDH',
  nip44DecryptMultiDh: 'nip44DecryptMultiDH'
}

// NIP-07 wire methods are snake_case (get_public_key, nip44_encrypt, ...)
// while our JS impls are camelCase. Normalize here so callers can forward
// the wire form untouched.
function normalizeMethod (method) {
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

// Single entry point for the (future) messenger's NIP-07/46 dispatch. Looks
// up the account, picks the right signer, and invokes the method. Throws on
// unknown account, read-only account, or unsupported method; the messenger
// layer is responsible for translating thrown errors into the postMessage
// error shape.
export async function run ({ pubkey, method, params = [], internals = {} }) {
  const account = store.get(pubkey)
  if (!account) throw new Error('UNKNOWN_ACCOUNT')
  const normalized = normalizeMethod(method)
  if (!SUPPORTED_METHODS.has(normalized)) throw new Error('UNSUPPORTED_METHOD')
  const signer = claimSigner(account)
  if (normalized === 'nip44EncryptMultiDH') {
    return nip44MultiDh.nip44EncryptMultiDH({ account, signer, params, internals })
  }
  if (normalized === 'nip44DecryptMultiDH') {
    return nip44MultiDh.nip44DecryptMultiDH({ account, signer, params })
  }
  return signer[normalized](...params)
}
