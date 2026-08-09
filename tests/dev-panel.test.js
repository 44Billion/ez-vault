import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import { bytesToHex } from 'libp2r2p/base16'
import * as store from '../src/services/accounts-store.js'
import * as secrets from '../src/services/secrets.js'
import * as journal from '../src/services/account-mutation-journal.js'

const storage = new Map()
const styles = new Map()

globalThis.localStorage = {
  clear: () => storage.clear(),
  getItem: key => storage.has(String(key)) ? storage.get(String(key)) : null,
  removeItem: key => { storage.delete(String(key)) },
  setItem: (key, value) => { storage.set(String(key), String(value)) }
}
globalThis.sessionStorage = {
  clear: () => {},
  getItem: () => null,
  removeItem: () => {},
  setItem: () => {}
}

class FakeHTMLElement {
  constructor () {
    this.dataset = {}
    this.innerHTML = ''
  }

  addEventListener () {}
  removeEventListener () {}
  querySelectorAll () { return [] }
  contains () { return false }
}

globalThis.HTMLElement = FakeHTMLElement
globalThis.customElements = { define: () => {} }
globalThis.document = {
  getElementById: id => styles.get(id) || null,
  createElement: () => ({}),
  head: {
    appendChild: element => {
      if (element.id) styles.set(element.id, element)
    }
  }
}

const { DevPanel } = await import('../src/components/dev-panel.js')

function nsecAccount (name) {
  const secretBytes = generateSecretKey()
  return {
    record: {
      type: 'nsec',
      pubkey: getPublicKey(secretBytes),
      name,
      picture: 'data:image/svg+xml,avatar'
    },
    seckey: bytesToHex(secretBytes)
  }
}

afterEach(async () => {
  await journal.clear()
  secrets.lock()
  storage.clear()
})

test('dev panel includes a pending nsec account only after the mutation commits', async () => {
  secrets.unlock(generateSecretKey(), null)
  const existing = nsecAccount('Existing account')
  await store.add(existing.record)
  await secrets.setNsecSecret(existing.record.pubkey, existing.seckey)

  const panel = new DevPanel()
  let renderCount = 0
  const render = panel.render.bind(panel)
  panel.render = () => {
    renderCount++
    return render()
  }
  panel.connectedCallback()
  assert.match(panel.innerHTML, /Existing account/)

  const added = nsecAccount('Synced account')
  await journal.begin({
    operation: 'commit-prepared',
    affectedPubkeys: [added.record.pubkey],
    beforeAccounts: [],
    afterAccounts: [added.record],
    beforeSecretRefs: [],
    afterSecretRefs: [{ type: 'nsec', pubkey: added.record.pubkey }]
  })
  assert.equal(renderCount, 1)
  await store.add(added.record)
  await secrets.setNsecSecret(added.record.pubkey, added.seckey)

  assert.match(panel.innerHTML, /Existing account/)
  assert.doesNotMatch(panel.innerHTML, /Synced account/)

  await journal.clear()

  assert.match(panel.innerHTML, /Existing account/)
  assert.match(panel.innerHTML, /Synced account/)

  panel.disconnectedCallback()
  panel.innerHTML = 'disconnected'
  await journal.begin({ operation: 'test' })
  await journal.clear()
  assert.equal(panel.innerHTML, 'disconnected')
})

test('dev panel replaces its empty state with a new account after commit', async () => {
  secrets.unlock(generateSecretKey(), null)
  const panel = new DevPanel()
  panel.connectedCallback()
  assert.match(panel.innerHTML, /No nsec accounts/)

  const added = nsecAccount('First account')
  await journal.begin({
    operation: 'create-account',
    affectedPubkeys: [added.record.pubkey],
    beforeAccounts: [],
    afterAccounts: [added.record],
    beforeSecretRefs: [],
    afterSecretRefs: [{ type: 'nsec', pubkey: added.record.pubkey }]
  })
  await store.add(added.record)
  await secrets.setNsecSecret(added.record.pubkey, added.seckey)

  assert.match(panel.innerHTML, /No nsec accounts/)
  assert.doesNotMatch(panel.innerHTML, /First account/)

  await journal.clear()

  assert.doesNotMatch(panel.innerHTML, /No nsec accounts/)
  assert.match(panel.innerHTML, /First account/)
  panel.disconnectedCallback()
})

test('dev panel renders the restored state after a pending account rolls back', async () => {
  secrets.unlock(generateSecretKey(), null)
  const panel = new DevPanel()
  panel.connectedCallback()
  assert.match(panel.innerHTML, /No nsec accounts/)

  const added = nsecAccount('Rolled back account')
  await journal.begin({
    operation: 'commit-prepared',
    affectedPubkeys: [added.record.pubkey],
    beforeAccounts: [],
    afterAccounts: [added.record],
    beforeSecretRefs: [],
    afterSecretRefs: [{ type: 'nsec', pubkey: added.record.pubkey }]
  })
  await store.add(added.record)
  await secrets.setNsecSecret(added.record.pubkey, added.seckey)
  await store.remove(added.record.pubkey)
  await secrets.deleteSecret(added.record.pubkey)
  await journal.clear()

  assert.match(panel.innerHTML, /No nsec accounts/)
  assert.doesNotMatch(panel.innerHTML, /Rolled back account/)
  panel.disconnectedCallback()
})
