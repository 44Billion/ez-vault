import { getEventHash, validateEvent } from 'nostr-tools'
import * as privateChannel from '../../services/private-channel/index.js'
import { onOnline } from '../network.js'

export const ASK_KIND = 7329
export const REPLY_KIND = 7330
export const TELL_KIND = 7331

const RESUBSCRIBE_GRACE_MS = 500
const PRIVATE_MESSAGE_KINDS = [ASK_KIND, REPLY_KIND, TELL_KIND]

const watchesByChannel = new Map()
const subsByRelay = new Map()
let stopOnlineWatcher = null

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function uniq (values) {
  return [...new Set((values || []).filter(Boolean))]
}

function setEquals (a, b) {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

function normalizePayloadContent (payload) {
  if (payload == null || payload === '') return ''
  if (typeof payload === 'string') return payload
  return JSON.stringify(payload)
}

function normalizeMessage (message = {}) {
  if (typeof message === 'string') return { content: normalizePayloadContent(message), code: '', error: '' }
  const hasPayload = Object.prototype.hasOwnProperty.call(message, 'payload')
  const payload = hasPayload ? message.payload : message.content
  return {
    content: normalizePayloadContent(payload),
    code: message.code == null ? '' : String(message.code),
    error: message.error == null ? '' : String(message.error)
  }
}

function addHeaderTag (tags, { code, error }) {
  const out = cloneTags(tags)
  if (!code && !error) return out
  const header = ['h', code || '']
  if (error) header.push(error)
  return out.concat([header])
}

function makeMessageRumor ({ kind, tags, message }) {
  const normalized = normalizeMessage(message)
  return {
    kind,
    tags: addHeaderTag(tags, normalized),
    content: normalized.content
  }
}

function parsePayloadContent (content) {
  if (content === '') return null
  try { return JSON.parse(content) } catch { return content }
}

function parseMessageContent (event) {
  const payload = parsePayloadContent(event.content)
  const header = event.tags?.find(tag => tag[0] === 'h') || []
  const message = {}
  if (payload !== null) message.payload = payload
  if (header[1]) message.code = header[1]
  if (header[2]) message.error = header[2]
  return message
}

export function parseRumorContent (event) {
  if (PRIVATE_MESSAGE_KINDS.includes(event.kind)) return parseMessageContent(event)
  return parsePayloadContent(event.content)
}

function cloneTags (tags) {
  if (!Array.isArray(tags)) return tags
  return tags.map(tag => Array.isArray(tag) ? [...tag] : tag)
}

async function makeOutgoingRumor ({ senderSigner, rumor }) {
  if (!senderSigner?.getPublicKey) throw new Error('SENDER_SIGNER_REQUIRED')
  const senderPubkey = await senderSigner.getPublicKey()
  // This is what gets sent. Id and pubkey are added later by recipient.
  const wireEvent = {
    kind: rumor.kind,
    tags: cloneTags(rumor.tags),
    content: rumor.content,
    created_at: rumor.created_at !== undefined
      ? rumor.created_at
      : nowSeconds()
  }
  const event = normalizeRumor(wireEvent, senderPubkey)
  return { event, wireEvent }
}

function normalizeRumor (event, pubkey) {
  const normalized = { ...event, pubkey }
  if (!validateEvent(normalized)) throw new Error('INVALID_RUMOR')
  return { ...normalized, id: getEventHash(normalized) }
}

function readTag (event, name) {
  return event.tags?.find(tag => tag[0] === name)?.[1] || ''
}

async function ownPrivateChannelPubkey (signer) {
  if (!signer?.getPublicKey) throw new Error('PRIVATE_CHANNEL_SIGNER_REQUIRED')
  return signer.getPublicKey()
}

function assertWatching (channelPubkey) {
  if (!watchesByChannel.has(channelPubkey)) throw new Error('PRIVATE_MESSAGE_NOT_WATCHING')
}

function watchCallbacks (channelPubkey) {
  return watchesByChannel.get(channelPubkey)?.callbacks || {}
}

function dispatchWatchedEvent (event, outer, meta) {
  const callbacks = watchCallbacks(meta.channelPubkey)
  const payload = parseRumorContent(event)
  const message = { event, outer, meta, payload }

  if (event.kind === ASK_KIND) {
    callbacks.onAsk?.({ ...message, question: event })
  } else if (event.kind === REPLY_KIND) {
    const questionId = readTag(event, 'q')
    callbacks.onReply?.({ ...message, questionId, reply: event })
  } else if (event.kind === TELL_KIND) {
    const receiverTag = readTag(event, 'r')
    if (receiverTag) callbacks.onTell?.({ ...message, tell: event })
    else callbacks.onYell?.({ ...message, yell: event })
  }

  callbacks.onMessage?.(message)
}

function dispatchSeedEvent (seed) {
  watchCallbacks(seed.channelPubkey).onSeed?.(seed)
}

function dispatchContentKeyUsage (usage) {
  watchCallbacks(usage.channelPubkey).onContentKeyUsage?.(usage)
}

function recordSeen (channelPubkey, createdAt) {
  const watch = watchesByChannel.get(channelPubkey)
  if (!watch) return
  watch.lastSeenAt = Math.max(watch.lastSeenAt || 0, createdAt || 0)
}

function handleChunk (chunk) {
  watchCallbacks(chunk.channelPubkey).onChunk?.(chunk)
}

function desiredRelayState () {
  const relayToChannels = new Map()
  for (const [channelPubkey, watch] of watchesByChannel) {
    for (const relay of watch.relays) {
      if (!relayToChannels.has(relay)) relayToChannels.set(relay, new Set())
      relayToChannels.get(relay).add(channelPubkey)
    }
  }
  return relayToChannels
}

function signersForChannels (channels) {
  const out = {}
  for (const channel of channels) {
    const signer = watchesByChannel.get(channel)?.privateChannelSigner
    if (signer) out[channel] = signer
  }
  return out
}

function modesForChannels (channels) {
  const out = {}
  for (const channel of channels) out[channel] = watchesByChannel.get(channel)?.mode || 'leecher'
  return out
}

function rebuildSubscriptions ({ _subscribe = privateChannel.subscribe } = {}) {
  const desired = desiredRelayState()

  for (const [relay, current] of subsByRelay) {
    const nextChannels = desired.get(relay)
    if (nextChannels && setEquals(current.channels, nextChannels)) continue
    if (!nextChannels) {
      current.sub.close()
      subsByRelay.delete(relay)
    }
  }

  for (const [relay, channels] of desired) {
    const current = subsByRelay.get(relay)
    if (current && setEquals(current.channels, channels)) continue

    const channelList = [...channels]
    const firstWatch = watchesByChannel.get(channelList[0])
    const sub = _subscribe({
      receiverSigner: firstWatch.receiverSigner,
      iykcSigner: firstWatch.iykcSigner,
      privateChannelSigner: firstWatch.privateChannelSigner,
      privateChannelSignersByPubkey: signersForChannels(channelList),
      privateChannelPubkeys: channelList,
      receiverPubkey: firstWatch.receiverPubkey,
      relays: [relay],
      mode: firstWatch.mode,
      modeByPubkey: modesForChannels(channelList),
      limit: 0,
      since: nowSeconds(),
      liveOnly: true,
      onChunk: handleChunk,
      onEvent: (event, outer, meta) => {
        recordSeen(meta.channelPubkey, outer.created_at)
        dispatchWatchedEvent(event, outer, meta)
      },
      onSeedEvent: (seed) => {
        recordSeen(seed.channelPubkey, seed.outer.created_at)
        dispatchSeedEvent(seed)
      },
      onContentKeyUsage: dispatchContentKeyUsage,
      onError: err => firstWatch.callbacks.onError?.(err)
    })

    subsByRelay.set(relay, { channels: new Set(channels), sub })
    if (current) setTimeout(() => current.sub.close(), RESUBSCRIBE_GRACE_MS)
  }
}

async function recoverWatchedChannels ({ _fetch = privateChannel.fetch } = {}) {
  for (const [channelPubkey, watch] of watchesByChannel) {
    await _fetch({
      receiverSigner: watch.receiverSigner,
      iykcSigner: watch.iykcSigner,
      privateChannelSigner: watch.privateChannelSigner,
      privateChannelSignersByPubkey: { [channelPubkey]: watch.privateChannelSigner },
      privateChannelPubkeys: [channelPubkey],
      receiverPubkey: watch.receiverPubkey,
      relays: watch.relays,
      since: Math.max(0, (watch.lastSeenAt || watch.since || nowSeconds()) - 1),
      mode: watch.mode,
      modeByPubkey: { [channelPubkey]: watch.mode },
      onChunk: handleChunk,
      onEvent: (event, outer, meta) => {
        watch.lastSeenAt = Math.max(watch.lastSeenAt || 0, outer.created_at || 0)
        dispatchWatchedEvent(event, outer, meta)
      },
      onSeedEvent: dispatchSeedEvent,
      onContentKeyUsage: dispatchContentKeyUsage,
      onError: err => watch.callbacks.onError?.(err)
    })
  }
}

function ensureOnlineRecovery () {
  if (stopOnlineWatcher || typeof window === 'undefined') return
  stopOnlineWatcher = onOnline(async () => {
    rebuildSubscriptions()
    await recoverWatchedChannels()
  })
}

export async function watch ({
  channels,
  relays,
  receiverSigner,
  iykcSigner,
  privateChannelSigner = receiverSigner,
  receiverPubkey,
  mode = 'leecher',
  onAsk,
  onReply,
  onTell,
  onYell,
  onMessage,
  onSeed,
  onChunk,
  onContentKeyUsage,
  onError,
  since = nowSeconds(),
  _subscribe = privateChannel.subscribe
}) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  const channelList = uniq(channels?.length ? channels : [await ownPrivateChannelPubkey(privateChannelSigner)])
  const ownPubkey = receiverPubkey || await receiverSigner?.getPublicKey?.()
  const callbacks = { onAsk, onReply, onTell, onYell, onMessage, onSeed, onChunk, onContentKeyUsage, onError }

  let changed = false
  for (const channel of channelList) {
    const next = {
      relays: uniq(relays),
      receiverSigner,
      iykcSigner,
      privateChannelSigner,
      receiverPubkey: ownPubkey,
      mode,
      callbacks,
      since,
      lastSeenAt: since
    }
    const current = watchesByChannel.get(channel)
    if (current && setEquals(new Set(current.relays), new Set(next.relays)) && current.mode === next.mode) {
      current.callbacks = callbacks
      continue
    }
    watchesByChannel.set(channel, next)
    changed = true
  }

  if (changed) rebuildSubscriptions({ _subscribe })
  ensureOnlineRecovery()
  return () => unwatch(channelList)
}

export function unwatch (channels) {
  const channelList = channels ? uniq(Array.isArray(channels) ? channels : [channels]) : [...watchesByChannel.keys()]
  for (const channel of channelList) watchesByChannel.delete(channel)
  rebuildSubscriptions()
  if (!watchesByChannel.size && stopOnlineWatcher) {
    stopOnlineWatcher()
    stopOnlineWatcher = null
  }
}

export function clearChannelState (channelPubkey) {
  if (watchesByChannel.has(channelPubkey)) unwatch(channelPubkey)
}

async function sendPrivateMessage ({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  receivers,
  receiverTag,
  event,
  relays,
  expirationSeconds,
  _publish = privateChannel.publish
}) {
  return _publish({ senderSigner, imkcSigner, privateChannelSigner, receivers, receiverTag, event, relays, expirationSeconds })
}

export async function ask ({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  receiverPubkey,
  relays,
  message,
  code,
  payload,
  error,
  content,
  expirationSeconds,
  _publish = privateChannel.publish
}) {
  if (!receiverPubkey) throw new Error('RECEIVER_PUBKEY_REQUIRED')
  const privateChannelPubkey = await ownPrivateChannelPubkey(privateChannelSigner)
  assertWatching(privateChannelPubkey)

  const { event: question, wireEvent } = await makeOutgoingRumor({
    senderSigner,
    rumor: makeMessageRumor({
      kind: ASK_KIND,
      tags: [['r', receiverPubkey]],
      message: message || { code, payload, error, content }
    })
  })
  const results = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, receivers: [receiverPubkey], receiverTag: receiverPubkey, event: wireEvent, relays, expirationSeconds, _publish })

  return { question, results }
}

export async function reply ({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  question,
  receiverPubkey = question?.pubkey,
  relays,
  message,
  code,
  payload,
  error,
  content,
  expirationSeconds,
  _publish = privateChannel.publish
}) {
  if (!question?.id) throw new Error('QUESTION_REQUIRED')
  if (!receiverPubkey) throw new Error('RECEIVER_PUBKEY_REQUIRED')
  const { event, wireEvent } = await makeOutgoingRumor({
    senderSigner,
    rumor: makeMessageRumor({
      kind: REPLY_KIND,
      tags: [['q', question.id], ['r', receiverPubkey]],
      message: message || { code, payload, error, content }
    })
  })
  const results = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, receivers: [receiverPubkey], receiverTag: receiverPubkey, event: wireEvent, relays, expirationSeconds, _publish })
  return { reply: event, results }
}

export async function tell ({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  receiverPubkey,
  relays,
  message,
  code,
  payload,
  error,
  content,
  expirationSeconds,
  _publish = privateChannel.publish
}) {
  if (!receiverPubkey) throw new Error('RECEIVER_PUBKEY_REQUIRED')
  const { event, wireEvent } = await makeOutgoingRumor({
    senderSigner,
    rumor: makeMessageRumor({
      kind: TELL_KIND,
      tags: [['r', receiverPubkey]],
      message: message || { code, payload, error, content }
    })
  })
  const results = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, receivers: [receiverPubkey], receiverTag: receiverPubkey, event: wireEvent, relays, expirationSeconds, _publish })
  return { tell: event, results }
}

export async function yell ({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  receiverPubkeys,
  relays,
  message,
  code,
  payload,
  error,
  content,
  expirationSeconds,
  _publish = privateChannel.publish
}) {
  const receivers = uniq(receiverPubkeys)
  if (!receivers.length) throw new Error('NO_RECEIVERS')
  const { event, wireEvent } = await makeOutgoingRumor({
    senderSigner,
    rumor: makeMessageRumor({
      kind: TELL_KIND,
      tags: [],
      message: message || { code, payload, error, content }
    })
  })
  const results = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, receivers, receiverTag: '', event: wireEvent, relays, expirationSeconds, _publish })
  return { yell: event, results }
}

export async function broadcastRumor ({
  senderSigner,
  imkcSigner,
  privateChannelSigner = senderSigner,
  receiverPubkeys,
  relays,
  rumor,
  expirationSeconds,
  _publish = privateChannel.publish
}) {
  const receivers = uniq(receiverPubkeys)
  if (!receivers.length) throw new Error('NO_RECEIVERS')
  const { event, wireEvent } = await makeOutgoingRumor({ senderSigner, rumor })
  const results = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, receivers, receiverTag: '', event: wireEvent, relays, expirationSeconds, _publish })
  return { rumor: event, results }
}
