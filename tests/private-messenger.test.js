import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { ASK_KIND, REPLY_KIND, TELL_KIND } from '../docs/helpers/nostr/private-message.js'
import { PrivateMessenger } from '../docs/services/private-messenger/index.js'

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
