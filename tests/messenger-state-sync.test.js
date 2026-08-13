import { after, test } from 'node:test'
import assert from 'node:assert/strict'

import * as secrets from '../src/services/secrets.js'
import { mutateAccounts } from '../src/services/storage/index.js'

const originalWindow = globalThis.window
const originalAddEventListener = globalThis.addEventListener
const originalDispatchEvent = globalThis.dispatchEvent
const windowEvents = new EventTarget()
globalThis.addEventListener = windowEvents.addEventListener.bind(windowEvents)
globalThis.dispatchEvent = windowEvents.dispatchEvent.bind(windowEvents)

let launcherPort
const parent = {
  postMessage (message, options) {
    launcherPort = options.transfer[0]
    queueMicrotask(() => {
      windowEvents.dispatchEvent(new MessageEvent('message', {
        data: { code: 'REPLY', reqId: message.reqId, payload: true },
        origin: 'http://localhost:4000'
      }))
    })
  }
}

globalThis.window = {
  top: {},
  parent,
  location: {
    ancestorOrigins: ['http://localhost:4000'],
    hostname: 'localhost'
  }
}

const messenger = await import('../src/services/messenger.js')

after(() => {
  secrets.lock()
  launcherPort?.close()
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
  if (originalAddEventListener === undefined) delete globalThis.addEventListener
  else globalThis.addEventListener = originalAddEventListener
  if (originalDispatchEvent === undefined) delete globalThis.dispatchEvent
  else globalThis.dispatchEvent = originalDispatchEvent
})

test('deduplicates the initial empty state and flushes changed accounts before close', async () => {
  await messenger.initMessenger()
  assert.ok(launcherPort)

  const messages = []
  launcherPort.addEventListener('message', event => {
    messages.push(event.data)
    if (event.data.code === 'CLOSE_VAULT_VIEW') {
      launcherPort.postMessage({
        code: 'REPLY',
        reqId: event.data.reqId,
        payload: true
      })
    }
  })
  launcherPort.start()

  secrets.unlock(new Uint8Array(32).fill(1), null)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(messages, [])

  const pubkey = 'a'.repeat(64)
  // Mutate the durable/cache layer directly to model a committed state whose
  // normal subscriber microtask has not run yet. requestVaultClose() must
  // synchronously flush this snapshot before posting CLOSE.
  await mutateAccounts(accounts => ({
    accounts: [{ type: 'npub', pubkey, name: '', picture: '' }, ...accounts]
  }))

  await messenger.requestVaultClose(100)
  assert.deepEqual(messages.map(message => message.code), [
    'SET_ACCOUNTS_STATE',
    'CLOSE_VAULT_VIEW'
  ])
  assert.deepEqual(messages[0].payload.accounts.map(account => account.pubkey), [pubkey])

  messages.length = 0
  await messenger.requestVaultClose(100)
  assert.deepEqual(messages.map(message => message.code), ['CLOSE_VAULT_VIEW'])
})
