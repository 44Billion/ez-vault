import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSwManager,
  isUpdateAvailable,
  STATE_AVAILABLE,
  STATE_NONE
} from '../src/services/sw-manager.js'

const originalSetInterval = globalThis.setInterval
const timers = []

function installGlobals ({ waiting = null, controller = true } = {}) {
  const controllerChangeListeners = []
  const newWorker = {
    state: 'installing',
    addEventListener: (type, cb) => {
      if (type === 'statechange') newWorker.statechange = cb
    },
    postMessage: () => {}
  }
  const registration = {
    waiting,
    installing: null,
    update: () => {},
    addEventListener: (type, cb) => {
      if (type === 'updatefound') registration.updatefound = cb
    }
  }
  const serviceWorker = {
    controller: controller ? {} : null,
    register: async (url, options) => {
      registration.registerCall = { url, options }
      return registration
    },
    addEventListener: (type, cb) => {
      if (type === 'controllerchange') controllerChangeListeners.push(cb)
    }
  }

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serviceWorker }
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        reload: () => { window.location.reload.calls++ }
      }
    }
  })
  globalThis.window.location.reload.calls = 0
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      visibilityState: 'visible',
      addEventListener: () => {}
    }
  })
  globalThis.setInterval = (fn, ms) => {
    timers.push({ fn, ms })
    return timers.length
  }

  return {
    registration,
    newWorker,
    controllerChangeListeners
  }
}

function restoreGlobals () {
  delete globalThis.navigator
  delete globalThis.window
  delete globalThis.document
  globalThis.setInterval = originalSetInterval
  timers.length = 0
}

afterEach(() => {
  restoreGlobals()
})

test('isUpdateAvailable only treats the available state as truthy', () => {
  assert.equal(isUpdateAvailable(STATE_NONE), false)
  assert.equal(isUpdateAvailable(STATE_AVAILABLE), true)
  assert.equal(isUpdateAvailable('anything-else'), false)
})

test('registers ./sw.js with updateViaCache none and reports an already-waiting worker', async () => {
  const worker = { postMessage: () => {} }
  const { registration } = installGlobals({ waiting: worker })
  const manager = createSwManager()
  const seen = []
  const unsubscribe = manager.subscribe(state => seen.push(state))

  await manager.init()

  assert.deepEqual(registration.registerCall, {
    url: './sw.js',
    options: { updateViaCache: 'none' }
  })
  assert.equal(manager.getState(), STATE_AVAILABLE)
  assert.deepEqual(seen, [STATE_NONE, STATE_AVAILABLE])
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, 60 * 60 * 1000)
  unsubscribe()
})

test('in dev, unregisters stale service workers and never registers', async () => {
  const unregistered = []
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        getRegistrations: async () => [
          { unregister: async () => { unregistered.push(true) } }
        ],
        register: async () => { throw new Error('must not register in dev') }
      }
    }
  })
  globalThis.IS_DEVELOPMENT = true
  try {
    const manager = createSwManager()
    await manager.init()
    assert.equal(unregistered.length, 1)
    assert.equal(manager.getState(), STATE_NONE)
  } finally {
    delete globalThis.IS_DEVELOPMENT
  }
})

test('marks update available when a new worker installs and waits', async () => {
  const { registration, newWorker } = installGlobals()
  const manager = createSwManager()

  await manager.init()
  assert.equal(manager.getState(), STATE_NONE)

  registration.installing = newWorker
  registration.updatefound()
  newWorker.state = 'installed'
  newWorker.statechange()

  assert.equal(manager.getState(), STATE_AVAILABLE)
})

test('does not report available when there is no controlling worker (first install)', async () => {
  const { registration, newWorker } = installGlobals({ controller: false })
  const manager = createSwManager()

  await manager.init()
  registration.installing = newWorker
  registration.updatefound()
  newWorker.state = 'installed'
  newWorker.statechange()

  assert.equal(manager.getState(), STATE_NONE)
})

test('applySwUpdate posts SKIP_WAITING and reloads once on controllerchange', async () => {
  let posted = null
  const waiting = { postMessage: message => { posted = message } }
  const { controllerChangeListeners } = installGlobals({ waiting })
  const manager = createSwManager()

  await manager.init()
  assert.equal(manager.getState(), STATE_AVAILABLE)

  manager.apply()
  assert.deepEqual(posted, { code: 'SKIP_WAITING' })

  controllerChangeListeners.forEach(listener => listener())
  controllerChangeListeners.forEach(listener => listener())
  assert.equal(globalThis.window.location.reload.calls, 1)
})

test('applySwUpdate falls back to a plain reload when no worker is waiting', async () => {
  installGlobals()
  const manager = createSwManager()

  await manager.init()
  manager.apply()

  assert.equal(globalThis.window.location.reload.calls, 1)
})

test('subscribe receives the current state immediately and unsubscribes cleanly', async () => {
  const { registration } = installGlobals({ waiting: { postMessage: () => {} } })
  const manager = createSwManager()
  const seen = []
  const unsubscribe = manager.subscribe(state => seen.push(state))
  await manager.init()
  assert.deepEqual(seen, [STATE_NONE, STATE_AVAILABLE])

  unsubscribe()
  manager.apply()
  assert.equal(seen.length, 2)
  assert.equal(registration.registerCall.options.updateViaCache, 'none')
})
