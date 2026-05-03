import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import { derivePairingCode } from '../docs/services/nostrpair.js'

// Verifies the property the protocol leans on: each side feeds (its own
// secret key, the peer's public key) into derivePairingCode and gets the
// same 6 digits. ECDH is symmetric and our HMAC + mod step is deterministic,
// so a passing test means the source and target will always agree on the
// code under matching inputs.
test('derivePairingCode is symmetric across both peers', async () => {
  const sourceSk = generateSecretKey()
  const sourcePk = getPublicKey(sourceSk)
  const targetSk = generateSecretKey()
  const targetPk = getPublicKey(targetSk)

  const sourceCode = await derivePairingCode(sourceSk, targetPk)
  const targetCode = await derivePairingCode(targetSk, sourcePk)

  assert.equal(sourceCode, targetCode)
  assert.match(sourceCode, /^\d{6}$/)
})

test('derivePairingCode returns the same value for the same inputs', async () => {
  const sk = generateSecretKey()
  const pk = getPublicKey(generateSecretKey())
  const a = await derivePairingCode(sk, pk)
  const b = await derivePairingCode(sk, pk)
  assert.equal(a, b)
})

test('derivePairingCode differs for different peer pubkeys', async () => {
  const sk = generateSecretKey()
  const pk1 = getPublicKey(generateSecretKey())
  const pk2 = getPublicKey(generateSecretKey())
  const c1 = await derivePairingCode(sk, pk1)
  const c2 = await derivePairingCode(sk, pk2)
  // Collisions are 1-in-10^6, so a flake here is statistically possible
  // but vanishingly unlikely. If you ever hit it, re-run; if it persists,
  // the derivation is broken.
  assert.notEqual(c1, c2)
})

test('derivePairingCode differs for different source seckeys', async () => {
  const peerPk = getPublicKey(generateSecretKey())
  const c1 = await derivePairingCode(generateSecretKey(), peerPk)
  const c2 = await derivePairingCode(generateSecretKey(), peerPk)
  assert.notEqual(c1, c2)
})

test('derivePairingCode always returns exactly 6 digits, zero-padded', async () => {
  // Run a few times to make sure short numeric outputs (e.g. 12345) get
  // padded to 6 chars rather than left at their natural length.
  for (let i = 0; i < 50; i++) {
    const code = await derivePairingCode(generateSecretKey(), getPublicKey(generateSecretKey()))
    assert.equal(code.length, 6)
    assert.match(code, /^\d{6}$/)
  }
})
