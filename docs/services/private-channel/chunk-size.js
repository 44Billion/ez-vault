import { MAX_EVENT_BYTES, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'
import { eventByteLength } from './event.js'

const NIP44_MAX_PLAINTEXT_BYTES = 65535
const NIP44_RAW_PAYLOAD_OVERHEAD_BYTES = 67
const MAX_TIME_SECONDS = 9999999999
const MAX_CHUNK_TAG_VALUE = '9999999999'
const SAMPLE_PUBKEY = 'f'.repeat(64)
const SAMPLE_SIGNATURE = 'f'.repeat(128)

function base64EncodedByteLength (byteLength) {
  return Math.ceil(byteLength / 3) * 4
}

function nip44PaddedByteLength (byteLength) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > NIP44_MAX_PLAINTEXT_BYTES) return Infinity
  if (byteLength <= 32) return 32

  const nextPower = 2 ** (Math.floor(Math.log2(byteLength - 1)) + 1)
  const chunk = nextPower <= 256 ? 32 : nextPower / 8
  return chunk * (Math.floor((byteLength - 1) / chunk) + 1)
}

function nip44PayloadByteLength (plaintextByteLength) {
  return base64EncodedByteLength(NIP44_RAW_PAYLOAD_OVERHEAD_BYTES + nip44PaddedByteLength(plaintextByteLength))
}

function routerPlaintextByteLengthForChunk (jsonlByteLength) {
  return eventByteLength({
    kind: ROUTER_KIND,
    pubkey: SAMPLE_PUBKEY,
    created_at: MAX_TIME_SECONDS,
    tags: [['f', SAMPLE_PUBKEY], ['imkc', SAMPLE_PUBKEY, `${MAX_TIME_SECONDS}:${SAMPLE_SIGNATURE}`], ['c', MAX_CHUNK_TAG_VALUE, MAX_CHUNK_TAG_VALUE], ['r', SAMPLE_PUBKEY]],
    content: 'A'.repeat(base64EncodedByteLength(jsonlByteLength)),
    id: SAMPLE_PUBKEY,
    sig: SAMPLE_SIGNATURE
  })
}

function outerEventByteLengthForChunk (jsonlByteLength) {
  const contentByteLength = nip44PayloadByteLength(routerPlaintextByteLengthForChunk(jsonlByteLength))
  if (!Number.isFinite(contentByteLength)) return Infinity

  return eventByteLength({
    kind: PRIVATE_BROADCAST_KIND,
    created_at: MAX_TIME_SECONDS,
    tags: [['expiration', String(MAX_TIME_SECONDS)]],
    content: 'A'.repeat(contentByteLength),
    pubkey: SAMPLE_PUBKEY,
    id: SAMPLE_PUBKEY,
    sig: SAMPLE_SIGNATURE
  })
}

function maxJsonlChunkByteSize () {
  let min = 1
  let max = NIP44_MAX_PLAINTEXT_BYTES

  while (min < max) {
    const mid = Math.ceil((min + max) / 2)
    if (outerEventByteLengthForChunk(mid) <= MAX_EVENT_BYTES) min = mid
    else max = mid - 1
  }

  return min
}

// NIP-44 padding has large size jumps, so derive this from the actual signed
// event shapes instead of estimating a flat overhead.
export const JSONL_CHUNK_BYTES = maxJsonlChunkByteSize()
// Nym carrier content is a base64 slice of the inner event JSON. The router
// budget is more conservative because routers carry extra tags, so it is safe
// to reuse it as the maximum carrier content length.
export const NYM_CARRIER_CHUNK_CHARS = JSONL_CHUNK_BYTES
