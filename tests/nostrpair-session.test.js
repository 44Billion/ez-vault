import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import { HostSession, JoinerSession } from '../docs/services/nostrpair.js'

const tick = () => new Promise(resolve => setImmediate(resolve))

class FakeLiveStream {
  #events = []
  #waiters = []
  #ready = Promise.withResolvers()
  #readyRelays = []
  #closed = false

  constructor (relays) {
    this.relays = [...relays]
    this.ready = this.#ready.promise
  }

  get readyRelays () { return Object.freeze([...this.#readyRelays]) }

  setReady (relays = this.relays, errors = []) {
    this.#readyRelays = [...relays]
    this.#ready.resolve({ relays: Object.freeze([...relays]), errors: Object.freeze([...errors]) })
  }

  emit (event) {
    if (this.#closed) return
    const waiter = this.#waiters.shift()
    if (waiter) waiter({ value: event, done: false })
    else this.#events.push(event)
  }

  close () {
    if (this.#closed) return
    this.#closed = true
    this.#readyRelays = []
    for (const waiter of this.#waiters.splice(0)) waiter({ value: undefined, done: true })
  }

  async next () {
    if (this.#events.length) return { value: this.#events.shift(), done: false }
    if (this.#closed) return { value: undefined, done: true }
    return new Promise(resolve => this.#waiters.push(resolve))
  }

  async return () {
    this.close()
    return { value: undefined, done: true }
  }

  [Symbol.asyncIterator] () { return this }
}

function matches (event, filter) {
  if (filter.kinds?.length && !filter.kinds.includes(event.kind)) return false
  if (filter.authors?.length && !filter.authors.includes(event.pubkey)) return false
  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith('#')) continue
    const tagName = key.slice(1)
    if (!event.tags.some(tag => tag[0] === tagName && values.includes(tag[1]))) return false
  }
  return true
}

class LoopbackRelayPool {
  constructor ({ autoReady = true, failSend = false } = {}) {
    this.autoReady = autoReady
    this.failSend = failSend
    this.streams = []
    this.calls = []
  }

  getLiveEventsGenerator (filter, relays, options) {
    const stream = new FakeLiveStream(relays)
    this.streams.push({ filter, relays, options, stream })
    this.calls.push({ type: 'subscribe', filter, relays })
    options.signal?.addEventListener('abort', () => stream.close(), { once: true })
    if (this.autoReady) queueMicrotask(() => stream.setReady())
    return stream
  }

  async sendEvent (event, relays) {
    this.calls.push({ type: 'publish', event, relays })
    if (this.failSend) {
      const reason = new Error('PAIRING_PUBLISH_FAILED')
      return {
        success: false,
        promise: Promise.resolve({ success: false, errors: [{ relay: relays[0], reason }] })
      }
    }
    queueMicrotask(() => {
      for (const { filter, stream } of this.streams) {
        if (matches(event, filter)) stream.emit(event)
      }
    })
    return { success: true, promise: Promise.resolve({ success: true, errors: [] }) }
  }
}

function nostrpairUrl () {
  return `nostrpair://${getPublicKey(generateSecretKey())}?relay=wss%3A%2F%2Frelay.example&secret=once`
}

test('host start waits for RelayPool live readiness', async () => {
  const relayPool = new LoopbackRelayPool({ autoReady: false })
  const session = new HostSession({ _relayPool: relayPool })
  let started = false
  const pending = session.start().then(() => { started = true })

  await tick()
  assert.equal(started, false)
  assert.deepEqual(relayPool.calls.map(call => call.type), ['subscribe'])

  relayPool.streams[0].stream.setReady()
  await pending
  assert.equal(started, true)
  session.close()
})

test('joiner publishes connect only after its response listener is ready', async () => {
  const relayPool = new LoopbackRelayPool({ autoReady: false })
  const session = new JoinerSession(nostrpairUrl(), { _relayPool: relayPool })
  const pending = session.connect().catch(error => error)

  await tick()
  assert.deepEqual(relayPool.calls.map(call => call.type), ['subscribe'])

  relayPool.streams[0].stream.setReady()
  await tick()
  assert.deepEqual(relayPool.calls.map(call => call.type), ['subscribe', 'publish'])

  session.close()
  assert.equal((await pending).message, 'SYNC_CANCELLED')
})

test('host and joiner complete positional trust and account RPCs then logout', async () => {
  const relayPool = new LoopbackRelayPool()
  const hostSignerPubkey = getPublicKey(generateSecretKey())
  const joinerSignerPubkey = getPublicKey(generateSecretKey())
  const hostAccounts = [{ type: 'npub', pubkey: '1'.repeat(64), value: 'npub-host' }]
  const joinerAccounts = [{ type: 'npub', pubkey: '2'.repeat(64), value: 'npub-joiner' }]
  let hostCode = ''
  let joinerCode = ''
  let hostTrust
  let hostExchange

  const host = new HostSession({
    _relayPool: relayPool,
    onPairingCode: code => { hostCode = code },
    onTrustedSignerReceived: value => {
      hostTrust = value
      return { platform: 'Host OS', signerPubkey: hostSignerPubkey }
    },
    onExchangeRequest: value => {
      hostExchange = value
      return { platform: 'Host OS', accounts: hostAccounts }
    }
  })
  await host.start()

  let peerTrust
  const joiner = new JoinerSession(host.url, {
    _relayPool: relayPool,
    onPairingCode: code => { joinerCode = code }
  })
  await joiner.connect()
  peerTrust = await joiner.exchangeTrust({ platform: 'Joiner OS', signerPubkey: joinerSignerPubkey })
  const reply = await joiner.exchangeAccounts({
    code: joinerCode,
    platform: 'Joiner OS',
    accounts: joinerAccounts
  })

  assert.equal(hostCode, joinerCode)
  assert.deepEqual(hostTrust, { platform: 'Joiner OS', signerPubkey: joinerSignerPubkey })
  assert.deepEqual(peerTrust, { platform: 'Host OS', signerPubkey: hostSignerPubkey })
  assert.deepEqual(hostExchange, { platform: 'Joiner OS', accounts: joinerAccounts })
  assert.deepEqual(reply, { platform: 'Host OS', accounts: hostAccounts })
  assert.ok(relayPool.calls.filter(call => call.type === 'publish').length >= 8)
  host.close()
})

test('exchangeAccounts surfaces publish failure and response timeout', async () => {
  const failed = new JoinerSession(nostrpairUrl(), {
    _relayPool: new LoopbackRelayPool({ failSend: true }),
    _exchangeTimeout: 20
  })
  await assert.rejects(
    failed.exchangeAccounts({ code: '123456', platform: 'test', accounts: [] }),
    /PAIRING_PUBLISH_FAILED/
  )
  failed.close()

  const timedOut = new JoinerSession(nostrpairUrl(), {
    _relayPool: new LoopbackRelayPool(),
    _exchangeTimeout: 5
  })
  await assert.rejects(
    timedOut.exchangeAccounts({ code: '123456', platform: 'test', accounts: [] }),
    /SYNC_TIMEOUT/
  )
  timedOut.close()
})
