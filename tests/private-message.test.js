import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { getEventHash } from 'nostr-tools'
import {
  ASK_KIND,
  REPLY_KIND,
  TELL_KIND,
  ask,
  broadcastRumor,
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
      _publish: async () => ({ results: [] })
    }),
    /PRIVATE_MESSAGE_NOT_WATCHING/
  )
})

test('watch dispatches content key usage callbacks', async () => {
  const { calls, fakeSubscribe } = fakeSubscribeFactory()
  const usages = []
  await watch({
    channels: ['channel1'],
    relays: ['wss://relay.example'],
    receiverSigner: signer('receiver'),
    privateChannelSigner: signer('channel1'),
    onContentKeyUsage: usage => usages.push(usage),
    _subscribe: fakeSubscribe
  })

  calls[0].onContentKeyUsage({
    channelPubkey: 'channel1',
    direction: 'sent',
    contentKeyPubkey: ''
  })

  assert.deepEqual(usages, [{ channelPubkey: 'channel1', direction: 'sent', contentKeyPubkey: '' }])
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
  assert.equal(replies[0].question, undefined)
  assert.equal(replies[0].questionId, result.question.id)
  assert.equal(replies[0].reply.pubkey, 'receiver')
  assert.deepEqual(replies[0].payload, { payload: 'pong' })
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
  const rawResult = await broadcastRumor({
    senderSigner: signer(bobPubkey),
    receiverPubkeys: ['alice', 'carol'],
    relays: ['wss://relay.example'],
    rumor: { kind: 9001, created_at: 22, tags: [['x', '1']], content: 'raw' },
    _publish
  })

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
  assert.equal(published[3].event.kind, 9001)
  assert.equal(published[3].event.created_at, 22)
  assert.equal(published[3].event.content, 'raw')
  assert.equal(published[3].event.id, undefined)
  assert.equal(published[3].event.pubkey, undefined)
  assert.equal(published[3].event.sig, undefined)
  assert.deepEqual(published[3].event.tags, [['x', '1']])
  assert.equal(published[3].receiverTag, '')
  assert.deepEqual(published[3].receivers, ['alice', 'carol'])
  assert.equal(rawResult.rumor.pubkey, bobPubkey)
  assert.equal(rawResult.rumor.id, getEventHash({ ...published[3].event, pubkey: bobPubkey }))
})

test('broadcastRumor validates normalized unsigned rumors before publishing', async () => {
  let published = false

  await assert.rejects(
    () => broadcastRumor({
      senderSigner: signer(pubkeyFixture(4)),
      receiverPubkeys: ['alice'],
      relays: ['wss://relay.example'],
      rumor: { kind: 9001, created_at: 22, tags: ['not-a-tag'], content: 'raw' },
      _publish: async () => { published = true }
    }),
    /INVALID_RUMOR/
  )

  assert.equal(published, false)
})
