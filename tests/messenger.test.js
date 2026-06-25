import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { accountForLauncher, applyAccountEvents, signerRequestApp, signerRequestContext, snapshotAccounts } from '../docs/services/messenger.js'
import * as store from '../docs/services/accounts-store.js'
import * as secrets from '../docs/services/secrets.js'
import * as journal from '../docs/services/account-mutation-journal.js'
import { npubFromPubkey } from '../docs/helpers/nostr/index.js'

if (!globalThis.localStorage) {
  const data = new Map()
  globalThis.localStorage = {
    clear: () => data.clear(),
    getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
    removeItem: key => { data.delete(String(key)) },
    setItem: (key, value) => { data.set(String(key), String(value)) }
  }
}

afterEach(() => {
  secrets.lock()
  globalThis.localStorage.clear()
})

test('signerRequestContext extracts NIP-44 v3 kind and scope', () => {
  assert.deepEqual(
    signerRequestContext('nip44v3_encrypt', ['peer', '263', 'channel-pubkey', 'plain-b64']),
    { eventKind: 263, eventScope: 'channel-pubkey' }
  )
  assert.deepEqual(
    signerRequestContext('nip44v3_decrypt', ['peer', 3560, '', 'ciphertext']),
    { eventKind: 3560, eventScope: '' }
  )
  assert.deepEqual(
    signerRequestContext('nip44v3_encrypt_double_dh', ['peer', 263, 'channel-pubkey', 'plain-b64', 'content-pubkey']),
    { eventKind: 263, eventScope: 'channel-pubkey' }
  )
  assert.deepEqual(
    signerRequestContext('nip44v3_decrypt_double_dh', ['peer', '3560', '', 'ciphertext', 'peer-content', 'own-content']),
    { eventKind: 3560, eventScope: '' }
  )
})

test('signerRequestApp labels empty app metadata as the launcher', () => {
  assert.deepEqual(signerRequestApp(undefined), { id: '', name: 'App launcher', icon: '' })
  assert.deepEqual(signerRequestApp({}), { id: '', name: 'App launcher', icon: '' })
  assert.deepEqual(signerRequestApp({ id: '', name: '', icon: '' }), { id: '', name: 'App launcher', icon: '' })
  assert.deepEqual(
    signerRequestApp({ id: '+app', name: 'Real App', icon: 'icon' }),
    { id: '+app', name: 'Real App', icon: 'icon' }
  )
})

test('signerRequestContext keeps event-kind context scoped to signer methods that expose it', () => {
  assert.deepEqual(
    signerRequestContext('sign_event', [{ kind: 1, content: 'hello' }]),
    { eventKind: 1 }
  )
  assert.deepEqual(
    signerRequestContext('double_sign_event', [{ kind: 30023, content: 'article' }]),
    { eventKind: 30023 }
  )
  assert.deepEqual(signerRequestContext('nip44_encrypt', ['peer', 'plain']), {})
})

test('accountForLauncher returns the account shape expected by the launcher', () => {
  const pubkey = 'a'.repeat(64)
  const profileEvent = {
    kind: 0,
    pubkey,
    created_at: 10,
    tags: [['picture', 'https://example.test/tag-picture.png']],
    content: JSON.stringify({
      name: 'Alice',
      about: 'Hello',
      picture: 'https://example.test/content-picture.png'
    })
  }
  const relayListEvent = {
    kind: 10002,
    pubkey,
    created_at: 11,
    tags: [
      ['r', 'wss://both.example'],
      ['r', 'wss://read.example', 'read'],
      ['r', 'wss://write.example', 'write']
    ],
    content: ''
  }

  assert.deepEqual(accountForLauncher({
    type: 'nsec',
    pubkey,
    name: 'Fallback',
    picture: 'fallback-picture',
    profileEvent,
    relayListEvent,
    writeRelays: ['wss://fallback.example']
  }), {
    pubkey,
    profile: {
      name: 'Alice',
      about: 'Hello',
      picture: 'https://example.test/tag-picture.png',
      npub: npubFromPubkey(pubkey),
      meta: { events: [profileEvent] }
    },
    relays: {
      read: ['wss://both.example', 'wss://read.example'],
      write: ['wss://both.example', 'wss://write.example'],
      meta: { events: [relayListEvent] }
    },
    isReadOnly: false,
    isLocked: true
  })
})

test('applyAccountEvents updates stored profile and relay-list events only when newer', () => {
  const pubkey = 'b'.repeat(64)
  const oldProfileEvent = {
    kind: 0,
    pubkey,
    created_at: 10,
    tags: [],
    content: JSON.stringify({ name: 'Old', picture: 'old.png' })
  }
  const oldRelayListEvent = {
    kind: 10002,
    pubkey,
    created_at: 10,
    tags: [['r', 'wss://old.example', 'write']],
    content: ''
  }
  const staleProfileEvent = {
    kind: 0,
    pubkey,
    created_at: 9,
    tags: [],
    content: JSON.stringify({ name: 'Stale', picture: 'stale.png' })
  }
  const newProfileEvent = {
    kind: 0,
    pubkey,
    created_at: 12,
    tags: [],
    content: JSON.stringify({ name: 'New', picture: 'new.png' })
  }
  const newRelayListEvent = {
    kind: 10002,
    pubkey,
    created_at: 13,
    tags: [['r', 'wss://new.example', 'write']],
    content: ''
  }
  store.add({
    type: 'nsec',
    pubkey,
    name: 'Old',
    picture: 'old.png',
    profileEvent: oldProfileEvent,
    relayListEvent: oldRelayListEvent,
    writeRelays: ['wss://old.example']
  })

  assert.equal(applyAccountEvents(pubkey, [staleProfileEvent]), false)
  assert.equal(store.get(pubkey).name, 'Old')

  assert.equal(applyAccountEvents(pubkey, [newProfileEvent, newRelayListEvent]), true)
  const account = store.get(pubkey)
  assert.equal(account.name, 'New')
  assert.equal(account.picture, 'new.png')
  assert.deepEqual(account.profileEvent, newProfileEvent)
  assert.deepEqual(account.relayListEvent, newRelayListEvent)
  assert.deepEqual(account.writeRelays, ['wss://new.example'])
})

test('snapshotAccounts follows the account-mutation journal visibility window', () => {
  const pubkey = 'c'.repeat(64)
  const account = { type: 'npub', pubkey, name: 'Carol', picture: '' }
  store.add(account)

  assert.deepEqual(snapshotAccounts().map(a => a.pubkey), [pubkey])

  journal.begin({
    operation: 'test',
    affectedPubkeys: [pubkey],
    beforeAccounts: [],
    afterAccounts: [account]
  })
  assert.deepEqual(snapshotAccounts(), [])

  journal.clear()
  assert.deepEqual(snapshotAccounts().map(a => a.pubkey), [pubkey])
})
