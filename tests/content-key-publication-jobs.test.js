import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createContentKeyPublicationJobs } from '../src/services/content-key/publication-jobs.js'

function fixture ({ random = () => 0.5 } = {}) {
  let time = 0, sequence = 0, connected = true
  const timers = new Map(), keys = new Map([['owner', 'key']]), listeners = new Set(), errors = []
  const jobs = createContentKeyPublicationJobs({
    current: (owner, key) => keys.get(owner) === key,
    online: () => connected, onOnline: callback => { listeners.add(callback); return () => listeners.delete(callback) },
    onError: error => errors.push(error), now: () => time, random,
    setTimer: (fn, ms) => { const id = ++sequence; timers.set(id, { fn, at: time + ms }); return id }, clearTimer: id => timers.delete(id)
  })
  return {
    jobs, keys, errors, timers, listeners, setOnline: value => { connected = value }, async advance (ms) {
      time += ms
      for (const [id, task] of [...timers]) if (task.at <= time) { timers.delete(id); task.fn(); await jobs.idle() }
    }
  }
}

test('publication jobs coalesce sends and keep their backoff deadline across new requests', async () => {
  const f = fixture(); let attempts = 0
  const run = async () => { attempts++; if (attempts < 3) throw new Error('unavailable'); return 'published' }
  const first = f.jobs.request('owner', 'key', run)
  await assert.rejects(first, /unavailable/)
  await f.jobs.idle()
  const deadline = [...f.timers.values()][0].at
  assert.equal(f.jobs.request('owner', 'key', run), first)
  assert.equal([...f.timers.values()][0].at, deadline)
  await f.advance(1000)
  assert.equal(attempts, 2)
  await f.advance(1999)
  assert.equal(attempts, 2)
  await f.advance(1)
  assert.equal(attempts, 3)
  assert.equal(await f.jobs.request('owner', 'key', run), 'published')
  assert.equal(attempts, 3)
  f.jobs.clear()
})

test('rotations fence stale work and the global worker serializes accounts', async () => {
  const f = fixture(), gate = Promise.withResolvers(), entered = Promise.withResolvers()
  let staleSignal, secondStarted = false
  const first = f.jobs.request('owner', 'key', async signal => { staleSignal = signal; entered.resolve(); await gate.promise; signal.throwIfAborted() })
  await entered.promise
  f.keys.set('owner', 'new-key'); f.jobs.reconcile()
  const second = f.jobs.request('owner', 'new-key', async () => { secondStarted = true; return 'new' })
  assert.equal(staleSignal.aborted, true)
  assert.equal(secondStarted, false)
  gate.resolve(); await f.jobs.idle(); await f.advance(0)
  assert.deepEqual(await first, { skipped: 'superseded' })
  assert.equal(await second, 'new')
  assert.equal(f.errors.length, 0)
  f.jobs.clear()
})

test('offline publication waits for connectivity and close releases its listener', async () => {
  const f = fixture(); let attempts = 0
  f.setOnline(false)
  const result = f.jobs.request('owner', 'key', async () => { attempts++ })
  await f.jobs.idle()
  assert.equal(attempts, 0)
  assert.equal(f.listeners.size, 1)
  assert.equal(f.timers.size, 0)
  f.jobs.clear()
  assert.equal(f.listeners.size, 0)
  assert.deepEqual(await result, { skipped: 'closed' })
})

test('reconciliation checks the base account of a derived identity', async () => {
  const gate = Promise.withResolvers(), entered = Promise.withResolvers()
  let enabled = true, signal
  const jobs = createContentKeyPublicationJobs({
    current: (owner, key, account) => enabled && owner === 'derived' && key === 'key' && account === 'base',
    online: () => true, onOnline: () => () => {}, onError: assert.fail
  })
  const result = jobs.request('derived', 'key', async value => { signal = value; entered.resolve(); await gate.promise; value.throwIfAborted(); return 'published' }, { accountPubkey: 'base' })
  await entered.promise
  jobs.reconcile()
  assert.equal(signal.aborted, false)
  enabled = false; jobs.reconcile()
  assert.equal(signal.aborted, true)
  gate.resolve(); await jobs.idle()
  assert.deepEqual(await result, { skipped: 'superseded' })
  jobs.clear()
})

test('retry jitter never schedules before the one-second lower bound', async () => {
  const f = fixture({ random: () => 0 })
  await assert.rejects(f.jobs.request('owner', 'key', async () => { throw new Error('offline') }))
  await f.jobs.idle()
  assert.equal([...f.timers.values()][0].at, 1000)
  f.jobs.clear()
})
