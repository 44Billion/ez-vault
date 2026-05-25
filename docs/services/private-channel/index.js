import { generateSecretKey, getPublicKey, finalizeEvent, getEventHash } from 'nostr-tools'
import { getIykcProofs } from '../content-key/index.js'
import { fetchEvents, pool, publish as publishToRelays } from '../relays.js'
import { JSONL_CHUNK_BYTES } from './chunk-size.js'
import { cleanupChunks, decodeChunkLines, decodeChunkText, joinChunksAsBase64, readChunkContent, receiverPubkeys, receiverPubkeysWithoutContentKeys, writeChunks } from './chunks.js'
import { EXPIRATION_SECONDS, MAX_EVENT_BYTES, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'
import { eventByteLength, makeRouterEvent, nowSeconds, readChunkTag, readImkcTag, readReceiverTag, readSenderTag } from './event.js'

export { EXPIRATION_SECONDS, MAX_EVENT_BYTES, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'

export function getJsonlChunkByteSize () {
  return JSONL_CHUNK_BYTES
}

// Streaming version of wrapEvent
export async function * wrapEvents ({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, receivers, receiverTag, event, expirationSeconds = EXPIRATION_SECONDS, _getIykcProofs = getIykcProofs }) {
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
  const routerReceiverTag = receiverTag ?? (receiverPubkeyList.length === 1 ? receiverPubkeyList[0] : '')
  const receiverContentKeys = await _getIykcProofs(receiverPubkeysWithoutContentKeys(receivers))
  const { id, total } = await writeChunks({ rowEncryptionSigner, receivers, receiverContentKeys, event })

  try {
    for (let index = 0; index < total; index++) {
      const content = readChunkContent(id, index)
      const router = finalizeEvent(makeRouterEvent({
        pubkey: routerPubkey,
        senderPubkey,
        imkcPubkey,
        receiverPubkey: routerReceiverTag,
        chunkIndex: index,
        chunkTotal: total,
        content
      }), routerSeckey)
      const outer = await privateChannelSigner.signEvent({
        kind: PRIVATE_BROADCAST_KIND,
        created_at: nowSeconds(),
        tags: [['expiration', String(nowSeconds() + expirationSeconds)]],
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

async function assertSenderContentKey ({ router, _getIykcProofs = getIykcProofs }) {
  const senderPubkey = readSenderTag(router)
  const imkcPubkey = readImkcTag(router)
  if (!imkcPubkey) return { senderPubkey, imkcPubkey: '' }

  const senderContentKeys = await _getIykcProofs([senderPubkey])
  const advertised = senderContentKeys?.[senderPubkey]
  const isCurrent = advertised?.iykcPubkey === imkcPubkey
  const isStale = advertised?.staleIykcProofs?.some(stale => stale.iykcPubkey === imkcPubkey)
  if (!isCurrent && !isStale) {
    throw new Error('INVALID_SENDER_CONTENT_KEY')
  }
  return { senderPubkey, imkcPubkey }
}

export async function unwrapEvent ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, event, receiverPubkey, _getIykcProofs = getIykcProofs }) {
  if (!event || event.kind !== PRIVATE_BROADCAST_KIND) return null
  if (!receiverSigner?.withSharedKey) throw new Error('RECEIVER_SIGNER_SHARED_KEY_UNSUPPORTED')
  if (!privateChannelSigner?.getPublicKey || !privateChannelSigner?.nip44Decrypt) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')

  const channelPubkey = await privateChannelSigner.getPublicKey()
  const router = JSON.parse(await privateChannelSigner.nip44Decrypt(channelPubkey, event.content))
  if (router.kind !== ROUTER_KIND) throw new Error('INVALID_ROUTER_KIND')
  if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey) return null

  const { senderPubkey, imkcPubkey } = await assertSenderContentKey({ router, _getIykcProofs })
  const sharedKeyPubkey = imkcPubkey || senderPubkey
  const lines = decodeChunkLines(router.content)
  for (const line of lines) {
    const [lineReceiver, ciphertext, iykcPubkey] = JSON.parse(line)
    if (receiverPubkey && lineReceiver !== receiverPubkey) continue
    const rowReceiverSigner = iykcPubkey ? iykcSigner : receiverSigner
    if (!rowReceiverSigner?.withSharedKey) throw new Error('RECEIVER_CONTENT_KEY_REQUIRED')
    if (iykcPubkey && rowReceiverSigner.getPublicKey && await rowReceiverSigner.getPublicKey() !== iykcPubkey) continue
    const tweakedSigner = rowReceiverSigner.withSharedKey(sharedKeyPubkey)
    const tweakedPubkey = await tweakedSigner.getPublicKey()
    const decrypted = JSON.parse(await tweakedSigner.nip44Decrypt(tweakedPubkey, ciphertext))
    const normalized = { ...decrypted, pubkey: senderPubkey }
    return { ...normalized, id: getEventHash(normalized) }
  }
  return null
}

export async function publish ({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, receivers, receiverTag, event, relays, expirationSeconds, _getIykcProofs = getIykcProofs }) {
  const results = []
  for await (const wrappedEvent of wrapEvents({ senderSigner, imkcSigner, privateChannelSigner, receivers, receiverTag, event, expirationSeconds, _getIykcProofs })) {
    results.push(await publishToRelays(wrappedEvent, relays))
  }
  return { results }
}

function readSignerFromMap (signersByPubkey, pubkey) {
  if (!signersByPubkey || !pubkey) return null
  if (signersByPubkey instanceof Map) return signersByPubkey.get(pubkey) || null
  return signersByPubkey[pubkey] || null
}

function readValueFromMap (map, key) {
  if (!map || !key) return null
  if (map instanceof Map) return map.get(key) || null
  return map[key] || null
}

function privateChannelPubkeyList ({ privateChannelPubkey, privateChannelPubkeys }) {
  return [...new Set([
    ...(privateChannelPubkeys || []),
    ...(privateChannelPubkey ? [privateChannelPubkey] : [])
  ].filter(Boolean))]
}

function createProcessor ({
  receiverSigner,
  iykcSigner,
  privateChannelSigner,
  privateChannelSignersByPubkey,
  receiverPubkey,
  mode = 'leecher',
  modeByPubkey,
  onChunk,
  onEvent,
  onSeedEvent,
  onError,
  _getIykcProofs = getIykcProofs
}) {
  const chunks = new Map()

  return async function processOuterEvent (outer) {
    try {
      const channelPubkey = outer.pubkey || await privateChannelSigner?.getPublicKey?.()
      const channelSigner = readSignerFromMap(privateChannelSignersByPubkey, channelPubkey) || privateChannelSigner
      const channelMode = readValueFromMap(modeByPubkey, channelPubkey) || mode
      if (!channelSigner?.getPublicKey || !channelSigner?.nip44Encrypt || !channelSigner?.nip44Decrypt) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')

      const router = JSON.parse(await channelSigner.nip44Decrypt(channelPubkey, outer.content))
      if (router.kind !== ROUTER_KIND) return
      if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey) return
      const { index, total } = readChunkTag(router)
      const bucket = chunks.get(router.pubkey) ?? { total, parts: [] }
      bucket.total = total
      bucket.parts[index] = router.content
      chunks.set(router.pubkey, bucket)
      onChunk?.({
        outer,
        router,
        channelPubkey,
        index,
        total,
        received: bucket.parts.filter(Boolean).length,
        missing: Array.from({ length: total }, (_v, i) => bucket.parts[i] ? null : i).filter(i => i != null)
      })
      if (bucket.parts.filter(Boolean).length !== bucket.total) return

      const joined = joinChunksAsBase64(bucket.parts)
      chunks.delete(router.pubkey)
      const joinedRouter = { ...router, content: joined, tags: router.tags.filter(t => t[0] !== 'c').concat([['c', '0', '1']]) }
      const jsonl = decodeChunkText(joined)
      await assertSenderContentKey({ router: joinedRouter, _getIykcProofs })
      if (channelMode === 'seeder') onSeedEvent?.({ outer, router: joinedRouter, channelPubkey, jsonl })

      if (!receiverSigner) return
      const syntheticOuter = { ...outer, content: await channelSigner.nip44Encrypt(channelPubkey, JSON.stringify(joinedRouter)) }
      const event = await unwrapEvent({ receiverSigner, iykcSigner, privateChannelSigner: channelSigner, event: syntheticOuter, receiverPubkey, _getIykcProofs })
      if (event) onEvent?.(event, outer, { router: joinedRouter, channelPubkey, jsonl })
    } catch (err) {
      onError?.(err)
    }
  }
}

export async function fetch ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onSeedEvent, onError, since, until, limit, mode = 'leecher', modeByPubkey, _getIykcProofs = getIykcProofs }) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys })
  const filter = { kinds: [PRIVATE_BROADCAST_KIND] }
  if (authors.length) filter.authors = authors
  if (since != null) filter.since = since
  if (until != null) filter.until = until
  if (limit != null) filter.limit = limit

  const events = await fetchEvents(filter, relays)
  events.sort((a, b) => a.created_at - b.created_at)
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onSeedEvent, onError, _getIykcProofs })
  for (const event of events) await processOuterEvent(event)
  return events
}

export function subscribe ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onSeedEvent, onError, onEose, since = nowSeconds() - 5, limit, liveOnly = false, mode = 'leecher', modeByPubkey, _getIykcProofs = getIykcProofs }) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  if (receiverSigner && !receiverSigner?.withSharedKey) throw new Error('RECEIVER_SIGNER_SHARED_KEY_UNSUPPORTED')
  if (!privateChannelSigner && !privateChannelSignersByPubkey) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')

  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys })
  const filter = { kinds: [PRIVATE_BROADCAST_KIND], since }
  if (authors.length) filter.authors = authors
  if (limit != null) filter.limit = limit
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onSeedEvent, onError, _getIykcProofs })
  let eosed = false

  return pool.subscribeMany(relays, filter, {
    onevent: async (outer) => {
      if (liveOnly && !eosed) return
      await processOuterEvent(outer)
    },
    oneose: () => {
      eosed = true
      onEose?.()
    }
  })
}
