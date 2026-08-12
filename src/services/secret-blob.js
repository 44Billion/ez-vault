import { getPublicKey } from 'libp2r2p/key'
import { hexToBytes, bytesToHex } from 'libp2r2p/base16'
import { encodeTlv, decodeTlv } from '../helpers/tlv.js'

// Wire format for the encrypted secret blob persisted through passkey.js's
// adaptive IDB/largeBlob policy. The bytes here are the *plaintext* — the
// surrounding NIP-44 self-encryption lives in secrets.js (seal-time) and
// passkey.js (open-time). Its active key is normally PRF-derived; the explicit
// unprotected mode instead stores that key beside the ciphertext in IDB.
//
// Forward compatibility: the decoder ignores any type tag it doesn't
// recognize, so future record kinds can be added without breaking older
// readers. The padding type 0x00 is reserved for "no records here".

const TLV_NSEC = 0x01
const TLV_BUNKER = 0x02
const TLV_DEVICE_SIGNER = 0x04
const TLV_PADDING = 0x00

// `entries` shape:
//   { type: 'nsec',          pubkey: hex32, seckey:    hex32 }
//   { type: 'bunker',        pubkey: hex32, handlerPubkey: hex32, clientKey: hex32 }
//   { type: 'device-signer', seckey: hex32 }
//
// nsec records carry only the seckey (32 bytes); the pubkey is derivable.
// New bunker records carry account pubkey || handler pubkey || clientKey
// (96 bytes). The account pubkey is deliberately repeated as the stable local
// index: unlock can associate the encrypted capability with its public account
// record without contacting the remote signer. Legacy 64-byte records carry
// account pubkey || clientKey; their handler still lives in account.bunker and
// is migrated on the next normal secret write.
// device-signer records carry just the 32-byte seckey: a single key per
// device, used to sign the trusted-signer exchange in the pairing flow
// (and, in future, signer-to-signer messaging).
//
// When the entry list is empty we still emit one zero-length padding
// record. NIP-44 rejects empty plaintext, and we *want* to overwrite the
// authoritative ciphertext in that case (otherwise a previously-deleted secret
// would resurrect on the next unlock).
export function encodeSecretEntries (entries) {
  const records = []
  for (const e of entries) {
    if (e.type === 'nsec') {
      records.push([TLV_NSEC, hexToBytes(e.seckey)])
    } else if (e.type === 'bunker') {
      const value = new Uint8Array(96)
      value.set(hexToBytes(e.pubkey), 0)
      value.set(hexToBytes(e.handlerPubkey), 32)
      value.set(hexToBytes(e.clientKey), 64)
      records.push([TLV_BUNKER, value])
    } else if (e.type === 'device-signer') {
      records.push([TLV_DEVICE_SIGNER, hexToBytes(e.seckey)])
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
    if (v.length === 64) {
      entries.push({
        type: 'bunker',
        pubkey: bytesToHex(v.slice(0, 32)),
        clientKey: bytesToHex(v.slice(32, 64)),
        legacy: true
      })
    } else if (v.length === 96) {
      entries.push({
        type: 'bunker',
        pubkey: bytesToHex(v.slice(0, 32)),
        handlerPubkey: bytesToHex(v.slice(32, 64)),
        clientKey: bytesToHex(v.slice(64, 96))
      })
    }
  }
  for (const v of tlv[TLV_DEVICE_SIGNER] || []) {
    if (v.length !== 32) continue
    entries.push({
      type: 'device-signer',
      seckey: bytesToHex(v)
    })
  }
  return entries
}
