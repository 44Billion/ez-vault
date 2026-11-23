import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createNostrDbSyncController as createController,
  NOSTRDB_SYNC_ADVERTISE_CODE,
  NOSTRDB_SYNC_ASK_CODE,
  NOSTRDB_SYNC_REPLY_CODE,
  NOSTRDB_SYNC_PUSH_CODE,
  NOSTRDB_SYNC_APP_ASK_CODE,
  NOSTRDB_SYNC_APP_REPLY_CODE
} from '../src/services/sync/nostrdb.js'
import { createQueue } from 'libp2r2p/idb-queue'
import { keypairFromSeckey } from 'libp2r2p/key'
import { NOSTRDB_SYNC, readRecords, replaceRecords } from '../src/services/storage/index.js'

const data = new Map()
globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  removeItem: key => { data.delete(String(key)) },
  setItem: (key, value) => { data.set(String(key), String(value)) }
}

const OWNER = 'a'.repeat(64)
const PEER = 'b'.repeat(64)
const PEER2 = 'e'.repeat(64)
const EVENT_ID = 'c'.repeat(64)
const SYNC_STATE_KEY = 'ez-vault:trusted-signer-sync:nostrdb:v1'
const PUSH_EVENT_OUTBOX = `ez-vault:trusted-signer-sync:nostrdb-push:v1:events:${OWNER}:idb-queue`
const PUSH_CHUNK_OUTBOX = `ez-vault:trusted-signer-sync:nostrdb-push-chunks:v1:${OWNER}:idb-queue`
const PUSH_EVENT_INDEXES = {
  id: { keyPath: 'id', unique: true },
  byCoalescingKey: 'coalescingKey'
}

function createNostrDbSyncController (options = {}) {
  return createController({
    storage: globalThis.localStorage,
    _indexedDB: null,
    getLaneMode: () => 'both',
    ...options
  })
}

afterEach(() => {
  globalThis.localStorage.clear()
})

function messenger () {
  const sent = []
  return {
    sent,
    ask: async options => sent.push({ method: 'ask', options }),
    reply: async options => sent.push({ method: 'reply', options }),
    yell: async options => sent.push({ method: 'yell', options })
  }
}

function syncMessage ({ channelPubkey = 'channel', senderPubkey = PEER, code, payload, id = 'message-id' }) {
  return {
    channelPubkey,
    event: { id, pubkey: senderPubkey, created_at: 10 },
    payload: { code, payload }
  }
}

function context (msg, extra = {}) {
  return {
    messenger: msg,
    trustedByPubkey: new Map([[PEER, { pubkey: PEER }]]),
    ownerPubkeys: new Set([OWNER]),
    readyOwnerPubkeys: new Set([OWNER]),
    ownerPubkeyForChannel: channelPubkey => channelPubkey === 'channel' ? OWNER : '',
    channelPubkeyForOwner: ownerPubkey => ownerPubkey === OWNER ? 'channel' : '',
    ...extra
  }
}

function emptySubscription () {
  return {
    async next () { return { done: true } },
    async return () { return { done: true } },
    [Symbol.asyncIterator] () { return this }
  }
}

function eventId (number) {
  return number.toString(16).padStart(64, '0')
}

function event (number) {
  return { id: eventId(number), pubkey: PEER, kind: 1, created_at: number, tags: [], content: '', sig: 'd'.repeat(128) }
}

function pushEvent (number) {
  return {
    id: eventId(number),
    pubkey: PEER,
    kind: 1006,
    created_at: number,
    tags: [['k', '9'], ['c', 'nonempty-context']],
    content: '',
    sig: 'd'.repeat(128)
  }
}

function readStateEvent (number, {
  innerKind = '30078',
  coordinate = 'read-state-coordinate',
  createdAt = number,
  context = 'empty-context-ciphertext'
} = {}) {
  return {
    ...pushEvent(number),
    created_at: createdAt,
    tags: [
      ['k', innerKind],
      ['c', context],
      ['d', coordinate]
    ]
  }
}

async function flushMicrotasks (turns = 30) {
  for (let index = 0; index < turns; index++) await Promise.resolve()
}

function deleteDatabase (name) {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error(`database blocked: ${name}`))
  })
}

async function storedCount (queue) {
  let count = 0
  for await (const _ of queue.storedItems()) count++
  return count
}

function storedPushChunk (number, {
  eventNumber = number,
  channelPubkey = 'f'.repeat(64),
  receiverPubkeys = [PEER],
  priority = 'normal',
  isLast = false,
  content = ''
} = {}) {
  const item = { ...pushEvent(eventNumber), content }
  const jsonl = `${JSON.stringify(item)}\n`
  return {
    id: eventId(1000 + number),
    channelPubkey,
    receiverPubkeys,
    eventIds: [item.id],
    eventCount: 1,
    priority,
    index: number,
    isLast,
    jsonl,
    bytes: Buffer.byteLength(jsonl),
    addedAt: number
  }
}

async function seedPushChunks (records) {
  await deleteDatabase(PUSH_CHUNK_OUTBOX)
  const queue = await createQueue({
    prefix: PUSH_CHUNK_OUTBOX.slice(0, -':idb-queue'.length),
    indexedDB: globalThis.indexedDB,
    evictionPolicy: 'reject',
    indexes: { id: { keyPath: 'id', unique: true } }
  })
  try {
    for (const record of records) await queue.putBy('id', record)
  } finally {
    await queue.close()
  }
}

async function waitForCondition (condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for test condition')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function flushSeededPushChunks (records) {
  await deleteDatabase(PUSH_EVENT_OUTBOX)
  await seedPushChunks(records)
  const channelPubkey = records[0].channelPubkey
  const timers = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _indexedDB: globalThis.indexedDB,
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1, lastScore: 1, scores: [] } }
      }
    }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  })
  controller.ensureSubscriptions(context(msg, {
    trustedByPubkey: new Map([...new Set(records.flatMap(record => record.receiverPubkeys))]
      .map(pubkey => [pubkey, { pubkey }])),
    ownerPubkeyForChannel: channel => channel === channelPubkey ? OWNER : '',
    channelPubkeyForOwner: ownerPubkey => ownerPubkey === OWNER ? channelPubkey : ''
  }))
  await waitForCondition(() => timers.some(timer => timer.ms === 0))
  const flush = timers.find(timer => timer.ms === 0)
  assert.ok(flush)
  await flush.fn()
  return { channelPubkey, controller, msg, timers }
}

test('nostrdb sync advertises one account range without ownerPubkey in payload', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1234,
    getDb: () => ({
      async query (filter) {
        if (filter.search === 'algo:sync sort:asc') {
          return { results: [{ id: 'first' }], meta: { firstScore: 10 } }
        }
        return { results: [{ id: 'last' }], meta: { firstScore: 50 } }
      }
    })
  })

  await controller.announceRange({
    messenger: msg,
    ownerPubkey: OWNER,
    channelPubkey: 'channel',
    receiverPubkeys: [PEER]
  })

  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].method, 'yell')
  assert.equal(msg.sent[0].options.code, NOSTRDB_SYNC_ADVERTISE_CODE)
  assert.equal(msg.sent[0].options.useBulkPacing, true)
  assert.equal(msg.sent[0].options.channelPubkey, 'channel')
  assert.deepEqual(msg.sent[0].options.receiverPubkeys, [PEER])
  assert.deepEqual(msg.sent[0].options.payload, {
    generatedAt: 1234,
    minScore: 10,
    maxScore: 50
  })
  assert.equal(Object.hasOwn(msg.sent[0].options.payload, 'ownerPubkey'), false)
})

test('nostrdb sync advertises current score anchors for empty databases', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 9876,
    getDb: () => ({
      async query () {
        return { results: [], meta: { firstScore: null, lastScore: null } }
      }
    })
  })

  await controller.announceRange({
    messenger: msg,
    ownerPubkey: OWNER,
    channelPubkey: 'channel',
    receiverPubkeys: [PEER]
  })

  assert.deepEqual(msg.sent[0].options.payload, {
    generatedAt: 9876,
    minScore: 9876,
    maxScore: 9876
  })
})

test('advert envelopes are tracked and republished after five minutes when absent', async () => {
  let now = 1000
  const relay = 'wss://relay.test'
  const msg = messenger()
  let advertNumber = 0
  msg.yell = async options => {
    msg.sent.push({ method: 'yell', options })
    advertNumber++
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(400 + advertNumber),
          succeededRelays: [relay],
          receiverPubkeys: [PEER],
          success: true
        }],
        deletionSeckey: 'd'.repeat(64)
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _setTimeout: () => ({}),
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        return {
          result: [],
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      }
    },
    getDb: () => ({
      async query (filter) {
        if (filter.search === 'algo:sync sort:asc') {
          return { results: [{ id: 'first' }], meta: { firstScore: 1000 } }
        }
        return { results: [{ id: 'last' }], meta: { firstScore: 2000 } }
      }
    })
  })

  await controller.announceRange({
    messenger: msg,
    ownerPubkey: OWNER,
    channelPubkey: 'channel',
    receiverPubkeys: [PEER]
  })
  const advertEntries = () => Object.entries(controller._getState().exchanges[OWNER][PEER])
    .filter(([, record]) => record.direction === 'advert')
  assert.equal(advertEntries().length, 1)
  assert.equal(advertEntries()[0][1].events.advert.length, 1)
  const requestId = advertEntries()[0][1].requestId

  now += 5 * 60 * 1000 - 1
  await controller.runExchangeMaintenance(context(msg))
  assert.equal(msg.sent.length, 1)

  now += 1
  await controller.runExchangeMaintenance(context(msg))
  assert.equal(msg.sent.length, 2)
  assert.equal(msg.sent[1].options.code, NOSTRDB_SYNC_ADVERTISE_CODE)
  assert.equal(advertEntries()[0][1].requestId, requestId)
  assert.equal(advertEntries()[0][1].events.advert.length, 2)
  assert.equal(controller.getDebugSnapshot().exchange.advertsRepublished, 1)
})

test('a newer advert marks the previous advert exchange for deletion', async () => {
  let now = 1000
  const msg = messenger()
  let advertNumber = 0
  msg.yell = async options => {
    msg.sent.push({ method: 'yell', options })
    advertNumber++
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(500 + advertNumber),
          succeededRelays: ['wss://relay.test'],
          receiverPubkeys: [PEER],
          success: true
        }]
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _setTimeout: () => ({}),
    getDb: () => ({
      async query (filter) {
        if (filter.search === 'algo:sync sort:asc') {
          return { results: [{ id: 'first' }], meta: { firstScore: 1000 } }
        }
        return { results: [{ id: 'last' }], meta: { firstScore: now } }
      }
    })
  })
  const announce = () => controller.announceRange({
    messenger: msg,
    ownerPubkey: OWNER,
    channelPubkey: 'channel',
    receiverPubkeys: [PEER]
  })

  await announce()
  now += 1
  await announce()

  const adverts = Object.values(controller._getState().exchanges[OWNER][PEER])
    .filter(record => record.direction === 'advert')
  assert.equal(adverts.length, 2)
  assert.deepEqual(adverts.map(record => record.status).sort(), [
    'advert-published',
    'deleting-advert'
  ].sort())
})

test('advert updates are immediately visible to the recent recovery lane without localStorage', async () => {
  const msg = messenger()
  const controller = createController({
    _indexedDB: null,
    _nowMs: () => 1000,
    _random: () => 0.5,
    getLaneMode: () => 'both',
    _setTimeout: () => ({}),
    _clearTimeout: () => {},
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1000, lastScore: 1000 } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000000 }
  }), context(msg))

  const owner = controller._getState().owners[OWNER][PEER]
  assert.deepEqual(owner.advert, {
    generatedAt: 900,
    minScore: 1000,
    maxScore: 10000000,
    messageAt: 10000,
    eventId: 'message-id'
  })
  assert.ok(owner.recent.pending)
  assert.equal(owner.recent.pending.untilScore, 10000000)
  assert.ok(owner.pending)
  assert.equal(msg.sent.filter(item => item.method === 'ask').length, 2)
  controller.stop()
})

test('the default lane policy publishes only recent asks', async () => {
  const msg = messenger()
  const controller = createController({
    storage: globalThis.localStorage,
    _indexedDB: null,
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1000, lastScore: 1000 } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000000 }
  }), context(msg))

  const state = controller._getState().owners[OWNER][PEER]
  assert.ok(state.recent.pending)
  assert.equal(state.pending, undefined)
  assert.equal(msg.sent.filter(item => item.method === 'ask').length, 1)
  assert.equal(msg.sent[0].options.payload.priority, undefined)
  controller.stop()
})

test('the default recent policy cancels legacy history work when subscriptions start', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 5000,
          pending: {
            requestId: 'legacy-history',
            sinceScore: 5001,
            untilScore: 10000
          },
          updatedAt: 1000
        }
      }
    }
  }))
  const controller = createController({
    storage: globalThis.localStorage,
    _indexedDB: null,
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({ subscribe: emptySubscription })
  })

  controller.ensureSubscriptions(context(messenger()))
  await flushMicrotasks()

  assert.equal(controller._getState().owners[OWNER][PEER].pending, null)
  assert.equal(controller._getState().owners[OWNER][PEER].completedScore, 5000)
  controller.stop()
})

test('history-only channels suppress recent asks and use the current advert target', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getLaneMode: ({ ownerPubkey, channelPubkey }) => {
      assert.equal(ownerPubkey, OWNER)
      assert.equal(channelPubkey, 'channel')
      return 'history'
    },
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1000, lastScore: 1000 } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 2000000 }
  }), context(msg))

  const state = controller._getState().owners[OWNER][PEER]
  assert.ok(state.pending)
  assert.equal(state.recent, undefined)
  assert.equal(msg.sent.filter(item => item.method === 'ask').length, 1)
  assert.equal(msg.sent[0].options.payload.priority, 'lower')
  assert.equal(msg.sent[0].options.payload.untilScore, 900999)
})

test('a new advert repairs a legacy future recent cursor with its current maxScore', async () => {
  const msg = messenger()
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 9999999999999,
          recent: {
            targetScore: 9999999999999,
            windowMs: 900000,
            pending: {
              requestId: 'legacy-future',
              sinceScore: 9999999999999 - 900000 + 1,
              untilScore: 9999999999999
            }
          },
          updatedAt: 1000
        }
      }
    }
  }))
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1000, lastScore: 1000 } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000 }
  }), context(msg))

  const recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(controller._getState().owners[OWNER][PEER].completedScore, 999)
  assert.equal(recent.descentScore, 10000)
  assert.equal(recent.coveredCeiling, 10000)
  assert.equal(recent.pending.untilScore, 10000)
  assert.notEqual(recent.pending.requestId, 'legacy-future')
})

test('stale adverts use the five-second local score margin in both lanes', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1000, lastScore: 1000 } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 100, maxScore: 500 }
  }), context(msg))

  const owner = controller._getState().owners[OWNER][PEER]
  assert.equal(owner.pending.untilScore, 6000)
  assert.equal(owner.recent.descentScore, 6000)
  assert.equal(owner.recent.pending.untilScore, 6000)
})

test('both lanes cap history at the recent contiguous descent frontier', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 1000,
          recent: {
            descentScore: 5000,
            coveredCeiling: 10000,
            gapCeiling: null,
            headCoverage: null,
            windowMs: 900000
          },
          updatedAt: 1000
        }
      }
    }
  }))
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 20000 }
  }), context(msg))

  const historyAsk = msg.sent.find(item =>
    item.method === 'ask' && item.options.payload.priority === 'lower'
  )
  assert.ok(historyAsk)
  assert.equal(historyAsk.options.payload.sinceScore, 1001)
  assert.equal(historyAsk.options.payload.untilScore, 5000)
  assert.equal(controller._getState().owners[OWNER][PEER].recent.descentScore, 5000)
})

test('both-lane refresh cancels history work that crossed the recent frontier', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          advert: {
            generatedAt: 900,
            minScore: 1000,
            maxScore: 20000,
            messageAt: 900000,
            eventId: 'advert-event'
          },
          completedScore: 1000,
          pending: {
            requestId: 'crossed-frontier',
            sinceScore: 1001,
            untilScore: 10000
          },
          recent: {
            descentScore: 5000,
            coveredCeiling: 10000,
            gapCeiling: null,
            headCoverage: null,
            windowMs: 900000
          },
          updatedAt: 1000
        }
      }
    },
    exchanges: {
      [OWNER]: {
        [PEER]: {
          'ask:crossed-frontier': {
            direction: 'ask',
            requestId: 'crossed-frontier',
            status: 'awaiting-reply',
            events: { ask: [], reply: [] },
            updatedAt: 1000,
            expiresAt: 9999999999999
          }
        }
      }
    }
  }))
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      }
    })
  })

  assert.equal(await controller.refreshLaneModes(context(messenger())), true)
  const state = controller._getState()
  assert.equal(state.exchanges[OWNER][PEER]['ask:crossed-frontier'].status, 'deleting-ask')
  assert.notEqual(state.owners[OWNER][PEER].pending?.requestId, 'crossed-frontier')
  assert.ok(state.owners[OWNER][PEER].pending.untilScore <= 5000)
})

test('refreshing to recent-only cancels the historical pending without losing progress', async () => {
  let mode = 'both'
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getLaneMode: () => mode,
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      }
    })
  })
  const syncContext = context(msg)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 100000 }
  }), syncContext)
  let state = controller._getState()
  const historyRequestId = state.owners[OWNER][PEER].pending.requestId
  assert.ok(state.owners[OWNER][PEER].recent.pending)

  mode = 'recent'
  assert.equal(await controller.refreshLaneModes(syncContext), true)
  state = controller._getState()
  assert.equal(state.owners[OWNER][PEER].pending, null)
  assert.ok(state.owners[OWNER][PEER].recent.pending)
  assert.equal(
    state.exchanges[OWNER][PEER][`ask:${historyRequestId}`].status,
    'deleting-ask'
  )
})

test('refreshing to history-only cancels recent and absorbs only its contiguous base', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 5000,
          recent: {
            descentScore: 5000,
            coveredCeiling: 10000,
            gapCeiling: 13000,
            headCoverage: { floor: 12001, ceiling: 13000 },
            windowMs: 10000,
            pending: {
              phase: 'gap-head',
              requestId: 'recent-cancel',
              sinceScore: 12001,
              untilScore: 13000
            }
          },
          updatedAt: 1000
        }
      }
    }
  }))
  let mode = 'both'
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getLaneMode: () => mode,
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      }
    })
  })

  mode = 'history'
  assert.equal(await controller.refreshLaneModes(context(messenger())), true)
  const recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(controller._getState().owners[OWNER][PEER].completedScore, 10000)
  assert.equal(recent.pending, null)
  assert.equal(recent.descentScore, 10000)
  assert.deepEqual(recent.headCoverage, { floor: 12001, ceiling: 13000 })
  assert.equal(recent.gapCeiling, 13000)
})

test('invalid lane getters fall back to recent and report the policy error', async () => {
  const msg = messenger()
  const errors = []
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getLaneMode: async () => 'both',
    onError: error => errors.push(error),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 100000 }
  }), context(msg))

  assert.equal(controller._getState().owners[OWNER][PEER].pending, undefined)
  assert.ok(controller._getState().owners[OWNER][PEER].recent.pending)
  assert.ok(errors.some(error => error.code === 'INVALID_NOSTRDB_LANE_MODE'))
})

test('state mutations become readable synchronously before IndexedDB persistence resolves', async () => {
  const controller = createController({
    _indexedDB: null,
    _nowMs: () => 1000,
    _setTimeout: () => ({}),
    _clearTimeout: () => {},
    getDb: () => ({ subscribe: emptySubscription })
  })

  controller.requestAppBackfill({ ownerPubkey: OWNER, appId: 'app-visible' }, context(messenger()))

  const state = controller._getState()
  assert.equal(Object.values(state.appBackfills[OWNER])[0].appId, 'app-visible')
  await flushMicrotasks()
  controller.stop()
})

test('nostrdb sync infers owner from channel and builds bounded ask', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query (filter) {
        if (filter.search === 'algo:sync sort:desc') {
          return { results: [], meta: { firstScore: 1000, lastScore: 1000 } }
        }
        assert.equal(filter.search, 'algo:sync sort:asc')
        assert.equal(filter.ids_only, true)
        assert.equal(filter.limit, 200)
        return { results: [EVENT_ID], meta: { firstScore: 1000, lastScore: 1000 } }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 2000 }
  }), context(msg))

  const asks = msg.sent.filter(item => item.method === 'ask')
  assert.equal(asks.length, 2)
  const historyPending = controller._getState().owners[OWNER][PEER].pending
  const historyAsk = asks.find(item => item.options.payload.requestId === historyPending.requestId)
  assert.ok(historyAsk)
  assert.equal(historyAsk.options.code, NOSTRDB_SYNC_ASK_CODE)
  assert.equal(historyAsk.options.useBulkPacing, true)
  assert.equal(historyAsk.options.channelPubkey, 'channel')
  assert.equal(historyAsk.options.receiverPubkey, PEER)
  assert.equal(historyAsk.options.payload.sinceScore, 1000)
  assert.equal(historyAsk.options.payload.untilScore, 6000)
  assert.deepEqual(historyAsk.options.payload.excludeIds, [EVENT_ID])
  assert.equal(historyAsk.options.payload.limit, 200)
  assert.equal(Object.hasOwn(historyAsk.options.payload, 'ownerPubkey'), false)
})

test('newer advertisements do not bypass pending exchange verification', async () => {
  let now = 1000
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      async query () {
        return { results: [], meta: { firstScore: now, lastScore: now } }
      }
    })
  })
  const advertise = generatedAt => controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt, minScore: now, maxScore: now + 1 }
  }), context(msg))

  await advertise(now)
  let pending = controller._getState().owners[OWNER][PEER].pending
  const historyRequestId = pending.requestId
  const historySends = () => msg.sent.filter(item =>
    item.options.payload.requestId === historyRequestId
  )
  assert.equal(historySends().length, 1)
  assert.equal(pending.attempt, 0)
  assert.equal(pending.publicationState, 'published')
  assert.equal(pending.relayAckCount, 1)
  assert.equal(pending.onlineRetryAt, 0)
  assert.equal(pending.nextCheckAt, now + 20 * 60 * 1000)

  now = pending.nextCheckAt
  await advertise(now)
  assert.equal(historySends().length, 1)
  pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.attempt, 0)

  now += 1
  await advertise(now)
  assert.equal(historySends().length, 1)

  now += 15 * 60 * 1000
  await advertise(now)
  assert.equal(historySends().length, 1)
  pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.attempt, 0)

  const stats = controller.getDebugSnapshot().askStats
  assert.equal(stats.emitted[`${NOSTRDB_SYNC_ASK_CODE}:advertise`], 2)
  assert.equal(stats.suppressed[`${NOSTRDB_SYNC_ASK_CODE}:advertise`], 3)
})

test('missing range asks are republished only after the exchange check interval', async () => {
  let now = 1000
  const msg = messenger()
  const relay = 'wss://relay.test'
  const presenceQueries = []
  msg.ask = async options => {
    msg.sent.push({ method: 'ask', options })
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(100 + msg.sent.length),
          succeededRelays: [relay],
          success: true
        }]
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    _clearTimeout: () => {},
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays, options) {
        presenceQueries.push({ filter, relays, options })
        return {
          result: [],
          relays: relays.map(url => ({ relay: url, status: 'eose' }))
        }
      }
    },
    getDb: () => ({
      async query () {
        return { results: [], meta: { firstScore: now, lastScore: now } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  }), context(msg))
  const first = controller._getState().owners[OWNER][PEER].pending
  const firstPayload = msg.sent.find(item =>
    item.options.payload.requestId === first.requestId
  ).options.payload

  now += 5 * 60 * 1000 - 1
  await controller.runExchangeMaintenance(context(msg))
  assert.equal(
    msg.sent.filter(item => item.options.payload.requestId === first.requestId).length,
    1
  )

  now += 1
  await controller.runExchangeMaintenance(context(msg))
  const republished = msg.sent.filter(item =>
    item.options.payload.requestId === first.requestId
  )
  assert.equal(republished.length, 2)
  assert.deepEqual(republished[1].options.payload, firstPayload)
  assert.equal(controller._getState().owners[OWNER][PEER].pending.attempt, 1)
  assert.ok(presenceQueries.every(query => query.filter.ids.length <= 200))
  assert.ok(presenceQueries.every(query => query.options.deduplicateAcrossRelays === false))
})

test('unconfirmed asks retry quickly with the exact same request and payload', async () => {
  let now = 1000
  let attempts = 0
  const timers = []
  const msg = messenger()
  msg.ask = async options => {
    attempts++
    msg.sent.push({ method: 'ask', options })
    if (attempts === 1) return { delivery: { reports: [] } }
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(705),
          succeededRelays: ['wss://relay.test'],
          success: true
        }]
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    getLaneMode: () => 'history',
    onError: () => {},
    getDb: () => ({
      async query () {
        return { results: [], meta: { firstScore: now, lastScore: now } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  }), context(msg))

  let pending = controller._getState().owners[OWNER][PEER].pending
  const firstPayload = msg.sent[0].options.payload
  assert.equal(pending.publicationState, 'unconfirmed')
  assert.equal(pending.nextRetryAt, now + 1000)
  assert.equal(pending.nextCheckAt, 0)
  assert.equal(pending.attempt, 0)

  now = pending.nextRetryAt
  const retry = timers.find(timer => timer.ms === 1000)
  assert.ok(retry)
  retry.fn()
  await flushMicrotasks()

  pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(attempts, 2)
  assert.deepEqual(msg.sent[1].options.payload, firstPayload)
  assert.equal(msg.sent[1].options.idempotencyKey, msg.sent[0].options.idempotencyKey)
  assert.equal(pending.publicationState, 'published')
  assert.equal(pending.attempt, 1)
  assert.equal(pending.relayAckCount, 1)
  assert.equal(pending.nextRetryAt, 0)
  assert.equal(pending.nextCheckAt, now + 20 * 60 * 1000)
})

test('one accepted relay publication confirms an ask without waiting for every report', async () => {
  const now = 1000
  const msg = messenger()
  msg.ask = async options => {
    msg.sent.push({ method: 'ask', options })
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(708),
          succeededRelays: ['wss://relay-a.test'],
          success: true
        }, {
          outerEventId: eventId(709),
          succeededRelays: [],
          success: false
        }]
      }
    }
  }
  const errors = []
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getLaneMode: () => 'history',
    onError: error => errors.push(error),
    getDb: () => ({
      async query () {
        return { results: [], meta: { firstScore: now, lastScore: now } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  }), context(msg))

  const pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.publicationState, 'published')
  assert.equal(pending.relayAckCount, 1)
  assert.equal(pending.nextRetryAt, 0)
  assert.deepEqual(errors, [])
})

test('offline asks keep their backoff until a fresh advert arrives', async () => {
  let now = 10 * 60 * 1000
  let attempts = 0
  const timers = []
  const diagnostic = []
  const msg = messenger()
  msg.ask = async options => {
    attempts++
    msg.sent.push({ method: 'ask', options })
    if (attempts === 1) throw new Error('peer unavailable')
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(706),
          succeededRelays: ['wss://relay.test'],
          success: true
        }]
      }
    }
  }
  const syncContext = context(msg, { debug: event => diagnostic.push(event) })
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    getLaneMode: () => 'history',
    onError: () => {},
    getDb: () => ({
      async query () {
        return { results: [], meta: { firstScore: now, lastScore: now } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  }), syncContext)
  let pending = controller._getState().owners[OWNER][PEER].pending
  const offlineRetryAt = pending.nextRetryAt
  assert.equal(pending.publicationState, 'offline')
  assert.equal(offlineRetryAt, now + 5 * 60 * 1000)

  now += 1000
  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  }), syncContext)
  pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.nextRetryAt, offlineRetryAt)

  now += 1
  const fresh = syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  })
  fresh.outer = { id: 'fresh-advert', created_at: Math.floor(now / 1000) }
  await controller.handleMessage(fresh, syncContext)
  pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.nextRetryAt, now)
  assert.ok(diagnostic.some(event =>
    event.action === 'advertise-received' && event.anticipatedRetry === true
  ))

  const retry = timers.find(timer => timer.ms === 0)
  assert.ok(retry)
  retry.fn()
  await flushMicrotasks()
  pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(attempts, 2)
  assert.equal(pending.publicationState, 'published')
  assert.equal(pending.attempt, 1)
})

test('a fresh advert can check a published ask without republishing it', async () => {
  let now = 1000
  const askId = eventId(707)
  const timers = []
  const presenceChecks = []
  const msg = messenger()
  msg.ask = async options => {
    msg.sent.push({ method: 'ask', options })
    return {
      delivery: {
        reports: [{
          outerEventId: askId,
          succeededRelays: ['wss://relay.test'],
          success: true
        }]
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        presenceChecks.push({ filter, relays })
        return {
          result: filter.ids.includes(askId) ? [{ event: { id: askId }, relay: relays[0] }] : [],
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      }
    },
    getLaneMode: () => 'history',
    getDb: () => ({
      async query () {
        return { results: [], meta: { firstScore: now, lastScore: now } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  }), context(msg, { relaysForChannel: () => ['wss://relay.test'] }))
  assert.equal(msg.sent.length, 1)
  assert.equal(controller._getState().owners[OWNER][PEER].pending.publicationState, 'published')

  now += 60 * 1000
  const fresh = syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  })
  fresh.outer = { id: 'fresh-check', created_at: Math.floor(now / 1000) }
  await controller.handleMessage(fresh, context(msg, {
    relaysForChannel: () => ['wss://relay.test']
  }))

  const check = timers.find(timer => timer.ms === 0)
  assert.ok(check)
  check.fn()
  await flushMicrotasks()

  assert.equal(msg.sent.length, 1)
  assert.equal(presenceChecks.length, 1)
  const pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.publicationState, 'published')
  assert.equal(pending.nextCheckAt, now + 20 * 60 * 1000)
})

test('legacy pending asks migrate to exchange tracking and recover their exact request', async () => {
  let now = 1000000
  const relay = 'wss://relay.test'
  const requestId = 'legacy-request'
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          pending: {
            requestId,
            sinceScore: 100,
            untilScore: 900,
            excludeIds: [EVENT_ID],
            limit: 200,
            replyCount: 0,
            replyIndexes: [],
            attempt: 2,
            sentAt: now - 30 * 60 * 1000,
            nextRetryAt: now - 1,
            onlineRetryAt: now - 1
          },
          updatedAt: now - 30 * 60 * 1000
        }
      }
    }
  }))
  const msg = messenger()
  msg.ask = async options => {
    msg.sent.push({ method: 'ask', options })
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(710),
          succeededRelays: [relay],
          success: true
        }]
      }
    }
  }
  const timers = []
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        return {
          result: [],
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      }
    }
  })

  await controller.runExchangeMaintenance(context(msg, {
    channelPubkeyForOwner: () => 'channel',
    relaysForChannel: () => [relay]
  }))

  assert.equal(controller._getState().owners[OWNER][PEER].pending.publicationState, 'unconfirmed')
  assert.equal(msg.sent.length, 0)
  const retry = timers.find(timer => timer.ms === 4000)
  assert.ok(retry)
  now = controller._getState().owners[OWNER][PEER].pending.nextRetryAt
  retry.fn()
  await flushMicrotasks()

  assert.equal(msg.sent.length, 1)
  assert.deepEqual(msg.sent[0].options.payload, {
    requestId,
    sinceScore: 100,
    untilScore: 900,
    excludeIds: [EVENT_ID],
    limit: 200
  })
  assert.ok(controller._getState().exchanges[OWNER][PEER][`ask:${requestId}`])
  assert.equal(controller._getState().owners[OWNER][PEER].pending.attempt, 3)
  now += 1
})

test('exchange presence checks group relays and bound each query to 200 ids', async () => {
  const relayA = 'wss://relay-a.test'
  const relayB = 'wss://relay-b.test'
  const entries = {}
  for (let index = 0; index < 450; index++) {
    const id = eventId(index + 1)
    const relays = index < 225 ? [relayA] : [relayB]
    entries[`ask:req-${index}`] = {
      direction: 'ask',
      requestId: `req-${index}`,
      status: 'awaiting-reply',
      events: { ask: [{ id, relays, expiresAt: 9999999999999 }], reply: [] },
      lastAskPublishedAt: 1000,
      nextCheckAt: 1000,
      expiresAt: 9999999999999
    }
  }
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    exchanges: { [OWNER]: { [PEER]: entries } }
  }))
  const queries = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _setTimeout: () => ({}),
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays, options) {
        queries.push({ filter, relays, options })
        return {
          result: filter.ids.map(id => ({ event: { id }, relay: relays[0] })),
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      }
    }
  })

  await controller.runExchangeMaintenance(context(msg))

  assert.deepEqual(queries.map(query => query.filter.ids.length), [200, 25, 200, 25])
  assert.ok(queries.every(query => query.options.deduplicateAcrossRelays === false))
  assert.deepEqual(
    new Set(queries.map(query => query.relays.join(','))),
    new Set([relayA, relayB])
  )
})

test('offline or indeterminate presence never republishes an exchange', async () => {
  const relay = 'wss://relay.test'
  const askId = eventId(700)
  const record = {
    direction: 'ask',
    requestId: 'offline-check',
    channelPubkey: 'channel',
    code: NOSTRDB_SYNC_ASK_CODE,
    status: 'awaiting-reply',
    requestPayload: {
      requestId: 'offline-check',
      sinceScore: 1,
      untilScore: 2,
      excludeIds: [],
      limit: 200
    },
    events: { ask: [{ id: askId, relays: [relay], expiresAt: 9999999999999 }], reply: [] },
    lastAskPublishedAt: 1000,
    nextCheckAt: 1000,
    expiresAt: 9999999999999
  }
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    exchanges: { [OWNER]: { [PEER]: { 'ask:offline-check': record } } }
  }))
  let now = 1000 + 10 * 60 * 1000
  let queries = 0
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _setTimeout: () => ({}),
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        queries++
        return {
          result: [],
          relays: relays.map(relay => ({ relay, status: 'timeout' }))
        }
      }
    }
  })

  await controller.runExchangeMaintenance(context(msg))
  assert.equal(queries, 1)
  assert.equal(msg.sent.length, 0)
  assert.ok(controller._getState().exchanges[OWNER][PEER]['ask:offline-check'])

  now += 20 * 60 * 1000
  const offline = createNostrDbSyncController({
    _nowMs: () => now,
    _setTimeout: () => ({}),
    _isOnline: async () => false
  })
  await offline.runExchangeMaintenance(context(msg))
  const deferred = offline._getState().exchanges[OWNER][PEER]['ask:offline-check']
  assert.equal(deferred.nextCheckAt, now + 20 * 60 * 1000)
  assert.equal(msg.sent.length, 0)
})

test('a present ask with a missing reply is answered again after five minutes', async () => {
  let now = 1000
  const relay = 'wss://relay.test'
  const askId = eventId(800)
  const replies = []
  const msg = messenger()
  msg.reply = async options => {
    replies.push(options)
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(801 + replies.length),
          succeededRelays: [relay],
          success: true
        }],
        deletionSeckey: 'd'.repeat(64)
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _setTimeout: () => ({}),
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        const present = filter.ids.includes(askId) ? [{ event: { id: askId }, relay }] : []
        return {
          result: present,
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      }
    },
    getDb: () => ({
      async query () {
        return { results: [], meta: { scores: [] } }
      }
    })
  })
  const message = syncMessage({
    code: NOSTRDB_SYNC_ASK_CODE,
    payload: {
      requestId: 'reply-recovery',
      sinceScore: 1,
      untilScore: 2,
      excludeIds: [],
      limit: 200
    }
  })
  message.outer = { id: askId, created_at: 1 }
  const syncContext = context(msg, { relaysForChannel: () => [relay] })

  await controller.handleMessage(message, syncContext)
  assert.equal(replies.length, 1)

  now += 5 * 60 * 1000 - 1
  await controller.runExchangeMaintenance(syncContext)
  assert.equal(replies.length, 1)

  now += 1
  await controller.runExchangeMaintenance(syncContext)
  assert.equal(replies.length, 2)
  assert.equal(replies[1].payload.requestId, 'reply-recovery')
  const record = controller._getState().exchanges[OWNER][PEER]['reply:reply-recovery']
  assert.equal(record.events.reply.length, 2)
  assert.equal(record.status, 'reply-published')
})

test('a present app ask regenerates its complete app reply after five minutes', async () => {
  let now = 1000
  const relay = 'wss://relay.test'
  const askId = eventId(850)
  const replies = []
  const msg = messenger()
  msg.reply = async options => {
    replies.push(options)
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(851 + replies.length),
          succeededRelays: [relay],
          success: true
        }]
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _setTimeout: () => ({}),
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        return {
          result: filter.ids.includes(askId) ? [{ event: { id: askId }, relay }] : [],
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      }
    },
    getDb: () => ({
      async exportEventsByAppPage () {
        return { events: [], hasMore: false, nextAfter: '' }
      }
    })
  })
  const message = syncMessage({
    code: NOSTRDB_SYNC_APP_ASK_CODE,
    payload: { requestId: 'app-reply-recovery', appId: 'app-1', after: '', batchSize: 200 }
  })
  message.outer = { id: askId, created_at: 1 }
  const syncContext = context(msg, { relaysForChannel: () => [relay] })

  await controller.handleMessage(message, syncContext)
  now += 5 * 60 * 1000
  await controller.runExchangeMaintenance(syncContext)

  assert.equal(replies.length, 2)
  assert.equal(replies[1].code, NOSTRDB_SYNC_APP_REPLY_CODE)
  assert.equal(replies[1].payload.requestId, 'app-reply-recovery')
  assert.equal(replies[1].payload.appId, 'app-1')
})

for (const app of [false, true]) {
  test(`${app ? 'app ' : ''}replies inherit the ask expiration and drop already-expired asks`, async () => {
    const msg = messenger()
    const controller = createNostrDbSyncController({
      _nowMs: () => 1_000_000,
      _setTimeout: () => ({}),
      getDb: () => ({
        async query () {
          return { results: [], meta: { scores: [] } }
        },
        async exportEventsByAppPage () {
          return { events: [], hasMore: false, nextAfter: '' }
        }
      })
    })
    const code = app ? NOSTRDB_SYNC_APP_ASK_CODE : NOSTRDB_SYNC_ASK_CODE
    const payload = app
      ? { requestId: 'expiring-app', appId: 'app-1', after: '', batchSize: 200 }
      : { requestId: 'expiring-range', sinceScore: 1, untilScore: 2, excludeIds: [], limit: 200 }
    const valid = syncMessage({ code, payload })
    valid.outer = { id: eventId(870), created_at: 1000, tags: [['expiration', '1060']] }

    await controller.handleMessage(valid, context(msg))
    assert.equal(msg.sent.length, 1)
    assert.equal(msg.sent[0].method, 'reply')
    assert.equal(msg.sent[0].options.expiresAt, 1060)

    const expired = syncMessage({
      code,
      payload: { ...payload, requestId: `${payload.requestId}-expired` }
    })
    expired.outer = { id: eventId(871), created_at: 1000, tags: [['expiration', '1000']] }
    await controller.handleMessage(expired, context(msg))
    assert.equal(msg.sent.length, 1)
  })
}

test('deletion tries the s-tag capability and regular author deletion without AUTH', async () => {
  const now = 1000
  const relay = 'wss://relay.test'
  const askId = eventId(900)
  const channelPubkey = 'f'.repeat(64)
  const deletionSeckey = 'd'.repeat(64)
  const deletionPubkey = keypairFromSeckey(deletionSeckey).pubkey
  let replyId = ''
  let replyPresent = true
  const sends = []
  const msg = messenger()
  msg.reply = async () => {
    replyId = eventId(901)
    return {
      delivery: {
        reports: [{
          outerEventId: replyId,
          succeededRelays: [relay],
          success: true
        }],
        deletionSeckey
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _setTimeout: () => ({}),
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        const present = replyPresent && filter.ids.includes(replyId)
          ? [{ event: { id: replyId }, relay }]
          : []
        return {
          result: present,
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      },
      async sendEvent (event, relays, options) {
        sends.push({ event, relays, options })
        return {
          success: true,
          promise: Promise.resolve({ succeededRelays: relays })
        }
      }
    },
    getDb: () => ({
      async query () {
        return { results: [], meta: { scores: [] } }
      }
    })
  })
  const message = syncMessage({
    code: NOSTRDB_SYNC_ASK_CODE,
    payload: {
      requestId: 'deletion',
      sinceScore: 1,
      untilScore: 2,
      excludeIds: [],
      limit: 200
    }
  })
  message.outer = { id: askId, created_at: 1 }
  const channelSigner = {
    async signEvent (template) {
      return { ...template, pubkey: channelPubkey }
    }
  }
  const syncContext = context(msg, {
    relaysForChannel: () => [relay],
    channelSignerFor: () => channelSigner
  })

  await controller.handleMessage(message, syncContext)
  await controller.runExchangeMaintenance(syncContext)

  assert.equal(sends.length, 2)
  assert.ok(sends.every(({ event }) => event.kind === 5))
  assert.ok(sends.every(({ event }) => event.tags.some(tag => tag[0] === 'e' && tag[1] === replyId)))
  assert.deepEqual(new Set(sends.map(({ event }) => event.pubkey)), new Set([deletionPubkey, channelPubkey]))
  assert.ok(sends.every(({ options }) => !Object.hasOwn(options, 'getAuthEvent')))
  assert.ok(controller._getState().exchanges[OWNER][PEER]['reply:deletion'])

  replyPresent = false
  await controller.runExchangeMaintenance(syncContext)
  assert.equal(controller._getState().exchanges?.[OWNER]?.[PEER]?.['reply:deletion'], undefined)
})

test('regular author deletion remains the fallback when an envelope has no s capability', async () => {
  const relay = 'wss://relay.test'
  const channelPubkey = 'f'.repeat(64)
  const askId = eventId(910)
  const replyId = eventId(911)
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    exchanges: {
      [OWNER]: {
        [PEER]: {
          'reply:no-s': {
            direction: 'reply',
            requestId: 'no-s',
            channelPubkey: 'channel',
            status: 'deleting-reply',
            events: {
              ask: [{ id: askId, relays: [relay], expiresAt: 9999999999999 }],
              reply: [{ id: replyId, relays: [relay], expiresAt: 9999999999999 }]
            },
            nextCheckAt: 1000,
            expiresAt: 9999999999999
          }
        }
      }
    }
  }))
  const sends = []
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _setTimeout: () => ({}),
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        return {
          result: filter.ids.includes(replyId) ? [{ event: { id: replyId }, relay }] : [],
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      },
      async sendEvent (event, relays, options) {
        sends.push({ event, relays, options })
        return { success: true, promise: Promise.resolve({ succeededRelays: relays }) }
      }
    }
  })
  const channelSigner = {
    async signEvent (template) {
      return { ...template, pubkey: channelPubkey }
    }
  }

  await controller.runExchangeMaintenance(context(messenger(), {
    channelSignerFor: () => channelSigner
  }))

  assert.equal(sends.length, 1)
  assert.equal(sends[0].event.pubkey, channelPubkey)
  assert.ok(sends[0].event.tags.some(tag => tag[0] === 'e' && tag[1] === replyId))
  assert.equal(Object.hasOwn(sends[0].options, 'getAuthEvent'), false)
})

test('exchange retention expires after the ten-minute grace even while offline', async () => {
  let now = 2000
  const makeRecord = requestId => ({
    direction: 'ask',
    requestId,
    status: 'awaiting-reply',
    events: { ask: [], reply: [] },
    nextCheckAt: now,
    expiresAt: now + (requestId === 'expired' ? 0 : 1)
  })
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          pending: { requestId: 'expired' },
          recent: {
            pending: {
              requestId: 'fresh',
              publicationState: 'published',
              publishedAt: now,
              relayAckCount: 1,
              nextCheckAt: now
            }
          },
          updatedAt: now
        }
      }
    },
    exchanges: {
      [OWNER]: {
        [PEER]: {
          'ask:expired': makeRecord('expired'),
          'ask:fresh': makeRecord('fresh')
        }
      }
    }
  }))
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _setTimeout: () => ({}),
    _isOnline: async () => false
  })

  await controller.runExchangeMaintenance(context(messenger()))
  const records = controller._getState().exchanges[OWNER][PEER]
  assert.equal(records['ask:expired'], undefined)
  assert.ok(records['ask:fresh'])
  assert.equal(records['ask:fresh'].nextCheckAt, now + 20 * 60 * 1000)
  assert.equal(controller._getState().owners[OWNER][PEER].pending, null)
  assert.ok(controller._getState().owners[OWNER][PEER].recent.pending)
  now += 1
})

test('non-contiguous reply indexes do not complete or delete the ask', async () => {
  const diagnostics = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  const syncContext = context(msg, { debug: event => diagnostics.push(event) })
  controller.ensureSubscriptions(syncContext)
  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000000 }
  }), syncContext)
  const historyAsk = msg.sent.find(item => item.options.payload.priority === 'lower').options.payload

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: historyAsk.requestId,
      sinceScore: historyAsk.sinceScore,
      untilScore: historyAsk.untilScore,
      hasMore: false,
      index: 1,
      isLast: true,
      jsonl: `${JSON.stringify(event(1))}\n`
    }
  }), syncContext)

  const owner = controller._getState().owners[OWNER][PEER]
  assert.equal(owner.pending.requestId, historyAsk.requestId)
  assert.equal(owner.completedScore, undefined)
  assert.equal(owner.pending.replyIndexes.join(','), '1')
  assert.ok(diagnostics.some(entry => entry.action === 'reply-incomplete'))
})

for (const testCase of [
  {
    name: 'mismatched',
    range: { sinceScore: 101, untilScore: 200 }
  },
  {
    name: 'incomplete',
    range: { sinceScore: 100 }
  }
]) {
  test(`${testCase.name} reply range metadata is rejected before ingestion`, async () => {
    globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
      owners: {
        [OWNER]: {
          [PEER]: {
            pending: {
              requestId: 'range-request',
              sinceScore: 100,
              untilScore: 200,
              excludeIds: [],
              limit: 200,
              replyCount: 0,
              replyIndexes: []
            }
          }
        }
      }
    }))
    const addCalls = []
    const msg = messenger()
    const controller = createNostrDbSyncController({
      _setTimeout: () => ({}),
      getDb: () => ({
        async add (imported) {
          addCalls.push(imported)
          return { ok: true, stored: true }
        }
      })
    })

    await assert.rejects(controller.handleMessage(syncMessage({
      code: NOSTRDB_SYNC_REPLY_CODE,
      payload: {
        requestId: 'range-request',
        ...testCase.range,
        index: 0,
        isLast: true,
        jsonl: `${JSON.stringify(event(1))}\n`
      }
    }), context(msg)), error => {
      assert.equal(error.code, 'SYNC_PAYLOAD_INVALID')
      assert.equal(
        error.reason,
        testCase.name === 'incomplete' ? 'reply-range-incomplete' : 'reply-range-mismatch'
      )
      return true
    })
    assert.deepEqual(addCalls, [])
    const pending = controller._getState().owners[OWNER][PEER].pending
    assert.equal(pending.replyCount, 0)
    assert.deepEqual(pending.replyIndexes, [])
    controller.stop()
  })
}

test('legacy replies without range metadata still complete a pending request', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          pending: {
            requestId: 'legacy-range-request',
            sinceScore: 100,
            untilScore: 200,
            excludeIds: [],
            limit: 200,
            replyCount: 0,
            replyIndexes: []
          }
        }
      }
    }
  }))
  const imported = event(1)
  const addCalls = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _setTimeout: () => ({}),
    getDb: () => ({
      async add (added) {
        addCalls.push(added)
        return { ok: true, stored: true }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: 'legacy-range-request',
      index: 0,
      isLast: true,
      hasMore: false,
      jsonl: `${JSON.stringify(imported)}\n`
    }
  }), context(msg))

  assert.deepEqual(addCalls, [imported])
  const owner = controller._getState().owners[OWNER][PEER]
  assert.equal(owner.pending, null)
  assert.equal(owner.completedScore, 200)
  controller.stop()
})

test('late replies without a pending request are ingested without changing the active cursor', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          pending: {
            requestId: 'current-request',
            sinceScore: 100,
            untilScore: 200,
            excludeIds: [],
            limit: 200,
            replyCount: 0,
            replyIndexes: []
          }
        }
      }
    }
  }))
  const imported = event(1)
  const addCalls = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _setTimeout: () => ({}),
    getDb: () => ({
      async add (added) {
        addCalls.push(added)
        return { ok: true, stored: true }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: 'superseded-request',
      index: 0,
      isLast: true,
      hasMore: false,
      jsonl: `${JSON.stringify(imported)}\n`
    }
  }), context(msg))

  assert.deepEqual(addCalls, [imported])
  const owner = controller._getState().owners[OWNER][PEER]
  assert.equal(owner.pending.requestId, 'current-request')
  assert.equal(owner.pending.replyCount, 0)
  assert.equal(owner.completedScore, undefined)
  controller.stop()
})

test('nostrdb data payload validation quarantines shape errors and ignores invalid requests', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    getDb: () => ({ subscribe: emptySubscription }),
    _setTimeout: () => ({}),
    _clearTimeout: () => {}
  })
  controller.ensureSubscriptions(context(msg))

  for (const [code, payload] of [
    [NOSTRDB_SYNC_ADVERTISE_CODE, {}],
    [NOSTRDB_SYNC_REPLY_CODE, { index: 0, isLast: true, jsonl: '{}\n' }],
    [NOSTRDB_SYNC_PUSH_CODE, { index: 0, isLast: false, jsonl: '{}\n' }],
    [NOSTRDB_SYNC_APP_REPLY_CODE, { appId: 'app', index: 0, isLast: true, jsonl: '{}\n' }]
  ]) {
    await assert.rejects(controller.handleMessage(syncMessage({ code, payload }), context(msg)), error => {
      assert.equal(error.code, 'SYNC_PAYLOAD_INVALID')
      assert.equal(error.quarantineable, true)
      return true
    })
  }
  assert.equal(await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ASK_CODE,
    payload: { requestId: '', sinceScore: 2, untilScore: 1 }
  }), context(msg)), true)
  assert.equal(await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_APP_ASK_CODE,
    payload: { requestId: '', appId: '', batchSize: 0 }
  }), context(msg)), true)
})

test('nostrdb sync replies with an empty final chunk when no events are missing', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    getDb: () => ({
      async query (filter) {
        assert.deepEqual(filter['!ids'], [EVENT_ID])
        return { results: [], meta: { scores: [] } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ASK_CODE,
    payload: {
      requestId: 'req-1',
      sinceScore: 1,
      untilScore: 2,
      excludeIds: [EVENT_ID],
      limit: 200
    }
  }), context(msg))

  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].method, 'reply')
  assert.equal(msg.sent[0].options.code, NOSTRDB_SYNC_REPLY_CODE)
  assert.match(msg.sent[0].options.idempotencyKey, /^[0-9a-f]{64}:0$/)
  assert.deepEqual(msg.sent[0].options.payload, {
    requestId: 'req-1',
    sinceScore: 1,
    untilScore: 2,
    hasMore: false,
    priority: 'normal',
    index: 0,
    isLast: true,
    jsonl: ''
  })
})

test('nostrdb sync preserves an explicitly lower recovery ask in its reply', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    getDb: () => ({
      async query () {
        return { results: [], meta: { scores: [] } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ASK_CODE,
    payload: {
      requestId: 'req-lower',
      sinceScore: 1,
      untilScore: 2,
      excludeIds: [],
      limit: 200,
      priority: 'lower'
    }
  }), context(msg))

  assert.equal(msg.sent[0].options.payload.priority, 'lower')
})

test('nostrdb sync replies with hasMore when responder cap is hit', async () => {
  const msg = messenger()
  const events = [event(1), event(2), event(3)]
  let seenFilter
  const controller = createNostrDbSyncController({
    getDb: () => ({
      async query (filter) {
        seenFilter = filter
        return { results: events, meta: { scores: [1, 2, 3] } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ASK_CODE,
    payload: {
      requestId: 'req-1',
      sinceScore: 1,
      untilScore: 2,
      excludeIds: [],
      limit: 2
    }
  }), context(msg))

  assert.equal(seenFilter.limit, 3)
  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].options.payload.hasMore, true)
  assert.equal(msg.sent[0].options.payload.isLast, true)
  assert.deepEqual(
    msg.sent[0].options.payload.jsonl.trim().split('\n').map(line => JSON.parse(line).id),
    [eventId(1), eventId(2)]
  )
})

test('responders accept dense exclude lists up to 1024 ids and still detect hasMore', async () => {
  const msg = messenger()
  const events = Array.from({ length: 201 }, (_, index) => event(index + 1))
  const excludeIds = Array.from({ length: 1024 }, (_, index) => eventId(10000 + index))
  let seenFilter
  const controller = createNostrDbSyncController({
    getDb: () => ({
      async query (filter) {
        seenFilter = filter
        return { results: events, meta: { scores: [] } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ASK_CODE,
    payload: {
      requestId: 'dense-excludes',
      sinceScore: 1,
      untilScore: 1000,
      excludeIds,
      limit: 200
    }
  }), context(msg))

  assert.equal(seenFilter['!ids'].length, 1024)
  assert.equal(seenFilter.limit, 201)
  assert.equal(msg.sent.length > 0, true)
  assert.equal(msg.sent[0].options.payload.hasMore, true)

  const replies = msg.sent.length
  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ASK_CODE,
    payload: {
      requestId: 'too-many-excludes',
      sinceScore: 1,
      untilScore: 1000,
      excludeIds: Array.from({ length: 1025 }, (_, index) => eventId(20000 + index)),
      limit: 200
    }
  }), context(msg))
  assert.equal(msg.sent.length, replies)
})

test('nostrdb app backfill stores install intent and asks trusted peers', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({ subscribe: emptySubscription })
  })
  controller.ensureSubscriptions(context(msg))

  assert.equal(controller.requestAppBackfill({ ownerPubkey: OWNER, appId: 'app-1' }, context(msg)), true)
  await flushMicrotasks()

  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].method, 'ask')
  assert.equal(msg.sent[0].options.code, NOSTRDB_SYNC_APP_ASK_CODE)
  assert.equal(msg.sent[0].options.channelPubkey, 'channel')
  assert.equal(msg.sent[0].options.receiverPubkey, PEER)
  assert.equal(msg.sent[0].options.payload.appId, 'app-1')
  assert.equal(msg.sent[0].options.payload.after, '')
  assert.equal(msg.sent[0].options.payload.batchSize, 200)

  const apps = controller._getState().appBackfills[OWNER]
  const appState = Object.values(apps)[0]
  assert.equal(appState.appId, 'app-1')
  assert.equal(appState.peers[PEER].pending.requestId, msg.sent[0].options.payload.requestId)
  assert.equal(
    controller.getDebugSnapshot().askStats.emitted[`${NOSTRDB_SYNC_APP_ASK_CODE}:initial`],
    1
  )
})

test('nostrdb app backfill persists unlocked requests when no trusted peers exist', () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    getDb: () => ({ subscribe: emptySubscription })
  })

  assert.equal(controller.requestAppBackfill({
    ownerPubkey: OWNER,
    appId: 'app-1'
  }, context(msg, { trustedByPubkey: new Map() })), true)

  assert.deepEqual(Object.keys(controller._getState().appBackfills || {}), [OWNER])
  assert.deepEqual(msg.sent, [])
})

test('nostrdb app backfill resolves locked intents once and freezes target peers', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({ subscribe: emptySubscription })
  })

  assert.equal(controller.requestAppBackfill({
    ownerPubkey: OWNER,
    appId: 'app-1'
  }, context(msg, {
    messenger: null,
    trustedByPubkey: new Map(),
    deferAppBackfillPeerResolution: true
  })), true)
  assert.deepEqual(msg.sent, [])

  controller.ensureSubscriptions(context(msg))
  await controller.processAppBackfills(context(msg))

  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].options.receiverPubkey, PEER)
  assert.equal(msg.sent[0].options.code, NOSTRDB_SYNC_APP_ASK_CODE)

  controller.ensureSubscriptions(context(msg, {
    trustedByPubkey: new Map([
      [PEER, { pubkey: PEER }],
      [PEER2, { pubkey: PEER2 }]
    ])
  }))
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(msg.sent.length, 1)
  const appState = Object.values(controller._getState().appBackfills[OWNER])[0]
  assert.deepEqual(Object.keys(appState.peers), [PEER])
})

test('nostrdb app backfill keeps locked intents if unlock still has no trusted peers', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    getDb: () => ({ subscribe: emptySubscription })
  })

  assert.equal(controller.requestAppBackfill({
    ownerPubkey: OWNER,
    appId: 'app-1'
  }, context(msg, {
    messenger: null,
    trustedByPubkey: new Map(),
    deferAppBackfillPeerResolution: true
  })), true)

  controller.ensureSubscriptions(context(msg, { trustedByPubkey: new Map() }))
  await Promise.resolve()

  assert.deepEqual(Object.keys(controller._getState().appBackfills || {}), [OWNER])
  assert.deepEqual(msg.sent, [])
})

test('nostrdb app backfill waits for channel readiness and sends once', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({ subscribe: emptySubscription })
  })
  const notReady = context(msg, {
    readyOwnerPubkeys: new Set(),
    channelPubkeyForOwner: () => ''
  })

  assert.equal(controller.requestAppBackfill({ ownerPubkey: OWNER, appId: 'app-1' }, notReady), true)
  await controller.processAppBackfills(notReady)
  assert.deepEqual(msg.sent, [])

  const ready = context(msg)
  controller.ensureSubscriptions(ready)
  await Promise.all([
    controller.processAppBackfills(ready),
    controller.processAppBackfills(ready)
  ])

  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].options.channelPubkey, 'channel')
})

test('nostrdb app backfill retains pending state when publication fails', async () => {
  const errors = []
  const msg = messenger()
  msg.ask = async options => {
    msg.sent.push({ method: 'ask', options })
    return { delivery: { reports: [{ success: false }] } }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    onError: err => errors.push(err),
    getDb: () => ({ subscribe: emptySubscription })
  })

  controller.requestAppBackfill({ ownerPubkey: OWNER, appId: 'app-1' }, context(msg))
  await controller.processAppBackfills(context(msg))

  const appState = Object.values(controller._getState().appBackfills[OWNER])[0]
  assert.ok(appState.peers[PEER].pending)
  assert.equal(errors.at(-1).message, 'SYNC_PUBLICATION_FAILED')
})

test('nostrdb app backfill does not retry before a publication circuit deadline', async () => {
  let now = 1000
  let attempts = 0
  const retryAt = now + 30 * 60 * 1000
  const errors = []
  const timers = []
  const msg = messenger()
  msg.ask = async options => {
    attempts++
    msg.sent.push({ method: 'ask', options })
    if (attempts === 1) {
      throw Object.assign(new Error('RELAY_CIRCUIT_OPEN'), {
        code: 'RELAY_CIRCUIT_OPEN',
        category: 'timeout',
        retryAt,
        retryWhenAvailable: true
      })
    }
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(100 + attempts),
          succeededRelays: ['wss://relay.test'],
          success: true
        }]
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        return {
          result: [],
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      }
    },
    onError: err => errors.push(err),
    getDb: () => ({ subscribe: emptySubscription })
  })

  controller.requestAppBackfill({ ownerPubkey: OWNER, appId: 'app-1' }, context(msg))
  await controller.processAppBackfills(context(msg))

  const appState = Object.values(controller._getState().appBackfills[OWNER])[0]
  assert.equal(attempts, 1)
  assert.equal(appState.peers[PEER].pending.nextRetryAt, retryAt)
  assert.equal(appState.peers[PEER].pending.onlineRetryAt, retryAt)
  assert.equal(errors.at(-1).code, 'RELAY_CIRCUIT_OPEN')

  now = retryAt - 1
  let retry = timers.find(timer => timer.ms === 1)
  if (!retry) retry = timers.at(-1)
  assert.ok(retry)
  retry.fn()
  await flushMicrotasks()
  assert.equal(attempts, 1)

  now = retryAt
  retry = timers.find(timer => timer.ms === 1)
  assert.ok(retry)
  retry.fn()
  await flushMicrotasks()
  assert.equal(attempts, 2)
})

test('nostrdb range sync does not retry before a publication circuit deadline', async () => {
  let now = 1000
  const retryAt = now + 30 * 60 * 1000
  let attempts = 0
  const timers = []
  const msg = messenger()
  msg.ask = async options => {
    attempts++
    msg.sent.push({ method: 'ask', options })
    throw Object.assign(new Error('RELAY_CIRCUIT_OPEN'), {
      code: 'RELAY_CIRCUIT_OPEN',
      category: 'timeout',
      retryAt,
      retryWhenAvailable: true
    })
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        return {
          result: [],
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      }
    },
    onError: () => {},
    getDb: () => ({
      async query () {
        return { results: [], meta: { firstScore: now, lastScore: now } }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  }), context(msg))

  const owner = controller._getState().owners[OWNER][PEER]
  assert.equal(attempts, 2)
  assert.equal(owner.pending.nextRetryAt, retryAt)
  assert.equal(owner.pending.onlineRetryAt, retryAt)

  now = retryAt - 1
  let retry = timers.find(timer => timer.ms === 1)
  if (!retry) retry = timers.at(-1)
  assert.ok(retry)
  retry.fn()
  await flushMicrotasks()
  assert.equal(attempts, 2)

  now = retryAt
  retry = timers.find(timer => timer.ms === 1)
  assert.ok(retry)
  retry.fn()
  await flushMicrotasks()
  assert.equal(attempts, 4)
})

test('paused range asks wait for explicit resume without spending backoff', async () => {
  let attempts = 0
  const timers = []
  const msg = messenger()
  msg.ask = async options => {
    attempts++
    msg.sent.push({ method: 'ask', options })
    if (attempts <= 2) {
      throw Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
        code: 'PRIVATE_MESSENGER_PAUSED',
        pauseReasons: ['capacity']
      })
    }
    return {
      delivery: {
        reports: [{
          outerEventId: eventId(100 + attempts),
          succeededRelays: ['wss://relay.test'],
          success: true
        }]
      }
    }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _isOnline: async () => true,
    _relayPool: {
      async getEvents (filter, relays) {
        return {
          result: [],
          relays: relays.map(relay => ({ relay, status: 'eose' }))
        }
      }
    },
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1000, lastScore: 1000 } }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 2000 }
  }), context(msg))

  const pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.waitingForResume, true)
  assert.equal(pending.attempt, 0)
  assert.equal(timers.some(timer => timer.ms === 5 * 60 * 1000), false)

  await controller.resumeAfterPause(context(msg))
  assert.equal(attempts, 4)
  assert.equal(controller._getState().owners[OWNER][PEER].pending.waitingForResume, undefined)
  assert.equal(controller._getState().owners[OWNER][PEER].pending.attempt, 1)
  assert.equal(controller._getState().owners[OWNER][PEER].recent.pending.waitingForResume, undefined)
  assert.equal(controller._getState().owners[OWNER][PEER].recent.pending.attempt, 1)

  const exchangeFlush = timers.find(timer => timer.ms === 0)
  assert.ok(exchangeFlush)
  await exchangeFlush.fn()
  await flushMicrotasks()
  assert.equal(attempts, 4)
})

test('waiting-for-resume state recovers after reload once the messenger is active', async () => {
  const first = messenger()
  first.ask = async () => {
    throw Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
      code: 'PRIVATE_MESSENGER_PAUSED',
      pauseReasons: ['capacity']
    })
  }
  const options = {
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1000, lastScore: 1000 } }
      }
    })
  }
  const firstController = createNostrDbSyncController(options)
  firstController.ensureSubscriptions(context(first))
  await firstController.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 2000 }
  }), context(first))
  assert.equal(firstController._getState().owners[OWNER][PEER].pending.waitingForResume, true)

  const second = messenger()
  second.readStatus = () => ({ paused: false })
  const secondController = createNostrDbSyncController(options)
  secondController.ensureSubscriptions(context(second))
  await flushMicrotasks(30)

  assert.equal(second.sent.filter(item => item.options.code === NOSTRDB_SYNC_ASK_CODE).length, 2)
  assert.equal(secondController._getState().owners[OWNER][PEER].pending.waitingForResume, undefined)
  assert.equal(secondController._getState().owners[OWNER][PEER].recent.pending.waitingForResume, undefined)
})

test('resume does not bypass a relay retry deadline attached to a paused error', async () => {
  let now = 1000
  let attempts = 0
  const retryAt = now + 10 * 60 * 1000
  const msg = messenger()
  const timers = []
  msg.ask = async () => {
    attempts++
    throw Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
      code: 'PRIVATE_MESSENGER_PAUSED',
      retryAt,
      pauseReasons: ['capacity']
    })
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1000, lastScore: 1000 } }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))
  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 2000 }
  }), context(msg))

  const pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.waitingForResume, true)
  assert.equal(pending.publicationState, 'waitingForResume')
  assert.equal(pending.nextRetryAt, retryAt)
  await controller.resumeAfterPause(context(msg))
  assert.equal(attempts, 2)

  const retry = timers.find(timer => timer.ms === retryAt - 1000)
  assert.ok(retry)
  now = retryAt
  retry.fn()
  await flushMicrotasks()
  assert.equal(attempts, 4)
})

test('paused app backfills resume immediately without increasing backoff', async () => {
  let attempts = 0
  const errors = []
  const msg = messenger()
  msg.ask = async options => {
    attempts++
    msg.sent.push({ method: 'ask', options })
    if (attempts === 1) {
      throw Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
        code: 'PRIVATE_MESSENGER_PAUSED',
        pauseReasons: ['storage']
      })
    }
    return { delivery: { reports: [{ success: true }] } }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    onError: error => errors.push(error),
    getDb: () => ({ subscribe: emptySubscription })
  })
  controller.requestAppBackfill({ ownerPubkey: OWNER, appId: 'app-1' }, context(msg))
  await controller.processAppBackfills(context(msg))

  let app = Object.values(controller._getState().appBackfills[OWNER])[0]
  assert.equal(app.peers[PEER].pending.waitingForResume, true)
  assert.equal(app.peers[PEER].pending.attempt, 0)

  await controller.resumeAfterPause(context(msg))
  assert.equal(attempts, 2)
  app = Object.values(controller._getState().appBackfills[OWNER])[0]
  assert.equal(app.peers[PEER].pending.waitingForResume, undefined)
  assert.ok(errors.some(error => error.message === 'PRIVATE_MESSENGER_PAUSED'))
})

test('resuming a pause flushes queued NostrDB pushes without waiting for cooldown', async () => {
  let attempts = 0
  const timers = []
  const errors = []
  const msg = messenger()
  msg.yell = async options => {
    attempts++
    msg.sent.push({ method: 'yell', options })
    if (attempts === 1) {
      throw Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
        code: 'PRIVATE_MESSENGER_PAUSED',
        pauseReasons: ['capacity']
      })
    }
    return { delivery: { reports: [{ success: true }] } }
  }
  const controller = createNostrDbSyncController({
    onError: error => errors.push(error),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    getDb: () => ({ subscribe: emptySubscription })
  })
  controller.ensureSubscriptions(context(msg))
  await controller.queuePush(OWNER, pushEvent(1))
  assert.equal(timers.length, 1)
  await timers.shift().fn()
  assert.equal(attempts, 1)
  assert.equal(timers.length, 0)
  assert.deepEqual(errors, [])

  await controller.resumeAfterPause(context(msg))
  assert.equal(attempts, 2)
  assert.equal(timers.length, 0)
  assert.match(msg.sent[0].options.idempotencyKey, /^[0-9a-f]{64}$/)
  assert.equal(msg.sent[1].options.idempotencyKey, msg.sent[0].options.idempotencyKey)
})

test('paused push queues retain events without polling and flush once after resume', async () => {
  let paused = true
  let attempts = 0
  const timers = []
  const errors = []
  const msg = messenger()
  msg.readStatus = () => ({ closed: false, paused, pauseReasons: paused ? ['capacity'] : [] })
  msg.yell = async () => {
    attempts++
    return { delivery: { reports: [{ success: true }] } }
  }
  const controller = createNostrDbSyncController({
    onError: error => errors.push(error),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    getDb: () => ({ subscribe: emptySubscription })
  })
  controller.ensureSubscriptions(context(msg))
  await controller.queuePush(OWNER, pushEvent(1))
  await controller.queuePush(OWNER, pushEvent(2))
  await flushMicrotasks()

  assert.equal(attempts, 0)
  assert.equal(timers.length, 0)
  assert.deepEqual(errors, [])

  paused = false
  await controller.resumeAfterPause(context(msg))
  await flushMicrotasks()
  assert.equal(attempts, 1)
  assert.equal(timers.length, 0)
  assert.deepEqual(errors, [])
})

test('paused push preserves a relay retry deadline across resume', async () => {
  let now = 1000
  const retryAt = now + 60000
  let attempts = 0
  const timers = []
  const errors = []
  const msg = messenger()
  msg.yell = async () => {
    attempts++
    throw Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
      code: 'PRIVATE_MESSENGER_PAUSED',
      pauseReasons: ['capacity'],
      retryAt
    })
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    onError: error => errors.push(error),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    getDb: () => ({ subscribe: emptySubscription })
  })
  controller.ensureSubscriptions(context(msg))
  await controller.queuePush(OWNER, pushEvent(1))
  assert.equal(timers.length, 1)
  await timers.shift().fn()

  assert.equal(attempts, 1)
  assert.deepEqual(errors, [])
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, retryAt - now)

  await controller.resumeAfterPause(context(msg))
  assert.equal(attempts, 1)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, retryAt - now)

  now = retryAt
  const timer = timers.shift()
  await timer.fn()
  assert.equal(attempts, 2)
})

test('nostrdb app backfill ask exports one app page', async () => {
  const msg = messenger()
  const events = [event(1), event(2)]
  let seenAppId
  let seenOptions
  const controller = createNostrDbSyncController({
    getDb: () => ({
      async exportEventsByAppPage (appId, options) {
        seenAppId = appId
        seenOptions = options
        return { events, nextAfter: events[1].id, hasMore: true }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_APP_ASK_CODE,
    payload: {
      requestId: 'app-req-1',
      appId: 'app-1',
      after: EVENT_ID,
      batchSize: 2
    }
  }), context(msg))

  assert.equal(seenAppId, 'app-1')
  assert.deepEqual(seenOptions, { after: EVENT_ID, batchSize: 2 })
  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].method, 'reply')
  assert.equal(msg.sent[0].options.code, NOSTRDB_SYNC_APP_REPLY_CODE)
  assert.match(msg.sent[0].options.idempotencyKey, /^[0-9a-f]{64}:0$/)
  assert.equal(msg.sent[0].options.payload.requestId, 'app-req-1')
  assert.equal(msg.sent[0].options.payload.appId, 'app-1')
  assert.equal(msg.sent[0].options.payload.after, EVENT_ID)
  assert.equal(msg.sent[0].options.payload.nextAfter, events[1].id)
  assert.equal(msg.sent[0].options.payload.hasMore, true)
  assert.deepEqual(
    msg.sent[0].options.payload.jsonl.trim().split('\n').map(line => JSON.parse(line).id),
    [eventId(1), eventId(2)]
  )
})

test('nostrdb app backfill reply imports for app and pages when hasMore', async () => {
  const msg = messenger()
  const imported = event(10)
  const addCalls = []
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async addEventsForApp (appId, events) {
        addCalls.push({ appId, events })
        return { added: events.length, skipped: 0 }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))
  controller.requestAppBackfill({ ownerPubkey: OWNER, appId: 'app-1' }, context(msg))
  await waitForCondition(() => msg.sent.length === 1)
  const firstAsk = msg.sent[0].options.payload

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_APP_REPLY_CODE,
    payload: {
      requestId: firstAsk.requestId,
      appId: 'app-1',
      after: firstAsk.after,
      nextAfter: imported.id,
      hasMore: true,
      index: 0,
      isLast: true,
      jsonl: `${JSON.stringify(imported)}\n`
    }
  }), context(msg))

  assert.equal(addCalls.length, 1)
  assert.equal(addCalls[0].appId, 'app-1')
  assert.deepEqual(addCalls[0].events.map(event => event.id), [imported.id])
  assert.equal(msg.sent.length, 2)
  assert.equal(msg.sent[1].options.code, NOSTRDB_SYNC_APP_ASK_CODE)
  assert.equal(msg.sent[1].options.payload.after, imported.id)
})

test('nostrdb app backfill ignores unsolicited replies without creating state', async () => {
  const msg = messenger()
  const addCalls = []
  const controller = createNostrDbSyncController({
    getDb: () => ({
      async addEventsForApp (appId, events) {
        addCalls.push({ appId, events })
        return { added: events.length, skipped: 0 }
      }
    })
  })

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_APP_REPLY_CODE,
    payload: {
      requestId: 'unknown',
      appId: 'app-1',
      index: 0,
      isLast: true,
      jsonl: `${JSON.stringify(event(1))}\n`
    }
  }), context(msg))

  assert.deepEqual(addCalls, [])
  assert.equal(controller._getState().appBackfills, undefined)
})

test('nostrdb sync re-asks same start when final reply hasMore is true', async () => {
  const msg = messenger()
  const added = []
  const imported = event(10)
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query (filter) {
        if (filter.ids_only) return { results: added.map(event => event.id), meta: { scores: [] } }
        return { results: [], meta: { scores: [] } }
      },
      async add (addedEvent) {
        added.push(addedEvent)
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000000 }
  }), context(msg))
  const firstAsk = msg.sent.find(item => item.options.payload.priority === 'lower').options.payload

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstAsk.requestId,
      sinceScore: firstAsk.sinceScore,
      untilScore: firstAsk.untilScore,
      hasMore: true,
      index: 0,
      isLast: true,
      jsonl: `${JSON.stringify(imported)}\n`
    }
  }), context(msg))

  const secondAsk = msg.sent
    .map(item => item.options.payload)
    .find(payload => payload.requestId !== firstAsk.requestId &&
      payload.sinceScore === firstAsk.sinceScore &&
      payload.untilScore === firstAsk.sinceScore + 450000 - 1)
  assert.ok(secondAsk)
  assert.equal(secondAsk.sinceScore, firstAsk.sinceScore)
  assert.equal(secondAsk.untilScore, firstAsk.sinceScore + 450000 - 1)
  assert.deepEqual(secondAsk.excludeIds, [imported.id])
  assert.equal(controller._getState().owners[OWNER][PEER].pending.attempt, 0)
})

test('recent recovery walks backward independently of the historical lane', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  const syncContext = context(msg)
  controller.ensureSubscriptions(syncContext)
  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000000, maxScore: 10000000 }
  }), syncContext)

  const firstRecent = controller._getState().owners[OWNER][PEER].recent.pending
  assert.equal(firstRecent.untilScore, 10000000)
  assert.ok(firstRecent.sinceScore < 10000000)
  assert.ok(msg.sent.some(item => item.options.payload.requestId === firstRecent.requestId))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstRecent.requestId,
      sinceScore: firstRecent.sinceScore,
      untilScore: firstRecent.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), syncContext)

  const secondRecent = controller._getState().owners[OWNER][PEER].recent.pending
  assert.ok(secondRecent)
  assert.equal(secondRecent.untilScore, firstRecent.sinceScore - 1)
  assert.equal(
    controller._getState().owners[OWNER][PEER].recent.descentScore,
    firstRecent.sinceScore - 1
  )
  assert.ok(secondRecent.requestId !== firstRecent.requestId)
  assert.ok(msg.sent.some(item => item.options.payload.requestId === secondRecent.requestId))
})

test('recent growth from a one-second window also uses the one-minute floor', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 1000,
          windowMs: 1000,
          recent: {
            targetScore: 1000000,
            windowMs: 1000
          }
        }
      }
    }
  }))
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 1000000 }
  }), context(msg))
  const firstRecent = controller._getState().owners[OWNER][PEER].recent.pending
  assert.equal(firstRecent.untilScore - firstRecent.sinceScore + 1, 1000)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstRecent.requestId,
      sinceScore: firstRecent.sinceScore,
      untilScore: firstRecent.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))

  const state = controller._getState().owners[OWNER][PEER]
  assert.equal(state.recent.windowMs, 4 * 60 * 1000)
  assert.equal(state.recent.descentScore, firstRecent.sinceScore - 1)
  assert.equal(
    state.recent.pending.sinceScore,
    state.recent.descentScore - state.recent.windowMs + 1
  )
})

test('recent lets an in-flight descent finish before covering a newer advert gap', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))
  const recentAsks = () => msg.sent
    .filter(item => item.method === 'ask' && item.options.payload.priority === undefined)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000 }
  }), context(msg))
  const firstPending = controller._getState().owners[OWNER][PEER].recent.pending
  assert.equal(firstPending.phase, 'descent')
  assert.equal(firstPending.untilScore, 10000)
  assert.equal(recentAsks().length, 1)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 901, minScore: 1000, maxScore: 20000 }
  }), context(msg))
  let recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(recent.pending.requestId, firstPending.requestId)
  assert.equal(recent.pending.phase, 'descent')
  assert.equal(recent.gapCeiling, 20000)
  assert.equal(recentAsks().length, 1)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstPending.requestId,
      sinceScore: firstPending.sinceScore,
      untilScore: firstPending.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))

  recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(recent.descentScore, firstPending.sinceScore - 1)
  assert.equal(recent.pending.phase, 'gap-head')
  assert.equal(recent.pending.untilScore, 20000)
  assert.equal(recent.pending.sinceScore, recent.coveredCeiling + 1)
  assert.equal(recent.gapCeiling, 20000)
  assert.equal(recentAsks().length, 2)
})

test('recent fills a gap with a fresh head and then connects it from the base upward', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 1000,
          recent: {
            descentScore: 90000,
            coveredCeiling: 100000,
            gapCeiling: 120000,
            headCoverage: null,
            windowMs: 10000
          },
          updatedAt: 1000
        }
      }
    }
  }))
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 120000 }
  }), context(msg))
  let recent = controller._getState().owners[OWNER][PEER].recent
  const headAsk = recent.pending
  assert.equal(headAsk.phase, 'gap-head')
  assert.equal(headAsk.sinceScore, 110001)
  assert.equal(headAsk.untilScore, 120000)
  assert.equal(recent.descentScore, 90000)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: headAsk.requestId,
      sinceScore: headAsk.sinceScore,
      untilScore: headAsk.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))
  recent = controller._getState().owners[OWNER][PEER].recent
  const fillAsk = recent.pending
  assert.deepEqual(recent.headCoverage, { floor: 110001, ceiling: 120000 })
  assert.equal(fillAsk.phase, 'gap-fill')
  assert.equal(fillAsk.sinceScore, 100001)
  assert.equal(fillAsk.untilScore, 110000)
  assert.equal(recent.descentScore, 90000)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: fillAsk.requestId,
      sinceScore: fillAsk.sinceScore,
      untilScore: fillAsk.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))
  recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(recent.coveredCeiling, 120000)
  assert.equal(recent.headCoverage, null)
  assert.equal(recent.gapCeiling, null)
  assert.equal(recent.descentScore, 90000)
  assert.equal(recent.pending.phase, 'descent')
  assert.equal(recent.pending.untilScore, 90000)
})

test('newer adverts during a gap update only the ceiling and never replace the pending ask', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 1000,
          recent: {
            descentScore: 90000,
            coveredCeiling: 100000,
            gapCeiling: 120000,
            headCoverage: null,
            windowMs: 10000
          },
          updatedAt: 1000
        }
      }
    }
  }))
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 120000 }
  }), context(msg))
  const firstPending = controller._getState().owners[OWNER][PEER].recent.pending
  assert.equal(firstPending.phase, 'gap-head')

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 901, minScore: 1000, maxScore: 140000 }
  }), context(msg))
  let recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(recent.pending.requestId, firstPending.requestId)
  assert.equal(recent.pending.phase, 'gap-head')
  assert.equal(recent.gapCeiling, 140000)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstPending.requestId,
      sinceScore: firstPending.sinceScore,
      untilScore: firstPending.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))
  recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(recent.headCoverage.floor, 110001)
  assert.equal(recent.headCoverage.ceiling, 120000)
  assert.equal(recent.gapCeiling, 140000)
  assert.equal(recent.pending.phase, 'gap-head')
  assert.equal(recent.pending.sinceScore, 120001)
  assert.equal(recent.pending.untilScore, 140000)
  assert.equal(recent.descentScore, 90000)
})

test('gap-fill pending also absorbs newer advert ceilings without cancellation', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 1000,
          recent: {
            descentScore: 90000,
            coveredCeiling: 100000,
            gapCeiling: 120000,
            headCoverage: { floor: 110001, ceiling: 120000 },
            windowMs: 10000
          },
          updatedAt: 1000
        }
      }
    }
  }))
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 120000 }
  }), context(msg))
  const firstPending = controller._getState().owners[OWNER][PEER].recent.pending
  assert.equal(firstPending.phase, 'gap-fill')

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 901, minScore: 1000, maxScore: 150000 }
  }), context(msg))
  let recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(recent.pending.requestId, firstPending.requestId)
  assert.equal(recent.pending.phase, 'gap-fill')
  assert.equal(recent.gapCeiling, 150000)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstPending.requestId,
      sinceScore: firstPending.sinceScore,
      untilScore: firstPending.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))
  recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(recent.coveredCeiling, 120000)
  assert.equal(recent.gapCeiling, 150000)
  assert.equal(recent.headCoverage, null)
  assert.equal(recent.pending.phase, 'gap-head')
  assert.equal(recent.pending.untilScore, 150000)
})

test('a large freshness extension keeps only the newest head region', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 1000,
          recent: {
            descentScore: 90000,
            coveredCeiling: 100000,
            gapCeiling: 140000,
            headCoverage: { floor: 110001, ceiling: 120000 },
            windowMs: 1000
          },
          updatedAt: 1000
        }
      }
    }
  }))
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 140000 }
  }), context(msg))
  const headAsk = controller._getState().owners[OWNER][PEER].recent.pending
  assert.equal(headAsk.phase, 'gap-head')
  assert.equal(headAsk.sinceScore, 139001)
  assert.equal(headAsk.untilScore, 140000)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: headAsk.requestId,
      sinceScore: headAsk.sinceScore,
      untilScore: headAsk.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))
  const recent = controller._getState().owners[OWNER][PEER].recent
  assert.deepEqual(recent.headCoverage, { floor: 139001, ceiling: 140000 })
  assert.equal(recent.pending.phase, 'gap-fill')
  assert.equal(recent.pending.sinceScore, 100001)
  assert.ok(recent.pending.untilScore < 139001)
  assert.equal(recent.descentScore, 90000)
})

test('history completion removes recent gap and head work already proven complete', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 120000,
          recent: {
            descentScore: 90000,
            coveredCeiling: 100000,
            gapCeiling: 120000,
            headCoverage: { floor: 110001, ceiling: 120000 },
            windowMs: 10000
          },
          updatedAt: 1000
        }
      }
    }
  }))
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 120000 }
  }), context(msg))

  const recent = controller._getState().owners[OWNER][PEER].recent
  assert.equal(recent.coveredCeiling, 120000)
  assert.equal(recent.gapCeiling, null)
  assert.equal(recent.headCoverage, null)
  assert.equal(recent.descentScore, 120000)
  assert.equal(recent.pending, null)
})

test('nostrdb sync advances and continues history when final reply is complete', async () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { scores: [] } }
      },
      async add () {
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000000 }
  }), context(msg))
  const firstAsk = msg.sent.find(item => item.options.payload.priority === 'lower').options.payload

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstAsk.requestId,
      sinceScore: firstAsk.sinceScore,
      untilScore: firstAsk.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))

  const historyAsks = msg.sent
    .map(item => item.options.payload)
    .filter(payload => payload.priority === 'lower')
  assert.equal(historyAsks.length, 2)
  const nextAsk = historyAsks.find(payload => payload.requestId !== firstAsk.requestId)
  assert.ok(nextAsk)
  const owner = controller._getState().owners[OWNER][PEER]
  assert.equal(owner.pending.requestId, nextAsk.requestId)
  assert.equal(owner.completedScore, firstAsk.untilScore)
  assert.equal(nextAsk.sinceScore, firstAsk.untilScore + 1)
})

for (const testCase of [
  { replyCount: 0, expectedWindowMs: 4 * 60 * 1000 },
  { replyCount: 1, expectedWindowMs: 2 * 60 * 1000 },
  { replyCount: 20, expectedWindowMs: 1000 },
  { replyCount: 200, expectedWindowMs: 1000 }
]) {
  test(`history growth from a one-second window uses the one-minute floor for ${testCase.replyCount} events`, async () => {
    globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
      owners: {
        [OWNER]: {
          [PEER]: {
            completedScore: 1000,
            windowMs: 1000,
            updatedAt: 1000
          }
        }
      }
    }))
    const msg = messenger()
    const controller = createNostrDbSyncController({
      _nowMs: () => 1000,
      _random: () => 0.5,
      getLaneMode: () => 'history',
      _setTimeout: () => ({}),
      getDb: () => ({
        subscribe: emptySubscription,
        async query () {
          return { results: [], meta: { scores: [] } }
        },
        async add () {
          return { ok: true, stored: true }
        }
      })
    })
    controller.ensureSubscriptions(context(msg))

    await controller.handleMessage(syncMessage({
      code: NOSTRDB_SYNC_ADVERTISE_CODE,
      payload: { generatedAt: 900, minScore: 1000, maxScore: 1000000 }
    }), context(msg))
    const firstAsk = msg.sent.find(item => item.options.payload.priority === 'lower').options.payload
    assert.equal(firstAsk.untilScore - firstAsk.sinceScore + 1, 1000)
    const events = Array.from({ length: testCase.replyCount }, (_, index) => event(index + 1))

    await controller.handleMessage(syncMessage({
      code: NOSTRDB_SYNC_REPLY_CODE,
      payload: {
        requestId: firstAsk.requestId,
        sinceScore: firstAsk.sinceScore,
        untilScore: firstAsk.untilScore,
        hasMore: false,
        index: 0,
        isLast: true,
        jsonl: events.map(item => JSON.stringify(item)).join('\n') + (events.length ? '\n' : '')
      }
    }), context(msg))

    const nextAsk = msg.sent
      .map(item => item.options.payload)
      .find(payload => payload.priority === 'lower' &&
        payload.requestId !== firstAsk.requestId)
    assert.ok(nextAsk)
    assert.equal(nextAsk.sinceScore, firstAsk.untilScore + 1)
    assert.equal(nextAsk.untilScore, nextAsk.sinceScore + testCase.expectedWindowMs - 1)
    assert.equal(controller._getState().owners[OWNER][PEER].windowMs, testCase.expectedWindowMs)
    assert.equal(controller._getState().owners[OWNER][PEER].historyCycleReplyIds, undefined)
  })
}

test('dense minimum ranges are marked covered and advanced in bounded batches', async () => {
  globalThis.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
    owners: {
      [OWNER]: {
        [PEER]: {
          completedScore: 1000,
          windowMs: 1000,
          updatedAt: 1000
        }
      }
    }
  }))
  const timers = []
  const diagnostics = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    getLaneMode: () => 'history',
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    },
    getDb: () => ({
      subscribe: emptySubscription,
      async query (filter) {
        if (!filter.ids_only) return { results: [], meta: { scores: [] } }
        return {
          results: Array.from({ length: filter.limit }, (_, index) => eventId(100000 + index)),
          meta: { scores: [] }
        }
      }
    })
  })
  controller.ensureSubscriptions(context(msg, {
    debug: entry => diagnostics.push(entry)
  }))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 1000000 }
  }), context(msg, {
    debug: entry => diagnostics.push(entry)
  }))

  const state = controller._getState().owners[OWNER][PEER]
  assert.equal(state.completedScore, 33000)
  assert.equal(state.pending, null)
  const dense = diagnostics.find(entry =>
    entry.action === 'dense-range' && entry.lane === 'history'
  )
  assert.deepEqual({
    rangeStart: dense?.rangeStart,
    rangeEnd: dense?.rangeEnd,
    rangeCount: dense?.rangeCount,
    inventoryLimit: dense?.inventoryLimit
  }, {
    rangeStart: 1001,
    rangeEnd: 33000,
    rangeCount: 32,
    inventoryLimit: 1024
  })
  assert.ok(timers.some(timer => timer.ms === 0))
  controller.stop()
})

test('nostrdb sync treats missing hasMore full pages as incomplete', async () => {
  const msg = messenger()
  const added = []
  const events = Array.from({ length: 200 }, (_, index) => event(index + 1))
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query (filter) {
        if (filter.ids_only) return { results: added.map(event => event.id), meta: { scores: [] } }
        return { results: [], meta: { scores: [] } }
      },
      async add (addedEvent) {
        added.push(addedEvent)
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000000 }
  }), context(msg))
  const firstAsk = msg.sent.find(item => item.options.payload.priority === 'lower').options.payload

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstAsk.requestId,
      sinceScore: firstAsk.sinceScore,
      untilScore: firstAsk.untilScore,
      index: 0,
      isLast: true,
      jsonl: events.map(event => JSON.stringify(event)).join('\n') + '\n'
    }
  }), context(msg))

  const nextAsk = msg.sent
    .map(item => item.options.payload)
    .find(payload => payload.requestId !== firstAsk.requestId &&
      payload.sinceScore === firstAsk.sinceScore &&
      payload.untilScore === firstAsk.sinceScore + Math.floor(
        (firstAsk.untilScore - firstAsk.sinceScore + 1) / 2
      ) - 1)
  assert.ok(nextAsk)
  assert.equal(nextAsk.sinceScore, firstAsk.sinceScore)
  assert.equal(nextAsk.untilScore, firstAsk.sinceScore + Math.floor(
    (firstAsk.untilScore - firstAsk.sinceScore + 1) / 2
  ) - 1)
  assert.equal(nextAsk.excludeIds.length, 200)
})

test('history accumulates reply ids across every hasMore cycle and clears them on completion', async () => {
  const added = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query (filter) {
        if (!filter.ids_only) return { results: [], meta: { scores: [] } }
        return {
          results: added.slice(0, filter.limit).map(item => item.id),
          meta: { scores: [] }
        }
      },
      async add (addedEvent) {
        added.push(addedEvent)
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000000 }
  }), context(msg))
  const historyAsks = () => msg.sent
    .map(item => item.options.payload)
    .filter(payload => payload.priority === 'lower')
  const firstAsk = historyAsks()[0]
  const firstEvents = Array.from({ length: 200 }, (_, index) => event(index + 1))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstAsk.requestId,
      sinceScore: firstAsk.sinceScore,
      untilScore: firstAsk.untilScore,
      hasMore: true,
      index: 0,
      isLast: true,
      jsonl: firstEvents.map(item => JSON.stringify(item)).join('\n') + '\n'
    }
  }), context(msg))
  const secondAsk = historyAsks().find(payload => payload.requestId !== firstAsk.requestId)
  assert.ok(secondAsk)
  assert.equal(secondAsk.excludeIds.length, 200)
  assert.equal(controller._getState().owners[OWNER][PEER].historyCycleReplyIds.length, 200)
  const secondEvents = Array.from({ length: 200 }, (_, index) => event(index + 201))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: secondAsk.requestId,
      sinceScore: secondAsk.sinceScore,
      untilScore: secondAsk.untilScore,
      hasMore: true,
      index: 0,
      isLast: true,
      jsonl: secondEvents.map(item => JSON.stringify(item)).join('\n') + '\n'
    }
  }), context(msg))
  const thirdAsk = historyAsks().find(payload =>
    payload.requestId !== firstAsk.requestId &&
    payload.requestId !== secondAsk.requestId
  )
  assert.ok(thirdAsk)
  assert.equal(thirdAsk.excludeIds.length, 400)
  assert.equal(controller._getState().owners[OWNER][PEER].historyCycleReplyIds.length, 400)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: thirdAsk.requestId,
      sinceScore: thirdAsk.sinceScore,
      untilScore: thirdAsk.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))
  const state = controller._getState().owners[OWNER][PEER]
  assert.equal(state.historyCycleReplyIds, undefined)
  assert.equal(state.completedScore, thirdAsk.untilScore)
  assert.equal(historyAsks().length, 4)
  assert.notEqual(historyAsks().at(-1).requestId, thirdAsk.requestId)
})

test('recent accumulates reply ids across every hasMore cycle and clears them on completion', async () => {
  const added = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    _random: () => 0.5,
    _setTimeout: () => ({}),
    getDb: () => ({
      subscribe: emptySubscription,
      async query (filter) {
        if (!filter.ids_only) return { results: [], meta: { scores: [] } }
        return {
          results: added.slice(0, filter.limit).map(item => item.id),
          meta: { scores: [] }
        }
      },
      async add (addedEvent) {
        added.push(addedEvent)
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 10000000 }
  }), context(msg))
  const recentAsks = () => msg.sent
    .map(item => item.options.payload)
    .filter(payload => payload.priority === undefined)
  const firstAsk = controller._getState().owners[OWNER][PEER].recent.pending
  const firstEvents = Array.from({ length: 200 }, (_, index) => event(index + 1))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: firstAsk.requestId,
      sinceScore: firstAsk.sinceScore,
      untilScore: firstAsk.untilScore,
      hasMore: true,
      index: 0,
      isLast: true,
      jsonl: firstEvents.map(item => JSON.stringify(item)).join('\n') + '\n'
    }
  }), context(msg))
  const secondAsk = controller._getState().owners[OWNER][PEER].recent.pending
  assert.ok(secondAsk)
  assert.equal(secondAsk.requestId, recentAsks().at(-1).requestId)
  assert.equal(secondAsk.excludeIds.length, 200)
  assert.equal(controller._getState().owners[OWNER][PEER].recent.cycleReplyIds.length, 200)
  const secondEvents = Array.from({ length: 200 }, (_, index) => event(index + 201))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: secondAsk.requestId,
      sinceScore: secondAsk.sinceScore,
      untilScore: secondAsk.untilScore,
      hasMore: true,
      index: 0,
      isLast: true,
      jsonl: secondEvents.map(item => JSON.stringify(item)).join('\n') + '\n'
    }
  }), context(msg))
  const thirdAsk = controller._getState().owners[OWNER][PEER].recent.pending
  assert.ok(thirdAsk)
  assert.equal(thirdAsk.excludeIds.length, 400)
  assert.equal(controller._getState().owners[OWNER][PEER].recent.cycleReplyIds.length, 400)

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_REPLY_CODE,
    payload: {
      requestId: thirdAsk.requestId,
      sinceScore: thirdAsk.sinceScore,
      untilScore: thirdAsk.untilScore,
      hasMore: false,
      index: 0,
      isLast: true,
      jsonl: ''
    }
  }), context(msg))
  const state = controller._getState().owners[OWNER][PEER]
  assert.equal(state.recent.cycleReplyIds, undefined)
  assert.equal(state.recent.descentScore, thirdAsk.sinceScore - 1)
  assert.equal(state.recent.pending.requestId, recentAsks().at(-1).requestId)
  assert.notEqual(state.recent.pending.requestId, thirdAsk.requestId)
})

test('nostrdb sync ingests with mergeSource sync and suppresses echo pushes', async () => {
  const msg = messenger()
  const event = { id: EVENT_ID, pubkey: PEER, kind: 1, created_at: 1, tags: [], content: '', sig: 'd'.repeat(128) }
  const adds = []
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    getDb: () => ({
      subscribe: emptySubscription,
      async add (addedEvent, options) {
        adds.push({ addedEvent, options })
        return { ok: true, stored: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_PUSH_CODE,
    payload: {
      index: 0,
      isLast: true,
      jsonl: `${JSON.stringify(event)}\n`
    }
  }), context(msg))
  controller.queuePush(OWNER, event)

  assert.equal(adds.length, 1)
  assert.equal(adds[0].addedEvent.id, EVENT_ID)
  assert.equal(adds[0].options.mergeSource, 'sync')
  assert.deepEqual(msg.sent, [])
})

test('push ingestion checkpoints every eight events and resumes from stored progress', async () => {
  const events = Array.from({ length: 10 }, (_, index) => event(index + 1))
  const added = []
  const checkpoints = []
  const msg = messenger()
  let now = 1000
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    getDb: () => ({
      subscribe: emptySubscription,
      async add (event) {
        added.push(event.id)
        now++
        return { ok: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))
  const message = syncMessage({
    id: 'push-message',
    code: NOSTRDB_SYNC_PUSH_CODE,
    payload: {
      index: 2,
      isLast: true,
      jsonl: events.map(value => JSON.stringify(value)).join('\n') + '\n'
    }
  })

  await controller.handleMessage(message, context(msg, {
    checkpoint: async value => {
      checkpoints.push(value)
      return true
    }
  }))
  assert.deepEqual(checkpoints, [
    { version: 1, messageEventId: 'push-message', payloadIndex: 2, processedEvents: 8 },
    { version: 1, messageEventId: 'push-message', payloadIndex: 2, processedEvents: 10 }
  ])
  assert.deepEqual(added, events.map(value => value.id))

  added.length = 0
  checkpoints.length = 0
  await controller.handleMessage(message, context(msg, {
    progress: {
      version: 1,
      messageEventId: 'push-message',
      payloadIndex: 2,
      processedEvents: 8
    },
    checkpoint: async value => {
      checkpoints.push(value)
      return true
    }
  }))
  assert.deepEqual(added, events.slice(8).map(value => value.id))
  assert.deepEqual(checkpoints, [
    { version: 1, messageEventId: 'push-message', payloadIndex: 2, processedEvents: 10 }
  ])

  added.length = 0
  checkpoints.length = 0
  await controller.handleMessage(message, context(msg, {
    progress: {
      version: 1,
      messageEventId: 'different-message',
      payloadIndex: 2,
      processedEvents: 8
    },
    checkpoint: async value => {
      checkpoints.push(value)
      return true
    }
  }))
  assert.deepEqual(added, events.map(value => value.id))
  assert.equal(checkpoints[0].processedEvents, 8)
})

test('push ingestion checkpoints by elapsed time and stops when ownership is lost', async () => {
  const events = Array.from({ length: 3 }, (_, index) => event(index + 1))
  const added = []
  const checkpoints = []
  const msg = messenger()
  let now = 1000
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    getDb: () => ({
      subscribe: emptySubscription,
      async add (event) {
        added.push(event.id)
        now += 6000
        return { ok: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))
  const message = syncMessage({
    id: 'slow-push',
    code: NOSTRDB_SYNC_PUSH_CODE,
    payload: {
      index: 0,
      isLast: true,
      jsonl: events.map(value => JSON.stringify(value)).join('\n') + '\n'
    }
  })

  await assert.rejects(
    controller.handleMessage(message, context(msg, {
      checkpoint: async value => {
        checkpoints.push(value)
        return checkpoints.length === 1
      }
    })),
    error => error.code === 'INBOX_DELIVERY_LOST'
  )
  assert.deepEqual(added, events.map(value => value.id))
  assert.equal(checkpoints[0].processedEvents, 2)
  assert.equal(checkpoints[1].processedEvents, 3)
})

test('push ingestion never checkpoints past a database write failure', async () => {
  const events = Array.from({ length: 9 }, (_, index) => event(index + 1))
  const checkpoints = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    getDb: () => ({
      subscribe: emptySubscription,
      async add (event) {
        if (event.id === events[8].id) throw new Error('WRITE_FAILED')
        return { ok: true }
      }
    })
  })
  controller.ensureSubscriptions(context(msg))

  await assert.rejects(
    controller.handleMessage(syncMessage({
      id: 'failed-push',
      code: NOSTRDB_SYNC_PUSH_CODE,
      payload: {
        index: 0,
        isLast: true,
        jsonl: events.map(value => JSON.stringify(value)).join('\n') + '\n'
      }
    }), context(msg, {
      checkpoint: async value => {
        checkpoints.push(value)
        return true
      }
    })),
    /WRITE_FAILED/
  )
  assert.deepEqual(checkpoints, [
    { version: 1, messageEventId: 'failed-push', payloadIndex: 0, processedEvents: 8 }
  ])
})

test('nostrdb sync batches normal events without mixing priority lanes', async () => {
  const msg = messenger()
  const timers = []
  const diagnostics = []
  const rangeChanges = []
  let performanceTime = 0
  const event1 = pushEvent(1)
  const event2 = pushEvent(2)
  const controller = createNostrDbSyncController({
    getDb: () => ({ subscribe: emptySubscription }),
    _performanceNow: () => performanceTime++,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: () => {}
  })
  controller.ensureSubscriptions(context(msg, {
    debug: event => diagnostics.push(event),
    onRangeChanged: ownerPubkey => rangeChanges.push(ownerPubkey)
  }))

  await controller.queuePush(OWNER, event1)
  await controller.queuePush(OWNER, event2)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 0)
  await timers[0].fn()

  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].options.code, NOSTRDB_SYNC_PUSH_CODE)
  assert.equal(msg.sent[0].options.useBulkPacing, false)
  assert.equal(msg.sent[0].options.payload.priority, undefined)
  assert.equal(
    msg.sent[0].options.payload.jsonl.trim().split('\n').map(line => JSON.parse(line).id).join(','),
    `${event1.id},${event2.id}`
  )
  const chunk = diagnostics.find(entry => entry.action === 'push-chunk')
  assert.equal(chunk.eventCount, 2)
  assert.equal(chunk.priority, 'normal')
  assert.equal(chunk.outcome, 'published')
  assert.ok(chunk.bytes > 0)
  assert.ok(chunk.elapsedMs >= 0)
  assert.ok(diagnostics.filter(entry => entry.action === 'push').every(entry => !Object.hasOwn(entry, 'channelPubkey')))
  assert.ok(diagnostics.every(entry => !Object.hasOwn(entry, 'ownerPubkey')))
  assert.ok(rangeChanges.length > 0)
  assert.ok(rangeChanges.every(ownerPubkey => ownerPubkey === OWNER))
})

test('nostrdb push classifies trusted metadata and separates priority lanes', async () => {
  let now = 1000
  const timers = []
  const rangeChanges = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    getDb: () => ({ subscribe: emptySubscription }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  })
  controller.ensureSubscriptions(context(msg, {
    emptyPersonalCopyContextByOwner: new Map([[OWNER, 'empty-context-ciphertext']]),
    onRangeChanged: ownerPubkey => rangeChanges.push(ownerPubkey)
  }))

  const normal = pushEvent(1)
  const emptyContext = { ...pushEvent(2), tags: [['k', '9'], ['c', 'empty-context-ciphertext']] }
  const mediaChunk = { ...pushEvent(3), tags: [['k', '34601'], ['c', 'dm:' + PEER]] }
  const publicEvent = event(4)
  await controller.queuePush(OWNER, normal)
  await controller.queuePush(OWNER, emptyContext)
  await controller.queuePush(OWNER, mediaChunk)
  await controller.queuePush(OWNER, publicEvent)

  assert.deepEqual(timers.map(timer => timer.ms), [0])
  await timers.shift().fn()
  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].options.payload.priority, undefined)
  assert.equal(msg.sent[0].options.useBulkPacing, false)

  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 200)
  now = 1200
  await timers.shift().fn()

  assert.deepEqual(msg.sent.slice(1).map(({ options }) => options.payload.priority), ['lower', 'lowest'])
  assert.deepEqual(
    msg.sent.slice(1).flatMap(({ options }) =>
      options.payload.jsonl.trim().split('\n').map(line => JSON.parse(line).id)
    ),
    [emptyContext.id, mediaChunk.id, publicEvent.id]
  )
  assert.ok(msg.sent.slice(1).every(({ options }) => options.useBulkPacing))
  assert.deepEqual(rangeChanges, [OWNER])
})

test('lower-priority pushes reset the quiet window and flush at the one-second cap', async () => {
  let now = 1000
  const timers = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    getDb: () => ({ subscribe: emptySubscription }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  })
  controller.ensureSubscriptions(context(msg, {
    emptyPersonalCopyContextByOwner: new Map([[OWNER, 'empty-context-ciphertext']])
  }))
  const lowerEvent = number => ({
    ...pushEvent(number),
    tags: [['k', '9'], ['c', 'empty-context-ciphertext']]
  })

  await controller.queuePush(OWNER, lowerEvent(1))
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 200)

  now = 1100
  await controller.queuePush(OWNER, lowerEvent(2))
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 200)

  for (let elapsed = 1200; elapsed <= 1900; elapsed += 100) {
    now = elapsed
    await controller.queuePush(OWNER, lowerEvent((elapsed - 1000) / 100 + 2))
  }
  assert.equal(timers.length, 1)
  // The timer was armed at t=1800 for the absolute t=2000 deadline. It must
  // not be rescheduled to the later quiet deadline at t=2100.
  assert.equal(timers[0].ms, 200)

  now = 2000
  await timers.shift().fn()
  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].options.payload.priority, 'lower')
  assert.equal(msg.sent[0].options.payload.jsonl.trim().split('\n').length, 10)
})

test('read-state pushes coalesce to the latest stored version per coordinate', async () => {
  let now = 1000
  const timers = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    getDb: () => ({ subscribe: emptySubscription }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  })
  controller.ensureSubscriptions(context(msg, {
    emptyPersonalCopyContextByOwner: new Map([[OWNER, 'empty-context-ciphertext']])
  }))
  const olderA = readStateEvent(1, { coordinate: 'coordinate-a', createdAt: 10 })
  const newerA = readStateEvent(2, { coordinate: 'coordinate-a', createdAt: 20 })
  const newerB = readStateEvent(3, { coordinate: 'coordinate-b', createdAt: 30 })
  const olderB = readStateEvent(4, { coordinate: 'coordinate-b', createdAt: 15 })
  const sameTimeHighId = readStateEvent(6, { coordinate: 'coordinate-c', createdAt: 40 })
  const sameTimeLowId = readStateEvent(5, { coordinate: 'coordinate-c', createdAt: 40 })

  await controller.queuePush(OWNER, olderA, 10)
  await controller.queuePush(OWNER, newerA, 20)
  await controller.queuePush(OWNER, newerB, 30)
  await controller.queuePush(OWNER, olderB, 15)
  await controller.queuePush(OWNER, sameTimeHighId)
  await controller.queuePush(OWNER, sameTimeLowId)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 200)

  now = 1200
  await timers.shift().fn()
  assert.equal(msg.sent.length, 1)
  assert.deepEqual(
    msg.sent[0].options.payload.jsonl.trim().split('\n').map(line => JSON.parse(line).id),
    [newerA.id, newerB.id, sameTimeLowId.id]
  )
})

test('all coordinate personal copies coalesce while unaddressed copies remain distinct', async () => {
  let now = 1000
  const timers = []
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    getDb: () => ({ subscribe: emptySubscription }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  })
  controller.ensureSubscriptions(context(msg, {
    emptyPersonalCopyContextByOwner: new Map([[OWNER, 'empty-context-ciphertext']])
  }))

  const olderProfile = readStateEvent(1, { innerKind: '0', coordinate: 'profile-coordinate', createdAt: 10 })
  const newerProfile = readStateEvent(2, { innerKind: '0', coordinate: 'profile-coordinate', createdAt: 20 })
  const olderSet = readStateEvent(3, { innerKind: '30000', coordinate: 'shared-coordinate', createdAt: 30 })
  const newerSet = readStateEvent(4, { innerKind: '30000', coordinate: 'shared-coordinate', createdAt: 40 })
  const differentKind = readStateEvent(5, { innerKind: '30001', coordinate: 'shared-coordinate', createdAt: 50 })
  const noCoordinate = { ...pushEvent(6), tags: [['k', '1'], ['c', 'empty-context-ciphertext']] }
  const duplicateCoordinate = {
    ...pushEvent(7),
    tags: [
      ['k', '30002'],
      ['c', 'empty-context-ciphertext'],
      ['d', 'duplicate-coordinate'],
      ['d', 'duplicate-coordinate']
    ]
  }
  for (const item of [
    olderProfile,
    newerProfile,
    olderSet,
    newerSet,
    differentKind,
    noCoordinate,
    duplicateCoordinate
  ]) {
    await controller.queuePush(OWNER, item)
  }

  now = 1200
  await timers.shift().fn()
  assert.equal(msg.sent.length, 1)
  assert.deepEqual(
    msg.sent[0].options.payload.jsonl.trim().split('\n').map(line => JSON.parse(line).id),
    [newerProfile.id, newerSet.id, differentKind.id, noCoordinate.id, duplicateCoordinate.id]
  )
  controller.stop()
})

test('durable read-state push outbox keeps one latest record per coordinate', async () => {
  await deleteDatabase(PUSH_EVENT_OUTBOX)
  await deleteDatabase(PUSH_CHUNK_OUTBOX)
  const timers = []
  const controller = createNostrDbSyncController({
    _indexedDB: globalThis.indexedDB,
    _nowMs: () => 1000,
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1, lastScore: 1, scores: [] } }
      }
    }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: () => {}
  })
  controller.ensureSubscriptions(context(messenger(), {
    emptyPersonalCopyContextByOwner: new Map([[OWNER, 'empty-context-ciphertext']])
  }))
  const older = readStateEvent(1, { coordinate: 'durable-coordinate', createdAt: 10 })
  const newer = readStateEvent(2, { coordinate: 'durable-coordinate', createdAt: 20 })
  await controller.queuePush(OWNER, older, 10)
  await controller.queuePush(OWNER, newer, 20)

  const eventOutbox = await createQueue({
    prefix: PUSH_EVENT_OUTBOX.slice(0, -':idb-queue'.length),
    indexedDB: globalThis.indexedDB,
    evictionPolicy: 'reject',
    indexes: PUSH_EVENT_INDEXES
  })
  try {
    assert.equal(await storedCount(eventOutbox), 1)
    const stored = []
    for await (const value of eventOutbox.storedItems()) stored.push(value)
    assert.deepEqual(stored.map(value => value.id), [newer.id])
  } finally {
    controller.stop()
    await eventOutbox.close()
    await deleteDatabase(PUSH_EVENT_OUTBOX)
    await deleteDatabase(PUSH_CHUNK_OUTBOX)
  }
})

test('restoring a legacy read-state outbox removes superseded versions', async () => {
  await deleteDatabase(PUSH_EVENT_OUTBOX)
  await deleteDatabase(PUSH_CHUNK_OUTBOX)
  const older = readStateEvent(1, { coordinate: 'legacy-coordinate', createdAt: 10 })
  const newer = readStateEvent(2, { coordinate: 'legacy-coordinate', createdAt: 20 })
  const seed = await createQueue({
    prefix: PUSH_EVENT_OUTBOX.slice(0, -':idb-queue'.length),
    indexedDB: globalThis.indexedDB,
    evictionPolicy: 'reject',
    indexes: PUSH_EVENT_INDEXES
  })
  await seed.enqueue({ id: older.id, event: older, priority: 'lower', score: 10, addedAt: 10 })
  await seed.enqueue({ id: newer.id, event: newer, priority: 'lower', score: 20, addedAt: 20 })
  await seed.close()

  const controller = createNostrDbSyncController({
    _indexedDB: globalThis.indexedDB,
    _nowMs: () => 1000,
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1, lastScore: 1, scores: [] } }
      }
    }),
    _setTimeout: () => ({}),
    _clearTimeout: () => {}
  })
  controller.ensureSubscriptions(context(messenger()))
  await new Promise(resolve => setTimeout(resolve, 20))

  const compacted = await createQueue({
    prefix: PUSH_EVENT_OUTBOX.slice(0, -':idb-queue'.length),
    indexedDB: globalThis.indexedDB,
    evictionPolicy: 'reject',
    indexes: PUSH_EVENT_INDEXES
  })
  try {
    const stored = []
    for await (const value of compacted.storedItems()) stored.push(value)
    assert.deepEqual(stored.map(value => value.id), [newer.id])
  } finally {
    controller.stop()
    await compacted.close()
    await deleteDatabase(PUSH_EVENT_OUTBOX)
    await deleteDatabase(PUSH_CHUNK_OUTBOX)
  }
})

test('nostrdb zero-output push wakes are counted without an empty push log', async () => {
  let now = 1000
  const performanceReadings = [10, 11, 12, 17]
  const timers = []
  const diagnostics = []
  const msg = messenger()
  msg.yell = async () => {
    throw Object.assign(new Error('relay unavailable'), { category: 'timeout' })
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _performanceNow: () => performanceReadings.shift() ?? 17,
    onError: () => {},
    getDb: () => ({ subscribe: emptySubscription }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  })
  controller.ensureSubscriptions(context(msg, { debug: event => diagnostics.push(event) }))
  await controller.queuePush(OWNER, pushEvent(1))
  const flush = timers.find(timer => timer.ms === 0)
  assert.ok(flush)
  now = 2000
  await flush.fn()

  assert.equal(diagnostics.some(event => event.action === 'push'), false)
  assert.equal(diagnostics.find(event => event.action === 'push-chunk').outcome, 'failed')
  assert.deepEqual(controller.getDebugSnapshot().push, {
    idleWakeCount: 1,
    idleWakeMs: 7,
    lastIdleWakeAt: 2000
  })
  controller.stop()
})

test('durable push outbox survives reload and removes chunks only after publication', async () => {
  await deleteDatabase(PUSH_EVENT_OUTBOX)
  await deleteDatabase(PUSH_CHUNK_OUTBOX)
  const queryFilters = []
  const db = {
    subscribe: emptySubscription,
    async query (filter) {
      queryFilters.push(filter)
      if (filter.search === 'algo:sync sort:desc') {
        return { results: [], meta: { firstScore: 1 } }
      }
      return { results: [], meta: { firstScore: 1, lastScore: 1, scores: [] } }
    }
  }
  const firstTimers = []
  const first = createNostrDbSyncController({
    _indexedDB: globalThis.indexedDB,
    getDb: () => db,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      firstTimers.push(timer)
      return timer
    },
    _clearTimeout: () => {}
  })
  first.ensureSubscriptions(context(messenger()))
  await new Promise(resolve => setImmediate(resolve))
  await first.queuePush(OWNER, pushEvent(1), 2)
  assert.ok(firstTimers.length > 0)
  first.stop()
  await new Promise(resolve => setTimeout(resolve, 20))

  let eventOutbox = await createQueue({
    prefix: PUSH_EVENT_OUTBOX.slice(0, -':idb-queue'.length),
    indexedDB: globalThis.indexedDB,
    evictionPolicy: 'reject',
    indexes: PUSH_EVENT_INDEXES
  })
  assert.equal(await storedCount(eventOutbox), 1)
  await eventOutbox.close()

  const msg = messenger()
  const timers = []
  const second = createNostrDbSyncController({
    _indexedDB: globalThis.indexedDB,
    getDb: () => db,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  })
  second.ensureSubscriptions(context(msg))
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.ok(timers.length > 0)
  assert.equal(timers[0].ms, 0)
  await timers.shift().fn()
  assert.equal(msg.sent.length, 1)
  assert.equal(JSON.parse(msg.sent[0].options.payload.jsonl.trim()).id, pushEvent(1).id)

  eventOutbox = await createQueue({
    prefix: PUSH_EVENT_OUTBOX.slice(0, -':idb-queue'.length),
    indexedDB: globalThis.indexedDB,
    evictionPolicy: 'reject',
    indexes: PUSH_EVENT_INDEXES
  })
  const chunkOutbox = await createQueue({
    prefix: PUSH_CHUNK_OUTBOX.slice(0, -':idb-queue'.length),
    indexedDB: globalThis.indexedDB,
    evictionPolicy: 'reject',
    indexes: { id: { keyPath: 'id', unique: true } }
  })
  assert.equal(await storedCount(eventOutbox), 0)
  assert.equal(await storedCount(chunkOutbox), 0)
  assert.equal(second._getState().pushCursors[OWNER], 2)
  assert.ok(queryFilters.some(filter => filter.since === 2))

  second.stop()
  await Promise.all([eventOutbox.close(), chunkOutbox.close()])
  await new Promise(resolve => setTimeout(resolve, 20))
  await deleteDatabase(PUSH_EVENT_OUTBOX)
  await deleteDatabase(PUSH_CHUNK_OUTBOX)
})

test('NostrDB push cursor serializes through the durable state store without external localStorage', async () => {
  const msg = messenger()
  const controller = createController({
    _indexedDB: null,
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 42, lastScore: 42, scores: [] } }
      }
    }),
    _setTimeout: () => ({}),
    _clearTimeout: () => {}
  })
  controller.ensureSubscriptions(context(msg))
  await new Promise(resolve => setTimeout(resolve, 20))

  const record = readRecords(NOSTRDB_SYNC).find(value => value.key === 'state')
  assert.equal(record.value.pushCursors[OWNER], 42)
  controller.stop()
  await replaceRecords(NOSTRDB_SYNC, [])
})

test('nostrdb live envelopes push only events, excluding control markers and IDs', async () => {
  const msg = messenger()
  const item = pushEvent(100)
  const timers = []
  const controller = createNostrDbSyncController({
    getDb: () => ({
      async * subscribe () {
        yield { type: 'eose' }
        yield { type: 'id', id: item.id, meta: { score: 1 } }
        yield { type: 'event', event: item, meta: { algorithm: 'sync', sort: 'asc', score: 2 } }
      }
    }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: () => {}
  })
  controller.ensureSubscriptions(context(msg))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(timers.length, 1)
  await timers.shift().fn()
  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].options.code, NOSTRDB_SYNC_PUSH_CODE)
  assert.deepEqual(JSON.parse(msg.sent[0].options.payload.jsonl.trim()), item)
  controller.stop()
})

for (const stopped of [false, true]) {
  test(`nostrdb push ${stopped ? 'stops a stale trailing batch without rearming its timer' : 'reports failures from the active messenger'}`, async () => {
    const timers = new Set()
    const errors = []
    const gate = Promise.withResolvers()
    const started = Promise.withResolvers()
    const msg = messenger()
    const controller = createNostrDbSyncController({
      getDb: () => ({ subscribe: emptySubscription }),
      onError: error => errors.push(error),
      _setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.add(timer); return timer },
      _clearTimeout: timer => timers.delete(timer)
    })
    controller.ensureSubscriptions(context(msg))
    await controller.queuePush(OWNER, pushEvent(1))
    // More than one chunk must remain when the first in-flight call settles.
    for (let i = 2; i < 205; i++) await controller.queuePush(OWNER, pushEvent(i))
    let calls = 0
    msg.yell = async () => {
      calls++
      started.resolve()
      await gate.promise
    }
    const timer = [...timers].find(timer => timer.ms === 0)
    timers.delete(timer)
    const flushing = timer.fn()
    await started.promise
    assert.equal(calls, 1)
    if (stopped) controller.stop()
    const error = new DOMException('The database connection is closing.', 'InvalidStateError')
    gate.reject(error)
    await flushing
    if (stopped) {
      assert.equal(calls, 1, 'no next chunk uses the closed messenger')
      assert.deepEqual(errors, [])
      assert.equal(timers.size, 0, 'a completed stale callback cannot restart cooldown')
    } else {
      assert.ok(errors.includes(error), 'active storage errors remain visible')
    }
    controller.stop()
  })
}

for (const app of [false, true]) {
  for (const phase of ['read', 'reply']) {
    test(`nostrdb ${app ? 'app' : 'range'} ${phase} failure reaches drain for nack and permits retry`, async () => {
      const failure = new Error('quota or storage unavailable')
      const msg = messenger()
      let failing = true
      const controller = createNostrDbSyncController({
        getDb: () => ({
          async query () { if (failing && phase === 'read') throw failure; return { results: [event(1)] } },
          async exportEventsByAppPage () { if (failing && phase === 'read') throw failure; return { events: [event(1)], hasMore: false } }
        })
      })
      const reply = msg.reply
      msg.reply = async options => { if (failing && phase === 'reply') throw failure; return reply(options) }
      const message = syncMessage({
        code: app ? NOSTRDB_SYNC_APP_ASK_CODE : NOSTRDB_SYNC_ASK_CODE,
        payload: app ? { requestId: 'req', appId: 'https://app.test', after: '', batchSize: 200 } : { requestId: 'req', sinceScore: 1, untilScore: 2, excludeIds: [], limit: 200 }
      })
      await assert.rejects(controller.handleMessage(message, context(msg)), error => error === failure)
      assert.equal(msg.sent.length, 0)
      failing = false
      assert.equal(await controller.handleMessage(message, context(msg)), true)
      assert.equal(msg.sent.at(-1).options.payload.isLast, true)
    })
  }
}

test('push batches bound UTF-8 bytes, retry failures and never overlap in-flight sends', async () => {
  const timers = []
  const errors = []
  let now = 1000
  const msg = messenger()
  const controller = createNostrDbSyncController({
    getDb: () => ({ subscribe: emptySubscription }),
    onError: error => errors.push(error),
    _nowMs: () => now,
    _setTimeout: fn => { const timer = { fn }; timers.push(timer); return timer },
    _clearTimeout: () => {}
  })
  controller.ensureSubscriptions(context(msg))
  await controller.queuePush(OWNER, pushEvent(1))
  const pending = Array.from({ length: 10 }, (_, i) => ({ ...pushEvent(i + 2), content: 'á'.repeat(20000) }))
  for (const item of pending) await controller.queuePush(OWNER, item)
  const gate = Promise.withResolvers()
  const started = Promise.withResolvers()
  let active = 0
  let maxActive = 0
  const successfulReply = msg.yell
  msg.yell = async () => {
    active++
    maxActive = Math.max(maxActive, active)
    started.resolve()
    try { await gate.promise } finally { active-- }
  }
  const flush = timers.shift().fn()
  await started.promise
  // New input while the earlier send is pending cannot start another send.
  await controller.queuePush(OWNER, pushEvent(100))
  assert.equal(maxActive, 1)
  gate.reject(new Error('rate-limited: busy'))
  await flush
  await flushMicrotasks()
  assert.equal(errors.length, 1)
  msg.yell = successfulReply
  now += 1000
  await timers.shift().fn()
  const replies = msg.sent.map(({ options }) => options.payload)
  for (const reply of replies) assert.ok(Buffer.byteLength(reply.jsonl) <= 128 * 1024)
  const ids = replies.flatMap(reply => reply.jsonl.trim().split('\n').map(row => JSON.parse(row).id))
  assert.deepEqual(new Set(ids), new Set([event(1).id, ...pending.map(item => item.id), event(100).id]))
  assert.equal(ids.length, 12)
  controller.stop()
})

test('one compatible pending push chunk pair is concatenated per flush', async () => {
  const first = storedPushChunk(1, {
    receiverPubkeys: [PEER, PEER2],
    isLast: false
  })
  const second = storedPushChunk(2, {
    receiverPubkeys: [PEER2, PEER],
    isLast: true
  })
  const third = storedPushChunk(3, {
    receiverPubkeys: [PEER, PEER2],
    isLast: true
  })
  const { controller, msg } = await flushSeededPushChunks([first, second, third])
  try {
    assert.equal(msg.sent.length, 2)
    assert.deepEqual(
      msg.sent[0].options.payload.jsonl.trim().split('\n').map(line => JSON.parse(line).id),
      [pushEvent(1).id, pushEvent(2).id]
    )
    assert.equal(msg.sent[0].options.payload.index, first.index)
    assert.equal(msg.sent[0].options.payload.isLast, second.isLast)
    assert.deepEqual(msg.sent[1].options.payload.jsonl.trim().split('\n').map(line => JSON.parse(line).id), [
      pushEvent(3).id
    ])
    assert.match(msg.sent[0].options.idempotencyKey, /^[0-9a-f]{64}$/)
  } finally {
    controller.stop()
    await new Promise(resolve => setImmediate(resolve))
    await deleteDatabase(PUSH_EVENT_OUTBOX)
    await deleteDatabase(PUSH_CHUNK_OUTBOX)
  }
})

for (const testCase of [
  {
    name: 'different receivers',
    records: [
      storedPushChunk(1, { receiverPubkeys: [PEER], isLast: false }),
      storedPushChunk(2, { receiverPubkeys: [PEER2], isLast: true })
    ]
  },
  {
    name: 'different priorities',
    records: [
      storedPushChunk(1, { priority: 'normal', isLast: false }),
      storedPushChunk(2, { priority: 'lower', isLast: true })
    ]
  },
  {
    name: 'different channels',
    records: [
      storedPushChunk(1, { channelPubkey: 'f'.repeat(64), isLast: false }),
      storedPushChunk(2, { channelPubkey: 'd'.repeat(64), isLast: true })
    ]
  },
  {
    name: 'the event-count cap',
    records: [
      {
        ...storedPushChunk(1, { isLast: false }),
        eventIds: Array.from({ length: 51 }, (_, index) => eventId(index + 1)),
        eventCount: 51
      },
      {
        ...storedPushChunk(2, { isLast: true }),
        eventIds: Array.from({ length: 51 }, (_, index) => eventId(index + 101)),
        eventCount: 51
      }
    ]
  },
  {
    name: 'the byte cap',
    records: [
      storedPushChunk(1, { content: 'á'.repeat(40000), isLast: false }),
      storedPushChunk(2, { content: 'á'.repeat(40000), isLast: true })
    ]
  }
]) {
  test(`push chunk coalescing preserves originals for ${testCase.name}`, async () => {
    const { controller, msg } = await flushSeededPushChunks(testCase.records)
    try {
      assert.equal(msg.sent.length, 2)
      assert.ok(msg.sent.every(item => item.options.payload.jsonl.trim().split('\n').length >= 1))
    } finally {
      controller.stop()
      await new Promise(resolve => setImmediate(resolve))
      await deleteDatabase(PUSH_EVENT_OUTBOX)
      await deleteDatabase(PUSH_CHUNK_OUTBOX)
    }
  })
}

test('a failed substitute chunk persistence leaves both originals queued', async () => {
  const first = storedPushChunk(1, { isLast: false })
  const second = storedPushChunk(2, { isLast: true })
  await deleteDatabase(PUSH_EVENT_OUTBOX)
  await seedPushChunks([first, second])
  const channelPubkey = first.channelPubkey
  const timers = []
  const msg = messenger()
  msg.yell = async () => {
    throw new Error('RELAY_UNAVAILABLE')
  }
  let failSubstitute = true
  const controller = createNostrDbSyncController({
    _indexedDB: globalThis.indexedDB,
    getDb: () => ({
      subscribe: emptySubscription,
      async query () {
        return { results: [], meta: { firstScore: 1, lastScore: 1, scores: [] } }
      }
    }),
    _createPushQueue: async options => {
      const queue = await createQueue(options)
      if (!options.prefix.includes('push-chunks')) return queue
      const putBy = queue.putBy.bind(queue)
      queue.putBy = async (...args) => {
        if (failSubstitute && args[1]?.eventIds?.length === 2) {
          failSubstitute = false
          throw new Error('IDB_UNAVAILABLE')
        }
        return putBy(...args)
      }
      return queue
    },
    onError: () => {},
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: timer => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  })
  controller.ensureSubscriptions(context(msg, {
    ownerPubkeyForChannel: channel => channel === channelPubkey ? OWNER : '',
    channelPubkeyForOwner: ownerPubkey => ownerPubkey === OWNER ? channelPubkey : ''
  }))
  await waitForCondition(() => timers.some(timer => timer.ms === 0))
  const flush = timers.find(timer => timer.ms === 0)
  assert.ok(flush)
  await flush.fn()

  try {
    const chunks = await createQueue({
      prefix: PUSH_CHUNK_OUTBOX.slice(0, -':idb-queue'.length),
      indexedDB: globalThis.indexedDB,
      evictionPolicy: 'reject',
      indexes: { id: { keyPath: 'id', unique: true } }
    })
    try {
      const ids = []
      for await (const chunk of chunks.storedItems()) ids.push(chunk.id)
      assert.deepEqual(ids.sort(), [first.id, second.id].sort())
    } finally {
      await chunks.close()
    }
  } finally {
    controller.stop()
    await new Promise(resolve => setImmediate(resolve))
    await deleteDatabase(PUSH_EVENT_OUTBOX)
    await deleteDatabase(PUSH_CHUNK_OUTBOX)
  }
})

test('nostrdb push preserves the relay deadline already capped by the pool', async () => {
  let now = 1000
  const retryAt = now + 5 * 60 * 1000
  let attempts = 0
  const timers = new Set()
  const msg = messenger()
  msg.yell = async options => {
    attempts++
    msg.sent.push({ method: 'yell', options })
    if (attempts === 1) {
      throw Object.assign(new Error('RELAY_CIRCUIT_OPEN'), {
        code: 'RELAY_CIRCUIT_OPEN',
        category: 'timeout',
        retryAt,
        retryWhenAvailable: true
      })
    }
    return { delivery: { reports: [{ success: true }] } }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    onError: () => {},
    getDb: () => ({ subscribe: emptySubscription }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.add(timer)
      return timer
    },
    _clearTimeout: timer => timers.delete(timer)
  })
  controller.ensureSubscriptions(context(msg))
  await controller.queuePush(OWNER, pushEvent(1))
  const initial = [...timers][0]
  timers.delete(initial)
  await initial.fn()

  assert.equal(attempts, 1)
  assert.equal(timers.size, 1)
  assert.equal([...timers][0].ms, 5 * 60 * 1000)

  now = retryAt
  const timer = [...timers][0]
  timers.delete(timer)
  await timer.fn()

  assert.equal(attempts, 2)
  controller.stop()
})
