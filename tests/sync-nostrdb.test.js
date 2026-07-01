import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createNostrDbSyncController,
  NOSTRDB_SYNC_ADVERTISE_CODE,
  NOSTRDB_SYNC_ASK_CODE,
  NOSTRDB_SYNC_REPLY_CODE,
  NOSTRDB_SYNC_PUSH_CODE,
  NOSTRDB_SYNC_APP_ASK_CODE,
  NOSTRDB_SYNC_APP_REPLY_CODE
} from '../docs/services/sync/nostrdb.js'

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
  assert.equal(msg.sent[0].options.channelPubkey, 'channel')
  assert.equal(msg.sent[0].options.receiverPubkey, PEER)
  assert.equal(msg.sent[0].options.payload.sinceScore, 1000)
  assert.equal(msg.sent[0].options.payload.untilScore, 900999)
  assert.deepEqual(msg.sent[0].options.payload.excludeIds, [EVENT_ID])
  assert.equal(msg.sent[0].options.payload.limit, 200)
  assert.equal(Object.hasOwn(msg.sent[0].options.payload, 'ownerPubkey'), false)
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
  await Promise.resolve()
  await Promise.resolve()

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
})

test('nostrdb app backfill drops unlocked requests when no trusted peers exist', () => {
  const msg = messenger()
  const controller = createNostrDbSyncController({
    _nowMs: () => 1000,
    getDb: () => ({ subscribe: emptySubscription })
  })

  assert.equal(controller.requestAppBackfill({
    ownerPubkey: OWNER,
    appId: 'app-1'
  }, context(msg, { trustedByPubkey: new Map() })), false)

  assert.deepEqual(Object.keys(controller._getState().appBackfills || {}), [])
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
  await Promise.resolve()
  await Promise.resolve()

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

test('nostrdb app backfill drops locked intents if unlock finds no trusted peers', async () => {
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

  assert.deepEqual(Object.keys(controller._getState().appBackfills || {}), [])
  assert.deepEqual(msg.sent, [])
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

test('nostrdb sync pushes local events on the leading edge then trailing throttle', async () => {
  const msg = messenger()
  const timers = []
  const event1 = { id: '1'.repeat(64), kind: 1, tags: [], content: '' }
  const event2 = { id: '2'.repeat(64), kind: 1, tags: [], content: '' }
  const controller = createNostrDbSyncController({
    getDb: () => ({ subscribe: emptySubscription }),
    _setTimeout: (fn, ms) => {
      const timer = { fn, ms }
      timers.push(timer)
      return timer
    },
    _clearTimeout: () => {}
  })
  controller.ensureSubscriptions(context(msg))

  controller.queuePush(OWNER, event1)
  await Promise.resolve()
  controller.queuePush(OWNER, event2)
  await Promise.resolve()

  assert.equal(msg.sent.length, 1)
  assert.equal(msg.sent[0].options.code, NOSTRDB_SYNC_PUSH_CODE)
  assert.equal(JSON.parse(msg.sent[0].options.payload.jsonl.trim()).id, event1.id)
  assert.equal(timers[0].ms, 1500)

  await timers[0].fn()
  assert.equal(msg.sent.length, 2)
  assert.equal(JSON.parse(msg.sent[1].options.payload.jsonl.trim()).id, event2.id)
})
