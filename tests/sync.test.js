import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import NsecSigner from '../docs/services/nsec-signer.js'
import { createSyncController } from '../docs/services/sync/index.js'
import { DEFAULT_STALE_CHANNEL_SECONDS } from '../docs/services/private-messenger/index.js'
import {
  announceContentKeys,
  CONTENT_KEYS_ANNOUNCE_CODE,
  CONTENT_KEYS_REPLY_CODE,
  CONTENT_KEYS_ASK_CODE,
  generateAndPublishContentKey,
  getDebugSnapshot,
  handleMessage,
  resetDebugSources
} from '../docs/services/sync/content-keys.js'
import * as store from '../docs/services/accounts-store.js'
import * as secrets from '../docs/services/secrets.js'
import { bytesToHex, hexToBytes } from '../docs/helpers/nostr/index.js'

const data = new Map()
globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  removeItem: key => { data.delete(String(key)) },
  setItem: (key, value) => { data.set(String(key), String(value)) }
}

if (!globalThis.crypto) globalThis.crypto = crypto
if (!globalThis.btoa) globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64')
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary')

afterEach(() => {
  secrets.lock()
  resetDebugSources()
  NsecSigner.releaseAll()
  globalThis.localStorage.clear()
})

function seckey () {
  return bytesToHex(generateSecretKey())
}

function pubkeyFromSecret (secret) {
  return getPublicKey(hexToBytes(secret))
}

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function freshCreatedAt (offset = 0) {
  return nowSeconds() - offset
}

function staleCreatedAt (offset = 0) {
  return nowSeconds() - DEFAULT_STALE_CHANNEL_SECONDS - offset
}

function signer (pubkey) {
  return { getPublicKey: () => pubkey }
}

function createSubscribable (state) {
  const listeners = new Set()
  return {
    ...state,
    subscribe: fn => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    async emit () {
      await Promise.all([...listeners].map(fn => fn()))
    }
  }
}

function addNsecAccount () {
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  store.add({ type: 'nsec', pubkey, name: '', picture: '' })
  secrets.setNsecSecret(pubkey, secret)
  return { pubkey, secret }
}

function addContentKey (ownerPubkey, createdAt = freshCreatedAt()) {
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  secrets.setContentKeySecret(ownerPubkey, secret, createdAt)
  return { pubkey, secret, createdAt }
}

function fakeMessenger () {
  const sent = []
  return {
    sent,
    ask: async options => sent.push({ method: 'ask', options }),
    reply: async options => sent.push({ method: 'reply', options }),
    yell: async options => sent.push({ method: 'yell', options })
  }
}

function syncMessage ({ channelPubkey, senderPubkey, code, payload, id = 'message-id' }) {
  return {
    type: code === CONTENT_KEYS_ASK_CODE ? 'ask' : code === CONTENT_KEYS_REPLY_CODE ? 'reply' : 'yell',
    channelPubkey,
    event: { id, pubkey: senderPubkey, created_at: 10 },
    payload: { code, payload }
  }
}

async function flushMicrotasks (turns = 6) {
  for (let i = 0; i < turns; i++) await Promise.resolve()
}

test('sync orchestration watches nsec and bunker channels with identity-only sync options', async () => {
  const deviceSigner = signer('device')
  const accountSigners = {
    nsec1: signer('nsec1'),
    bunker1: signer('bunker1')
  }
  const storeStub = createSubscribable({
    list: () => [
      { type: 'npub', pubkey: 'npub1' },
      { type: 'nsec', pubkey: 'nsec1' },
      { type: 'bunker', pubkey: 'bunker1' }
    ]
  })
  let unlocked = true
  const secretsStub = createSubscribable({
    isUnlocked: () => unlocked,
    getDeviceSigner: async () => deviceSigner
  })
  const trustedStub = createSubscribable({
    list: () => [{ pubkey: 'trusted1', platform: 'Laptop' }]
  })
  const instances = []
  const debugEvents = []
  class FakeMessenger {
    constructor (options) {
      this.options = options
      this.updates = []
      instances.push(this)
    }

    async init (options) {
      this.initOptions = options
      this.options.onDebug?.({
        source: 'private-messenger',
        action: 'watch',
        mode: options.channels[0]?.mode || ''
      })
      return this
    }

    async update (options) {
      this.updates.push(options)
      return this
    }

    nextMessage () { return null }
    close () { this.closed = true }
  }
  const timers = []
  const controller = createSyncController({
    MessengerClass: FakeMessenger,
    _store: storeStub,
    _secrets: secretsStub,
    _trustedSigners: trustedStub,
    _claimSigner: account => accountSigners[account.pubkey],
    _freeRelays: ['wss://one.example', 'wss://two.example', 'wss://three.example'],
    _setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers[timers.length - 1] },
    _clearTimeout: () => {},
    _setInterval: (fn, ms) => ({ fn, ms }),
    _clearInterval: () => {},
    _debug: event => debugEvents.push(event)
  })

  await controller.init()

  assert.equal(instances.length, 1)
  assert.equal(instances[0].options.useContentKeys, false)
  assert.equal(instances[0].initOptions.userSigner, deviceSigner)
  assert.equal(instances[0].initOptions.contentKeySigner, null)
  assert.equal(instances[0].initOptions.mode, 'seeder')
  assert.deepEqual(instances[0].initOptions.relays, ['wss://one.example', 'wss://two.example'])
  assert.deepEqual(instances[0].initOptions.channels.map(channel => channel.pubkey), ['nsec1', 'bunker1'])
  assert.deepEqual(instances[0].initOptions.channels.map(channel => channel.signer), [accountSigners.nsec1, accountSigners.bunker1])
  assert.deepEqual(instances[0].initOptions.channels.map(channel => channel.mode), ['seeder', 'seeder'])
  assert.deepEqual(instances[0].initOptions.channels[0].relays, ['wss://one.example', 'wss://two.example'])
  assert.deepEqual(instances[0].initOptions.channels[0].seeders, ['trusted1'])
  assert.ok(debugEvents.some(event => event.action === 'watch' && event.mode === 'seeder'))
  assert.equal(timers[0].ms, 1000)

  await storeStub.emit()
  assert.equal(instances[0].updates.length, 1)

  await trustedStub.emit()
  assert.equal(instances[0].updates.length, 2)

  await secretsStub.emit()
  assert.equal(instances[0].updates.length, 3)

  unlocked = false
  await secretsStub.emit()
  assert.equal(instances[0].closed, true)
  assert.equal(controller.messenger, null)

  controller.close()
})

test('sync drains messages enqueued while another message is being handled', async () => {
  const storeStub = createSubscribable({
    list: () => [{ type: 'nsec', pubkey: 'nsec1' }]
  })
  const secretsStub = createSubscribable({
    isUnlocked: () => true,
    getDeviceSigner: async () => signer('device')
  })
  const trustedStub = createSubscribable({
    list: () => [{ pubkey: 'trusted1', platform: 'Laptop' }]
  })
  const handled = []
  const debugEvents = []
  let messenger = null

  class FakeMessenger {
    constructor (options) {
      this.options = options
      this.queue = [{ id: 'a' }]
      messenger = this
    }

    async init (options) {
      this.initOptions = options
      return this
    }

    nextMessage () {
      return this.queue.shift() || null
    }

    close () {}
  }

  const controller = createSyncController({
    MessengerClass: FakeMessenger,
    _store: storeStub,
    _secrets: secretsStub,
    _trustedSigners: trustedStub,
    _contentKeys: {
      resetDebugSources: () => {},
      announceContentKeys: async () => {},
      handleMessage: async message => {
        handled.push(message.id)
        if (message.id === 'a') {
          messenger.queue.push({ id: 'b' })
          messenger.options.onMessageQueued()
          await Promise.resolve()
        }
      }
    },
    _claimSigner: () => signer('nsec1'),
    _freeRelays: ['wss://one.example', 'wss://two.example'],
    _setTimeout: () => ({}),
    _clearTimeout: () => {},
    _setInterval: () => ({}),
    _clearInterval: () => {},
    _debug: event => debugEvents.push(event)
  })

  await controller.init()
  await flushMicrotasks()

  assert.deepEqual(handled, ['a', 'b'])
  assert.equal(messenger.nextMessage(), null)
  assert.deepEqual(
    debugEvents
      .filter(event => event.action === 'drain' && event.phase === 'end')
      .map(event => event.handled),
    [2]
  )

  controller.close()
})

test('sync announces content-key changes immediately and restarts the four-hour cadence', async () => {
  const storeStub = createSubscribable({
    list: () => [{ type: 'nsec', pubkey: 'nsec1' }]
  })
  const contentKeyListeners = new Set()
  const secretsStub = createSubscribable({
    isUnlocked: () => true,
    getDeviceSigner: async () => signer('device'),
    subscribeContentKeys: fn => {
      contentKeyListeners.add(fn)
      return () => contentKeyListeners.delete(fn)
    }
  })
  const trustedStub = createSubscribable({
    list: () => [{ pubkey: 'trusted1', platform: 'Laptop' }]
  })
  const announced = []
  const intervals = []
  const clearedIntervals = []
  const timers = []

  class FakeMessenger {
    async init (options) {
      this.options = options
      return this
    }

    nextMessage () { return null }
    close () {}
  }

  const controller = createSyncController({
    MessengerClass: FakeMessenger,
    _store: storeStub,
    _secrets: secretsStub,
    _trustedSigners: trustedStub,
    _contentKeys: {
      resetDebugSources: () => {},
      handleMessage: async () => false,
      announceContentKeys: async options => announced.push(options)
    },
    _claimSigner: () => signer('nsec1'),
    _freeRelays: ['wss://one.example', 'wss://two.example'],
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: () => {},
    _setInterval: (fn, ms) => {
      const interval = { fn, ms }
      intervals.push(interval)
      return interval
    },
    _clearInterval: interval => clearedIntervals.push(interval)
  })

  await controller.init()
  for (const fn of contentKeyListeners) fn('nsec1')

  const immediateTimer = timers.find(timer => timer.ms === 0)
  assert.ok(immediateTimer)
  await immediateTimer.fn()

  assert.equal(announced.length, 1)
  assert.equal(announced[0].ownerPubkey, 'nsec1')
  assert.deepEqual(announced[0].receiverPubkeys, ['trusted1'])
  assert.equal(intervals[0].ms, 4 * 60 * 60 * 1000)
  assert.deepEqual(clearedIntervals, [intervals[0]])
  assert.equal(intervals[1].ms, 4 * 60 * 60 * 1000)

  controller.close()
})

test('setContentKeySecret causes one immediate announce through the sync subscription', async () => {
  secrets.unlock(generateSecretKey(), null)
  const owner = addNsecAccount()
  const trusted = '8'.repeat(64)
  const yells = []
  const timers = []
  const instances = []

  class FakeMessenger {
    constructor () {
      this.updates = []
      instances.push(this)
    }

    async init (options) {
      this.options = options
      return this
    }

    async update (options) {
      this.options = options
      this.updates.push(options)
      return this
    }

    async yell (options) {
      yells.push(options)
      return { yell: { id: 'announce-id' } }
    }

    nextMessage () { return null }
    close () {}
  }

  const controller = createSyncController({
    MessengerClass: FakeMessenger,
    _store: {
      list: () => [{ type: 'nsec', pubkey: owner.pubkey }],
      subscribe: () => () => {}
    },
    _secrets: {
      isUnlocked: () => secrets.isUnlocked(),
      getDeviceSigner: async () => signer('device'),
      subscribe: fn => secrets.subscribe(fn),
      subscribeContentKeys: fn => secrets.subscribeContentKeys(fn)
    },
    _trustedSigners: {
      list: () => [{ pubkey: trusted, platform: 'Laptop' }],
      subscribe: () => () => {}
    },
    _claimSigner: () => signer(owner.pubkey),
    _freeRelays: ['wss://one.example', 'wss://two.example'],
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: () => {},
    _setInterval: () => ({}),
    _clearInterval: () => {}
  })

  await controller.init()
  assert.equal(instances[0].updates.length, 0)
  const contentSecret = seckey()
  const contentPubkey = pubkeyFromSecret(contentSecret)
  secrets.setContentKeySecret(owner.pubkey, contentSecret, 60)
  await flushMicrotasks()
  assert.equal(instances[0].updates.length, 0)

  const immediateTimers = timers.filter(timer => timer.ms === 0)
  assert.equal(immediateTimers.length, 1)
  await immediateTimers[0].fn()

  assert.equal(yells.length, 1)
  assert.equal(yells[0].code, CONTENT_KEYS_ANNOUNCE_CODE)
  assert.deepEqual(yells[0].receiverPubkeys, [trusted])
  assert.deepEqual(yells[0].payload.keys, [{ pubkey: contentPubkey, createdAt: 60 }])

  controller.close()
})

test('content-key announce ignores untrusted and non-nsec channels, then requests only missing keys', async () => {
  secrets.unlock(generateSecretKey(), null)
  const owner = addNsecAccount()
  const held = addContentKey(owner.pubkey)
  const missing = addContentKey(owner.pubkey)
  const absentSecret = seckey()
  const absentPubkey = pubkeyFromSecret(absentSecret)
  const trusted = '1'.repeat(64)
  const messenger = fakeMessenger()
  const context = {
    messenger,
    trustedByPubkey: new Map([[trusted, { pubkey: trusted, platform: 'Phone' }]])
  }

  secrets.setContentKeySecret(owner.pubkey, held.secret, held.createdAt)
  store.add({ type: 'bunker', pubkey: '2'.repeat(64), name: '' })

  await handleMessage(syncMessage({
    channelPubkey: owner.pubkey,
    senderPubkey: '3'.repeat(64),
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    payload: { ownerPubkey: owner.pubkey, keys: [{ pubkey: absentPubkey, createdAt: 20 }] }
  }), context)
  assert.equal(messenger.sent.length, 0)

  await handleMessage(syncMessage({
    channelPubkey: '2'.repeat(64),
    senderPubkey: trusted,
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    payload: { ownerPubkey: '2'.repeat(64), keys: [{ pubkey: absentPubkey, createdAt: 20 }] }
  }), context)
  assert.equal(messenger.sent.length, 0)

  await handleMessage(syncMessage({
    channelPubkey: owner.pubkey,
    senderPubkey: trusted,
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    payload: {
      ownerPubkey: owner.pubkey,
      keys: [
        { pubkey: held.pubkey, createdAt: held.createdAt },
        { pubkey: missing.pubkey, createdAt: missing.createdAt },
        { pubkey: absentPubkey, createdAt: 20 }
      ]
    }
  }), context)

  assert.equal(messenger.sent.length, 1)
  assert.equal(messenger.sent[0].method, 'ask')
  assert.equal(messenger.sent[0].options.code, CONTENT_KEYS_ASK_CODE)
  assert.deepEqual(messenger.sent[0].options.payload.pubkeys, [absentPubkey])
})

test('content-key announce does not request keys already restored from localStorage', async () => {
  const vaultKey = generateSecretKey()
  secrets.unlock(vaultKey, null)
  const owner = addNsecAccount()
  const content = addContentKey(owner.pubkey, 70)
  const accountBlob = secrets.sealCurrentEntries()

  secrets.lock()
  NsecSigner.releaseAll()
  secrets.unlock(vaultKey, accountBlob)

  const trusted = '9'.repeat(64)
  const messenger = fakeMessenger()
  const debugEvents = []

  await handleMessage(syncMessage({
    channelPubkey: owner.pubkey,
    senderPubkey: trusted,
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    payload: {
      ownerPubkey: owner.pubkey,
      keys: [{ pubkey: content.pubkey, createdAt: content.createdAt }]
    }
  }), {
    messenger,
    trustedByPubkey: new Map([[trusted, { pubkey: trusted, platform: 'Phone' }]]),
    debug: event => debugEvents.push(event)
  })

  assert.ok(secrets.getContentKeySigner(owner.pubkey, content.pubkey))
  assert.equal(messenger.sent.length, 0)
  assert.equal(debugEvents.some(event => event.action === 'request'), false)
})

test('content-key announce contains only public key metadata', async () => {
  secrets.unlock(generateSecretKey(), null)
  const owner = addNsecAccount()
  const content = addContentKey(owner.pubkey, 30)
  const messenger = fakeMessenger()

  await announceContentKeys({
    messenger,
    ownerPubkey: owner.pubkey,
    receiverPubkeys: ['4'.repeat(64)]
  })

  assert.equal(messenger.sent[0].method, 'yell')
  assert.equal(messenger.sent[0].options.code, CONTENT_KEYS_ANNOUNCE_CODE)
  assert.deepEqual(messenger.sent[0].options.payload, {
    ownerPubkey: owner.pubkey,
    keys: [{ pubkey: content.pubkey, createdAt: 30 }]
  })
  assert.equal(Object.hasOwn(messenger.sent[0].options.payload.keys[0], 'seckey'), false)
})

test('content-key requests reply with only locally held requested secrets', async () => {
  secrets.unlock(generateSecretKey(), null)
  const owner = addNsecAccount()
  const content = addContentKey(owner.pubkey, 40)
  const trusted = '5'.repeat(64)
  const absent = pubkeyFromSecret(seckey())
  const messenger = fakeMessenger()

  await handleMessage(syncMessage({
    channelPubkey: owner.pubkey,
    senderPubkey: trusted,
    code: CONTENT_KEYS_ASK_CODE,
    payload: { ownerPubkey: owner.pubkey, pubkeys: [content.pubkey, absent] }
  }), {
    messenger,
    trustedByPubkey: new Map([[trusted, { pubkey: trusted }]])
  })

  assert.equal(messenger.sent.length, 1)
  assert.equal(messenger.sent[0].method, 'reply')
  assert.equal(messenger.sent[0].options.code, CONTENT_KEYS_REPLY_CODE)
  assert.equal(messenger.sent[0].options.payload.keys.length, 1)
  assert.deepEqual(messenger.sent[0].options.payload.keys[0], {
    pubkey: content.pubkey,
    seckey: content.secret,
    createdAt: 40
  })
})

test('content-key replies import valid keys, keep older keys, and notify the sync subscription', async () => {
  secrets.unlock(generateSecretKey(), null)
  const owner = addNsecAccount()
  const older = addContentKey(owner.pubkey, freshCreatedAt(20))
  const syncedSecret = seckey()
  const syncedPubkey = pubkeyFromSecret(syncedSecret)
  const syncedCreatedAt = freshCreatedAt(10)
  const invalidSecret = seckey()
  const trusted = '6'.repeat(64)
  const scheduled = []
  const notified = []
  const unsubscribe = secrets.subscribeContentKeys(ownerPubkey => notified.push(ownerPubkey))

  try {
    await handleMessage(syncMessage({
      channelPubkey: owner.pubkey,
      senderPubkey: trusted,
      code: CONTENT_KEYS_REPLY_CODE,
      payload: {
        ownerPubkey: owner.pubkey,
        keys: [
          { pubkey: syncedPubkey, seckey: syncedSecret, createdAt: syncedCreatedAt },
          { pubkey: '7'.repeat(64), seckey: invalidSecret, createdAt: freshCreatedAt(5) }
        ]
      }
    }), {
      messenger: fakeMessenger(),
      trustedByPubkey: new Map([[trusted, { pubkey: trusted, platform: 'Tablet' }]]),
      scheduleAnnounce: (ownerPubkey, options) => scheduled.push({ ownerPubkey, options })
    })
  } finally {
    unsubscribe()
  }

  assert.ok(secrets.getContentKeySigner(owner.pubkey, older.pubkey))
  assert.ok(secrets.getContentKeySigner(owner.pubkey, syncedPubkey))
  assert.equal(secrets.getContentKeySigner(owner.pubkey, '7'.repeat(64)), null)
  assert.equal(secrets.getLatestContentKeySigner(owner.pubkey).getPublicKey(), syncedPubkey)
  assert.deepEqual(scheduled, [])
  assert.deepEqual(notified, [owner.pubkey])

  const row = getDebugSnapshot().accounts.find(row => row.account.pubkey === owner.pubkey)
  assert.equal(row.latest.pubkey, syncedPubkey)
  assert.equal(row.source, 'synced from Tablet')
})

test('content-key replies keep a stale key only until a newer key exists', async () => {
  secrets.unlock(generateSecretKey(), null)
  const owner = addNsecAccount()
  const trusted = 'a'.repeat(64)
  const staleSecret = seckey()
  const stalePubkey = pubkeyFromSecret(staleSecret)
  const newer = addContentKey(owner.pubkey, freshCreatedAt(10))
  const notified = []
  const unsubscribe = secrets.subscribeContentKeys(ownerPubkey => notified.push(ownerPubkey))

  try {
    await handleMessage(syncMessage({
      channelPubkey: owner.pubkey,
      senderPubkey: trusted,
      code: CONTENT_KEYS_REPLY_CODE,
      payload: {
        ownerPubkey: owner.pubkey,
        keys: [{ pubkey: stalePubkey, seckey: staleSecret, createdAt: staleCreatedAt(5) }]
      }
    }), {
      messenger: fakeMessenger(),
      trustedByPubkey: new Map([[trusted, { pubkey: trusted, platform: 'Tablet' }]])
    })
  } finally {
    unsubscribe()
  }

  assert.ok(secrets.getContentKeySigner(owner.pubkey, newer.pubkey))
  assert.equal(secrets.getContentKeySigner(owner.pubkey, stalePubkey), null)
  assert.deepEqual(notified, [])
})

test('content-key replies can import a stale key when it is the only key', async () => {
  secrets.unlock(generateSecretKey(), null)
  const owner = addNsecAccount()
  const trusted = 'b'.repeat(64)
  const staleSecret = seckey()
  const stalePubkey = pubkeyFromSecret(staleSecret)

  await handleMessage(syncMessage({
    channelPubkey: owner.pubkey,
    senderPubkey: trusted,
    code: CONTENT_KEYS_REPLY_CODE,
    payload: {
      ownerPubkey: owner.pubkey,
      keys: [{ pubkey: stalePubkey, seckey: staleSecret, createdAt: staleCreatedAt(5) }]
    }
  }), {
    messenger: fakeMessenger(),
    trustedByPubkey: new Map([[trusted, { pubkey: trusted, platform: 'Tablet' }]])
  })

  assert.ok(secrets.getContentKeySigner(owner.pubkey, stalePubkey))
  assert.equal(secrets.listContentKeys(owner.pubkey).length, 1)
})

test('dev content-key generation persists, publishes, updates debug source, and keeps key on publish failure', async () => {
  secrets.unlock(generateSecretKey(), null)
  const owner = addNsecAccount()
  const scheduled = []
  const notified = []
  const calls = []
  const unsubscribe = secrets.subscribeContentKeys(ownerPubkey => notified.push(ownerPubkey))

  try {
    const first = await generateAndPublishContentKey({
      ownerPubkey: owner.pubkey,
      scheduleAnnounce: (ownerPubkey, options) => scheduled.push({ ownerPubkey, options }),
      _upsertContentKeyEvent: async options => {
        calls.push(options)
        return { result: { success: true } }
      }
    })

    assert.ok(secrets.getContentKeySigner(owner.pubkey, first.pubkey))
    assert.equal(calls.length, 1)
    assert.equal(calls[0].contentKeySigner.getPublicKey(), first.pubkey)
    assert.deepEqual(scheduled, [])
    assert.deepEqual(notified, [owner.pubkey])
    assert.equal(getDebugSnapshot().accounts[0].source, 'generated locally')

    const second = await generateAndPublishContentKey({
      ownerPubkey: owner.pubkey,
      scheduleAnnounce: (ownerPubkey, options) => scheduled.push({ ownerPubkey, options }),
      _upsertContentKeyEvent: async () => { throw new Error('relay offline') }
    })

    assert.ok(secrets.getContentKeySigner(owner.pubkey, second.pubkey))
    assert.equal(second.error.message, 'relay offline')
    assert.deepEqual(scheduled, [])
    assert.deepEqual(notified, [owner.pubkey, owner.pubkey])
    assert.equal(getDebugSnapshot().accounts[0].latest.pubkey, second.pubkey)
    assert.equal(getDebugSnapshot().accounts[0].source, 'generated locally')
    assert.equal(getDebugSnapshot().accounts[0].publishStatus.state, 'publish failed')
  } finally {
    unsubscribe()
  }
})
