import test from 'node:test'
import assert from 'node:assert/strict'
import { syncErrorDetails } from '../src/helpers/sync-error.js'

test('overflow diagnostics retain only the bounded operational fields', () => {
  assert.equal(syncErrorDetails(new Error('ordinary error')), null)
  const error = { code: 'RELAY_LIVE_BUFFER_FULL', relay: 'wss://relay.example', operation: 'private-channel.subscribe', phase: 'live-buffer', payload: 'secret', buffer: { stage: 'delivery', queuedEvents: 1000, queuedBytes: 7000000, incomingBytes: 100, oldestQueuedMs: 30, contents: 'secret', limits: { events: 1000, bytes: 8388608, signer: 'secret' } } }
  const details = syncErrorDetails(error)
  assert.deepEqual(details.buffer.limits, { events: 1000, bytes: 8388608 })
  assert.equal(details.buffer.queuedEvents, 1000)
  assert.equal(details.relay, error.relay)
  assert.ok(!JSON.stringify(details).includes('secret'))
})

test('quarantine diagnostics expose classifications but never message coordinates or payloads', () => {
  const error = Object.assign(new Error('SYNC_MESSAGE_QUARANTINED'), {
    code: 'SYNC_MESSAGE_QUARANTINED',
    syncCode: 'SYNC_PAYLOAD_INVALID',
    syncType: 'reply',
    operationCode: 'contentKeys_reply_t7y8',
    status: 'stored',
    partial: true,
    evicted: 2,
    senderPubkey: 'secret',
    eventId: 'secret',
    payload: { seckey: 'secret' }
  })
  assert.deepEqual(syncErrorDetails(error), {
    code: 'SYNC_MESSAGE_QUARANTINED',
    syncCode: 'SYNC_PAYLOAD_INVALID',
    syncType: 'reply',
    operationCode: 'contentKeys_reply_t7y8',
    status: 'stored',
    partial: true,
    evicted: 2
  })
  assert.equal(JSON.stringify(syncErrorDetails(error)).includes('secret'), false)
})

test('capacity diagnostics expose only queue metrics and pause reasons', () => {
  const error = Object.assign(new Error('SYNC_PUBLICATION_FAILED'), {
    cause: Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
      code: 'PRIVATE_MESSENGER_PAUSED',
      pauseReasons: ['capacity', 'network'],
      payload: 'secret'
    }),
    reports: [{
      reason: Object.assign(new Error('QUEUE_CAPACITY_EXCEEDED'), {
        code: 'QUEUE_CAPACITY_EXCEEDED',
        queue: 'inbox',
        requiredBytes: 240,
        usedBytes: 16 * 1024 * 1024 - 100,
        maxBytes: 16 * 1024 * 1024,
        ciphertext: 'secret'
      })
    }]
  })
  assert.deepEqual(syncErrorDetails(error), {
    code: 'QUEUE_CAPACITY_EXCEEDED',
    queue: 'inbox',
    requiredBytes: 240,
    usedBytes: 16 * 1024 * 1024 - 100,
    maxBytes: 16 * 1024 * 1024,
    pauseReasons: ['capacity', 'network']
  })
  assert.equal(JSON.stringify(syncErrorDetails(error)).includes('secret'), false)
})

test('soft capacity pressure exposes only bounded queue aggregates', () => {
  const error = Object.assign(new Error('PRIVATE_MESSENGER_CAPACITY_PRESSURE'), {
    code: 'PRIVATE_MESSENGER_CAPACITY_PRESSURE',
    queue: 'inbox',
    usedBytes: 1200,
    highWaterBytes: 1200,
    resumeAtBytes: 800,
    maxBytes: 1600,
    pauseReasons: ['capacity', 'network'],
    summary: {
      count: 3,
      bytes: 1100,
      channelCount: 2,
      buckets: [
        { type: 'message', ageBucket: '<1h', count: 2, bytes: 800, channelPubkey: 'secret' },
        { type: 'other', ageBucket: 'unknown', count: 1, bytes: 300 },
        { type: 'invalid', ageBucket: '<1h', count: 1, bytes: 1 },
        { type: 'ask', ageBucket: 'not-a-bucket', count: 1, bytes: 1 }
      ],
      codes: [
        { type: 'yell', code: 'nostrDbSync_push_kpkr', count: 2, bytes: 900, payload: 'secret' },
        { type: 'invalid', code: 'secret', count: 1, bytes: 1 },
        { type: 'yell', code: 'contains spaces', count: 1, bytes: 1 }
      ],
      channelPubkey: 'secret',
      ciphertext: 'secret'
    },
    payload: 'secret'
  })
  assert.deepEqual(syncErrorDetails(error), {
    code: 'PRIVATE_MESSENGER_CAPACITY_PRESSURE',
    queue: 'inbox',
    usedBytes: 1200,
    highWaterBytes: 1200,
    resumeAtBytes: 800,
    maxBytes: 1600,
    pauseReasons: ['capacity', 'network'],
    summary: {
      count: 3,
      bytes: 1100,
      channelCount: 2,
      buckets: [
        { type: 'message', ageBucket: '<1h', count: 2, bytes: 800 },
        { type: 'other', ageBucket: 'unknown', count: 1, bytes: 300 }
      ],
      codes: [
        { type: 'yell', code: 'nostrDbSync_push_kpkr', count: 2, bytes: 900 }
      ]
    }
  })
  assert.equal(JSON.stringify(syncErrorDetails(error)).includes('secret'), false)
})

test('paused diagnostics never expose arbitrary error properties', () => {
  const error = Object.assign(new Error('PUBLISH_FAILED'), {
    cause: Object.assign(new Error('PRIVATE_MESSENGER_PAUSED'), {
      code: 'PRIVATE_MESSENGER_PAUSED',
      pauseReasons: ['storage', '', 'capacity'],
      payload: 'secret'
    })
  })
  assert.deepEqual(syncErrorDetails(error), {
    code: 'PRIVATE_MESSENGER_PAUSED',
    pauseReasons: ['storage', 'capacity']
  })
})
