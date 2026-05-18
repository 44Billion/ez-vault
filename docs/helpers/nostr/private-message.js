import { getEventHash } from 'nostr-tools'
import * as privateChannel from '../../services/private-channel/index.js'
import { isOnline, onOnline } from '../network.js'

export const ASK_KIND = 7329
export const REPLY_KIND = 7330
export const TELL_KIND = 7331

const BOGUS_PUBKEY = '0'.repeat(64)
const PENDING_ASKS_KEY = 'ez-vault:private-message:pending-asks'
const DEFAULT_RETRY_INTERVAL_MS = 2 * 60 * 1000
const DEFAULT_RETRY_LIMIT = 3
const RESUBSCRIBE_GRACE_MS = 500

const watchesByChannel = new Map()
const subsByRelay = new Map()
const pendingAsks = new Map()
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

function normalizeContent (message = {}) {
  if (typeof message === 'string') return message
  if (message.content != null) return String(message.content)
  const content = {}
  if (message.code) content.code = message.code
  if ('payload' in message) content.payload = message.payload
  if ('error' in message) content.error = message.error
  return JSON.stringify(content)
}

function parseContent (event) {
  try { return JSON.parse(event.content) } catch { return event.content }
}

function eventWithId (event) {
  const id = getEventHash(event)
  return { ...event, id }
}

function makeRumor ({ kind, content, tags = [], createdAt = nowSeconds(), id }) {
  const event = {
    kind,
    pubkey: BOGUS_PUBKEY,
    created_at: createdAt,
    tags,
    content
  }
  return id ? { ...event, id } : eventWithId(event)
}

function readTag (event, name) {
  return event.tags?.find(tag => tag[0] === name)?.[1] || ''
}

function storedPendingAsks () {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_ASKS_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function restoreStoredPendingAsks () {
  for (const [id, ask] of Object.entries(storedPendingAsks())) {
    if (!ask?.question || !ask.receiverPubkey || !ask.privateChannelPubkey) continue
    pendingAsks.set(id, {
      id,
      question: ask.question,
      receiverPubkey: ask.receiverPubkey,
      receiverTag: ask.receiverTag || ask.receiverPubkey,
      relays: ask.relays || [],
      retryLimit: ask.retryLimit || DEFAULT_RETRY_LIMIT,
      retryIntervalMs: ask.retryIntervalMs || DEFAULT_RETRY_INTERVAL_MS,
      retryCount: ask.retryCount || 0,
      missingChunks: ask.missingChunks || {},
      privateChannelPubkey: ask.privateChannelPubkey,
      senderSigner: null,
      imkcSigner: null,
      privateChannelSigner: null,
      publish: privateChannel.publish,
      retryEnabled: true,
      shouldStore: true,
      retryTimer: null
    })
  }
}

function writeStoredPendingAsks () {
  if (typeof localStorage === 'undefined') return
  const out = {}
  for (const [id, ask] of pendingAsks) {
    if (!ask.shouldStore) continue
    out[id] = {
      question: ask.question,
      receiverPubkey: ask.receiverPubkey,
      receiverTag: ask.receiverTag,
      relays: ask.relays,
      retryCount: ask.retryCount,
      retryLimit: ask.retryLimit,
      retryIntervalMs: ask.retryIntervalMs,
      missingChunks: ask.missingChunks,
      privateChannelPubkey: ask.privateChannelPubkey
    }
  }
  if (Object.keys(out).length) localStorage.setItem(PENDING_ASKS_KEY, JSON.stringify(out))
  else localStorage.removeItem(PENDING_ASKS_KEY)
}

restoreStoredPendingAsks()

function clearRetryTimer (ask) {
  clearTimeout(ask.retryTimer)
  ask.retryTimer = null
}

function forgetAsk (id) {
  const ask = pendingAsks.get(id)
  if (!ask) return
  clearRetryTimer(ask)
  pendingAsks.delete(id)
  writeStoredPendingAsks()
}

function retryQuestionEvent (ask) {
  const missingChunks = Object.keys(ask.missingChunks || {}).length ? ask.missingChunks : null
  if (!missingChunks) return ask.question

  const parsed = parseContent(ask.question)
  const content = typeof parsed === 'string'
    ? JSON.stringify({ payload: parsed, missingChunks })
    : JSON.stringify({ ...parsed, missingChunks })
  return { ...ask.question, content, id: ask.question.id }
}

function scheduleAskRetry (ask) {
  clearRetryTimer(ask)
  if (!ask.retryLimit || ask.retryCount >= ask.retryLimit) {
    ask.shouldStore = false
    writeStoredPendingAsks()
    return
  }
  ask.retryTimer = setTimeout(() => retryAsk(ask.id), ask.retryIntervalMs)
}

async function retryAsk (id) {
  const ask = pendingAsks.get(id)
  if (!ask) return

  ask.retryCount++
  writeStoredPendingAsks()

  try {
    if (await isOnline()) {
      await ask.publish({
        senderSigner: ask.senderSigner,
        imkcSigner: ask.imkcSigner,
        privateChannelSigner: ask.privateChannelSigner,
        receivers: [ask.receiverPubkey],
        receiverTag: ask.receiverTag,
        event: retryQuestionEvent(ask),
        relays: ask.relays
      })
    }
  } catch (err) {
    console.warn('private-message ask retry failed', err?.message ?? err)
  }

  writeStoredPendingAsks()
  scheduleAskRetry(ask)
}

function resetAskRetriesForChannel (channelPubkey, missingChunks = null) {
  for (const ask of pendingAsks.values()) {
    if (ask.privateChannelPubkey !== channelPubkey) continue
    ask.retryCount = 0
    if (ask.retryEnabled) ask.shouldStore = true
    if (missingChunks?.routerPubkey) ask.missingChunks[missingChunks.routerPubkey] = missingChunks.missing
    scheduleAskRetry(ask)
  }
  writeStoredPendingAsks()
}

function attachPendingAsksForChannel ({ channelPubkey, senderSigner, imkcSigner, privateChannelSigner }) {
  for (const ask of pendingAsks.values()) {
    if (ask.privateChannelPubkey !== channelPubkey) continue
    // Restored asks only keep serializable state, so watching the channel is
    // where we reattach the live signer objects needed to retry publishing.
    ask.senderSigner ||= senderSigner
    ask.imkcSigner ||= imkcSigner
    ask.privateChannelSigner ||= privateChannelSigner
    ask.publish ||= privateChannel.publish
    if (ask.retryEnabled) {
      ask.shouldStore = true
      scheduleAskRetry(ask)
    }
  }
  writeStoredPendingAsks()
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
  const payload = parseContent(event)
  const message = { event, outer, meta, payload }

  if (event.kind === ASK_KIND) {
    callbacks.onAsk?.({ ...message, question: event })
  } else if (event.kind === REPLY_KIND) {
    const questionId = readTag(event, 'q')
    const pending = pendingAsks.get(questionId)
    if (pending) forgetAsk(questionId)
    callbacks.onReply?.({ ...message, question: pending?.question || null, reply: event })
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

function recordSeen (channelPubkey, createdAt) {
  const watch = watchesByChannel.get(channelPubkey)
  if (!watch) return
  watch.lastSeenAt = Math.max(watch.lastSeenAt || 0, createdAt || 0)
}

function handleChunk (chunk) {
  resetAskRetriesForChannel(chunk.channelPubkey, {
    routerPubkey: chunk.router.pubkey,
    missing: chunk.missing
  })
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
  onError,
  since = nowSeconds(),
  _subscribe = privateChannel.subscribe
}) {
  if (!relays?.length) throw new Error('NO_RELAYS')
  const channelList = uniq(channels?.length ? channels : [await ownPrivateChannelPubkey(privateChannelSigner)])
  const ownPubkey = receiverPubkey || await receiverSigner?.getPublicKey?.()
  const callbacks = { onAsk, onReply, onTell, onYell, onMessage, onSeed, onChunk, onError }

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
    // These are our local signers under receiving names. For retrying asks we
    // use the same keys under sending names: receiverSigner -> senderSigner,
    // and iykcSigner (our content key) -> imkcSigner.
    attachPendingAsksForChannel({ channelPubkey: channel, senderSigner: receiverSigner, imkcSigner: iykcSigner, privateChannelSigner })
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
  for (const ask of pendingAsks.values()) {
    if (ask.privateChannelPubkey === channelPubkey) forgetAsk(ask.id)
  }
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
  _publish = privateChannel.publish
}) {
  return _publish({ senderSigner, imkcSigner, privateChannelSigner, receivers, receiverTag, event, relays })
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
  content,
  retry = true,
  retryLimit = DEFAULT_RETRY_LIMIT,
  retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
  _publish = privateChannel.publish
}) {
  if (!receiverPubkey) throw new Error('RECEIVER_PUBKEY_REQUIRED')
  const privateChannelPubkey = await ownPrivateChannelPubkey(privateChannelSigner)
  assertWatching(privateChannelPubkey)

  const question = makeRumor({
    kind: ASK_KIND,
    tags: [['r', receiverPubkey]],
    content: normalizeContent(message || { code, payload, content })
  })
  const results = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, receivers: [receiverPubkey], receiverTag: receiverPubkey, event: question, relays, _publish })

  const pending = {
    id: question.id,
    question,
    receiverPubkey,
    receiverTag: receiverPubkey,
    relays,
    retryLimit: retry ? retryLimit : 0,
    retryIntervalMs,
    retryCount: 0,
    missingChunks: {},
    privateChannelPubkey,
    senderSigner,
    imkcSigner,
    privateChannelSigner,
    publish: _publish,
    retryEnabled: retry && retryLimit > 0,
    shouldStore: retry && retryLimit > 0,
    retryTimer: null
  }
  pendingAsks.set(question.id, pending)
  if (pending.shouldStore) {
    writeStoredPendingAsks()
    scheduleAskRetry(pending)
  }

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
  content,
  _publish = privateChannel.publish
}) {
  if (!question?.id) throw new Error('QUESTION_REQUIRED')
  if (!receiverPubkey) throw new Error('RECEIVER_PUBKEY_REQUIRED')
  const event = makeRumor({
    kind: REPLY_KIND,
    tags: [['q', question.id], ['r', receiverPubkey]],
    content: normalizeContent(message || { code, payload, content })
  })
  const results = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, receivers: [receiverPubkey], receiverTag: receiverPubkey, event, relays, _publish })
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
  content,
  _publish = privateChannel.publish
}) {
  if (!receiverPubkey) throw new Error('RECEIVER_PUBKEY_REQUIRED')
  const event = makeRumor({
    kind: TELL_KIND,
    tags: [['r', receiverPubkey]],
    content: normalizeContent(message || { code, payload, content })
  })
  const results = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, receivers: [receiverPubkey], receiverTag: receiverPubkey, event, relays, _publish })
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
  content,
  _publish = privateChannel.publish
}) {
  const receivers = uniq(receiverPubkeys)
  if (!receivers.length) throw new Error('NO_RECEIVERS')
  const event = makeRumor({
    kind: TELL_KIND,
    tags: [],
    content: normalizeContent(message || { code, payload, content })
  })
  const results = await sendPrivateMessage({ senderSigner, imkcSigner, privateChannelSigner, receivers, receiverTag: '', event, relays, _publish })
  return { yell: event, results }
}
