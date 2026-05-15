import { ROUTER_KIND } from './constants.js'

const encoder = new TextEncoder()

export function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

export function eventByteLength (event) {
  return encoder.encode(JSON.stringify(event)).length
}

export function readReceiverTag (event) {
  return event.tags?.find(t => t[0] === 'r')?.[1] || ''
}

export function readSenderTag (event) {
  const senderPubkey = event.tags?.find(t => t[0] === 'f')?.[1]
  if (!senderPubkey) throw new Error('MISSING_SENDER_TAG')
  return senderPubkey
}

export function readImkcTag (event) {
  return event.tags?.find(t => t[0] === 'imkc')?.[1] || ''
}

export function readChunkTag (event) {
  const tag = event.tags?.find(t => t[0] === 'c')
  const index = Number(tag?.[1])
  const total = Number(tag?.[2])
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1) {
    throw new Error('INVALID_CHUNK_TAG')
  }
  return { index, total }
}

export function makeRouterEvent ({ pubkey, senderPubkey, imkcPubkey, receiverPubkey, chunkIndex, chunkTotal, content }) {
  const tags = [['f', senderPubkey]]
  if (imkcPubkey) tags.push(['imkc', imkcPubkey])
  tags.push(['c', String(chunkIndex), String(chunkTotal)])
  if (receiverPubkey) tags.push(['r', receiverPubkey])
  return { kind: ROUTER_KIND, pubkey, created_at: nowSeconds(), tags, content }
}
