import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import NsecSigner from '../docs/services/nsec-signer.js'
import * as store from '../docs/services/accounts-store.js'
import * as secrets from '../docs/services/secrets.js'
import {
  FALLBACK_ROTATION_DELAY_MS,
  runDueRevocationRotations,
  scheduleRevocationRotationsForRemovedSigner
} from '../docs/services/sync/revocation-rotation.js'
import { bytesToHex, hexToBytes } from '../docs/helpers/nostr/index.js'

const data = new Map()

globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  removeItem: key => { data.delete(String(key)) },
  setItem: (key, value) => { data.set(String(key), String(value)) }
}

if (!globalThis.crypto) globalThis.crypto = crypto
if (!globalThis.btoa) globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64')
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary')

afterEach(() => {
  secrets.lock()
  NsecSigner.releaseAll()
  globalThis.localStorage.clear()
})

function pk (n) {
  return n.toString(16).padStart(64, '0')
}

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
  secrets.setContentKeySecret(ownerPubkey, secret, 10)
  return { pubkey, secret }
}

test('revocation rotation actor intents run immediately', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = addNsecAccount()
  const content = addContentKey(account.pubkey)
  const calls = []

  const created = await scheduleRevocationRotationsForRemovedSigner({
    removedSignerPubkey: pk(2),
    removalUpdatedAt: 20,
    actorPubkey: pk(1),
    localActorPubkey: pk(1),
    nowMs: 1000
  })
  const result = await runDueRevocationRotations({
    nowMs: 1000,
    _rotateContentKeyIfStillCanonical: async intent => {
      calls.push(intent)
      return { status: 'rotated' }
    }
  })

  assert.equal(created.length, 1)
  assert.equal(created[0].ownerPubkey, account.pubkey)
  assert.equal(created[0].removedKnownContentPubkey, content.pubkey)
  assert.equal(created[0].nextAttemptAt, 1000)
  assert.equal(result.checked, 1)
  assert.equal(result.rotated, 1)
  assert.equal(calls.length, 1)
})

test('revocation rotation peer intents wait thirty minutes', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = addNsecAccount()
  addContentKey(account.pubkey)
  let calls = 0

  const created = await scheduleRevocationRotationsForRemovedSigner({
    removedSignerPubkey: pk(2),
    removalUpdatedAt: 20,
    actorPubkey: pk(1),
    localActorPubkey: pk(3),
    nowMs: 1000
  })

  assert.equal(created[0].nextAttemptAt, 1000 + FALLBACK_ROTATION_DELAY_MS)
  assert.equal((await runDueRevocationRotations({
    nowMs: 1000,
    _rotateContentKeyIfStillCanonical: async () => { calls += 1; return { status: 'rotated' } }
  })).checked, 0)
  assert.equal((await runDueRevocationRotations({
    nowMs: 1000 + FALLBACK_ROTATION_DELAY_MS,
    _rotateContentKeyIfStillCanonical: async () => { calls += 1; return { status: 'cleared' } }
  })).checked, 1)
  assert.equal(calls, 1)
})

test('revocation rotation retries failures and clears completed work', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = addNsecAccount()
  addContentKey(account.pubkey)
  let calls = 0

  await scheduleRevocationRotationsForRemovedSigner({
    removedSignerPubkey: pk(2),
    removalUpdatedAt: 20,
    actorPubkey: pk(1),
    localActorPubkey: pk(1),
    nowMs: 1000
  })
  const first = await runDueRevocationRotations({
    nowMs: 1000,
    _rotateContentKeyIfStillCanonical: async () => {
      calls += 1
      return { status: 'retry' }
    }
  })
  const second = await runDueRevocationRotations({
    nowMs: 1000 + 10 * 60 * 1000,
    _rotateContentKeyIfStillCanonical: async () => {
      calls += 1
      return { status: 'cleared' }
    }
  })

  assert.equal(first.checked, 1)
  assert.equal(first.remaining, 1)
  assert.equal(second.checked, 1)
  assert.equal(second.cleared, 1)
  assert.equal(second.remaining, 0)
  assert.equal(calls, 2)
})
