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
