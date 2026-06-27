import { PrivateMessenger } from '../private-messenger/index.js'
import { claimSigner } from '../signer.js'
import { subscribeRelayListUpdates } from '../../helpers/nostr/queries.js'
import * as store from '../accounts-store.js'
import * as secrets from '../secrets.js'
import * as trustedSigners from '../trusted-signers.js'
import * as deviceRelays from '../device-relays.js'
import * as contentKeys from './content-keys.js'
import * as trustedSignerSync from './trusted-signers.js'
import * as revocationRotation from './revocation-rotation.js'
import { createNostrDbSyncController } from './nostrdb.js'
import { filterVisibleAccounts } from '../account-mutations.js'

const ANNOUNCE_INTERVAL_MS = 4 * 60 * 60 * 1000
const ANNOUNCE_DEBOUNCE_MS = 1000
const ANNOUNCE_ALL = '*'
const TRUSTED_SIGNER_SYNC_INFO = 'trusted-signer-sync-v1'
const HEX32 = /^[0-9a-f]{64}$/i

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
  let lifecycleId = 0
  const pendingAnnounceOwners = new Set()
  const unsubscribers = []
  const channelPubkeyByOwnerPubkey = new Map()
  const ownerPubkeyByChannelPubkey = new Map()
  const signerChannelPubkeyByPeerPubkey = new Map()
  const readRelaysByOwnerPubkey = new Map()
  let devicePubkey = ''
  const debug = _debug === undefined ? defaultDebugSink() : _debug
  const nostrDbSync = _createNostrDbSyncController({
    _setTimeout,
    _clearTimeout,
    onError,
    storage: globalThis.localStorage
  })

  function emitDebug (action, detail = {}) {
    try {
      debug?.({ source: 'sync', action, ...detail })
    } catch (err) {
      onError(err)
    }
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
    return channelPubkeyByOwnerPubkey.get(ownerPubkey) || ownerPubkey
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

  async function buildChannels (deviceSigner) {
    const seeders = trustedPubkeys()
    const channels = []
    const nextChannelPubkeyByOwnerPubkey = new Map()
    const nextOwnerPubkeyByChannelPubkey = new Map()
    const nextSignerChannelPubkeyByPeerPubkey = new Map()
    const nextOwnerPubkeys = new Set()
    for (const account of filterVisibleAccounts(_store.list())) {
      if (account.type !== 'nsec') continue
      nextOwnerPubkeys.add(account.pubkey)
      try {
        const accountSigner = _claimSigner(account)
        const channelSigner = accountSigner.withSharedKey(account.pubkey, TRUSTED_SIGNER_SYNC_INFO)
        const channelPubkey = await channelSigner.getPublicKey()
        const relays = await accountReadRelays(account.pubkey, accountSigner)
        nextChannelPubkeyByOwnerPubkey.set(account.pubkey, channelPubkey)
        nextOwnerPubkeyByChannelPubkey.set(channelPubkey, account.pubkey)
        channels.push({
          pubkey: channelPubkey,
          signer: channelSigner,
          relays,
          sendRelays: syncRelays(relays),
          mode: 'seeder',
          seeders
        })
      } catch (err) {
        onError(err)
      }
    }
    try {
      devicePubkey = await deviceSigner.getPublicKey()
      const localDeviceRelays = await resolveDeviceSyncRelays(devicePubkey)
      for (const peer of signerSyncPeers()) {
        if (!peer.pubkey || peer.pubkey === devicePubkey) continue
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
    for (const ownerPubkey of [...readRelaysByOwnerPubkey.keys()]) {
      if (!nextOwnerPubkeys.has(ownerPubkey)) readRelaysByOwnerPubkey.delete(ownerPubkey)
    }
    channelPubkeyByOwnerPubkey.clear()
    ownerPubkeyByChannelPubkey.clear()
    signerChannelPubkeyByPeerPubkey.clear()
    for (const [ownerPubkey, channelPubkey] of nextChannelPubkeyByOwnerPubkey) {
      channelPubkeyByOwnerPubkey.set(ownerPubkey, channelPubkey)
    }
    for (const [channelPubkey, ownerPubkey] of nextOwnerPubkeyByChannelPubkey) {
      ownerPubkeyByChannelPubkey.set(channelPubkey, ownerPubkey)
    }
    for (const [peerPubkey, channelPubkey] of nextSignerChannelPubkeyByPeerPubkey) {
      signerChannelPubkeyByPeerPubkey.set(peerPubkey, channelPubkey)
    }
    return channels
  }

  function clearRelayListWatcher () {
    stopRelayListWatcher?.()
    stopRelayListWatcher = null
    relayListWatcherKey = ''
  }

  function relayListWatcherPubkeys () {
    return [...channelPubkeyByOwnerPubkey.keys()]
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
    if (!channelPubkeyByOwnerPubkey.has(update.pubkey)) return
    const relays = syncWatchRelays(update.relays?.read)
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
          const message = messenger.nextMessage?.()
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

  function clearAnnouncementTimers () {
    if (announceTimer) _clearTimeout(announceTimer)
    if (announceInterval) _clearInterval(announceInterval)
    announceTimer = null
    announceInterval = null
    pendingResetInterval = false
    pendingAnnounceOwners.clear()
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
    if (!messenger || !_secrets.isUnlocked()) {
      pendingAnnounceOwners.clear()
      return
    }
    const receivers = trustedPubkeys()
    const hasSignerSyncTargets = signerChannelPubkeyByPeerPubkey.size > 0
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
        try {
          await _contentKeys.announceContentKeys({
            messenger,
            channelPubkey: channelPubkeyForOwner(ownerPubkey),
            ownerPubkey,
            receiverPubkeys: receivers,
            debug
          })
          if (HEX32.test(ownerPubkey)) {
            await nostrDbSync.announceRange({
              messenger,
              channelPubkey: channelPubkeyForOwner(ownerPubkey),
              ownerPubkey,
              receiverPubkeys: receivers,
              debug
            })
          }
        } catch (err) {
          onError(err)
        }
      }
    }
    try {
      await _trustedSignerSync.announceTrustedSignerState({
        messenger,
        peerChannels: signerChannelPubkeyByPeerPubkey,
        records: trustedRecords(),
        activePeerPubkeys: receivers,
        reminderRecords: removedReminderRecords(),
        debug
      })
    } catch (err) {
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
    _revocationRotation.startRevocationRotation?.()
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
    scheduleAnnounceAll({ immediate: true, resetInterval: true })
    return promise
  }

  function stop () {
    messenger?.close?.()
    messenger = null
    drainQueued = false
    drainScheduled = false
    clearRelayListWatcher()
    channelPubkeyByOwnerPubkey.clear()
    ownerPubkeyByChannelPubkey.clear()
    signerChannelPubkeyByPeerPubkey.clear()
    readRelaysByOwnerPubkey.clear()
    devicePubkey = ''
    clearAnnouncementTimers()
    nostrDbSync.stop()
    _contentKeys.resetDebugSources?.()
  }

  async function refreshNow (id = lifecycleId) {
    if (!isCurrentLifecycle(id)) return null
    if (!_secrets.isUnlocked()) {
      stop()
      return null
    }

    const userSigner = await _secrets.getDeviceSigner()
    if (!isCurrentLifecycle(id)) return null
    devicePubkey = await userSigner.getPublicKey()
    _trustedSigners.forgetLocal?.(devicePubkey)
    trustedByPubkey = trustedMap(_trustedSigners.list())
    const channels = await buildChannels(userSigner)
    if (!isCurrentLifecycle(id)) return null
    if (!channels.length) {
      stop()
      return null
    }

    const options = {
      userSigner,
      contentKeySigner: null,
      channels,
      relays: [],
      mode: 'seeder'
    }

    if (!messenger) {
      const nextMessenger = new MessengerClass({ onMessageQueued: scheduleDrain, onError, useContentKeys: false, onDebug: debug })
      messenger = nextMessenger
      await nextMessenger.init(options)
      if (!isCurrentLifecycle(id)) {
        if (messenger === nextMessenger) {
          nextMessenger.close?.()
          messenger = null
        }
        return null
      }
    } else {
      const currentMessenger = messenger
      await currentMessenger.update(options)
      if (!isCurrentLifecycle(id) || messenger !== currentMessenger) return null
    }

    ensureRelayListWatcher()
    nostrDbSync.ensureSubscriptions({
      messenger,
      trustedByPubkey,
      channelPubkeyForOwner,
      ownerPubkeyForChannel,
      ownerPubkeys: new Set(nostrDbOwnerPubkeys(_store)),
      debug
    })
    ensureAnnouncementInterval()
    scheduleAnnounceAll()
    scheduleDrain()
    return messenger
  }

  function refresh () {
    if (!refreshPromise) {
      const id = lifecycleId
      const promise = Promise.resolve()
        .then(() => refreshNow(id))
        .catch(err => {
          onError(err)
          return null
        })
        .finally(() => {
          if (refreshPromise === promise) refreshPromise = null
        })
      refreshPromise = promise
    }
    return refreshPromise
  }

  function refreshOnStoreIdentityChange () {
    const nextKey = syncAccountIdentityKey(_store)
    if (nextKey === lastStoreIdentityKey) return null
    lastStoreIdentityKey = nextKey
    return refresh()
  }

  function init () {
    if (initialized) return refresh()
    initialized = true
    lifecycleId += 1
    lastStoreIdentityKey = syncAccountIdentityKey(_store)
    unsubscribers.push(_secrets.subscribe(refresh))
    if (_secrets.subscribeContentKeys) unsubscribers.push(_secrets.subscribeContentKeys(onContentKeyChange))
    unsubscribers.push(_store.subscribe(refreshOnStoreIdentityChange))
    unsubscribers.push(_trustedSigners.subscribe(onTrustedSignerChange))
    return refresh()
  }

  function close () {
    lifecycleId += 1
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
    initialized = false
    refreshPromise = null
    stop()
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
    })
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
