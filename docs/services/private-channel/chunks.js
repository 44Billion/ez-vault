import { generateSecretKey, getPublicKey, nip44 } from 'nostr-tools'
import { bytesToBase64, base64ToBytes } from '../../helpers/base64.js'
import { bytesToHex } from '../../helpers/nostr/index.js'
import { verifyIykcProof } from '../content-key/event.js'
import { getTemporaryItem, removeTemporaryItems, setTemporaryItem } from '../temporary-storage.js'
import { JSONL_CHUNK_BYTES } from './chunk-size.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const STORAGE_PREFIX = 'ez-vault:private-channel:'
const nip44GetConversationKey = nip44.getConversationKey.bind(nip44)
const nip44Encrypt = nip44.encrypt.bind(nip44)

function appendBytes (left, right) {
  const out = new Uint8Array(left.length + right.length)
  out.set(left)
  out.set(right, left.length)
  return out
}

function tempKey (id, index) {
  return `${STORAGE_PREFIX}${id}:${index}`
}

function normalizeContentKey ({ receiverPubkey, iykcPubkey = '', iykcProof = '' } = {}) {
  if (!iykcPubkey) return { iykcPubkey: '', iykcProof: '' }
  if (!verifyIykcProof({ receiverPubkey, iykcPubkey, iykcProof })) throw new Error('INVALID_IYKC_PROOF')
  return { iykcPubkey, iykcProof }
}

function receiverRecord (receiver, receiverContentKeys) {
  if (typeof receiver === 'string') {
    const fetchedContentKey = normalizeContentKey({ receiverPubkey: receiver, ...receiverContentKeys[receiver] })
    return {
      receiverPubkey: receiver,
      ...fetchedContentKey
    }
  }

  if (Array.isArray(receiver)) {
    const [receiverPubkey, iykcPubkey = '', iykcProof = ''] = receiver
    const explicitContentKey = normalizeContentKey({ receiverPubkey, iykcPubkey, iykcProof })
    const fetchedContentKey = normalizeContentKey({ receiverPubkey, ...receiverContentKeys[receiverPubkey] })
    const contentKey = explicitContentKey.iykcPubkey ? explicitContentKey : fetchedContentKey
    return {
      receiverPubkey,
      ...contentKey
    }
  }

  const receiverPubkey = receiver?.receiverPubkey || receiver?.pubkey || ''
  const explicitContentKey = normalizeContentKey({ receiverPubkey, ...receiver })
  const fetchedContentKey = normalizeContentKey({ receiverPubkey, ...receiverContentKeys[receiverPubkey] })
  const resolvedContentKey = explicitContentKey.iykcPubkey ? explicitContentKey : fetchedContentKey
  return {
    receiverPubkey,
    ...resolvedContentKey
  }
}

function buildLine ({ receiverPubkey, iykcPubkey, iykcProof }, ciphertext) {
  const line = [receiverPubkey, ciphertext]
  if (iykcPubkey) line.push(iykcPubkey, iykcProof)
  return JSON.stringify(line) + '\n'
}

function buildPayloadLine (ciphertext) {
  return JSON.stringify([ciphertext]) + '\n'
}

function encryptedPayload ({ messageSecretKey, event }) {
  const messagePubkey = getPublicKey(messageSecretKey)
  return nip44Encrypt(JSON.stringify(event), nip44GetConversationKey(messageSecretKey, messagePubkey))
}

function appendLine (chunk, line, id, chunkIndex) {
  while (line.length) {
    const available = JSONL_CHUNK_BYTES - chunk.length
    chunk = appendBytes(chunk, line.slice(0, available))
    line = line.slice(available)
    if (chunk.length === JSONL_CHUNK_BYTES) {
      setTemporaryItem(tempKey(id, chunkIndex++), bytesToBase64(chunk))
      chunk = new Uint8Array()
    }
  }
  return { chunk, chunkIndex }
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

async function writeChunksOnce ({ senderSigner, imkcSigner, receivers, receiverContentKeys = {}, event, multiDhContext }) {
  const id = `${Date.now()}:${Math.random().toString(16).slice(2)}`
  let chunk = new Uint8Array()
  let chunkIndex = 0
  const useMultiDh = typeof senderSigner?.nip44EncryptMultiDH === 'function'
  let foundOwnContentPubkey = false
  let usedOwnContentPubkey = ''
  const messageSecretKey = generateSecretKey()
  const messageSeckey = bytesToHex(messageSecretKey)
  const payloadLine = encoder.encode(buildPayloadLine(encryptedPayload({ messageSecretKey, event })))
  ;({ chunk, chunkIndex } = appendLine(chunk, payloadLine, id, chunkIndex))

  for (const receiver of receivers) {
    const row = receiverRecord(receiver, useMultiDh ? receiverContentKeys : {})
    let ciphertext
    if (useMultiDh) {
      const encrypted = await senderSigner.nip44EncryptMultiDH({
        peerPubkey: row.receiverPubkey,
        peerContentPubkey: row.iykcPubkey,
        ownContentSigner: imkcSigner,
        context: multiDhContext,
        plaintext: messageSeckey
      })
      ciphertext = encrypted.ciphertext
      const nextContentPubkey = encrypted.ownContentPubkey || ''
      if (foundOwnContentPubkey && nextContentPubkey !== usedOwnContentPubkey) {
        cleanupChunks(id, chunkIndex)
        throw new Error('INCONSISTENT_IMKC_PUBKEY')
      }
      foundOwnContentPubkey = true
      if (nextContentPubkey) usedOwnContentPubkey = nextContentPubkey
    } else {
      ciphertext = await senderSigner.nip44Encrypt(row.receiverPubkey, messageSeckey)
    }
    const line = encoder.encode(buildLine(row, ciphertext))
    ;({ chunk, chunkIndex } = appendLine(chunk, line, id, chunkIndex))
  }

  if (chunk.length || chunkIndex === 0) setTemporaryItem(tempKey(id, chunkIndex++), bytesToBase64(chunk))
  return { id, total: chunkIndex, ownContentPubkey: usedOwnContentPubkey }
}

export async function writeChunks (options) {
  try {
    return await writeChunksOnce(options)
  } catch (err) {
    if (err?.message !== 'INCONSISTENT_IMKC_PUBKEY') throw err
  }
  return writeChunksOnce(options)
}

export function cleanupChunks (id, total) {
  const keys = []
  for (let i = 0; i < total; i++) keys.push(tempKey(id, i))
  removeTemporaryItems(keys)
}
