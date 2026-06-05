import { nip44 } from 'nostr-tools'

// Validates if a 32-byte array is a valid secp256k1 scalar,
// i.e. if it can generate a valid public key and a valid Schnorr signature
// else it would be useful just for nip44 encryption (like conversation keys are)
// but not for signing
function isValidScalar (maybeScalar) {
  const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
  const val = BigInt('0x' + Array.from(maybeScalar).map(b => b.toString(16).padStart(2, '0')).join(''))
  return val > 0n && val < n
}

// Generic deterministic key derivation.
// Ensures the result is a valid secp256k1 scalar.
export async function deriveSecretKey (masterKeyBytes, info = new Uint8Array(), salt = new Uint8Array()) {
  const encoder = new TextEncoder()
  if (typeof salt === 'string') salt = encoder.encode(salt)
  if (typeof info === 'string') info = encoder.encode(info)

  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw', masterKeyBytes, { name: 'HKDF' }, false, ['deriveBits']
  )
  let derivedScalar
  let counter = 0

  do {
    const suffix = encoder.encode(`-${counter}`)
    // Concatenate HKDF info + suffix
    const hkdfInfo = new Uint8Array(info.length + suffix.length)
    hkdfInfo.set(info)
    hkdfInfo.set(suffix, info.length)
    const buffer = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: hkdfInfo
      },
      baseKey, 256
    )

    derivedScalar = new Uint8Array(buffer)
    counter++
  } while (!isValidScalar(derivedScalar))

  return derivedScalar
}

// Derives a shared scalar using HKDF
export async function deriveSharedKey (mySeckey, theirPubkey, info = '' /* 'deniable-chat-v1' */) {
  const conversationKey = nip44.getConversationKey(mySeckey, theirPubkey)

  return await deriveSecretKey(
    conversationKey,
    info, // nip44 v2 uses random 32 bytes nonce; e.g. 'encryption', 'signing'
    // No additional salt because of the 'nip44-v2' one already used for the conversation key derivation
    new Uint8Array()
  )
}
