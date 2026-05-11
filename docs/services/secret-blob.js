import { getPublicKey } from 'nostr-tools'
import { hexToBytes, bytesToHex } from './nostr.js'
import { encodeTlv, decodeTlv } from '../helpers/tlv.js'

// Wire format for the encrypted secret blob written into the passkey's
// largeBlob extension. The bytes here are the *plaintext* — the surrounding
// NIP-44 self-encryption (with the PRF-derived vault key) lives in
// secrets.js (seal-time) and passkey.js (open-time).
//
// Forward compatibility: the decoder ignores any type tag it doesn't
// recognize, so future record kinds can be added without breaking older
// readers. The padding type 0x00 is reserved for "no records here".

const TLV_NSEC = 0x01
const TLV_BUNKER = 0x02
const TLV_SIGNER = 0x03
const TLV_PADDING = 0x00

// `entries` shape:
//   { type: 'nsec',   pubkey: hex32, seckey:    hex32 }
//   { type: 'bunker', pubkey: hex32, clientKey: hex32 }
//   { type: 'signer', pubkey: hex32, seckey:    hex32 }
//
// nsec records carry only the seckey (32 bytes); the pubkey is derivable.
// bunker records carry pubkey || clientKey (64 bytes) since the pubkey is
// what the bunker decides — we can't recompute it locally.
// signer records carry accountPubkey || signerSeckey (64 bytes): the
// accountPubkey is the *user's* nostr pubkey this signer key belongs to
// (one signer key per non-npub account, per device).
//
// When the entry list is empty we still emit one zero-length padding
// record. NIP-44 rejects empty plaintext, and we *want* to overwrite the
// largeBlob in that case (otherwise a previously-deleted secret would
// resurrect on the next unlock).
export function encodeSecretEntries (entries) {
  const records = []
  for (const e of entries) {
    if (e.type === 'nsec') {
      records.push([TLV_NSEC, hexToBytes(e.seckey)])
    } else if (e.type === 'bunker') {
      const value = new Uint8Array(64)
      value.set(hexToBytes(e.pubkey), 0)
      value.set(hexToBytes(e.clientKey), 32)
      records.push([TLV_BUNKER, value])
    } else if (e.type === 'signer') {
      const value = new Uint8Array(64)
      value.set(hexToBytes(e.pubkey), 0)
      value.set(hexToBytes(e.seckey), 32)
      records.push([TLV_SIGNER, value])
    }
  }
  if (!records.length) records.push([TLV_PADDING, new Uint8Array(0)])
  return encodeTlv(records)
}

export function decodeSecretEntries (bytes) {
  const tlv = decodeTlv(bytes)
  const entries = []
  for (const v of tlv[TLV_NSEC] || []) {
    if (v.length !== 32) continue
    entries.push({
      type: 'nsec',
      pubkey: getPublicKey(v),
      seckey: bytesToHex(v)
    })
  }
  for (const v of tlv[TLV_BUNKER] || []) {
    if (v.length !== 64) continue
    entries.push({
      type: 'bunker',
      pubkey: bytesToHex(v.slice(0, 32)),
      clientKey: bytesToHex(v.slice(32, 64))
    })
  }
  for (const v of tlv[TLV_SIGNER] || []) {
    if (v.length !== 64) continue
    entries.push({
      type: 'signer',
      pubkey: bytesToHex(v.slice(0, 32)),
      seckey: bytesToHex(v.slice(32, 64))
    })
  }
  return entries
}
