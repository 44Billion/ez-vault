import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { getEventHash, isValidEvent } from 'libp2r2p/event'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import NsecSigner from '../src/services/nsec-signer.js'
import { doubleSignEvent, refreshStoredContentKeyEvents, refreshStoredContentKeyEventsIfDue, rotateContentKeyIfStillCanonical, startContentKeyEventRefresh, upsertContentKeyEvent } from '../src/services/content-key/index.js'
import { makeContentKeyEvent, makeContentKeyEventForPubkey, parseContentKeyEvent, isValidContentKeyProof, isValidIykcProof } from 'libp2r2p/content-key/event'
import { CONTENT_KEY_ANNOUNCEMENT } from 'libp2r2p/kind'
import { getIykcProofs } from 'libp2r2p/content-key'
import * as store from '../src/services/accounts-store.js'
import * as secrets from '../src/services/secrets.js'
import { freeRelays, seedRelays } from 'libp2r2p/relay'
import { bytesToHex, hexToBytes } from 'libp2r2p/base16'

if (!globalThis.localStorage) {
  const data = new Map()
  globalThis.localStorage = {
    clear: () => data.clear(),
    getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
    removeItem: key => { data.delete(String(key)) },
    setItem: (key, value) => { data.set(String(key), String(value)) }
  }
}

if (!globalThis.crypto) globalThis.crypto = crypto
if (!globalThis.btoa) globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64')
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary')

afterEach(() => {
  secrets.lock()
  NsecSigner.releaseAll()
  globalThis.localStorage.clear()
})

function signer () {
  return NsecSigner.getOrCreate(bytesToHex(generateSecretKey()))
}

test('only a confirmed content-key publication refreshes discovery without another relay read', async () => {
  const user = signer()
  const content = signer()
  const owner = await user.getPublicKey()
  await upsertContentKeyEvent({ userSigner: user, contentKeySigner: content, relays: ['wss://fixture.example'], _relayPool: { sendEvent: async () => ({ success: true }) } })
  const noRead = { _getEvents: async () => assert.fail('Published proof should already be cached'), _getRelaysByPubkey: async () => assert.fail('No discovery needed') }
  assert.equal((await getIykcProofs([owner], noRead))[owner].iykcPubkey, await content.getPublicKey())
  await upsertContentKeyEvent({ userSigner: user, contentKeySigner: signer(), relays: ['wss://fixture.example'], _relayPool: { sendEvent: async () => ({ success: false }) } })
  assert.equal((await getIykcProofs([owner], noRead))[owner].iykcPubkey, await content.getPublicKey())
})

function pubkeyFixture (index) {
  return index.toString(16).padStart(64, '0')
}

function seckey () {
  return bytesToHex(generateSecretKey())
}

function pubkeyFromSecret (secret) {
  return getPublicKey(hexToBytes(secret))
}

async function addNsecAccount () {
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  await store.add({ type: 'nsec', pubkey, name: '', picture: '' })
  await secrets.setNsecSecret(pubkey, secret)
  return { pubkey, secret }
}

async function addContentKey (ownerPubkey, createdAt = 10) {
  const secret = seckey()
  const pubkey = pubkeyFromSecret(secret)
  await secrets.setContentKeySecret(ownerPubkey, secret, createdAt)
  return { pubkey, secret, createdAt }
}

function relayPoolStub ({
  events = async () => [],
  send = async () => ({ success: true })
} = {}) {
  return {
    async getEvents (filter, relays) {
      return { result: (await events(filter, relays)).map(event => ({ event, relay: event.meta?.relay ?? 'wss://fixture.test' })), errors: [], success: true }
    },
    sendEvent: send
  }
}

test('makeContentKeyEvent publishes a signed content pubkey', async () => {
  const user = signer()
  const contentKey = signer()
  const userPubkey = await user.getPublicKey()
  const contentPubkey = await contentKey.getPublicKey()
  const event = await makeContentKeyEvent({ userSigner: user, contentKeySigner: contentKey, createdAt: 7 })
  const parsed = parseContentKeyEvent(event)

  assert.equal(event.kind, CONTENT_KEY_ANNOUNCEMENT)
  assert.equal(event.pubkey, userPubkey)
  assert.deepEqual(event.tags, [['cp', contentPubkey]])
  assert.equal(parsed.iykcPubkey, contentPubkey)
  assert.equal(parsed.iykcProof, `${event.created_at}:${event.sig}`)
  assert.equal(isValidIykcProof({ receiverPubkey: userPubkey, iykcPubkey: contentPubkey, iykcProof: parsed.iykcProof }), true)
  assert.equal(isValidContentKeyProof({ ownerPubkey: userPubkey, contentPubkey, proof: parsed.iykcProof }), true)
  assert.equal(isValidEvent(event), true)
})

test('parseContentKeyEvent rejects events with extra tags or bad signatures', async () => {
  const user = signer()
  const contentKey = signer()
  const event = await makeContentKeyEvent({ userSigner: user, contentKeySigner: contentKey, createdAt: 7 })

  assert.equal(parseContentKeyEvent({ ...event, tags: event.tags.concat([['x', 'nope']]) }), null)
  assert.equal(parseContentKeyEvent({ ...event, tags: [['cp', event.tags[0][1], 'extra']] }), null)
  assert.equal(parseContentKeyEvent({ ...event, content: 'nope' }), null)
  assert.equal(parseContentKeyEvent({ ...event, tags: [['cp', 'f'.repeat(64)]] }), null)
})

test('isValidIykcProof rejects missing or mismatched proofs', async () => {
  const user = signer()
  const contentKey = signer()
  const otherContentKey = signer()
  const userPubkey = await user.getPublicKey()
  const contentPubkey = await contentKey.getPublicKey()
  const event = await makeContentKeyEvent({ userSigner: user, contentKeySigner: contentKey, createdAt: 7 })
  const { iykcProof } = parseContentKeyEvent(event)

  assert.equal(isValidIykcProof({ receiverPubkey: userPubkey, iykcPubkey: contentPubkey, iykcProof: '' }), false)
  assert.equal(isValidIykcProof({ receiverPubkey: userPubkey, iykcPubkey: await otherContentKey.getPublicKey(), iykcProof }), false)
  assert.equal(isValidIykcProof({ receiverPubkey: await signer().getPublicKey(), iykcPubkey: contentPubkey, iykcProof }), false)
})

test('upsertContentKeyEvent signs and publishes to user write relays', async () => {
  const user = signer()
  const contentKey = signer()
  const userPubkey = await user.getPublicKey()
  let published = null
  const result = await upsertContentKeyEvent({
    userSigner: user,
    contentKeySigner: contentKey,
    _resolveWriteRelays: async (pubkey) => {
      assert.equal(pubkey, userPubkey)
      return ['wss://write.example']
    },
    _relayPool: relayPoolStub({
      send: async (event, relays) => {
        published = { event, relays }
        return { success: true }
      }
    })
  })

  assert.deepEqual(published.relays, ['wss://write.example'])
  assert.equal(parseContentKeyEvent(published.event).iykcPubkey, await contentKey.getPublicKey())
  assert.equal(result.event.id, published.event.id)
  assert.deepEqual(result.result, { success: true })
})

test('doubleSignEvent signs event with per-event imkc proof', async () => {
  const user = signer()
  const contentKey = signer()
  const userPubkey = await user.getPublicKey()
  const contentPubkey = await contentKey.getPublicKey()
  const event = {
    kind: 1,
    pubkey: 'f'.repeat(64),
    id: 'e'.repeat(64),
    sig: 'd'.repeat(128),
    created_at: 9,
    tags: [['p', 'peer'], ['imkc', 'old'], ['x', 'kept']],
    content: 'clear text'
  }

  const signed = await doubleSignEvent({ userSigner: user, contentKeySigner: contentKey, event })
  const imkcTag = signed.tags.find(tag => tag[0] === 'imkc')
  const proofEvent = {
    kind: signed.kind,
    pubkey: contentPubkey,
    created_at: signed.created_at,
    tags: signed.tags.map(tag => tag[0] === 'imkc' ? ['imkc', contentPubkey] : [...tag]),
    content: signed.content,
    sig: imkcTag[2]
  }
  proofEvent.id = getEventHash(proofEvent)

  assert.equal(signed.pubkey, userPubkey)
  assert.deepEqual(imkcTag.slice(0, 2), ['imkc', contentPubkey])
  assert.equal(signed.tags[1][0], 'imkc')
  assert.equal(event.tags[1][1], 'old')
  assert.equal(isValidEvent(proofEvent), true)
  assert.equal(isValidEvent(signed), true)
})

test('refreshStoredContentKeyEvents advertises the active local key where absent or different, even if a remote announcement is newer', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = await addNsecAccount()
  const localContentKey = await addContentKey(account.pubkey, 50)
  const userSigner = secrets.getNsecSigner(account.pubkey)
  const remoteContentPubkey = pubkeyFixture(11)
  const staleContentPubkey = pubkeyFixture(12)
  const newest = await makeContentKeyEventForPubkey({ userSigner, contentPubkey: remoteContentPubkey, createdAt: 100 })
  const olderSame = await makeContentKeyEventForPubkey({ userSigner, contentPubkey: localContentKey.pubkey, createdAt: 80 })
  const olderOther = await makeContentKeyEventForPubkey({ userSigner, contentPubkey: staleContentPubkey, createdAt: 70 })
  const relayList = await userSigner.signEvent({
    kind: 10002,
    created_at: 6,
    tags: [
      ['r', 'wss://newest.example', 'write'],
      ['r', 'wss://absent.example', 'write'],
      ['r', 'wss://same.example', 'write'],
      ['r', 'wss://older.example', 'write']
    ],
    content: ''
  })
  const published = []

  const result = await refreshStoredContentKeyEvents({
    _isOnline: async () => true,
    _nowSeconds: () => 100,
    _fetchRelayListEvent: async () => relayList,
    _relayPool: relayPoolStub({
      events: async (_filter, relays) => {
        const relay = relays[0]
        if (relay === 'wss://newest.example') return [newest]
        if (relay === 'wss://same.example') return [olderSame]
        if (relay === 'wss://older.example') return [olderOther]
        return []
      },
      send: async (event, relays) => {
        published.push({ event, relays })
        return { success: true }
      }
    })
  })

  assert.equal(result.checked, 1)
  assert.equal(result.published, 3)
  assert.equal(published.length, 1)
  assert.deepEqual(published[0].relays, ['wss://newest.example', 'wss://absent.example', 'wss://older.example'])
  assert.equal(published[0].event.created_at, 101)
  assert.equal(parseContentKeyEvent(published[0].event).iykcPubkey, localContentKey.pubkey)
  assert.equal(secrets.listContentKeys(account.pubkey)[0].createdAt, 50)
})

test('refreshStoredContentKeyEvents publishes local key only when no valid event is found', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = await addNsecAccount()
  const localContentKey = await addContentKey(account.pubkey, 50)
  const userSigner = secrets.getNsecSigner(account.pubkey)
  const relayList = await userSigner.signEvent({
    kind: 10002,
    created_at: 6,
    tags: [['r', 'wss://one.example', 'write'], ['r', 'wss://two.example', 'write']],
    content: ''
  })
  const published = []

  await refreshStoredContentKeyEvents({
    _isOnline: async () => true,
    _nowSeconds: () => 200,
    _fetchRelayListEvent: async () => relayList,
    _relayPool: relayPoolStub({
      send: async (event, relays) => {
        published.push({ event, relays })
        return { success: true }
      }
    })
  })

  assert.equal(published.length, 1)
  assert.deepEqual(published[0].relays, ['wss://one.example', 'wss://two.example'])
  assert.equal(parseContentKeyEvent(published[0].event).iykcPubkey, localContentKey.pubkey)
})

test('refresh keeps the local selection despite a delayed historical import and skips matching or failed routes', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = await addNsecAccount()
  const older = await addContentKey(account.pubkey, Math.floor(Date.now() / 1000))
  const userSigner = secrets.getNsecSigner(account.pubkey)
  const relayList = await userSigner.signEvent({
    kind: 10002, created_at: 6,
    tags: [['r', 'wss://matching.example', 'write'], ['r', 'wss://different.example', 'write'], ['r', 'wss://failed.example', 'write']], content: ''
  })
  const active = await secrets.createContentKeySecret(account.pubkey)
  const matching = await makeContentKeyEvent({ userSigner, contentKeySigner: active, createdAt: 100 })
  const different = await makeContentKeyEventForPubkey({ userSigner, contentPubkey: older.pubkey, createdAt: 100 })
  const publications = []
  const result = await refreshStoredContentKeyEvents({
    _isOnline: async () => true,
    _nowSeconds: () => 100,
    _fetchRelayListEvent: async () => relayList,
    _relayPool: relayPoolStub({
      events: async (_filter, [relay]) => {
        if (relay === 'wss://failed.example') throw new Error('relay unavailable')
        // A delayed historical import must not become the selected key.
        if (relay === 'wss://different.example') await secrets.setContentKeySecret(account.pubkey, older.secret, older.createdAt)
        return [relay === 'wss://matching.example' ? matching : different]
      },
      send: async (event, relays) => {
        publications.push({ event, relays })
        return { success: true }
      }
    })
  })
  assert.equal(result.published, 1)
  assert.deepEqual(publications[0].relays, ['wss://different.example'])
  assert.equal(parseContentKeyEvent(publications[0].event).iykcPubkey, active.getPublicKey())
  const noRead = { _getEvents: async () => assert.fail('Confirmed refresh should update cache'), _getRelaysByPubkey: async () => assert.fail('No discovery needed') }
  assert.equal((await getIykcProofs([account.pubkey], noRead))[account.pubkey].iykcPubkey, active.getPublicKey())
})

test('refreshStoredContentKeyEvents skips offline instead of treating missing relay results as absence', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = await addNsecAccount()
  await addContentKey(account.pubkey, 50)
  let fetched = false
  let published = false

  const result = await refreshStoredContentKeyEvents({
    _isOnline: async () => false,
    _fetchRelayListEvent: async () => { fetched = true; return null },
    _relayPool: relayPoolStub({
      events: async () => { fetched = true; return [] },
      send: async () => { published = true }
    })
  })

  assert.deepEqual(result, { skipped: 'offline', accounts: [account.pubkey] })
  assert.equal(fetched, false)
  assert.equal(published, false)
})

test('refreshStoredContentKeyEvents publishes a fallback relay list when none exists', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = await addNsecAccount()
  const localContentKey = await addContentKey(account.pubkey, 50)
  const published = []

  await refreshStoredContentKeyEvents({
    _isOnline: async () => true,
    _nowSeconds: () => 200,
    _fetchRelayListEvent: async () => null,
    _relayPool: relayPoolStub({
      send: async (event, relays) => {
        published.push({ event, relays })
        return { success: true }
      }
    })
  })

  assert.equal(published.length, 2)
  assert.equal(published[0].event.kind, 10002)
  assert.deepEqual(published[0].relays, seedRelays)
  assert.deepEqual(published[0].event.tags, freeRelays.slice(0, 2).map(relay => ['r', relay]))
  assert.equal(parseContentKeyEvent(published[1].event).iykcPubkey, localContentKey.pubkey)
  assert.deepEqual(published[1].relays, freeRelays.slice(0, 2))
})

test('refreshStoredContentKeyEvents adds fallback write relays without duplicate read tags', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = await addNsecAccount()
  await addContentKey(account.pubkey, 50)
  const userSigner = secrets.getNsecSigner(account.pubkey)
  const relayList = await userSigner.signEvent({
    kind: 10002,
    created_at: 6,
    tags: [
      ['r', freeRelays[0], 'read'],
      ['r', 'wss://read.example', 'read']
    ],
    content: ''
  })
  const published = []

  await refreshStoredContentKeyEvents({
    _isOnline: async () => true,
    _nowSeconds: () => 200,
    _fetchRelayListEvent: async () => relayList,
    _relayPool: relayPoolStub({
      send: async (event, relays) => {
        published.push({ event, relays })
        return { success: true }
      }
    })
  })

  assert.equal(published[0].event.kind, 10002)
  assert.deepEqual(published[0].event.tags, [
    ['r', freeRelays[0]],
    ['r', freeRelays[1]],
    ['r', 'wss://read.example', 'read']
  ])
})

test('rotateContentKeyIfStillCanonical rotates when relays still advertise removed-known key', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = await addNsecAccount()
  const now = Math.floor(Date.now() / 1000)
  const oldContent = await addContentKey(account.pubkey, now)
  const userSigner = secrets.getNsecSigner(account.pubkey)
  const relayList = await userSigner.signEvent({
    kind: 10002,
    created_at: 6,
    tags: [['r', 'wss://one.example', 'write']],
    content: ''
  })
  const oldEvent = await makeContentKeyEventForPubkey({
    userSigner,
    contentPubkey: oldContent.pubkey,
    createdAt: 60
  })
  const published = []

  const result = await rotateContentKeyIfStillCanonical({
    ownerPubkey: account.pubkey,
    removedKnownContentPubkey: oldContent.pubkey,
    _nowSeconds: () => now,
    _fetchRelayListEvent: async () => relayList,
    _relayPool: relayPoolStub({
      events: async () => [oldEvent],
      send: async (event, relays) => {
        published.push({ event, relays })
        return { success: true }
      }
    })
  })

  assert.equal(result.status, 'rotated')
  assert.equal(result.rotated, true)
  assert.equal(published.length, 1)
  assert.deepEqual(published[0].relays, ['wss://one.example'])
  assert.notEqual(parseContentKeyEvent(published[0].event).iykcPubkey, oldContent.pubkey)
  assert.equal(secrets.listContentKeys(account.pubkey).length, 2)
  assert.ok(secrets.getContentKeySigner(account.pubkey, oldContent.pubkey))
  assert.equal(secrets.listContentKeys(account.pubkey).find(key => key.pubkey === result.contentPubkey).createdAt, now + 1)
})

test('rotateContentKeyIfStillCanonical clears when relays already advertise another key', async () => {
  secrets.unlock(generateSecretKey(), null)
  const account = await addNsecAccount()
  const oldContent = await addContentKey(account.pubkey, 50)
  const userSigner = secrets.getNsecSigner(account.pubkey)
  const newerPubkey = pubkeyFixture(999)
  const relayList = await userSigner.signEvent({
    kind: 10002,
    created_at: 6,
    tags: [['r', 'wss://one.example', 'write']],
    content: ''
  })
  const newerEvent = await makeContentKeyEventForPubkey({
    userSigner,
    contentPubkey: newerPubkey,
    createdAt: 70
  })
  let published = false

  const result = await rotateContentKeyIfStillCanonical({
    ownerPubkey: account.pubkey,
    removedKnownContentPubkey: oldContent.pubkey,
    _fetchRelayListEvent: async () => relayList,
    _relayPool: relayPoolStub({
      events: async () => [newerEvent],
      send: async () => { published = true }
    })
  })

  assert.equal(result.status, 'cleared')
  assert.equal(result.reason, 'already-rotated')
  assert.equal(published, false)
  assert.equal(secrets.listContentKeys(account.pubkey)[0].pubkey, oldContent.pubkey)
})

test('failed rotation publication retains old decryption material and retries the same new active key', async () => {
  const vaultKey = generateSecretKey()
  secrets.unlock(vaultKey, null)
  const account = await addNsecAccount()
  const now = Math.floor(Date.now() / 1000)
  const oldContent = await addContentKey(account.pubkey, now)
  const userSigner = secrets.getNsecSigner(account.pubkey)
  const peer = signer()
  const encrypted = await peer.nip44EncryptDoubleDH(account.pubkey, 26300, '', btoa('late historical message'), oldContent.pubkey)
  const oldEvent = await makeContentKeyEventForPubkey({ userSigner, contentPubkey: oldContent.pubkey, createdAt: now })
  const relayList = await userSigner.signEvent({ kind: 10002, created_at: now, tags: [['r', 'wss://one.example', 'write']], content: '' })
  let success = false
  const attempts = []
  const options = {
    ownerPubkey: account.pubkey, removedKnownContentPubkey: oldContent.pubkey,
    _nowSeconds: () => now,
    _fetchRelayListEvent: async () => relayList,
    _relayPool: relayPoolStub({
      events: async () => [oldEvent],
      send: async event => {
        attempts.push(parseContentKeyEvent(event).iykcPubkey)
        return { success }
      }
    })
  }
  const failed = await rotateContentKeyIfStillCanonical(options)
  assert.equal(failed.status, 'retry')
  assert.notEqual(failed.contentPubkey, oldContent.pubkey)
  const blob = secrets.sealCurrentEntries()
  secrets.lock()
  secrets.unlock(vaultKey, blob)
  success = true
  const retried = await rotateContentKeyIfStillCanonical(options)
  assert.equal(retried.status, 'rotated')
  assert.equal(retried.rotated, false)
  assert.deepEqual(attempts, [failed.contentPubkey, failed.contentPubkey])
  assert.equal(secrets.listContentKeys(account.pubkey).length, 2)
  const decrypted = await secrets.getNsecSigner(account.pubkey).nip44DecryptDoubleDH(peer.getPublicKey(), 26300, '', encrypted[0], encrypted[1], oldContent.pubkey)
  assert.equal(atob(decrypted), 'late historical message')
})

test('refreshStoredContentKeyEventsIfDue persists a four-hour cadence across visits', async () => {
  secrets.unlock(generateSecretKey(), null)
  const first = await refreshStoredContentKeyEventsIfDue({ _nowMs: () => 10_000 })
  const second = await refreshStoredContentKeyEventsIfDue({ _nowMs: () => 10_000 + 60_000 })

  assert.deepEqual(first, { checked: 0, accounts: [] })
  assert.equal(second.skipped, 'fresh')
})

test('startContentKeyEventRefresh does not arm its clock while locked', () => {
  const timers = []
  const stop = startContentKeyEventRefresh({
    _setTimeout: (fn, ms) => {
      timers.push({ fn, ms })
      return { unref () {} }
    },
    _clearTimeout: () => {}
  })

  try {
    assert.deepEqual(timers, [])
  } finally {
    stop()
  }
})
