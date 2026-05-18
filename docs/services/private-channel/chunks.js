import { bytesToBase64, base64ToBytes } from '../../helpers/base64.js'
import { getTemporaryItem, removeTemporaryItems, setTemporaryItem } from '../temporary-storage.js'
import { JSONL_CHUNK_BYTES } from './chunk-size.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const STORAGE_PREFIX = 'ez-vault:private-channel:'

function appendBytes (left, right) {
  const out = new Uint8Array(left.length + right.length)
  out.set(left)
  out.set(right, left.length)
  return out
}

function tempKey (id, index) {
  return `${STORAGE_PREFIX}${id}:${index}`
}

function receiverRecord (receiver, receiverContentKeys) {
  if (typeof receiver === 'string') {
    const contentKey = receiverContentKeys[receiver] || {}
    return {
      receiverPubkey: receiver,
      iykcPubkey: contentKey.iykcPubkey || '',
      iykcProof: contentKey.iykcProof || ''
    }
  }

  if (Array.isArray(receiver)) {
    const [receiverPubkey, iykcPubkey = '', iykcProof = ''] = receiver
    const contentKey = receiverContentKeys[receiverPubkey] || {}
    return {
      receiverPubkey,
      iykcPubkey: iykcPubkey || contentKey.iykcPubkey || '',
      iykcProof: iykcProof || contentKey.iykcProof || ''
    }
  }

  const receiverPubkey = receiver?.receiverPubkey || receiver?.pubkey || ''
  const contentKey = receiverContentKeys[receiverPubkey] || {}
  return {
    receiverPubkey,
    iykcPubkey: receiver?.iykcPubkey || contentKey.iykcPubkey || '',
    iykcProof: receiver?.iykcProof || contentKey.iykcProof || ''
  }
}

function buildLine ({ receiverPubkey, iykcPubkey, iykcProof }, ciphertext) {
  const line = [receiverPubkey, ciphertext]
  if (iykcPubkey) {
    line.push(iykcPubkey)
    if (iykcProof) line.push(iykcProof)
  }
  return JSON.stringify(line) + '\n'
}

function joinByteChunks (parts) {
  let length = 0
  const decoded = parts.map(part => {
    const bytes = base64ToBytes(part)
    length += bytes.length
    return bytes
  })
  const out = new Uint8Array(length)
  let offset = 0
  for (const bytes of decoded) {
    out.set(bytes, offset)
    offset += bytes.length
  }
  return out
}

export function readChunkContent (id, index) {
  return getTemporaryItem(tempKey(id, index))
}

export function decodeChunkLines (content) {
  return decodeChunkText(content).split('\n').filter(Boolean)
}

export function decodeChunkText (content) {
  return decoder.decode(base64ToBytes(content))
}

export function joinChunksAsBase64 (parts) {
  return bytesToBase64(joinByteChunks(parts))
}

export function receiverPubkeys (receivers) {
  return receivers.map(receiver => receiverRecord(receiver, {}).receiverPubkey).filter(Boolean)
}

export function receiverPubkeysWithoutContentKeys (receivers) {
  return receivers
    .map(receiver => receiverRecord(receiver, {}))
    .filter(receiver => receiver.receiverPubkey && !receiver.iykcPubkey)
    .map(receiver => receiver.receiverPubkey)
}

export async function writeChunks ({ rowEncryptionSigner, receivers, receiverContentKeys = {}, event }) {
  const id = `${Date.now()}:${Math.random().toString(16).slice(2)}`
  let chunk = new Uint8Array()
  let chunkIndex = 0

  for (const receiver of receivers) {
    const row = receiverRecord(receiver, receiverContentKeys)
    const sharedKeyPubkey = row.iykcPubkey || row.receiverPubkey
    const tweakedSigner = rowEncryptionSigner.withSharedKey(sharedKeyPubkey)
    const tweakedPubkey = await tweakedSigner.getPublicKey()
    const ciphertext = await tweakedSigner.nip44Encrypt(tweakedPubkey, JSON.stringify(event))
    let line = encoder.encode(buildLine(row, ciphertext))

    while (line.length) {
      const available = JSONL_CHUNK_BYTES - chunk.length
      chunk = appendBytes(chunk, line.slice(0, available))
      line = line.slice(available)
      if (chunk.length === JSONL_CHUNK_BYTES) {
        setTemporaryItem(tempKey(id, chunkIndex++), bytesToBase64(chunk))
        chunk = new Uint8Array()
      }
    }
  }

  if (chunk.length || chunkIndex === 0) setTemporaryItem(tempKey(id, chunkIndex++), bytesToBase64(chunk))
  return { id, total: chunkIndex }
}

export function cleanupChunks (id, total) {
  const keys = []
  for (let i = 0; i < total; i++) keys.push(tempKey(id, i))
  removeTemporaryItems(keys)
}
