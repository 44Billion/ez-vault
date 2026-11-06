import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONTENT_KEYS_ASK_CODE,
  askCoalescingDigest as contentKeysDigest
} from '../src/services/sync/content-keys.js'
import {
  NOSTRDB_SYNC_APP_ASK_CODE,
  NOSTRDB_SYNC_ASK_CODE,
  askCoalescingDigest as nostrDbDigest
} from '../src/services/sync/nostrdb.js'
import { resolveInboundCoalescing } from '../src/services/sync/index.js'
import { TRUSTED_SIGNERS_STATE_CODE } from '../src/services/sync/trusted-signers.js'

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
  assert.equal(contentKeysDigest(message(TRUSTED_SIGNERS_STATE_CODE, {
    entries: []
  })), null)
})

test('sync dispatcher prefers content-key digests and falls back to NostrDB', () => {
  const content = message(CONTENT_KEYS_ASK_CODE, { pubkeys: [PUBKEY_A] })
  const range = message(NOSTRDB_SYNC_ASK_CODE, {
    requestId: 'request',
    sinceScore: 1,
    untilScore: 2,
    excludeIds: [],
    limit: 200
  })
  assert.equal(
    resolveInboundCoalescing(content, () => 'a'.repeat(64), () => 'b'.repeat(64)).key,
    'a'.repeat(64)
  )
  assert.equal(
    resolveInboundCoalescing(range, () => null, () => 'b'.repeat(64)).key,
    'b'.repeat(64)
  )
  assert.equal(
    resolveInboundCoalescing(message('unknown', {}), () => null, () => null),
    null
  )
  assert.deepEqual(
    resolveInboundCoalescing(content, () => 'a'.repeat(64), () => null),
    { key: 'a'.repeat(64), keep: 'latest' }
  )
})
