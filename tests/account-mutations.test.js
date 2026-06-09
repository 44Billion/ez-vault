import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import * as store from '../docs/services/accounts-store.js'
import * as secrets from '../docs/services/secrets.js'
import * as journal from '../docs/services/account-mutation-journal.js'
import {
  filterVisibleAccounts,
  pendingMutationNeedsUnlock,
  recoverPendingMutation
} from '../docs/services/account-mutations.js'
import { bytesToHex, hexToBytes } from '../docs/helpers/nostr/index.js'

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

function beginMutation ({ operation = 'test', beforeAccounts, afterAccounts, beforeSecretRefs, afterSecretRefs }) {
  journal.begin({
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

function setBunkerSecret (pubkey) {
  secrets.adoptBunkerHandle(pubkey, { close () {} }, seckey())
}

test('recovery removes a created account when the secret blob stayed before-state', () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const record = nsecRecord(pubkey)
  store.add(record)
  beginMutation({
    operation: 'create-account',
    beforeAccounts: [],
    afterAccounts: [record],
    beforeSecretRefs: [],
    afterSecretRefs: [nsecRef(pubkey)]
  })

  const result = recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'before' })
  assert.equal(store.get(pubkey), null)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), false)
})

test('recovery keeps a created account when the secret blob reached after-state', () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const record = nsecRecord(pubkey)
  secrets.setNsecSecret(pubkey, secret)
  beginMutation({
    operation: 'create-account',
    beforeAccounts: [],
    afterAccounts: [record],
    beforeSecretRefs: [],
    afterSecretRefs: [nsecRef(pubkey)]
  })

  const result = recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'after' })
  assert.deepEqual(store.get(pubkey), record)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), true)
})

test('recovery keeps a deleted account when the secret blob stayed before-state', () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const record = nsecRecord(pubkey)
  store.add(record)
  secrets.setNsecSecret(pubkey, secret)
  beginMutation({
    operation: 'delete-account',
    beforeAccounts: [record],
    afterAccounts: [],
    beforeSecretRefs: [nsecRef(pubkey)],
    afterSecretRefs: []
  })

  const result = recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'before' })
  assert.deepEqual(store.get(pubkey), record)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), true)
})

test('recovery removes a deleted account when the secret blob reached after-state', () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const record = nsecRecord(pubkey)
  store.add(record)
  beginMutation({
    operation: 'delete-account',
    beforeAccounts: [record],
    afterAccounts: [],
    beforeSecretRefs: [nsecRef(pubkey)],
    afterSecretRefs: []
  })

  const result = recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'after' })
  assert.equal(store.get(pubkey), null)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), false)
})

test('recovery restores an npub when upgrade to nsec did not reach the secret blob', () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const before = npubRecord(pubkey)
  const after = nsecRecord(pubkey)
  store.add(after)
  beginMutation({
    operation: 'commit-prepared',
    beforeAccounts: [before],
    afterAccounts: [after],
    beforeSecretRefs: [],
    afterSecretRefs: [nsecRef(pubkey)]
  })

  const result = recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'before' })
  assert.deepEqual(store.get(pubkey), before)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), false)
})

test('recovery finishes an npub to nsec upgrade when the secret blob reached after-state', () => {
  unlockVault()
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  const before = npubRecord(pubkey)
  const after = nsecRecord(pubkey)
  store.add(before)
  secrets.setNsecSecret(pubkey, secret)
  beginMutation({
    operation: 'commit-prepared',
    beforeAccounts: [before],
    afterAccounts: [after],
    beforeSecretRefs: [],
    afterSecretRefs: [nsecRef(pubkey)]
  })

  const result = recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'after' })
  assert.deepEqual(store.get(pubkey), after)
  assert.equal(secrets.hasSecretRef(nsecRef(pubkey)), true)
})

test('recovery restores old bunker record when drift did not reach the secret blob', () => {
  unlockVault()
  const oldPubkey = '1'.repeat(64)
  const newPubkey = '2'.repeat(64)
  const before = bunkerRecord(oldPubkey)
  const after = bunkerRecord(newPubkey)
  store.add(after)
  setBunkerSecret(oldPubkey)
  beginMutation({
    operation: 'bunker-drift',
    beforeAccounts: [before],
    afterAccounts: [after],
    beforeSecretRefs: [bunkerRef(oldPubkey)],
    afterSecretRefs: [bunkerRef(newPubkey)]
  })

  const result = recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'before' })
  assert.deepEqual(store.get(oldPubkey), before)
  assert.equal(store.get(newPubkey), null)
  assert.equal(secrets.hasSecretRef(bunkerRef(oldPubkey)), true)
})

test('recovery finishes bunker drift when the secret blob reached after-state', () => {
  unlockVault()
  const oldPubkey = '1'.repeat(64)
  const newPubkey = '2'.repeat(64)
  const before = bunkerRecord(oldPubkey)
  const after = bunkerRecord(newPubkey)
  store.add(before)
  setBunkerSecret(newPubkey)
  beginMutation({
    operation: 'bunker-drift',
    beforeAccounts: [before],
    afterAccounts: [after],
    beforeSecretRefs: [bunkerRef(oldPubkey)],
    afterSecretRefs: [bunkerRef(newPubkey)]
  })

  const result = recoverPendingMutation()

  assert.deepEqual(result, { recovered: true, outcome: 'after' })
  assert.equal(store.get(oldPubkey), null)
  assert.deepEqual(store.get(newPubkey), after)
  assert.equal(secrets.hasSecretRef(bunkerRef(newPubkey)), true)
})

test('pending accounts are hidden and keep locked recovery visible', () => {
  const pubkey = '3'.repeat(64)
  const record = nsecRecord(pubkey)
  store.add(record)
  beginMutation({
    operation: 'delete-account',
    beforeAccounts: [record],
    afterAccounts: [],
    beforeSecretRefs: [nsecRef(pubkey)],
    afterSecretRefs: []
  })

  assert.deepEqual(filterVisibleAccounts(store.list()), [])
  assert.equal(pendingMutationNeedsUnlock(), true)
  assert.deepEqual(recoverPendingMutation(), { recovered: false, outcome: 'locked' })
})
