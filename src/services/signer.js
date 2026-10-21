import { PERSONAL_COPY } from 'libp2r2p/kind'
import * as store from './accounts-store.js'
import * as secrets from './secrets.js'
import * as nip44DoubleDh from './nip44-double-dh.js'
import { doubleSignEvent } from './content-key/index.js'
import { arrayBufferBytes } from '../helpers/array-buffer.js'

// Local launcher method whitelist. Anything outside this set is rejected
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
  'obfuscate',
  'nip44EncryptDoubleDH',
  'nip44DecryptDoubleDH',
  'doubleSignEvent'
])

const METHOD_ALIASES = {
  nip44v3_encrypt_double_dh: 'nip44EncryptDoubleDH',
  nip44v3_decrypt_double_dh: 'nip44DecryptDoubleDH',
  double_sign_event: 'doubleSignEvent'
}
const MAX_OBFUSCATE_BATCH_OPERATIONS = 64
const MAX_OBFUSCATE_BATCH_BYTES = 256 * 1024
const obfuscateBatchEncoder = new TextEncoder()

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

async function contentSignerForDoubleSign (account, userSigner, internals = {}, { personalCopy = false } = {}) {
  if (account.type !== 'nsec') throw new Error('OWN_CONTENT_KEY_UNSUPPORTED')
  const warnings = []
  const resolve = personalCopy ? nip44DoubleDh.localOwnContentSigner : nip44DoubleDh.publishedOwnContentSigner
  const signer = await resolve({
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

// Single entry point for the local messenger's binary NIP-07 dispatch. Looks
// up the account, picks the right signer, and invokes the method. Throws on
// unknown account, read-only account, or unsupported method; the messenger
// layer is responsible for translating thrown errors into the postMessage
// error shape.
export async function run ({ pubkey, method, params = [], internals = {}, withSharedKey = null }) {
  const storedAccount = store.get(pubkey)
  if (!storedAccount) throw new Error('UNKNOWN_ACCOUNT')
  const normalized = normalizeMethod(method)
  if (!SUPPORTED_METHODS.has(normalized)) throw new Error('UNSUPPORTED_METHOD')
  const ownerSigner = claimSigner(storedAccount)
  if (normalized === 'nip44v3Encrypt' || normalized === 'nip44EncryptDoubleDH') {
    params = [...params]
    // Own the bytes before asynchronous key selection, discovery or signing.
    params[3] = arrayBufferBytes(params[3]).slice()
  }
  const scoped = await applyWithSharedKey({
    account: storedAccount,
    signer: ownerSigner,
    withSharedKey
  })
  const { account, signer } = scoped
  if (normalized === 'nip44EncryptDoubleDH') {
    return nip44DoubleDh.nip44EncryptDoubleDH({ account, signer, params, internals: { ...internals, accountPubkey: storedAccount.pubkey } })
  }
  if (normalized === 'nip44DecryptDoubleDH') {
    return (await nip44DoubleDh.nip44DecryptDoubleDH({ account, signer, params })).slice().buffer
  }
  if (normalized === 'nip44v3Encrypt' || normalized === 'nip44v3Decrypt') {
    const cryptoParams = storedAccount.type === 'nsec' ? params.slice(0, 4) : params
    if (storedAccount.type === 'nsec' && internals.diagnostics) { cryptoParams.length = 4; cryptoParams.push(internals.diagnostics) }
    if (normalized === 'nip44v3Encrypt') return signer.nip44v3EncryptBytes(...cryptoParams)
    // Only the plaintext range, never its padded backing buffer, crosses RPC.
    return (await signer.nip44v3DecryptBytes(...cryptoParams)).slice().buffer
  }
  if (normalized === 'doubleSignEvent') {
    const [event] = params || []
    if (account.type === 'bunker') return signer.doubleSignEvent(event)
    return doubleSignEvent({
      userSigner: signer,
      contentKeySigner: await contentSignerForDoubleSign(account, signer, internals, { personalCopy: event?.kind === PERSONAL_COPY }),
      event
    })
  }
  return signer[normalized](...params)
}

// Launcher-only batch primitive for preparing private personal copies. This is
// intentionally outside SUPPORTED_METHODS so apps cannot request it as NIP-07.
export async function runObfuscateMany ({ pubkey, operations }) {
  const storedAccount = store.get(pubkey)
  if (!storedAccount) throw new Error('UNKNOWN_ACCOUNT')
  if (!Array.isArray(operations) || !operations.length || operations.length > MAX_OBFUSCATE_BATCH_OPERATIONS) {
    throw new Error('INVALID_PERSONAL_COPY_OBFUSCATION_BATCH')
  }
  const signer = claimSigner(storedAccount)
  const unique = new Map()
  const keys = []
  let bytes = 0
  for (const operation of operations) {
    if (!Array.isArray(operation) || operation.length !== 3 || typeof operation[0] !== 'string' || typeof operation[2] !== 'string') {
      throw new Error('INVALID_PERSONAL_COPY_OBFUSCATION_BATCH')
    }
    const kind = typeof operation[1] === 'number' || (typeof operation[1] === 'string' && /^\d+$/.test(operation[1]))
      ? Number(operation[1])
      : NaN
    if (!Number.isSafeInteger(kind) || kind < 0 || kind > 0xffffffff) throw new Error('INVALID_PERSONAL_COPY_OBFUSCATION_BATCH')
    bytes += obfuscateBatchEncoder.encode(operation[0]).byteLength + obfuscateBatchEncoder.encode(operation[2]).byteLength
    if (bytes > MAX_OBFUSCATE_BATCH_BYTES) throw new Error('PERSONAL_COPY_OBFUSCATION_BATCH_TOO_LARGE')
    const value = operation[0]
    const scope = operation[2]
    const key = JSON.stringify([kind, scope, value])
    keys.push(key)
    if (!unique.has(key)) unique.set(key, [value, kind, scope])
  }
  const results = new Map()
  for (const [key, params] of unique) results.set(key, await signer.obfuscate(...params))
  return keys.map(key => results.get(key))
}
