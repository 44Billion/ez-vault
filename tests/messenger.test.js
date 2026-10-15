import { finalizeEvent } from 'libp2r2p/event'
import { getPublicKey } from 'libp2r2p/key'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accountForLauncher,
  applyAccountEvents,
  handleLocalDevWipe,
  handleLegacyViewMessage,
  handleSignerRequest,
  isTrustedOrigin,
  requestVaultClose,
  signerRequestApp,
  signerRequestContext,
  snapshotAccounts
} from '../src/services/messenger.js'
import * as store from '../src/services/accounts-store.js'
import * as secrets from '../src/services/secrets.js'
import * as journal from '../src/services/account-mutation-journal.js'
import * as log from '../src/services/messenger-log/index.js'
import { listMessengerLogs } from '../src/services/storage/index.js'
import { npubFromPubkey } from 'libp2r2p/key'

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
    signerRequestContext('nip44v3_encrypt', ['peer', '26300', 'channel-pubkey', 'plain-b64']),
    { eventKind: 26300, eventScope: 'channel-pubkey' }
  )
  assert.deepEqual(
    signerRequestContext('nip44v3_decrypt', ['peer', 3560, '', 'ciphertext']),
    { eventKind: 3560, eventScope: '' }
  )
  assert.deepEqual(
    signerRequestContext('nip44v3_encrypt_double_dh', ['peer', 26300, 'channel-pubkey', 'plain-b64', 'content-pubkey']),
    { eventKind: 26300, eventScope: 'channel-pubkey' }
  )
  assert.deepEqual(
    signerRequestContext('nip44v3_decrypt_double_dh', ['peer', '3560', '', 'ciphertext', 'peer-content', 'own-content']),
    { eventKind: 3560, eventScope: '' }
  )
})

test('requestVaultClose resolves immediately without a launcher port', async () => {
  await assert.doesNotReject(requestVaultClose())
})

test('the launcher full reset wipes the vault only in development builds', async () => {
  const previous = globalThis.IS_DEVELOPMENT
  const replies = []
  const reloads = []
  const scheduled = []
  const wipes = []
  const handlerOptions = {
    _wipe: async () => { wipes.push('wipe'); return { databases: ['ez-vault'], failures: [] } },
    _reply: message => replies.push(message),
    _setTimeout: fn => scheduled.push(fn),
    _reload: () => reloads.push('reload')
  }
  try {
    globalThis.IS_DEVELOPMENT = false
    assert.equal(handleLocalDevWipe({}, handlerOptions), undefined)
    assert.deepEqual(wipes, [])
    assert.deepEqual(replies, [])

    globalThis.IS_DEVELOPMENT = true
    await handleLocalDevWipe({}, handlerOptions)
    assert.deepEqual(wipes, ['wipe'])
    assert.deepEqual(replies, [{ payload: { databases: ['ez-vault'], failures: [] } }])
    assert.equal(scheduled.length, 1)
    scheduled.shift()()
    assert.deepEqual(reloads, ['reload'])

    await handleLocalDevWipe({}, {
      ...handlerOptions,
      _wipe: async () => { throw new Error('WIPE_FAILED') }
    })
    assert.equal(replies.at(-1).error.message, 'WIPE_FAILED')
    assert.equal(scheduled.length, 0)
    assert.deepEqual(reloads, ['reload'])
  } finally {
    if (previous === undefined) delete globalThis.IS_DEVELOPMENT
    else globalThis.IS_DEVELOPMENT = previous
  }
})

test('launcher origin allowlist accepts local hosts and 44billion.net only', () => {
  assert.equal(isTrustedOrigin('http://localhost:8080'), true)
  assert.equal(isTrustedOrigin('https://127.0.0.1:4443'), true)
  assert.equal(isTrustedOrigin('http://[::1]:4000'), true)
  assert.equal(isTrustedOrigin('https://44billion.net'), true)
  assert.equal(isTrustedOrigin('https://nostrapps.com'), false)
  assert.equal(isTrustedOrigin('https://44billion.github.io'), false)
})

test('legacy view messages reset the route-less UI and UNLOCK_ACCOUNT replies ready', () => {
  const resets = []
  const replies = []
  const dependencies = {
    resetView: () => resets.push('reset'),
    sendReply: message => replies.push(message)
  }

  assert.equal(handleLegacyViewMessage({
    data: {
      code: 'UNLOCK_ACCOUNT',
      reqId: 'unlock-1',
      payload: { route: '/unlock-account', pubkey: 'ignored' }
    }
  }, dependencies), true)
  assert.deepEqual(resets, ['reset'])
  assert.deepEqual(replies, [{ payload: { isRouteReady: true } }])

  assert.equal(handleLegacyViewMessage({
    data: { code: 'OPEN_VAULT_HOME' }
  }, dependencies), true)
  assert.deepEqual(resets, ['reset', 'reset'])

  assert.equal(handleLegacyViewMessage({
    data: { code: 'RENDER' }
  }, dependencies), false)
})

test('signerRequestApp labels empty app metadata as the launcher', () => {
  assert.deepEqual(signerRequestApp(undefined), { id: '', name: 'App launcher', icon: '', alias: '' })
  assert.deepEqual(signerRequestApp({}), { id: '', name: 'App launcher', icon: '', alias: '' })
  assert.deepEqual(signerRequestApp({ id: '', name: '', icon: '' }), { id: '', name: 'App launcher', icon: '', alias: '' })
  assert.deepEqual(
    signerRequestApp({ id: '+app', name: 'Real App', icon: 'icon' }),
    { id: '+app', name: 'Real App', icon: '', alias: '' }
  )
  assert.deepEqual(
    signerRequestApp({ id: 'app', icon: { fx: 'abc', url: 'https://example.test/icon.png' } }),
    { id: 'app', name: '', icon: 'https://example.test/icon.png', alias: '' }
  )
  assert.deepEqual(
    signerRequestApp({ id: 'app', icon: { url: 'https://example.test/icon.png' } }),
    { id: 'app', name: '', icon: 'https://example.test/icon.png', alias: '' }
  )
  assert.deepEqual(
    signerRequestApp({ id: 'app', alias: 'human-id' }),
    { id: 'app', name: '', icon: '', alias: 'human-id' }
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
  const secret = new Uint8Array(32).fill(1)
  const pubkey = getPublicKey(secret)
  const profileEvent = finalizeEvent({
    kind: 0,
    pubkey,
    created_at: 10,
    tags: [['picture', 'https://example.test/tag-picture.png']],
    content: JSON.stringify({
      name: 'Alice',
      about: 'Hello',
      picture: 'https://example.test/content-picture.png'
    })
  }, secret)
  const relayListEvent = finalizeEvent({
    kind: 10002,
    pubkey,
    created_at: 11,
    tags: [
      ['r', 'wss://both.example'],
      ['r', 'wss://read.example', 'read'],
      ['r', 'wss://write.example', 'write']
    ],
    content: ''
  }, secret)

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
    supportsContentKeyMethods: true,
    isReadOnly: false,
    isLocked: true
  })
})

test('only local nsec accounts advertise content-key methods, even while locked', () => {
  for (const type of ['nsec', 'bunker', 'npub']) {
    const account = accountForLauncher({ type, pubkey: 'a'.repeat(64) })
    assert.equal(account.supportsContentKeyMethods, type === 'nsec')
  }
})

test('applyAccountEvents updates stored profile and relay-list events only when newer', async () => {
  const secret = new Uint8Array(32).fill(2)
  const pubkey = getPublicKey(secret)
  const oldProfileEvent = finalizeEvent({
    kind: 0,
    pubkey,
    created_at: 10,
    tags: [],
    content: JSON.stringify({ name: 'Old', picture: 'old.png' })
  }, secret)
  const oldRelayListEvent = finalizeEvent({
    kind: 10002,
    pubkey,
    created_at: 10,
    tags: [['r', 'wss://old.example', 'write']],
    content: ''
  }, secret)
  const staleProfileEvent = finalizeEvent({
    kind: 0,
    pubkey,
    created_at: 9,
    tags: [],
    content: JSON.stringify({ name: 'Stale', picture: 'stale.png' })
  }, secret)
  const newProfileEvent = finalizeEvent({
    kind: 0,
    pubkey,
    created_at: 12,
    tags: [],
    content: JSON.stringify({ name: 'New', picture: 'new.png' })
  }, secret)
  const newRelayListEvent = finalizeEvent({
    kind: 10002,
    pubkey,
    created_at: 13,
    tags: [['r', 'wss://new.example', 'write']],
    content: ''
  }, secret)
  await store.add({
    type: 'nsec',
    pubkey,
    name: 'Old',
    picture: 'old.png',
    profileEvent: oldProfileEvent,
    relayListEvent: oldRelayListEvent,
    writeRelays: ['wss://old.example']
  })

  assert.equal(await applyAccountEvents(pubkey, [staleProfileEvent]), false)
  assert.equal(store.get(pubkey).name, 'Old')

  assert.equal(await applyAccountEvents(pubkey, [newProfileEvent, newRelayListEvent]), true)
  const account = store.get(pubkey)
  assert.equal(account.name, 'New')
  assert.equal(account.picture, 'new.png')
  assert.deepEqual(account.profileEvent, newProfileEvent)
  assert.deepEqual(account.relayListEvent, newRelayListEvent)
  assert.deepEqual(account.writeRelays, ['wss://new.example'])
})

test('snapshotAccounts follows the account-mutation journal visibility window', async () => {
  const pubkey = 'c'.repeat(64)
  const account = { type: 'npub', pubkey, name: 'Carol', picture: '' }
  await store.add(account)

  assert.deepEqual(snapshotAccounts().map(a => a.pubkey), [pubkey])

  await journal.begin({
    operation: 'test',
    affectedPubkeys: [pubkey],
    beforeAccounts: [],
    afterAccounts: [account]
  })
  assert.deepEqual(snapshotAccounts(), [])

  await journal.clear()
  assert.deepEqual(snapshotAccounts().map(a => a.pubkey), [pubkey])
})

test('signer success replies before a blocked audit write and preserves transferred binary fields', async () => {
  secrets.unlock(new Uint8Array(32).fill(1), null)
  const release = secrets.beginVaultTransition()
  const plaintext = new Uint8Array([1, 2, 3])
  const result = new Uint8Array([5, 6, 7]).buffer
  const replies = []
  const event = { data: { payload: { pubkey: 'owner', method: 'nip44v3_decrypt', params: ['peer', 9, 'cache', plaintext.buffer], app: { id: 'background-test' } } } }
  let handled = false
  const handling = handleSignerRequest(event, {
    code: 'NIP07', run: async () => result,
    sendReply: message => replies.push(structuredClone(message, { transfer: [result] }))
  }).then(() => { handled = true })
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(handled, true, 'the transition/log barrier does not delay the reply')
    assert.deepEqual(new Uint8Array(replies[0].payload), new Uint8Array([5, 6, 7]))
    assert.equal(result.byteLength, 0)
    assert.deepEqual(await listMessengerLogs(), [])
    plaintext.fill(99)
    release()
    await log.flush()
    const [record] = await log.list()
    assert.equal(record.status, 'success')
    assert.equal(record.result, 'BQYH')
    assert.deepEqual(record.params, ['peer', 9, 'cache', 'AQID'])
    const [stored] = await listMessengerLogs()
    assert.equal(typeof stored.sealed, 'string')
    assert.equal(Object.hasOwn(stored, 'params'), false)
    assert.equal(Object.hasOwn(stored, 'result'), false)
  } finally {
    release()
    await handling
    await log.flush()
  }
})

test('signer failures also reply independently of audit persistence with their original context', async () => {
  secrets.unlock(new Uint8Array(32).fill(1), null)
  const release = secrets.beginVaultTransition()
  const replies = []
  let handled = false
  const handling = handleSignerRequest({ data: { payload: { pubkey: 'owner', method: 'nip44v3_encrypt', params: ['peer', 9, 'cache', new ArrayBuffer(0)] } } }, {
    code: 'NIP07',
    run: async () => { throw Object.assign(new Error('SIGNER_FAILED'), { code: 'TEST_ERROR' }) },
    sendReply: message => replies.push(message)
  }).then(() => { handled = true })
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(handled, true)
    assert.equal(replies[0].error.message, 'SIGNER_FAILED')
    assert.equal(replies[0].error.type, 'error')
    assert.deepEqual(replies[0].error.context, { eventKind: 9, eventScope: 'cache' })
    assert.deepEqual(await listMessengerLogs(), [])
    release()
    await log.flush()
    const [record] = await log.list()
    assert.equal(record.status, 'failure')
    assert.deepEqual(record.error, { message: 'SIGNER_FAILED' })
  } finally {
    release()
    await handling
    await log.flush()
  }
})

test('unlogged disclosures still avoid the activity log', async () => {
  const replies = []
  await handleSignerRequest({ data: { payload: { pubkey: 'owner', method: 'obfuscate', params: ['value', '9', ''] } } }, {
    code: 'NIP07', run: async () => 'opaque-id', sendReply: message => replies.push(message)
  })
  await log.flush()
  assert.deepEqual(replies, [{ payload: 'opaque-id' }])
  assert.deepEqual(await listMessengerLogs(), [])
})
