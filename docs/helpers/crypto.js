import { sharedXOnlySecret } from './ecdh.js'

const textEncoder = new TextEncoder()
const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
const SHARED_KEY_SALT = textEncoder.encode('sharedkey-v1')

function bytesToBigInt (bytes) {
  return BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''))
}

function bigIntTo32Bytes (n) {
  const hex = n.toString(16).padStart(64, '0')
  const out = new Uint8Array(32)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

// Generic deterministic key derivation.
// Ensures the result is a valid secp256k1 scalar.
export async function deriveSecretKey (masterKeyBytes, info = new Uint8Array(), salt = new Uint8Array()) {
  if (typeof salt === 'string') salt = textEncoder.encode(salt)
  if (typeof info === 'string') info = textEncoder.encode(info)

  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw', masterKeyBytes, { name: 'HKDF' }, false, ['deriveBits']
  )
  const buffer = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info
    },
    baseKey, 48 * 8
  )

  // Wide reduction follows hash-to-field practice for 256-bit groups:
  // L = 48 means 48 HKDF output bytes: 32 bytes for a 256-bit scalar plus
  // 16 bytes / 128 bits of bias margin before reducing into [1, n).
  const wide = bytesToBigInt(new Uint8Array(buffer))
  return bigIntTo32Bytes((wide % (SECP256K1_N - 1n)) + 1n)
}

// Derives a shared scalar using HKDF
export async function deriveSharedKey (mySeckey, theirPubkey, info = '' /* 'deniable-chat-v1' */) {
  const sharedSecret = sharedXOnlySecret(mySeckey, theirPubkey)

  return await deriveSecretKey(
    sharedSecret,
    // Caller/protocol context. The fixed salt below names this shared-key
    // scalar derivation, while info separates uses within that derivation.
    info,
    SHARED_KEY_SALT
  )
}
