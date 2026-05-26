import { generateSecretKey, getPublicKey, finalizeEvent, getEventHash } from 'nostr-tools'
import { getIykcProofs } from '../content-key/index.js'
import { fetchEvents, pool, publish as publishToRelays } from '../relays.js'
import { JSONL_CHUNK_BYTES } from './chunk-size.js'
import { cleanupChunks, decodeChunkLines, readChunkContent, receiverPubkeys, receiverPubkeysWithoutContentKeys, writeChunks } from './chunks.js'
import { EXPIRATION_SECONDS, MAX_EVENT_BYTES, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'
import { eventByteLength, makeRouterEvent, nowSeconds, readChunkTag, readImkcTag, readReceiverTag, readSenderTag } from './event.js'
import { createReceivedChunkStore, DEFAULT_RECEIVED_CHUNK_MAX_BYTES, DEFAULT_RECEIVED_CHUNK_TTL_MS } from './received-chunks.js'

export { EXPIRATION_SECONDS, MAX_EVENT_BYTES, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'

export function getJsonlChunkByteSize () {
  return JSONL_CHUNK_BYTES
}

// Streaming version of wrapEvent
export async function * wrapEvents ({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, receivers, receiverTag, event, expirationSeconds = EXPIRATION_SECONDS, _getIykcProofs = getIykcProofs }) {
  const rowEncryptionSigner = imkcSigner || senderSigner
  if (!senderSigner?.getPublicKey) throw new Error('SENDER_SIGNER_REQUIRED')
  if (!rowEncryptionSigner?.nip44Encrypt) throw new Error('SIGNER_NIP44_ENCRYPT_UNSUPPORTED')
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

function joinedRouter (router, content = '') {
  return {
    ...router,
    content,
    tags: router.tags.filter(t => t[0] !== 'c').concat([['c', '0', '1']])
  }
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

function parseRecipientEnvelope (line, index = 0) {
  const [receiverPubkey, ciphertext, iykcPubkey = '', iykcProof = ''] = JSON.parse(line)
  return { index, receiverPubkey, ciphertext, iykcPubkey, iykcProof }
}

async function unwrapRecipientEnvelope ({ envelope, receiverSigner, iykcSigner, receiverPubkey, senderPubkey, senderEncryptionPubkey }) {
  if (receiverPubkey && envelope.receiverPubkey !== receiverPubkey) return null
  const rowReceiverSigner = envelope.iykcPubkey ? iykcSigner : receiverSigner
  if (!rowReceiverSigner?.nip44Decrypt) throw new Error('RECEIVER_CONTENT_KEY_REQUIRED')
  if (envelope.iykcPubkey && rowReceiverSigner.getPublicKey && await rowReceiverSigner.getPublicKey() !== envelope.iykcPubkey) return null
  const decrypted = JSON.parse(await rowReceiverSigner.nip44Decrypt(senderEncryptionPubkey, envelope.ciphertext))
  const normalized = { ...decrypted, pubkey: senderPubkey }
  return { ...normalized, id: getEventHash(normalized) }
}

export async function unwrapEvent ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, event, receiverPubkey, _getIykcProofs = getIykcProofs }) {
  if (!event || event.kind !== PRIVATE_BROADCAST_KIND) return null
  if (!receiverSigner?.nip44Decrypt) throw new Error('RECEIVER_SIGNER_NIP44_DECRYPT_UNSUPPORTED')
  if (!privateChannelSigner?.getPublicKey || !privateChannelSigner?.nip44Decrypt) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')

  const channelPubkey = await privateChannelSigner.getPublicKey()
  const router = JSON.parse(await privateChannelSigner.nip44Decrypt(channelPubkey, event.content))
  if (router.kind !== ROUTER_KIND) throw new Error('INVALID_ROUTER_KIND')
  if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey) return null

  const { senderPubkey, imkcPubkey } = await assertSenderContentKey({ router, _getIykcProofs })
  const senderEncryptionPubkey = imkcPubkey || senderPubkey
  const lines = decodeChunkLines(router.content)
  for (let index = 0; index < lines.length; index++) {
    const event = await unwrapRecipientEnvelope({
      envelope: parseRecipientEnvelope(lines[index], index),
      receiverSigner,
      iykcSigner,
      receiverPubkey,
      senderPubkey,
      senderEncryptionPubkey
    })
    if (event) return event
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

function contentKeyUsageBase ({ outer, router, channelPubkey, receiverPubkeys = [] }) {
  const senderPubkey = readSenderTag(router)
  const routerReceiverPubkey = readReceiverTag(router)
  return {
    outer,
    router,
    channelPubkey,
    senderPubkey,
    routerReceiverPubkey,
    receiverPubkeys,
    isBroadcast: !routerReceiverPubkey
  }
}

function emitSentContentKeyUsage ({ outer, router, channelPubkey, receiverPubkey, receiverPubkeys, onContentKeyUsage }) {
  if (!receiverPubkey || !onContentKeyUsage) return

  const base = contentKeyUsageBase({ outer, router, channelPubkey, receiverPubkeys })
  if (base.senderPubkey !== receiverPubkey) return
  onContentKeyUsage({
    ...base,
    direction: 'sent',
    keyRole: 'sender',
    receiverPubkey: base.routerReceiverPubkey || '',
    contentKeyPubkey: readImkcTag(router)
  })
}

function emitReceivedContentKeyUsage ({ outer, router, channelPubkey, receiverPubkey, receiverPubkeys, envelope, onContentKeyUsage }) {
  if (!receiverPubkey || !onContentKeyUsage || envelope.receiverPubkey !== receiverPubkey) return

  onContentKeyUsage({
    ...contentKeyUsageBase({ outer, router, channelPubkey, receiverPubkeys }),
    direction: 'received',
    keyRole: 'receiver',
    receiverPubkey: envelope.receiverPubkey,
    contentKeyPubkey: envelope.iykcPubkey,
    iykcProof: envelope.iykcProof,
    rowIndex: envelope.index
  })
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
  onContentKeyUsage,
  onError,
  receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS,
  receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES,
  receivedChunkStorageArea,
  _getIykcProofs = getIykcProofs
}) {
  const receivedChunks = createReceivedChunkStore({
    ttlMs: receivedChunkTtlMs,
    maxBytes: receivedChunkMaxBytes,
    storageArea: receivedChunkStorageArea
  })
  const ignoredGroups = new Set()

  return async function processOuterEvent (outer) {
    try {
      const channelPubkey = outer.pubkey || await privateChannelSigner?.getPublicKey?.()
      const channelSigner = readSignerFromMap(privateChannelSignersByPubkey, channelPubkey) || privateChannelSigner
      const channelMode = readValueFromMap(modeByPubkey, channelPubkey) || mode
      if (!channelSigner?.getPublicKey || !channelSigner?.nip44Decrypt) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')

      const router = JSON.parse(await channelSigner.nip44Decrypt(channelPubkey, outer.content))
      if (router.kind !== ROUTER_KIND) return
      const senderPubkey = readSenderTag(router)
      if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey && senderPubkey !== receiverPubkey) return
      const { index, total } = readChunkTag(router)
      const groupKey = receivedChunks.groupKeyFor(channelPubkey, router.pubkey)
      if (ignoredGroups.has(groupKey)) return

      const { imkcPubkey } = await assertSenderContentKey({ router, _getIykcProofs })
      const senderEncryptionPubkey = imkcPubkey || senderPubkey
      const meta = receivedChunks.put({
        channelPubkey,
        routerPubkey: router.pubkey,
        index,
        total,
        content: router.content
      })
      const status = receivedChunks.status(meta)
      onChunk?.({
        outer,
        router,
        channelPubkey,
        index,
        total,
        received: status.received,
        missing: status.missing
      })

      const shouldSeed = channelMode === 'seeder'
      const sentByReceiver = receiverPubkey && senderPubkey === receiverPubkey
      // Seeders and own-sent messages need the full recipient list; regular
      // leechers can stop as soon as their recipient envelope is decrypted.
      const mustScanWholeBundle = shouldSeed || sentByReceiver
      let event = null

      const drained = await receivedChunks.drainAvailable(groupKey, {
        onLine: async (line, rowIndex, groupMeta, helpers) => {
          const envelope = parseRecipientEnvelope(line, rowIndex)
          helpers.rememberReceiverPubkey(groupMeta, envelope.receiverPubkey)

          if (receiverPubkey && envelope.receiverPubkey === receiverPubkey) {
            emitReceivedContentKeyUsage({
              outer,
              router,
              channelPubkey,
              receiverPubkey,
              receiverPubkeys: groupMeta.receiverPubkeys,
              envelope,
              onContentKeyUsage
            })
            if (receiverSigner && !event) {
              event = await unwrapRecipientEnvelope({
                envelope,
                receiverSigner,
                iykcSigner,
                receiverPubkey,
                senderPubkey,
                senderEncryptionPubkey
              })
              if (event && !mustScanWholeBundle) return { stop: true }
            }
          }
        }
      })

      if (event && !mustScanWholeBundle) {
        await onEvent?.(event, outer, { router: joinedRouter(router), channelPubkey })
        ignoredGroups.add(groupKey)
        receivedChunks.removeGroup(groupKey)
        return
      }

      if (!drained.complete) return

      const receiverPubkeys = drained.meta?.receiverPubkeys || []
      const content = shouldSeed ? receivedChunks.readEnvelopeBundleContent(groupKey) : ''
      const jsonl = shouldSeed ? receivedChunks.readEnvelopeBundleText(groupKey) : ''
      const completeRouter = joinedRouter(router, content)

      emitSentContentKeyUsage({
        outer,
        router: completeRouter,
        channelPubkey,
        receiverPubkey,
        receiverPubkeys,
        onContentKeyUsage
      })
      if (shouldSeed) await onSeedEvent?.({ outer, router: completeRouter, channelPubkey, jsonl })
      if (event) await onEvent?.(event, outer, { router: completeRouter, channelPubkey, jsonl })

      receivedChunks.removeGroup(groupKey)
    } catch (err) {
      onError?.(err)
    }
  }
}

export async function fetch ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onSeedEvent, onContentKeyUsage, onError, since, until, limit, mode = 'leecher', modeByPubkey, receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS, receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES, receivedChunkStorageArea, _getIykcProofs = getIykcProofs }) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys })
  const filter = { kinds: [PRIVATE_BROADCAST_KIND] }
  if (authors.length) filter.authors = authors
  if (since != null) filter.since = since
  if (until != null) filter.until = until
  if (limit != null) filter.limit = limit

  const events = await fetchEvents(filter, relays)
  events.sort((a, b) => a.created_at - b.created_at)
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onSeedEvent, onContentKeyUsage, onError, receivedChunkTtlMs, receivedChunkMaxBytes, receivedChunkStorageArea, _getIykcProofs })
  for (const event of events) await processOuterEvent(event)
  return events
}

export function subscribe ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onSeedEvent, onContentKeyUsage, onError, onEose, since = nowSeconds() - 5, limit, liveOnly = false, mode = 'leecher', modeByPubkey, receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS, receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES, receivedChunkStorageArea, _getIykcProofs = getIykcProofs }) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  if (receiverSigner && !receiverSigner?.nip44Decrypt) throw new Error('RECEIVER_SIGNER_NIP44_DECRYPT_UNSUPPORTED')
  if (!privateChannelSigner && !privateChannelSignersByPubkey) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')

  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys })
  const filter = { kinds: [PRIVATE_BROADCAST_KIND], since }
  if (authors.length) filter.authors = authors
  if (limit != null) filter.limit = limit
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onSeedEvent, onContentKeyUsage, onError, receivedChunkTtlMs, receivedChunkMaxBytes, receivedChunkStorageArea, _getIykcProofs })
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
