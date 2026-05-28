import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import { run } from '../docs/services/nostrvault.js'
import * as store from '../docs/services/accounts-store.js'
import * as secrets from '../docs/services/secrets.js'
import NsecSigner from '../docs/services/nsec-signer.js'
import { bytesToHex, hexToBytes } from '../docs/helpers/nostr/index.js'

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
  secrets.setContentKeySecret(ownerPubkey, secret, 7)
  return { pubkey, secret }
}

test('nostrvault encrypt/decrypt uses advertised content keys', async () => {
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
    method: 'encrypt',
    params: [{ peerPubkey: bob.pubkey, plaintext: 'hello bob' }],
    internals: { _getIykcProofs }
  })
  const decrypted = await run({
    pubkey: bob.pubkey,
    method: 'decrypt',
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

test('nostrvault self-encryption with content keys round-trips', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const aliceContent = addContentKey(alice.pubkey)
  const _getIykcProofs = async () => ({ [alice.pubkey]: { iykcPubkey: aliceContent.pubkey } })

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'encrypt',
    params: [{ peerPubkey: alice.pubkey, plaintext: 'note to self' }],
    internals: { _getIykcProofs }
  })
  const decrypted = await run({
    pubkey: alice.pubkey,
    method: 'decrypt',
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

test('nostrvault can opt out of content-key lookup', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const bob = addNsecAccount()

  const encrypted = await run({
    pubkey: alice.pubkey,
    method: 'encrypt',
    params: [{
      peerPubkey: bob.pubkey,
      plaintext: 'identity only',
      useOwnContentKey: false,
      usePeerContentKey: false
    }]
  })
  const decrypted = await run({
    pubkey: bob.pubkey,
    method: 'decrypt',
    params: [{ peerPubkey: alice.pubkey, ciphertext: encrypted.ciphertext }]
  })

  assert.equal(encrypted.mode, 'identity')
  assert.equal(encrypted.senderContentPubkey, '')
  assert.equal(encrypted.receiverContentPubkey, '')
  assert.equal(decrypted.plaintext, 'identity only')
})
