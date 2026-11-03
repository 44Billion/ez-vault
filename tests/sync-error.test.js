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
