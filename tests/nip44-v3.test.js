import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import { sha256 } from '@noble/hashes/sha2.js'
import * as nip44v3 from '../docs/services/nip44-v3.js'
import NsecSigner from '../docs/services/nsec-signer.js'
import { run } from '../docs/services/signer.js'
import * as store from '../docs/services/accounts-store.js'
import * as secrets from '../docs/services/secrets.js'
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

// https://github.com/nostr-land/nip44v3/blob/4b8d3638e0f36014c1e8f2087b768d9551352ea6/test-vectors.json
const vectors = JSON.parse(readFileSync(new URL('./fixtures/nip44v3-vectors.json', import.meta.url), 'utf8'))

afterEach(() => {
  secrets.lock()
  NsecSigner.releaseAll()
  globalThis.localStorage.clear()
})

function pubOf (sec) {
  return getPublicKey(hexToBytes(sec))
}

function seckey () {
  return bytesToHex(generateSecretKey())
}

function addNsecAccount () {
  const secret = seckey()
  const pubkey = pubOf(secret)
  store.add({ type: 'nsec', pubkey, name: '', picture: '' })
  secrets.setNsecSecret(pubkey, secret)
  return { pubkey, secret }
}

function addBunkerAccount () {
  const pubkey = 'b'.repeat(64)
  store.add({ type: 'bunker', pubkey, name: '', picture: '' })
  return { pubkey }
}

// https://github.com/greenart7c3/Nip46Lab/blob/de046f8b6f2078a21835f11f87b1dc11fbca1afc/index.html#L2111
test('nip44-v3 service passes the vendored upstream self-test vectors', () => {
  const sections = {}
  const fails = []
  let total = 0
  let pass = 0
  const check = (section, name, cond, detail) => {
    total++
    sections[section] ??= { pass: 0, total: 0 }
    sections[section].total++
    if (cond) {
      pass++
      sections[section].pass++
    } else {
      fails.push(`[${section}] ${name}: ${detail || 'mismatch'}`)
    }
  }

  // encrypt_decrypt: key derivation, deterministic encrypt from BOTH parties, decrypt from BOTH parties
  for (const [i, v] of (vectors.encrypt_decrypt || []).entries()) {
    const sec1 = hexToBytes(v.secret1)
    const sec2 = hexToBytes(v.secret2)
    const pub1 = pubOf(v.secret1)
    const pub2 = pubOf(v.secret2)
    const nonce = hexToBytes(v.nonce)
    const scope = hexToBytes(v.scope_hex)
    const pt = hexToBytes(v.plaintext_hex)
    const k = nip44v3.deriveKeys(sec1, pub2, nonce)
    check('encrypt_decrypt', `ed[${i}] prk`, bytesToHex(k.prk) === v.prk, bytesToHex(k.prk))
    check('encrypt_decrypt', `ed[${i}] encryption_key`, bytesToHex(k.encryption_key) === v.encryption_key)
    check('encrypt_decrypt', `ed[${i}] mac_key`, bytesToHex(k.mac_key) === v.mac_key)
    check('encrypt_decrypt', `ed[${i}] encrypt (party1)`, nip44v3.encryptBytes(sec1, pub2, v.kind, scope, pt, nonce) === v.ciphertext)
    check('encrypt_decrypt', `ed[${i}] encrypt (party2)`, nip44v3.encryptBytes(sec2, pub1, v.kind, scope, pt, nonce) === v.ciphertext)
    try { check('encrypt_decrypt', `ed[${i}] decrypt (party1)`, bytesToHex(nip44v3.decryptBytes(sec1, pub2, v.kind, scope, v.ciphertext)) === v.plaintext_hex) } catch (e) { check('encrypt_decrypt', `ed[${i}] decrypt (party1)`, false, `ERROR ${e.message}`) }
    try { check('encrypt_decrypt', `ed[${i}] decrypt (party2)`, bytesToHex(nip44v3.decryptBytes(sec2, pub1, v.kind, scope, v.ciphertext)) === v.plaintext_hex) } catch (e) { check('encrypt_decrypt', `ed[${i}] decrypt (party2)`, false, `ERROR ${e.message}`) }
  }

  // decrypt_only: intentionally non-standard (but valid) ciphertexts that must still decrypt
  for (const [i, v] of (vectors.decrypt_only || []).entries()) {
    const label = `do[${i}]${v.note ? ` (${v.note})` : ''}`
    try { check('decrypt_only', label, bytesToHex(nip44v3.decryptBytes(hexToBytes(v.secret1), pubOf(v.secret2), v.kind, hexToBytes(v.scope_hex), v.ciphertext)) === v.plaintext_hex) } catch (e) { check('decrypt_only', label, false, `ERROR ${e.message}`) }
  }

  // long_encrypt_decrypt: ciphertext sha256 must match, then round-trip
  for (const [i, v] of (vectors.long_encrypt_decrypt || []).entries()) {
    const pat = hexToBytes(v.pattern_hex)
    const pt = new Uint8Array(pat.length * v.repeat)
    for (let r = 0; r < v.repeat; r++) pt.set(pat, r * pat.length)
    const scope = hexToBytes(v.scope_hex)
    const ct = nip44v3.encryptBytes(hexToBytes(v.secret1), pubOf(v.secret2), v.kind, scope, pt, hexToBytes(v.nonce))
    check('long_encrypt_decrypt', `long[${i}] sha256`, bytesToHex(sha256(nip44v3.toBytes(ct))) === v.ciphertext_sha256)
    try { check('long_encrypt_decrypt', `long[${i}] round-trip`, bytesToHex(nip44v3.decryptBytes(hexToBytes(v.secret1), pubOf(v.secret2), v.kind, scope, ct)) === bytesToHex(pt)) } catch (e) { check('long_encrypt_decrypt', `long[${i}] round-trip`, false, `ERROR ${e.message}`) }
  }

  // padded_length: target_size(len)
  for (const row of (vectors.padded_length || [])) {
    const len = row[0]
    const exp = row[1]
    const got = nip44v3.targetSize(len)
    check('padded_length', `pad[${len}]`, got === exp, `got ${got} want ${exp}`)
  }

  // invalid_decryption: every malformed ciphertext must be rejected
  for (const [i, v] of (vectors.invalid_decryption || []).entries()) {
    let threw = false
    try { nip44v3.decryptBytes(hexToBytes(v.secret), v.public, v.kind, hexToBytes(v.scope_hex), v.ciphertext) } catch { threw = true }
    check('invalid_decryption', `inv[${i}] (${v.why})`, threw, 'did NOT reject')
  }

  const summary = Object.entries(sections).map(([name, s]) => `${name}: ${s.pass}/${s.total}`).join(', ')
  assert.deepEqual(fails, [], `${pass}/${total} checks passed; ${summary}`)
})

test('NsecSigner exposes NIP-44 v3 byte payload methods', async () => {
  const alice = NsecSigner.getOrCreate(seckey())
  const bob = NsecSigner.getOrCreate(seckey())
  const alicePubkey = await alice.getPublicKey()
  const bobPubkey = await bob.getPublicKey()
  const plaintextB64 = nip44v3.b64encode(new Uint8Array([0, 1, 2, 127, 128, 255]))

  const ciphertext = await alice.nip44v3Encrypt(bobPubkey, '30078', 'spec.nostr.land/nip44v3', plaintextB64)
  assert.equal(await bob.nip44v3Decrypt(alicePubkey, 30078, 'spec.nostr.land/nip44v3', ciphertext), plaintextB64)
  assert.throws(
    () => bob.nip44v3Decrypt(alicePubkey, 1, 'spec.nostr.land/nip44v3', ciphertext),
    /kind mismatch/
  )
})

test('signer.run normalizes snake_case NIP-44 v3 wire methods', async () => {
  secrets.unlock(generateSecretKey(), null)
  const alice = addNsecAccount()
  const bob = addNsecAccount()
  const plaintextB64 = nip44v3.b64encode(nip44v3.toBytes('hello v3'))
  const ciphertext = await run({
    pubkey: alice.pubkey,
    method: 'nip44v3_encrypt',
    params: [bob.pubkey, '1', '', plaintextB64]
  })

  assert.equal(await run({
    pubkey: bob.pubkey,
    method: 'nip44v3_decrypt',
    params: [alice.pubkey, 1, '', ciphertext]
  }), plaintextB64)
})

test('signer.run rejects NIP-44 v3 methods for bunker accounts', async () => {
  const bunker = addBunkerAccount()
  for (const method of [
    'nip44v3Encrypt',
    'nip44v3Decrypt',
    'nip44v3_encrypt',
    'nip44v3_decrypt',
    'nip44_v3_encrypt',
    'nip44_v3_decrypt'
  ]) {
    await assert.rejects(
      () => run({ pubkey: bunker.pubkey, method, params: [] }),
      /BUNKER_METHOD_UNSUPPORTED/
    )
  }
})
