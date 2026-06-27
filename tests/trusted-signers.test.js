import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey } from 'nostr-tools'
import * as secrets from '../docs/services/secrets.js'
import * as trustedSigners from '../docs/services/trusted-signers.js'
import { announceTrustedSignerState, handleMessage, TRUSTED_SIGNERS_STATE_CODE } from '../docs/services/sync/trusted-signers.js'

const KEY = 'ez-vault:trusted-signers'
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
  globalThis.localStorage.clear()
})

function pk (n) {
  return n.toString(16).padStart(64, '0')
}

test('trusted signer records list active entries and read old active-only payloads', () => {
  secrets.unlock(generateSecretKey(), null)
  localStorage.setItem(KEY, secrets.vaultEncrypt(JSON.stringify([
    { pubkey: pk(1), platform: 'Laptop', addedAt: 7 }
  ])))

  assert.deepEqual(trustedSigners.list(), [{
    pubkey: pk(1),
    platform: 'Laptop',
    addedAt: 7,
    updatedAt: 7,
    actorPubkey: ''
  }])

  const added = trustedSigners.add({ pubkey: pk(2), platform: 'Phone', actorPubkey: pk(9), updatedAt: 10 })
  assert.equal(added.status, 'trusted')
  assert.deepEqual(trustedSigners.list().map(entry => entry.pubkey), [pk(1), pk(2)])
})

test('trusted signer storage advertises encrypted state and repopulates after unlock', () => {
  const vaultKey = generateSecretKey()
  secrets.unlock(vaultKey, null)

  assert.equal(trustedSigners.hasStored(), false)
  assert.equal(trustedSigners.hasStoredActive(), false)
  trustedSigners.add({ pubkey: pk(1), platform: 'Laptop', actorPubkey: pk(9), updatedAt: 10 })
  assert.equal(trustedSigners.hasStored(), true)
  assert.equal(trustedSigners.hasStoredActive(), true)

  secrets.lock()
  assert.equal(trustedSigners.hasStored(), true)
  assert.equal(trustedSigners.hasStoredActive(), true)
  assert.deepEqual(trustedSigners.list(), [])

  secrets.unlock(vaultKey, null)
  assert.deepEqual(trustedSigners.list(), [{
    pubkey: pk(1),
    platform: 'Laptop',
    addedAt: 10,
    updatedAt: 10,
    actorPubkey: pk(9)
  }])
})

test('trusted signer tombstone-only storage does not advertise visible devices', () => {
  const vaultKey = generateSecretKey()
  const timestamp = Math.floor(Date.now() / 1000)
  secrets.unlock(vaultKey, null)

  trustedSigners.add({ pubkey: pk(1), platform: 'Laptop', actorPubkey: pk(9), updatedAt: timestamp })
  const activeSnapshot = trustedSigners.snapshot()
  assert.equal(trustedSigners.hasStored(), true)
  assert.equal(trustedSigners.hasStoredActive(), true)

  trustedSigners.remove(pk(1), { actorPubkey: pk(9), updatedAt: timestamp + 1 })
  assert.equal(trustedSigners.hasStored(), true)
  assert.equal(trustedSigners.hasStoredActive(), false)
  assert.deepEqual(trustedSigners.list(), [])
  assert.deepEqual(trustedSigners.listRemovedForReminder().map(record => record.pubkey), [pk(1)])

  secrets.lock()
  assert.equal(trustedSigners.hasStored(), true)
  assert.equal(trustedSigners.hasStoredActive(), false)

  secrets.unlock(vaultKey, null)
  trustedSigners.restore(activeSnapshot)
  assert.equal(trustedSigners.hasStoredActive(), true)
})

test('trusted signer forgetLocal removes self records without tombstones', () => {
  secrets.unlock(generateSecretKey(), null)
  trustedSigners.add({ pubkey: pk(1), platform: 'Self', actorPubkey: pk(9), updatedAt: 10 })
  trustedSigners.add({ pubkey: pk(2), platform: 'Peer', actorPubkey: pk(9), updatedAt: 11 })

  const removed = trustedSigners.forgetLocal(pk(1))

  assert.equal(removed.pubkey, pk(1))
  assert.deepEqual(trustedSigners.list().map(entry => entry.pubkey), [pk(2)])
  assert.deepEqual(trustedSigners.listRecords().map(record => record.status), ['trusted'])
})

test('trusted signer merge uses updatedAt, actorPubkey, then removed as tie-breakers', () => {
  secrets.unlock(generateSecretKey(), null)

  trustedSigners.mergeRecords([
    { pubkey: pk(1), platform: 'Peer', status: 'trusted', updatedAt: 10, actorPubkey: pk(1) }
  ])
  trustedSigners.mergeRecords([
    { pubkey: pk(1), platform: 'Peer', status: 'removed', updatedAt: 10, actorPubkey: pk(2) }
  ])

  assert.deepEqual(trustedSigners.list(), [])
  assert.equal(trustedSigners.listRecords()[0].status, 'removed')

  trustedSigners.mergeRecords([
    { pubkey: pk(1), platform: 'Peer again', status: 'trusted', updatedAt: 11, actorPubkey: pk(1) }
  ])

  assert.equal(trustedSigners.list()[0].platform, 'Peer again')
  assert.equal(trustedSigners.listRecords()[0].status, 'trusted')
})

test('trusted signer tombstones are capped', () => {
  secrets.unlock(generateSecretKey(), null)
  const records = []
  for (let i = 1; i <= 105; i++) {
    records.push({ pubkey: pk(i), status: 'removed', updatedAt: i, actorPubkey: pk(500) })
  }

  trustedSigners.mergeRecords(records)

  const tombstones = trustedSigners.listRecords().filter(record => record.status === 'removed')
  assert.equal(tombstones.length, trustedSigners.TOMBSTONE_CAP)
  assert.equal(tombstones[0].pubkey, pk(6))
})

test('trusted signer clearActive turns active peers into removals', () => {
  secrets.unlock(generateSecretKey(), null)
  trustedSigners.add({ pubkey: pk(1), platform: 'One', actorPubkey: pk(9), updatedAt: 10 })
  trustedSigners.add({ pubkey: pk(2), platform: 'Two', actorPubkey: pk(9), updatedAt: 10 })

  const removed = trustedSigners.clearActive({ actorPubkey: pk(3), updatedAt: 20 })

  assert.deepEqual(removed.map(record => record.pubkey), [pk(1), pk(2)])
  assert.deepEqual(trustedSigners.list(), [])
  assert.deepEqual(trustedSigners.listRecords().map(record => record.status), ['removed', 'removed'])
})

test('trusted signer self-removal clears active peers without tombstone reminders', async () => {
  secrets.unlock(generateSecretKey(), null)
  trustedSigners.add({ pubkey: pk(1), platform: 'One', actorPubkey: pk(9), updatedAt: 10 })
  trustedSigners.add({ pubkey: pk(2), platform: 'Two', actorPubkey: pk(9), updatedAt: 10 })

  await handleMessage({
    event: { pubkey: pk(1) },
    payload: {
      code: TRUSTED_SIGNERS_STATE_CODE,
      payload: {
        entries: [{ pubkey: pk(9), status: 'removed', updatedAt: 20, actorPubkey: pk(1) }]
      }
    }
  }, {
    devicePubkey: pk(9),
    trustedByPubkey: new Map([[pk(1), { pubkey: pk(1) }]]),
    trustedSigners
  })

  assert.deepEqual(trustedSigners.list(), [])
  assert.deepEqual(trustedSigners.listRecords(), [])
})

test('trusted signer self-removal ignores stale reminders older than current sender trust', async () => {
  secrets.unlock(generateSecretKey(), null)
  trustedSigners.add({ pubkey: pk(1), platform: 'One', actorPubkey: pk(9), updatedAt: 200 })

  await handleMessage({
    event: { pubkey: pk(1) },
    payload: {
      code: TRUSTED_SIGNERS_STATE_CODE,
      payload: {
        entries: [{ pubkey: pk(9), status: 'removed', updatedAt: 100, actorPubkey: pk(1) }]
      }
    }
  }, {
    devicePubkey: pk(9),
    trustedByPubkey: new Map([[pk(1), trustedSigners.list()[0]]]),
    trustedSigners
  })

  assert.deepEqual(trustedSigners.list().map(entry => entry.pubkey), [pk(1)])
  assert.deepEqual(trustedSigners.listRecords().map(record => record.status), ['trusted'])
})

test('trusted signer sync ignores trusted entries for the local device', async () => {
  secrets.unlock(generateSecretKey(), null)

  await handleMessage({
    event: { pubkey: pk(1) },
    payload: {
      code: TRUSTED_SIGNERS_STATE_CODE,
      payload: {
        entries: [
          { pubkey: pk(9), platform: 'This device', status: 'trusted', updatedAt: 20, actorPubkey: pk(1) },
          { pubkey: pk(3), platform: 'Other device', status: 'trusted', updatedAt: 20, actorPubkey: pk(1) }
        ]
      }
    }
  }, {
    devicePubkey: pk(9),
    trustedByPubkey: new Map([[pk(1), { pubkey: pk(1) }]]),
    trustedSigners
  })

  assert.deepEqual(trustedSigners.list().map(entry => entry.pubkey), [pk(3)])
})

test('trusted signer announce omits the receiver own pubkey', async () => {
  const sent = []
  await announceTrustedSignerState({
    messenger: {
      tell: async options => sent.push(options)
    },
    peerChannels: new Map([
      [pk(1), 'channel-one'],
      [pk(2), 'channel-two']
    ]),
    activePeerPubkeys: [pk(1), pk(2)],
    records: [
      { pubkey: pk(1), platform: 'One', status: 'trusted', updatedAt: 10, actorPubkey: pk(9) },
      { pubkey: pk(2), platform: 'Two', status: 'trusted', updatedAt: 10, actorPubkey: pk(9) }
    ]
  })

  assert.equal(sent.length, 2)
  assert.deepEqual(sent.find(call => call.receiverPubkey === pk(1)).payload.entries.map(entry => entry.pubkey), [pk(2)])
  assert.deepEqual(sent.find(call => call.receiverPubkey === pk(2)).payload.entries.map(entry => entry.pubkey), [pk(1)])
})
