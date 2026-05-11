import { hexToBytes, bytesToHex } from '../services/nostr.js'

// Deterministic per-account signer seckey derivation. Inputs:
//   - prfBytes: the 32-byte passkey PRF output (same bytes secrets.js uses as
//     the vault privkey). Already high-entropy; HKDF "extracts" with the
//     fixed salt below and "expands" against the account pubkey so each
//     account gets an independent 32-byte signer key.
//   - accountPubkeyHex: hex of the user's nostr pubkey for the account.
//
// Uses Web Crypto's native HKDF-SHA256 — same primitive nostr-tools/nip44
// uses internally (@noble/hashes/hkdf). No new npm deps.
//
// The output is treated as a secp256k1 scalar; the probability of falling
// outside [1, n) is negligible, and nostr-tools' getPublicKey would surface
// the error if it ever did. Re-derivation with the same inputs always
// produces the same bytes, so a fresh derive call could in principle
// replace a stored copy — but we still persist the seckey in the TLV blob
// so that (a) it gets the same encrypted-at-rest property as nsec/bunker
// secrets, and (b) any future change to this function's salt/info doesn't
// silently rotate every existing account's signer pubkey out from under
// peers that already trust the original. A passkey re-create takes the
// blob with it (the blob is NIP-44'd under the PRF-derived vault key), so
// recovery in that scenario means re-importing accounts; storage isn't
// what saves us there.

const SALT = new TextEncoder().encode('ez-vault/signer/v1')

export async function deriveSignerSeckey (prfBytes, accountPubkeyHex) {
  const ikm = await crypto.subtle.importKey('raw', prfBytes, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: hexToBytes(accountPubkeyHex) },
    ikm,
    256
  )
  return bytesToHex(new Uint8Array(bits))
}
