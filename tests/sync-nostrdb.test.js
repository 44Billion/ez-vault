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
const PUSH_EVENT_OUTBOX = `ez-vault:trusted-signer-sync:nostrdb-push:v1:events:${OWNER}:idb-queue`
const PUSH_CHUNK_OUTBOX = `ez-vault:trusted-signer-sync:nostrdb-push-chunks:v1:${OWNER}:idb-queue`

function createNostrDbSyncController (options = {}) {
  return createController({ storage: globalThis.localStorage, _indexedDB: null, ...options })
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

  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].method, 'ask')
  assert.equal(msg.sent[0].options.code, NOSTRDB_SYNC_ASK_CODE)
  assert.equal(msg.sent[0].options.useBulkPacing, true)
  assert.equal(msg.sent[0].options.channelPubkey, 'channel')
  assert.equal(msg.sent[0].options.receiverPubkey, PEER)
  assert.equal(msg.sent[0].options.payload.sinceScore, 1000)
  assert.equal(msg.sent[0].options.payload.untilScore, 900999)
  assert.deepEqual(msg.sent[0].options.payload.excludeIds, [EVENT_ID])
  assert.equal(msg.sent[0].options.payload.limit, 200)
  assert.equal(Object.hasOwn(msg.sent[0].options.payload, 'ownerPubkey'), false)
})

test('range ask retries grow and newer advertisements cannot reset the cooldown', async () => {
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
  assert.equal(msg.sent.length, 1)
  let pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.attempt, 0)
  assert.equal(pending.onlineRetryAt, now + 5 * 60 * 1000)

  now = pending.onlineRetryAt
  await advertise(now)
  assert.equal(msg.sent.length, 2)
  pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.attempt, 1)
  assert.equal(pending.onlineRetryAt, now + 10 * 60 * 1000)

  now += 1
  await advertise(now)
  assert.equal(msg.sent.length, 2)

  now = pending.onlineRetryAt
  await advertise(now)
  assert.equal(msg.sent.length, 3)
  pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.attempt, 2)
  assert.equal(pending.onlineRetryAt, now + 20 * 60 * 1000)

  const stats = controller.getDebugSnapshot().askStats
  assert.equal(stats.emitted[`${NOSTRDB_SYNC_ASK_CODE}:advertise`], 3)
  assert.equal(stats.suppressed[`${NOSTRDB_SYNC_ASK_CODE}:advertise`], 1)
})

test('no-reply range retries also advance the attempt and online backoff', async () => {
  let now = 1000
  const msg = messenger()
  const timers = []
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: () => {},
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
  const timer = timers.find(candidate => candidate.ms === first.nextRetryAt - now)
  assert.ok(timer)

  now = first.nextRetryAt
  await timer.fn()
  await flushMicrotasks()
  assert.equal(msg.sent.length, 2)
  const second = controller._getState().owners[OWNER][PEER].pending
  assert.equal(second.attempt, 1)
  assert.equal(second.onlineRetryAt, now + 10 * 60 * 1000)
  assert.equal(
    controller.getDebugSnapshot().askStats.emitted[`${NOSTRDB_SYNC_ASK_CODE}:no-reply`],
    1
  )
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
    index: 0,
    isLast: true,
    jsonl: ''
  })
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
  const retryAt = now + 5 * 60 * 1000
  const errors = []
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
    return { delivery: { reports: [{ success: true }] } }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => now,
    _random: () => 0.5,
    _setTimeout: () => ({}),
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
  await controller.processAppBackfills(context(msg))
  assert.equal(attempts, 1)

  now = retryAt
  await controller.processAppBackfills(context(msg))
  assert.equal(attempts, 2)
})

test('nostrdb range sync does not retry before a publication circuit deadline', async () => {
  let now = 1000
  const retryAt = now + 5 * 60 * 1000
  let attempts = 0
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
    _setTimeout: () => ({}),
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
  assert.equal(attempts, 1)
  assert.equal(owner.pending.nextRetryAt, retryAt)
  assert.equal(owner.pending.onlineRetryAt, retryAt)

  now = retryAt - 1
  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: now, minScore: now, maxScore: now + 1 }
  }), context(msg))
  assert.equal(attempts, 1)
})

test('paused range asks wait for explicit resume without spending backoff', async () => {
  let attempts = 0
  const timers = []
  const msg = messenger()
  msg.ask = async options => {
    attempts++
    msg.sent.push({ method: 'ask', options })
    if (attempts === 1) {
      throw Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
        code: 'PRIVATE_MESSENGER_PAUSED',
        pauseReasons: ['capacity']
      })
    }
    return { delivery: { reports: [{ success: true }] } }
  }
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
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
  assert.equal(pending.attempt, 0)
  assert.equal(timers.some(timer => timer.ms === 5 * 60 * 1000), false)

  await controller.resumeAfterPause(context(msg))
  assert.equal(attempts, 2)
  assert.equal(controller._getState().owners[OWNER][PEER].pending.waitingForResume, undefined)
  assert.equal(controller._getState().owners[OWNER][PEER].pending.attempt, 1)
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

  assert.equal(second.sent.filter(item => item.options.code === NOSTRDB_SYNC_ASK_CODE).length, 1)
  assert.equal(secondController._getState().owners[OWNER][PEER].pending.waitingForResume, undefined)
})

test('resume does not bypass a relay retry deadline attached to a paused error', async () => {
  let attempts = 0
  const retryAt = 1000 + 10 * 60 * 1000
  const msg = messenger()
  msg.ask = async () => {
    attempts++
    throw Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
      code: 'PRIVATE_MESSENGER_PAUSED',
      retryAt,
      pauseReasons: ['capacity']
    })
  }
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
  controller.ensureSubscriptions(context(msg))
  await controller.handleMessage(syncMessage({
    code: NOSTRDB_SYNC_ADVERTISE_CODE,
    payload: { generatedAt: 900, minScore: 1000, maxScore: 2000 }
  }), context(msg))

  const pending = controller._getState().owners[OWNER][PEER].pending
  assert.equal(pending.waitingForResume, undefined)
  assert.equal(pending.nextRetryAt, retryAt)
  await controller.resumeAfterPause(context(msg))
  assert.equal(attempts, 1)
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
  await Promise.resolve()
  await Promise.resolve()
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
  const firstAsk = msg.sent[0].options.payload

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

  assert.equal(msg.sent.length, 2)
  const secondAsk = msg.sent[1].options.payload
  assert.equal(secondAsk.sinceScore, firstAsk.sinceScore)
  assert.equal(secondAsk.untilScore, firstAsk.sinceScore + 450000 - 1)
  assert.deepEqual(secondAsk.excludeIds, [imported.id])
  assert.equal(controller._getState().owners[OWNER][PEER].pending.attempt, 0)
})

test('nostrdb sync advances only when final reply is complete', async () => {
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
  const firstAsk = msg.sent[0].options.payload

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

  assert.equal(msg.sent.length, 2)
  assert.equal(msg.sent[1].options.payload.sinceScore, firstAsk.untilScore + 1)
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
  const firstAsk = msg.sent[0].options.payload

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

  assert.equal(msg.sent.length, 2)
  assert.equal(msg.sent[1].options.payload.sinceScore, firstAsk.sinceScore)
  assert.equal(msg.sent[1].options.payload.untilScore, firstAsk.sinceScore + 60000 - 1)
  assert.equal(msg.sent[1].options.payload.excludeIds.length, 200)
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

test('nostrdb sync batches normal events without mixing priority lanes', async () => {
  const msg = messenger()
  const timers = []
  const diagnostics = []
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
  controller.ensureSubscriptions(context(msg, { debug: event => diagnostics.push(event) }))

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
})

test('nostrdb push classifies trusted metadata and separates priority lanes', async () => {
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
  assert.equal(firstTimers.length, 1)
  first.stop()
  await new Promise(resolve => setTimeout(resolve, 20))

  let eventOutbox = await createQueue({
    prefix: PUSH_EVENT_OUTBOX.slice(0, -':idb-queue'.length),
    indexedDB: globalThis.indexedDB,
    evictionPolicy: 'reject',
    indexes: { id: { keyPath: 'id', unique: true } }
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
    indexes: { id: { keyPath: 'id', unique: true } }
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
