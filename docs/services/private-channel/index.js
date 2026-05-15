import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools'
import { getIykcProofs } from '../content-key/index.js'
import { pool, publish as publishToRelays } from '../relays.js'
import { JSONL_CHUNK_BYTES } from './chunk-size.js'
import { cleanupChunks, decodeChunkLines, joinChunksAsBase64, readChunkContent, receiverPubkeys, receiverPubkeysWithoutContentKeys, writeChunks } from './chunks.js'
import { EXPIRATION_SECONDS, MAX_EVENT_BYTES, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'
import { eventByteLength, makeRouterEvent, nowSeconds, readChunkTag, readImkcTag, readReceiverTag, readSenderTag } from './event.js'

export { EXPIRATION_SECONDS, MAX_EVENT_BYTES, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'

export function getJsonlChunkByteSize () {
  return JSONL_CHUNK_BYTES
}

// Streaming version of wrapEvent
export async function * wrapEvents ({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, receivers, event, _getIykcProofs = getIykcProofs }) {
  const rowEncryptionSigner = imkcSigner || senderSigner
  if (!senderSigner?.getPublicKey) throw new Error('SENDER_SIGNER_REQUIRED')
  if (!rowEncryptionSigner?.withSharedKey) throw new Error('SIGNER_SHARED_KEY_UNSUPPORTED')
  if (!privateChannelSigner?.getPublicKey || !privateChannelSigner?.nip44Encrypt || !privateChannelSigner?.signEvent) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')
  if (!Array.isArray(receivers) || !receivers.length) throw new Error('NO_RECEIVERS')

  const senderPubkey = await senderSigner.getPublicKey()
  const imkcPubkey = imkcSigner ? await imkcSigner.getPublicKey() : ''
  const channelPubkey = await privateChannelSigner.getPublicKey()
  const routerSeckey = generateSecretKey()
  const routerPubkey = getPublicKey(routerSeckey)
  const receiverPubkeyList = receiverPubkeys(receivers)
  const receiverTag = receiverPubkeyList.length === 1 ? receiverPubkeyList[0] : ''
  const receiverContentKeys = await _getIykcProofs(receiverPubkeysWithoutContentKeys(receivers))
  const { id, total } = await writeChunks({ rowEncryptionSigner, receivers, receiverContentKeys, event })

  try {
    for (let index = 0; index < total; index++) {
      const content = readChunkContent(id, index)
      const router = finalizeEvent(makeRouterEvent({
        pubkey: routerPubkey,
        senderPubkey,
        imkcPubkey,
        receiverPubkey: receiverTag,
        chunkIndex: index,
        chunkTotal: total,
        content
      }), routerSeckey)
      const outer = await privateChannelSigner.signEvent({
        kind: PRIVATE_BROADCAST_KIND,
        created_at: nowSeconds(),
        tags: [['expiration', String(nowSeconds() + EXPIRATION_SECONDS)]],
        content: await privateChannelSigner.nip44Encrypt(channelPubkey, JSON.stringify(router))
      })
      if (eventByteLength(outer) > MAX_EVENT_BYTES) throw new Error('EVENT_TOO_LARGE')
      yield outer
    }
  } finally {
    cleanupChunks(id, total)
  }
}

export async function wrapEvent (options) {
  const events = []
  for await (const event of wrapEvents(options)) events.push(event)
  return events
}

export async function unwrapEvent ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, event, receiverPubkey }) {
  if (!event || event.kind !== PRIVATE_BROADCAST_KIND) return null
  if (!receiverSigner?.withSharedKey) throw new Error('RECEIVER_SIGNER_SHARED_KEY_UNSUPPORTED')
  if (!privateChannelSigner?.getPublicKey || !privateChannelSigner?.nip44Decrypt) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')

  const channelPubkey = await privateChannelSigner.getPublicKey()
  const router = JSON.parse(await privateChannelSigner.nip44Decrypt(channelPubkey, event.content))
  if (router.kind !== ROUTER_KIND) throw new Error('INVALID_ROUTER_KIND')
  if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey) return null

  const senderPubkey = readSenderTag(router)
  const sharedKeyPubkey = readImkcTag(router) || senderPubkey
  const lines = decodeChunkLines(router.content)
  for (const line of lines) {
    const [lineReceiver, ciphertext, iykcPubkey] = JSON.parse(line)
    if (receiverPubkey && lineReceiver !== receiverPubkey) continue
    const rowReceiverSigner = iykcPubkey ? iykcSigner : receiverSigner
    if (!rowReceiverSigner?.withSharedKey) throw new Error('RECEIVER_CONTENT_KEY_REQUIRED')
    if (iykcPubkey && rowReceiverSigner.getPublicKey && await rowReceiverSigner.getPublicKey() !== iykcPubkey) continue
    const tweakedSigner = rowReceiverSigner.withSharedKey(sharedKeyPubkey)
    const tweakedPubkey = await tweakedSigner.getPublicKey()
    return JSON.parse(await tweakedSigner.nip44Decrypt(tweakedPubkey, ciphertext))
  }
  return null
}

export async function publish ({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, receivers, event, relays, _getIykcProofs = getIykcProofs }) {
  const results = []
  for await (const wrappedEvent of wrapEvents({ senderSigner, imkcSigner, privateChannelSigner, receivers, event, _getIykcProofs })) {
    results.push(await publishToRelays(wrappedEvent, relays))
  }
  return { results }
}

export function subscribe ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelPubkey, receiverPubkey, relays, onEvent, onError, since = nowSeconds() - 5 }) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  if (!receiverSigner?.withSharedKey) throw new Error('RECEIVER_SIGNER_SHARED_KEY_UNSUPPORTED')
  if (!privateChannelSigner?.getPublicKey || !privateChannelSigner?.nip44Encrypt || !privateChannelSigner?.nip44Decrypt) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')

  const channelPubkeyPromise = privateChannelPubkey ? Promise.resolve(privateChannelPubkey) : privateChannelSigner.getPublicKey()
  const chunks = new Map()
  const sub = pool.subscribeMany(relays, { kinds: [PRIVATE_BROADCAST_KIND], authors: privateChannelPubkey ? [privateChannelPubkey] : undefined, since }, {
    onevent: async (outer) => {
      try {
        const channelPubkey = await channelPubkeyPromise
        const router = JSON.parse(await privateChannelSigner.nip44Decrypt(channelPubkey, outer.content))
        if (router.kind !== ROUTER_KIND) return
        if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey) return
        const { index, total } = readChunkTag(router)
        const bucket = chunks.get(router.pubkey) ?? { total, parts: [] }
        bucket.total = total
        bucket.parts[index] = router.content
        chunks.set(router.pubkey, bucket)
        if (bucket.parts.filter(Boolean).length !== bucket.total) return

        const joined = joinChunksAsBase64(bucket.parts)
        chunks.delete(router.pubkey)
        const syntheticOuter = { ...outer, content: await privateChannelSigner.nip44Encrypt(channelPubkey, JSON.stringify({ ...router, content: joined, tags: router.tags.filter(t => t[0] !== 'c').concat([['c', '0', '1']]) })) }
        const event = await unwrapEvent({ receiverSigner, iykcSigner, privateChannelSigner, event: syntheticOuter, receiverPubkey })
        if (event) onEvent?.(event, outer)
      } catch (err) {
        onError?.(err)
      }
    }
  })
  return sub
}
