import { bytesToHex } from '../helpers/nostr/index.js'

// Deterministic device signer seckey derivation. Inputs:
//   - prfBytes: the 32-byte passkey PRF output (same bytes secrets.js uses as
//     the vault privkey). Already high-entropy; HKDF "extracts" with the
//     fixed salt below and "expands" against a fixed info string so every
//     device gets a single stable signer key.
//
// Uses Web Crypto's native HKDF-SHA256 — same primitive nostr-tools/nip44
// uses internally (@noble/hashes/hkdf). No new npm deps.
//
// The output is treated as a secp256k1 scalar; the probability of falling
// outside [1, n) is negligible, and nostr-tools' getPublicKey would surface
// the error if it ever did. Re-derivation always produces the same bytes,
// so a fresh derive call could in principle replace a stored copy — but we
// still persist the seckey in the TLV blob so any future change to this
// function's salt/info doesn't silently rotate the device's signer pubkey
// out from under peers that already trust the original. A passkey re-create
// takes the blob with it (the blob is NIP-44'd under the PRF-derived vault
// key), so recovery in that scenario means re-pairing devices; storage
// isn't what saves us there.

const SALT = new TextEncoder().encode('ez-vault:signer:v1')
const INFO = new TextEncoder().encode('ez-vault:device-signer:v1')

export async function deriveSignerSeckey (prfBytes) {
  const ikm = await crypto.subtle.importKey('raw', prfBytes, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: INFO },
    ikm,
    256
  )
  return bytesToHex(new Uint8Array(bits))
}
