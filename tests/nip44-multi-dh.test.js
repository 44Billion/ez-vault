import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import { run } from '../docs/services/signer.js'
import * as store from '../docs/services/accounts-store.js'
import * as secrets from '../docs/services/secrets.js'
import NsecSigner from '../docs/services/nsec-signer.js'
import { DEFAULT_STALE_CHANNEL_SECONDS } from '../docs/services/private-messenger/index.js'
import { bytesToHex, hexToBytes } from '../docs/helpers/nostr/index.js'

const CONTENT_KEYS_STORAGE_KEY = 'ez-vault:content-keys'

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

function addContentKey (ownerPubkey) {
  const secret = seckey()
  const pubkey = getPublicKey(hexToBytes(secret))
  secrets.setContentKeySecret(ownerPubkey, secret, nowSeconds())
  return { pubkey, secret }
}

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
    params: [{ peerPubkey: bob.pubkey, plaintext: 'hello bob' }],
    internals: { _getIykcProofs }
  })
  const decrypted = await run({
    pubkey: bob.pubkey,
    method: 'nip44DecryptMultiDH',
    params: [{
      peerPubkey: alice.pubkey,
      ciphertext: encrypted.ciphertext,
      ownContentPubkey: encrypted.receiverContentPubkey,
      peerContentPubkey: encrypted.senderContentPubkey
    }]
  })

  assert.equal(encrypted.mode, 'both-content')
  assert.equal(encrypted.senderContentPubkey, aliceContent.pubkey)
  assert.equal(encrypted.receiverContentPubkey, bobContent.pubkey)
  assert.equal(decrypted.plaintext, 'hello bob')
  assert.equal(decrypted.mode, 'both-content')
})

test('nip44-multi-dh self-encryption with content keys round-trips', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const aliceContent = addContentKey(alice.pubkey)
  const _getIykcProofs = async () => ({ [alice.pubkey]: { iykcPubkey: aliceContent.pubkey } })

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44EncryptMultiDH',
    params: [{ peerPubkey: alice.pubkey, plaintext: 'note to self' }],
    internals: { _getIykcProofs }
  })
  const decrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44DecryptMultiDH',
    params: [{
      peerPubkey: alice.pubkey,
      ciphertext: encrypted.ciphertext,
      ownContentPubkey: encrypted.receiverContentPubkey,
      peerContentPubkey: encrypted.senderContentPubkey
    }]
  })

  assert.equal(encrypted.mode, 'both-content')
  assert.equal(decrypted.plaintext, 'note to self')
})

test('nip44-multi-dh can opt out of content-key lookup', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const bob = addNsecAccount()

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44EncryptMultiDH',
    params: [{
      peerPubkey: bob.pubkey,
      plaintext: 'identity only',
      useOwnContentKey: false,
      usePeerContentKey: false
    }]
  })
  const decrypted = await run({
    pubkey: bob.pubkey,
    method: 'nip44DecryptMultiDH',
    params: [{ peerPubkey: alice.pubkey, ciphertext: encrypted.ciphertext }]
  })

  assert.equal(encrypted.mode, 'identity')
  assert.equal(encrypted.senderContentPubkey, '')
  assert.equal(encrypted.receiverContentPubkey, '')
  assert.equal(decrypted.plaintext, 'identity only')
})

test('signer.run normalizes snake_case multi-DH wire methods', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const bob = addNsecAccount()

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'nip44_encrypt_multi_dh',
    params: [{
      peerPubkey: bob.pubkey,
      plaintext: 'snake case',
      useOwnContentKey: false,
      usePeerContentKey: false
    }]
  })
  const decrypted = await run({
    pubkey: bob.pubkey,
    method: 'nip44_decrypt_multi_dh',
    params: [{ peerPubkey: alice.pubkey, ciphertext: encrypted.ciphertext }]
  })

  assert.equal(decrypted.plaintext, 'snake case')
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
    params: [{ peerPubkey: bob.pubkey, plaintext: 'hello bob' }],
    internals: {
      _getIykcProofs: async () => ({}),
      _upsertContentKeyEvent: async ({ contentKeySigner }) => {
        publishedContentPubkey = contentKeySigner.getPublicKey()
        return { result: { success: true } }
      }
    }
  })
  const accountBlob = secrets.sealCurrentEntries()

  assert.equal(encrypted.senderContentPubkey, publishedContentPubkey)
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
