import { bytesToHex } from './nostr/index.js'
import { deriveSecretKey } from './crypto.js'

// Deterministic device signer seckey derivation. Inputs:
//   - prfBytes: the 32-byte passkey PRF output (same bytes secrets.js uses as
//     the vault privkey). Already high-entropy; deriveSecretKey() HKDFs and
//     reduces it into a valid secp256k1 scalar.
//
// Re-derivation always produces the same bytes, so a fresh derive call could
// in principle replace a stored copy — but we still persist the seckey in the
// TLV blob so any future change to this function's salt/info doesn't silently
// rotate the device's signer pubkey out from under peers that already trust
// the original. A passkey re-create takes the blob with it (the blob is
// NIP-44'd under the PRF-derived vault key), so recovery in that scenario
// means re-pairing devices; storage isn't what saves us there.

const SIGNER_KEY_SALT = 'nostr-device-signer-v1'
const SIGNER_KEY_INFO = ''

export async function deriveSignerSeckey (prfBytes) {
  return bytesToHex(await deriveSecretKey(prfBytes, SIGNER_KEY_INFO, SIGNER_KEY_SALT))
}
