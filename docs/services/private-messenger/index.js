// Expected use:
// const messenger = await createPrivateMessenger({
//   userSigner,
//   contentKeySigner,
//   channels: [{ signer: privateChannelSigner, relays, mode: 'leecher' }]
// })
// for await (const msg of messenger.messages()) handlePrivateMessage(msg)
// await messenger.ask({ receiverPubkey, payload: { ping: true } })
// await messenger.reply({ question: msg.question, payload: { ok: true } })
// await messenger.tell({ receiverPubkey, payload: { note: 'hello' } })
// await messenger.yell({ receiverPubkeys, payload: { notice: 'hello all' } })
// await messenger.update({ channels: nextChannels })
// messenger.clearChannel(channelPubkey)
//
// Missed-message recovery:
// - Each watched channel stores lastSeenAt/lastWatchedAt in localStorage.
// - Re-watching after reload fetches the gap from lastSeenAt to now.
// - Browser offline/online events add explicit offline ranges with a small skew.
// - Ranges older than 7 days are ignored; channel state not watched for 45 days is pruned.

import * as privateMessage from '../../helpers/nostr/private-message.js'
import * as privateChannel from '../private-channel/index.js'
import { createQueue } from './queue.js'

const DEFAULT_OFFLINE_RECOVERY_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_STALE_CHANNEL_SECONDS = 45 * 24 * 60 * 60
const DEFAULT_OFFLINE_SKEW_SECONDS = 30
const DEFAULT_RELOAD_GAP_DELAY_MS = 500

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
    _privateMessage = privateMessage,
    _privateChannel = privateChannel,
    _setTimeout = globalThis.setTimeout.bind(globalThis)
  } = {}) {
    this.offlineRecoverySeconds = offlineRecoverySeconds
    this.staleChannelSeconds = staleChannelSeconds
    this.offlineSkewSeconds = offlineSkewSeconds
    this.reloadGapDelayMs = reloadGapDelayMs
    this._privateMessage = _privateMessage
    this._privateChannel = _privateChannel
    this._setTimeout = _setTimeout

    this.userSigner = null
    this.contentKeySigner = null
    this.userPubkey = ''
    this.prefix = ''
    this.queue = null
    this.channels = new Map()
    this.stopByChannel = new Map()
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
    this.cleanupStaleChannels()
    await this.update({ userSigner, contentKeySigner, channels, relays, mode })
    return this
  }

  async update ({ userSigner = this.userSigner, contentKeySigner = this.contentKeySigner, channels = [...this.channels.values()], relays = [], mode = 'leecher' } = {}) {
    if (userSigner) this.userSigner = userSigner
    this.contentKeySigner = contentKeySigner || null
    const nextChannels = await this.normalizeChannels(channels, { relays, mode })
    const nextPubkeys = new Set(nextChannels.map(channel => channel.pubkey))

    for (const pubkey of this.channels.keys()) {
      if (!nextPubkeys.has(pubkey)) this.unwatch(pubkey)
    }
    for (const channel of nextChannels) this.channels.set(channel.pubkey, channel)

    this.cleanupStaleChannels()
    return this.watch()
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
        mode: channel.mode || defaults.mode || 'leecher'
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
        onAsk: message => this.enqueueRumor('ask', pubkey, message),
        onReply: message => this.enqueueRumor('reply', pubkey, message),
        onTell: message => this.enqueueRumor('tell', pubkey, message),
        onYell: message => this.enqueueRumor('yell', pubkey, message),
        onSeed: seed => this.enqueueSeed(pubkey, seed),
        onError: err => console.warn('private-messenger watch failed', err?.message ?? err)
      })
      this.stopByChannel.set(pubkey, stop)
      this.updateChannelState(pubkey, {
        lastWatchedAt: nowSeconds(),
        mode: channel.mode,
        relays: channel.relays
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
    }
  }

  enqueueRumor (type, channelPubkey, message) {
    const channel = this.channels.get(channelPubkey)
    if (channel?.mode === 'seeder') return
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
    this.markSeen(channelPubkey, seed.outer?.created_at || nowSeconds())
    this.queue.enqueue({
      type: 'seed',
      channelPubkey,
      receivedAt: nowSeconds(),
      jsonl: seed.jsonl,
      router: seed.router,
      outer: seed.outer,
      meta: { channelPubkey: seed.channelPubkey }
    })
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
          await this._privateChannel.fetch({
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
          })
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
    }
    this.writeState(state)
  }

  close () {
    this.unwatch()
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

export async function createPrivateMessenger (options) {
  return new PrivateMessenger(options).init(options)
}
