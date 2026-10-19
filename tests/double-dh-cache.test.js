import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPublicKey } from 'libp2r2p/key'
import { hexToBytes } from 'libp2r2p/base16'
import { deriveDoubleDhConversationKey } from 'libp2r2p/double-dh'
import * as nip44v3 from 'libp2r2p/nip44-v3'
import NsecSigner from '../src/services/nsec-signer.js'
import { isolated, secret, encrypt } from './helpers/nsec-signer-realm.js'

const pub = n => getPublicKey(hexToBytes(secret(n)))
const plain = new TextEncoder().encode('private DoubleDH bytes')
function setup (overrides) {
  const f = isolated(undefined, overrides)
  const owner = f.Signer.getOrCreate(secret(1))
  const content = f.Signer.getOrCreate(secret(3))
  f.Signer.setContentSigners(owner, [content], content)
  return { ...f, owner, content }
}
const send = (signer, kind = 9, scope = 'dm', peerContent = pub(4)) => signer.nip44EncryptDoubleDHBytes(pub(2), kind, scope, plain, peerContent)

test('DoubleDH hits skip derivation and isolate kind, scope, role, peer and both content keys', async () => {
  const f = setup()
  try {
    await send(f.owner); await send(f.owner)
    assert.equal(f.doubleCalls.length, 1)
    await send(f.owner, 1063); await send(f.owner, 9, 'other'); await send(f.owner, 9, 'dm', pub(5))
    await f.owner.nip44EncryptDoubleDHBytes(pub(6), 9, 'dm', plain, pub(4))
    await f.owner.nip44DecryptDoubleDHBytes(pub(2), 9, 'dm', 'ciphertext', pub(4), pub(3))
    assert.equal(f.doubleCalls.length, 6)
    await f.owner.nip44DecryptDoubleDHBytes(pub(2), 9, 'dm', 'ciphertext', pub(4), pub(3))
    assert.equal(f.doubleCalls.length, 6)
    const other = f.Signer.getOrCreate(secret(7))
    f.Signer.setContentSigners(other, [f.content], f.content)
    await send(other)
    assert.equal(f.doubleCalls.length, 7)
    encrypt(f.owner, pub(2)); encrypt(f.owner, pub(2))
    assert.equal(f.keys.length, 1, 'common v3 retains its own derivation')
    assert.deepEqual(Reflect.ownKeys(f.owner), [])
    assert.throws(() => { f.owner.cachedKey = f.doubleKeys[0] })
  } finally { f.Signer.releaseAll() }
})

test('no-op bindings retain hits; rotation purges DoubleDH while historical authorized keys still decrypt', async () => {
  const f = setup()
  try {
    encrypt(f.owner, pub(2)); await send(f.owner)
    f.Signer.setContentSigners(f.owner, [f.content], f.content)
    await send(f.owner)
    assert.equal(f.doubleKeys.length, 1)
    const next = f.Signer.getOrCreate(secret(5))
    f.Signer.setContentSigners(f.owner, [f.content, next], next)
    assert.ok(f.doubleKeys[0].every(byte => byte === 0))
    assert.ok(f.keys[0].some(Boolean), 'rotation does not discard common v3 entries')
    const [, selected] = await send(f.owner)
    assert.equal(selected, pub(5))
    await f.owner.nip44DecryptDoubleDHBytes(pub(2), 9, 'dm', 'ciphertext', pub(4), pub(3))
    assert.equal(f.doubleKeys.length, 3)
    f.Signer.setContentSigners(f.owner, [next], next)
    await assert.rejects(f.owner.nip44DecryptDoubleDHBytes(pub(2), 9, 'dm', 'ciphertext', pub(4), pub(3)), /RECEIVER_CONTENT_KEY_REQUIRED/)
    assert.ok(f.doubleKeys.every(key => key.every(byte => byte === 0)))
  } finally { f.Signer.releaseAll() }
})

test('both protocols share the 32-per-signer and 128-total limits, expiry timer and zeroization', async () => {
  const f = isolated()
  const content = f.Signer.getOrCreate(secret(20))
  const owners = Array.from({ length: 5 }, (_, i) => f.Signer.getOrCreate(secret(i + 1)))
  for (const owner of owners) f.Signer.setContentSigners(owner, [content], content)
  try {
    for (const owner of owners) {
      for (let i = 0; i < 16; i++) {
        encrypt(owner, `peer${i}`)
        await send(owner, i)
      }
    }
    const buffers = [...f.keys, ...f.doubleKeys]
    assert.equal(buffers.filter(key => key.some(Boolean)).length, 128)
    for (let i = 0; i < 17; i++) await send(owners[4], i + 100)
    assert.equal([...f.keys, ...f.doubleKeys].filter(key => key.some(Boolean)).length, 128)
    assert.equal(f.timers.size, 7, 'six signer GC timers and one shared cache timer')
    f.advance(60000)
    assert.ok([...f.keys, ...f.doubleKeys].every(key => key.every(byte => byte === 0)))
    assert.equal(f.timers.size, 6)
  } finally { f.Signer.releaseAll() }
  assert.equal(f.timers.size, 0)
})

test('DoubleDH LRU refresh and OS-sleep expiry discard and zeroize the actual least-recent entry', async () => {
  const f = setup()
  try {
    for (let i = 0; i < 32; i++) await send(f.owner, i)
    await send(f.owner, 0)
    await send(f.owner, 32)
    assert.ok(f.doubleKeys[0].some(Boolean))
    assert.ok(f.doubleKeys[1].every(byte => byte === 0))
    f.suspend(60000)
    await send(f.owner, 0)
    assert.equal(f.doubleKeys.length, 34)
    assert.ok(f.doubleKeys.slice(0, 33).every(key => key.every(byte => byte === 0)))
  } finally { f.Signer.releaseAll() }
})

test('controlled-nonce cached bytes match direct derivation for all content-key modes', async () => {
  const nonce = new Uint8Array(32).fill(17)
  const crypto = { ...nip44v3, encryptWithConversationKeyBytes: (key, kind, scope, bytes) => nip44v3.encryptWithConversationKeyBytes(key, kind, scope, bytes, nonce) }
  const f = isolated(undefined, { nip44v3: crypto })
  // The real primitive remains bound even if the import object is later patched.
  crypto.encryptWithConversationKeyBytes = () => assert.fail('patched encryption must not receive a cached key')
  const owner = f.Signer.getOrCreate(secret(1)); const receiver = f.Signer.getOrCreate(secret(2))
  const own = f.Signer.getOrCreate(secret(3)); const peer = f.Signer.getOrCreate(secret(4))
  try {
    for (const [ownKey, peerKey] of [[own, peer], [own, null], [null, peer]]) {
      f.Signer.setContentSigners(owner, ownKey ? [ownKey] : [], ownKey)
      f.Signer.setContentSigners(receiver, peerKey ? [peerKey] : [], peerKey)
      const material = { role: 'sender', identitySecretKey: hexToBytes(secret(1)), identityPubkey: pub(1), contentSecretKey: ownKey ? hexToBytes(secret(3)) : null, contentPubkey: ownKey ? pub(3) : '', peerIdentityPubkey: pub(2), peerContentPubkey: peerKey ? pub(4) : '', kind: 26300, scope: 'channel' }
      const { conversationKey } = deriveDoubleDhConversationKey(material)
      const expected = nip44v3.encryptWithConversationKeyBytes(conversationKey, 26300, nip44v3.toBytes('channel'), plain, nonce)
      try {
        for (let i = 0; i < 2; i++) {
          const [cipher, selected] = await owner.nip44EncryptDoubleDHBytes(pub(2), 26300, 'channel', plain, material.peerContentPubkey)
          assert.equal(cipher, expected)
          assert.deepEqual(await receiver.nip44DecryptDoubleDHBytes(pub(1), 26300, 'channel', cipher, selected, material.peerContentPubkey), plain)
        }
      } finally { conversationKey.fill(0) }
    }
  } finally { f.Signer.releaseAll() }
})

test('normal DoubleDH encryption has fresh nonces, identity fallback and self-encryption remain compatible', async () => {
  const owner = NsecSigner.getOrCreate(secret(1)); const receiver = NsecSigner.getOrCreate(secret(2))
  const own = NsecSigner.getOrCreate(secret(3)); const peer = NsecSigner.getOrCreate(secret(4))
  try {
    NsecSigner.setContentSigners(owner, [own], own); NsecSigner.setContentSigners(receiver, [peer], peer)
    const [first, selected] = await send(owner); const [second] = await send(owner)
    assert.notEqual(first, second)
    assert.deepEqual(await receiver.nip44DecryptDoubleDHBytes(pub(1), 9, 'dm', first, selected, pub(4)), plain)
    await assert.rejects(receiver.nip44DecryptDoubleDHBytes(pub(1), 9, 'wrong', first, selected, pub(4)))
    const [self] = await owner.nip44EncryptDoubleDHBytes(pub(1), 9, 'self', plain, pub(3))
    assert.deepEqual(await owner.nip44DecryptDoubleDHBytes(pub(1), 9, 'self', self, pub(3), pub(3)), plain)
    const [identity, noContent] = await owner.nip44EncryptDoubleDHBytes(pub(2), 9, 'dm', plain, '', null)
    assert.equal(noContent, '')
    assert.deepEqual(receiver.nip44v3DecryptBytes(pub(1), 9, 'dm', identity), plain)
  } finally { NsecSigner.releaseAll() }
})

test('cache hits preserve validation and cannot use a revoked content key or signer', async () => {
  const f = setup()
  try {
    await send(f.owner)
    for (const [kind, scope, peer] of [[-1, 'dm', pub(4)], [9, null, pub(4)], [9, 'dm', {}]]) await assert.rejects(send(f.owner, kind, scope, peer))
    assert.equal(f.doubleCalls.length, 1)
    f.Signer.release(f.content.getPublicKey())
    await assert.rejects(send(f.owner), /SIGNER_RELEASED/)
    assert.ok(f.doubleKeys[0].every(byte => byte === 0))
    f.Signer.release(f.owner.getPublicKey())
    await assert.rejects(send(f.owner), /SIGNER_RELEASED/)
    const replacement = f.Signer.getOrCreate(secret(1))
    const [, selected] = await send(replacement)
    assert.equal(selected, '')
    assert.equal(f.doubleKeys.length, 2, 'same pubkey does not revive the retired signer cache')
  } finally { f.Signer.releaseAll() }
})

test('revocation and pagehide during key selection reject late results without repopulating the cache', async () => {
  for (const action of ['owner', 'content', 'pagehide']) {
    let selected; let resume
    const ready = new Promise(resolve => { selected = resolve })
    const gate = new Promise(resolve => { resume = resolve })
    const f = setup({ selectContent: signer => { selected(); return gate.then(() => signer.getPublicKey()) } })
    try {
      const work = send(f.owner)
      await ready
      if (action === 'pagehide') { f.listeners.get('pagehide')(); f.listeners.get('pageshow')() } else f.Signer.release(action === 'owner' ? pub(1) : pub(3))
      resume()
      await assert.rejects(work, /SIGNER_RELEASED/)
      assert.equal(f.doubleKeys.length, 0)
    } finally { f.Signer.releaseAll() }
  }
})

test('derived signer retains its root authorization across asynchronous DoubleDH selection', async () => {
  let selected; let resume
  const ready = new Promise(resolve => { selected = resolve }); const gate = new Promise(resolve => { resume = resolve })
  const f = setup({ selectContent: signer => { selected(); return gate.then(() => signer.getPublicKey()) } })
  try {
    const scoped = f.owner.withSharedKey(pub(2), 'dm')
    const effective = f.Signer.getOrCreate(secret(2))
    f.Signer.setContentSigners(effective, [f.content], f.content)
    const work = scoped.nip44EncryptDoubleDHBytes(pub(6), 9, 'dm', plain, pub(4))
    await ready
    f.Signer.release(pub(1))
    resume()
    await assert.rejects(work, /SIGNER_RELEASED/)
    assert.equal(f.doubleKeys.length, 0)
    await send(effective)
    assert.equal(f.doubleKeys.length, 1, 'independently authorized identity remains usable')
  } finally { f.Signer.releaseAll() }
})

test('a rotation during selection preserves the pinned key but cannot repopulate the retired cache', async () => {
  let selected; let resume
  const ready = new Promise(resolve => { selected = resolve }); const gate = new Promise(resolve => { resume = resolve })
  const f = setup({ selectContent: signer => { selected(); return gate.then(() => signer.getPublicKey()) } })
  try {
    const work = send(f.owner)
    await ready
    const next = f.Signer.getOrCreate(secret(5))
    f.Signer.setContentSigners(f.owner, [f.content, next], next)
    resume()
    const [, old] = await work
    assert.equal(old, pub(3))
    assert.ok(f.doubleKeys[0].every(byte => byte === 0), 'unpinned cache admission is skipped after rotation')
    const [, current] = await send(f.owner)
    assert.equal(current, pub(5))
    await send(f.owner)
    assert.equal(f.doubleKeys.length, 2)
  } finally { f.Signer.releaseAll() }
})

test('DoubleDH pins a private copy and zeroizes it on success or crypto failure, including reentrant purge', async () => {
  for (const fail of [false, true]) {
    let pinned
    const f = setup({
      nip44v3: {
        normalizeKind: nip44v3.normalizeKind, toBytes: nip44v3.toBytes, encryptWithConversationKeyBytes: key => {
          pinned = key
          f.Signer.release(pub(1))
          assert.ok(f.doubleKeys.every(key => key.every(byte => byte === 0)))
          assert.ok(key.some(Boolean))
          if (fail) throw new Error('CRYPTO_FAILED')
          return 'ciphertext'
        }
      }
    })
    try {
      if (fail) await assert.rejects(send(f.owner), /CRYPTO_FAILED/)
      else assert.equal((await send(f.owner))[0], 'ciphertext')
      assert.ok(pinned.every(byte => byte === 0))
    } finally { f.Signer.releaseAll() }
  }
})

test('development cache records expose only hit counts and durations, never keys or derivation context', async () => {
  const records = []; const f = setup({ recordCryptoPerformance: entry => records.push(entry) })
  try {
    await send(f.owner); await send(f.owner)
    assert.deepEqual(records.map(row => row.cacheHit), [false, true])
    for (const row of records) assert.deepEqual(Object.keys(row).sort(), ['cacheHit', 'count', 'durationMs', 'stage'])
    assert.ok(!JSON.stringify(records).includes(pub(1)))
    assert.ok(!JSON.stringify(records).includes('dm'))
  } finally { f.Signer.releaseAll() }
})

test('captured DoubleDH derivation ignores patched entry points and pagehide purges warm keys', async () => {
  const f = setup()
  try {
    f.context.deriveDoubleDhConversationKey = () => assert.fail('must keep the captured derivation')
    await send(f.owner); await send(f.owner)
    assert.equal(f.doubleKeys.length, 1)
    f.doubleKeys[0].fill = () => assert.fail('must use captured native zeroization')
    f.listeners.get('pagehide')()
    assert.ok(f.doubleKeys[0].every(byte => byte === 0))
    await assert.rejects(send(f.owner), /SIGNER_RELEASED/)
    f.listeners.get('pageshow')()
    await send(f.owner)
    assert.equal(f.doubleKeys.length, 2)
  } finally { f.Signer.releaseAll() }
})

test('revocation during derivation zeroizes the unadmitted result and cannot create a cache entry', async () => {
  let derived
  const f = setup({
    deriveDoubleDhConversationKey: params => {
      const result = deriveDoubleDhConversationKey(params)
      derived = result.conversationKey
      f.Signer.release(pub(1))
      return result
    }
  })
  try {
    await assert.rejects(send(f.owner), /SIGNER_RELEASED/)
    assert.ok(derived.every(byte => byte === 0))
    assert.equal(f.timers.size, 1, 'only the content signer GC remains, no cache timer')
  } finally { f.Signer.releaseAll() }
})

test('identity-only fallback keeps derived root authorization through the common-cache lookup', async () => {
  const f = isolated(undefined, {
    recordCryptoPerformance: entry => {
      if (entry.stage === 'nip44v3-cache') f.Signer.release(pub(1))
    }
  })
  try {
    const scoped = f.Signer.getOrCreate(secret(1)).withSharedKey(pub(2), 'dm')
    await assert.rejects(scoped.nip44EncryptDoubleDHBytes(pub(6), 9, 'dm', plain, '', null), /SIGNER_RELEASED/)
    assert.ok(f.keys.every(key => key.every(byte => byte === 0)))
  } finally { f.Signer.releaseAll() }
})
