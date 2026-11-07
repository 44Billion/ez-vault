import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTENT_KEYS_ANNOUNCE_CODE,
  CONTENT_KEYS_ASK_CODE,
  askCoalescingDigest as contentKeysDigest,
  coalescingHint as contentKeysHint
} from '../src/services/sync/content-keys.js'
import {
  NOSTRDB_SYNC_ADVERTISE_CODE,
  NOSTRDB_SYNC_APP_ASK_CODE,
  NOSTRDB_SYNC_ASK_CODE,
  askCoalescingDigest as nostrDbDigest,
  coalescingHint as nostrDbHint
} from '../src/services/sync/nostrdb.js'
import { resolveInboundCoalescing } from '../src/services/sync/index.js'
import {
  TRUSTED_SIGNERS_STATE_CODE,
  coalescingHint as trustedSignersHint
} from '../src/services/sync/trusted-signers.js'

const PUBKEY_A = 'a'.repeat(64)
const PUBKEY_B = 'b'.repeat(64)
const EVENT_A = '1'.repeat(64)
const EVENT_B = '2'.repeat(64)

function message (code, payload) {
  return {
    event: { id: 'outer-ask-id' },
    payload: { code, payload }
  }
}

test('NostrDB range coalescing ignores request and event ids but includes full semantics', () => {
  const first = message(NOSTRDB_SYNC_ASK_CODE, {
    requestId: 'request-one',
    sinceScore: 10,
    untilScore: 20,
    excludeIds: [EVENT_B, EVENT_A, EVENT_B],
    limit: 200,
    ignored: 'field'
  })
  const retry = message(NOSTRDB_SYNC_ASK_CODE, {
    requestId: 'request-two',
    sinceScore: 10,
    untilScore: 20,
    excludeIds: [EVENT_A, EVENT_B],
    limit: 200
  })
  retry.event = { id: 'different-outer-event' }

  assert.match(nostrDbDigest(first), /^[0-9a-f]{64}$/)
  assert.equal(nostrDbDigest(first), nostrDbDigest(retry))

  for (const changed of [
    { sinceScore: 11 },
    { untilScore: 21 },
    { excludeIds: [EVENT_A] },
    { limit: 100 }
  ]) {
    const next = message(NOSTRDB_SYNC_ASK_CODE, {
      requestId: 'request-two',
      sinceScore: 10,
      untilScore: 20,
      excludeIds: [EVENT_A, EVENT_B],
      limit: 200,
      ...changed
    })
    assert.notEqual(nostrDbDigest(first), nostrDbDigest(next))
  }
})

test('NostrDB app coalescing uses app cursor semantics only', () => {
  const first = message(NOSTRDB_SYNC_APP_ASK_CODE, {
    requestId: 'app-request-one',
    appId: 'https://app.example',
    after: EVENT_A,
    batchSize: 200
  })
  const retry = message(NOSTRDB_SYNC_APP_ASK_CODE, {
    requestId: 'app-request-two',
    appId: 'https://app.example',
    after: EVENT_A,
    batchSize: 200
  })
  assert.equal(nostrDbDigest(first), nostrDbDigest(retry))
  assert.notEqual(nostrDbDigest(first), nostrDbDigest(message(NOSTRDB_SYNC_APP_ASK_CODE, {
    requestId: 'app-request-two',
    appId: 'https://app.example',
    after: EVENT_B,
    batchSize: 200
  })))
  assert.notEqual(nostrDbDigest(first), nostrDbDigest(message(NOSTRDB_SYNC_APP_ASK_CODE, {
    requestId: 'app-request-two',
    appId: 'https://other.example',
    after: EVENT_A,
    batchSize: 200
  })))
  assert.notEqual(nostrDbDigest(first), nostrDbDigest(message(NOSTRDB_SYNC_APP_ASK_CODE, {
    requestId: 'app-request-two',
    appId: 'https://app.example',
    after: EVENT_A,
    batchSize: 100
  })))
})

test('content-key coalescing canonicalizes the requested pubkey set', () => {
  const first = message(CONTENT_KEYS_ASK_CODE, {
    pubkeys: [PUBKEY_B, PUBKEY_A, PUBKEY_B]
  })
  const retry = message(CONTENT_KEYS_ASK_CODE, {
    pubkeys: [PUBKEY_A, PUBKEY_B]
  })
  assert.equal(contentKeysDigest(first), contentKeysDigest(retry))
  assert.notEqual(contentKeysDigest(first), contentKeysDigest(message(CONTENT_KEYS_ASK_CODE, {
    pubkeys: [PUBKEY_A]
  })))
})

test('content-key announcements always use the same stream and ignore generatedAt', () => {
  const keys = [
    { pubkey: PUBKEY_B, createdAt: 20 },
    { pubkey: PUBKEY_A, createdAt: 10 }
  ]
  const first = contentKeysHint(message(CONTENT_KEYS_ANNOUNCE_CODE, { generatedAt: 100, keys }))
  const changed = contentKeysHint(message(CONTENT_KEYS_ANNOUNCE_CODE, {
    generatedAt: 200,
    keys: [keys[1]]
  }))
  assert.equal(first.key, changed.key)
  assert.equal(first.sequence, undefined)
  assert.equal(changed.sequence, undefined)

  const legacy = contentKeysHint(message(CONTENT_KEYS_ANNOUNCE_CODE, { keys }))
  const reordered = contentKeysHint(message(CONTENT_KEYS_ANNOUNCE_CODE, { keys: [...keys].reverse() }))
  assert.equal(legacy.key, first.key)
  assert.equal(reordered.key, first.key)
  assert.equal(legacy.sequence, undefined)
  assert.equal(contentKeysHint(message(CONTENT_KEYS_ANNOUNCE_CODE, {
    generatedAt: 'invalid',
    keys
  })).key, first.key)
  assert.equal(contentKeysHint(message(CONTENT_KEYS_ANNOUNCE_CODE, {
    generatedAt: 300,
    keys: [keys[0], { pubkey: 'invalid', createdAt: 10 }]
  })), null)
})

test('NostrDB advertisements use generatedAt as stream sequence', () => {
  const first = nostrDbHint(message(NOSTRDB_SYNC_ADVERTISE_CODE, {
    generatedAt: 100,
    minScore: 10,
    maxScore: 20
  }))
  const changed = nostrDbHint(message(NOSTRDB_SYNC_ADVERTISE_CODE, {
    generatedAt: 200,
    minScore: 30,
    maxScore: 40
  }))
  assert.equal(first.key, changed.key)
  assert.equal(first.sequence, 100)
  assert.equal(changed.sequence, 200)
  assert.equal(nostrDbHint(message(NOSTRDB_SYNC_ADVERTISE_CODE, {
    generatedAt: 0,
    minScore: 10,
    maxScore: 20
  })), null)
})

test('trusted signer snapshots and reminders always share one stream', () => {
  const trusted = { pubkey: PUBKEY_A, status: 'trusted', updatedAt: 10, actorPubkey: PUBKEY_B, platform: 'Phone' }
  const removed = { pubkey: PUBKEY_B, status: 'removed', updatedAt: 20, actorPubkey: PUBKEY_A, platform: 'Laptop' }
  const snapshot = trustedSignersHint(message(TRUSTED_SIGNERS_STATE_CODE, {
    generatedAt: 100,
    entries: [removed, trusted]
  }))
  const reminder = trustedSignersHint(message(TRUSTED_SIGNERS_STATE_CODE, {
    generatedAt: 200,
    entries: [removed]
  }))
  assert.equal(snapshot.key, reminder.key)
  assert.equal(snapshot.sequence, undefined)
  assert.equal(reminder.sequence, undefined)

  const legacy = trustedSignersHint(message(TRUSTED_SIGNERS_STATE_CODE, { entries: [trusted, removed] }))
  const reminderLegacy = trustedSignersHint(message(TRUSTED_SIGNERS_STATE_CODE, { entries: [removed] }))
  assert.equal(legacy.key, snapshot.key)
  assert.equal(reminderLegacy.key, snapshot.key)
  assert.equal(legacy.sequence, undefined)
  assert.equal(trustedSignersHint(message(TRUSTED_SIGNERS_STATE_CODE, {
    generatedAt: 300,
    entries: [trusted, { pubkey: 'invalid', status: 'trusted', updatedAt: 10 }]
  })), null)
})

test('coalescing returns null for invalid or out-of-scope messages', () => {
  assert.equal(nostrDbDigest(message(NOSTRDB_SYNC_ASK_CODE, {
    requestId: '',
    sinceScore: 10,
    untilScore: 20
  })), null)
  assert.equal(nostrDbDigest(message(NOSTRDB_SYNC_APP_ASK_CODE, {
    requestId: 'request',
    appId: '',
    after: '',
    batchSize: 200
  })), null)
  assert.equal(contentKeysDigest(message(CONTENT_KEYS_ASK_CODE, {
    pubkeys: ['invalid']
  })), null)
  assert.equal(trustedSignersHint(message(TRUSTED_SIGNERS_STATE_CODE, {
    entries: []
  })), null)
})

test('sync dispatcher applies hints in deterministic order', () => {
  const content = message(CONTENT_KEYS_ASK_CODE, { pubkeys: [PUBKEY_A] })
  const range = message(NOSTRDB_SYNC_ASK_CODE, {
    requestId: 'request',
    sinceScore: 1,
    untilScore: 2,
    excludeIds: [],
    limit: 200
  })
  const first = { key: 'a'.repeat(64), keep: 'latest' }
  const second = { key: 'b'.repeat(64), keep: 'latest' }
  assert.equal(resolveInboundCoalescing(content, [() => first, () => second]), first)
  assert.equal(resolveInboundCoalescing(range, [() => null, () => second]), second)
  assert.equal(resolveInboundCoalescing(message('unknown', {}), [() => null, () => null]), null)
  assert.equal(resolveInboundCoalescing(content).key, contentKeysHint(content).key)
})
