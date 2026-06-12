import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getEventHash, getPublicKey, verifyEvent } from 'nostr-tools'
import { run } from '../docs/services/signer.js'
import * as store from '../docs/services/accounts-store.js'
import * as secrets from '../docs/services/secrets.js'
import NsecSigner from '../docs/services/nsec-signer.js'
import { DEFAULT_STALE_CHANNEL_SECONDS } from '../docs/services/private-messenger/index.js'
import { bytesToHex, hexToBytes } from '../docs/helpers/nostr/index.js'

const CONTENT_KEYS_STORAGE_KEY = 'ez-vault:content-keys'
const MULTI_DH_KIND = 263
const MULTI_DH_SCOPE = ''

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
  secrets.lock()
  NsecSigner.releaseAll()
  globalThis.localStorage.clear()
})

function seckey () {
  return bytesToHex(generateSecretKey())
}

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function staleCreatedAt (offset = 0) {
  return nowSeconds() - DEFAULT_STALE_CHANNEL_SECONDS - offset
}

function addNsecAccount () {
  const secret = seckey()
  const pubkey = getPublicKey(hexToBytes(secret))
  store.add({ type: 'nsec', pubkey, name: '', picture: '' })
  secrets.setNsecSecret(pubkey, secret)
  return { pubkey, secret }
}

function addBunkerAccount (handle = null) {
  const secret = seckey()
  const pubkey = getPublicKey(hexToBytes(secret))
  store.add({ type: 'bunker', pubkey, name: '', picture: '', bunker: `bunker://${pubkey}` })
  if (handle) secrets.adoptBunkerHandle(pubkey, handle, seckey())
  return { pubkey }
}

function addContentKey (ownerPubkey) {
  const secret = seckey()
  const pubkey = getPublicKey(hexToBytes(secret))
  secrets.setContentKeySecret(ownerPubkey, secret, nowSeconds())
  return { pubkey, secret }
}

function textToBase64 (text) {
  return Buffer.from(text).toString('base64')
}

function base64ToText (text) {
  return Buffer.from(text, 'base64').toString()
}

test('signer.run delegates bunker extended signer methods to the handle', async () => {
  secrets.unlock(generateSecretKey(), null)
  const calls = []
  const shared = { getPublicKey: () => 'shared-pubkey' }
  const fakeHandle = {
    nip44v3Encrypt: async (...args) => {
      calls.push({ method: 'nip44v3Encrypt', args })
      return 'v3-ciphertext'
    },
    nip44v3Decrypt: async (...args) => {
      calls.push({ method: 'nip44v3Decrypt', args })
      return 'plaintext-b64'
    },
    nip44EncryptMultiDH: async (...args) => {
      calls.push({ method: 'nip44EncryptMultiDH', args })
      return ['multi-ciphertext', 'sender-content']
    },
    nip44DecryptMultiDH: async (...args) => {
      calls.push({ method: 'nip44DecryptMultiDH', args })
      return 'multi-plain-b64'
    },
    doubleSignEvent: async event => {
      calls.push({ method: 'doubleSignEvent', event })
      return { id: 'signed-id' }
    },
    withSharedKey: (peerPubkey, info) => {
      calls.push({ method: 'withSharedKey', args: [peerPubkey, info] })
      return shared
    },
    close: async () => {}
  }
  const bunker = addBunkerAccount(fakeHandle)
  const multiEncryptParams = ['peer', 263, '', 'plain-b64', 'peer-content']
  const multiDecryptParams = ['peer', 263, '', 'cipher', 'peer-content', 'own-content']
  const event = { kind: 1, tags: [], content: 'x' }

  assert.equal(await run({ pubkey: bunker.pubkey, method: 'nip44v3_encrypt', params: ['peer', 3560, '', 'plain-b64'] }), 'v3-ciphertext')
  assert.equal(await run({ pubkey: bunker.pubkey, method: 'nip44v3_decrypt', params: ['peer', 3560, '', 'cipher'] }), 'plaintext-b64')
  assert.deepEqual(await run({ pubkey: bunker.pubkey, method: 'nip44v3_encrypt_multi_dh', params: multiEncryptParams }), ['multi-ciphertext', 'sender-content'])
  assert.equal(await run({ pubkey: bunker.pubkey, method: 'nip44v3_decrypt_multi_dh', params: multiDecryptParams }), 'multi-plain-b64')
  assert.deepEqual(await run({ pubkey: bunker.pubkey, method: 'double_sign_event', params: [event] }), { id: 'signed-id' })
  assert.equal(await run({ pubkey: bunker.pubkey, method: 'get_public_key', params: [], withSharedKey: ['peer', 'info'] }), 'shared-pubkey')

  assert.deepEqual(calls, [
    { method: 'nip44v3Encrypt', args: ['peer', 3560, '', 'plain-b64'] },
    { method: 'nip44v3Decrypt', args: ['peer', 3560, '', 'cipher'] },
    { method: 'nip44EncryptMultiDH', args: multiEncryptParams },
    { method: 'nip44DecryptMultiDH', args: multiDecryptParams },
    { method: 'doubleSignEvent', event },
    { method: 'withSharedKey', args: ['peer', 'info'] }
  ])
})

test('nip44-multi-dh encrypt/decrypt uses advertised content keys', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const bob = addNsecAccount()
  const aliceContent = addContentKey(alice.pubkey)
  const bobContent = addContentKey(bob.pubkey)
  const _getIykcProofs = async pubkeys => Object.fromEntries(pubkeys.map(pubkey => [
    pubkey,
    { iykcPubkey: pubkey === alice.pubkey ? aliceContent.pubkey : bobContent.pubkey }
  ]))

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44EncryptMultiDH',
    params: [bob.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, textToBase64('hello bob'), bobContent.pubkey],
    internals: { _getIykcProofs }
  })
  const decrypted = await run({
    pubkey: bob.pubkey,
    method: 'nip44DecryptMultiDH',
    params: [alice.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, encrypted[0], encrypted[1], bobContent.pubkey]
  })

  assert.deepEqual(encrypted.slice(1), [aliceContent.pubkey])
  assert.equal(base64ToText(decrypted), 'hello bob')
  await assert.rejects(
    () => run({
      pubkey: bob.pubkey,
      method: 'nip44DecryptMultiDH',
      params: [alice.pubkey, MULTI_DH_KIND + 1, MULTI_DH_SCOPE, encrypted[0], encrypted[1], bobContent.pubkey]
    }),
    /kind mismatch/
  )
})

test('nip44-multi-dh self-encryption with content keys round-trips', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const aliceContent = addContentKey(alice.pubkey)
  const _getIykcProofs = async () => ({ [alice.pubkey]: { iykcPubkey: aliceContent.pubkey } })

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44EncryptMultiDH',
    params: [alice.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, textToBase64('note to self'), aliceContent.pubkey],
    internals: { _getIykcProofs }
  })
  const decrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44DecryptMultiDH',
    params: [alice.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, encrypted[0], encrypted[1], aliceContent.pubkey]
  })

  assert.deepEqual(encrypted.slice(1), [aliceContent.pubkey])
  assert.equal(base64ToText(decrypted), 'note to self')
})

test('nip44-multi-dh decrypt resolves older stored own content keys by pubkey', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const bob = addNsecAccount()
  const olderSecret = seckey()
  const newerSecret = seckey()
  const olderPubkey = getPublicKey(hexToBytes(olderSecret))
  const newerPubkey = getPublicKey(hexToBytes(newerSecret))
  const now = nowSeconds()
  secrets.setContentKeySecret(bob.pubkey, olderSecret, now - 10)
  secrets.setContentKeySecret(bob.pubkey, newerSecret, now)

  const aliceSigner = secrets.getNsecSigner(alice.pubkey)
  const bobSigner = secrets.getNsecSigner(bob.pubkey)
  const encrypted = await aliceSigner.nip44EncryptMultiDH(bob.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, textToBase64('old key message'), olderPubkey)
  const decrypted = await bobSigner.nip44DecryptMultiDH(alice.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, encrypted[0], encrypted[1], olderPubkey)

  assert.equal(secrets.getLatestContentKeySigner(bob.pubkey).getPublicKey(), newerPubkey)
  assert.equal(base64ToText(decrypted), 'old key message')
})

test('nip44-multi-dh returns the sender content key when no peer content key is provided', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const bob = addNsecAccount()

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44EncryptMultiDH',
    params: [bob.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, textToBase64('identity only')]
  })
  const decrypted = await run({
    pubkey: bob.pubkey,
    method: 'nip44DecryptMultiDH',
    params: [alice.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, encrypted[0], encrypted[1]]
  })

  assert.ok(encrypted[1])
  assert.equal(base64ToText(decrypted), 'identity only')
})

test('signer.run normalizes snake_case multi-DH wire methods', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const bob = addNsecAccount()

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44v3_encrypt_multi_dh',
    params: [bob.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, textToBase64('snake case')]
  })
  const decrypted = await run({
    pubkey: bob.pubkey,
    method: 'nip44v3_decrypt_multi_dh',
    params: [alice.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, encrypted[0], encrypted[1]]
  })

  assert.equal(base64ToText(decrypted), 'snake case')
})

test('signer.run doubleSignEvent signs with identity and local content key', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const aliceContent = addContentKey(alice.pubkey)
  let publishCalls = 0
  const event = {
    kind: 1,
    pubkey: 'f'.repeat(64),
    id: 'e'.repeat(64),
    sig: 'd'.repeat(128),
    created_at: 9,
    tags: [['p', 'peer'], ['imkc', 'old'], ['x', 'kept']],
    content: 'clear text'
  }

  const signed = await run({
    pubkey: alice.pubkey,
    method: 'doubleSignEvent',
    params: [event],
    internals: {
      _getIykcProofs: async () => ({ [alice.pubkey]: { iykcPubkey: aliceContent.pubkey } }),
      _upsertContentKeyEvent: async () => {
        publishCalls++
        return { result: { success: true } }
      }
    }
  })
  const imkcTag = signed.tags.find(tag => tag[0] === 'imkc')
  const proofEvent = {
    kind: signed.kind,
    pubkey: aliceContent.pubkey,
    created_at: signed.created_at,
    tags: signed.tags.map(tag => tag[0] === 'imkc' ? ['imkc', aliceContent.pubkey] : [...tag]),
    content: signed.content,
    sig: imkcTag[2]
  }
  proofEvent.id = getEventHash(proofEvent)

  assert.equal(signed.pubkey, alice.pubkey)
  assert.deepEqual(imkcTag.slice(0, 2), ['imkc', aliceContent.pubkey])
  assert.equal(event.tags[1][1], 'old')
  assert.equal(verifyEvent(proofEvent), true)
  assert.equal(verifyEvent(signed), true)
  assert.equal(publishCalls, 0)
})

test('signer.run doubleSignEvent creates and publishes a missing content key', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  let publishedContentPubkey = ''
  const event = {
    kind: 1,
    pubkey: 'f'.repeat(64),
    id: 'e'.repeat(64),
    sig: 'd'.repeat(128),
    created_at: 9,
    tags: [['p', 'peer']],
    content: 'clear text'
  }

  const signed = await run({
    pubkey: alice.pubkey,
    method: 'doubleSignEvent',
    params: [event],
    internals: {
      _getIykcProofs: async () => ({}),
      _upsertContentKeyEvent: async ({ contentKeySigner }) => {
        publishedContentPubkey = contentKeySigner.getPublicKey()
        return { result: { success: true } }
      }
    }
  })
  const imkcTag = signed.tags.find(tag => tag[0] === 'imkc')

  assert.ok(publishedContentPubkey)
  assert.deepEqual(imkcTag.slice(0, 2), ['imkc', publishedContentPubkey])
  assert.ok(secrets.getContentKeySigner(alice.pubkey, publishedContentPubkey))
  assert.equal(verifyEvent(signed), true)
})

test('signer.run doubleSignEvent rejects when a missing content key cannot be published', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const event = {
    kind: 1,
    pubkey: 'f'.repeat(64),
    id: 'e'.repeat(64),
    sig: 'd'.repeat(128),
    created_at: 9,
    tags: [['p', 'peer']],
    content: 'clear text'
  }

  await assert.rejects(
    () => run({
      pubkey: alice.pubkey,
      method: 'doubleSignEvent',
      params: [event],
      internals: {
        _getIykcProofs: async () => ({}),
        _upsertContentKeyEvent: async () => ({ result: { success: false } })
      }
    }),
    /CONTENT_KEY_PUBLISH_FAILED/
  )
})

test('nip44-multi-dh creates own content keys in encrypted localStorage', async () => {
  const vaultKey = generateSecretKey()
  secrets.unlock(vaultKey, null)
  const alice = addNsecAccount()
  const bob = addNsecAccount()
  let publishedContentPubkey = ''

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44EncryptMultiDH',
    params: [bob.pubkey, MULTI_DH_KIND, MULTI_DH_SCOPE, textToBase64('hello bob')],
    internals: {
      _getIykcProofs: async () => ({}),
      _upsertContentKeyEvent: async ({ contentKeySigner }) => {
        publishedContentPubkey = contentKeySigner.getPublicKey()
        return { result: { success: true } }
      }
    }
  })
  const accountBlob = secrets.sealCurrentEntries()

  assert.equal(encrypted[1], publishedContentPubkey)
  assert.ok(globalThis.localStorage.getItem(CONTENT_KEYS_STORAGE_KEY))

  secrets.lock()
  secrets.unlock(vaultKey, accountBlob)
  assert.ok(secrets.getContentKeySigner(alice.pubkey, publishedContentPubkey))
})

test('content keys persist in vault-key encrypted localStorage, not the largeBlob blob', async () => {
  const vaultKey = generateSecretKey()
  secrets.unlock(vaultKey, null)
  const alice = addNsecAccount()
  const aliceContent = addContentKey(alice.pubkey)
  const accountBlob = secrets.sealCurrentEntries()
  const sealedContentKeys = globalThis.localStorage.getItem(CONTENT_KEYS_STORAGE_KEY)

  assert.ok(sealedContentKeys)
  assert.equal(sealedContentKeys.includes(aliceContent.secret), false)

  secrets.lock()
  secrets.unlock(vaultKey, accountBlob)
  assert.ok(secrets.getContentKeySigner(alice.pubkey, aliceContent.pubkey))

  globalThis.localStorage.removeItem(CONTENT_KEYS_STORAGE_KEY)
  secrets.lock()
  secrets.unlock(vaultKey, accountBlob)
  assert.equal(secrets.getContentKeySigner(alice.pubkey, aliceContent.pubkey), null)
})

test('deleting an account purges its persisted content keys', () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  addContentKey(alice.pubkey)

  assert.ok(globalThis.localStorage.getItem(CONTENT_KEYS_STORAGE_KEY))
  secrets.deleteSecret(alice.pubkey)
  assert.equal(globalThis.localStorage.getItem(CONTENT_KEYS_STORAGE_KEY), null)
})

test('stale content keys are pruned once a newer key is stored', () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const staleSecret = seckey()
  const stalePubkey = getPublicKey(hexToBytes(staleSecret))
  const freshSecret = seckey()
  const freshPubkey = getPublicKey(hexToBytes(freshSecret))

  assert.ok(secrets.setContentKeySecret(alice.pubkey, staleSecret, staleCreatedAt(5)))
  assert.ok(secrets.getContentKeySigner(alice.pubkey, stalePubkey))

  assert.ok(secrets.setContentKeySecret(alice.pubkey, freshSecret, nowSeconds()))

  assert.equal(secrets.getContentKeySigner(alice.pubkey, stalePubkey), null)
  assert.ok(secrets.getContentKeySigner(alice.pubkey, freshPubkey))
  assert.deepEqual(secrets.listContentKeys(alice.pubkey).map(key => key.pubkey), [freshPubkey])
})

test('content key replacement rotates the owner to the new persisted key', () => {
  const vaultKey = generateSecretKey()
  secrets.unlock(vaultKey, null)
  const alice = addNsecAccount()
  const oldContent = addContentKey(alice.pubkey)
  const newSecret = seckey()
  const newPubkey = getPublicKey(hexToBytes(newSecret))

  secrets.replaceContentKeySecret(alice.pubkey, newSecret, 8)
  const accountBlob = secrets.sealCurrentEntries()

  assert.equal(secrets.getContentKeySigner(alice.pubkey, oldContent.pubkey), null)
  assert.equal(secrets.getLatestContentKeySigner(alice.pubkey)?.getPublicKey(), newPubkey)

  secrets.lock()
  secrets.unlock(vaultKey, accountBlob)
  assert.equal(secrets.getContentKeySigner(alice.pubkey, oldContent.pubkey), null)
  assert.equal(secrets.getLatestContentKeySigner(alice.pubkey)?.getPublicKey(), newPubkey)
})
