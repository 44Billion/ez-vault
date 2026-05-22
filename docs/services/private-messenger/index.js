// Expected use:
// const messenger = await createPrivateMessenger({
//   userSigner,
//   contentKeySigner,
//   channels: [{ signer: privateChannelSigner, relays, mode: 'leecher', seeders: optionalSeederPubkeys }]
// })
// for await (const msg of messenger.messages()) handlePrivateMessage(msg)
// await messenger.ask({ receiverPubkey, payload: { ping: true } })
// await messenger.reply({ question: msg.question, payload: { ok: true } })
// await messenger.tell({ receiverPubkey, payload: { note: 'hello' } })
// await messenger.yell({ receiverPubkeys, payload: { notice: 'hello all' } })
// await messenger.sendEvent({ receiverPubkeys, event: { kind, tags: [], content } })
// await messenger.update({ channels: [{ signer: privateChannelSigner, relays, seeders: nextOptionalSeederPubkeys }] })
// messenger.clearChannel(channelPubkey)
//
// Missed-message recovery:
// - Each watched channel stores lastSeenAt/lastWatchedAt in localStorage.
// - Re-watching after reload fetches the gap from lastSeenAt to now.
// - Browser offline/online events add explicit offline ranges with a small skew.
// - Ranges older than 7 days are ignored; channel state not watched for 45 days is pruned.
// - Seeders announce presence every 10min and are used for the relay-uncovered left edge of a missed range.
// - Configured seeders are all asked; auto-discovered seeders are capped to the 8 most recently active.
// - Seeder channels store reconstructed router events in a separate web-storage queue and auto-reply to recovery asks.
// - Seeder replies can be streamed with createMissingMessageReplyPacker({ messenger, question }).update(seed), then finalize(optionalLastSeed).
// - For other event-list replies, use createEventReplyPacker({ messenger, question, code }).update(event).

import { bytesToBase64 } from '../../helpers/base64.js'
import * as privateMessage from '../../helpers/nostr/private-message.js'
import * as privateChannel from '../private-channel/index.js'
import { createQueue } from '../web-storage-queue.js'
import {
  compactSeedRouter,
  createEventReplyPacker,
  createMissingMessageReplyPacker,
  MISSING_MESSAGES_ASK_CODE,
  MISSING_MESSAGES_REPLY_CODE,
  SEEDER_PRESENCE_CODE
} from './recovery.js'

export { createQueue } from '../web-storage-queue.js'
export {
  compactSeedRouter,
  createEventReplyPacker,
  createMissingMessageReplyPacker,
  MISSING_MESSAGES_ASK_CODE,
  MISSING_MESSAGES_REPLY_CODE,
  SEEDER_PRESENCE_CODE
} from './recovery.js'

const DEFAULT_OFFLINE_RECOVERY_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_STALE_CHANNEL_SECONDS = 45 * 24 * 60 * 60
const DEFAULT_OFFLINE_SKEW_SECONDS = 30
const DEFAULT_RELOAD_GAP_DELAY_MS = 500
const DEFAULT_SEEDER_PRESENCE_INTERVAL_MS = 10 * 60 * 1000
const DEFAULT_SEEDER_ONLINE_SECONDS = 20 * 60
const DEFAULT_MAX_DYNAMIC_RECOVERY_SEEDERS = 8

const encoder = new TextEncoder()

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function uniq (values) {
  return [...new Set((values || []).filter(Boolean))]
}

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function parseJson (raw, fallback) {
  try { return JSON.parse(raw || '') } catch { return fallback }
}

export class PrivateMessenger {
  constructor ({
    offlineRecoverySeconds = DEFAULT_OFFLINE_RECOVERY_SECONDS,
    staleChannelSeconds = DEFAULT_STALE_CHANNEL_SECONDS,
    offlineSkewSeconds = DEFAULT_OFFLINE_SKEW_SECONDS,
    reloadGapDelayMs = DEFAULT_RELOAD_GAP_DELAY_MS,
    seederPresenceIntervalMs = DEFAULT_SEEDER_PRESENCE_INTERVAL_MS,
    seederOnlineSeconds = DEFAULT_SEEDER_ONLINE_SECONDS,
    maxDynamicRecoverySeeders = DEFAULT_MAX_DYNAMIC_RECOVERY_SEEDERS,
    _privateMessage = privateMessage,
    _privateChannel = privateChannel,
    _setTimeout = globalThis.setTimeout.bind(globalThis),
    _setInterval = globalThis.setInterval.bind(globalThis),
    _clearInterval = globalThis.clearInterval.bind(globalThis)
  } = {}) {
    this.offlineRecoverySeconds = offlineRecoverySeconds
    this.staleChannelSeconds = staleChannelSeconds
    this.offlineSkewSeconds = offlineSkewSeconds
    this.reloadGapDelayMs = reloadGapDelayMs
    this.seederPresenceIntervalMs = seederPresenceIntervalMs
    this.seederOnlineSeconds = seederOnlineSeconds
    this.maxDynamicRecoverySeeders = maxDynamicRecoverySeeders
    this._privateMessage = _privateMessage
    this._privateChannel = _privateChannel
    this._setTimeout = _setTimeout
    this._setInterval = _setInterval
    this._clearInterval = _clearInterval

    this.userSigner = null
    this.contentKeySigner = null
    this.userPubkey = ''
    this.prefix = ''
    this.queue = null
    this.seedQueue = null
    this.channels = new Map()
    this.stopByChannel = new Map()
    this.presenceTimers = new Map()
    this.stopOnline = null
    this.stopOffline = null
  }

  async init ({ userSigner, contentKeySigner, channels = [], relays = [], mode = 'leecher' }) {
    if (!userSigner?.getPublicKey) throw new Error('USER_SIGNER_REQUIRED')
    this.userSigner = userSigner
    this.contentKeySigner = contentKeySigner || null
    this.userPubkey = await userSigner.getPublicKey()
    this.prefix = `ez-vault:private-messenger:${this.userPubkey}`
    this.queue = createQueue({ prefix: this.prefix })
    this.seedQueue = createQueue({ prefix: `${this.prefix}:seeds` })
    this.cleanupStaleChannels()
    await this.update({ userSigner, contentKeySigner, channels, relays, mode })
    return this
  }

  async update ({ userSigner = this.userSigner, contentKeySigner = this.contentKeySigner, channels = [...this.channels.values()], relays = [], mode = 'leecher' } = {}) {
    if (userSigner) this.userSigner = userSigner
    this.contentKeySigner = contentKeySigner || null
    const nextChannels = await this.normalizeChannels(channels, { relays, mode })
    const nextPubkeys = new Set(nextChannels.map(channel => channel.pubkey))

    for (const pubkey of [...this.channels.keys()]) {
      if (!nextPubkeys.has(pubkey)) {
        this.unwatch(pubkey)
        this.channels.delete(pubkey)
      }
    }
    for (const channel of nextChannels) this.channels.set(channel.pubkey, channel)

    this.cleanupStaleChannels()
    await this.watch()
    await this.reconcilePresencePublishers()
    return this
  }

  async normalizeChannels (channels, defaults) {
    const out = []
    for (const entry of channels || []) {
      const channel = typeof entry === 'string' ? { pubkey: entry } : entry
      const signer = channel.signer || channel.privateChannelSigner
      const pubkey = channel.pubkey || await signer?.getPublicKey?.()
      if (!pubkey || !signer) throw new Error('CHANNEL_SIGNER_REQUIRED')
      out.push({
        pubkey,
        signer,
        relays: uniq(channel.relays?.length ? channel.relays : defaults.relays),
        mode: channel.mode || defaults.mode || 'leecher',
        seeders: uniq(channel.seeders)
      })
    }
    return out
  }

  stateKey () {
    return `${this.prefix}:state`
  }

  readState () {
    const state = parseJson(localStorage.getItem(this.stateKey()), { channels: {} })
    if (!isPlainObject(state.channels)) state.channels = {}
    return state
  }

  writeState (state) {
    localStorage.setItem(this.stateKey(), JSON.stringify(state))
  }

  updateChannelState (pubkey, patch) {
    const state = this.readState()
    const current = state.channels[pubkey] || {}
    state.channels[pubkey] = { ...current, ...patch }
    this.writeState(state)
    return state.channels[pubkey]
  }

  removeChannelState (pubkey) {
    const state = this.readState()
    delete state.channels[pubkey]
    this.writeState(state)
  }

  markSeen (pubkey, createdAt = nowSeconds()) {
    const state = this.readState()
    const current = state.channels[pubkey] || {}
    current.lastSeenAt = Math.max(current.lastSeenAt || 0, createdAt || 0)
    state.channels[pubkey] = current
    this.writeState(state)
  }

  knownSeeders (pubkey) {
    const channel = this.channels.get(pubkey)
    if (channel?.seeders?.length) return channel.seeders
    const activity = this.readState().channels[pubkey]?.seederActivity || {}
    return Object.keys(activity)
  }

  recoverySeeders (pubkey) {
    const channel = this.channels.get(pubkey)
    const configuredSeeders = channel?.seeders || []
    if (configuredSeeders.length) return configuredSeeders.filter(seeder => seeder !== this.userPubkey)

    const activity = this.readState().channels[pubkey]?.seederActivity || {}
    const cutoff = nowSeconds() - this.seederOnlineSeconds
    return Object.entries(activity)
      .filter(([seeder, entry]) => seeder !== this.userPubkey && (entry.lastActiveAt || 0) >= cutoff)
      .sort((a, b) => (b[1].lastActiveAt || 0) - (a[1].lastActiveAt || 0))
      .slice(0, this.maxDynamicRecoverySeeders)
      .map(([seeder]) => seeder)
  }

  markSeederActive (channelPubkey, seederPubkey, { announced = false, at = nowSeconds() } = {}) {
    const state = this.readState()
    const current = state.channels[channelPubkey] || {}
    const activity = current.seederActivity || {}
    const entry = activity[seederPubkey] || {}
    activity[seederPubkey] = {
      ...entry,
      firstSeenAt: entry.firstSeenAt || at,
      lastActiveAt: Math.max(entry.lastActiveAt || 0, at)
    }
    if (announced) activity[seederPubkey].announcedAt = at
    current.seederActivity = activity
    state.channels[channelPubkey] = current
    this.writeState(state)
  }

  trackSeederActivity (channelPubkey, message) {
    const senderPubkey = message.event?.pubkey
    if (!senderPubkey) return false

    const channel = this.channels.get(channelPubkey)
    if (!channel) return false

    const activity = this.readState().channels[channelPubkey]?.seederActivity || {}
    const isPresence = messageCode(message) === SEEDER_PRESENCE_CODE
    const configuredSeeders = channel.seeders || []
    const isConfiguredSeeder = configuredSeeders.includes(senderPubkey)
    const isKnownDynamicSeeder = Boolean(activity[senderPubkey])
    const at = messageTime(message)

    if (isPresence) {
      if (configuredSeeders.length && !isConfiguredSeeder) return false
      this.markSeederActive(channelPubkey, senderPubkey, { announced: true, at })
      return true
    }

    if (!isConfiguredSeeder && !isKnownDynamicSeeder) return false
    this.markSeederActive(channelPubkey, senderPubkey, { at })
    return true
  }

  addOfflineRange (pubkey, start, end) {
    const now = nowSeconds()
    const minStart = now - this.offlineRecoverySeconds
    const normalized = {
      start: Math.max(0, Math.floor(start)),
      end: Math.floor(end)
    }
    if (normalized.end <= normalized.start || normalized.end < minStart) return
    normalized.start = Math.max(normalized.start, minStart)

    const state = this.readState()
    const current = state.channels[pubkey] || {}
    const ranges = (current.offlineRanges || [])
      .filter(range => range.end >= minStart)
      .concat([normalized])
      .sort((a, b) => a.start - b.start)
    current.offlineRanges = mergeRanges(ranges)
    state.channels[pubkey] = current
    this.writeState(state)
  }

  closeOpenOfflineRanges () {
    const state = this.readState()
    const end = nowSeconds()
    const minStart = end - this.offlineRecoverySeconds
    for (const pubkey of Object.keys(state.channels)) {
      const current = state.channels[pubkey]
      if (!current.openOfflineStart) continue
      const start = Math.max(minStart, Math.max(0, current.openOfflineStart))
      if (end > start) {
        current.offlineRanges = mergeRanges((current.offlineRanges || []).concat([{ start, end }]))
      }
      delete current.openOfflineStart
      state.channels[pubkey] = current
    }
    this.writeState(state)
  }

  async watch (channels = [...this.channels.keys()]) {
    const channelPubkeys = uniq(channels)
    for (const pubkey of channelPubkeys) {
      const channel = this.channels.get(pubkey)
      if (!channel) throw new Error('UNKNOWN_CHANNEL')
      this.stopByChannel.get(pubkey)?.()
      const stop = await this._privateMessage.watch({
        channels: [pubkey],
        relays: channel.relays,
        receiverSigner: this.userSigner,
        iykcSigner: this.contentKeySigner,
        privateChannelSigner: channel.signer,
        mode: channel.mode,
        onAsk: message => this.handleAsk(pubkey, message),
        onReply: message => this.handleReply(pubkey, message),
        onTell: message => this.handleTell(pubkey, message),
        onYell: message => this.handleYell(pubkey, message),
        onMessage: message => this.handleMessage(pubkey, message),
        onSeed: seed => this.enqueueSeed(pubkey, seed),
        onError: err => console.warn('private-messenger watch failed', err?.message ?? err)
      })
      this.stopByChannel.set(pubkey, stop)
      this.updateChannelState(pubkey, {
        lastWatchedAt: nowSeconds(),
        mode: channel.mode,
        relays: channel.relays,
        seeders: channel.seeders
      })
      this.scheduleReloadGap(pubkey)
    }
    this.ensureNetworkWatchers()
    return this
  }

  unwatch (channels) {
    const channelPubkeys = channels ? uniq(Array.isArray(channels) ? channels : [channels]) : [...this.stopByChannel.keys()]
    for (const pubkey of channelPubkeys) {
      this.stopByChannel.get(pubkey)?.()
      this.stopByChannel.delete(pubkey)
      this.stopPresencePublisher(pubkey)
    }
  }

  async handleAsk (channelPubkey, message) {
    try {
      this.trackSeederActivity(channelPubkey, message)
      if (this.channels.get(channelPubkey)?.mode === 'seeder' && messageCode(message) === MISSING_MESSAGES_ASK_CODE) {
        await this.replyWithStoredSeeds(channelPubkey, message)
        return
      }
      this.enqueueRumor('ask', channelPubkey, message)
    } catch (err) {
      console.warn('private-messenger ask handling failed', err?.message ?? err)
    }
  }

  async handleReply (channelPubkey, message) {
    try {
      this.trackSeederActivity(channelPubkey, message)
      if (messageCode(message) === MISSING_MESSAGES_REPLY_CODE) {
        await this.consumeMissingMessagesReply(channelPubkey, message)
        return
      }
      this.enqueueRumor('reply', channelPubkey, message)
    } catch (err) {
      console.warn('private-messenger reply handling failed', err?.message ?? err)
    }
  }

  handleTell (channelPubkey, message) {
    this.trackSeederActivity(channelPubkey, message)
    this.enqueueRumor('tell', channelPubkey, message)
  }

  handleYell (channelPubkey, message) {
    this.trackSeederActivity(channelPubkey, message)
    if (messageCode(message) === SEEDER_PRESENCE_CODE) return
    this.enqueueRumor('yell', channelPubkey, message)
  }

  handleMessage (channelPubkey, message) {
    if (eventType(message.event) !== 'message') return
    this.trackSeederActivity(channelPubkey, message)
    this.enqueueRumor('message', channelPubkey, message)
  }

  enqueueRumor (type, channelPubkey, message) {
    const channel = this.channels.get(channelPubkey)
    if (channel?.mode === 'seeder' && type !== 'ask') return
    this.markSeen(channelPubkey, message.outer?.created_at || message.event?.created_at || nowSeconds())
    this.queue.enqueue({
      type,
      channelPubkey,
      receivedAt: nowSeconds(),
      event: message.event,
      payload: message.payload,
      question: message.question || null,
      questionId: message.questionId || null,
      outer: message.outer || null,
      meta: message.meta || null
    })
  }

  enqueueSeed (channelPubkey, seed) {
    const router = compactSeedRouter(seed.router)
    this.markSeen(channelPubkey, router.created_at || seed.outer?.created_at || nowSeconds())
    this.seedQueue.enqueue({
      type: 'seed',
      channelPubkey,
      receivedAt: nowSeconds(),
      router,
      meta: { channelPubkey: seed.channelPubkey }
    })
    this.pruneStoredSeeds(channelPubkey)
  }

  messages () {
    return this.queue.items()
  }

  nextMessage () {
    return this.queue.shift()
  }

  async ask ({ channelPubkey = this.defaultChannelPubkey(), receiverPubkey, relays, message, code, payload, content }) {
    const channel = this.requireChannel(channelPubkey)
    return this._privateMessage.ask({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      receiverPubkey,
      relays: relays || channel.relays,
      expirationSeconds: this.offlineRecoverySeconds,
      message,
      code,
      payload,
      content
    })
  }

  async reply ({ channelPubkey = this.defaultChannelPubkey(), question, receiverPubkey, relays, message, code, payload, content }) {
    const channel = this.requireChannel(channelPubkey)
    return this._privateMessage.reply({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      question,
      receiverPubkey,
      relays: relays || channel.relays,
      expirationSeconds: this.offlineRecoverySeconds,
      message,
      code,
      payload,
      content
    })
  }

  async tell ({ channelPubkey = this.defaultChannelPubkey(), receiverPubkey, relays, message, code, payload, content }) {
    const channel = this.requireChannel(channelPubkey)
    return this._privateMessage.tell({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      receiverPubkey,
      relays: relays || channel.relays,
      expirationSeconds: this.offlineRecoverySeconds,
      message,
      code,
      payload,
      content
    })
  }

  async yell ({ channelPubkey = this.defaultChannelPubkey(), receiverPubkeys, relays, message, code, payload, content }) {
    const channel = this.requireChannel(channelPubkey)
    return this._privateMessage.yell({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      receiverPubkeys,
      relays: relays || channel.relays,
      expirationSeconds: this.offlineRecoverySeconds,
      message,
      code,
      payload,
      content
    })
  }

  async sendEvent ({ channelPubkey = this.defaultChannelPubkey(), receiverPubkeys, relays, event }) {
    const channel = this.requireChannel(channelPubkey)
    return this._privateMessage.sendEvent({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      receiverPubkeys,
      relays: relays || channel.relays,
      expirationSeconds: this.offlineRecoverySeconds,
      event
    })
  }

  async publishSeederPresence (channelPubkey = this.defaultChannelPubkey()) {
    const channel = this.requireChannel(channelPubkey)
    const receiverPubkeys = uniq([...this.knownSeeders(channelPubkey), this.userPubkey])
    return this._privateMessage.yell({
      senderSigner: this.userSigner,
      imkcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      receiverPubkeys,
      relays: channel.relays,
      expirationSeconds: this.offlineRecoverySeconds,
      code: SEEDER_PRESENCE_CODE,
      payload: {}
    })
  }

  async startPresencePublisher (channelPubkey) {
    if (this.presenceTimers.has(channelPubkey)) return
    try {
      await this.publishSeederPresence(channelPubkey)
    } catch (err) {
      console.warn('private-messenger seeder presence failed', err?.message ?? err)
    }
    const timer = this._setInterval(() => {
      this.publishSeederPresence(channelPubkey).catch(err => {
        console.warn('private-messenger seeder presence failed', err?.message ?? err)
      })
    }, this.seederPresenceIntervalMs)
    timer?.unref?.()
    this.presenceTimers.set(channelPubkey, timer)
  }

  stopPresencePublisher (channelPubkey) {
    const timer = this.presenceTimers.get(channelPubkey)
    if (timer) this._clearInterval(timer)
    this.presenceTimers.delete(channelPubkey)
  }

  async reconcilePresencePublishers () {
    const starts = []
    for (const pubkey of [...this.presenceTimers.keys()]) {
      if (this.channels.get(pubkey)?.mode !== 'seeder') this.stopPresencePublisher(pubkey)
    }
    for (const [pubkey, channel] of this.channels) {
      if (channel.mode === 'seeder') starts.push(this.startPresencePublisher(pubkey))
      else this.stopPresencePublisher(pubkey)
    }
    await Promise.all(starts)
  }

  createMissingMessageReplyPacker (options) {
    return createMissingMessageReplyPacker({ messenger: this, ...options })
  }

  createEventReplyPacker (options) {
    return createEventReplyPacker({ messenger: this, ...options })
  }

  defaultChannelPubkey () {
    return this.channels.keys().next().value
  }

  requireChannel (pubkey) {
    const channel = this.channels.get(pubkey)
    if (!channel) throw new Error('UNKNOWN_CHANNEL')
    return channel
  }

  scheduleReloadGap (pubkey) {
    const current = this.readState().channels[pubkey]
    const start = current?.openOfflineStart || current?.lastSeenAt
    if (!start) return
    this._setTimeout(async () => {
      this.addOfflineRange(pubkey, Math.max(0, start - this.offlineSkewSeconds), nowSeconds())
      await this.recoverOfflineRanges([pubkey])
    }, this.reloadGapDelayMs)
  }

  ensureNetworkWatchers () {
    if (typeof window === 'undefined') return
    if (!this.stopOffline) {
      const offline = () => {
        const state = this.readState()
        const start = Math.max(0, nowSeconds() - this.offlineSkewSeconds)
        for (const pubkey of this.stopByChannel.keys()) {
          const current = state.channels[pubkey] || {}
          current.openOfflineStart ||= start
          state.channels[pubkey] = current
        }
        this.writeState(state)
      }
      window.addEventListener('offline', offline)
      this.stopOffline = () => window.removeEventListener('offline', offline)
    }
    if (!this.stopOnline) {
      const online = async () => {
        this.closeOpenOfflineRanges()
        await this.watch([...this.stopByChannel.keys()])
        await this.recoverOfflineRanges()
      }
      window.addEventListener('online', online)
      this.stopOnline = () => window.removeEventListener('online', online)
    }
  }

  async askSeedersForMissingRange (channelPubkey, since, until) {
    const seeders = this.recoverySeeders(channelPubkey)
    if (!seeders.length || until < since) return []

    const asks = []
    for (const seeder of seeders) {
      try {
        asks.push(await this.ask({
          channelPubkey,
          receiverPubkey: seeder,
          code: MISSING_MESSAGES_ASK_CODE,
          payload: { since, until }
        }))
      } catch (err) {
        console.warn('private-messenger seeder recovery ask failed', seeder, err?.message ?? err)
      }
    }
    return asks
  }

  async askSeedersForRelayLeftEdge (channelPubkey, range, fetchedEvents) {
    const oldest = oldestCreatedAt(fetchedEvents)
    const until = oldest == null ? range.end : Math.min(range.end, oldest)
    if (until < range.start) return []
    return this.askSeedersForMissingRange(channelPubkey, range.start, until)
  }

  async replyWithStoredSeeds (channelPubkey, message) {
    const payload = isPlainObject(message.payload?.payload) ? message.payload.payload : {}
    const since = Number.isFinite(payload.since) ? payload.since : undefined
    const until = Number.isFinite(payload.until) ? payload.until : undefined
    const packer = this.createMissingMessageReplyPacker({
      channelPubkey,
      question: message.event,
      receiverPubkey: message.event?.pubkey,
      since,
      until
    })

    for await (const seed of this.seedQueue.storedItems()) {
      if (seed.channelPubkey !== channelPubkey) continue
      await packer.update(seed)
    }
    await packer.finalize()
  }

  async consumeMissingMessagesReply (channelPubkey, message) {
    const payload = message.payload?.payload
    const jsonl = typeof payload?.jsonl === 'string' ? payload.jsonl : ''
    if (!jsonl) return

    for (const line of splitJsonl(jsonl)) {
      const record = parseJson(line, null)
      if (!record) continue
      const event = await this.eventFromBackfillRecord(channelPubkey, record)
      if (!event) continue
      this.enqueueRumor(eventType(event), channelPubkey, {
        event,
        outer: message.outer,
        meta: { ...(message.meta || {}), channelPubkey, recoveredFromSeeder: message.event?.pubkey || '' },
        payload: parseEventContent(event)
      })
    }
  }

  async eventFromBackfillRecord (channelPubkey, record) {
    if (record.event) return record.event
    if (Number.isInteger(record.kind)) return record
    if (!record.router?.content && (!record.row || !record.router)) return null
    if (!this._privateChannel.unwrapEvent) throw new Error('PRIVATE_CHANNEL_UNWRAP_UNSUPPORTED')

    const channel = this.requireChannel(channelPubkey)
    const router = {
      kind: privateChannel.ROUTER_KIND,
      pubkey: record.router.pubkey,
      created_at: record.router.created_at || record.outer?.created_at || nowSeconds(),
      tags: (record.router.tags || []).filter(tag => tag[0] !== 'c').concat([['c', '0', '1']]),
      content: record.router.content || bytesToBase64(encoder.encode(String(record.row).endsWith('\n') ? String(record.row) : `${record.row}\n`))
    }
    const outer = {
      kind: privateChannel.PRIVATE_BROADCAST_KIND,
      pubkey: record.outer?.pubkey || channelPubkey,
      created_at: record.outer?.created_at || router.created_at,
      tags: record.outer?.tags || [],
      content: await channel.signer.nip44Encrypt(channelPubkey, JSON.stringify(router))
    }
    return this._privateChannel.unwrapEvent({
      receiverSigner: this.userSigner,
      iykcSigner: this.contentKeySigner,
      privateChannelSigner: channel.signer,
      event: outer,
      receiverPubkey: this.userPubkey
    })
  }

  async recoverOfflineRanges (channels = [...this.stopByChannel.keys()]) {
    const state = this.readState()
    const now = nowSeconds()
    const minStart = now - this.offlineRecoverySeconds

    for (const pubkey of uniq(channels)) {
      const channel = this.channels.get(pubkey)
      const current = state.channels[pubkey]
      if (!channel || !current?.offlineRanges?.length) continue

      const remaining = []
      for (const range of current.offlineRanges) {
        if (range.end < minStart) continue
        try {
          const fetchedEvents = await this._privateChannel.fetch({
            receiverSigner: this.userSigner,
            iykcSigner: this.contentKeySigner,
            privateChannelSigner: channel.signer,
            privateChannelPubkeys: [pubkey],
            receiverPubkey: this.userPubkey,
            relays: channel.relays,
            since: Math.max(0, range.start),
            until: range.end,
            mode: channel.mode,
            modeByPubkey: { [pubkey]: channel.mode },
            onEvent: (event, outer, meta) => this.enqueueRumor(eventType(event), pubkey, { event, outer, meta, payload: parseEventContent(event) }),
            onSeedEvent: seed => this.enqueueSeed(pubkey, seed),
            onError: err => { throw err }
          }) || []
          await this.askSeedersForRelayLeftEdge(pubkey, range, fetchedEvents)
        } catch (err) {
          console.warn('private-messenger recovery failed', pubkey, err?.message ?? err)
          remaining.push(range)
        }
      }
      const fresh = this.readState()
      fresh.channels[pubkey] = {
        ...(fresh.channels[pubkey] || {}),
        offlineRanges: remaining
      }
      this.writeState(fresh)
    }
  }

  clearChannel (pubkey) {
    this.unwatch(pubkey)
    this._privateMessage.clearChannelState?.(pubkey)
    this.channels.delete(pubkey)
    this.removeChannelState(pubkey)
    this.queue.removeWhere(item => item.channelPubkey === pubkey)
    this.seedQueue.removeWhere(item => item.channelPubkey === pubkey)
  }

  clearQueue () {
    this.queue.clear()
  }

  cleanupStaleChannels () {
    if (!this.prefix) return
    const state = this.readState()
    const cutoff = nowSeconds() - this.staleChannelSeconds
    for (const [pubkey, channel] of Object.entries(state.channels)) {
      if ((channel.lastWatchedAt || 0) >= cutoff) continue
      delete state.channels[pubkey]
      this.queue?.removeWhere(item => item.channelPubkey === pubkey)
      this.seedQueue?.removeWhere(item => item.channelPubkey === pubkey)
    }
    this.writeState(state)
  }

  pruneStoredSeeds (channelPubkey) {
    const cutoff = nowSeconds() - this.offlineRecoverySeconds
    this.seedQueue?.removeWhere(item => {
      if (channelPubkey && item.channelPubkey !== channelPubkey) return false
      return (item.router?.created_at || item.receivedAt || 0) < cutoff
    })
  }

  close () {
    this.unwatch()
    for (const pubkey of [...this.presenceTimers.keys()]) this.stopPresencePublisher(pubkey)
    this.stopOffline?.()
    this.stopOnline?.()
    this.stopOffline = null
    this.stopOnline = null
  }
}

function mergeRanges (ranges) {
  const out = []
  for (const range of ranges) {
    const last = out[out.length - 1]
    if (!last || range.start > last.end + 1) out.push({ ...range })
    else last.end = Math.max(last.end, range.end)
  }
  return out
}

function eventType (event) {
  if (event.kind === privateMessage.ASK_KIND) return 'ask'
  if (event.kind === privateMessage.REPLY_KIND) return 'reply'
  if (event.kind === privateMessage.TELL_KIND) return event.tags?.some(t => t[0] === 'r') ? 'tell' : 'yell'
  return 'message'
}

function parseEventContent (event) {
  try { return JSON.parse(event.content) } catch { return event.content }
}

function messageCode (message) {
  return isPlainObject(message.payload) ? message.payload.code || '' : ''
}

function messageTime (message) {
  return message.outer?.created_at || message.event?.created_at || nowSeconds()
}

function oldestCreatedAt (events) {
  let oldest = null
  for (const event of events || []) {
    if (!Number.isFinite(event?.created_at)) continue
    oldest = oldest == null ? event.created_at : Math.min(oldest, event.created_at)
  }
  return oldest
}

function splitJsonl (jsonl) {
  return String(jsonl || '').split('\n').filter(Boolean)
}

export async function createPrivateMessenger (options) {
  return new PrivateMessenger(options).init(options)
}
