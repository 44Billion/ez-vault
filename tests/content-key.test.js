import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey } from 'nostr-tools'
import NsecSigner from '../docs/services/nsec-signer.js'
import { upsertContentKeyEvent } from '../docs/services/content-key/index.js'
import { makeContentKeyEvent, parseContentKeyEvent, CONTENT_KEY_KIND } from '../docs/services/content-key/event.js'
import { getIykcProofs } from '../docs/helpers/nostr/queries.js'
import { bytesToHex } from '../docs/helpers/nostr/index.js'

afterEach(() => {
  NsecSigner.releaseAll()
})

function signer () {
  return NsecSigner.getOrCreate(bytesToHex(generateSecretKey()))
}

test('makeContentKeyEvent publishes a verifiable cp proof', async () => {
  const user = signer()
  const contentKey = signer()
  const event = await makeContentKeyEvent({ userSigner: user, contentKeySigner: contentKey, createdAt: 7 })
  const parsed = parseContentKeyEvent(event)

  assert.equal(event.kind, CONTENT_KEY_KIND)
  assert.equal(event.pubkey, await user.getPublicKey())
  assert.deepEqual(event.tags[0].slice(0, 2), ['cp', await contentKey.getPublicKey()])
  assert.equal(parsed.iykcPubkey, await contentKey.getPublicKey())
  assert.equal(parsed.iykcProof, `${event.created_at}:${event.tags[0][2]}`)
})

test('parseContentKeyEvent rejects events with extra tags or bad proofs', async () => {
  const user = signer()
  const contentKey = signer()
  const event = await makeContentKeyEvent({ userSigner: user, contentKeySigner: contentKey, createdAt: 7 })

  assert.equal(parseContentKeyEvent({ ...event, tags: event.tags.concat([['x', 'nope']]) }), null)
  assert.equal(parseContentKeyEvent({ ...event, tags: [['cp', event.tags[0][1], 'f'.repeat(128)]] }), null)
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
      iykcProof: `${contentEvent.created_at}:${contentEvent.tags[0][2]}`
    }
  })
  assert.equal(calls.filter(call => call.filter.kinds[0] === CONTENT_KEY_KIND).length, 2)
  assert.deepEqual(calls.filter(call => call.filter.kinds[0] === CONTENT_KEY_KIND).map(call => call.relays[0]).sort(), ['wss://a.example', 'wss://b.example'])
})
