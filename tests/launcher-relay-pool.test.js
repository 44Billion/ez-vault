import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import {
  installLauncherRelayPoolShim,
  shouldUseLauncherRelayPool
} from '../src/services/launcher-relay-pool.js'

class FakeOriginalWebSocket extends EventTarget {
  static instances = []

  constructor (url, protocols) {
    super()
    this._url = url
    this._protocols = protocols
    this.readyState = 0
    FakeOriginalWebSocket.instances.push(this)
  }

  // Native WebSocket exposes these as getter-only accessors.
  get url () { return this._url }
  get protocol () { return '' }
  get extensions () { return '' }
  get bufferedAmount () { return 0 }

  send () {}
  close () {}
}

class FakePort extends EventTarget {
  constructor () {
    super()
    this.sent = []
  }

  postMessage (message) {
    this.sent.push(message)
  }

  start () {}

  emit (data) {
    this.dispatchEvent(Object.assign(new Event('message'), { data }))
  }
}

const tick = () => new Promise(resolve => setImmediate(resolve))

function createFixture ({ enabled = true } = {}) {
  const port = new FakePort()
  const targetWindow = { WebSocket: FakeOriginalWebSocket }
  const relayPoolImpl = {
    setWebSocket (impl) {
      this.impl = impl
    },
    disconnectAll () {
      this.disconnected = true
      return Promise.resolve()
    }
  }
  const shim = installLauncherRelayPoolShim({
    port,
    enabled,
    targetWindow,
    baseUrl: 'https://vault.example/',
    securePage: true,
    relayPoolImpl,
    log: () => {}
  })
  return { port, targetWindow, relayPoolImpl, shim }
}

function attachFrame (port) {
  const attaches = port.sent.filter(message => message.code === 'RELAY_ATTACH')
  return attaches.at(-1).payload
}

describe('vault launcher relay pool shim', () => {
  beforeEach(() => {
    FakeOriginalWebSocket.instances = []
  })

  it('only activates when the launcher supports and enables the pool', () => {
    assert.equal(shouldUseLauncherRelayPool({ relayPoolSupported: true, relayPoolEnabled: true }), true)
    assert.equal(shouldUseLauncherRelayPool({ relayPoolSupported: true, relayPoolEnabled: false }), false)
    assert.equal(shouldUseLauncherRelayPool({ relayPoolSupported: false, relayPoolEnabled: true }), false)
    assert.equal(shouldUseLauncherRelayPool({ relayPoolSupported: true, relayPoolEnabled: true }, { enabled: false }), false)
    assert.equal(shouldUseLauncherRelayPool(null), false)
  })

  it('leaves window.WebSocket untouched when disabled', () => {
    const { targetWindow, relayPoolImpl, shim } = createFixture({ enabled: false })
    assert.equal(shim, null)
    assert.equal(targetWindow.WebSocket, FakeOriginalWebSocket)
    assert.equal(relayPoolImpl.impl, undefined)
  })

  it('installs the shim, injects it into libp2r2p and drops stale pooled connections', () => {
    const { targetWindow, relayPoolImpl, shim } = createFixture()
    assert.equal(typeof shim.WebSocket, 'function')
    assert.equal(targetWindow.WebSocket, shim.WebSocket)
    assert.equal(relayPoolImpl.impl, shim.WebSocket)
    assert.equal(relayPoolImpl.disconnected, true)
  })

  it('upgrades and pipes a relay socket through the launcher port', async () => {
    const { port, targetWindow } = createFixture()
    const socket = new targetWindow.WebSocket('ws://relay.example')
    const { virtualId } = attachFrame(port)
    assert.equal(socket.url, 'wss://relay.example/')
    assert.equal(attachFrame(port).url, 'wss://relay.example/')
    assert.equal(socket.readyState, socket.CONNECTING)
    assert.throws(() => socket.send('x'), /CONNECTING/)

    const events = []
    socket.onopen = () => events.push('open')
    socket.onmessage = event => events.push(event.data)
    socket.onclose = event => events.push(['close', event.code, event.wasClean])
    port.emit({ code: 'RELAY_ATTACHED', payload: { virtualId, url: 'wss://relay.example/', extensions: '' } })
    assert.deepEqual(events, ['open'])
    assert.equal(socket.readyState, socket.OPEN)

    socket.send('["REQ","sub1",{}]')
    assert.equal(port.sent.some(message => message.code === 'RELAY_SEND'), true)
    port.emit({ code: 'RELAY_FRAME', payload: { virtualId, data: '["EOSE","sub1"]' } })
    assert.deepEqual(events.at(-1), '["EOSE","sub1"]')

    socket.close(1000, '')
    assert.equal(port.sent.at(-1).code, 'RELAY_CLOSE')
    port.emit({ code: 'RELAY_CLOSED', payload: { virtualId, code: 1000, reason: '', wasClean: true } })
    assert.deepEqual(events.at(-1), ['close', 1000, true])
  })

  it('keeps non-empty subprotocols on the native WebSocket', () => {
    const { port, targetWindow } = createFixture()
    const socket = new targetWindow.WebSocket('wss://relay.example', ['nostr'])
    assert.equal(socket instanceof FakeOriginalWebSocket, true)
    assert.equal(port.sent.length, 0)
  })

  it('closes before open with 1006 and queues sends beyond the credit window', async () => {
    const { port, targetWindow } = createFixture()
    const socket = new targetWindow.WebSocket('wss://relay.example')
    const closes = []
    socket.onclose = event => closes.push([event.code, event.wasClean])
    socket.close(1000, '')
    await tick()
    assert.deepEqual(closes, [[1006, false]])
    assert.equal(port.sent.at(-1).code, 'RELAY_CLOSE')

    const second = new targetWindow.WebSocket('wss://relay.example')
    const secondAttach = attachFrame(port)
    port.emit({ code: 'RELAY_ATTACHED', payload: { virtualId: secondAttach.virtualId, url: second.url, extensions: '' } })
    for (let i = 0; i < 70; i++) second.send(`frame-${i}`)
    assert.equal(port.sent.filter(message => message.code === 'RELAY_SEND').length, 64)
    port.emit({ code: 'RELAY_CREDIT', payload: { virtualId: secondAttach.virtualId, frames: 6, bytes: 1024 } })
    assert.equal(port.sent.filter(message => message.code === 'RELAY_SEND').length, 70)
    second.close(1000, '')
    port.emit({ code: 'RELAY_CLOSED', payload: { virtualId: secondAttach.virtualId, code: 1000, reason: '', wasClean: true } })
  })
})

it('preserves send order when a small frame fits the credit left behind a queued large frame', () => {
  const { port, shim } = createFixture()
  const socket = new shim.WebSocket('wss://relay.example')
  const { virtualId } = attachFrame(port)
  port.emit({ code: 'RELAY_ATTACHED', payload: { virtualId } })
  const frames = ['a'.repeat(200 * 1024), 'b'.repeat(100 * 1024), '["CLOSE","history"]']
  frames.forEach(frame => socket.send(frame))
  assert.equal(port.sent.filter(message => message.code === 'RELAY_SEND').length, 1)
  port.emit({ code: 'RELAY_CREDIT', payload: { virtualId, frames: 1, bytes: frames[0].length } })
  assert.deepEqual(port.sent.filter(message => message.code === 'RELAY_SEND').map(message => message.payload.data), frames)
  assert.equal(socket.bufferedAmount, 0)
  shim.dispose()
})

for (const limit of ['frames', 'bytes']) {
  it(`notifies the launcher and releases the local queue on ${limit} overflow`, async () => {
    const { port, shim } = createFixture()
    const socket = new shim.WebSocket('wss://relay.example')
    const { virtualId } = attachFrame(port)
    port.emit({ code: 'RELAY_ATTACHED', payload: { virtualId } })
    const closes = []
    socket.onclose = event => closes.push([event.code, event.reason])
    const count = limit === 'frames' ? 64 + 257 : 6
    const frame = limit === 'frames' ? 'small' : 'x'.repeat(256 * 1024)
    for (let i = 0; i < count; i++) socket.send(frame)
    assert.deepEqual(closes, [[1013, 'relay bridge queue overflow']])
    assert.deepEqual(port.sent.find(message => message.code === 'RELAY_FAILURE'), {
      code: 'RELAY_FAILURE', payload: { url: socket.url, code: 1013, phase: 'bridge', wasClean: false }
    })
    assert.equal(socket.readyState, socket.CLOSED)
    assert.equal(socket.bufferedAmount, 0)
    assert.deepEqual(port.sent.at(-1), { code: 'RELAY_CLOSE', payload: { virtualId, code: 1000, reason: '' } })
    const sentCount = port.sent.length
    port.emit({ code: 'RELAY_CREDIT', payload: { virtualId, frames: 64, bytes: 256 * 1024 } })
    port.emit({ code: 'RELAY_ATTACHED', payload: { virtualId } })
    await tick()
    assert.equal(port.sent.length, sentCount)
    assert.equal(socket.readyState, socket.CLOSED)
    shim.dispose()
  })
}

it('forwards Nostr timing metadata unchanged without exposing internal context on events', () => {
  const { port, shim } = createFixture()
  const socket = new shim.WebSocket('wss://relay.example')
  const { virtualId } = attachFrame(port)
  port.emit({ code: 'RELAY_ATTACHED', payload: { virtualId } })
  const data = JSON.stringify(['CLOSED', 'sub', 'rate-limited: busy', { retry_after: 10, retry_at: 20 }])
  let received
  socket.onmessage = event => { received = event }
  port.emit({ code: 'RELAY_FRAME', payload: { virtualId, data, context: { origin: 'local', retryable: false } } })
  assert.equal(received.data, data)
  assert.deepEqual(Object.getOwnPropertyNames(received), Object.getOwnPropertyNames(new MessageEvent('message')))
  assert.equal(received.context, undefined)
  assert.equal(received.relayContext, undefined)
  shim.dispose()
})

it('returns trailing receive credit but suppresses it after close', async () => {
  const { port, shim } = createFixture()
  const socket = new shim.WebSocket('wss://relay.example')
  const { virtualId } = attachFrame(port)
  port.emit({ code: 'RELAY_ATTACHED', payload: { virtualId } })
  port.emit({ code: 'RELAY_FRAME', payload: { virtualId, data: 'one', sequence: 1 } })
  await tick()
  const credit = port.sent.at(-1)
  assert.equal(credit.code, 'RELAY_CREDIT')
  assert.equal(credit.payload.virtualId, virtualId)
  assert.equal(credit.payload.frames, 1)
  assert.equal(credit.payload.bytes, 3)
  assert.equal(credit.payload.through, 1)
  assert.ok(credit.payload.returnedAt >= credit.payload.receivedAt)
  socket.onmessage = () => socket.close()
  port.emit({ code: 'RELAY_FRAME', payload: { virtualId, data: 'two' } })
  await tick()
  assert.equal(port.sent.at(-1).code, 'RELAY_CLOSE')
  assert.equal(port.sent.filter(message => message.code === 'RELAY_CREDIT').length, 1)
  // An already in-flight attach must not resurrect a closing socket.
  port.emit({ code: 'RELAY_ATTACHED', payload: { virtualId } })
  assert.equal(socket.readyState, socket.CLOSING)
  shim.dispose()
})
