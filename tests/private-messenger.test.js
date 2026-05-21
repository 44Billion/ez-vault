import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { ASK_KIND, REPLY_KIND, TELL_KIND } from '../docs/helpers/nostr/private-message.js'
import {
  createEventReplyPacker,
  createMissingMessageReplyPacker,
  MISSING_MESSAGES_ASK_CODE,
  MISSING_MESSAGES_REPLY_CODE,
  PrivateMessenger,
  SEEDER_PRESENCE_CODE
} from '../docs/services/private-messenger/index.js'

const data = new Map()
globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  removeItem: key => { data.delete(String(key)) },
  setItem: (key, value) => { data.set(String(key), String(value)) }
}

afterEach(() => {
  globalThis.localStorage.clear()
})

function signer (pubkey) {
  return {
    getPublicKey: () => pubkey,
    withSharedKey: () => ({})
  }
}

function fakePrivateMessage () {
  const watchCalls = []
  const stopped = []
  const sent = []
  const cleared = []
  return {
    watchCalls,
    stopped,
    sent,
    cleared,
    ASK_KIND,
    REPLY_KIND,
    TELL_KIND,
    watch: async options => {
      watchCalls.push(options)
      return () => stopped.push(options.channels[0])
    },
    ask: async options => {
      sent.push({ method: 'ask', options })
      return { question: { id: 'question-id', kind: ASK_KIND, pubkey: 'user' }, results: [] }
    },
    reply: async options => {
      sent.push({ method: 'reply', options })
      return { reply: { id: 'reply-id', kind: REPLY_KIND }, results: [] }
    },
    tell: async options => {
      sent.push({ method: 'tell', options })
      return { tell: { id: 'tell-id', kind: TELL_KIND }, results: [] }
    },
    yell: async options => {
      sent.push({ method: 'yell', options })
      return { yell: { id: 'yell-id', kind: TELL_KIND }, results: [] }
    },
    sendEvent: async options => {
      sent.push({ method: 'sendEvent', options })
      return { event: { id: 'raw-id', kind: 9001 }, results: [] }
    },
    unwatch: channels => stopped.push(channels),
    clearChannelState: channel => cleared.push(channel)
  }
}

test('private messenger watches channels and queues received leecher rumors', async () => {
  const pm = fakePrivateMessage()
  const messenger = await new PrivateMessenger({ _privateMessage: pm }).init({
    userSigner: signer('user'),
    channels: [{ signer: signer('channel'), relays: ['wss://relay.example'] }]
  })

  assert.equal(pm.watchCalls.length, 1)
  assert.deepEqual(pm.watchCalls[0].channels, ['channel'])
  assert.deepEqual(pm.watchCalls[0].relays, ['wss://relay.example'])
  assert.equal(pm.watchCalls[0].mode, 'leecher')

  pm.watchCalls[0].onTell({
    event: { id: 'tell-id', kind: TELL_KIND, pubkey: 'alice', created_at: 10, tags: [['r', 'user']], content: '{"payload":"hi"}' },
    outer: { id: 'outer-id', created_at: 11 },
    meta: { channelPubkey: 'channel' },
    payload: { payload: 'hi' },
    tell: { id: 'tell-id' }
  })

  const item = messenger.nextMessage()
  assert.equal(item.type, 'tell')
  assert.equal(item.channelPubkey, 'channel')
  assert.equal(item.event.id, 'tell-id')
  assert.deepEqual(item.payload, { payload: 'hi' })
  assert.equal(messenger.readState().channels.channel.lastSeenAt, 11)

  pm.watchCalls[0].onReply({
    event: { id: 'reply-id', kind: REPLY_KIND, pubkey: 'alice', created_at: 12, tags: [['q', 'question-id']], content: '{"payload":"pong"}' },
    outer: { id: 'outer-reply-id', created_at: 13 },
    meta: { channelPubkey: 'channel' },
    payload: { payload: 'pong' },
    questionId: 'question-id',
    reply: { id: 'reply-id' }
  })

  const reply = messenger.nextMessage()
  assert.equal(reply.type, 'reply')
  assert.equal(reply.question, null)
  assert.equal(reply.questionId, 'question-id')
  assert.equal(reply.event.id, 'reply-id')

  pm.watchCalls[0].onMessage({
    event: { id: 'raw-id', kind: 9001, pubkey: 'alice', created_at: 14, tags: [], content: 'raw' },
    outer: { id: 'outer-raw-id', created_at: 15 },
    meta: { channelPubkey: 'channel' },
    payload: 'raw'
  })

  const raw = messenger.nextMessage()
  assert.equal(raw.type, 'message')
  assert.equal(raw.event.id, 'raw-id')
  assert.equal(raw.payload, 'raw')
})

test('private messenger delegates send helpers with scoped signers and relays', async () => {
  const pm = fakePrivateMessage()
  const messenger = await new PrivateMessenger({ _privateMessage: pm }).init({
    userSigner: signer('user'),
    contentKeySigner: signer('content'),
    channels: [{ pubkey: 'channel', signer: signer('channel'), relays: ['wss://relay.example'] }]
  })

  await messenger.ask({ receiverPubkey: 'alice', payload: 'ping' })
  await messenger.reply({ question: { id: 'q', pubkey: 'alice' }, payload: 'pong' })
  await messenger.tell({ receiverPubkey: 'alice', payload: 'note' })
  await messenger.yell({ receiverPubkeys: ['alice', 'bob'], payload: 'news' })
  await messenger.sendEvent({ receiverPubkeys: ['alice', 'bob'], event: { kind: 9001, created_at: 1, tags: [], content: 'raw' } })

  assert.deepEqual(pm.sent.map(s => s.method), ['ask', 'reply', 'tell', 'yell', 'sendEvent'])
  for (const sent of pm.sent) {
    assert.equal(sent.options.senderSigner.getPublicKey(), 'user')
    assert.equal(sent.options.imkcSigner.getPublicKey(), 'content')
    assert.equal(sent.options.privateChannelSigner.getPublicKey(), 'channel')
    assert.deepEqual(sent.options.relays, ['wss://relay.example'])
    assert.equal(sent.options.expirationSeconds, 7 * 24 * 60 * 60)
  }
})

test('clearChannel removes queued items and channel state without clearing other channels', async () => {
  const pm = fakePrivateMessage()
  const messenger = await new PrivateMessenger({ _privateMessage: pm }).init({
    userSigner: signer('user'),
    channels: [
      { pubkey: 'one', signer: signer('one'), relays: ['wss://relay.example'] },
      { pubkey: 'two', signer: signer('two'), relays: ['wss://relay.example'] }
    ]
  })
  messenger.queue.enqueue({ type: 'tell', channelPubkey: 'one', event: { id: 'one' } })
  messenger.queue.enqueue({ type: 'tell', channelPubkey: 'two', event: { id: 'two' } })

  messenger.clearChannel('one')

  const item = messenger.nextMessage()
  assert.equal(item.channelPubkey, 'two')
  assert.equal(messenger.nextMessage(), null)
  assert.equal(messenger.channels.has('one'), false)
  assert.equal(messenger.readState().channels.one, undefined)
  assert.ok(messenger.readState().channels.two)
  assert.deepEqual(pm.cleared, ['one'])
})

test('watch schedules reload-gap recovery and fetches missing channel window', async () => {
  const pm = fakePrivateMessage()
  const fetches = []
  let scheduled = null
  const now = Math.floor(Date.now() / 1000)
  globalThis.localStorage.setItem('ez-vault:private-messenger:user:state', JSON.stringify({
    channels: {
      channel: { lastSeenAt: now - 10, lastWatchedAt: now - 10 }
    }
  }))
  const messenger = await new PrivateMessenger({
    _privateMessage: pm,
    _privateChannel: {
      fetch: async options => {
        fetches.push(options)
        options.onEvent({
          id: 'ask-id',
          kind: ASK_KIND,
          pubkey: 'alice',
          created_at: now - 5,
          tags: [['r', 'user']],
          content: '{"payload":"missed"}'
        }, { id: 'outer-id', created_at: now - 5 }, { channelPubkey: 'channel' })
      }
    },
    _setTimeout: fn => { scheduled = fn }
  }).init({
    userSigner: signer('user'),
    channels: [{ pubkey: 'channel', signer: signer('channel'), relays: ['wss://relay.example'] }]
  })

  await scheduled()

  assert.equal(fetches.length, 1)
  assert.equal(fetches[0].privateChannelPubkeys[0], 'channel')
  assert.ok(fetches[0].since <= now - 10)
  assert.ok(fetches[0].until >= now)
  assert.equal(messenger.nextMessage().event.id, 'ask-id')
  assert.deepEqual(messenger.readState().channels.channel.offlineRanges, [])
})

test('seeder channels publish presence immediately and on interval', async () => {
  const pm = fakePrivateMessage()
  const intervals = []
  const cleared = []
  const messenger = await new PrivateMessenger({
    _privateMessage: pm,
    _setInterval: (fn, ms) => {
      const timer = { fn, ms }
      intervals.push(timer)
      return timer
    },
    _clearInterval: timer => cleared.push(timer)
  }).init({
    userSigner: signer('user'),
    channels: [{ pubkey: 'channel', signer: signer('channel'), relays: ['wss://relay.example'], mode: 'seeder', seeders: ['alice'] }]
  })

  assert.equal(pm.sent[0].method, 'yell')
  assert.equal(pm.sent[0].options.code, SEEDER_PRESENCE_CODE)
  assert.deepEqual(pm.sent[0].options.receiverPubkeys, ['alice', 'user'])
  assert.equal(intervals[0].ms, 10 * 60 * 1000)

  await intervals[0].fn()

  assert.equal(pm.sent[1].method, 'yell')
  assert.equal(pm.sent[1].options.code, SEEDER_PRESENCE_CODE)

  messenger.close()
  assert.deepEqual(cleared, intervals)
})

test('recovery asks online seeders for the relay-uncovered left edge', async () => {
  const pm = fakePrivateMessage()
  const fetches = []
  let scheduled = null
  const now = Math.floor(Date.now() / 1000)
  globalThis.localStorage.setItem('ez-vault:private-messenger:user:state', JSON.stringify({
    channels: {
      channel: { lastSeenAt: now - 20, lastWatchedAt: now - 20 }
    }
  }))
  const messenger = await new PrivateMessenger({
    _privateMessage: pm,
    _privateChannel: {
      fetch: async options => {
        fetches.push(options)
        options.onEvent({
          id: 'relay-id',
          kind: TELL_KIND,
          pubkey: 'alice',
          created_at: now - 5,
          tags: [['r', 'user']],
          content: '{"payload":"relay"}'
        }, { id: 'outer-id', created_at: now - 5 }, { channelPubkey: 'channel' })
        return [{ id: 'outer-id', created_at: now - 5 }]
      }
    },
    _setTimeout: fn => { scheduled = fn }
  }).init({
    userSigner: signer('user'),
    channels: [{ pubkey: 'channel', signer: signer('channel'), relays: ['wss://relay.example'], seeders: ['seeder'] }]
  })

  pm.watchCalls[0].onYell({
    event: { id: 'presence-id', kind: TELL_KIND, pubkey: 'seeder', created_at: now - 2, tags: [], content: '{"code":"' + SEEDER_PRESENCE_CODE + '","payload":{}}' },
    outer: { id: 'presence-outer-id', created_at: now - 2 },
    meta: { channelPubkey: 'channel' },
    payload: { code: SEEDER_PRESENCE_CODE, payload: {} },
    yell: { id: 'presence-id' }
  })

  assert.equal(messenger.nextMessage(), null)

  await scheduled()

  const ask = pm.sent.find(sent => sent.method === 'ask' && sent.options.code === MISSING_MESSAGES_ASK_CODE)
  assert.equal(fetches.length, 1)
  assert.equal(ask.options.receiverPubkey, 'seeder')
  assert.ok(ask.options.payload.since <= now - 20)
  assert.equal(ask.options.payload.until, now - 5)
  assert.equal(messenger.nextMessage().event.id, 'relay-id')
})

test('recovery asks all configured seeders but caps discovered seeders', async () => {
  const pm = fakePrivateMessage()
  const now = Math.floor(Date.now() / 1000)
  const configuredSeeders = Array.from({ length: 10 }, (_v, index) => `configured-${index}`)
  const discoveredSeeders = Array.from({ length: 12 }, (_v, index) => `discovered-${index}`)
  const messenger = await new PrivateMessenger({ _privateMessage: pm }).init({
    userSigner: signer('user'),
    channels: [
      { pubkey: 'configured', signer: signer('configured'), relays: ['wss://relay.example'], seeders: configuredSeeders },
      { pubkey: 'discovered', signer: signer('discovered'), relays: ['wss://relay.example'] }
    ]
  })

  for (const [index, seeder] of discoveredSeeders.entries()) {
    messenger.markSeederActive('discovered', seeder, { at: now - index })
  }

  await messenger.askSeedersForMissingRange('configured', now - 20, now - 10)
  await messenger.askSeedersForMissingRange('discovered', now - 20, now - 10)

  const configuredAsks = pm.sent.filter(sent => sent.method === 'ask' && sent.options.privateChannelSigner.getPublicKey() === 'configured')
  const discoveredAsks = pm.sent.filter(sent => sent.method === 'ask' && sent.options.privateChannelSigner.getPublicKey() === 'discovered')

  assert.deepEqual(configuredAsks.map(sent => sent.options.receiverPubkey), configuredSeeders)
  assert.deepEqual(discoveredAsks.map(sent => sent.options.receiverPubkey), discoveredSeeders.slice(0, 8))
})

test('missing-message replies are consumed internally as recovered queue items', async () => {
  const pm = fakePrivateMessage()
  const messenger = await new PrivateMessenger({ _privateMessage: pm }).init({
    userSigner: signer('user'),
    channels: [{ pubkey: 'channel', signer: signer('channel'), relays: ['wss://relay.example'], seeders: ['seeder'] }]
  })
  const jsonl = `${JSON.stringify({
    event: {
      id: 'missed-id',
      kind: TELL_KIND,
      pubkey: 'alice',
      created_at: 1,
      tags: [['r', 'user']],
      content: '{"payload":"old"}'
    }
  })}\n`

  await pm.watchCalls[0].onReply({
    event: { id: 'reply-id', kind: REPLY_KIND, pubkey: 'seeder', created_at: 2, tags: [['q', 'question-id']], content: '' },
    outer: { id: 'reply-outer-id', created_at: 3 },
    meta: { channelPubkey: 'channel' },
    payload: { code: MISSING_MESSAGES_REPLY_CODE, payload: { index: 0, done: true, jsonl } },
    questionId: 'question-id',
    reply: { id: 'reply-id' }
  })

  const item = messenger.nextMessage()
  assert.equal(item.type, 'tell')
  assert.equal(item.event.id, 'missed-id')
  assert.deepEqual(item.payload, { payload: 'old' })
  assert.equal(messenger.nextMessage(), null)
})

test('missing-message reply packer groups records by count and accepts final input', async () => {
  const replies = []
  const question = {
    id: 'question-id',
    pubkey: 'user',
    content: JSON.stringify({ code: MISSING_MESSAGES_ASK_CODE, payload: { since: 5, until: 20 } })
  }
  const packer = createMissingMessageReplyPacker({
    messenger: { reply: async options => replies.push(options) },
    channelPubkey: 'channel',
    question,
    eventsPerChunk: 1
  })
  const userRow = JSON.stringify(['user', 'ciphertext'])
  const otherRow = JSON.stringify(['other', 'ciphertext'])

  await packer.update({
    event: {
      id: 'event-id',
      kind: TELL_KIND,
      pubkey: 'alice',
      created_at: 6,
      tags: [['r', 'user']],
      content: '{"payload":"first"}'
    }
  })
  await packer.finalize({
    type: 'seed',
    channelPubkey: 'channel',
    outer: { id: 'outer-id', kind: 3560, pubkey: 'channel', created_at: 10, tags: [['expiration', '99']] },
    router: { kind: 263, pubkey: 'router', created_at: 10, tags: [['f', 'sender'], ['c', '0', '1']] },
    jsonl: `${userRow}\n${otherRow}\n`
  })

  assert.equal(replies.length, 2)
  assert.equal(replies[0].code, MISSING_MESSAGES_REPLY_CODE)
  assert.equal(replies[0].receiverPubkey, 'user')
  assert.equal(replies[0].payload.since, 5)
  assert.equal(replies[0].payload.until, 20)
  assert.equal(replies[0].payload.done, false)
  assert.equal(JSON.parse(replies[0].payload.jsonl.trim()).event.id, 'event-id')

  assert.equal(replies[1].payload.done, true)
  const lines = replies[1].payload.jsonl.trim().split('\n')
  assert.equal(lines.length, 1)
  const record = JSON.parse(lines[0])
  assert.equal(record.row, userRow)
  assert.equal(record.outer.id, 'outer-id')
  assert.deepEqual(record.router.tags, [['f', 'sender']])
})

test('event reply packer streams regular event lists', async () => {
  const replies = []
  const question = { id: 'question-id', pubkey: 'peer', content: '' }
  const packer = createEventReplyPacker({
    messenger: { reply: async options => replies.push(options) },
    channelPubkey: 'channel',
    question,
    code: 'eventSync_test',
    payload: { collection: 'local-db' },
    eventsPerChunk: 2
  })

  await packer.update([
    { id: 'event-1', kind: 1, pubkey: 'alice', created_at: 1, tags: [], content: 'one' },
    { id: 'event-2', kind: 1, pubkey: 'alice', created_at: 2, tags: [], content: 'two' }
  ])
  await packer.finalize({ id: 'event-3', kind: 1, pubkey: 'alice', created_at: 3, tags: [], content: 'three' })

  assert.equal(replies.length, 2)
  assert.equal(replies[0].code, 'eventSync_test')
  assert.equal(replies[0].receiverPubkey, 'peer')
  assert.deepEqual(replies[0].payload.collection, 'local-db')
  assert.equal(replies[0].payload.index, 0)
  assert.equal(replies[0].payload.done, false)
  assert.deepEqual(replies[0].payload.jsonl.trim().split('\n').map(line => JSON.parse(line).event.id), ['event-1', 'event-2'])

  assert.equal(replies[1].payload.index, 1)
  assert.equal(replies[1].payload.done, true)
  assert.deepEqual(replies[1].payload.jsonl.trim().split('\n').map(line => JSON.parse(line).event.id), ['event-3'])
})
