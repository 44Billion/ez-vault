import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { getEventHash } from 'nostr-tools'
import {
  ASK_KIND,
  REPLY_KIND,
  TELL_KIND,
  ask,
  reply,
  tell,
  unwatch,
  watch,
  yell
} from '../docs/helpers/nostr/private-message.js'

const data = new Map()
globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  removeItem: key => { data.delete(String(key)) },
  setItem: (key, value) => { data.set(String(key), String(value)) }
}

afterEach(() => {
  unwatch()
  globalThis.localStorage.clear()
})

function signer (pubkey) {
  return {
    getPublicKey: () => pubkey,
    withSharedKey: () => ({})
  }
}

function pubkeyFixture (index) {
  return index.toString(16).padStart(64, '0')
}

function fakeSubscribeFactory () {
  const calls = []
  const closed = []
  const fakeSubscribe = options => {
    calls.push(options)
    return {
      close: () => closed.push(options)
    }
  }
  return { calls, closed, fakeSubscribe }
}

test('watch merges overlapping relay subscriptions by channel author', async () => {
  const { calls, closed, fakeSubscribe } = fakeSubscribeFactory()
  await watch({
    channels: ['channel1'],
    relays: ['wss://a.example'],
    receiverSigner: signer('receiver'),
    privateChannelSigner: signer('channel1'),
    _subscribe: fakeSubscribe
  })
  await watch({
    channels: ['channel1'],
    relays: ['wss://a.example'],
    receiverSigner: signer('receiver'),
    privateChannelSigner: signer('channel1'),
    _subscribe: fakeSubscribe
  })
  await watch({
    channels: ['channel2'],
    relays: ['wss://a.example', 'wss://b.example'],
    receiverSigner: signer('receiver'),
    privateChannelSigner: signer('channel2'),
    mode: 'seeder',
    _subscribe: fakeSubscribe
  })

  assert.equal(calls.length, 3)
  assert.deepEqual(calls[0].privateChannelPubkeys, ['channel1'])
  assert.deepEqual(calls[0].relays, ['wss://a.example'])
  assert.equal(calls[0].limit, 0)
  assert.equal(calls[0].liveOnly, true)
  assert.deepEqual(calls[1].privateChannelPubkeys.sort(), ['channel1', 'channel2'])
  assert.deepEqual(calls[1].relays, ['wss://a.example'])
  assert.deepEqual(calls[1].modeByPubkey, { channel1: 'leecher', channel2: 'seeder' })
  assert.deepEqual(calls[2].privateChannelPubkeys, ['channel2'])
  assert.deepEqual(calls[2].relays, ['wss://b.example'])

  await new Promise(resolve => setTimeout(resolve, 550))
  assert.equal(closed.length, 1)
  assert.deepEqual(closed[0].privateChannelPubkeys, ['channel1'])
})

test('ask requires watching the sender private channel first', async () => {
  await assert.rejects(
    () => ask({
      senderSigner: signer('sender'),
      privateChannelSigner: signer('sender-channel'),
      receiverPubkey: 'receiver',
      relays: ['wss://relay.example'],
      message: { code: 'PING' },
      retry: false,
      _publish: async () => ({ results: [] })
    }),
    /PRIVATE_MESSAGE_NOT_WATCHING/
  )
})

test('ask publishes an ask rumor and watch dispatches the reply with its question', async () => {
  const { calls, fakeSubscribe } = fakeSubscribeFactory()
  const replies = []
  let published = null
  const senderPubkey = pubkeyFixture(1)
  await watch({
    channels: ['sender-channel'],
    relays: ['wss://relay.example'],
    receiverSigner: signer(senderPubkey),
    privateChannelSigner: signer('sender-channel'),
    onReply: event => replies.push(event),
    _subscribe: fakeSubscribe
  })
  const result = await ask({
    senderSigner: signer(senderPubkey),
    privateChannelSigner: signer('sender-channel'),
    receiverPubkey: 'receiver',
    relays: ['wss://relay.example'],
    message: { code: 'PING', payload: { ok: true } },
    retry: false,
    _publish: async options => {
      published = options
      return { results: [{ success: true }] }
    }
  })

  assert.equal(published.event.kind, ASK_KIND)
  assert.equal(published.event.sig, undefined)
  assert.equal(published.event.id, undefined)
  assert.equal(published.event.pubkey, undefined)
  assert.equal(published.receiverTag, 'receiver')
  assert.deepEqual(published.receivers, ['receiver'])
  assert.deepEqual(JSON.parse(published.event.content), { code: 'PING', payload: { ok: true } })
  assert.equal(result.question.pubkey, senderPubkey)
  assert.equal(result.question.id, getEventHash({ ...published.event, pubkey: senderPubkey }))
  assert.throws(() => getEventHash(published.event), /wrong or missing properties/)

  calls[0].onEvent({
    kind: REPLY_KIND,
    id: 'reply-id',
    pubkey: 'receiver',
    created_at: 1,
    tags: [['q', result.question.id]],
    content: JSON.stringify({ payload: 'pong' })
  }, { created_at: 2 }, { channelPubkey: 'sender-channel' })

  assert.equal(replies.length, 1)
  assert.equal(replies[0].question.id, result.question.id)
  assert.equal(replies[0].reply.pubkey, 'receiver')
  assert.deepEqual(replies[0].payload, { payload: 'pong' })
})

test('watch reattaches content key signer to pending ask retries', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({})
  const published = []
  const senderPubkey = pubkeyFixture(2)
  let question = null
  const _publish = async options => {
    published.push(options)
    return { results: [] }
  }

  try {
    await watch({
      channels: ['sender-channel'],
      relays: ['wss://relay.example'],
      receiverSigner: signer(senderPubkey),
      privateChannelSigner: signer('sender-channel'),
      _subscribe: fakeSubscribeFactory().fakeSubscribe
    })
    const result = await ask({
      senderSigner: signer(senderPubkey),
      privateChannelSigner: signer('sender-channel'),
      receiverPubkey: 'receiver',
      relays: ['wss://relay.example'],
      payload: 'ping',
      retryLimit: 1,
      retryIntervalMs: 25,
      _publish
    })
    question = result.question

    unwatch('sender-channel')
    const secondSubscribe = fakeSubscribeFactory()
    await watch({
      channels: ['sender-channel'],
      relays: ['wss://relay.example'],
      receiverSigner: signer(senderPubkey),
      iykcSigner: signer('content'),
      privateChannelSigner: signer('sender-channel'),
      _subscribe: secondSubscribe.fakeSubscribe
    })
    secondSubscribe.calls[0].onChunk({
      channelPubkey: 'sender-channel',
      router: { pubkey: 'router-id' },
      missing: [1]
    })
    await new Promise(resolve => setTimeout(resolve, 60))

    assert.equal(published.length, 2)
    assert.equal(published[0].imkcSigner, undefined)
    assert.equal(published[1].imkcSigner.getPublicKey(), 'content')
    assert.equal(published[1].event.id, undefined)
    assert.equal(published[1].event.pubkey, undefined)
    assert.deepEqual(published[1].event.missingChunks, { 'router-id': [1] })
    assert.equal(getEventHash({ ...published[1].event, pubkey: senderPubkey }), question.id)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reply tell and yell publish recognizable private message rumors', async () => {
  const published = []
  const bobPubkey = pubkeyFixture(3)
  const _publish = async options => {
    published.push(options)
    return { results: [] }
  }
  const question = {
    id: 'question-id',
    pubkey: 'alice',
    kind: ASK_KIND,
    created_at: 1,
    tags: [['r', 'bob']],
    content: '{}'
  }

  const replyResult = await reply({ senderSigner: signer(bobPubkey), question, relays: ['wss://relay.example'], payload: 'answer', _publish })
  const tellResult = await tell({ senderSigner: signer(bobPubkey), receiverPubkey: 'alice', relays: ['wss://relay.example'], payload: 'note', _publish })
  const yellResult = await yell({ senderSigner: signer(bobPubkey), receiverPubkeys: ['alice', 'carol'], relays: ['wss://relay.example'], payload: 'broadcast', _publish })

  assert.equal(published[0].event.kind, REPLY_KIND)
  assert.equal(published[0].event.id, undefined)
  assert.equal(published[0].event.pubkey, undefined)
  assert.equal(replyResult.reply.pubkey, bobPubkey)
  assert.equal(replyResult.reply.id, getEventHash({ ...published[0].event, pubkey: bobPubkey }))
  assert.deepEqual(published[0].event.tags, [['q', 'question-id'], ['r', 'alice']])
  assert.equal(published[0].receiverTag, 'alice')
  assert.equal(published[1].event.kind, TELL_KIND)
  assert.equal(tellResult.tell.id, getEventHash({ ...published[1].event, pubkey: bobPubkey }))
  assert.deepEqual(published[1].event.tags, [['r', 'alice']])
  assert.equal(published[1].receiverTag, 'alice')
  assert.equal(published[2].event.kind, TELL_KIND)
  assert.equal(yellResult.yell.id, getEventHash({ ...published[2].event, pubkey: bobPubkey }))
  assert.deepEqual(published[2].event.tags, [])
  assert.equal(published[2].receiverTag, '')
  assert.deepEqual(published[2].receivers, ['alice', 'carol'])
})
