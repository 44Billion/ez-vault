import { PrivateMessenger } from '../private-messenger/index.js'
import { freeRelays } from '../relays.js'
import { claimSigner } from '../signer.js'
import * as store from '../accounts-store.js'
import * as secrets from '../secrets.js'
import * as trustedSigners from '../trusted-signers.js'
import * as contentKeys from './content-keys.js'

const ANNOUNCE_INTERVAL_MS = 4 * 60 * 60 * 1000
const ANNOUNCE_DEBOUNCE_MS = 1000
const ANNOUNCE_ALL = '*'

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
  return relays.slice(0, 2)
}

function trustedMap (trusted) {
  return new Map(trusted.map(entry => [entry.pubkey, entry]))
}

function nsecOwnerPubkeys (_store = store) {
  return _store.list()
    .filter(account => account.type === 'nsec')
    .map(account => account.pubkey)
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
  _contentKeys = contentKeys,
  _claimSigner = claimSigner,
  _freeRelays = freeRelays,
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
  const pendingAnnounceOwners = new Set()
  const unsubscribers = []
  const debug = _debug === undefined ? defaultDebugSink() : _debug

  function emitDebug (action, detail = {}) {
    try {
      debug?.({ source: 'sync', action, ...detail })
    } catch (err) {
      onError(err)
    }
  }

  function relayList () {
    return syncRelays(_freeRelays)
  }

  function trustedPubkeys () {
    return [...trustedByPubkey.keys()]
  }

  function buildChannels () {
    const seeders = trustedPubkeys()
    const channels = []
    for (const account of _store.list()) {
      if (account.type !== 'nsec' && account.type !== 'bunker') continue
      try {
        channels.push({
          pubkey: account.pubkey,
          signer: _claimSigner(account),
          relays: relayList(),
          mode: 'leecher',
          seeders
        })
      } catch (err) {
        onError(err)
      }
    }
    return channels
  }

  function scheduleDrain () {
    drainQueued = true
    if (draining || drainScheduled) return
    drainScheduled = true
    Promise.resolve().then(drainMessages)
  }

  async function drainMessages () {
    drainScheduled = false
    if (draining) return
    draining = true
    try {
      while (drainQueued) {
        drainQueued = false
        let handled = 0
        emitDebug('drain', { phase: 'start' })
        let reachedEmptyQueue = false
        // eslint-disable-next-line no-unmodified-loop-condition
        while (messenger && _secrets.isUnlocked()) {
          const message = messenger.nextMessage?.()
          if (!message) {
            reachedEmptyQueue = true
            break
          }
          handled += 1
          emitDebug('handle', messageDebugInfo(message))
          try {
            await _contentKeys.handleMessage(message, {
              messenger,
              trustedByPubkey,
              debug
            })
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
      if (drainQueued) scheduleDrain()
    }
  }

  function clearAnnouncementTimers () {
    if (announceTimer) _clearTimeout(announceTimer)
    if (announceInterval) _clearInterval(announceInterval)
    announceTimer = null
    announceInterval = null
    pendingAnnounceOwners.clear()
  }

  function ensureAnnouncementInterval () {
    if (announceInterval) return
    announceInterval = _setInterval(() => scheduleAnnounceAll(), ANNOUNCE_INTERVAL_MS)
    announceInterval?.unref?.()
  }

  function resetAnnouncementInterval () {
    if (announceInterval) _clearInterval(announceInterval)
    announceInterval = null
    if (messenger && _secrets.isUnlocked()) ensureAnnouncementInterval()
  }

  async function flushAnnouncements () {
    announceTimer = null
    const resetInterval = pendingResetInterval
    pendingResetInterval = false
    if (!messenger || !_secrets.isUnlocked()) {
      pendingAnnounceOwners.clear()
      return
    }
    const receivers = trustedPubkeys()
    if (!receivers.length) {
      pendingAnnounceOwners.clear()
      return
    }

    const owners = pendingAnnounceOwners.has(ANNOUNCE_ALL)
      ? nsecOwnerPubkeys(_store)
      : [...pendingAnnounceOwners]
    pendingAnnounceOwners.clear()

    for (const ownerPubkey of owners) {
      try {
        await _contentKeys.announceContentKeys({ messenger, ownerPubkey, receiverPubkeys: receivers, debug })
      } catch (err) {
        onError(err)
      }
    }
    if (resetInterval) resetAnnouncementInterval()
  }

  function scheduleAnnounce (ownerPubkey, { immediate = false, resetInterval = false } = {}) {
    if (ownerPubkey) pendingAnnounceOwners.add(ownerPubkey)
    else pendingAnnounceOwners.add(ANNOUNCE_ALL)
    pendingResetInterval = pendingResetInterval || resetInterval
    if (announceTimer && !immediate) return
    if (announceTimer) _clearTimeout(announceTimer)
    announceTimer = _setTimeout(flushAnnouncements, immediate ? 0 : ANNOUNCE_DEBOUNCE_MS)
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

  function stop () {
    messenger?.close?.()
    messenger = null
    clearAnnouncementTimers()
    _contentKeys.resetDebugSources?.()
  }

  async function refreshNow () {
    if (!_secrets.isUnlocked()) {
      stop()
      return null
    }

    trustedByPubkey = trustedMap(_trustedSigners.list())
    const channels = buildChannels()
    if (!channels.length) {
      stop()
      return null
    }

    const userSigner = await _secrets.getDeviceSigner()
    const options = {
      userSigner,
      contentKeySigner: null,
      channels,
      relays: relayList(),
      mode: 'seeder' // 'leecher' seems less suitable for trusted signers
    }

    if (!messenger) {
      messenger = new MessengerClass({ onMessageQueued: scheduleDrain, onError, useContentKeys: false, onDebug: debug })
      await messenger.init(options)
    } else {
      await messenger.update(options)
    }

    ensureAnnouncementInterval()
    scheduleAnnounceAll()
    scheduleDrain()
    return messenger
  }

  function refresh () {
    if (!refreshPromise) {
      refreshPromise = Promise.resolve()
        .then(refreshNow)
        .catch(err => {
          onError(err)
          return null
        })
        .finally(() => { refreshPromise = null })
    }
    return refreshPromise
  }

  function init () {
    if (initialized) return refresh()
    initialized = true
    unsubscribers.push(_secrets.subscribe(refresh))
    if (_secrets.subscribeContentKeys) unsubscribers.push(_secrets.subscribeContentKeys(onContentKeyChange))
    unsubscribers.push(_store.subscribe(refresh))
    unsubscribers.push(_trustedSigners.subscribe(refresh))
    return refresh()
  }

  function close () {
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
    initialized = false
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
