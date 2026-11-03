import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import { bytesToHex } from 'libp2r2p/base16'
import * as store from '../src/services/accounts-store.js'
import * as secrets from '../src/services/secrets.js'
import * as journal from '../src/services/account-mutation-journal.js'
import * as sync from '../src/services/sync/index.js'

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
  querySelector () { return null }
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

async function addContentKey (ownerPubkey, createdAt) {
  const secretBytes = generateSecretKey()
  await secrets.setContentKeySecret(ownerPubkey, bytesToHex(secretBytes), createdAt)
  return getPublicKey(secretBytes)
}

function panelForTest (readAnnouncement = async ({ ownerPubkey }) => ({
  ownerPubkey,
  status: 'not-advertised',
  relayCount: 2,
  checkedRelayCount: 2,
  failedRelayCount: 0
})) {
  const panel = new DevPanel()
  panel._readAnnouncement = readAnnouncement
  return panel
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(async () => {
  await journal.clear()
  secrets.lock()
  storage.clear()
})

test('dev panel rerenders preserve the Development accordion open state', () => {
  const panel = panelForTest()
  const details = { open: false }
  panel.querySelector = selector => selector === 'accordion-panel > details' ? details : null

  panel.render()
  assert.equal(details.open, false)
  details.open = true
  panel.render()
  assert.equal(details.open, true)
})

test('dev panel includes a pending nsec account only after the mutation commits', async () => {
  secrets.unlock(generateSecretKey(), null)
  const existing = nsecAccount('Existing account')
  await store.add(existing.record)
  await secrets.setNsecSecret(existing.record.pubkey, existing.seckey)

  const panel = panelForTest()
  let renderCount = 0
  const render = panel.render.bind(panel)
  panel.render = () => {
    renderCount++
    return render()
  }
  panel.connectedCallback()
  await flush()
  const initialRenderCount = renderCount
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
  assert.equal(renderCount, initialRenderCount)
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

test('dev panel keeps Upsert with the active key and lists the complete local inventory', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = nsecAccount('Inventory account')
  await store.add(account.record)
  await secrets.setNsecSecret(account.record.pubkey, account.seckey)
  const now = Math.floor(Date.now() / 1000)
  const historicalPubkey = await addContentKey(account.record.pubkey, now - 10)
  const activePubkey = (await sync.generateAndPublishContentKey(account.record.pubkey, {
    _upsertContentKeyEvent: async () => ({ result: { success: true } })
  })).pubkey

  const panel = panelForTest(async ({ ownerPubkey }) => ({
    ownerPubkey,
    status: 'advertised',
    contentPubkey: activePubkey,
    createdAt: now,
    relayCount: 2,
    checkedRelayCount: 2,
    failedRelayCount: 0
  }))
  panel.connectedCallback()
  await flush()
  const html = panel.innerHTML
  assert.ok(html.includes(historicalPubkey))
  assert.ok(html.includes(activePubkey))
  assert.doesNotMatch(html, /<accordion-panel[^>]*\sopen(?:\s|>)/)
  assert.equal((html.match(/class="key-badge is-active"/g) || []).length, 2)
  assert.equal((html.match(/class="key-badge is-advertised"/g) || []).length, 3)
  assert.equal((html.match(/data-content-pubkey=/g) || []).length, 3)
  assert.doesNotMatch(html, /Active content key/)
  assert.ok(html.indexOf('class="announcement"') < html.indexOf('Local content keys'))
  assert.ok(html.indexOf('Local content keys') < html.indexOf('data-action="generate-content-key"'))
  assert.ok(html.indexOf('Local content keys') < html.indexOf('Last Upsert'))
  assert.ok(html.indexOf('Last Upsert') < html.indexOf('data-action="generate-content-key"'))
  assert.match(html, /class="remote-key-label">Remote<\/span>/)
  assert.match(html, /Last checked/)
  assert.ok(html.indexOf(activePubkey) < html.indexOf(historicalPubkey))
  panel.disconnectedCallback()
})

test('dev panel marks an announcement whose secret is unavailable locally', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = nsecAccount('Remote inventory account')
  await store.add(account.record)
  await secrets.setNsecSecret(account.record.pubkey, account.seckey)
  const localPubkey = await addContentKey(account.record.pubkey, Math.floor(Date.now() / 1000))
  const remotePubkey = 'e'.repeat(64)
  const panel = panelForTest(async ({ ownerPubkey }) => ({
    ownerPubkey,
    status: 'advertised',
    contentPubkey: remotePubkey,
    createdAt: Math.floor(Date.now() / 1000),
    relayCount: 2,
    checkedRelayCount: 2,
    failedRelayCount: 0
  }))

  panel.connectedCallback()
  await flush()
  assert.match(panel.innerHTML, /Secret unavailable/)
  assert.ok(panel.innerHTML.includes(remotePubkey))
  assert.ok(panel.innerHTML.includes(localPubkey))
  assert.equal((panel.innerHTML.match(/class="key-badge is-advertised"/g) || []).length, 2)
  assert.match(panel.innerHTML, /class="remote-key-label">Remote<\/span>/)
  panel.disconnectedCallback()
})

test('dev panel replaces its empty state with a new account after commit', async () => {
  secrets.unlock(generateSecretKey(), null)
  const panel = panelForTest()
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
  const panel = panelForTest()
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
