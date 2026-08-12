import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import { bytesToBase64, base64ToBytes } from 'libp2r2p/base64'
import { hexToBytes } from 'libp2r2p/base16'
import { sharedXOnlySecret } from 'libp2r2p/ecdh'
import * as nip44v3 from 'libp2r2p/nip44-v3'
import { encodeTlv } from '../src/helpers/tlv.js'
import * as store from '../src/services/accounts-store.js'
import * as secrets from '../src/services/secrets.js'
import { decodeSecretEntries, encodeSecretEntries } from '../src/services/secret-blob.js'

const ACCOUNT = '11'.repeat(32)
const HANDLER = '22'.repeat(32)
const CLIENT = '33'.repeat(32)

afterEach(() => secrets.lock())

test('new bunker entries encode account, handler and client key in 96 bytes', () => {
  const encoded = encodeSecretEntries([{
    type: 'bunker',
    pubkey: ACCOUNT,
    handlerPubkey: HANDLER,
    clientKey: CLIENT
  }])

  assert.equal(encoded[0], 0x02)
  assert.equal(encoded[1], 96)
  assert.deepEqual(decodeSecretEntries(encoded), [{
    type: 'bunker',
    pubkey: ACCOUNT,
    handlerPubkey: HANDLER,
    clientKey: CLIENT
  }])
})

test('legacy 64-byte bunker entries remain readable and are identified for migration', () => {
  const value = new Uint8Array(64)
  value.set(hexToBytes(ACCOUNT), 0)
  value.set(hexToBytes(CLIENT), 32)

  assert.deepEqual(decodeSecretEntries(encodeTlv([[0x02, value]])), [{
    type: 'bunker',
    pubkey: ACCOUNT,
    clientKey: CLIENT,
    legacy: true
  }])
})

test('bunker entries with any other length are ignored', () => {
  assert.deepEqual(decodeSecretEntries(encodeTlv([[0x02, new Uint8Array(65)]])), [])
})

test('legacy handler migration is encoded before its plaintext account URL is removed', async () => {
  const value = new Uint8Array(64)
  value.set(hexToBytes(ACCOUNT), 0)
  value.set(hexToBytes(CLIENT), 32)
  const vaultKey = generateSecretKey()
  const conversationKey = sharedXOnlySecret(vaultKey, getPublicKey(vaultKey))
  const legacyCiphertext = nip44v3.encryptWithConversationKey(
    conversationKey,
    2,
    'vault-secrets-v1',
    bytesToBase64(encodeTlv([[0x02, value]]))
  )
  const bunker = `bunker://${HANDLER}?relay=${encodeURIComponent('wss://relay.example')}`
  await store.add({ type: 'bunker', pubkey: ACCOUNT, bunker, name: '', picture: '' })

  secrets.unlock(vaultKey, legacyCiphertext)
  assert.ok(secrets.getBunkerHandle(ACCOUNT))
  const migratedCiphertext = secrets.sealCurrentEntries()
  const migratedPlaintext = nip44v3.decryptWithConversationKey(
    conversationKey,
    2,
    'vault-secrets-v1',
    migratedCiphertext
  )
  assert.deepEqual(decodeSecretEntries(base64ToBytes(migratedPlaintext)), [{
    type: 'bunker',
    pubkey: ACCOUNT,
    handlerPubkey: HANDLER,
    clientKey: CLIENT
  }])
  assert.equal(store.get(ACCOUNT).bunker, bunker)

  await secrets.finalizeLegacyBunkerMigrations()
  assert.equal('bunker' in store.get(ACCOUNT), false)
  assert.deepEqual(store.get(ACCOUNT).bunkerRelays, ['wss://relay.example'])
})
