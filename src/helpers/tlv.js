// Minimal type-length-value codec.
//
// Wire format: a sequence of records, each `[type:1][length:1][value:length]`.
// Types are domain-defined byte tags; the same type may appear more than once
// (e.g. multiple bunker records). Length is one byte, so each value caps at
// 255 bytes — comfortably wider than a 32-byte seckey or a 64-byte
// pubkey+clientKey pair.

export function encodeTlv (records) {
  let total = 0
  for (const [, value] of records) {
    if (value.length > 255) throw new Error('TLV_VALUE_TOO_LONG')
    total += 2 + value.length
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const [type, value] of records) {
    out[offset++] = type
    out[offset++] = value.length
    out.set(value, offset)
    offset += value.length
  }
  return out
}

// Returns { [type]: [Uint8Array, ...] }, preserving insertion order within
// each type bucket.
export function decodeTlv (bytes) {
  const out = {}
  let i = 0
  while (i < bytes.length) {
    if (i + 2 > bytes.length) throw new Error('TLV_TRUNCATED_HEADER')
    const type = bytes[i]
    const length = bytes[i + 1]
    const valueStart = i + 2
    const valueEnd = valueStart + length
    if (valueEnd > bytes.length) throw new Error('TLV_TRUNCATED_VALUE')
    ;(out[type] ??= []).push(bytes.slice(valueStart, valueEnd))
    i = valueEnd
  }
  return out
}
