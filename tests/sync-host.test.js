import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import * as secrets from '../docs/services/secrets.js'

const storage = new Map()
const styles = new Map()
const toastMessages = []

globalThis.localStorage = {
  clear: () => storage.clear(),
  getItem: key => storage.has(String(key)) ? storage.get(String(key)) : null,
  removeItem: key => { storage.delete(String(key)) },
  setItem: (key, value) => { storage.set(String(key), String(value)) }
}

if (!globalThis.crypto) globalThis.crypto = webcrypto
if (!globalThis.btoa) globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64')
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary')

function classList () {
  const values = new Set()
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value),
    toggle: (value, force) => {
      const on = force === undefined ? !values.has(value) : Boolean(force)
      if (on) values.add(value)
      else values.delete(value)
      return on
    }
  }
}

function fakeElement () {
  const attrs = new Map()
  const listeners = new Map()
  const element = {
    src: '',
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    dataset: {},
    classList: classList(),
    addEventListener: (type, fn) => listeners.set(type, fn),
    click: () => listeners.get('click')?.(),
    focus: () => {},
    select: () => {},
    setAttribute: (name, value = '') => {
      attrs.set(name, String(value))
      if (name === 'src') element.src = String(value)
    },
    removeAttribute: name => {
      attrs.delete(name)
      if (name === 'src') element.src = ''
    },
    hasAttribute: name => attrs.has(name),
    toggleAttribute: (name, force) => {
      const on = force === undefined ? !attrs.has(name) : Boolean(force)
      if (on) attrs.set(name, '')
      else attrs.delete(name)
      return on
    }
  }
  return element
}

class FakeHTMLElement {
  constructor () {
    this.dataset = {}
    this.classList = classList()
    this.isConnected = true
    this._attrs = new Map()
    this._children = new Map()
  }

  set innerHTML (value) { this._html = value }
  get innerHTML () { return this._html || '' }

  querySelector (selector) {
    if (!this._children.has(selector)) this._children.set(selector, fakeElement())
    return this._children.get(selector)
  }

  addEventListener () {}
  removeEventListener () {}
  setAttribute (name, value = '') { this._attrs.set(name, String(value)) }
  removeAttribute (name) { this._attrs.delete(name) }
  hasAttribute (name) { return this._attrs.has(name) }
  toggleAttribute (name, force) {
    const on = force === undefined ? !this._attrs.has(name) : Boolean(force)
    if (on) this._attrs.set(name, '')
    else this._attrs.delete(name)
    return on
  }
  remove () { this.isConnected = false }
}

globalThis.HTMLElement = FakeHTMLElement
globalThis.customElements = { define: () => {} }
globalThis.fetch = async () => { throw new Error('no favicon in tests') }
globalThis.window = {
  location: { hostname: 'localhost' },
  PublicKeyCredential: {}
}
globalThis.document = {
  getElementById: id => styles.get(id) || null,
  createElement: tag => {
    if (tag === 'toast-message') {
      return {
        isConnected: false,
        isClosing: false,
        pushMessage: entry => toastMessages.push(entry),
        closeToast: () => {},
        remove: () => {}
      }
    }
    return fakeElement()
  },
  head: {
    appendChild: element => {
      if (element.id) styles.set(element.id, element)
    }
  },
  body: {
    appendChild: element => { element.isConnected = true }
  }
}

const { SyncHost } = await import('../docs/components/sync/sync-host.js')

function deferred () {
  let resolve
  let reject
  // eslint-disable-next-line promise/param-names
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function credential () {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 1
  return {
    rawId: new Uint8Array([1, 2, 3, 4]),
    authenticatorAttachment: 'platform',
    getClientExtensionResults: () => ({
      prf: { results: { first: prfBytes } }
    })
  }
}

async function flushMicrotasks (turns = 8) {
  for (let i = 0; i < turns; i++) await Promise.resolve()
}

function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function mountHost () {
  const host = new SyncHost()
  host.connectedCallback()
  return host
}

function setNavigator (navigatorValue) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: navigatorValue
  })
}

afterEach(() => {
  secrets.lock()
  globalThis.localStorage.clear()
  toastMessages.length = 0
})

test('sync-host stays collapsed while passkey preparation is pending', async () => {
  const gate = deferred()
  let createCalls = 0
  setNavigator({
    userAgent: 'Node Test',
    credentials: {
      create: async () => {
        createCalls += 1
        return gate.promise
      }
    }
  })

  const list = { enterCalls: 0, exitCalls: 0, enterSelectionMode () { this.enterCalls += 1 }, exitSelectionMode () { this.exitCalls += 1 } }
  let closed = 0
  const host = mountHost()
  host.list = list
  host.onClosed = () => { closed += 1 }

  host.open()
  await flushMicrotasks()

  assert.equal(createCalls, 1)
  assert.equal(host.hasAttribute('open'), false)
  assert.equal(list.enterCalls, 0)

  host.close()
  assert.equal(closed, 1)

  gate.resolve(credential())
  await flushMicrotasks()

  assert.equal(host.hasAttribute('open'), false)
  assert.equal(host.querySelector('.host-url').value, '')
  assert.equal(list.enterCalls, 0)
  assert.equal(list.exitCalls, 0)
})

test('sync-host keeps qr image loaded while close animation runs', async () => {
  const host = mountHost()
  let closed = 0
  host.onClosed = () => { closed += 1 }
  host.setAttribute('open', '')
  host.querySelector('.host-qr').src = 'data:image/png;base64,abc'
  host.querySelector('.host-url').value = 'nostrpair://example'

  host.close()

  assert.equal(closed, 1)
  assert.equal(host.hasAttribute('open'), false)
  assert.equal(host.querySelector('.host-qr').src, 'data:image/png;base64,abc')
  assert.equal(host.querySelector('.host-url').value, 'nostrpair://example')

  await wait(320)

  assert.equal(host.querySelector('.host-qr').src, '')
  assert.equal(host.querySelector('.host-url').value, '')
})

test('sync-host returns to picker and shows toast when passkey prompt is cancelled', async () => {
  setNavigator({
    userAgent: 'Node Test',
    credentials: {
      create: async () => {
        throw Object.assign(new Error('User cancelled'), { name: 'NotAllowedError' })
      }
    }
  })

  let closed = 0
  const host = mountHost()
  host.onClosed = () => { closed += 1 }

  host.open()
  await flushMicrotasks()

  assert.equal(host.hasAttribute('open'), false)
  assert.equal(closed, 1)
  assert.deepEqual(toastMessages.at(-1), {
    type: 'error',
    message: 'Pairing cancelled',
    longMessage: 'The passkey prompt was cancelled.'
  })
})
