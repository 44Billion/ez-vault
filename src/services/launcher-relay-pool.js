import { relayPool } from 'libp2r2p/relay'

// Hard-coded kill switch: flip to false to keep the vault on direct sockets.
export const ENABLE_LAUNCHER_RELAY_POOL = true

// Same protocol as 44billion's dedicated relay bridge port.
const RELAY_BRIDGE = {
  ATTACH: 'RELAY_ATTACH',
  ATTACHED: 'RELAY_ATTACHED',
  SEND: 'RELAY_SEND',
  FRAME: 'RELAY_FRAME',
  CREDIT: 'RELAY_CREDIT',
  CLOSE: 'RELAY_CLOSE',
  CLOSED: 'RELAY_CLOSED',
  DETACH: 'RELAY_DETACH'
}

const BRIDGE_CREDIT_FRAMES = 64
const BRIDGE_CREDIT_BYTES = 256 * 1024
const MAX_QUEUED_FRAMES = 256
const MAX_QUEUED_BYTES = 1024 * 1024

function domException (message, name) {
  return typeof DOMException === 'function'
    ? new DOMException(message, name)
    : Object.assign(new Error(message), { name })
}

function dataByteLength (data) {
  if (typeof data === 'string') return data.length
  if (data instanceof ArrayBuffer) return data.byteLength
  if (ArrayBuffer.isView(data)) return data.byteLength
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.size
  return 0
}

function isSendableData (data) {
  return typeof data === 'string' ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data) ||
    (typeof Blob !== 'undefined' && data instanceof Blob)
}

function isValidCloseCode (code) {
  return code === 1000 || (code >= 3000 && code <= 4999)
}

function messageEvent (data) {
  if (typeof MessageEvent === 'function') return new MessageEvent('message', { data, origin: '' })
  const event = new Event('message')
  event.data = data
  event.origin = ''
  return event
}

function closeEvent (code, reason, wasClean) {
  if (typeof CloseEvent === 'function') return new CloseEvent('close', { code, reason, wasClean })
  const event = new Event('close')
  event.code = code
  event.reason = reason
  event.wasClean = wasClean
  return event
}

// Native WebSocket.prototype exposes these as getter-only accessors, so the
// facade must define own data properties instead of assigning through the
// prototype chain.
function defineOwnValue (target, key, value) {
  Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: true })
}

function resolveSocketUrl (rawUrl, baseUrl, securePage) {
  let parsed
  try {
    parsed = new URL(rawUrl, baseUrl)
  } catch {
    throw domException(`Failed to construct 'WebSocket': The URL '${rawUrl}' is invalid.`, 'SyntaxError')
  }
  if (parsed.hash) throw domException(`Failed to construct 'WebSocket': The URL '${rawUrl}' contains a fragment.`, 'SyntaxError')
  if (parsed.protocol === 'http:') parsed.protocol = 'ws:'
  else if (parsed.protocol === 'https:') parsed.protocol = 'wss:'
  if (securePage && parsed.protocol === 'ws:') parsed.protocol = 'wss:'
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw domException("Failed to construct 'WebSocket': The URL's scheme must be either 'ws' or 'wss'.", 'SyntaxError')
  }
  return parsed.href
}

export function shouldUseLauncherRelayPool (payload, { enabled = ENABLE_LAUNCHER_RELAY_POOL } = {}) {
  return enabled === true && payload?.relayPoolSupported === true && payload?.relayPoolEnabled === true
}

// The vault side is a thin pipe: the launcher owns the real virtual socket
// (registry, speculative connect, pool adoption and fallback all live there)
// and this facade only mirrors the WebSocket API over the dedicated port.
export function installLauncherRelayPoolShim ({
  port,
  enabled = ENABLE_LAUNCHER_RELAY_POOL,
  targetWindow = window,
  baseUrl = document.baseURI,
  securePage = location.protocol === 'https:',
  relayPoolImpl = relayPool,
  log = () => {}
} = {}) {
  if (!enabled || !port || typeof port.postMessage !== 'function') return null
  const OriginalWebSocket = targetWindow.WebSocket
  if (typeof OriginalWebSocket !== 'function') return null

  let serial = 0
  const sockets = new Map()

  const onPortMessage = event => {
    const message = event.data
    const virtualId = message?.payload?.virtualId
    if (!virtualId) return
    sockets.get(virtualId)?._receive(message)
  }
  port.addEventListener('message', onPortMessage)
  port.start?.()

  class LauncherRelayPoolWebSocket extends EventTarget {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3

    onopen = null
    onmessage = null
    onerror = null
    onclose = null

    #virtualId
    #creditFrames = BRIDGE_CREDIT_FRAMES
    #creditBytes = BRIDGE_CREDIT_BYTES
    #queue = []
    #queuedBytes = 0
    #grantedFrames = 0
    #grantedBytes = 0
    #creditScheduled = false
    #binaryType = 'blob'

    constructor (url, protocols) {
      super()
      const protocolList = protocols === undefined
        ? []
        : (typeof protocols === 'string' ? [protocols] : Array.from(protocols))
      if (protocolList.length > 0) return new OriginalWebSocket(url, protocols)
      const resolved = resolveSocketUrl(String(url), baseUrl, securePage)
      defineOwnValue(this, 'url', resolved)
      defineOwnValue(this, 'readyState', 0)
      defineOwnValue(this, 'protocol', '')
      defineOwnValue(this, 'extensions', '')
      this.#virtualId = `vault-relay-${++serial}`
      sockets.set(this.#virtualId, this)
      port.postMessage({
        code: RELAY_BRIDGE.ATTACH,
        payload: { virtualId: this.#virtualId, url: resolved }
      })
    }

    get binaryType () {
      return this.#binaryType
    }

    set binaryType (value) {
      if (value !== 'blob' && value !== 'arraybuffer') {
        throw domException(`Failed to set the 'binaryType' property on 'WebSocket': The provided value '${value}' is not valid.`, 'SyntaxError')
      }
      this.#binaryType = value
    }

    get bufferedAmount () {
      return this.#queuedBytes
    }

    send (data) {
      if (this.readyState === LauncherRelayPoolWebSocket.CONNECTING) {
        throw domException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.", 'InvalidStateError')
      }
      if (this.readyState !== LauncherRelayPoolWebSocket.OPEN) return
      if (!isSendableData(data)) {
        throw new TypeError("Failed to execute 'send' on 'WebSocket': The provided value is not of type '(ArrayBuffer or ArrayBufferView or Blob or string)'.")
      }
      const size = dataByteLength(data)
      if (this.#queue.length > 0 || this.#creditFrames < 1 || this.#creditBytes < size) {
        this.#queue.push(data)
        this.#queuedBytes += size
        if (this.#queue.length > MAX_QUEUED_FRAMES || this.#queuedBytes > MAX_QUEUED_BYTES) {
          port.postMessage({ code: RELAY_BRIDGE.CLOSE, payload: { virtualId: this.#virtualId, code: 1000, reason: '' } })
          this.#finalizeClose(1013, 'relay bridge queue overflow', false)
        }
        return
      }
      this.#consumeCredit(size)
      port.postMessage({ code: RELAY_BRIDGE.SEND, payload: { virtualId: this.#virtualId, data } })
    }

    close (code = 1000, reason = '') {
      if (!isValidCloseCode(code)) {
        throw domException("Failed to execute 'close' on 'WebSocket': The close code must be either 1000 or in the range 3000 to 4999.", 'InvalidAccessError')
      }
      if (this.readyState === LauncherRelayPoolWebSocket.CLOSING || this.readyState === LauncherRelayPoolWebSocket.CLOSED) return
      this.#clearBuffers()
      if (this.readyState === LauncherRelayPoolWebSocket.CONNECTING) {
        defineOwnValue(this, 'readyState', LauncherRelayPoolWebSocket.CLOSING)
        port.postMessage({ code: RELAY_BRIDGE.CLOSE, payload: { virtualId: this.#virtualId, code, reason } })
        queueMicrotask(() => this.#finalizeClose(1006, '', false))
        return
      }
      defineOwnValue(this, 'readyState', LauncherRelayPoolWebSocket.CLOSING)
      port.postMessage({ code: RELAY_BRIDGE.CLOSE, payload: { virtualId: this.#virtualId, code, reason } })
    }

    _receive (message) {
      if (this.readyState === LauncherRelayPoolWebSocket.CLOSED) return
      if (this.readyState === LauncherRelayPoolWebSocket.CLOSING && message.code !== RELAY_BRIDGE.CLOSED && message.code !== RELAY_BRIDGE.DETACH) return
      const payload = message.payload ?? {}
      switch (message.code) {
        case RELAY_BRIDGE.ATTACHED:
          if (typeof payload.url === 'string') defineOwnValue(this, 'url', payload.url)
          defineOwnValue(this, 'extensions', payload.extensions ?? '')
          defineOwnValue(this, 'readyState', LauncherRelayPoolWebSocket.OPEN)
          this.#fire('open')
          this.#flushQueue()
          break
        case RELAY_BRIDGE.FRAME: {
          const data = payload.data
          this.#grantCredit(dataByteLength(data))
          this.#fire('message', messageEvent(data))
          break
        }
        case RELAY_BRIDGE.CREDIT:
          this.#creditFrames += payload.frames ?? 0
          this.#creditBytes += payload.bytes ?? 0
          this.#flushQueue()
          break
        case RELAY_BRIDGE.CLOSED:
          this.#finalizeClose(payload.code ?? 1006, payload.reason ?? '', payload.wasClean === true)
          break
        case RELAY_BRIDGE.DETACH:
          this.#finalizeClose(1006, payload.reason ?? 'relay pool unavailable', false)
          break
      }
    }

    #consumeCredit (size) {
      this.#creditFrames--
      this.#creditBytes -= size
    }

    #grantCredit (size) {
      this.#grantedFrames++
      this.#grantedBytes += size
      if (this.#creditScheduled) return
      this.#creditScheduled = true
      queueMicrotask(() => {
        this.#creditScheduled = false
        if (this.readyState !== LauncherRelayPoolWebSocket.OPEN) return
        if (this.#grantedFrames === 0 && this.#grantedBytes === 0) return
        port.postMessage({
          code: RELAY_BRIDGE.CREDIT,
          payload: { virtualId: this.#virtualId, frames: this.#grantedFrames, bytes: this.#grantedBytes }
        })
        this.#grantedFrames = 0
        this.#grantedBytes = 0
      })
    }

    #flushQueue () {
      while (this.#queue.length > 0 && this.readyState === LauncherRelayPoolWebSocket.OPEN) {
        const data = this.#queue[0]
        const size = dataByteLength(data)
        if (this.#creditFrames < 1 || this.#creditBytes < size) return
        this.#queue.shift()
        this.#queuedBytes -= size
        this.#consumeCredit(size)
        port.postMessage({ code: RELAY_BRIDGE.SEND, payload: { virtualId: this.#virtualId, data } })
      }
    }

    #clearBuffers () {
      this.#queue.length = 0
      this.#queuedBytes = 0
      this.#grantedFrames = 0
      this.#grantedBytes = 0
    }

    #finalizeClose (code, reason, wasClean) {
      if (this.readyState === LauncherRelayPoolWebSocket.CLOSED) return
      sockets.delete(this.#virtualId)
      this.#clearBuffers()
      defineOwnValue(this, 'readyState', LauncherRelayPoolWebSocket.CLOSED)
      this.#fire('close', closeEvent(code, reason, wasClean))
    }

    #fire (type, event = new Event(type)) {
      this.dispatchEvent(event)
      const handler = this[`on${type}`]
      if (typeof handler === 'function') handler(event)
    }
  }

  Object.defineProperties(LauncherRelayPoolWebSocket.prototype, {
    CONNECTING: { value: 0 },
    OPEN: { value: 1 },
    CLOSING: { value: 2 },
    CLOSED: { value: 3 }
  })
  // Keep `instanceof` working against the original constructor and inherit its
  // static constants without changing the class constructor prototype.
  Object.setPrototypeOf(LauncherRelayPoolWebSocket.prototype, OriginalWebSocket.prototype)
  for (const key of Object.getOwnPropertyNames(OriginalWebSocket)) {
    if (key === 'prototype' || key === 'length' || key === 'name') continue
    const descriptor = Object.getOwnPropertyDescriptor(OriginalWebSocket, key)
    if (!descriptor || typeof descriptor.value === 'function') continue
    try { Object.defineProperty(LauncherRelayPoolWebSocket, key, descriptor) } catch {}
  }

  targetWindow.WebSocket = LauncherRelayPoolWebSocket
  relayPoolImpl.setWebSocket?.(LauncherRelayPoolWebSocket)
  relayPoolImpl.disconnectAll?.()?.catch?.(error => log('[vault-relay-pool] disconnectAll failed', error))
  return {
    WebSocket: LauncherRelayPoolWebSocket,
    dispose () {
      port.removeEventListener('message', onPortMessage)
      for (const socket of [...sockets.values()]) socket.close(1000, '')
      sockets.clear()
    }
  }
}
