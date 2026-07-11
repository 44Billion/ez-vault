import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { pool, publish } from '../docs/services/relay.js'

const originalPublish = pool.publish

afterEach(() => {
  pool.publish = originalPublish
})

function deferred () {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('relay publish uses the renamed early and overall timeout options', async () => {
  const first = deferred()
  const second = deferred()
  pool.publish = () => [first.promise, second.promise]

  const pending = publish({ id: 'event' }, ['wss://a.example', 'wss://b.example'], {
    timeoutUntilFirstFulfillment: null,
    timeout: 20
  })
  let returned = false
  pending.then(() => { returned = true })

  await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(!returned, 'null must disable only the early fulfillment timer')

  const early = await pending
  const full = await early.promise
  assert.equal(early.success, false)
  assert.deepEqual(full.errors.map(({ relay, reason }) => [relay, reason.message]), [
    ['wss://a.example', 'PUBLISH_TIMEOUT'],
    ['wss://b.example', 'PUBLISH_TIMEOUT']
  ])

  first.resolve()
  second.reject(new Error('late failure'))
})

test('relay publish can disable both timers until a relay fulfills', async () => {
  const result = deferred()
  pool.publish = () => [result.promise]

  const pending = publish({ id: 'event' }, ['wss://a.example'], {
    timeout: null,
    timeoutUntilFirstFulfillment: null
  })
  await Promise.resolve()
  result.resolve()

  const early = await pending
  assert.equal(early.success, true)
  assert.equal((await early.promise).success, true)
})

test('an unsuccessful early fulfillment window closes the local publish report', async () => {
  const result = deferred()
  pool.publish = () => [result.promise]

  const early = await publish({ id: 'event' }, ['wss://a.example'], {
    timeout: 1000,
    timeoutUntilFirstFulfillment: 10
  })
  const full = await early.promise

  assert.equal(early.success, false)
  assert.equal(full.success, false)
  assert.equal(full.errors[0].reason.message, 'PUBLISH_TIMEOUT')

  result.resolve()
})
