import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { finalizeEvent, generateSecretKey, getEventHash, getPublicKey } from 'nostr-tools'
import NsecSigner from '../docs/services/nsec-signer.js'
import { deriveMultiDhConversationKey } from '../docs/helpers/nostr/multi-dh.js'
import {
  EXPIRATION_SECONDS,
  getJsonlChunkByteSize,
  MAX_EVENT_BYTES,
  PRIVATE_BROADCAST_KIND,
  ROUTER_KIND,
  subscribe,
  unwrapEvent,
  wrapEvent,
  wrapEvents
} from '../docs/services/private-channel/index.js'
import { createReceivedChunkStore, DEFAULT_RECEIVED_CHUNK_MAX_BYTES } from '../docs/services/private-channel/received-chunks.js'
import { makeContentKeyEvent, parseContentKeyEvent, verifyContentKeyProof } from '../docs/services/content-key/event.js'
import { TEMPORARY_STORAGE_KEYS_KEY } from '../docs/services/temporary-storage.js'
import { bytesToHex } from '../docs/helpers/nostr/index.js'
import { pool } from '../docs/services/relays.js'

if (!globalThis.localStorage) {
  const data = new Map()
  globalThis.localStorage = {
    clear: () => data.clear(),
    getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
    key: index => [...data.keys()][index] || null,
    removeItem: key => { data.delete(String(key)) },
    setItem: (key, value) => { data.set(String(key), String(value)) },
    get length () { return data.size }
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

test('multi-DH signer round-trips every content-key mode', async () => {
  const alice = signer()
  const bob = signer()
  const aliceContent = signer()
  const bobContent = signer()
  const alicePubkey = await alice.getPublicKey()
  const bobPubkey = await bob.getPublicKey()
  const aliceContentPubkey = await aliceContent.getPublicKey()
  const bobContentPubkey = await bobContent.getPublicKey()

  const cases = [
    { mode: 'identity' },
    { mode: 'sender-content', aliceContent },
    { mode: 'receiver-content', bobContent },
    { mode: 'both-content', aliceContent, bobContent }
  ]

  for (const c of cases) {
    const encrypted = await alice.nip44EncryptMultiDH({
      peerPubkey: bobPubkey,
      peerContentPubkey: c.bobContent ? bobContentPubkey : '',
      ownContentSigner: c.aliceContent || null,
      plaintext: c.mode
    })
    const decrypted = await bob.nip44DecryptMultiDH({
      peerPubkey: alicePubkey,
      peerContentPubkey: c.aliceContent ? aliceContentPubkey : '',
      ownContentSigner: c.bobContent || null,
      ciphertext: encrypted.ciphertext
    })

    assert.equal(encrypted.mode, c.mode)
    assert.equal(decrypted.mode, c.mode)
    assert.equal(decrypted.plaintext, c.mode)
  }
})

test('multi-DH conversation key is pair-oriented, not direction-oriented', () => {
  const aliceSecret = generateSecretKey()
  const bobSecret = generateSecretKey()
  const aliceContentSecret = generateSecretKey()
  const bobContentSecret = generateSecretKey()
  const alicePubkey = getPublicKey(aliceSecret)
  const bobPubkey = getPublicKey(bobSecret)
  const aliceContentPubkey = getPublicKey(aliceContentSecret)
  const bobContentPubkey = getPublicKey(bobContentSecret)
  const aliceToBob = deriveMultiDhConversationKey({
    role: 'sender',
    identitySecretKey: aliceSecret,
    identityPubkey: alicePubkey,
    contentSecretKey: aliceContentSecret,
    contentPubkey: aliceContentPubkey,
    peerIdentityPubkey: bobPubkey,
    peerContentPubkey: bobContentPubkey
  })
  const bobReceiving = deriveMultiDhConversationKey({
    role: 'receiver',
    identitySecretKey: bobSecret,
    identityPubkey: bobPubkey,
    contentSecretKey: bobContentSecret,
    contentPubkey: bobContentPubkey,
    peerIdentityPubkey: alicePubkey,
    peerContentPubkey: aliceContentPubkey
  })
  const bobToAlice = deriveMultiDhConversationKey({
    role: 'sender',
    identitySecretKey: bobSecret,
    identityPubkey: bobPubkey,
    contentSecretKey: bobContentSecret,
    contentPubkey: bobContentPubkey,
    peerIdentityPubkey: alicePubkey,
    peerContentPubkey: aliceContentPubkey
  })
  const aliceToBobInChannel = deriveMultiDhConversationKey({
    role: 'sender',
    identitySecretKey: aliceSecret,
    identityPubkey: alicePubkey,
    contentSecretKey: aliceContentSecret,
    contentPubkey: aliceContentPubkey,
    peerIdentityPubkey: bobPubkey,
    peerContentPubkey: bobContentPubkey,
    context: { channelPubkey: '1'.repeat(64), protocol: 'private-channel' }
  })
  const bobReceivingInChannel = deriveMultiDhConversationKey({
    role: 'receiver',
    identitySecretKey: bobSecret,
    identityPubkey: bobPubkey,
    contentSecretKey: bobContentSecret,
    contentPubkey: bobContentPubkey,
    peerIdentityPubkey: alicePubkey,
    peerContentPubkey: aliceContentPubkey,
    context: { protocol: 'private-channel', channelPubkey: '1'.repeat(64) }
  })
  const aliceToBobInOtherChannel = deriveMultiDhConversationKey({
    role: 'sender',
    identitySecretKey: aliceSecret,
    identityPubkey: alicePubkey,
    contentSecretKey: aliceContentSecret,
    contentPubkey: aliceContentPubkey,
    peerIdentityPubkey: bobPubkey,
    peerContentPubkey: bobContentPubkey,
    context: { protocol: 'private-channel', channelPubkey: '2'.repeat(64) }
  })

  assert.equal(bytesToHex(aliceToBob.conversationKey), bytesToHex(bobReceiving.conversationKey))
  assert.equal(bytesToHex(aliceToBob.conversationKey), bytesToHex(bobToAlice.conversationKey))
  assert.equal(bytesToHex(aliceToBobInChannel.conversationKey), bytesToHex(bobReceivingInChannel.conversationKey))
  assert.notEqual(bytesToHex(aliceToBob.conversationKey), bytesToHex(aliceToBobInChannel.conversationKey))
  assert.notEqual(bytesToHex(aliceToBobInChannel.conversationKey), bytesToHex(aliceToBobInOtherChannel.conversationKey))
})

test('multi-DH self-encryption with a content key still requires the identity key', async () => {
  const alice = signer()
  const aliceContent = signer()
  const wrongIdentity = signer()
  const alicePubkey = await alice.getPublicKey()
  const aliceContentPubkey = await aliceContent.getPublicKey()

  const encrypted = await alice.nip44EncryptMultiDH({
    peerPubkey: alicePubkey,
    peerContentPubkey: aliceContentPubkey,
    ownContentSigner: aliceContent,
    plaintext: 'note to self'
  })

  assert.equal(encrypted.mode, 'both-content')
  assert.equal((await alice.nip44DecryptMultiDH({
    peerPubkey: alicePubkey,
    peerContentPubkey: aliceContentPubkey,
    ownContentSigner: aliceContent,
    ciphertext: encrypted.ciphertext
  })).plaintext, 'note to self')

  await assert.rejects(
    () => wrongIdentity.nip44DecryptMultiDH({
      peerPubkey: alicePubkey,
      peerContentPubkey: aliceContentPubkey,
      ownContentSigner: aliceContent,
      ciphertext: encrypted.ciphertext
    }),
    /invalid MAC/
  )
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

test('received chunk default cap is proportional to private-channel chunk size', () => {
  assert.equal(DEFAULT_RECEIVED_CHUNK_MAX_BYTES, Math.min(getJsonlChunkByteSize() * 64, 3 * 1024 * 1024))
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

test('unwrapEvent preserves valid signed inner events', async () => {
  const alice = signer()
  const bob = signer()
  const authorSecret = generateSecretKey()
  const bobPubkey = await bob.getPublicKey()
  const signed = finalizeEvent({ kind: 9002, created_at: 2, tags: [['x', '1']], content: 'signed' }, authorSecret)
  const [wrapped] = await wrapEvent({ senderSigner: alice, receivers: [bobPubkey], event: signed, _getIykcProofs: noContentKeys })

  assert.deepEqual(await unwrapEvent({ receiverSigner: bob, privateChannelSigner: alice, event: wrapped, receiverPubkey: bobPubkey }), signed)
})

test('unwrapEvent rejects invalid signed inner events', async () => {
  const alice = signer()
  const bob = signer()
  const bobPubkey = await bob.getPublicKey()
  const signed = finalizeEvent({ kind: 9002, created_at: 2, tags: [], content: 'signed' }, generateSecretKey())
  const [wrapped] = await wrapEvent({
    senderSigner: alice,
    receivers: [bobPubkey],
    event: { ...signed, content: 'tampered' },
    _getIykcProofs: noContentKeys
  })

  await assert.rejects(
    () => unwrapEvent({ receiverSigner: bob, privateChannelSigner: alice, event: wrapped, receiverPubkey: bobPubkey }),
    /INVALID_SIGNED_INNER_EVENT/
  )
})

test('unwrapEvent rejects malformed signed inner events', async () => {
  const alice = signer()
  const bob = signer()
  const bobPubkey = await bob.getPublicKey()
  const [wrapped] = await wrapEvent({
    senderSigner: alice,
    receivers: [bobPubkey],
    event: { kind: 9002, created_at: 2, tags: [], content: 'signed', sig: 42 },
    _getIykcProofs: noContentKeys
  })

  await assert.rejects(
    () => unwrapEvent({ receiverSigner: bob, privateChannelSigner: alice, event: wrapped, receiverPubkey: bobPubkey }),
    /INVALID_SIGNED_INNER_EVENT/
  )
})

test('unwrapEvent uses imkc tag as the row encryption pubkey', async () => {
  const alice = signer()
  const imkc = signer()
  const bob = signer()
  const alicePubkey = await alice.getPublicKey()
  const bobPubkey = await bob.getPublicKey()
  const imkcPubkey = await imkc.getPublicKey()
  const original = eventFixture('private')
  const [wrapped] = await wrapEvent({ senderSigner: alice, imkcSigner: imkc, receivers: [bobPubkey], event: original, _getIykcProofs: noContentKeys })
  const router = JSON.parse(await alice.nip44Decrypt(await alice.getPublicKey(), wrapped.content))
  const imkcTag = router.tags.find(t => t[0] === 'imkc')

  assert.equal(router.tags.find(t => t[0] === 'f')?.[1], alicePubkey)
  assert.equal(imkcTag?.[1], imkcPubkey)
  assert.equal(verifyContentKeyProof({ ownerPubkey: alicePubkey, contentPubkey: imkcPubkey, proof: imkcTag?.[2] }), true)
  assert.deepEqual(
    await unwrapEvent({
      receiverSigner: bob,
      privateChannelSigner: alice,
      event: wrapped,
      receiverPubkey: bobPubkey
    }),
    unwrappedFixture(original, alicePubkey)
  )
})

test('unwrapEvent rejects sender imkc keys that do not match the ciphertext', async () => {
  const alice = signer()
  const oldImkc = signer()
  const newImkc = signer()
  const bob = signer()
  const bobPubkey = await bob.getPublicKey()
  const [wrapped] = await wrapEvent({
    senderSigner: alice,
    imkcSigner: oldImkc,
    receivers: [bobPubkey],
    event: eventFixture('private'),
    _getIykcProofs: noContentKeys
  })
  const channelPubkey = await alice.getPublicKey()
  const router = JSON.parse(await alice.nip44Decrypt(channelPubkey, wrapped.content))
  const newImkcPubkey = await newImkc.getPublicKey()
  const newImkcProof = parseContentKeyEvent(await makeContentKeyEvent({ userSigner: alice, contentKeySigner: newImkc, createdAt: 7 })).iykcProof
  router.tags = router.tags.map(tag => tag[0] === 'imkc' ? ['imkc', newImkcPubkey, newImkcProof] : tag)
  const tampered = await alice.signEvent({
    kind: PRIVATE_BROADCAST_KIND,
    created_at: wrapped.created_at,
    tags: wrapped.tags,
    content: await alice.nip44Encrypt(channelPubkey, JSON.stringify(router))
  })

  await assert.rejects(
    () => unwrapEvent({
      receiverSigner: bob,
      privateChannelSigner: alice,
      event: tampered,
      receiverPubkey: bobPubkey
    }),
    /invalid MAC/
  )
})

test('unwrapEvent rejects sender imkc rows without valid proofs', async () => {
  const alice = signer()
  const imkc = signer()
  const bob = signer()
  const bobPubkey = await bob.getPublicKey()
  const [wrapped] = await wrapEvent({
    senderSigner: alice,
    imkcSigner: imkc,
    receivers: [bobPubkey],
    event: eventFixture('private'),
    _getIykcProofs: noContentKeys
  })
  const channelPubkey = await alice.getPublicKey()
  const router = JSON.parse(await alice.nip44Decrypt(channelPubkey, wrapped.content))
  router.tags = router.tags.map(tag => tag[0] === 'imkc' ? ['imkc', tag[1]] : tag)
  const tampered = await alice.signEvent({
    kind: PRIVATE_BROADCAST_KIND,
    created_at: wrapped.created_at,
    tags: wrapped.tags,
    content: await alice.nip44Encrypt(channelPubkey, JSON.stringify(router))
  })

  await assert.rejects(
    () => unwrapEvent({
      receiverSigner: bob,
      privateChannelSigner: alice,
      event: tampered,
      receiverPubkey: bobPubkey
    }),
    /INVALID_IMKC_PROOF/
  )
})

test('subscribe emits content key usage for own sent direct messages', async () => {
  const originalSubscribeMany = pool.subscribeMany
  let handlers = null
  pool.subscribeMany = (_relays, _filter, nextHandlers) => {
    handlers = nextHandlers
    return { close: () => {} }
  }

  try {
    const alice = signer()
    const bob = signer()
    const bobPubkey = await bob.getPublicKey()
    const [wrapped] = await wrapEvent({
      senderSigner: alice,
      receivers: [bobPubkey],
      receiverTag: bobPubkey,
      event: eventFixture('private'),
      _getIykcProofs: noContentKeys
    })
    const usages = []
    const delivered = []

    subscribe({
      receiverSigner: alice,
      privateChannelSigner: alice,
      receiverPubkey: await alice.getPublicKey(),
      relays: ['wss://relay.example'],
      onContentKeyUsage: usage => usages.push(usage),
      onEvent: event => delivered.push(event)
    })
    await handlers.onevent(wrapped)

    assert.equal(usages.length, 1)
    assert.equal(usages[0].direction, 'sent')
    assert.equal(usages[0].senderPubkey, await alice.getPublicKey())
    assert.equal(usages[0].receiverPubkey, bobPubkey)
    assert.equal(usages[0].contentKeyPubkey, '')
    assert.equal(delivered.length, 0)
  } finally {
    pool.subscribeMany = originalSubscribeMany
  }
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

test('wrapEvent accepts explicit receiver content keys with valid proofs', async () => {
  const alice = signer()
  const bob = signer()
  const bobContent = signer()
  const bobPubkey = await bob.getPublicKey()
  const contentKey = parseContentKeyEvent(await makeContentKeyEvent({ userSigner: bob, contentKeySigner: bobContent, createdAt: 7 }))
  const original = eventFixture('private')
  const [wrapped] = await wrapEvent({
    senderSigner: alice,
    receivers: [[bobPubkey, contentKey.iykcPubkey, contentKey.iykcProof]],
    event: original,
    _getIykcProofs: noContentKeys
  })
  const router = JSON.parse(await alice.nip44Decrypt(await alice.getPublicKey(), wrapped.content))
  const line = JSON.parse(new TextDecoder().decode(Buffer.from(router.content, 'base64')).trim())

  assert.equal(line.length, 4)
  assert.deepEqual(await unwrapEvent({ receiverSigner: bob, iykcSigner: bobContent, privateChannelSigner: alice, event: wrapped, receiverPubkey: bobPubkey }), unwrappedFixture(original, await alice.getPublicKey()))
})

test('wrapEvent rejects explicit receiver content keys without valid proofs', async () => {
  const alice = signer()
  const bob = signer()
  const bobContent = signer()
  const bobPubkey = await bob.getPublicKey()
  const bobContentPubkey = await bobContent.getPublicKey()

  await assert.rejects(
    () => wrapEvent({
      senderSigner: alice,
      receivers: [[bobPubkey, bobContentPubkey]],
      event: eventFixture('private'),
      _getIykcProofs: noContentKeys
    }),
    /INVALID_IYKC_PROOF/
  )
})

test('unwrapEvent rejects receiver iykc rows without valid proofs', async () => {
  const alice = signer()
  const bob = signer()
  const bobContent = signer()
  const bobPubkey = await bob.getPublicKey()
  const contentKey = parseContentKeyEvent(await makeContentKeyEvent({ userSigner: bob, contentKeySigner: bobContent, createdAt: 7 }))
  const original = eventFixture('private')
  const [wrapped] = await wrapEvent({
    senderSigner: alice,
    receivers: [[bobPubkey, contentKey.iykcPubkey, contentKey.iykcProof]],
    event: original,
    _getIykcProofs: noContentKeys
  })
  const channelPubkey = await alice.getPublicKey()
  const router = JSON.parse(await alice.nip44Decrypt(channelPubkey, wrapped.content))
  const [receiverPubkey, ciphertext, iykcPubkey] = JSON.parse(new TextDecoder().decode(Buffer.from(router.content, 'base64')).trim())
  router.content = Buffer.from(`${JSON.stringify([receiverPubkey, ciphertext, iykcPubkey, '7:bad'])}\n`).toString('base64')
  const tampered = await alice.signEvent({
    kind: PRIVATE_BROADCAST_KIND,
    created_at: wrapped.created_at,
    tags: wrapped.tags,
    content: await alice.nip44Encrypt(channelPubkey, JSON.stringify(router))
  })

  await assert.rejects(
    () => unwrapEvent({ receiverSigner: bob, iykcSigner: bobContent, privateChannelSigner: alice, event: tampered, receiverPubkey: bobPubkey }),
    /INVALID_IYKC_PROOF/
  )
})

test('subscribe only emits receiver content key usage after iykc proof validation', async () => {
  const originalSubscribeMany = pool.subscribeMany
  let handlers = null
  pool.subscribeMany = (_relays, _filter, nextHandlers) => {
    handlers = nextHandlers
    return { close: () => {} }
  }

  try {
    const alice = signer()
    const bob = signer()
    const bobContent = signer()
    const bobPubkey = await bob.getPublicKey()
    const contentKey = parseContentKeyEvent(await makeContentKeyEvent({ userSigner: bob, contentKeySigner: bobContent, createdAt: 7 }))
    const [wrapped] = await wrapEvent({
      senderSigner: alice,
      receivers: [[bobPubkey, contentKey.iykcPubkey, contentKey.iykcProof]],
      event: eventFixture('private'),
      _getIykcProofs: noContentKeys
    })
    const channelPubkey = await alice.getPublicKey()
    const router = JSON.parse(await alice.nip44Decrypt(channelPubkey, wrapped.content))
    const [receiverPubkey, ciphertext, iykcPubkey] = JSON.parse(new TextDecoder().decode(Buffer.from(router.content, 'base64')).trim())
    router.content = Buffer.from(`${JSON.stringify([receiverPubkey, ciphertext, iykcPubkey, '7:bad'])}\n`).toString('base64')
    const tampered = await alice.signEvent({
      kind: PRIVATE_BROADCAST_KIND,
      created_at: wrapped.created_at,
      tags: wrapped.tags,
      content: await alice.nip44Encrypt(channelPubkey, JSON.stringify(router))
    })
    const usages = []
    const errors = []

    subscribe({
      privateChannelSigner: alice,
      receiverPubkey: bobPubkey,
      relays: ['wss://relay.example'],
      onContentKeyUsage: usage => usages.push(usage),
      onError: err => errors.push(err)
    })

    await handlers.onevent(tampered)

    assert.deepEqual(usages, [])
    assert.equal(errors.length, 1)
    assert.equal(errors[0].message, 'INVALID_IYKC_PROOF')
  } finally {
    pool.subscribeMany = originalSubscribeMany
  }
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
  assert.ok(routers[0].tags.find(t => t[0] === 'imkc')?.[2])
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

test('subscribe buffers out-of-order chunks and unwraps when the missing chunk arrives', async () => {
  const originalSubscribeMany = pool.subscribeMany
  let handlers = null
  pool.subscribeMany = (_relays, _filter, nextHandlers) => {
    handlers = nextHandlers
    return { close: () => {} }
  }

  try {
    const alice = signer()
    const bob = signer()
    const bobPubkey = await bob.getPublicKey()
    const original = eventFixture('x'.repeat(getJsonlChunkByteSize()))
    const wrapped = await wrapEvent({ senderSigner: alice, receivers: [bobPubkey], event: original, _getIykcProofs: noContentKeys })
    const events = []
    const chunks = []

    assert.ok(wrapped.length > 1)
    subscribe({
      receiverSigner: bob,
      privateChannelSigner: alice,
      receiverPubkey: bobPubkey,
      relays: ['wss://relay.example'],
      onChunk: chunk => chunks.push(chunk),
      onEvent: event => events.push(event),
      _getIykcProofs: noContentKeys
    })

    for (const event of wrapped.slice(1)) await handlers.onevent(event)

    assert.equal(events.length, 0)
    assert.ok(chunks.at(-1).missing.includes(0))

    await handlers.onevent(wrapped[0])

    assert.deepEqual(events, [unwrappedFixture(original, await alice.getPublicKey())])
  } finally {
    pool.subscribeMany = originalSubscribeMany
  }
})

test('subscribe drops invalid signed inner events and emits an error', async () => {
  const originalSubscribeMany = pool.subscribeMany
  let handlers = null
  pool.subscribeMany = (_relays, _filter, nextHandlers) => {
    handlers = nextHandlers
    return { close: () => {} }
  }

  try {
    const alice = signer()
    const bob = signer()
    const bobPubkey = await bob.getPublicKey()
    const signed = finalizeEvent({ kind: 9002, created_at: 2, tags: [], content: 'signed' }, generateSecretKey())
    const [wrapped] = await wrapEvent({
      senderSigner: alice,
      receivers: [bobPubkey],
      event: { ...signed, content: 'tampered' },
      _getIykcProofs: noContentKeys
    })
    const events = []
    const errors = []

    subscribe({
      receiverSigner: bob,
      privateChannelSigner: alice,
      receiverPubkey: bobPubkey,
      relays: ['wss://relay.example'],
      onEvent: event => events.push(event),
      onError: err => errors.push(err),
      _getIykcProofs: noContentKeys
    })

    await handlers.onevent(wrapped)
    await handlers.onevent(wrapped)

    assert.equal(events.length, 0)
    assert.equal(errors.length, 1)
    assert.equal(errors[0].message, 'INVALID_SIGNED_INNER_EVENT')
  } finally {
    pool.subscribeMany = originalSubscribeMany
  }
})

test('subscribe forgets ignored groups after their ttl', async () => {
  const originalSubscribeMany = pool.subscribeMany
  const originalNow = Date.now
  let handlers = null
  let now = 1000
  pool.subscribeMany = (_relays, _filter, nextHandlers) => {
    handlers = nextHandlers
    return { close: () => {} }
  }
  Date.now = () => now

  try {
    const alice = signer()
    const bob = signer()
    const bobPubkey = await bob.getPublicKey()
    const signed = finalizeEvent({ kind: 9002, created_at: 2, tags: [], content: 'signed' }, generateSecretKey())
    const [wrapped] = await wrapEvent({
      senderSigner: alice,
      receivers: [bobPubkey],
      event: { ...signed, content: 'tampered' },
      _getIykcProofs: noContentKeys
    })
    const errors = []

    subscribe({
      receiverSigner: bob,
      privateChannelSigner: alice,
      receiverPubkey: bobPubkey,
      relays: ['wss://relay.example'],
      ignoredGroupTtlMs: 5,
      onError: err => errors.push(err),
      _getIykcProofs: noContentKeys
    })

    await handlers.onevent(wrapped)
    now += 4
    await handlers.onevent(wrapped)
    now += 2
    await handlers.onevent(wrapped)

    assert.equal(errors.length, 2)
    assert.equal(errors[0].message, 'INVALID_SIGNED_INNER_EVENT')
    assert.equal(errors[1].message, 'INVALID_SIGNED_INNER_EVENT')
  } finally {
    Date.now = originalNow
    pool.subscribeMany = originalSubscribeMany
  }
})

test('subscribe evicts old ignored groups when the tombstone cache is full', async () => {
  const originalSubscribeMany = pool.subscribeMany
  let handlers = null
  pool.subscribeMany = (_relays, _filter, nextHandlers) => {
    handlers = nextHandlers
    return { close: () => {} }
  }

  try {
    const alice = signer()
    const bob = signer()
    const bobPubkey = await bob.getPublicKey()
    const signedA = finalizeEvent({ kind: 9002, created_at: 2, tags: [], content: 'a' }, generateSecretKey())
    const signedB = finalizeEvent({ kind: 9002, created_at: 3, tags: [], content: 'b' }, generateSecretKey())
    const [wrappedA] = await wrapEvent({
      senderSigner: alice,
      receivers: [bobPubkey],
      event: { ...signedA, content: 'tampered-a' },
      _getIykcProofs: noContentKeys
    })
    const [wrappedB] = await wrapEvent({
      senderSigner: alice,
      receivers: [bobPubkey],
      event: { ...signedB, content: 'tampered-b' },
      _getIykcProofs: noContentKeys
    })
    const errors = []

    subscribe({
      receiverSigner: bob,
      privateChannelSigner: alice,
      receiverPubkey: bobPubkey,
      relays: ['wss://relay.example'],
      ignoredGroupMaxEntries: 1,
      onError: err => errors.push(err),
      _getIykcProofs: noContentKeys
    })

    await handlers.onevent(wrappedA)
    await handlers.onevent(wrappedA)
    await handlers.onevent(wrappedB)
    await handlers.onevent(wrappedA)

    assert.equal(errors.length, 3)
    assert.ok(errors.every(err => err.message === 'INVALID_SIGNED_INNER_EVENT'))
  } finally {
    pool.subscribeMany = originalSubscribeMany
  }
})

test('received chunk store purges stale incomplete groups', () => {
  const originalNow = Date.now
  const storage = (() => {
    const data = new Map()
    return {
      clear: () => data.clear(),
      getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
      removeItem: key => { data.delete(String(key)) },
      setItem: (key, value) => { data.set(String(key), String(value)) },
      get length () { return data.size }
    }
  })()
  let now = 1000
  Date.now = () => now

  try {
    const store = createReceivedChunkStore({
      prefix: 'test:received-chunks',
      storageArea: storage,
      ttlMs: 5
    })
    store.put({
      channelPubkey: 'channel',
      routerPubkey: 'router',
      index: 1,
      total: 2,
      content: 'abc'
    })

    assert.ok(storage.length > 0)

    now += 6
    store.cleanupStale()

    assert.equal(storage.length, 0)
  } finally {
    Date.now = originalNow
  }
})

test('received chunk store resumes incremental parsing after reload', async () => {
  const storage = (() => {
    const data = new Map()
    return {
      clear: () => data.clear(),
      getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
      removeItem: key => { data.delete(String(key)) },
      setItem: (key, value) => { data.set(String(key), String(value)) },
      get length () { return data.size }
    }
  })()
  const line = `${JSON.stringify(['alice', 'ciphertext'])}\n`
  const first = line.slice(0, 12)
  const second = line.slice(12)
  const firstStore = createReceivedChunkStore({
    prefix: 'test:received-chunks:reload',
    storageArea: storage
  })
  const lines = []

  firstStore.put({
    channelPubkey: 'channel',
    routerPubkey: 'router',
    index: 0,
    total: 2,
    content: Buffer.from(first).toString('base64')
  })

  const firstDrain = await firstStore.drainAvailable('channel:router', { onLine: line => lines.push(line) })

  assert.equal(firstDrain.complete, false)
  assert.equal(firstDrain.meta.nextIndex, 1)
  assert.equal(firstDrain.meta.carry, first)
  assert.deepEqual(lines, [])

  const secondStore = createReceivedChunkStore({
    prefix: 'test:received-chunks:reload',
    storageArea: storage
  })
  secondStore.put({
    channelPubkey: 'channel',
    routerPubkey: 'router',
    index: 1,
    total: 2,
    content: Buffer.from(second).toString('base64')
  })

  const secondDrain = await secondStore.drainAvailable('channel:router', { onLine: line => lines.push(line) })

  assert.equal(secondDrain.complete, true)
  assert.deepEqual(lines, [line.trim()])
})
