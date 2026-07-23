import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import * as store from '../docs/services/accounts-store.js'
import * as secrets from '../docs/services/secrets.js'
import * as journal from '../docs/services/account-mutation-journal.js'
import {
  filterVisibleAccounts,
  pendingMutationNeedsUnlock,
  recoverPendingMutation
} from '../docs/services/account-mutations.js'
import { bytesToHex, hexToBytes } from 'libp2r2p/base16'

const data = new Map()

globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  removeItem: key => { data.delete(String(key)) },
  setItem: (key, value) => { data.set(String(key), String(value)) }
}

afterEach(() => {
  secrets.lock()
  globalThis.localStorage.clear()
})

function unlockVault () {
  const key = new Uint8Array(32)
  key[0] = 1
  secrets.unlock(key, null)
}

function seckey () {
  return bytesToHex(generateSecretKey())
}

function pubkeyFromSecret (secret) {
  return getPublicKey(hexToBytes(secret))
}

function nsecRecord (pubkey, extra = {}) {
  return { type: 'nsec', pubkey, name: '', picture: '', ...extra }
}

function npubRecord (pubkey, extra = {}) {
  return { type: 'npub', pubkey, name: '', picture: '', ...extra }
}

function bunkerRecord (pubkey, extra = {}) {
  return { type: 'bunker', pubkey, bunker: `bunker://${pubkey}`, name: '', picture: '', ...extra }
}

function nsecRef (pubkey) {
  return { type: 'nsec', pubkey }
}

function bunkerRef (pubkey) {
  return { type: 'bunker', pubkey }
}

async function beginMutation ({ operation = 'test', beforeAccounts, afterAccounts, beforeSecretRefs, afterSecretRefs }) {
  await journal.begin({
    operation,
    affectedPubkeys: [
      ...beforeAccounts.map(a => a.pubkey),
      ...afterAccounts.map(a => a.pubkey)
    ],
    beforeAccounts,
    afterAccounts,
    beforeSecretRefs,
    afterSecretRefs
  })
}

async function setBunkerSecret (pubkey) {
  await secrets.adoptBunkerHandle(pubkey, { close () {} }, seckey())
}

test('recovery removes a created account when the secret blob stayed before-state', async () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const record = nsecRecord(pubkey)
  await store.add(record)
  await beginMutation({
    operation: 'create-account',
    beforeAccounts: [],
    afterAccounts: [record],
    beforeSecretRefs: [],
    afterSecretRefs: [nsecRef(pubkey)]
  })

  const result = await recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'before' })
  assert.equal(store.get(pubkey), null)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), false)
})

test('recovery keeps a created account when the secret blob reached after-state', async () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const record = nsecRecord(pubkey)
  await secrets.setNsecSecret(pubkey, secret)
  await beginMutation({
    operation: 'create-account',
    beforeAccounts: [],
    afterAccounts: [record],
    beforeSecretRefs: [],
    afterSecretRefs: [nsecRef(pubkey)]
  })

  const result = await recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'after' })
  assert.deepEqual(store.get(pubkey), record)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), true)
})

test('recovery keeps a deleted account when the secret blob stayed before-state', async () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const record = nsecRecord(pubkey)
  await store.add(record)
  await secrets.setNsecSecret(pubkey, secret)
  await beginMutation({
    operation: 'delete-account',
    beforeAccounts: [record],
    afterAccounts: [],
    beforeSecretRefs: [nsecRef(pubkey)],
    afterSecretRefs: []
  })

  const result = await recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'before' })
  assert.deepEqual(store.get(pubkey), record)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), true)
})

test('recovery removes a deleted account when the secret blob reached after-state', async () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const record = nsecRecord(pubkey)
  await store.add(record)
  await beginMutation({
    operation: 'delete-account',
    beforeAccounts: [record],
    afterAccounts: [],
    beforeSecretRefs: [nsecRef(pubkey)],
    afterSecretRefs: []
  })

  const result = await recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'after' })
  assert.equal(store.get(pubkey), null)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), false)
})

test('recovery restores an npub when upgrade to nsec did not reach the secret blob', async () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const before = npubRecord(pubkey)
  const after = nsecRecord(pubkey)
  await store.add(after)
  await beginMutation({
    operation: 'commit-prepared',
    beforeAccounts: [before],
    afterAccounts: [after],
    beforeSecretRefs: [],
    afterSecretRefs: [nsecRef(pubkey)]
  })

  const result = await recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'before' })
  assert.deepEqual(store.get(pubkey), before)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), false)
})

test('recovery finishes an npub to nsec upgrade when the secret blob reached after-state', async () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const before = npubRecord(pubkey)
  const after = nsecRecord(pubkey)
  await store.add(before)
  await secrets.setNsecSecret(pubkey, secret)
  await beginMutation({
    operation: 'commit-prepared',
    beforeAccounts: [before],
    afterAccounts: [after],
    beforeSecretRefs: [],
    afterSecretRefs: [nsecRef(pubkey)]
  })

  const result = await recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'after' })
  assert.deepEqual(store.get(pubkey), after)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), true)
})

test('recovery restores old bunker record when drift did not reach the secret blob', async () => {
  unlockVault()
  const oldPubkey = '1'.repeat(64)
  const newPubkey = '2'.repeat(64)
  const before = bunkerRecord(oldPubkey)
  const after = bunkerRecord(newPubkey)
  await store.add(after)
  setBunkerSecret(oldPubkey)
  await beginMutation({
    operation: 'bunker-drift',
    beforeAccounts: [before],
    afterAccounts: [after],
    beforeSecretRefs: [bunkerRef(oldPubkey)],
    afterSecretRefs: [bunkerRef(newPubkey)]
  })

  const result = await recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'before' })
  assert.deepEqual(store.get(oldPubkey), before)
  assert.equal(store.get(newPubkey), null)
  assert.equal(secrets.hasSecretRef(bunkerRef(oldPubkey)), true)
})

test('recovery finishes bunker drift when the secret blob reached after-state', async () => {
  unlockVault()
  const oldPubkey = '1'.repeat(64)
  const newPubkey = '2'.repeat(64)
  const before = bunkerRecord(oldPubkey)
  const after = bunkerRecord(newPubkey)
  await store.add(before)
  setBunkerSecret(newPubkey)
  await beginMutation({
    operation: 'bunker-drift',
    beforeAccounts: [before],
    afterAccounts: [after],
    beforeSecretRefs: [bunkerRef(oldPubkey)],
    afterSecretRefs: [bunkerRef(newPubkey)]
  })

  const result = await recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'after' })
  assert.equal(store.get(oldPubkey), null)
  assert.deepEqual(store.get(newPubkey), after)
  assert.equal(secrets.hasSecretRef(bunkerRef(newPubkey)), true)
})

test('pending accounts are hidden and keep locked recovery visible', async () => {
  const pubkey = '3'.repeat(64)
  const record = nsecRecord(pubkey)
  await store.add(record)
  await beginMutation({
    operation: 'delete-account',
    beforeAccounts: [record],
    afterAccounts: [],
    beforeSecretRefs: [nsecRef(pubkey)],
    afterSecretRefs: []
  })

  assert.deepEqual(filterVisibleAccounts(store.list()), [])
  assert.equal(pendingMutationNeedsUnlock(), true)
  assert.deepEqual(await recoverPendingMutation(), { recovered: false, outcome: 'locked' })
})
