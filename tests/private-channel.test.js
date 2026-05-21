import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getEventHash } from 'nostr-tools'
import NsecSigner from '../docs/services/nsec-signer.js'
import {
  EXPIRATION_SECONDS,
  getJsonlChunkByteSize,
  MAX_EVENT_BYTES,
  PRIVATE_BROADCAST_KIND,
  ROUTER_KIND,
  unwrapEvent,
  wrapEvent,
  wrapEvents
} from '../docs/services/private-channel/index.js'
import { makeContentKeyEvent, parseContentKeyEvent } from '../docs/services/content-key/event.js'
import { TEMPORARY_STORAGE_KEYS_KEY } from '../docs/services/temporary-storage.js'
import { bytesToHex } from '../docs/helpers/nostr/index.js'

if (!globalThis.localStorage) {
  const data = new Map()
  globalThis.localStorage = {
    clear: () => data.clear(),
    getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
    removeItem: key => { data.delete(String(key)) },
    setItem: (key, value) => { data.set(String(key), String(value)) }
  }
}

if (!globalThis.crypto) globalThis.crypto = crypto
if (!globalThis.btoa) globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64')
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary')

afterEach(() => {
  NsecSigner.releaseAll()
  globalThis.localStorage.clear()
})

function signer () {
  return NsecSigner.getOrCreate(bytesToHex(generateSecretKey()))
}

function eventFixture (content = 'hello') {
  return { kind: 1, created_at: 1, tags: [], content }
}

function unwrappedFixture (event, pubkey) {
  const unwrapped = { ...event, pubkey }
  return { ...unwrapped, id: getEventHash(unwrapped) }
}

async function noContentKeys () {
  return {}
}

test('shared-key signer derives matching deniable key from either side', async () => {
  const alice = signer()
  const bob = signer()
  const alicePubkey = await alice.getPublicKey()
  const bobPubkey = await bob.getPublicKey()
  const aliceShared = alice.withSharedKey(bobPubkey)
  const bobShared = bob.withSharedKey(alicePubkey)

  assert.equal(await aliceShared.getPublicKey(), await bobShared.getPublicKey())
  const sharedPubkey = await aliceShared.getPublicKey()
  const ciphertext = await aliceShared.nip44Encrypt(sharedPubkey, 'secret')
  assert.equal(await bobShared.nip44Decrypt(sharedPubkey, ciphertext), 'secret')
})

test('wrapEvent creates private broadcast events under relay event size limit', async () => {
  const alice = signer()
  const bob = signer()
  const bobPubkey = await bob.getPublicKey()
  const before = Math.floor(Date.now() / 1000)
  const wrapped = await wrapEvent({ senderSigner: alice, receivers: [bobPubkey], event: eventFixture('hello bob'), _getIykcProofs: noContentKeys })

  assert.equal(wrapped.length, 1)
  assert.equal(wrapped[0].kind, PRIVATE_BROADCAST_KIND)
  assert.equal(wrapped[0].pubkey, await alice.getPublicKey())
  assert.ok(Number(wrapped[0].tags[0][1]) >= before + EXPIRATION_SECONDS)
  assert.ok(new TextEncoder().encode(JSON.stringify(wrapped[0])).length <= MAX_EVENT_BYTES)
  assert.equal(globalThis.localStorage.getItem(TEMPORARY_STORAGE_KEYS_KEY), null)
})

test('wrapEvent supports overriding the outer expiration window', async () => {
  const alice = signer()
  const bob = signer()
  const bobPubkey = await bob.getPublicKey()
  const before = Math.floor(Date.now() / 1000)
  const [wrapped] = await wrapEvent({
    senderSigner: alice,
    receivers: [bobPubkey],
    event: eventFixture('hello bob'),
    expirationSeconds: 7 * 24 * 60 * 60,
    _getIykcProofs: noContentKeys
  })

  assert.ok(Number(wrapped.tags[0][1]) >= before + 7 * 24 * 60 * 60)
})

test('unwrapEvent returns the addressed receiver event or null', async () => {
  const alice = signer()
  const bob = signer()
  const carol = signer()
  const bobPubkey = await bob.getPublicKey()
  const carolPubkey = await carol.getPublicKey()
  const alicePubkey = await alice.getPublicKey()
  const original = { ...eventFixture('private'), pubkey: '0'.repeat(64), id: 'f'.repeat(64) }
  const [wrapped] = await wrapEvent({ senderSigner: alice, receivers: [bobPubkey, carolPubkey], event: original, _getIykcProofs: noContentKeys })

  assert.deepEqual(await unwrapEvent({ receiverSigner: bob, privateChannelSigner: alice, event: wrapped, receiverPubkey: bobPubkey }), unwrappedFixture(original, alicePubkey))
  assert.deepEqual(await unwrapEvent({ receiverSigner: carol, privateChannelSigner: alice, event: wrapped, receiverPubkey: carolPubkey }), unwrappedFixture(original, alicePubkey))
  assert.equal(await unwrapEvent({ receiverSigner: bob, privateChannelSigner: alice, event: wrapped, receiverPubkey: await signer().getPublicKey() }), null)
})

test('unwrapEvent uses imkc tag as the row encryption pubkey', async () => {
  const alice = signer()
  const imkc = signer()
  const bob = signer()
  const bobPubkey = await bob.getPublicKey()
  const imkcPubkey = await imkc.getPublicKey()
  const original = eventFixture('private')
  const [wrapped] = await wrapEvent({ senderSigner: alice, imkcSigner: imkc, receivers: [bobPubkey], event: original, _getIykcProofs: noContentKeys })
  const router = JSON.parse(await alice.nip44Decrypt(await alice.getPublicKey(), wrapped.content))

  assert.equal(router.tags.find(t => t[0] === 'f')?.[1], await alice.getPublicKey())
  assert.equal(router.tags.find(t => t[0] === 'imkc')?.[1], imkcPubkey)
  assert.deepEqual(await unwrapEvent({ receiverSigner: bob, privateChannelSigner: alice, event: wrapped, receiverPubkey: bobPubkey }), unwrappedFixture(original, await alice.getPublicKey()))
})

test('wrapEvent uses receiver content key rows when iykc is advertised', async () => {
  const alice = signer()
  const bob = signer()
  const bobContent = signer()
  const bobPubkey = await bob.getPublicKey()
  const contentKeyEvent = await makeContentKeyEvent({ userSigner: bob, contentKeySigner: bobContent, createdAt: 7 })
  const contentKey = parseContentKeyEvent(contentKeyEvent)
  const original = eventFixture('private')
  const [wrapped] = await wrapEvent({
    senderSigner: alice,
    receivers: [bobPubkey],
    event: original,
    _getIykcProofs: async () => ({
      [bobPubkey]: contentKey
    })
  })
  const router = JSON.parse(await alice.nip44Decrypt(await alice.getPublicKey(), wrapped.content))
  const line = JSON.parse(new TextDecoder().decode(Buffer.from(router.content, 'base64')).trim())

  assert.deepEqual(line.slice(0, 1), [bobPubkey])
  assert.deepEqual(line.slice(2), [contentKey.iykcPubkey, contentKey.iykcProof])
  assert.deepEqual(await unwrapEvent({ receiverSigner: bob, iykcSigner: bobContent, privateChannelSigner: alice, event: wrapped, receiverPubkey: bobPubkey }), unwrappedFixture(original, await alice.getPublicKey()))
  await assert.rejects(
    () => unwrapEvent({ receiverSigner: bob, privateChannelSigner: alice, event: wrapped, receiverPubkey: bobPubkey }),
    /RECEIVER_CONTENT_KEY_REQUIRED/
  )
})

test('wrapEvent falls back to receiver main key when iykc proof is invalid', async () => {
  const alice = signer()
  const bob = signer()
  const bobContent = signer()
  const bobPubkey = await bob.getPublicKey()
  const original = eventFixture('private')
  const [wrapped] = await wrapEvent({
    senderSigner: alice,
    receivers: [bobPubkey],
    event: original,
    _getIykcProofs: async () => ({
      [bobPubkey]: {
        iykcPubkey: await bobContent.getPublicKey(),
        iykcProof: `7:${'f'.repeat(128)}`
      }
    })
  })
  const router = JSON.parse(await alice.nip44Decrypt(await alice.getPublicKey(), wrapped.content))
  const line = JSON.parse(new TextDecoder().decode(Buffer.from(router.content, 'base64')).trim())

  assert.equal(line.length, 2)
  assert.deepEqual(await unwrapEvent({ receiverSigner: bob, privateChannelSigner: alice, event: wrapped, receiverPubkey: bobPubkey }), unwrappedFixture(original, await alice.getPublicKey()))
})

test('wrapEvent chunks large jsonl without oversize events and unwraps reassembled bytes', async () => {
  const alice = signer()
  const imkc = signer()
  const bob = signer()
  const bobPubkey = await bob.getPublicKey()
  const imkcPubkey = await imkc.getPublicKey()
  const original = eventFixture('x'.repeat(getJsonlChunkByteSize()))
  const wrapped = await wrapEvent({ senderSigner: alice, imkcSigner: imkc, receivers: [bobPubkey], event: original, _getIykcProofs: noContentKeys })

  assert.ok(wrapped.length > 1)
  for (const event of wrapped) assert.ok(new TextEncoder().encode(JSON.stringify(event)).length <= MAX_EVENT_BYTES)

  const routers = []
  for (const event of wrapped) {
    routers.push(JSON.parse(await alice.nip44Decrypt(await alice.getPublicKey(), event.content)))
  }
  assert.equal(routers[0].kind, ROUTER_KIND)
  assert.equal(routers[0].tags.find(t => t[0] === 'r')?.[1], bobPubkey)
  assert.equal(routers[0].tags.find(t => t[0] === 'imkc')?.[1], imkcPubkey)
  assert.equal(routers.length, Number(routers[0].tags.find(t => t[0] === 'c')[2]))
})

test('wrapEvents cleans temporary chunks when the stream is stopped early', async () => {
  const alice = signer()
  const bob = signer()
  const bobPubkey = await bob.getPublicKey()
  const original = eventFixture('x'.repeat(getJsonlChunkByteSize()))
  const stream = wrapEvents({ senderSigner: alice, receivers: [bobPubkey], event: original, _getIykcProofs: noContentKeys })

  const first = await stream.next()
  assert.equal(first.done, false)
  assert.notEqual(globalThis.localStorage.getItem(TEMPORARY_STORAGE_KEYS_KEY), null)

  await stream.return()

  assert.equal(globalThis.localStorage.getItem(TEMPORARY_STORAGE_KEYS_KEY), null)
})
