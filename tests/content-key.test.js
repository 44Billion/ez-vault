import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getEventHash, verifyEvent } from 'nostr-tools'
import NsecSigner from '../docs/services/nsec-signer.js'
import { doubleSignEvent, upsertContentKeyEvent } from '../docs/services/content-key/index.js'
import { makeContentKeyEvent, parseContentKeyEvent, verifyContentKeyProof, verifyIykcProof, CONTENT_KEY_KIND } from '../docs/services/content-key/event.js'
import { cacheRelayListEvent, clearQueryCaches, getIykcProofs, getRelaysByPubkey, pickRelaysForPubkeys, subscribeRelayListUpdates } from '../docs/helpers/nostr/queries.js'
import { bytesToHex } from '../docs/helpers/nostr/index.js'

afterEach(() => {
  clearQueryCaches()
  NsecSigner.releaseAll()
})

function signer () {
  return NsecSigner.getOrCreate(bytesToHex(generateSecretKey()))
}

function pubkeyFixture (index) {
  return index.toString(16).padStart(64, '0')
}

function relayListEvent (pubkey, createdAt, tags) {
  return {
    kind: 10002,
    pubkey,
    created_at: createdAt,
    tags,
    content: ''
  }
}

function fakeRelayPool () {
  const calls = []
  const closed = []
  return {
    calls,
    closed,
    pool: {
      subscribeMany: (relays, filter, handlers) => {
        const call = { relays, filter, handlers }
        calls.push(call)
        return {
          close: () => closed.push(call)
        }
      }
    }
  }
}

test('makeContentKeyEvent publishes a signed content pubkey', async () => {
  const user = signer()
  const contentKey = signer()
  const userPubkey = await user.getPublicKey()
  const contentPubkey = await contentKey.getPublicKey()
  const event = await makeContentKeyEvent({ userSigner: user, contentKeySigner: contentKey, createdAt: 7 })
  const parsed = parseContentKeyEvent(event)

  assert.equal(event.kind, CONTENT_KEY_KIND)
  assert.equal(event.pubkey, userPubkey)
  assert.deepEqual(event.tags, [['cp', contentPubkey]])
  assert.equal(parsed.iykcPubkey, contentPubkey)
  assert.equal(parsed.iykcProof, `${event.created_at}:${event.sig}`)
  assert.equal(verifyIykcProof({ receiverPubkey: userPubkey, iykcPubkey: contentPubkey, iykcProof: parsed.iykcProof }), true)
  assert.equal(verifyContentKeyProof({ ownerPubkey: userPubkey, contentPubkey, proof: parsed.iykcProof }), true)
  assert.equal(verifyEvent(event), true)
})

test('parseContentKeyEvent rejects events with extra tags or bad signatures', async () => {
  const user = signer()
  const contentKey = signer()
  const event = await makeContentKeyEvent({ userSigner: user, contentKeySigner: contentKey, createdAt: 7 })

  assert.equal(parseContentKeyEvent({ ...event, tags: event.tags.concat([['x', 'nope']]) }), null)
  assert.equal(parseContentKeyEvent({ ...event, tags: [['cp', event.tags[0][1], 'extra']] }), null)
  assert.equal(parseContentKeyEvent({ ...event, content: 'nope' }), null)
  assert.equal(parseContentKeyEvent({ ...event, tags: [['cp', 'f'.repeat(64)]] }), null)
})

test('verifyIykcProof rejects missing or mismatched proofs', async () => {
  const user = signer()
  const contentKey = signer()
  const otherContentKey = signer()
  const userPubkey = await user.getPublicKey()
  const contentPubkey = await contentKey.getPublicKey()
  const event = await makeContentKeyEvent({ userSigner: user, contentKeySigner: contentKey, createdAt: 7 })
  const { iykcProof } = parseContentKeyEvent(event)

  assert.equal(verifyIykcProof({ receiverPubkey: userPubkey, iykcPubkey: contentPubkey, iykcProof: '' }), false)
  assert.equal(verifyIykcProof({ receiverPubkey: userPubkey, iykcPubkey: await otherContentKey.getPublicKey(), iykcProof }), false)
  assert.equal(verifyIykcProof({ receiverPubkey: await signer().getPublicKey(), iykcPubkey: contentPubkey, iykcProof }), false)
})

test('upsertContentKeyEvent signs and publishes to user write relays', async () => {
  const user = signer()
  const contentKey = signer()
  const userPubkey = await user.getPublicKey()
  let published = null
  const result = await upsertContentKeyEvent({
    userSigner: user,
    contentKeySigner: contentKey,
    _resolveWriteRelays: async (pubkey) => {
      assert.equal(pubkey, userPubkey)
      return ['wss://write.example']
    },
    _publish: async (event, relays) => {
      published = { event, relays }
      return { success: true }
    }
  })

  assert.deepEqual(published.relays, ['wss://write.example'])
  assert.equal(parseContentKeyEvent(published.event).iykcPubkey, await contentKey.getPublicKey())
  assert.equal(result.event.id, published.event.id)
  assert.deepEqual(result.result, { success: true })
})

test('doubleSignEvent signs event with per-event imkc proof', async () => {
  const user = signer()
  const contentKey = signer()
  const userPubkey = await user.getPublicKey()
  const contentPubkey = await contentKey.getPublicKey()
  const event = {
    kind: 1,
    pubkey: 'f'.repeat(64),
    id: 'e'.repeat(64),
    sig: 'd'.repeat(128),
    created_at: 9,
    tags: [['p', 'peer'], ['imkc', 'old'], ['x', 'kept']],
    content: 'clear text'
  }

  const signed = await doubleSignEvent({ userSigner: user, contentKeySigner: contentKey, event })
  const imkcTag = signed.tags.find(tag => tag[0] === 'imkc')
  const proofEvent = {
    kind: signed.kind,
    pubkey: contentPubkey,
    created_at: signed.created_at,
    tags: signed.tags.map(tag => tag[0] === 'imkc' ? ['imkc', contentPubkey] : [...tag]),
    content: signed.content,
    sig: imkcTag[2]
  }
  proofEvent.id = getEventHash(proofEvent)

  assert.equal(signed.pubkey, userPubkey)
  assert.deepEqual(imkcTag.slice(0, 2), ['imkc', contentPubkey])
  assert.equal(signed.tags[1][0], 'imkc')
  assert.equal(event.tags[1][1], 'old')
  assert.equal(verifyEvent(proofEvent), true)
  assert.equal(verifyEvent(signed), true)
})

test('getIykcProofs fetches content key events from grouped write relays', async () => {
  const bob = signer()
  const bobContent = signer()
  const bobPubkey = await bob.getPublicKey()
  const contentEvent = await makeContentKeyEvent({ userSigner: bob, contentKeySigner: bobContent, createdAt: 7 })
  const relayList = await bob.signEvent({
    kind: 10002,
    created_at: 6,
    tags: [['r', 'wss://a.example'], ['r', 'wss://b.example']],
    content: ''
  })
  const calls = []
  const result = await getIykcProofs([bobPubkey], {
    _fetchEvents: async (filter, relays) => {
      calls.push({ filter, relays })
      if (filter.kinds[0] === 10002) return [relayList]
      if (filter.kinds[0] === CONTENT_KEY_KIND) return [contentEvent]
      return []
    }
  })

  assert.deepEqual(result, {
    [bobPubkey]: {
      iykcPubkey: await bobContent.getPublicKey(),
      iykcProof: `${contentEvent.created_at}:${contentEvent.sig}`
    }
  })
  assert.equal(calls.filter(call => call.filter.kinds[0] === CONTENT_KEY_KIND).length, 2)
  assert.deepEqual(calls.filter(call => call.filter.kinds[0] === CONTENT_KEY_KIND).map(call => call.relays[0]).sort(), ['wss://a.example', 'wss://b.example'])
})

test('pickRelaysForPubkeys defaults to write relays and can pick read relays', () => {
  const relaysByPubkey = {
    alice: { read: ['wss://alice-read.example'], write: ['wss://alice-write.example'] },
    bob: { read: ['wss://shared-read.example'], write: ['wss://bob-write.example'] }
  }

  assert.deepEqual(
    [...pickRelaysForPubkeys(['alice', 'bob'], relaysByPubkey).keys()].sort(),
    ['wss://alice-write.example', 'wss://bob-write.example']
  )
  assert.deepEqual(
    [...pickRelaysForPubkeys(['alice', 'bob'], relaysByPubkey, { relayType: 'read' }).keys()].sort(),
    ['wss://alice-read.example', 'wss://shared-read.example']
  )
})

test('getRelaysByPubkey caches relay lookups per pubkey', async () => {
  const user = signer()
  const pubkey = await user.getPublicKey()
  const relayList = await user.signEvent({
    kind: 10002,
    created_at: 6,
    tags: [['r', 'wss://cached.example', 'write']],
    content: ''
  })
  const calls = []
  const _fetchEvents = async (filter, relays) => {
    calls.push({ filter, relays })
    return [relayList]
  }

  const first = await getRelaysByPubkey([pubkey], { _fetchEvents })
  const second = await getRelaysByPubkey([pubkey], { _fetchEvents })

  assert.deepEqual(first, second)
  assert.deepEqual(second[pubkey].write, ['wss://cached.example'])
  assert.equal(calls.length, 1)
})

test('relay-list update subscriptions emit newer read changes and ignore older events', () => {
  const { calls, closed, pool } = fakeRelayPool()
  const changes = []
  cacheRelayListEvent(relayListEvent('alice', 10, [
    ['r', 'wss://old-read.example', 'read'],
    ['r', 'wss://old-write.example', 'write']
  ]))

  const stop = subscribeRelayListUpdates(['alice'], {
    relayType: 'read',
    onChange: update => changes.push(update),
    _pool: pool
  })

  calls[0].handlers.onevent(relayListEvent('alice', 9, [
    ['r', 'wss://older-read.example', 'read']
  ]))
  calls[0].handlers.onevent(relayListEvent('alice', 11, [
    ['r', 'wss://new-read.example', 'read'],
    ['r', 'wss://old-write.example', 'write']
  ]))
  calls[0].handlers.onevent(relayListEvent('alice', 11, [
    ['r', 'wss://same-time-read.example', 'read'],
    ['r', 'wss://old-write.example', 'write']
  ]))

  assert.equal(changes.length, 1)
  assert.equal(changes[0].pubkey, 'alice')
  assert.deepEqual(changes[0].relays.read, ['wss://new-read.example'])
  assert.equal(changes[0].event.created_at, 11)

  stop()
  assert.equal(closed.length, 1)
})

test('relay-list read subscriptions ignore write-only changes while updating cache', async () => {
  const { calls, pool } = fakeRelayPool()
  const changes = []
  cacheRelayListEvent(relayListEvent('alice', 10, [
    ['r', 'wss://same-read.example', 'read'],
    ['r', 'wss://old-write.example', 'write']
  ]))

  subscribeRelayListUpdates(['alice'], {
    relayType: 'read',
    onChange: update => changes.push(update),
    _pool: pool
  })
  calls[0].handlers.onevent(relayListEvent('alice', 11, [
    ['r', 'wss://same-read.example', 'read'],
    ['r', 'wss://new-write.example', 'write']
  ]))

  assert.equal(changes.length, 0)
  const cached = await getRelaysByPubkey(['alice'], {
    _fetchEvents: async () => {
      throw new Error('SHOULD_USE_CACHE')
    }
  })
  assert.deepEqual(cached.alice.write, ['wss://new-write.example'])
})

test('relay-list both subscriptions emit read or write changes', () => {
  const { calls, pool } = fakeRelayPool()
  const changes = []
  cacheRelayListEvent(relayListEvent('alice', 10, [
    ['r', 'wss://same-read.example', 'read'],
    ['r', 'wss://old-write.example', 'write']
  ]))

  subscribeRelayListUpdates(['alice'], {
    relayType: 'both',
    onChange: update => changes.push(update),
    _pool: pool
  })
  calls[0].handlers.onevent(relayListEvent('alice', 11, [
    ['r', 'wss://same-read.example', 'read'],
    ['r', 'wss://new-write.example', 'write']
  ]))

  assert.equal(changes.length, 1)
  assert.deepEqual(changes[0].changes, { read: false, write: true, both: true })
})

test('getRelaysByPubkey evicts oldest relay cache entries above the cap', async () => {
  const pubkeys = Array.from({ length: 501 }, (_value, index) => pubkeyFixture(index))
  let relayFetches = 0
  const _fetchEvents = async (filter) => {
    relayFetches++
    return filter.authors.map(pubkey => ({
      kind: 10002,
      pubkey,
      created_at: 1,
      tags: [['r', `wss://${pubkey.slice(-4)}.example`]],
      content: ''
    }))
  }

  await getRelaysByPubkey(pubkeys, { _fetchEvents, cacheMs: 0 })
  await getRelaysByPubkey([pubkeys[0]], { _fetchEvents, cacheMs: 0 })
  await getRelaysByPubkey([pubkeys[500]], { _fetchEvents, cacheMs: 0 })

  assert.equal(relayFetches, 2)
})

test('getIykcProofs caches found and missing content key lookups', async () => {
  const bob = signer()
  const carol = signer()
  const bobContent = signer()
  const bobPubkey = await bob.getPublicKey()
  const carolPubkey = await carol.getPublicKey()
  const bobContentEvent = await makeContentKeyEvent({ userSigner: bob, contentKeySigner: bobContent, createdAt: 7 })
  const bobRelayList = await bob.signEvent({
    kind: 10002,
    created_at: 6,
    tags: [['r', 'wss://a.example'], ['r', 'wss://b.example']],
    content: ''
  })
  const carolRelayList = await carol.signEvent({
    kind: 10002,
    created_at: 6,
    tags: [['r', 'wss://a.example'], ['r', 'wss://b.example']],
    content: ''
  })
  const calls = []
  const _fetchEvents = async (filter, relays) => {
    calls.push({ filter, relays })
    if (filter.kinds[0] === 10002) return [bobRelayList, carolRelayList]
    if (filter.kinds[0] === CONTENT_KEY_KIND) return [bobContentEvent]
    return []
  }

  const first = await getIykcProofs([bobPubkey, carolPubkey], { _fetchEvents })
  const callCountAfterFirstFetch = calls.length
  const second = await getIykcProofs([bobPubkey, carolPubkey], { _fetchEvents })

  assert.deepEqual(second, first)
  assert.deepEqual(Object.keys(second), [bobPubkey])
  assert.equal(calls.length, callCountAfterFirstFetch)
})

test('getIykcProofs evicts oldest content key cache entries above the cap', async () => {
  const pubkeys = Array.from({ length: 10001 }, (_value, index) => pubkeyFixture(index))
  let contentKeyFetches = 0
  const _fetchEvents = async (filter) => {
    if (filter.kinds[0] === CONTENT_KEY_KIND) contentKeyFetches++
    return []
  }

  await getIykcProofs(pubkeys, { _fetchEvents, cacheMs: 0 })
  const contentKeyFetchesAfterFirstLookup = contentKeyFetches
  await getIykcProofs([pubkeys[0]], { _fetchEvents, cacheMs: 0 })
  await getIykcProofs([pubkeys[10000]], { _fetchEvents, cacheMs: 0 })

  assert.ok(contentKeyFetches > contentKeyFetchesAfterFirstLookup)
  assert.equal(contentKeyFetches, contentKeyFetchesAfterFirstLookup + 2)
})
