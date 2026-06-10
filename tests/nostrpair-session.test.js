import test from 'node:test'
import assert from 'node:assert/strict'
import { HostSession, JoinerSession } from '../docs/services/nostrpair.js'
import { buildNostrpairUrl } from '../docs/helpers/nostrpair-url.js'

const PUBKEY = 'a'.repeat(64)
const RELAY = 'wss://relay.example'

function nostrpairUrl () {
  return buildNostrpairUrl({ pubkey: PUBKEY, relay: RELAY, secret: 'pair-secret' })
}

function deferred () {
  let resolve
  let reject
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks (turns = 6) {
  for (let i = 0; i < turns; i++) await Promise.resolve()
}

function gatedPool (gate, calls) {
  return {
    ensureRelay: async (relay, options) => {
      calls.push({ type: 'ensureRelay', relay, options })
      await gate.promise
      return {
        subscribe: (filters, handlers) => {
          calls.push({ type: 'subscribe', filters, handlers })
          return {
            close: () => calls.push({ type: 'close' })
          }
        }
      }
    }
  }
}

test('host start waits for the pairing relay subscription before resolving', async () => {
  const gate = deferred()
  const calls = []
  const session = new HostSession({ _pool: gatedPool(gate, calls) })
  let started = false
  const startPromise = session.start().then(() => { started = true })

  await flushMicrotasks()

  assert.equal(started, false)
  assert.deepEqual(calls.map(call => call.type), ['ensureRelay'])

  gate.resolve()
  await startPromise

  assert.equal(started, true)
  assert.deepEqual(calls.map(call => call.type), ['ensureRelay', 'subscribe'])
  session.close()
})

test('joiner connect publishes only after its reply subscription is ready', async () => {
  const gate = deferred()
  const calls = []
  const session = new JoinerSession(nostrpairUrl(), {
    _pool: gatedPool(gate, calls),
    _publishFrame: async () => { calls.push({ type: 'publish' }) }
  })
  const connectPromise = session.connect().catch(err => err)

  await flushMicrotasks()

  assert.deepEqual(calls.map(call => call.type), ['ensureRelay'])

  gate.resolve()
  await flushMicrotasks()

  assert.deepEqual(calls.map(call => call.type), ['ensureRelay', 'subscribe', 'publish'])
  session.close()
  const err = await connectPromise
  assert.equal(err.message, 'SYNC_CANCELLED')
})

test('exchangeAccounts rejects when the pairing relay rejects the publish', async () => {
  const session = new JoinerSession(nostrpairUrl(), {
    _publishFrame: async () => { throw new Error('PAIRING_PUBLISH_FAILED') }
  })

  await assert.rejects(
    () => session.exchangeAccounts({ code: '123456', platform: 'test', accounts: [] }),
    /PAIRING_PUBLISH_FAILED/
  )
  session.close()
})

test('exchangeAccounts times out when no reply arrives', async () => {
  const session = new JoinerSession(nostrpairUrl(), {
    _exchangeTimeoutMs: 5,
    _publishFrame: async () => {}
  })

  await assert.rejects(
    () => session.exchangeAccounts({ code: '123456', platform: 'test', accounts: [] }),
    /SYNC_TIMEOUT/
  )
  session.close()
})
