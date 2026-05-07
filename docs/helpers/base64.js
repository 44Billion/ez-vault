// Plain (non-URL-safe) base64 codec for binary <-> string conversion. Used
// where we need to wrap arbitrary bytes inside a UTF-8-safe string (e.g. the
// plaintext input to NIP-44, which is defined as a string).
//
// For the URL-safe variant used by WebAuthn credential IDs, see the local
// helpers in `services/passkey.js`.

export function bytesToBase64 (bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function base64ToBytes (b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
