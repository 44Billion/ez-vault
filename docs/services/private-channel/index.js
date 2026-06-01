import { generateSecretKey, getPublicKey, finalizeEvent, getEventHash, validateEvent, verifyEvent } from 'nostr-tools'
import { makeContentKeyEvent, parseContentKeyEvent, verifyContentKeyProof, verifyIykcProof } from '../content-key/event.js'
import { getIykcProofs } from '../content-key/index.js'
import { fetchEvents, pool, publish as publishToRelays } from '../relays.js'
import { JSONL_CHUNK_BYTES } from './chunk-size.js'
import { cleanupChunks, decodeChunkLines, readChunkContent, receiverPubkeys, receiverPubkeysWithoutContentKeys, writeChunks } from './chunks.js'
import { EXPIRATION_SECONDS, MAX_EVENT_BYTES, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'
import { eventByteLength, hasImkcTag, makeRouterEvent, nowSeconds, readChunkTag, readImkcProof, readImkcTag, readReceiverTag, readSenderTag } from './event.js'
import { createReceivedChunkStore, DEFAULT_RECEIVED_CHUNK_MAX_BYTES, DEFAULT_RECEIVED_CHUNK_TTL_MS } from './received-chunks.js'

export { EXPIRATION_SECONDS, MAX_EVENT_BYTES, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'

const DEFAULT_IGNORED_GROUP_TTL_MS = 30 * 60 * 1000
const DEFAULT_IGNORED_GROUP_MAX_ENTRIES = 5000

export function getJsonlChunkByteSize () {
  return JSONL_CHUNK_BYTES
}

function multiDhContext (channelPubkey) {
  return { protocol: 'private-channel', channelPubkey }
}

function storesRecoverySeeds (mode) {
  return mode === 'seeder' || mode === 'watchtower'
}

async function makeImkcProof ({ senderSigner, imkcSigner, senderPubkey, imkcPubkey }) {
  const event = await makeContentKeyEvent({ userSigner: senderSigner, contentKeySigner: imkcSigner })
  const parsed = parseContentKeyEvent(event)
  if (
    event.pubkey !== senderPubkey ||
    parsed?.iykcPubkey !== imkcPubkey ||
    !verifyContentKeyProof({ ownerPubkey: senderPubkey, contentPubkey: imkcPubkey, proof: parsed?.iykcProof })
  ) throw new Error('INVALID_IMKC_PROOF')
  return parsed.iykcProof
}

// Streaming version of wrapEvent
export async function * wrapEvents ({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, privateChannelReaderPubkey, receivers, receiverTag, event, expirationSeconds = EXPIRATION_SECONDS, _getIykcProofs = getIykcProofs }) {
  if (!senderSigner?.getPublicKey) throw new Error('SENDER_SIGNER_REQUIRED')
  if (!senderSigner?.nip44Encrypt) throw new Error('SIGNER_NIP44_ENCRYPT_UNSUPPORTED')
  if (!privateChannelSigner?.getPublicKey || !privateChannelSigner?.nip44Encrypt || !privateChannelSigner?.signEvent) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')
  if (!Array.isArray(receivers) || !receivers.length) throw new Error('NO_RECEIVERS')

  const senderPubkey = await senderSigner.getPublicKey()
  const useMultiDh = typeof senderSigner.nip44EncryptMultiDH === 'function'
  const imkcPubkey = useMultiDh && imkcSigner ? await imkcSigner.getPublicKey() : ''
  const imkcProof = imkcPubkey ? await makeImkcProof({ senderSigner, imkcSigner, senderPubkey, imkcPubkey }) : ''
  const channelPubkey = await privateChannelSigner.getPublicKey()
  const channelReaderPubkey = privateChannelReaderPubkey || channelPubkey
  const routerSeckey = generateSecretKey()
  const routerPubkey = getPublicKey(routerSeckey)
  const receiverPubkeyList = receiverPubkeys(receivers)
  const routerReceiverTag = receiverTag ?? (receiverPubkeyList.length === 1 ? receiverPubkeyList[0] : '')
  const receiverContentKeys = useMultiDh ? await _getIykcProofs(receiverPubkeysWithoutContentKeys(receivers)) : {}
  const { id, total } = await writeChunks({ senderSigner, imkcSigner: useMultiDh ? imkcSigner : null, receivers, receiverContentKeys, event, multiDhContext: multiDhContext(channelPubkey) })

  try {
    for (let index = 0; index < total; index++) {
      const content = readChunkContent(id, index)
      const router = finalizeEvent(makeRouterEvent({
        pubkey: routerPubkey,
        senderPubkey,
        imkcPubkey,
        imkcProof,
        receiverPubkey: routerReceiverTag,
        chunkIndex: index,
        chunkTotal: total,
        content
      }), routerSeckey)
      const outer = await privateChannelSigner.signEvent({
        kind: PRIVATE_BROADCAST_KIND,
        created_at: nowSeconds(),
        tags: [['expiration', String(nowSeconds() + expirationSeconds)]],
        content: await privateChannelSigner.nip44Encrypt(channelReaderPubkey, JSON.stringify(router))
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

function parseRecipientEnvelope (line, index = 0) {
  const [receiverPubkey, ciphertext, iykcPubkey = '', iykcProof = ''] = JSON.parse(line)
  return { index, receiverPubkey, ciphertext, iykcPubkey, iykcProof }
}

function isSignedEvent (event) {
  return Object.prototype.hasOwnProperty.call(event || {}, 'sig')
}

function assertValidSignedInnerEvent (event) {
  if (!validateEvent(event) || event.id !== getEventHash(event) || !verifyEvent(event)) {
    throw new Error('INVALID_SIGNED_INNER_EVENT')
  }
  return event
}

function assertValidEnvelopeIykcProof (envelope) {
  if (!envelope.iykcPubkey) return
  if (!verifyIykcProof({
    receiverPubkey: envelope.receiverPubkey,
    iykcPubkey: envelope.iykcPubkey,
    iykcProof: envelope.iykcProof
  })) throw new Error('INVALID_IYKC_PROOF')
}

function assertValidRouterImkcProof ({ router, senderPubkey, imkcPubkey, imkcProof }) {
  if (!hasImkcTag(router)) return
  if (!verifyContentKeyProof({
    ownerPubkey: senderPubkey,
    contentPubkey: imkcPubkey,
    proof: imkcProof
  })) throw new Error('INVALID_IMKC_PROOF')
}

async function unwrapRecipientEnvelope ({ envelope, receiverSigner, iykcSigner, receiverPubkey, senderPubkey, imkcPubkey, multiDhContext }) {
  if (receiverPubkey && envelope.receiverPubkey !== receiverPubkey) return null
  let plaintext
  if (envelope.iykcPubkey || imkcPubkey) {
    if (!receiverSigner?.nip44DecryptMultiDH) throw new Error('RECEIVER_MULTI_DH_UNSUPPORTED')
    if (envelope.iykcPubkey) {
      assertValidEnvelopeIykcProof(envelope)
      if (!iykcSigner?.getPublicKey) throw new Error('RECEIVER_CONTENT_KEY_REQUIRED')
      if (await iykcSigner.getPublicKey() !== envelope.iykcPubkey) return null
    }
    plaintext = (await receiverSigner.nip44DecryptMultiDH({
      peerPubkey: senderPubkey,
      peerContentPubkey: imkcPubkey,
      ownContentSigner: envelope.iykcPubkey ? iykcSigner : null,
      context: multiDhContext,
      ciphertext: envelope.ciphertext
    })).plaintext
  } else {
    if (!receiverSigner?.nip44Decrypt) throw new Error('RECEIVER_SIGNER_NIP44_DECRYPT_UNSUPPORTED')
    plaintext = await receiverSigner.nip44Decrypt(senderPubkey, envelope.ciphertext)
  }
  const decrypted = JSON.parse(plaintext)
  if (isSignedEvent(decrypted)) return assertValidSignedInnerEvent(decrypted)
  const normalized = { ...decrypted, pubkey: senderPubkey }
  return { ...normalized, id: getEventHash(normalized) }
}

export async function unwrapEvent ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelReaderSigner = privateChannelSigner, privateChannelReaderPubkey, event, receiverPubkey }) {
  if (!event || event.kind !== PRIVATE_BROADCAST_KIND) return null
  if (!receiverSigner?.nip44Decrypt) throw new Error('RECEIVER_SIGNER_NIP44_DECRYPT_UNSUPPORTED')
  const channelReaderSigner = privateChannelReaderSigner || privateChannelSigner
  if (!channelReaderSigner?.nip44Decrypt) throw new Error('PRIVATE_CHANNEL_READER_REQUIRED')

  const channelPubkey = event.pubkey || await privateChannelSigner?.getPublicKey?.()
  if (!channelPubkey) throw new Error('PRIVATE_CHANNEL_PUBKEY_REQUIRED')
  const router = await decryptRouter({
    content: event.content,
    channelPubkey,
    channelSigner: privateChannelSigner,
    channelReaderSigner,
    channelReaderPubkey: privateChannelReaderPubkey
  })
  if (router.kind !== ROUTER_KIND) throw new Error('INVALID_ROUTER_KIND')
  if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey) return null

  const senderPubkey = readSenderTag(router)
  const imkcPubkey = readImkcTag(router)
  assertValidRouterImkcProof({ router, senderPubkey, imkcPubkey, imkcProof: readImkcProof(router) })
  const lines = decodeChunkLines(router.content)
  for (let index = 0; index < lines.length; index++) {
    const event = await unwrapRecipientEnvelope({
      envelope: parseRecipientEnvelope(lines[index], index),
      receiverSigner,
      iykcSigner,
      receiverPubkey,
      senderPubkey,
      imkcPubkey,
      multiDhContext: multiDhContext(channelPubkey)
    })
    if (event) return event
  }
  return null
}

export async function publish ({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, privateChannelReaderPubkey, receivers, receiverTag, event, relays, expirationSeconds, _getIykcProofs = getIykcProofs }) {
  const results = []
  for await (const wrappedEvent of wrapEvents({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers, receiverTag, event, expirationSeconds, _getIykcProofs })) {
    results.push(await publishToRelays(wrappedEvent, relays))
  }
  return { results }
}

function readSignerFromMap (signersByPubkey, pubkey) {
  if (!signersByPubkey || !pubkey) return null
  if (signersByPubkey instanceof Map) return signersByPubkey.get(pubkey) || null
  return signersByPubkey[pubkey] || null
}

async function decryptRouter ({ content, channelPubkey, channelSigner, channelReaderSigner, channelReaderPubkey }) {
  const signer = channelReaderSigner || channelSigner
  if (!signer?.nip44Decrypt) throw new Error('PRIVATE_CHANNEL_READER_REQUIRED')

  const readerPubkey = channelReaderPubkey || channelPubkey
  const signerPubkey = await signer.getPublicKey?.()
  // Writer-side reads use writer secret + reader pubkey; reader-side reads use reader secret + channel pubkey.
  const isWriterSide = readerPubkey !== channelPubkey && (signer === channelSigner || signerPubkey === channelPubkey)
  const peerPubkey = isWriterSide ? readerPubkey : channelPubkey
  return JSON.parse(await signer.nip44Decrypt(peerPubkey, content))
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

function createTtlSet ({ ttlMs, maxEntries }) {
  const entries = new Map()

  function prune (now = Date.now()) {
    if (Number.isFinite(ttlMs)) {
      for (const [key, expiresAt] of entries) {
        if (expiresAt > now) break
        entries.delete(key)
      }
    }
    if (Number.isFinite(maxEntries)) {
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
    }
  }

  return {
    add (key) {
      if (!key || maxEntries <= 0 || ttlMs <= 0) return
      const now = Date.now()
      const expiresAt = Number.isFinite(ttlMs) ? now + ttlMs : Infinity
      if (entries.has(key)) entries.delete(key)
      entries.set(key, expiresAt)
      prune(now)
    },
    has (key) {
      prune()
      return entries.has(key)
    }
  }
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
    contentKeyPubkey: readImkcTag(router),
    contentKeyProof: readImkcProof(router)
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
    contentKeyProof: envelope.iykcProof,
    rowIndex: envelope.index
  })
}

function createProcessor ({
  receiverSigner,
  iykcSigner,
  privateChannelSigner,
  privateChannelSignersByPubkey,
  privateChannelReaderSigner = privateChannelSigner,
  privateChannelReaderSignersByPubkey,
  privateChannelReaderPubkey,
  privateChannelReaderPubkeysByPubkey,
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
  ignoredGroupTtlMs = DEFAULT_IGNORED_GROUP_TTL_MS,
  ignoredGroupMaxEntries = DEFAULT_IGNORED_GROUP_MAX_ENTRIES
}) {
  const receivedChunks = createReceivedChunkStore({
    ttlMs: receivedChunkTtlMs,
    maxBytes: receivedChunkMaxBytes,
    storageArea: receivedChunkStorageArea
  })
  const ignoredGroups = createTtlSet({
    ttlMs: ignoredGroupTtlMs,
    maxEntries: ignoredGroupMaxEntries
  })

  return async function processOuterEvent (outer) {
    let groupKey = ''
    try {
      const channelPubkey = outer.pubkey || await privateChannelSigner?.getPublicKey?.()
      const channelSigner = readSignerFromMap(privateChannelSignersByPubkey, channelPubkey) || privateChannelSigner
      const channelReaderSigner = readSignerFromMap(privateChannelReaderSignersByPubkey, channelPubkey) || privateChannelReaderSigner || channelSigner
      const channelReaderPubkey = readValueFromMap(privateChannelReaderPubkeysByPubkey, channelPubkey) || privateChannelReaderPubkey || channelPubkey
      const channelMode = readValueFromMap(modeByPubkey, channelPubkey) || mode
      if (!channelPubkey) throw new Error('PRIVATE_CHANNEL_PUBKEY_REQUIRED')

      const router = await decryptRouter({
        content: outer.content,
        channelPubkey,
        channelSigner,
        channelReaderSigner,
        channelReaderPubkey
      })
      if (router.kind !== ROUTER_KIND) return
      const senderPubkey = readSenderTag(router)
      if (receiverPubkey && readReceiverTag(router) && readReceiverTag(router) !== receiverPubkey && senderPubkey !== receiverPubkey) return
      const { index, total } = readChunkTag(router)
      groupKey = receivedChunks.groupKeyFor(channelPubkey, router.pubkey)
      if (ignoredGroups.has(groupKey)) return

      const imkcPubkey = readImkcTag(router)
      assertValidRouterImkcProof({ router, senderPubkey, imkcPubkey, imkcProof: readImkcProof(router) })
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

      const shouldSeed = storesRecoverySeeds(channelMode)
      const sentByReceiver = receiverPubkey && senderPubkey === receiverPubkey
      // Recovery seeders and own-sent messages need the full recipient list;
      // regular leechers can stop as soon as their envelope is decrypted.
      const mustScanWholeBundle = shouldSeed || sentByReceiver
      let event = null

      const drained = await receivedChunks.drainAvailable(groupKey, {
        onLine: async (line, rowIndex, groupMeta, helpers) => {
          const envelope = parseRecipientEnvelope(line, rowIndex)
          helpers.rememberReceiverPubkey(groupMeta, envelope.receiverPubkey)

          if (receiverPubkey && envelope.receiverPubkey === receiverPubkey) {
            assertValidEnvelopeIykcProof(envelope)
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
                imkcPubkey,
                multiDhContext: multiDhContext(channelPubkey)
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
      if ((err?.message === 'INVALID_SIGNED_INNER_EVENT' || err?.message === 'INVALID_IYKC_PROOF' || err?.message === 'INVALID_IMKC_PROOF') && groupKey) {
        ignoredGroups.add(groupKey)
        receivedChunks.removeGroup(groupKey)
      }
      onError?.(err)
    }
  }
}

export async function fetch ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelReaderSigner = privateChannelSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onSeedEvent, onContentKeyUsage, onError, since, until, limit, mode = 'leecher', modeByPubkey, receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS, receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES, receivedChunkStorageArea, ignoredGroupTtlMs = DEFAULT_IGNORED_GROUP_TTL_MS, ignoredGroupMaxEntries = DEFAULT_IGNORED_GROUP_MAX_ENTRIES }) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys })
  const filter = { kinds: [PRIVATE_BROADCAST_KIND] }
  if (authors.length) filter.authors = authors
  if (since != null) filter.since = since
  if (until != null) filter.until = until
  if (limit != null) filter.limit = limit

  const events = await fetchEvents(filter, relays)
  events.sort((a, b) => a.created_at - b.created_at)
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, privateChannelReaderSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onSeedEvent, onContentKeyUsage, onError, receivedChunkTtlMs, receivedChunkMaxBytes, receivedChunkStorageArea, ignoredGroupTtlMs, ignoredGroupMaxEntries })
  for (const event of events) await processOuterEvent(event)
  return events
}

export function subscribe ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelReaderSigner = privateChannelSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onSeedEvent, onContentKeyUsage, onError, onEose, since = nowSeconds() - 5, limit, liveOnly = false, mode = 'leecher', modeByPubkey, receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS, receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES, receivedChunkStorageArea, ignoredGroupTtlMs = DEFAULT_IGNORED_GROUP_TTL_MS, ignoredGroupMaxEntries = DEFAULT_IGNORED_GROUP_MAX_ENTRIES }) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  if (receiverSigner && !receiverSigner?.nip44Decrypt) throw new Error('RECEIVER_SIGNER_NIP44_DECRYPT_UNSUPPORTED')
  if (!privateChannelReaderSigner && !privateChannelReaderSignersByPubkey && !privateChannelSigner && !privateChannelSignersByPubkey) throw new Error('PRIVATE_CHANNEL_READER_REQUIRED')

  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys })
  const filter = { kinds: [PRIVATE_BROADCAST_KIND], since }
  if (authors.length) filter.authors = authors
  if (limit != null) filter.limit = limit
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, privateChannelReaderSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onSeedEvent, onContentKeyUsage, onError, receivedChunkTtlMs, receivedChunkMaxBytes, receivedChunkStorageArea, ignoredGroupTtlMs, ignoredGroupMaxEntries })
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
