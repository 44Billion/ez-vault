import { syncErrorDetails } from '../../helpers/sync-error.js'
import { publicationErrorFromResult, publicationRetryAt } from '../../helpers/publication-retry.js'
import { debugEnabledForWindow } from '../../helpers/diagnostics-mode.js'
import { PrivateMessenger } from 'libp2r2p/private-messenger'
import { PERSONAL_COPY } from 'libp2r2p/kind'
import { isOnline, onOnline } from 'libp2r2p/network'
import { claimSigner } from '../signer.js'
import { subscribeRelayListUpdates } from 'libp2r2p/relay'
import * as store from '../accounts-store.js'
import * as secrets from '../secrets.js'
import * as trustedSigners from '../trusted-signers.js'
import * as deviceRelays from '../device-relays.js'
import * as contentKeys from './content-keys.js'
import * as trustedSignerSync from './trusted-signers.js'
import * as revocationRotation from './revocation-rotation.js'
import {
  createNostrDbSyncController,
  coalescingHint as nostrDbCoalescingHint,
  NOSTRDB_SYNC_PUSH_CODE,
  NOSTRDB_SYNC_REPLY_CODE
} from './nostrdb.js'
import { createSyncPeerGuard } from './peer-guard.js'
import { isSyncPayloadError, syncPayloadInvalid } from './payload-error.js'
import { SYNC_QUARANTINE_DECODER_VERSION, syncQuarantine } from './quarantine.js'
import {
  filterVisibleAccounts,
  hasPendingMutation,
  subscribePendingMutations
} from '../account-mutations.js'

const ANNOUNCE_INTERVAL_MS = 4 * 60 * 60 * 1000
const ANNOUNCE_DEBOUNCE_MS = 1000
const ANNOUNCE_ALL = '*'
const TRUSTED_SIGNER_SYNC_INFO = 'trusted-signer-sync-v1'
const HEX32 = /^[0-9a-f]{64}$/i
const APP_ID_MAX_LENGTH = 512
const INBOX_HANDLER_DEADLINE_MS = 5 * 60 * 1000
const INBOX_HANDLER_RETRY_MS = 30 * 1000
const MAX_STALLED_INBOX_HANDLERS = 4
const encoder = new TextEncoder()
const DEFAULT_COALESCING_HINTS = [
  contentKeys.coalescingHint,
  nostrDbCoalescingHint,
  trustedSignerSync.coalescingHint
]

function inboxAckError (failure) {
  return Object.assign(new Error('INBOX_ACK_FAILED'), {
    code: 'INBOX_ACK_FAILED',
    cause: failure || null
  })
}

// Account data sync derives one private channel per unlocked nsec account and
// talks only to configured trusted signer pubkeys. Content-key sync exchanges
// key metadata/secrets, while NostrDB sync uses the same account-scoped channel
// context to exchange local database inventory and event rows. Trusted-signer
// list sync is device-scoped instead: one shared-key channel per peer signer.

function defaultOnError (err) {
  const details = syncErrorDetails(err)
  if (details) console.warn('sync failed', err.message, details)
  else console.warn('sync failed', err?.message ?? err)
}

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function redactDebugEvent (event) {
  try {
    return JSON.parse(JSON.stringify(event, (key, value) => {
      const name = String(key).toLowerCase()
      if (
        name.includes('seckey') || name.includes('secret') || name.includes('pubkey') ||
        name.includes('eventid') || name === 'outerid' ||
        name === 'publicationid' || name === 'seedrecordid' || name === 'payload' ||
        name === 'content' || name.includes('filter')
      ) {
        return '[redacted]'
      }
      return value
    }))
  } catch {
    return { source: 'sync', action: 'debug', redacted: true }
  }
}

function defaultDebugSink () {
  if (!debugEnabledForWindow()) return null
  return event => {
    if (event?.action === 'inbound-peer-dropped') return
    const safe = redactDebugEvent(event)
    console.log('[ez-vault sync]', safe.action || 'event', safe)
  }
}

function syncRelays (relays) {
  return [...new Set((Array.isArray(relays) ? relays : []).filter(Boolean))].slice(0, 2)
}

function syncWatchRelays (relays) {
  return [...new Set((Array.isArray(relays) ? relays : []).filter(Boolean))]
}

function trustedMap (trusted) {
  return new Map(trusted.map(entry => [entry.pubkey, entry]))
}

function nsecOwnerPubkeys (_store = store) {
  return filterVisibleAccounts(_store.list())
    .filter(account => account.type === 'nsec')
    .map(account => account.pubkey)
}

function nostrDbOwnerPubkeys (_store = store) {
  return nsecOwnerPubkeys(_store).filter(pubkey => HEX32.test(pubkey))
}

function syncAccountIdentityKey (_store = store) {
  return filterVisibleAccounts(_store.list())
    .filter(account => account.type === 'nsec')
    .map(account => `${account.type}:${account.pubkey}`)
    .join('|')
}

function messageCode (message) {
  return isPlainObject(message?.payload) ? message.payload.code || '' : ''
}

function messagePayloadBytes (message) {
  const value = message?.payload?.payload
  if (typeof value?.jsonl === 'string') return encoder.encode(value.jsonl).byteLength
  if (typeof value === 'string') return encoder.encode(value).byteLength
  return 0
}

function messageRequestId (message) {
  const value = message?.payload?.payload?.requestId
  return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : ''
}

function resolveInboundPriority (message) {
  const code = message?.payload?.code
  if (code !== NOSTRDB_SYNC_PUSH_CODE && code !== NOSTRDB_SYNC_REPLY_CODE) return null
  const priority = message.payload.payload?.priority
  return priority === 'lower' || priority === 'lowest' ? priority : null
}

export function resolveInboundCoalescing (message, hints = DEFAULT_COALESCING_HINTS) {
  for (const hint of hints) {
    const resolved = hint?.(message)
    if (resolved) return resolved
  }
  return null
}

function messageDebugInfo (message) {
  const requestId = messageRequestId(message)
  return {
    type: message?.type || '',
    code: messageCode(message),
    payloadBytes: messagePayloadBytes(message),
    ...(requestId ? { requestId } : {})
  }
}

function inboxDeliveryKey (message) {
  const eventId = message?.event?.id
  if (typeof eventId !== 'string' || !eventId) return ''
  return JSON.stringify([
    message?.channelPubkey || '',
    message?.type || '',
    eventId,
    message?.provenance || ''
  ])
}

export function createSyncController ({
  MessengerClass = PrivateMessenger,
  _store = store,
  _secrets = secrets,
  _trustedSigners = trustedSigners,
  _deviceRelays = deviceRelays,
  _contentKeys = contentKeys,
  _trustedSignerSync = trustedSignerSync,
  _revocationRotation = revocationRotation,
  _createNostrDbSyncController = createNostrDbSyncController,
  _syncQuarantine = syncQuarantine,
  _quarantineDecoderVersion = SYNC_QUARANTINE_DECODER_VERSION,
  _coalescingHints = DEFAULT_COALESCING_HINTS,
  _createPeerGuard = createSyncPeerGuard,
  _claimSigner = claimSigner,
  _subscribeRelayListUpdates = subscribeRelayListUpdates,
  _hasPendingMutation = hasPendingMutation,
  _subscribePendingMutations = subscribePendingMutations,
  getNostrDbLaneMode = () => 'recent',
  _isOnline = isOnline,
  _onOnline = onOnline,
  _setTimeout = globalThis.setTimeout.bind(globalThis),
  _clearTimeout = globalThis.clearTimeout.bind(globalThis),
  _setInterval = globalThis.setInterval.bind(globalThis),
  _clearInterval = globalThis.clearInterval.bind(globalThis),
  _now = Date.now,
  _performanceNow = () => performance.now(),
  _debug,
  onError = defaultOnError
} = {}) {
  if (typeof getNostrDbLaneMode !== 'function') throw new Error('INVALID_NOSTRDB_LANE_MODE_GETTER')
  let initialized = false
  let messenger = null
  let trustedByPubkey = new Map()
  let refreshPromise = null
  let drainQueued = false
  let drainScheduled = false
  let draining = false
  let drainRetryTimer = null
  let drainRetryAt = 0
  let contentKeyAskRetryTimer = null
  let contentKeyAskRetryAt = 0
  let channelConfiguration = null
  let announceTimer = null
  let announceTimerAt = 0
  let announceInterval = null
  let stopOnlineAnnouncements = null
  const ownersWaitingForOnline = new Set()
  const ownersWaitingForResume = new Set()
  let trustedWaitingForOnline = false
  let trustedWaitingForResume = false
  let pendingResetInterval = false
  let lastStoreIdentityKey = ''
  let stopRelayListWatcher = null
  let relayListWatcherKey = ''
  let relayListRevision = 0
  let refreshQueued = false
  let lifecycleId = 0
  let quarantineReplayLifecycle = 0
  let trustedAnnounceRetryAt = 0
  let messengerStateMonitor = null
  const pendingAnnounceOwners = new Set()
  const announceRetryAtByOwner = new Map()
  const unsubscribers = []
  const channelPubkeyByOwnerPubkey = new Map()
  const ownerPubkeyByChannelPubkey = new Map()
  const channelSignerByChannelPubkey = new Map()
  const relaySetByChannelPubkey = new Map()
  const signerChannelPubkeyByPeerPubkey = new Map()
  const readRelaysByOwnerPubkey = new Map()
  const emptyPersonalCopyContextByOwner = new Map()
  const knownOwnerPubkeys = new Set()
  const readyOwnerPubkeys = new Set()
  const channelBuildFailuresByOwner = new Map()
  const stalledInboxHandlers = new Set()
  const stalledInboxHandlerKeys = new Map()
  let devicePubkey = ''
  const debug = _debug === undefined ? defaultDebugSink() : _debug
  const peerGuard = _createPeerGuard({ onDebug: debug, now: _now })
  const nostrDbSync = _createNostrDbSyncController({
    _setTimeout,
    _clearTimeout,
    _performanceNow,
    _isOnline,
    _onOnline,
    getLaneMode: input => getNostrDbLaneMode(input),
    onError
  })

  function syncHandlerContext ({
    messenger: handlerMessenger,
    signal,
    progress,
    checkpoint
  } = {}) {
    return {
      messenger: handlerMessenger || messenger,
      backgroundMessenger: messenger,
      trustedByPubkey,
      devicePubkey,
      signal,
      progress,
      checkpoint,
      ownerPubkeyForChannel,
      channelPubkeyForOwner,
      channelSignerFor: channelPubkey => channelSignerByChannelPubkey.get(channelPubkey) || null,
      relaysForChannel: channelPubkey => [...(relaySetByChannelPubkey.get(channelPubkey) || [])],
      onRangeChanged: ownerPubkey => scheduleAnnounce(ownerPubkey),
      ownerPubkeys: new Set(nostrDbOwnerPubkeys(_store)),
      trustedSigners: _trustedSigners,
      onError,
      debug
    }
  }

  async function handleSyncMessage (message, options) {
    try {
      const context = syncHandlerContext(options)
      const handled = await _contentKeys.handleMessage(message, context)
      if (handled) return true
      const handledTrustedSigners = await _trustedSignerSync.handleMessage(message, context)
      if (handledTrustedSigners) return true
      return nostrDbSync.handleMessage(message, context)
    } finally {
      scheduleContentKeyAskRetry()
    }
  }

  function emitQuarantineDiagnostic (message, error, result) {
    const diagnostic = Object.assign(new Error('SYNC_MESSAGE_QUARANTINED'), {
      code: 'SYNC_MESSAGE_QUARANTINED',
      syncCode: error.code,
      syncType: message?.type || '',
      operationCode: messageCode(message),
      status: result?.status || 'stored',
      partial: error.partial === true,
      evicted: Number.isSafeInteger(result?.evicted) ? result.evicted : 0
    })
    try { onError(diagnostic) } catch {}
  }

  async function replayQuarantinedMessages (id) {
    if (quarantineReplayLifecycle === id || !initialized || !messenger ||
      !_secrets.isUnlocked() || channelConfiguration) return
    quarantineReplayLifecycle = id
    try {
      const result = await _syncQuarantine.replay({
        context: syncHandlerContext(),
        decoderVersion: _quarantineDecoderVersion,
        handle: async message => {
          if (await handleSyncMessage(message)) return true
          throw syncPayloadInvalid('handler-no-longer-recognized')
        }
      })
      if (result.pruned || result.replayed || result.retained) {
        emitDebug('quarantine-replay', result)
      }
    } catch (error) {
      if (error?.name !== 'InvalidStateError' && error?.message !== 'STORAGE_CLOSED') onError(error)
    }
  }

  function emitDebug (action, detail = {}) {
    try {
      debug?.({ source: 'sync', action, ...detail })
    } catch (err) {
      onError(err)
    }
  }

  async function assertPublished (result) {
    if (!result?.delivery) return result
    const reports = result.delivery.reports
    if (!Array.isArray(reports) || !reports.length || reports.some(report => report?.success !== true)) {
      throw await publicationErrorFromResult(result, 'SYNC_PUBLICATION_FAILED')
    }
    return result
  }

  function isCurrentLifecycle (id) {
    return initialized && id === lifecycleId
  }

  async function accountReadRelays (ownerPubkey, signer) {
    const relays = readRelaysByOwnerPubkey.has(ownerPubkey)
      ? { read: readRelaysByOwnerPubkey.get(ownerPubkey) }
      : await signer.getRelays?.()
    const readRelays = syncWatchRelays(relays?.read)
    if (!readRelays.length) throw new Error('SYNC_READ_RELAYS_REQUIRED')
    return readRelays
  }

  function trustedPubkeys () {
    return [...trustedByPubkey.keys()]
  }

  function trustedRecords () {
    return typeof _trustedSigners.listRecords === 'function'
      ? _trustedSigners.listRecords()
      : _trustedSigners.list()
  }

  function removedReminderRecords () {
    return typeof _trustedSigners.listRemovedForReminder === 'function'
      ? _trustedSigners.listRemovedForReminder()
      : []
  }

  function channelPubkeyForOwner (ownerPubkey) {
    return channelPubkeyByOwnerPubkey.get(ownerPubkey) || ''
  }

  function ownerPubkeyForChannel (channelPubkey) {
    return ownerPubkeyByChannelPubkey.get(channelPubkey) || ''
  }

  async function resolveDeviceSyncRelays (pubkey) {
    if (typeof window === 'undefined' && _deviceRelays === deviceRelays) {
      return _deviceRelays.relaysFromEventOrFallback(null)
    }
    return _deviceRelays.resolveDeviceRelays(pubkey)
  }

  function signerSyncPeers () {
    const byPubkey = new Map()
    for (const signer of _trustedSigners.list()) {
      if (signer.pubkey) byPubkey.set(signer.pubkey, signer)
    }
    for (const record of removedReminderRecords()) {
      if (record.pubkey && !byPubkey.has(record.pubkey)) byPubkey.set(record.pubkey, record)
    }
    return [...byPubkey.values()]
  }

  function reportChannelBuildFailure (ownerPubkey, stage, cause) {
    const detail = cause?.message ?? String(cause)
    const err = new Error(`SYNC_CHANNEL_BUILD_FAILED owner=${ownerPubkey} stage=${stage} cause=${detail}`)
    err.code = 'SYNC_CHANNEL_BUILD_FAILED'
    err.ownerPubkey = ownerPubkey
    err.stage = stage
    err.cause = cause
    onError(err)
    emitDebug('channel-build-failed', { ownerPubkey, stage, cause: detail })
    return err
  }

  function replaceMap (target, source) {
    target.clear()
    for (const [key, value] of source) target.set(key, value)
  }

  function replaceSet (target, source) {
    target.clear()
    for (const value of source) target.add(value)
  }

  function publishChannelSnapshot (snapshot) {
    replaceMap(channelPubkeyByOwnerPubkey, snapshot.channelPubkeyByOwnerPubkey)
    replaceMap(ownerPubkeyByChannelPubkey, snapshot.ownerPubkeyByChannelPubkey)
    replaceMap(channelSignerByChannelPubkey, snapshot.channelSignerByChannelPubkey)
    replaceMap(relaySetByChannelPubkey, snapshot.relaySetByChannelPubkey)
    replaceMap(signerChannelPubkeyByPeerPubkey, snapshot.signerChannelPubkeyByPeerPubkey)
    replaceMap(emptyPersonalCopyContextByOwner, snapshot.emptyPersonalCopyContextByOwner || [])
    if (snapshot.relayListRevision === relayListRevision) {
      replaceMap(readRelaysByOwnerPubkey, snapshot.readRelaysByOwnerPubkey)
    }
    replaceMap(channelBuildFailuresByOwner, snapshot.channelBuildFailuresByOwner)
    replaceSet(knownOwnerPubkeys, snapshot.knownOwnerPubkeys)
    replaceSet(readyOwnerPubkeys, snapshot.readyOwnerPubkeys)
    devicePubkey = snapshot.devicePubkey
  }

  async function buildChannels (deviceSigner) {
    const snapshotRelayListRevision = relayListRevision
    const seeders = trustedPubkeys()
    const channels = []
    const nextChannelPubkeyByOwnerPubkey = new Map()
    const nextOwnerPubkeyByChannelPubkey = new Map()
    const nextChannelSignerByChannelPubkey = new Map()
    const nextSignerChannelPubkeyByPeerPubkey = new Map()
    const nextOwnerPubkeys = new Set()
    const nextReadyOwnerPubkeys = new Set()
    const nextReadRelaysByOwnerPubkey = new Map()
    const nextEmptyPersonalCopyContextByOwner = new Map()
    const nextChannelBuildFailuresByOwner = new Map()
    for (const account of filterVisibleAccounts(_store.list())) {
      if (account.type !== 'nsec') continue
      nextOwnerPubkeys.add(account.pubkey)
      if (readRelaysByOwnerPubkey.has(account.pubkey)) {
        nextReadRelaysByOwnerPubkey.set(account.pubkey, readRelaysByOwnerPubkey.get(account.pubkey))
      }
      let accountSigner
      try {
        accountSigner = _claimSigner(account)
      } catch (err) {
        nextChannelBuildFailuresByOwner.set(account.pubkey, reportChannelBuildFailure(account.pubkey, 'claim-signer', err))
        continue
      }
      let channelSigner
      let channelPubkey
      try {
        channelSigner = accountSigner.withSharedKey(account.pubkey, TRUSTED_SIGNER_SYNC_INFO)
        channelPubkey = await channelSigner.getPublicKey()
        if (!channelPubkey) throw new Error('CHANNEL_PUBKEY_REQUIRED')
      } catch (err) {
        nextChannelBuildFailuresByOwner.set(account.pubkey, reportChannelBuildFailure(account.pubkey, 'derive-channel-pubkey', err))
        continue
      }
      let relays
      try {
        relays = await accountReadRelays(account.pubkey, accountSigner)
      } catch (err) {
        nextChannelBuildFailuresByOwner.set(account.pubkey, reportChannelBuildFailure(account.pubkey, 'resolve-read-relays', err))
        continue
      }
      try {
        if (typeof accountSigner.obfuscate !== 'function') throw new Error('PERSONAL_COPY_OBFUSCATE_UNAVAILABLE')
        const emptyContext = await accountSigner.obfuscate('', String(PERSONAL_COPY), '')
        if (typeof emptyContext === 'string' && emptyContext) {
          nextEmptyPersonalCopyContextByOwner.set(account.pubkey, emptyContext)
        }
      } catch (err) {
        if (err?.message !== 'PERSONAL_COPY_OBFUSCATE_UNAVAILABLE') onError(err)
      }
      nextReadRelaysByOwnerPubkey.set(account.pubkey, relays)
      nextChannelPubkeyByOwnerPubkey.set(account.pubkey, channelPubkey)
      nextOwnerPubkeyByChannelPubkey.set(channelPubkey, account.pubkey)
      nextChannelSignerByChannelPubkey.set(channelPubkey, channelSigner)
      nextReadyOwnerPubkeys.add(account.pubkey)
      channels.push({
        pubkey: channelPubkey,
        signer: channelSigner,
        relays,
        sendRelays: syncRelays(relays),
        mode: 'seeder',
        seeders
      })
    }
    let nextDevicePubkey = ''
    try {
      nextDevicePubkey = await deviceSigner.getPublicKey()
      const localDeviceRelays = await resolveDeviceSyncRelays(nextDevicePubkey)
      for (const peer of signerSyncPeers()) {
        if (!peer.pubkey || peer.pubkey === nextDevicePubkey) continue
        const channelSigner = deviceSigner.withSharedKey(peer.pubkey, _trustedSignerSync.TRUSTED_SIGNER_SYNC_INFO)
        const channelPubkey = await channelSigner.getPublicKey()
        const peerRelays = await resolveDeviceSyncRelays(peer.pubkey)
        nextSignerChannelPubkeyByPeerPubkey.set(peer.pubkey, channelPubkey)
        nextChannelSignerByChannelPubkey.set(channelPubkey, channelSigner)
        channels.push({
          pubkey: channelPubkey,
          signer: channelSigner,
          relays: syncWatchRelays(localDeviceRelays),
          sendRelays: syncRelays(peerRelays),
          mode: 'seeder',
          seeders: [peer.pubkey]
        })
      }
    } catch (err) {
      onError(err)
    }
    return {
      channels,
      devicePubkey: nextDevicePubkey,
      channelPubkeyByOwnerPubkey: nextChannelPubkeyByOwnerPubkey,
      ownerPubkeyByChannelPubkey: nextOwnerPubkeyByChannelPubkey,
      channelSignerByChannelPubkey: nextChannelSignerByChannelPubkey,
      relaySetByChannelPubkey: new Map(channels.map(channel => [
        channel.pubkey,
        [...new Set([...(channel.relays || []), ...(channel.sendRelays || [])])]
      ])),
      signerChannelPubkeyByPeerPubkey: nextSignerChannelPubkeyByPeerPubkey,
      readRelaysByOwnerPubkey: nextReadRelaysByOwnerPubkey,
      emptyPersonalCopyContextByOwner: nextEmptyPersonalCopyContextByOwner,
      knownOwnerPubkeys: nextOwnerPubkeys,
      readyOwnerPubkeys: nextReadyOwnerPubkeys,
      channelBuildFailuresByOwner: nextChannelBuildFailuresByOwner,
      relayListRevision: snapshotRelayListRevision
    }
  }

  function clearRelayListWatcher () {
    stopRelayListWatcher?.()
    stopRelayListWatcher = null
    relayListWatcherKey = ''
  }

  function relayListWatcherPubkeys () {
    return [...knownOwnerPubkeys]
  }

  function ensureRelayListWatcher () {
    const pubkeys = relayListWatcherPubkeys()
    const key = [...pubkeys].sort().join(',')
    if (!key) {
      clearRelayListWatcher()
      return
    }
    if (stopRelayListWatcher && relayListWatcherKey === key) return
    clearRelayListWatcher()
    if (typeof window === 'undefined' && _subscribeRelayListUpdates === subscribeRelayListUpdates) return
    relayListWatcherKey = key
    try {
      stopRelayListWatcher = _subscribeRelayListUpdates(pubkeys, {
        relayType: 'read',
        onChange: onAccountRelayListChange
      })
    } catch (err) {
      clearRelayListWatcher()
      onError(err)
    }
  }

  function onAccountRelayListChange (update) {
    if (!knownOwnerPubkeys.has(update.pubkey)) return
    const relays = syncWatchRelays(update.relays?.read)
    const previous = readRelaysByOwnerPubkey.get(update.pubkey) || []
    if (previous.length === relays.length && previous.every(relay => relays.includes(relay))) return
    relayListRevision += 1
    readRelaysByOwnerPubkey.set(update.pubkey, relays)
    emitDebug('relay-list', {
      ownerPubkey: update.pubkey,
      relays,
      relayCount: relays.length
    })
    refresh()
  }

  function scheduleDrain () {
    if (!initialized) return
    if (drainRetryTimer) {
      _clearTimeout(drainRetryTimer)
      drainRetryTimer = null
      drainRetryAt = 0
    }
    const id = lifecycleId
    drainQueued = true
    if (channelConfiguration || draining || drainScheduled) return
    drainScheduled = true
    Promise.resolve().then(() => drainMessages(id))
  }

  function scheduleDrainRetry (delayMs = 1000) {
    if (!initialized) return
    const retryAt = _now() + Math.max(0, delayMs)
    if (drainRetryTimer && drainRetryAt <= retryAt) return
    if (drainRetryTimer) _clearTimeout(drainRetryTimer)
    drainRetryAt = retryAt
    drainRetryTimer = _setTimeout(() => {
      drainRetryTimer = null
      drainRetryAt = 0
      scheduleDrain()
    }, Math.max(0, retryAt - _now()))
    drainRetryTimer?.unref?.()
  }

  function clearContentKeyAskRetry () {
    if (contentKeyAskRetryTimer) _clearTimeout(contentKeyAskRetryTimer)
    contentKeyAskRetryTimer = null
    contentKeyAskRetryAt = 0
  }

  function scheduleContentKeyAskRetry (nextAtOverride) {
    if (!initialized || !messenger || !_secrets.isUnlocked() ||
        typeof _contentKeys.nextContentKeyAskRetryAt !== 'function') {
      clearContentKeyAskRetry()
      return
    }
    const nextAt = nextAtOverride === undefined
      ? _contentKeys.nextContentKeyAskRetryAt()
      : nextAtOverride
    if (!Number.isSafeInteger(nextAt) || nextAt <= 0) {
      clearContentKeyAskRetry()
      return
    }
    if (contentKeyAskRetryTimer && contentKeyAskRetryAt <= nextAt) return
    clearContentKeyAskRetry()
    const id = lifecycleId
    contentKeyAskRetryAt = nextAt
    contentKeyAskRetryTimer = _setTimeout(async () => {
      contentKeyAskRetryTimer = null
      contentKeyAskRetryAt = 0
      if (!isCurrentLifecycle(id) || !messenger || !_secrets.isUnlocked()) return
      if (channelConfiguration || refreshPromise) {
        scheduleContentKeyAskRetry(_now() + 1000)
        return
      }
      let nextAt
      try {
        if (typeof _contentKeys.retryDueContentKeyAsks === 'function') {
          nextAt = await _contentKeys.retryDueContentKeyAsks(syncHandlerContext())
        }
      } catch (error) {
        onError(error)
        nextAt = _now() + INBOX_HANDLER_RETRY_MS
      } finally {
        scheduleContentKeyAskRetry(nextAt)
      }
    }, Math.max(0, nextAt - _now()))
    contentKeyAskRetryTimer?.unref?.()
  }

  function flushMessengerResume (monitor = messengerStateMonitor) {
    if (!monitor?.resumePending || !initialized || !_secrets.isUnlocked() ||
      !messenger || messenger !== monitor.messenger) return
    if (channelConfiguration || refreshPromise) return
    monitor.resumePending = false
    ownersWaitingForResume.clear()
    trustedWaitingForResume = false
    scheduleAnnounceAll({ immediate: true, resetInterval: true })
    nostrDbSync.resumeAfterPause(nostrDbRuntimeContext()).catch(onError)
    scheduleDrain()
  }

  function observeMessengerState (monitor, status) {
    if (monitor !== messengerStateMonitor) return
    if (monitor.messenger && messenger !== monitor.messenger) return
    const paused = status?.paused === true
    const resumed = monitor.paused && !paused
    monitor.paused = paused
    if (paused) {
      monitor.resumePending = false
      return
    }
    if (!resumed) return
    monitor.resumePending = true
    queueMicrotask(() => flushMessengerResume(monitor))
  }

  function releaseStalledInboxHandler (entry) {
    if (!stalledInboxHandlers.delete(entry)) return
    if (entry.key && stalledInboxHandlerKeys.get(entry.key) === entry) {
      stalledInboxHandlerKeys.delete(entry.key)
    }
    if (initialized && _secrets.isUnlocked()) scheduleDrain()
  }

  function stallInboxHandler (entry) {
    stalledInboxHandlers.add(entry)
    if (entry.key) stalledInboxHandlerKeys.set(entry.key, entry)
    entry.handler.then(
      () => releaseStalledInboxHandler(entry),
      () => releaseStalledInboxHandler(entry)
    )
  }

  function abortStalledInboxHandlers (reason) {
    for (const entry of stalledInboxHandlers) entry.controller.abort(reason)
    stalledInboxHandlers.clear()
    stalledInboxHandlerKeys.clear()
  }

  async function drainMessages (id = lifecycleId) {
    drainScheduled = false
    if (!isCurrentLifecycle(id)) return
    if (channelConfiguration) return
    if (draining) return
    draining = true
    try {
      await replayQuarantinedMessages(id)
      while (drainQueued && isCurrentLifecycle(id)) {
        drainQueued = false
        let handled = 0
        emitDebug('drain', { phase: 'start' })
        let reachedEmptyQueue = false
        // eslint-disable-next-line no-unmodified-loop-condition
        while (isCurrentLifecycle(id) && messenger && !channelConfiguration && _secrets.isUnlocked()) {
          if (stalledInboxHandlers.size >= MAX_STALLED_INBOX_HANDLERS) {
            drainQueued = false
            break
          }
          const delivery = await messenger.nextMessage?.()
          if (!delivery) {
            reachedEmptyQueue = true
            break
          }
          const { message, ack, nack } = delivery
          if (!isCurrentLifecycle(id) || channelConfiguration || !_secrets.isUnlocked()) { await nack(); break }
          const deliveryKey = inboxDeliveryKey(message)
          if (deliveryKey && stalledInboxHandlerKeys.has(deliveryKey)) {
            await nack({ retryAfterMs: INBOX_HANDLER_RETRY_MS })
            scheduleDrainRetry(INBOX_HANDLER_RETRY_MS)
            continue
          }
          handled += 1
          if (debug) emitDebug('handle', messageDebugInfo(message))
          const processStartedAt = debug ? _performanceNow() : 0
          const processDiagnostic = debug
            ? {
                syncType: message?.type || '',
                syncCode: message?.code || '',
                operationCode: messageCode(message),
                requestId: messageRequestId(message) || undefined,
                payloadBytes: messagePayloadBytes(message),
                queuedAgeMs: Number.isSafeInteger(message?.receivedAt)
                  ? Math.max(0, _now() - message.receivedAt * 1000)
                  : undefined,
                outcome: 'ok'
              }
            : null
          try {
            const controller = new AbortController()
            const signal = delivery.ownershipSignal
              ? AbortSignal.any([controller.signal, delivery.ownershipSignal])
              : controller.signal
            const handler = Promise.resolve()
              .then(() => handleSyncMessage(message, {
                messenger: delivery.capacityEgress || messenger,
                signal,
                progress: delivery.progress,
                checkpoint: delivery.checkpoint
              }))
              .then(
                value => ({ status: 'resolved', value }),
                error => ({ status: 'rejected', error })
              )
            let deadlineTimer
            const deadline = new Promise(resolve => {
              deadlineTimer = _setTimeout(() => resolve({ status: 'timeout' }), INBOX_HANDLER_DEADLINE_MS)
              deadlineTimer?.unref?.()
            })
            const outcome = await Promise.race([handler, deadline])
            _clearTimeout(deadlineTimer)
            if (outcome.status === 'timeout') {
              if (processDiagnostic) processDiagnostic.outcome = 'timeout'
              const timeoutError = Object.assign(new Error('INBOX_HANDLER_TIMEOUT'), {
                code: 'INBOX_HANDLER_TIMEOUT',
                retryAfterMs: INBOX_HANDLER_RETRY_MS
              })
              const entry = { key: deliveryKey, controller, handler, startedAt: _now() }
              stallInboxHandler(entry)
              controller.abort(timeoutError)
              if (processDiagnostic) {
                emitDebug('inbox-handler-timeout', {
                  ...processDiagnostic,
                  handlerDurationMs: INBOX_HANDLER_DEADLINE_MS,
                  stalledHandlerCount: stalledInboxHandlers.size,
                  maxStalledHandlers: MAX_STALLED_INBOX_HANDLERS,
                  retryAfterMs: INBOX_HANDLER_RETRY_MS
                })
              }
              try {
                await nack({ retryAfterMs: INBOX_HANDLER_RETRY_MS })
              } catch (error) {
                onError(error)
              }
              scheduleDrainRetry(INBOX_HANDLER_RETRY_MS)
              continue
            }
            if (outcome.status === 'rejected') {
              if (processDiagnostic) processDiagnostic.outcome = 'failed'
              throw outcome.error
            }
            if (await ack() === false) throw inboxAckError(delivery.lastFailure)
          } catch (err) {
            let failure = err
            if (failure?.code === 'INBOX_ACK_FAILED') {
              onError(failure)
              drainQueued = false
              break
            }
            if (isSyncPayloadError(err)) {
              peerGuard.recordInvalidPayload({
                type: message?.type || 'message',
                channelPubkey: message?.channelPubkey || '',
                senderPubkey: message?.event?.pubkey || '',
                code: messageCode(message) || '',
                bytes: messagePayloadBytes(message),
                now: _now()
              })
              try {
                if (!err.quarantineable || !message?.event?.id) {
                  emitDebug('dropped-invalid-sync-message', {
                    syncCode: err.code,
                    syncType: message?.type || '',
                    operationCode: messageCode(message)
                  })
                } else {
                  const result = await _syncQuarantine.add(message, err, {
                    context: syncHandlerContext(),
                    decoderVersion: _quarantineDecoderVersion
                  })
                  if (['stored', 'oversized'].includes(result.status)) {
                    emitQuarantineDiagnostic(message, err, result)
                  } else {
                    emitDebug('quarantine-deduplicated', {
                      syncCode: err.code,
                      status: result.status,
                      evicted: result.evicted || 0
                    })
                  }
                }
                if (await ack() === false) throw inboxAckError(delivery.lastFailure)
                continue
              } catch (quarantineError) {
                failure = quarantineError
              }
            }
            if (failure?.code === 'INBOX_ACK_FAILED') {
              onError(failure)
              drainQueued = false
              break
            }
            const ownershipLost = delivery.ownershipSignal?.aborted === true
            if (!ownershipLost && failure?.inboxRetryScope === 'message') {
              const retryAt = publicationRetryAt(failure, _now())
              const retryAfterMs = retryAt > _now()
                ? retryAt - _now()
                : INBOX_HANDLER_RETRY_MS
              const globalFailure = failure.retryWhenOnline === true ||
                failure.retryWhenAvailable === true ||
                isInboxAdmissionError(failure) ||
                messenger?.readStatus?.().paused === true
              const nacked = await nack({ retryAfterMs })
              if (!nacked) throw inboxAckError(delivery.lastFailure)
              onError(failure)
              scheduleDrainRetry(retryAfterMs)
              if (globalFailure) {
                drainQueued = false
                break
              }
              continue
            }
            if (!ownershipLost) await nack()
            onError(failure)
            if (ownershipLost) {
              drainQueued = false
              break
            }
            // Capacity and pause are admission/lifecycle conditions, not
            // permanent handler failures. Keep the durable backlog moving.
            if (isInboxAdmissionError(failure) || messenger?.readStatus?.().paused) {
              drainQueued = true
              scheduleDrainRetry()
            } else {
              // Do not spin on a persistent storage/permission failure. A later
              // unlock, refresh or queued delivery schedules another attempt.
              drainQueued = false
            }
            break
          } finally {
            if (processDiagnostic) {
              emitDebug('message-processed', {
                ...processDiagnostic,
                elapsedMs: Math.max(0, Math.round(_performanceNow() - processStartedAt))
              })
            }
          }
        }
        if (reachedEmptyQueue) drainQueued = false
        emitDebug('drain', { phase: 'end', handled })
        if (channelConfiguration) break
      }
    } catch (err) {
      onError(err)
    } finally {
      draining = false
      if (isCurrentLifecycle(id) && drainQueued) scheduleDrain()
      else if (!isCurrentLifecycle(id) && initialized && drainQueued) scheduleDrain()
    }
  }

  function clearAnnouncementTimers ({ clearPending = true } = {}) {
    if (announceTimer) _clearTimeout(announceTimer)
    if (announceInterval) _clearInterval(announceInterval)
    announceTimer = null
    announceTimerAt = 0
    announceInterval = null
    pendingResetInterval = false
    trustedAnnounceRetryAt = 0
    announceRetryAtByOwner.clear()
    ownersWaitingForOnline.clear()
    ownersWaitingForResume.clear()
    trustedWaitingForOnline = false
    trustedWaitingForResume = false
    stopOnlineAnnouncements?.()
    stopOnlineAnnouncements = null
    if (clearPending) pendingAnnounceOwners.clear()
  }

  function waitForOnlineAnnouncements () {
    if (stopOnlineAnnouncements) return true
    try {
      const stop = _onOnline(() => {
        stopOnlineAnnouncements = null
        stop?.()
        ownersWaitingForOnline.clear()
        ownersWaitingForResume.clear()
        trustedWaitingForOnline = false
        trustedWaitingForResume = false
        if (initialized && messenger && _secrets.isUnlocked()) {
          scheduleAnnounceAll({ immediate: true })
        }
      })
      stopOnlineAnnouncements = typeof stop === 'function' ? stop : null
      return true
    } catch (error) {
      onError(error)
      return false
    }
  }

  function announcementRetryAt (error, now) {
    if (error?.retryWhenOnline === true) {
      if (waitForOnlineAnnouncements()) {
        return { waitForOnline: true, waitForResume: false, retryAt: publicationRetryAt(error, now) }
      }
    }
    if (error?.retryWhenAvailable === true && messenger?.readStatus?.().paused === true) {
      return { waitForOnline: false, waitForResume: true, retryAt: publicationRetryAt(error, now) }
    }
    return {
      waitForOnline: false,
      waitForResume: false,
      retryAt: publicationRetryAt(error, now) || now + 1
    }
  }

  function armAnnouncementTimer (id, at) {
    const target = Math.max(_now(), at)
    if (announceTimer && announceTimerAt <= target) return
    if (announceTimer) _clearTimeout(announceTimer)
    announceTimerAt = target
    announceTimer = _setTimeout(() => {
      announceTimer = null
      announceTimerAt = 0
      return flushAnnouncements(id)
    }, target - _now())
    announceTimer?.unref?.()
  }

  function scheduleNextAnnouncementRetry (id) {
    const now = _now()
    const deadlines = [...pendingAnnounceOwners]
      .filter(ownerPubkey =>
        !ownersWaitingForOnline.has(ownerPubkey) &&
        !ownersWaitingForResume.has(ownerPubkey))
      .map(ownerPubkey => announceRetryAtByOwner.get(ownerPubkey) || 0)
      .concat(trustedWaitingForOnline || trustedWaitingForResume ? [] : [trustedAnnounceRetryAt])
      .filter(retryAt => retryAt > now)
    if (deadlines.length) armAnnouncementTimer(id, Math.min(...deadlines))
  }

  function ensureAnnouncementInterval () {
    if (announceInterval) return
    const id = lifecycleId
    announceInterval = _setInterval(() => {
      if (isCurrentLifecycle(id)) scheduleAnnounceAll()
    }, ANNOUNCE_INTERVAL_MS)
    announceInterval?.unref?.()
  }

  function resetAnnouncementInterval () {
    if (announceInterval) _clearInterval(announceInterval)
    announceInterval = null
    if (messenger && _secrets.isUnlocked()) ensureAnnouncementInterval()
  }

  async function flushAnnouncements (id = lifecycleId) {
    if (!isCurrentLifecycle(id)) return
    announceTimer = null
    announceTimerAt = 0
    const resetInterval = pendingResetInterval
    pendingResetInterval = false
    const currentRefresh = refreshPromise
    if (currentRefresh) await currentRefresh
    if (!isCurrentLifecycle(id)) return
    if (!messenger || !_secrets.isUnlocked()) {
      return
    }
    const currentMessenger = messenger
    const receivers = trustedPubkeys()
    const peerChannels = new Map(signerChannelPubkeyByPeerPubkey)
    const ownerChannels = new Map(channelPubkeyByOwnerPubkey)
    const readyOwners = new Set(readyOwnerPubkeys)
    const hasSignerSyncTargets = peerChannels.size > 0
    if (!receivers.length && !hasSignerSyncTargets) {
      pendingAnnounceOwners.clear()
      return
    }

    const owners = pendingAnnounceOwners.has(ANNOUNCE_ALL)
      ? nsecOwnerPubkeys(_store)
      : [...pendingAnnounceOwners]
    pendingAnnounceOwners.clear()
    const now = _now()

    if (receivers.length) {
      for (const ownerPubkey of owners) {
        if (!isCurrentLifecycle(id)) return
        const retryAt = announceRetryAtByOwner.get(ownerPubkey) || 0
        if (retryAt > now) {
          pendingAnnounceOwners.add(ownerPubkey)
          continue
        }
        const channelPubkey = ownerChannels.get(ownerPubkey)
        if (!readyOwners.has(ownerPubkey) || !channelPubkey) {
          pendingAnnounceOwners.add(ownerPubkey)
          emitDebug('announce-deferred', {
            ownerPubkey,
            reason: channelBuildFailuresByOwner.has(ownerPubkey) ? 'channel-build-failed' : 'channel-not-ready'
          })
          continue
        }
        try {
          await assertPublished(await _contentKeys.announceContentKeys({
            messenger: currentMessenger,
            channelPubkey,
            ownerPubkey,
            receiverPubkeys: receivers,
            debug
          }))
          if (HEX32.test(ownerPubkey)) {
            await assertPublished(await nostrDbSync.announceRange({
              messenger: currentMessenger,
              channelPubkey,
              ownerPubkey,
              receiverPubkeys: receivers,
              debug
            }))
          }
          announceRetryAtByOwner.delete(ownerPubkey)
          ownersWaitingForOnline.delete(ownerPubkey)
          ownersWaitingForResume.delete(ownerPubkey)
        } catch (err) {
          pendingAnnounceOwners.add(ownerPubkey)
          const advice = announcementRetryAt(err, now)
          if (advice.waitForOnline) ownersWaitingForOnline.add(ownerPubkey)
          else ownersWaitingForOnline.delete(ownerPubkey)
          if (advice.waitForResume) ownersWaitingForResume.add(ownerPubkey)
          else ownersWaitingForResume.delete(ownerPubkey)
          if (advice.retryAt) announceRetryAtByOwner.set(ownerPubkey, advice.retryAt)
          else announceRetryAtByOwner.delete(ownerPubkey)
          onError(err)
        }
      }
    }
    if (!trustedAnnounceRetryAt || trustedAnnounceRetryAt <= now) {
      try {
        await _trustedSignerSync.announceTrustedSignerState({
          messenger: currentMessenger,
          peerChannels,
          records: trustedRecords(),
          activePeerPubkeys: receivers,
          reminderRecords: removedReminderRecords(),
          debug
        })
        trustedAnnounceRetryAt = 0
        trustedWaitingForOnline = false
        trustedWaitingForResume = false
      } catch (err) {
        const advice = announcementRetryAt(err, now)
        trustedWaitingForOnline = advice.waitForOnline
        trustedWaitingForResume = advice.waitForResume
        trustedAnnounceRetryAt = advice.retryAt || 0
        onError(err)
      }
    }
    if (resetInterval && isCurrentLifecycle(id)) resetAnnouncementInterval()
    scheduleNextAnnouncementRetry(id)
  }

  function scheduleAnnounce (ownerPubkey, { immediate = false, resetInterval = false } = {}) {
    if (!initialized) return
    const id = lifecycleId
    if (ownerPubkey) pendingAnnounceOwners.add(ownerPubkey)
    else pendingAnnounceOwners.add(ANNOUNCE_ALL)
    pendingResetInterval = pendingResetInterval || resetInterval
    const now = _now()
    let at = now + (immediate ? 0 : ANNOUNCE_DEBOUNCE_MS)
    for (const pendingOwner of pendingAnnounceOwners) {
      const retryAt = announceRetryAtByOwner.get(pendingOwner) || 0
      if (retryAt > now) at = Math.min(at, retryAt)
    }
    if (trustedAnnounceRetryAt > now) at = Math.min(at, trustedAnnounceRetryAt)
    armAnnouncementTimer(id, at)
  }

  function scheduleAnnounceAll (options) {
    scheduleAnnounce('', options)
  }

  function onContentKeyChange (ownerPubkey) {
    if (!_secrets.isUnlocked()) return
    if (!messenger) refresh()
    else messenger.retryPendingDecryptions?.().catch(onError)
    scheduleAnnounce(ownerPubkey, { immediate: true, resetInterval: true })
    scheduleContentKeyAskRetry()
  }

  function nostrDbRuntimeContext () {
    return {
      messenger,
      trustedByPubkey,
      channelPubkeyForOwner,
      ownerPubkeyForChannel,
      ownerPubkeys: new Set(nostrDbOwnerPubkeys(_store)),
      emptyPersonalCopyContextByOwner,
      readyOwnerPubkeys: new Set([...readyOwnerPubkeys].filter(pubkey => HEX32.test(pubkey))),
      channelSignerFor: channelPubkey => channelSignerByChannelPubkey.get(channelPubkey) || null,
      relaysForChannel: channelPubkey => [...(relaySetByChannelPubkey.get(channelPubkey) || [])],
      onRangeChanged: ownerPubkey => scheduleAnnounce(ownerPubkey),
      debug
    }
  }

  function requestNostrDbAppBackfill ({ ownerPubkey, appId } = {}) {
    const owner = typeof ownerPubkey === 'string' ? ownerPubkey.toLowerCase() : ''
    const app = typeof appId === 'string' ? appId : ''
    if (!HEX32.test(owner) || !app || app.length > APP_ID_MAX_LENGTH || !nostrDbOwnerPubkeys(_store).includes(owner)) return false
    const context = nostrDbRuntimeContext()
    if (_secrets.isUnlocked() && !context.trustedByPubkey.size) {
      context.trustedByPubkey = trustedMap(_trustedSigners.list())
    }
    context.deferAppBackfillPeerResolution = !_secrets.isUnlocked()
    const accepted = nostrDbSync.requestAppBackfill({ ownerPubkey: owner, appId: app }, context)
    if (accepted && initialized && _secrets.isUnlocked() && !readyOwnerPubkeys.has(owner)) {
      refresh().catch(onError)
    }
    return accepted || _secrets.isUnlocked()
  }

  function refreshNostrDbLaneModes () {
    if (typeof nostrDbSync.refreshLaneModes !== 'function') return Promise.resolve(false)
    return nostrDbSync.refreshLaneModes(nostrDbRuntimeContext())
  }

  async function scheduleRotationsForRemovedRecords (records = []) {
    if (!records.length || !_secrets.isUnlocked()) return
    let localActorPubkey = devicePubkey
    if (!localActorPubkey && typeof _secrets.getDeviceSignerPubkey === 'function') {
      localActorPubkey = await _secrets.getDeviceSignerPubkey().catch(() => '')
    }
    for (const record of records) {
      if (!record?.pubkey || record.pubkey === localActorPubkey) continue
      await _revocationRotation.scheduleRevocationRotationsForRemovedSigner({
        removedSignerPubkey: record.pubkey,
        removalUpdatedAt: record.updatedAt,
        actorPubkey: record.actorPubkey,
        localActorPubkey
      })
    }
    await _revocationRotation.runDueRevocationRotations?.()
    await _revocationRotation.startRevocationRotation?.()
  }

  function onTrustedSignerChange (detail = {}) {
    if (detail.action !== 'clear-active') {
      Promise.resolve(scheduleRotationsForRemovedRecords(detail.removedRecords || []))
        .catch(onError)
    }
    const promise = refresh()
      .then(() => {
        if (initialized && _secrets.isUnlocked()) {
          scheduleAnnounceAll({ immediate: true, resetInterval: true })
          scheduleContentKeyAskRetry()
        }
      })
    return promise
  }

  function stop () {
    const currentMessenger = messenger
    abortStalledInboxHandlers(new DOMException('Sync stopped', 'AbortError'))
    messenger = null
    if (messengerStateMonitor) {
      messengerStateMonitor.messenger = null
      messengerStateMonitor.resumePending = false
    }
    channelConfiguration = null
    drainQueued = false
    drainScheduled = false
    if (drainRetryTimer) {
      _clearTimeout(drainRetryTimer)
      drainRetryTimer = null
      drainRetryAt = 0
    }
    clearRelayListWatcher()
    channelPubkeyByOwnerPubkey.clear()
    ownerPubkeyByChannelPubkey.clear()
    signerChannelPubkeyByPeerPubkey.clear()
    readRelaysByOwnerPubkey.clear()
    emptyPersonalCopyContextByOwner.clear()
    relayListRevision += 1
    knownOwnerPubkeys.clear()
    readyOwnerPubkeys.clear()
    channelBuildFailuresByOwner.clear()
    devicePubkey = ''
    clearAnnouncementTimers()
    clearContentKeyAskRetry()
    nostrDbSync.stop()
    _contentKeys.resetDebugSources?.()
    return Promise.resolve(currentMessenger?.close?.()).catch(onError)
  }

  function isInboxAdmissionError (error) {
    return error?.code === 'PRIVATE_MESSENGER_CAPACITY_PRESSURE' ||
      error?.code === 'PRIVATE_MESSENGER_PAUSED' ||
      error?.message === 'PRIVATE_MESSENGER_CAPACITY_PRESSURE' ||
      error?.message === 'PRIVATE_MESSENGER_PAUSED'
  }

  async function refreshNow (id = lifecycleId) {
    if (!isCurrentLifecycle(id)) return null
    if (!_secrets.isUnlocked()) {
      await stop()
      return null
    }

    const userSigner = await _secrets.getDeviceSigner()
    if (!isCurrentLifecycle(id)) return null
    devicePubkey = await userSigner.getPublicKey()
    await _trustedSigners.forgetLocal?.(devicePubkey)
    trustedByPubkey = trustedMap(_trustedSigners.list())
    const snapshot = await buildChannels(userSigner)
    if (!isCurrentLifecycle(id)) return null
    await _contentKeys.pruneContentKeyAskState?.({
      ownerPubkeys: new Set(nostrDbOwnerPubkeys(_store)),
      peerPubkeys: new Set(trustedByPubkey.keys())
    })
    if (!isCurrentLifecycle(id)) return null
    if (!snapshot.channels.length) {
      const currentMessenger = messenger
      messenger = null
      if (messengerStateMonitor) {
        messengerStateMonitor.messenger = null
        messengerStateMonitor.resumePending = false
      }
      clearAnnouncementTimers({ clearPending: false })
      nostrDbSync.stop()
      await Promise.resolve(currentMessenger?.close?.()).catch(onError)
      if (!isCurrentLifecycle(id)) return null
      publishChannelSnapshot(snapshot)
      ensureRelayListWatcher()
      nostrDbSync.ensureSubscriptions(nostrDbRuntimeContext())
      return null
    }

    const options = {
      userSigner,
      contentKeySigner: null,
      channels: snapshot.channels,
      relays: [],
      mode: 'seeder'
    }

    // Deliveries can arrive as soon as local messenger initialization finishes.
    // Publish the corresponding routing snapshot before allowing their ACKs.
    const configuration = {}
    channelConfiguration = configuration
    try {
      if (!messenger) {
        const monitor = { messenger: null, paused: false, resumePending: false }
        messengerStateMonitor = monitor
        const nextMessenger = new MessengerClass({
          onMessageQueued: scheduleDrain,
          onError,
          onStateChanged: status => observeMessengerState(monitor, status),
          resolveInboundCoalescing: message => resolveInboundCoalescing(message, _coalescingHints),
          resolveInboundPriority,
          admitInboundPeer: (message, context) => peerGuard.admit(message, context),
          useContentKeys: false,
          onDebug: debug
        })
        monitor.messenger = nextMessenger
        messenger = nextMessenger
        try {
          await nextMessenger.init(options)
        } catch (err) {
          if (messenger === nextMessenger) {
            messenger = null
            monitor.messenger = null
            monitor.resumePending = false
          }
          await Promise.resolve(nextMessenger.close?.()).catch(onError)
          throw err
        }
        if (!isCurrentLifecycle(id)) {
          if (messenger === nextMessenger) {
            messenger = null
            await nextMessenger.close?.()
          }
          return null
        }
      } else {
        const currentMessenger = messenger
        await currentMessenger.update(options)
        if (!isCurrentLifecycle(id) || messenger !== currentMessenger) return null
      }

      publishChannelSnapshot(snapshot)
    } finally {
      if (channelConfiguration === configuration) channelConfiguration = null
    }
    flushMessengerResume()
    ensureRelayListWatcher()
    nostrDbSync.ensureSubscriptions(nostrDbRuntimeContext())
    ensureAnnouncementInterval()
    scheduleAnnounceAll()
    scheduleDrain()
    scheduleContentKeyAskRetry()
    return messenger
  }

  function refresh () {
    if (refreshPromise) {
      refreshQueued = true
      return refreshPromise
    }
    const id = lifecycleId
    const promise = Promise.resolve()
      .then(async () => {
        let result = null
        do {
          refreshQueued = false
          result = await refreshNow(id)
        } while (refreshQueued && isCurrentLifecycle(id))
        return result
      })
      .catch(err => {
        onError(err)
        return null
      })
      .finally(() => {
        if (refreshPromise === promise) refreshPromise = null
        const monitor = messengerStateMonitor
        if (monitor?.resumePending) queueMicrotask(() => flushMessengerResume(monitor))
      })
    refreshPromise = promise
    return refreshPromise
  }

  function refreshOnStoreIdentityChange () {
    if (_hasPendingMutation()) return null
    const nextKey = syncAccountIdentityKey(_store)
    if (nextKey === lastStoreIdentityKey) return null
    lastStoreIdentityKey = nextKey
    return refresh()
  }

  function refreshAfterAccountMutation () {
    if (!initialized || _hasPendingMutation()) return null
    if (refreshPromise) {
      return refreshPromise.then(() => {
        if (!initialized || _hasPendingMutation()) return null
        return refreshOnStoreIdentityChange()
      })
    }
    return refreshOnStoreIdentityChange()
  }

  function onSecretsChange () {
    if (!initialized) return null
    if (!_secrets.isUnlocked()) {
      lifecycleId += 1
      refreshPromise = null
      refreshQueued = false
      return stop()
    }
    if (_hasPendingMutation()) return null
    return refresh()
  }

  function init () {
    if (initialized) return refresh()
    PrivateMessenger.maintainStorage().catch(onError)
    initialized = true
    lifecycleId += 1
    lastStoreIdentityKey = syncAccountIdentityKey(_store)
    unsubscribers.push(_secrets.subscribe(onSecretsChange))
    if (_secrets.subscribeContentKeys) unsubscribers.push(_secrets.subscribeContentKeys(onContentKeyChange))
    unsubscribers.push(_store.subscribe(refreshOnStoreIdentityChange))
    unsubscribers.push(_subscribePendingMutations(refreshAfterAccountMutation))
    unsubscribers.push(_trustedSigners.subscribe(onTrustedSignerChange))
    return refresh()
  }

  function close () {
    lifecycleId += 1
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
    initialized = false
    refreshPromise = null
    refreshQueued = false
    return stop()
  }

  return {
    init,
    refresh,
    refreshNow,
    stop,
    close,
    scheduleAnnounce,
    scheduleAnnounceAll,
    refreshNostrDbLaneModes,
    get messenger () { return messenger },
    get trustedByPubkey () { return trustedByPubkey },
    getDebugSnapshot: () => {
      const contentKeys = _contentKeys.getDebugSnapshot?.() || {}
      const nostrDb = nostrDbSync.getDebugSnapshot?.() || {}
      const peerGuardSnapshot = _peerGuardDebugSnapshot()
      return {
        ...contentKeys,
        askStats: {
          contentKeys: contentKeys.askStats || { emitted: {}, suppressed: {} },
          nostrDb: nostrDb.askStats || { emitted: {}, suppressed: {} }
        },
        push: nostrDb.push || {
          idleWakeCount: 0,
          idleWakeMs: 0,
          lastIdleWakeAt: null
        },
        appBackfills: nostrDb.appBackfills || {
          counts: {
            active: 0,
            stalled: 0,
            bestEffortComplete: 0,
            complete: 0
          },
          settledReasons: {}
        },
        exchange: nostrDb.exchange || {},
        inboxHandlers: {
          stalled: stalledInboxHandlers.size,
          maxStalled: MAX_STALLED_INBOX_HANDLERS,
          deadlineMs: INBOX_HANDLER_DEADLINE_MS,
          retryAfterMs: INBOX_HANDLER_RETRY_MS
        },
        peerGuard: peerGuardSnapshot
      }
    },
    subscribeDebug: _contentKeys.subscribeDebug,
    generateAndPublishContentKey: (ownerPubkey, options = {}) => _contentKeys.generateAndPublishContentKey({
      ownerPubkey,
      ...options
    }),
    requestNostrDbAppBackfill
  }

  function _peerGuardDebugSnapshot () {
    return peerGuard.getDebugSnapshot?.().peerGuard || {
      admitted: 0,
      droppedByQuota: 0,
      droppedByCooldown: 0,
      violations: 0,
      cooldownsOpened: 0,
      cooldownsExpired: 0,
      droppedByCode: {},
      cooldownDropsByCode: {},
      violationsByReason: {}
    }
  }
}

const controller = createSyncController()

export const init = controller.init
export const refresh = controller.refresh
export const stop = controller.stop
export const close = controller.close
export const scheduleAnnounce = controller.scheduleAnnounce
export const scheduleAnnounceAll = controller.scheduleAnnounceAll
export const refreshNostrDbLaneModes = controller.refreshNostrDbLaneModes
export const getDebugSnapshot = controller.getDebugSnapshot
export const subscribeDebug = controller.subscribeDebug
export const generateAndPublishContentKey = controller.generateAndPublishContentKey
export const requestNostrDbAppBackfill = controller.requestNostrDbAppBackfill
