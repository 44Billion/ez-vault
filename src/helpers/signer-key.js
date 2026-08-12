import { bytesToHex } from 'libp2r2p/base16'
import { deriveSecretKey } from './crypto.js'

// Deterministic device signer seckey derivation. Inputs:
//   - vaultKeyBytes: the active 32-byte vault key. It normally comes from the
//     passkey PRF; the explicitly unprotected mode initially supplies the
//     random key stored beside the ciphertext in IDB. It is high-entropy;
//     deriveSecretKey() HKDFs and reduces it into a valid secp256k1 scalar.
//
// Re-derivation always produces the same bytes, so a fresh derive call could
// in principle replace a stored copy — but we still persist the seckey in the
// TLV blob so any future change to this function's salt/info doesn't silently
// rotate the device's signer pubkey out from under peers that already trust
// the original. Promotion from local mode reciphers that stored signer
// unchanged, rather than deriving a new identity from the PRF. A later passkey
// re-create still requires pairing because it cannot recover the old blob.

const SIGNER_KEY_SALT = 'nostr-device-signer-v1'
const SIGNER_KEY_INFO = ''

export async function deriveSignerSeckey (vaultKeyBytes) {
  return bytesToHex(await deriveSecretKey(vaultKeyBytes, SIGNER_KEY_INFO, SIGNER_KEY_SALT))
}
