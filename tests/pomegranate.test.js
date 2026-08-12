import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { finalizeEvent, isValidEvent } from 'libp2r2p/event'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import {
  CENTRAL_URL,
  OPERATORS,
  THRESHOLD,
  authenticateWithGoogle,
  continueWithGoogle,
  createPomegranateAccount,
  decodePomegranateToken,
  getDefaultPomegranateProfile,
  resolvePomegranateAccount,
  runPomegranateFlow,
  subscribePomegranateBusy,
  validatePomegranateAccount
} from '../src/services/pomegranate.js'

function signedToken ({ email = 'alice@example.test', createdAt = Math.floor(Date.now() / 1000) } = {}) {
  const event = finalizeEvent({
    kind: 20443,
    created_at: createdAt,
    tags: [['email', email]],
    content: ''
  }, generateSecretKey())
  return Buffer.from(JSON.stringify(event)).toString('base64')
}

afterEach(async () => {
  // A failed shared operation must have released the singleton slot before
  // the next test starts. This is intentionally a no-op operation.
  await Promise.resolve()
})

test('Google popup accepts a signed token only from the expected window and origin', async () => {
  const token = signedToken()
  const popup = { closed: false, closeCalled: false, close () { this.closeCalled = true } }
  let listener
  const promise = authenticateWithGoogle({
    openWindow: url => {
      assert.equal(url, `${CENTRAL_URL}/login/google`)
      return popup
    },
    addMessageListener: fn => { listener = fn },
    removeMessageListener: fn => { assert.equal(fn, listener) },
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
    setTimeoutImpl: () => 2,
    clearTimeoutImpl: () => {}
  })

  listener({ origin: 'https://central.invalid', source: popup, data: { token } })
  listener({ origin: CENTRAL_URL, source: {}, data: { token } })
  listener({ origin: CENTRAL_URL, source: popup, data: { token } })

  assert.deepEqual(await promise, { token, email: 'alice@example.test' })
  assert.equal(popup.closeCalled, true)
})

test('blocked and user-closed Google popups have distinct cancellation errors', async () => {
  await assert.rejects(
    authenticateWithGoogle({ openWindow: () => null }),
    err => err.code === 'POMEGRANATE_POPUP_BLOCKED'
  )

  const popup = { closed: false, close () {} }
  let monitor
  const pending = authenticateWithGoogle({
    openWindow: () => popup,
    addMessageListener: () => {},
    removeMessageListener: () => {},
    setIntervalImpl: fn => { monitor = fn; return 1 },
    clearIntervalImpl: () => {},
    setTimeoutImpl: () => 2,
    clearTimeoutImpl: () => {}
  })
  popup.closed = true
  monitor()
  await assert.rejects(pending, err => err.code === 'POMEGRANATE_CANCELLED')
})

test('Pomegranate tokens require a valid kind, signature, email and timestamp', () => {
  const now = Date.now()
  assert.equal(decodePomegranateToken(signedToken(), now).email, 'alice@example.test')
  assert.throws(() => decodePomegranateToken(signedToken({ createdAt: Math.floor(now / 1000) - 86_401 }), now), /EXPIRED/)
  assert.throws(() => decodePomegranateToken(signedToken({ createdAt: Math.floor(now / 1000) + 301 }), now), /EXPIRED/)

  const decoded = JSON.parse(Buffer.from(signedToken(), 'base64').toString())
  decoded.tags = []
  assert.throws(() => decodePomegranateToken(Buffer.from(JSON.stringify(decoded)).toString('base64')), /INVALID_TOKEN/)
})

test('new accounts register a signed 2-of-4 setup with central and every operator', async (t) => {
  const logs = []
  t.mock.method(console, 'info', (...args) => logs.push(args.join(' ')))
  const calls = []
  let expectedPubkey = ''
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (url === `${CENTRAL_URL}/register`) {
      const event = JSON.parse(options.body)
      expectedPubkey = event.pubkey
      return new Response('', { status: 200 })
    }
    if (url === `${CENTRAL_URL}/account`) {
      return Response.json({ pubkey: expectedPubkey, threshold: THRESHOLD, operators: OPERATORS })
    }
    return new Response('', { status: 200 })
  }
  const steps = []

  const bootstrap = {
    name: 'Azure Ember',
    picture: 'data:image/svg+xml,neutral',
    profileEvent: { kind: 0 },
    relayListEvent: { kind: 10002 },
    writeRelays: ['wss://write.example']
  }
  const created = await createPomegranateAccount({
    token: 'opaque-token',
    email: 'alice@example.test',
    fetchImpl,
    onStep: step => steps.push(step),
    _neutralAvatar: async pubkey => {
      assert.equal(pubkey, expectedPubkey)
      return bootstrap.picture
    },
    _randomName: () => bootstrap.name,
    _publishBootstrap: async ({ secretKey, name, picture }) => {
      assert.equal(getPublicKey(secretKey), expectedPubkey)
      assert.equal(name, bootstrap.name)
      assert.equal(picture, bootstrap.picture)
      return bootstrap
    }
  })
  const account = created.account

  assert.equal(account.pubkey, expectedPubkey)
  assert.equal(account.threshold, 2)
  assert.deepEqual(account.operators, OPERATORS)
  assert.equal(calls.length, 6)
  assert.deepEqual(created.bootstrap, bootstrap)

  const central = JSON.parse(calls[0].options.body)
  assert.equal(central.kind, 20445)
  assert.equal(isValidEvent(central), true)
  assert.deepEqual(central.tags.map(tag => tag.slice(0, 2)), [
    ['threshold', '2'],
    ...OPERATORS.map(operator => ['operator', operator])
  ])
  assert.ok(calls[0].options.headers['X-Pomegranate-Session'])

  for (let i = 0; i < OPERATORS.length; i++) {
    const call = calls[i + 1]
    const event = JSON.parse(call.options.body)
    assert.equal(call.url, `${OPERATORS[i]}/po/register`)
    assert.equal(event.kind, 20444)
    assert.equal(event.pubkey, expectedPubkey)
    assert.equal(isValidEvent(event), true)
    assert.deepEqual(event.tags, [
      ['central', CENTRAL_URL],
      ['email', 'alice@example.test'],
      ['oauth', 'google']
    ])
    assert.match(call.options.headers['X-Pomegranate-Operator-Token'], /^[0-9a-f]{64}$/)
    assert.match(event.content, /^[0-9a-f]+$/)
  }
  assert.deepEqual(steps, [
    'Preparing key',
    'Splitting secret',
    'Registering with central',
    'Registering with operator 1',
    'Registering with operator 2',
    'Registering with operator 3',
    'Registering with operator 4'
  ])
  assert.equal(logs.join('\n').includes('alice@example.test'), false)
  assert.equal(logs.join('\n').includes('opaque-token'), false)
})

test('remote registration stops on partial operator failure', async (t) => {
  t.mock.method(console, 'info', () => {})
  const calls = []
  await assert.rejects(createPomegranateAccount({
    token: 'token',
    email: 'alice@example.test',
    fetchImpl: async (url) => {
      calls.push(url)
      if (url === `${CENTRAL_URL}/register`) return new Response('', { status: 200 })
      return new Response('', { status: 503 })
    }
  }), /OPERATOR_REGISTRATION_FAILED/)
  assert.deepEqual(calls, [`${CENTRAL_URL}/register`, `${OPERATORS[0]}/po/register`])
})

test('an existing Pomegranate account never enters creation or bootstrap', async () => {
  const account = { pubkey: 'a'.repeat(64), threshold: 2, operators: OPERATORS }
  const result = await resolvePomegranateAccount({
    token: 'token',
    email: 'alice@example.test',
    fetchImpl: async () => Response.json(account),
    _createAccount: () => { throw new Error('must not create or bootstrap') }
  })

  assert.deepEqual(result, { account, bootstrap: null, created: false })
})

test('the completed flow persists bootstrap metadata only for a newly created account', async () => {
  const pubkey = 'a'.repeat(64)
  const handlerPubkey = 'b'.repeat(64)
  const token = signedToken()
  const bootstrap = {
    name: 'Azure Ember',
    picture: 'data:image/svg+xml,neutral',
    profileEvent: { kind: 0 },
    relayListEvent: { kind: 10002 },
    writeRelays: ['wss://write.example']
  }
  const committed = []

  const result = await runPomegranateFlow({
    authenticate: async () => ({ token }),
    _resolveAccount: async ({ email }) => {
      assert.equal(email, 'alice@example.test')
      return { account: { pubkey }, bootstrap, created: true }
    },
    _getProfile: async () => ({ handler_pubkey: handlerPubkey }),
    _prepareBunker: async (url, _intake, options) => {
      assert.equal(url, `bunker://${handlerPubkey}?relay=wss%3A%2F%2Fauth.njump.me`)
      assert.deepEqual(options, { neutralAvatar: true })
      return { pubkey, record: { type: 'bunker', pubkey } }
    },
    _commitPrepared: async prepared => committed.push(...prepared)
  })

  assert.deepEqual(result, { pubkey, skipped: false })
  assert.deepEqual(committed[0].record, { type: 'bunker', pubkey, ...bootstrap })
})

test('the completed flow leaves an existing account record metadata unchanged', async () => {
  const pubkey = 'a'.repeat(64)
  const originalRecord = { type: 'bunker', pubkey, name: 'Remote profile' }
  let committed

  await runPomegranateFlow({
    authenticate: async () => ({ token: signedToken() }),
    _resolveAccount: async () => ({ account: { pubkey }, bootstrap: null, created: false }),
    _getProfile: async () => ({ handler_pubkey: 'b'.repeat(64) }),
    _prepareBunker: async () => ({ pubkey, record: originalRecord }),
    _commitPrepared: async prepared => { committed = prepared }
  })

  assert.equal(committed[0].record, originalRecord)
})

test('account validation rejects duplicates and inconsistent new-account results', () => {
  const pubkey = 'a'.repeat(64)
  assert.throws(
    () => validatePomegranateAccount({ pubkey, threshold: 2, operators: [OPERATORS[0], OPERATORS[0]] }),
    /INVALID_ACCOUNT/
  )
  assert.throws(
    () => validatePomegranateAccount({ pubkey, threshold: 2, operators: OPERATORS.slice(0, 3) }, pubkey, { requireDefaults: true }),
    /OPERATOR_MISMATCH/
  )
  assert.throws(
    () => validatePomegranateAccount({ pubkey, threshold: 2, operators: OPERATORS }, 'b'.repeat(64)),
    /ACCOUNT_MISMATCH/
  )
})

test('default profile selection is deterministic and creates one when absent', async () => {
  const first = await getDefaultPomegranateProfile('token', async () => Response.json([
    { name: 'default', handler_pubkey: 'f'.repeat(64) },
    { name: 'other', handler_pubkey: '0'.repeat(64) },
    { name: 'default', handler_pubkey: '1'.repeat(64) }
  ]))
  assert.equal(first.handler_pubkey, '1'.repeat(64))

  let calls = 0
  const created = await getDefaultPomegranateProfile('token', async (_url, options = {}) => {
    calls++
    if (!options.method) return Response.json([])
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { name: 'default' })
    return Response.json({ name: 'default', handler_pubkey: '2'.repeat(64) }, { status: 201 })
  })
  assert.equal(calls, 2)
  assert.equal(created.handler_pubkey, '2'.repeat(64))
})

test('all Google buttons share one in-flight operation and busy state', async () => {
  let rejectAuthentication
  const authenticate = () => new Promise((_resolve, reject) => { rejectAuthentication = reject })
  const busy = []
  const unsubscribe = subscribePomegranateBusy(value => busy.push(value))
  const first = continueWithGoogle({ authenticate })
  const second = continueWithGoogle({ authenticate: () => { throw new Error('must not start twice') } })

  assert.equal(first, second)
  rejectAuthentication(new Error('stop'))
  await assert.rejects(first, /stop/)
  unsubscribe()
  assert.deepEqual(busy, [false, true, false])
})
