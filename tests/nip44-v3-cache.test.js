import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getPublicKey } from 'libp2r2p/key'
import { hexToBytes, bytesToHex } from 'libp2r2p/base16'
import { sharedXOnlySecret } from 'libp2r2p/ecdh'
import * as nip44v3 from 'libp2r2p/nip44-v3'
import NsecSigner from '../src/services/nsec-signer.js'

import { isolated, secret, encrypt } from './helpers/nsec-signer-realm.js'

test('conversation cache has per-signer/global LRU limits and zeroizes eviction and expiry', () => {
  const f = isolated(); const signer = f.Signer.getOrCreate(secret(1))
  for (let index = 0; index < 32; index++) encrypt(signer, `peer${index}`)
  encrypt(signer, 'peer0')
  encrypt(signer, 'peer32')
  assert.equal(f.keys.length, 33)
  assert.ok(f.keys[1].every(byte => byte === 0))
  assert.ok(f.keys[0].some(byte => byte === 7))
  for (let owner = 2; owner <= 5; owner++) for (let index = 0; index < 32; index++) encrypt(f.Signer.getOrCreate(secret(owner)), `peer${index}`)
  assert.equal(f.keys.filter(key => key.some(Boolean)).length, 128)
  f.advance(60000)
  assert.ok(f.keys.every(key => key.every(byte => byte === 0)))
  // Only the pre-existing ordinary NIP44 GC timers remain.
  assert.equal(f.timers.size, 5)
  f.Signer.releaseAll()
  assert.equal(f.timers.size, 0)
})

test('actual signer identity isolates peers, revocation includes derived signers and late derivations', async () => {
  let release
  const derivation = new Promise(resolve => { release = resolve })
  const f = isolated(() => derivation)
  const owner = f.Signer.getOrCreate(secret(1)); const other = f.Signer.getOrCreate(secret(3))
  encrypt(owner, 'peer'); encrypt(other, 'peer'); encrypt(owner, 'peer')
  assert.equal(f.keys.length, 2)
  const child = owner.withSharedKey('peer', 'dm')
  const work = child.nip44v3EncryptBytes('peer', 9, '', new Uint8Array())
  f.Signer.release(owner.getPublicKey())
  release(hexToBytes(secret(2)))
  await assert.rejects(work, /SIGNER_RELEASED/)
  assert.ok(f.keys[0].every(byte => byte === 0))
  assert.ok(f.keys[1].every(byte => byte === 0))
  encrypt(other, 'peer')
  assert.equal(f.keys.length, 3)
  assert.throws(() => encrypt(owner, 'peer'), /SIGNER_RELEASED/)
  f.Signer.releaseAll()

  const g = isolated(); const parent = g.Signer.getOrCreate(secret(1))
  await parent.withSharedKey('peer', 'dm').nip44v3EncryptBytes('peer', 9, '', new Uint8Array())
  g.Signer.release(parent.getPublicKey())
  assert.ok(g.keys.every(key => key.every(byte => byte === 0)))
  g.Signer.releaseAll()
})

test('real cached encryption keeps fresh nonces, scopes and protocol separation without exposing keys', () => {
  const signer = NsecSigner.getOrCreate(secret(1)); const peer = getPublicKey(hexToBytes(secret(2)))
  try {
    const plain = new TextEncoder().encode('private bytes')
    const first = signer.nip44v3EncryptBytes(peer, 9, 'scope', plain)
    const second = signer.nip44v3EncryptBytes(peer, 9, 'scope', plain)
    assert.notEqual(first, second)
    assert.deepEqual(signer.nip44v3DecryptBytes(peer, 9, 'scope', first), plain)
    assert.throws(() => signer.nip44v3DecryptBytes(peer, 9, 'other', first))
    assert.deepEqual(Reflect.ownKeys(signer), [])
    assert.throws(() => { signer.leak = () => {} })
    assert.throws(() => { NsecSigner.prototype.nip44v3EncryptBytes = () => {} })
    assert.equal(typeof first, 'string')
    const v2 = signer.nip44Encrypt(peer, 'ordinary')
    assert.equal(signer.nip44Decrypt(peer, v2), 'ordinary')
    assert.throws(() => signer.nip44v3DecryptBytes(peer, 9, '', v2))
  } finally { NsecSigner.releaseAll() }
})

test('pagehide zeroizes cache without exposing buffers to patched fill and pageshow permits fresh work', () => {
  const f = isolated(); const signer = f.Signer.getOrCreate(secret(1))
  encrypt(signer, 'peer')
  f.keys[0].fill = () => assert.fail('cleanup must use its captured native reference')
  f.listeners.get('pagehide')()
  assert.ok(f.keys[0].every(byte => byte === 0))
  assert.throws(() => encrypt(signer, 'peer'), /SIGNER_RELEASED/)
  f.listeners.get('pageshow')()
  encrypt(signer, 'peer')
  assert.equal(f.keys.length, 2)
  f.Signer.releaseAll()
})

test('the cached primitive matches controlled-nonce upstream vectors and ignores patched crypto entry points', () => {
  const vectors = JSON.parse(readFileSync(new URL('./fixtures/nip44v3-vectors.json', import.meta.url), 'utf8'))
  for (const vector of vectors.encrypt_decrypt.filter(value => value.scope_hex === '')) {
    const crypto = { ...nip44v3, encryptWithConversationKeyBytes: (key, kind, scope, bytes) => nip44v3.encryptWithConversationKeyBytes(key, kind, scope, bytes, hexToBytes(vector.nonce)) }
    const f = isolated(undefined, { sharedXOnlySecret, nip44v3: crypto })
    const signer = f.Signer.getOrCreate(vector.secret1)
    crypto.encryptWithConversationKeyBytes = () => assert.fail('must not expose the cached key to patched crypto')
    try {
      const ciphertext = signer.nip44v3EncryptBytes(getPublicKey(hexToBytes(vector.secret2)), vector.kind, '', hexToBytes(vector.plaintext_hex))
      assert.equal(ciphertext, vector.ciphertext)
      assert.equal(bytesToHex(signer.nip44v3DecryptBytes(getPublicKey(hexToBytes(vector.secret2)), vector.kind, '', ciphertext)), vector.plaintext_hex)
    } finally { f.Signer.releaseAll() }
  }
})

test('revoking a parent purges shared derived cache while preserving an independently authorized identity', async () => {
  const f = isolated()
  const parent = f.Signer.getOrCreate(secret(1))
  const independent = f.Signer.getOrCreate(secret(2))
  const scoped = parent.withSharedKey('peer', 'dm')
  await scoped.nip44v3EncryptBytes('peer', 9, '', new Uint8Array())
  assert.equal(f.keys.length, 1)
  f.Signer.release(parent.getPublicKey())
  assert.ok(f.keys[0].every(byte => byte === 0))
  await assert.rejects(scoped.nip44v3EncryptBytes('peer', 9, '', new Uint8Array()), /SIGNER_RELEASED/)
  encrypt(independent, 'peer')
  assert.equal(f.keys.length, 2)
  f.Signer.releaseAll()
})

test('subsequent revocation still purges keys derived by another authorized owner', async () => {
  const f = isolated(async bytes => hexToBytes(secret(bytes[31] + 1)))
  const parent = f.Signer.getOrCreate(secret(1))
  const independent = f.Signer.getOrCreate(secret(2))
  const child = parent.withSharedKey('peer', 'dm')
  await child.nip44v3EncryptBytes('peer', 9, '', new Uint8Array())
  const grandchild = independent.withSharedKey('peer', 'dm')
  await grandchild.nip44v3EncryptBytes('peer', 9, '', new Uint8Array())
  f.Signer.release(parent.getPublicKey())
  assert.ok(f.keys.every(key => key.every(byte => byte === 0)))
  await grandchild.nip44v3EncryptBytes('peer', 9, '', new Uint8Array())
  f.Signer.release(independent.getPublicKey())
  assert.ok(f.keys.every(key => key.every(byte => byte === 0)))
  f.Signer.releaseAll()
})

test('the first use after OS sleep expires idle keys even if the monotonic clock was suspended', () => {
  const f = isolated(); const signer = f.Signer.getOrCreate(secret(1))
  encrypt(signer, 'peer')
  f.suspend(60000)
  encrypt(signer, 'peer')
  assert.equal(f.keys.length, 2)
  assert.ok(f.keys[0].every(byte => byte === 0))
  f.Signer.releaseAll()
})

test('a pinned operation owns a private copy, survives cache purge and zeroizes that copy before returning', () => {
  let selected
  const f = isolated(undefined, {
    nip44v3: {
      toBytes: () => new Uint8Array(), encryptWithConversationKeyBytes: key => {
        selected = key
        f.Signer.release(signer.getPublicKey())
        assert.ok(f.keys.every(bytes => bytes.every(byte => byte === 0)))
        assert.ok(key.every(byte => byte === 7), 'purging the cache must not change a key already selected by crypto')
        return 'ciphertext'
      }
    }
  })
  const signer = f.Signer.getOrCreate(secret(1))
  assert.equal(encrypt(signer, 'peer'), 'ciphertext')
  assert.ok(selected.every(byte => byte === 0))
  f.Signer.releaseAll()
})
