import { PrivateMessenger } from 'libp2r2p/private-messenger'
import { claimSigner } from '../signer.js'
import { subscribeRelayListUpdates } from 'libp2r2p/relay'
import * as store from '../accounts-store.js'
import * as secrets from '../secrets.js'
import * as trustedSigners from '../trusted-signers.js'
import * as deviceRelays from '../device-relays.js'
import * as contentKeys from './content-keys.js'
import * as trustedSignerSync from './trusted-signers.js'
import * as revocationRotation from './revocation-rotation.js'
import { createNostrDbSyncController } from './nostrdb.js'
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

// Account data sync derives one private channel per unlocked nsec account and
// talks only to configured trusted signer pubkeys. Content-key sync exchanges
// key metadata/secrets, while NostrDB sync uses the same account-scoped channel
// context to exchange local database inventory and event rows. Trusted-signer
// list sync is device-scoped instead: one shared-key channel per peer signer.

function defaultOnError (err) {
  console.warn('sync failed', err?.message ?? err)
}

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function isTopLevelWindow () {
  try {
    return typeof window !== 'undefined' && window === window.top
  } catch {
    return false
  }
}

function redactDebugEvent (event) {
  try {
    return JSON.parse(JSON.stringify(event, (key, value) => {
      const name = String(key).toLowerCase()
      if (name.includes('seckey') || name.includes('secret') || name === 'payload' || name === 'content') {
        return '[redacted]'
      }
      return value
    }))
  } catch {
    return { source: 'sync', action: 'debug', redacted: true }
  }
}

function defaultDebugSink () {
  if (!isTopLevelWindow()) return null
  return event => {
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

function messageDebugInfo (message) {
  return {
    type: message?.type || '',
    code: messageCode(message),
    channelPubkey: message?.channelPubkey || '',
    senderPubkey: message?.event?.pubkey || '',
    eventId: message?.event?.id || '',
    outerId: message?.outer?.id || '',
    outerCreatedAt: message?.outer?.created_at || message?.event?.created_at || 0
  }
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
  _claimSigner = claimSigner,
  _subscribeRelayListUpdates = subscribeRelayListUpdates,
  _hasPendingMutation = hasPendingMutation,
  _subscribePendingMutations = subscribePendingMutations,
  _setTimeout = globalThis.setTimeout.bind(globalThis),
  _clearTimeout = globalThis.clearTimeout.bind(globalThis),
  _setInterval = globalThis.setInterval.bind(globalThis),
  _clearInterval = globalThis.clearInterval.bind(globalThis),
  _debug,
  onError = defaultOnError
} = {}) {
  let initialized = false
  let messenger = null
  let trustedByPubkey = new Map()
  let refreshPromise = null
  let drainQueued = false
  let drainScheduled = false
  let draining = false
  let announceTimer = null
  let announceInterval = null
  let pendingResetInterval = false
  let lastStoreIdentityKey = ''
  let stopRelayListWatcher = null
  let relayListWatcherKey = ''
  let relayListRevision = 0
  let refreshQueued = false
  let lifecycleId = 0
  const pendingAnnounceOwners = new Set()
  const unsubscribers = []
  const channelPubkeyByOwnerPubkey = new Map()
  const ownerPubkeyByChannelPubkey = new Map()
  const signerChannelPubkeyByPeerPubkey = new Map()
  const readRelaysByOwnerPubkey = new Map()
  const knownOwnerPubkeys = new Set()
  const readyOwnerPubkeys = new Set()
  const channelBuildFailuresByOwner = new Map()
  let devicePubkey = ''
  const debug = _debug === undefined ? defaultDebugSink() : _debug
  const nostrDbSync = _createNostrDbSyncController({
    _setTimeout,
    _clearTimeout,
    onError
  })

  function emitDebug (action, detail = {}) {
    try {
      debug?.({ source: 'sync', action, ...detail })
    } catch (err) {
      onError(err)
    }
  }

  function assertPublished (result) {
    if (!result?.delivery) return result
    const reports = result.delivery.reports
    if (!Array.isArray(reports) || !reports.length || reports.some(report => report?.success !== true)) {
      throw new Error('SYNC_PUBLICATION_FAILED')
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
    replaceMap(signerChannelPubkeyByPeerPubkey, snapshot.signerChannelPubkeyByPeerPubkey)
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
    const nextSignerChannelPubkeyByPeerPubkey = new Map()
    const nextOwnerPubkeys = new Set()
    const nextReadyOwnerPubkeys = new Set()
    const nextReadRelaysByOwnerPubkey = new Map()
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
      nextReadRelaysByOwnerPubkey.set(account.pubkey, relays)
      nextChannelPubkeyByOwnerPubkey.set(account.pubkey, channelPubkey)
      nextOwnerPubkeyByChannelPubkey.set(channelPubkey, account.pubkey)
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
      signerChannelPubkeyByPeerPubkey: nextSignerChannelPubkeyByPeerPubkey,
      readRelaysByOwnerPubkey: nextReadRelaysByOwnerPubkey,
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
    const id = lifecycleId
    drainQueued = true
    if (draining || drainScheduled) return
    drainScheduled = true
    Promise.resolve().then(() => drainMessages(id))
  }

  async function drainMessages (id = lifecycleId) {
    drainScheduled = false
    if (!isCurrentLifecycle(id)) return
    if (draining) return
    draining = true
    try {
      while (drainQueued && isCurrentLifecycle(id)) {
        drainQueued = false
        let handled = 0
        emitDebug('drain', { phase: 'start' })
        let reachedEmptyQueue = false
        // eslint-disable-next-line no-unmodified-loop-condition
        while (isCurrentLifecycle(id) && messenger && _secrets.isUnlocked()) {
          const message = await messenger.nextMessage?.()
          if (!message) {
            reachedEmptyQueue = true
            break
          }
          handled += 1
          emitDebug('handle', messageDebugInfo(message))
          try {
            const handled = await _contentKeys.handleMessage(message, {
              messenger,
              trustedByPubkey,
              ownerPubkeyForChannel,
              debug
            })
            if (!handled) {
              const handledTrustedSigners = await _trustedSignerSync.handleMessage(message, {
                messenger,
                trustedByPubkey,
                devicePubkey,
                trustedSigners: _trustedSigners,
                debug
              })
              if (!handledTrustedSigners) {
                await nostrDbSync.handleMessage(message, {
                  messenger,
                  trustedByPubkey,
                  ownerPubkeyForChannel,
                  channelPubkeyForOwner,
                  ownerPubkeys: new Set(nostrDbOwnerPubkeys(_store)),
                  debug
                })
              }
            }
          } catch (err) {
            onError(err)
          }
        }
        if (reachedEmptyQueue) drainQueued = false
        emitDebug('drain', { phase: 'end', handled })
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
    announceInterval = null
    pendingResetInterval = false
    if (clearPending) pendingAnnounceOwners.clear()
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

    if (receivers.length) {
      for (const ownerPubkey of owners) {
        if (!isCurrentLifecycle(id)) return
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
          assertPublished(await _contentKeys.announceContentKeys({
            messenger: currentMessenger,
            channelPubkey,
            ownerPubkey,
            receiverPubkeys: receivers,
            debug
          }))
          if (HEX32.test(ownerPubkey)) {
            assertPublished(await nostrDbSync.announceRange({
              messenger: currentMessenger,
              channelPubkey,
              ownerPubkey,
              receiverPubkeys: receivers,
              debug
            }))
          }
        } catch (err) {
          pendingAnnounceOwners.add(ownerPubkey)
          onError(err)
        }
      }
    }
    try {
      await _trustedSignerSync.announceTrustedSignerState({
        messenger: currentMessenger,
        peerChannels,
        records: trustedRecords(),
        activePeerPubkeys: receivers,
        reminderRecords: removedReminderRecords(),
        debug
      })
    } catch (err) {
      pendingAnnounceOwners.add(ANNOUNCE_ALL)
      onError(err)
    }
    if (resetInterval && isCurrentLifecycle(id)) resetAnnouncementInterval()
  }

  function scheduleAnnounce (ownerPubkey, { immediate = false, resetInterval = false } = {}) {
    if (!initialized) return
    const id = lifecycleId
    if (ownerPubkey) pendingAnnounceOwners.add(ownerPubkey)
    else pendingAnnounceOwners.add(ANNOUNCE_ALL)
    pendingResetInterval = pendingResetInterval || resetInterval
    if (announceTimer && !immediate) return
    if (announceTimer) _clearTimeout(announceTimer)
    announceTimer = _setTimeout(() => flushAnnouncements(id), immediate ? 0 : ANNOUNCE_DEBOUNCE_MS)
    announceTimer?.unref?.()
  }

  function scheduleAnnounceAll (options) {
    scheduleAnnounce('', options)
  }

  function onContentKeyChange (ownerPubkey) {
    if (!_secrets.isUnlocked()) return
    if (!messenger) refresh()
    scheduleAnnounce(ownerPubkey, { immediate: true, resetInterval: true })
  }

  function nostrDbRuntimeContext () {
    return {
      messenger,
      trustedByPubkey,
      channelPubkeyForOwner,
      ownerPubkeyForChannel,
      ownerPubkeys: new Set(nostrDbOwnerPubkeys(_store)),
      readyOwnerPubkeys: new Set([...readyOwnerPubkeys].filter(pubkey => HEX32.test(pubkey))),
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
        }
      })
    return promise
  }

  function stop () {
    const currentMessenger = messenger
    messenger = null
    drainQueued = false
    drainScheduled = false
    clearRelayListWatcher()
    channelPubkeyByOwnerPubkey.clear()
    ownerPubkeyByChannelPubkey.clear()
    signerChannelPubkeyByPeerPubkey.clear()
    readRelaysByOwnerPubkey.clear()
    relayListRevision += 1
    knownOwnerPubkeys.clear()
    readyOwnerPubkeys.clear()
    channelBuildFailuresByOwner.clear()
    devicePubkey = ''
    clearAnnouncementTimers()
    nostrDbSync.stop()
    _contentKeys.resetDebugSources?.()
    return Promise.resolve(currentMessenger?.close?.()).catch(onError)
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
    if (!snapshot.channels.length) {
      const currentMessenger = messenger
      messenger = null
      clearAnnouncementTimers({ clearPending: false })
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

    if (!messenger) {
      const nextMessenger = new MessengerClass({ onMessageQueued: scheduleDrain, onError, useContentKeys: false, onDebug: debug })
      messenger = nextMessenger
      try {
        await nextMessenger.init(options)
      } catch (err) {
        if (messenger === nextMessenger) messenger = null
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
    ensureRelayListWatcher()
    nostrDbSync.ensureSubscriptions(nostrDbRuntimeContext())
    ensureAnnouncementInterval()
    scheduleAnnounceAll()
    scheduleDrain()
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
    get messenger () { return messenger },
    get trustedByPubkey () { return trustedByPubkey },
    getDebugSnapshot: _contentKeys.getDebugSnapshot,
    subscribeDebug: _contentKeys.subscribeDebug,
    generateAndPublishContentKey: (ownerPubkey, options = {}) => _contentKeys.generateAndPublishContentKey({
      ownerPubkey,
      ...options
    }),
    requestNostrDbAppBackfill
  }
}

const controller = createSyncController()

export const init = controller.init
export const refresh = controller.refresh
export const stop = controller.stop
export const close = controller.close
export const scheduleAnnounce = controller.scheduleAnnounce
export const scheduleAnnounceAll = controller.scheduleAnnounceAll
export const getDebugSnapshot = controller.getDebugSnapshot
export const subscribeDebug = controller.subscribeDebug
export const generateAndPublishContentKey = controller.generateAndPublishContentKey
export const requestNostrDbAppBackfill = controller.requestNostrDbAppBackfill
