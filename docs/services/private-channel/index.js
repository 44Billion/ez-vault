import { generateSecretKey, getPublicKey, finalizeEvent, getEventHash, validateEvent, verifyEvent } from 'nostr-tools'
import { bytesToBase64, base64ToBytes } from '../../helpers/base64.js'
import { makeContentKeyEventForPubkey, parseContentKeyEvent, verifyContentKeyProof, verifyIykcProof } from '../content-key/event.js'
import { getIykcProofs } from '../content-key/index.js'
import { fetchEvents, pool, publish as publishToRelays } from '../relays.js'
import { JSONL_CHUNK_BYTES, NYM_CARRIER_CHUNK_CHARS } from './chunk-size.js'
import { cleanupChunks, decodeChunkLines, readChunkContent, receiverPubkeys, receiverPubkeysWithoutContentKeys, writeChunks } from './chunks.js'
import { EXPIRATION_SECONDS, MAX_EVENT_BYTES, NYM_CARRIER_KIND, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'
import { eventByteLength, hasImkcTag, makeNymCarrierEvent, makeRouterEvent, nowSeconds, readChunkTag, readIdTag, readImkcProof, readImkcTag, readReceiverTag, readSenderTag } from './event.js'
import { createReceivedChunkStore, DEFAULT_RECEIVED_CHUNK_MAX_BYTES, DEFAULT_RECEIVED_CHUNK_TTL_MS } from './received-chunks.js'

export { EXPIRATION_SECONDS, MAX_EVENT_BYTES, NYM_CARRIER_KIND, PRIVATE_BROADCAST_KIND, ROUTER_KIND } from './constants.js'

const DEFAULT_IGNORED_GROUP_TTL_MS = 30 * 60 * 1000
const DEFAULT_IGNORED_GROUP_MAX_ENTRIES = 5000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function uniq (values) {
  return [...new Set((values || []).filter(Boolean))]
}

export function getJsonlChunkByteSize () {
  return JSONL_CHUNK_BYTES
}

export function getNymCarrierChunkSize () {
  return NYM_CARRIER_CHUNK_CHARS
}

function multiDhContext (channelPubkey) {
  return { protocol: 'private-channel', channelPubkey }
}

function storesRecoverySeeds (mode) {
  return mode === 'seeder' || mode === 'watchtower'
}

async function makeImkcProof ({ senderSigner, senderPubkey, imkcPubkey }) {
  const event = await makeContentKeyEventForPubkey({ userSigner: senderSigner, contentPubkey: imkcPubkey })
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
  const channelPubkey = await privateChannelSigner.getPublicKey()
  const channelReaderPubkey = privateChannelReaderPubkey || channelPubkey
  const routerSeckey = generateSecretKey()
  const routerPubkey = getPublicKey(routerSeckey)
  const receiverPubkeyList = receiverPubkeys(receivers)
  const routerReceiverTag = receiverTag ?? (receiverPubkeyList.length === 1 ? receiverPubkeyList[0] : '')
  const receiverContentKeys = useMultiDh ? await _getIykcProofs(receiverPubkeysWithoutContentKeys(receivers)) : {}
  const {
    id,
    total,
    ownContentPubkey: imkcPubkey
  } = await writeChunks({
    senderSigner,
    imkcSigner: useMultiDh ? imkcSigner : null,
    receivers,
    receiverContentKeys,
    event,
    multiDhContext: multiDhContext(channelPubkey)
  })
  const imkcProof = imkcPubkey ? await makeImkcProof({ senderSigner, senderPubkey, imkcPubkey }) : ''

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

export async function * wrapNymEvents ({ nymSigner, privateChannelSigner, privateChannelReaderPubkey, event, expirationSeconds = EXPIRATION_SECONDS }) {
  if (!nymSigner?.getPublicKey || !nymSigner?.signEvent) throw new Error('NYM_SIGNER_REQUIRED')
  if (!privateChannelSigner?.getPublicKey || !privateChannelSigner?.nip44Encrypt || !privateChannelSigner?.signEvent) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')

  const nymPubkey = await nymSigner.getPublicKey()
  const channelPubkey = await privateChannelSigner.getPublicKey()
  const channelReaderPubkey = privateChannelReaderPubkey || channelPubkey
  const wireEvent = isSignedEvent(event)
    ? assertValidSignedInnerEvent(event)
    : wireNymRumor({ ...event, created_at: event?.created_at !== undefined ? event.created_at : nowSeconds() })
  const innerEvent = isSignedEvent(wireEvent) ? wireEvent : normalizeNymRumor(wireEvent, nymPubkey)
  const encoded = bytesToBase64(encoder.encode(JSON.stringify(wireEvent)))
  const total = Math.max(1, Math.ceil(encoded.length / NYM_CARRIER_CHUNK_CHARS))
  const carrierCreatedAt = nowSeconds()

  for (let index = 0; index < total; index++) {
    const carrier = assertValidNymCarrierEvent(await nymSigner.signEvent(makeNymCarrierEvent({
      innerId: innerEvent.id,
      chunkIndex: index,
      chunkTotal: total,
      content: encoded.slice(index * NYM_CARRIER_CHUNK_CHARS, (index + 1) * NYM_CARRIER_CHUNK_CHARS),
      createdAt: carrierCreatedAt
    })))
    const outer = await privateChannelSigner.signEvent({
      kind: PRIVATE_BROADCAST_KIND,
      created_at: nowSeconds(),
      tags: [['expiration', String(nowSeconds() + expirationSeconds)]],
      content: await privateChannelSigner.nip44Encrypt(channelReaderPubkey, JSON.stringify(carrier))
    })
    if (eventByteLength(outer) > MAX_EVENT_BYTES) throw new Error('EVENT_TOO_LARGE')
    yield outer
  }
}

export async function wrapNymEvent (options) {
  const events = []
  for await (const event of wrapNymEvents(options)) events.push(event)
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

function normalizeNymRumor (event, pubkey) {
  const normalized = { ...event, pubkey }
  if (!validateEvent(normalized)) throw new Error('INVALID_NYM_RUMOR')
  return { ...normalized, id: getEventHash(normalized) }
}

function wireNymRumor (event = {}) {
  return {
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    created_at: event.created_at
  }
}

function assertValidNymCarrierEvent (carrier) {
  if (!validateEvent(carrier) || carrier.id !== getEventHash(carrier) || !verifyEvent(carrier)) {
    throw new Error('INVALID_NYM_CARRIER')
  }
  if (carrier.kind !== NYM_CARRIER_KIND) throw new Error('INVALID_NYM_CARRIER_KIND')
  if (!readIdTag(carrier)) throw new Error('MISSING_NYM_CARRIER_ID')
  readChunkTag(carrier)
  return carrier
}

function nymCarrierGroupId (carrier) {
  return `nym:${carrier.pubkey}:${readIdTag(carrier)}:${readChunkTag(carrier).total}`
}

function validateNymCarriers (carriers) {
  if (!Array.isArray(carriers) || !carriers.length) throw new Error('NYM_CARRIERS_REQUIRED')
  const chunks = []
  let nymPubkey = ''
  let innerId = ''
  let total = 0

  for (const carrier of carriers) {
    assertValidNymCarrierEvent(carrier)
    const nextInnerId = readIdTag(carrier)
    const { index, total: nextTotal } = readChunkTag(carrier)
    if (!nymPubkey) {
      nymPubkey = carrier.pubkey
      innerId = nextInnerId
      total = nextTotal
    }
    if (carrier.pubkey !== nymPubkey || nextInnerId !== innerId || nextTotal !== total) {
      throw new Error('MISMATCHED_NYM_CARRIER_CHUNKS')
    }
    if (chunks[index] !== undefined) throw new Error('DUPLICATE_NYM_CARRIER_CHUNK')
    chunks[index] = carrier.content
  }

  if (chunks.length !== total) throw new Error('MISSING_NYM_CARRIER_CHUNK')
  for (let index = 0; index < total; index++) {
    if (chunks[index] == null) throw new Error('MISSING_NYM_CARRIER_CHUNK')
  }
  return { nymPubkey, innerId, content: chunks.join('') }
}

export function eventFromNymCarriers (carriers) {
  const { nymPubkey, innerId, content } = validateNymCarriers(carriers)
  let parsed
  try {
    parsed = JSON.parse(decoder.decode(base64ToBytes(content)))
  } catch {
    throw new Error('INVALID_NYM_CARRIER_PAYLOAD')
  }

  if (isSignedEvent(parsed)) {
    const event = assertValidSignedInnerEvent(parsed)
    if (event.id !== innerId) throw new Error('INVALID_NYM_CARRIER_INNER_ID')
    return event
  }

  const event = normalizeNymRumor(parsed, nymPubkey)
  if (event.id !== innerId) throw new Error('INVALID_NYM_CARRIER_INNER_ID')
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
    let ownContentSigner = null
    if (envelope.iykcPubkey) {
      assertValidEnvelopeIykcProof(envelope)
      ownContentSigner = iykcSigner?.getPublicKey && await iykcSigner.getPublicKey() === envelope.iykcPubkey
        ? iykcSigner
        : null
    }
    plaintext = (await receiverSigner.nip44DecryptMultiDH({
      peerPubkey: senderPubkey,
      peerContentPubkey: imkcPubkey,
      ownContentSigner,
      ownContentPubkey: envelope.iykcPubkey || '',
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

function receiverPubkeyFor (receiver) {
  return receiverPubkeys([receiver])[0] || ''
}

function relayReceiverEntries (relayToReceivers) {
  if (!relayToReceivers) return []
  if (relayToReceivers instanceof Map) return [...relayToReceivers.entries()]
  if (typeof relayToReceivers === 'object') return Object.entries(relayToReceivers)
  throw new Error('INVALID_RELAY_RECEIVERS')
}

function groupedRelayReceivers ({ relayToReceivers, receivers }) {
  const entries = relayReceiverEntries(relayToReceivers)
  if (!entries.length) return null

  const receiverByPubkey = new Map()
  const orderedPubkeys = []
  for (const receiver of receivers || []) {
    const pubkey = receiverPubkeyFor(receiver)
    if (!pubkey || receiverByPubkey.has(pubkey)) continue
    receiverByPubkey.set(pubkey, receiver)
    orderedPubkeys.push(pubkey)
  }

  const wanted = new Set(orderedPubkeys)
  const covered = new Set()
  const groupsByKey = new Map()
  for (const [relay, value] of entries) {
    if (!relay) continue
    const pubkeys = uniq(Array.isArray(value) ? value : [value])
    if (!pubkeys.length) continue
    for (const pubkey of pubkeys) {
      if (!wanted.has(pubkey)) throw new Error('RELAY_RECEIVER_NOT_REQUESTED')
      covered.add(pubkey)
    }
    const key = [...pubkeys].sort().join(',')
    if (!groupsByKey.has(key)) {
      const set = new Set(pubkeys)
      groupsByKey.set(key, {
        pubkeys: set,
        relays: []
      })
    }
    groupsByKey.get(key).relays.push(relay)
  }

  if (!groupsByKey.size) throw new Error('NO_RELAYS')
  for (const pubkey of orderedPubkeys) {
    if (!covered.has(pubkey)) throw new Error('RELAY_RECEIVER_MISSING')
  }

  return [...groupsByKey.values()].map(group => ({
    relays: uniq(group.relays),
    receivers: orderedPubkeys
      .filter(pubkey => group.pubkeys.has(pubkey))
      .map(pubkey => receiverByPubkey.get(pubkey))
  }))
}

function relaysFromRelayReceivers (relayToReceivers) {
  return uniq(relayReceiverEntries(relayToReceivers).map(([relay]) => relay))
}

export async function publish ({ senderSigner, imkcSigner, privateChannelSigner = senderSigner, privateChannelReaderPubkey, receivers, receiverTag, event, relays, relayToReceivers, expirationSeconds, _getIykcProofs = getIykcProofs, _publish = publishToRelays }) {
  const results = []
  // Relays are grouped only when they have the exact same recipient pubkey set
  const groups = groupedRelayReceivers({ relayToReceivers, receivers })
  if (groups) {
    for (const group of groups) {
      for await (const wrappedEvent of wrapEvents({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers: group.receivers, receiverTag, event, expirationSeconds, _getIykcProofs })) {
        results.push(await _publish(wrappedEvent, group.relays))
      }
    }
    return { results }
  }

  for await (const wrappedEvent of wrapEvents({ senderSigner, imkcSigner, privateChannelSigner, privateChannelReaderPubkey, receivers, receiverTag, event, expirationSeconds, _getIykcProofs })) {
    results.push(await _publish(wrappedEvent, relays))
  }
  return { results }
}

export async function publishNymEvent ({ nymSigner, privateChannelSigner, privateChannelReaderPubkey, event, relays, relayToReceivers, expirationSeconds, _publish = publishToRelays }) {
  const results = []
  const publishRelays = relayToReceivers ? relaysFromRelayReceivers(relayToReceivers) : relays
  for await (const wrappedEvent of wrapNymEvents({ nymSigner, privateChannelSigner, privateChannelReaderPubkey, event, expirationSeconds })) {
    results.push(await _publish(wrappedEvent, publishRelays))
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
  onNymEvent,
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

      const decrypted = await decryptRouter({
        content: outer.content,
        channelPubkey,
        channelSigner,
        channelReaderSigner,
        channelReaderPubkey
      })
      if (decrypted.kind === NYM_CARRIER_KIND) {
        const carrier = assertValidNymCarrierEvent(decrypted)
        const { index, total } = readChunkTag(carrier)
        groupKey = receivedChunks.groupKeyFor(channelPubkey, nymCarrierGroupId(carrier))
        if (ignoredGroups.has(groupKey)) return

        const meta = receivedChunks.put({
          channelPubkey,
          routerPubkey: nymCarrierGroupId(carrier),
          index,
          total,
          content: JSON.stringify(carrier)
        })
        const status = receivedChunks.status(meta)
        onChunk?.({
          outer,
          nymCarrier: carrier,
          channelPubkey,
          index,
          total,
          received: status.received,
          missing: status.missing
        })
        if (status.received < total) return

        const carriers = receivedChunks.readChunkContents(groupKey).map(raw => JSON.parse(raw))
        const event = eventFromNymCarriers(carriers)
        const shouldSeed = storesRecoverySeeds(channelMode)
        if (shouldSeed) {
          await onSeedEvent?.({
            recordType: 'nymCarrier_v1',
            outer,
            carriers,
            carrier: carriers[0],
            channelPubkey,
            event
          })
        }
        await onNymEvent?.(event, outer, {
          carrier: carriers[0],
          carriers,
          channelPubkey
        })
        receivedChunks.removeGroup(groupKey)
        return
      }
      const router = decrypted
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
      const innerEventIdsByRowIndex = {}

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
              if (event) {
                innerEventIdsByRowIndex[rowIndex] = event.id
                if (!mustScanWholeBundle) return { stop: true }
              }
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
      if (shouldSeed) await onSeedEvent?.({ recordType: 'routerRow_v1', outer, router: completeRouter, channelPubkey, jsonl, innerEventIdsByRowIndex })
      if (event) await onEvent?.(event, outer, { router: completeRouter, channelPubkey, jsonl })

      receivedChunks.removeGroup(groupKey)
    } catch (err) {
      if (shouldIgnoreGroupError(err) && groupKey) {
        ignoredGroups.add(groupKey)
        receivedChunks.removeGroup(groupKey)
      }
      onError?.(err)
    }
  }
}

function shouldIgnoreGroupError (err) {
  return [
    'DUPLICATE_NYM_CARRIER_CHUNK',
    'INVALID_IYKC_PROOF',
    'INVALID_IMKC_PROOF',
    'INVALID_NYM_CARRIER',
    'INVALID_NYM_CARRIER_ID',
    'INVALID_NYM_CARRIER_INNER_ID',
    'INVALID_NYM_CARRIER_KIND',
    'INVALID_NYM_CARRIER_PAYLOAD',
    'INVALID_NYM_RUMOR',
    'INVALID_SIGNED_INNER_EVENT',
    'MISMATCHED_NYM_CARRIER_CHUNKS',
    'MISSING_NYM_CARRIER_CHUNK',
    'MISSING_NYM_CARRIER_ID'
  ].includes(err?.message)
}

export async function fetch ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelReaderSigner = privateChannelSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onNymEvent, onSeedEvent, onContentKeyUsage, onError, since, until, limit, mode = 'leecher', modeByPubkey, receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS, receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES, receivedChunkStorageArea, ignoredGroupTtlMs = DEFAULT_IGNORED_GROUP_TTL_MS, ignoredGroupMaxEntries = DEFAULT_IGNORED_GROUP_MAX_ENTRIES }) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys })
  const filter = { kinds: [PRIVATE_BROADCAST_KIND] }
  if (authors.length) filter.authors = authors
  if (since != null) filter.since = since
  if (until != null) filter.until = until
  if (limit != null) filter.limit = limit

  const events = await fetchEvents(filter, relays)
  events.sort((a, b) => a.created_at - b.created_at)
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, privateChannelReaderSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onNymEvent, onSeedEvent, onContentKeyUsage, onError, receivedChunkTtlMs, receivedChunkMaxBytes, receivedChunkStorageArea, ignoredGroupTtlMs, ignoredGroupMaxEntries })
  for (const event of events) await processOuterEvent(event)
  return events
}

export function subscribe ({ receiverSigner, iykcSigner, privateChannelSigner = receiverSigner, privateChannelSignersByPubkey, privateChannelReaderSigner = privateChannelSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, privateChannelPubkey, privateChannelPubkeys, receiverPubkey, relays, onChunk, onEvent, onNymEvent, onSeedEvent, onContentKeyUsage, onError, onEose, since = nowSeconds() - 5, limit, liveOnly = false, mode = 'leecher', modeByPubkey, receivedChunkTtlMs = DEFAULT_RECEIVED_CHUNK_TTL_MS, receivedChunkMaxBytes = DEFAULT_RECEIVED_CHUNK_MAX_BYTES, receivedChunkStorageArea, ignoredGroupTtlMs = DEFAULT_IGNORED_GROUP_TTL_MS, ignoredGroupMaxEntries = DEFAULT_IGNORED_GROUP_MAX_ENTRIES }) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  if (receiverSigner && !receiverSigner?.nip44Decrypt) throw new Error('RECEIVER_SIGNER_NIP44_DECRYPT_UNSUPPORTED')
  if (!privateChannelReaderSigner && !privateChannelReaderSignersByPubkey && !privateChannelSigner && !privateChannelSignersByPubkey) throw new Error('PRIVATE_CHANNEL_READER_REQUIRED')

  const authors = privateChannelPubkeyList({ privateChannelPubkey, privateChannelPubkeys })
  const filter = { kinds: [PRIVATE_BROADCAST_KIND], since }
  if (authors.length) filter.authors = authors
  if (limit != null) filter.limit = limit
  const processOuterEvent = createProcessor({ receiverSigner, iykcSigner, privateChannelSigner, privateChannelSignersByPubkey, privateChannelReaderSigner, privateChannelReaderSignersByPubkey, privateChannelReaderPubkey, privateChannelReaderPubkeysByPubkey, receiverPubkey, mode, modeByPubkey, onChunk, onEvent, onNymEvent, onSeedEvent, onContentKeyUsage, onError, receivedChunkTtlMs, receivedChunkMaxBytes, receivedChunkStorageArea, ignoredGroupTtlMs, ignoredGroupMaxEntries })
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
