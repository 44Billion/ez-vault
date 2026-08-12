import { trustedKeyDeal, hexPubShard, hexShard } from '@fiatjaf/promenade-trusted-dealer'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from 'libp2r2p/base16'
import { finalizeEvent, isValidEvent } from 'libp2r2p/event'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import { randomAccountName } from './account-names.js'
import { publishAccountBootstrap } from './account-bootstrap.js'
import { seededNeutralAvatarDataUrl } from './avatar.js'
import * as passkey from './passkey.js'
import {
  abortIntake,
  commitPrepared,
  createIntakeToken,
  prepareBunker
} from './account-intake.js'

export const CENTRAL_URL = 'https://auth.njump.me'
export const CENTRAL_RELAY = 'wss://auth.njump.me'
export const OPERATORS = Object.freeze([
  'https://po.coracle.social',
  'https://po.f7z.io',
  'https://po.jumble.social',
  'https://po.njump.me'
])
export const THRESHOLD = 2

const TOKEN_KIND = 20443
const CENTRAL_REGISTRATION_KIND = 20445
const OPERATOR_REGISTRATION_KIND = 20444
const PROFILE_NAME = 'default'
const REQUEST_TIMEOUT_MS = 15_000
// OAuth may be interrupted by an app switch or a hidden desktop window. Give
// the user ample time to return, but do not leave the shared Pomegranate flow
// busy indefinitely: this popup was opened by us, so it may also be closed by
// us when the authentication deadline expires.
export const POPUP_TIMEOUT_MS = 10 * 60_000
const ACCOUNT_POLL_MS = 10_000
const HEX32 = /^[0-9a-f]{64}$/
const utf8 = new TextEncoder()

let activePromise = null
const busyListeners = new Set()

function pomegranateError (code) {
  const err = new Error(code)
  err.code = code
  return err
}

function setBusy (busy) {
  for (const fn of busyListeners) {
    try { fn(busy) } catch (err) { console.warn('pomegranate listener threw', err) }
  }
}

export function isPomegranateBusy () {
  return Boolean(activePromise)
}

export function subscribePomegranateBusy (fn) {
  busyListeners.add(fn)
  fn(isPomegranateBusy())
  return () => busyListeners.delete(fn)
}

function reportStep (label, onStep) {
  console.info(`Pomegranate: ${label}`)
  onStep?.(label)
}

export function decodePomegranateToken (token, now = Date.now()) {
  if (typeof token !== 'string' || !token) throw pomegranateError('POMEGRANATE_INVALID_TOKEN')
  let event
  try { event = JSON.parse(atob(token)) } catch { throw pomegranateError('POMEGRANATE_INVALID_TOKEN') }
  if (!isValidEvent(event) || event.kind !== TOKEN_KIND) throw pomegranateError('POMEGRANATE_INVALID_TOKEN')
  if (!Number.isSafeInteger(event.created_at) || event.created_at * 1000 < now - 24 * 60 * 60 * 1000 ||
      event.created_at * 1000 > now + 5 * 60 * 1000) {
    throw pomegranateError('POMEGRANATE_EXPIRED_TOKEN')
  }
  const emails = event.tags.filter(tag => Array.isArray(tag) && tag[0] === 'email' && typeof tag[1] === 'string')
  if (emails.length !== 1 || !emails[0][1].trim()) throw pomegranateError('POMEGRANATE_INVALID_TOKEN')
  return { token, email: emails[0][1].trim() }
}

export function authenticateWithGoogle ({
  openWindow = (...args) => window.open(...args),
  addMessageListener = fn => window.addEventListener('message', fn),
  removeMessageListener = fn => window.removeEventListener('message', fn),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  const popup = openWindow(`${CENTRAL_URL}/login/google`, 'PomegranateGoogleOAuth', 'width=600,height=600')
  if (!popup) return Promise.reject(pomegranateError('POMEGRANATE_POPUP_BLOCKED'))

  return new Promise((resolve, reject) => {
    let settled = false
    let monitor = null
    let timeout = null
    const cleanup = () => {
      removeMessageListener(onMessage)
      clearIntervalImpl(monitor)
      clearTimeoutImpl(timeout)
    }
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      cleanup()
      try { popup.close() } catch { /* noop */ }
      fn(value)
    }
    const onMessage = event => {
      if (event.origin !== CENTRAL_URL || event.source !== popup || typeof event.data?.token !== 'string') return
      try { finish(resolve, decodePomegranateToken(event.data.token)) } catch (err) { finish(reject, err) }
    }
    addMessageListener(onMessage)
    monitor = setIntervalImpl(() => {
      if (popup.closed) finish(reject, pomegranateError('POMEGRANATE_CANCELLED'))
    }, 250)
    timeout = setTimeoutImpl(() => finish(reject, pomegranateError('POMEGRANATE_POPUP_TIMEOUT')), POPUP_TIMEOUT_MS)
  })
}

async function request (url, options = {}, fetchImpl = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') throw pomegranateError('POMEGRANATE_TIMEOUT')
    throw pomegranateError('POMEGRANATE_NETWORK_ERROR')
  } finally {
    clearTimeout(timer)
  }
}

function authHeaders (token, extra = {}) {
  return { ...extra, Authorization: `Token ${token}` }
}

async function getAccount (token, fetchImpl) {
  const response = await request(`${CENTRAL_URL}/account`, {
    headers: authHeaders(token)
  }, fetchImpl)
  if (response.status === 404) return null
  if (response.status === 401) throw pomegranateError('POMEGRANATE_AUTH_FAILED')
  if (!response.ok) throw pomegranateError('POMEGRANATE_ACCOUNT_FAILED')
  try { return await response.json() } catch { throw pomegranateError('POMEGRANATE_INVALID_ACCOUNT') }
}

function operatorUrls (account) {
  if (!Array.isArray(account?.operators)) return []
  return account.operators.map(operator => typeof operator === 'string' ? operator : operator?.url).filter(Boolean).sort()
}

export function validatePomegranateAccount (account, expectedPubkey = null, { requireDefaults = false } = {}) {
  const actualOperators = operatorUrls(account)
  if (!account || !HEX32.test(account.pubkey || '') || !Number.isSafeInteger(account.threshold) ||
      account.threshold < 1 || account.threshold > actualOperators.length || actualOperators.length < 2 ||
      new Set(actualOperators).size !== actualOperators.length) {
    throw pomegranateError('POMEGRANATE_INVALID_ACCOUNT')
  }
  if (expectedPubkey && account.pubkey !== expectedPubkey) throw pomegranateError('POMEGRANATE_ACCOUNT_MISMATCH')
  const expectedOperators = [...OPERATORS].sort()
  if (requireDefaults && (account.threshold !== THRESHOLD || actualOperators.length !== expectedOperators.length ||
      actualOperators.some((url, i) => url !== expectedOperators[i]))) {
    throw pomegranateError('POMEGRANATE_OPERATOR_MISMATCH')
  }
  return account
}

async function pollAccount (token, expectedPubkey, fetchImpl) {
  const deadline = Date.now() + ACCOUNT_POLL_MS
  do {
    const account = await getAccount(token, fetchImpl)
    if (account) return validatePomegranateAccount(account, expectedPubkey, { requireDefaults: true })
    await new Promise(resolve => setTimeout(resolve, 400))
  } while (Date.now() < deadline)
  throw pomegranateError('POMEGRANATE_ACCOUNT_TIMEOUT')
}

export async function createPomegranateAccount ({
  token,
  email,
  fetchImpl = fetch,
  onStep,
  _publishBootstrap = publishAccountBootstrap,
  _neutralAvatar = seededNeutralAvatarDataUrl,
  _randomName = randomAccountName
}) {
  const secretKey = generateSecretKey()
  let shards = null
  try {
    reportStep('Preparing key', onStep)
    const master = secretKey.reduce((value, byte) => (value << 8n) + BigInt(byte), 0n)
    shards = trustedKeyDeal(master, THRESHOLD, OPERATORS.length).shards
    reportStep('Splitting secret', onStep)
    const session = crypto.randomUUID()
    const centralEvent = finalizeEvent({
      kind: CENTRAL_REGISTRATION_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['threshold', String(THRESHOLD)],
        ...OPERATORS.map((operator, i) => ['operator', operator, hexPubShard(shards[i].pubShard)])
      ],
      content: ''
    }, secretKey)
    const centralResponse = await request(`${CENTRAL_URL}/register`, {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
        'X-Pomegranate-Session': session
      }),
      body: JSON.stringify(centralEvent)
    }, fetchImpl)
    if (!centralResponse.ok) throw pomegranateError('POMEGRANATE_CENTRAL_REGISTRATION_FAILED')
    reportStep('Registering with central', onStep)

    for (let i = 0; i < OPERATORS.length; i++) {
      const operator = OPERATORS[i]
      const event = finalizeEvent({
        kind: OPERATOR_REGISTRATION_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['central', CENTRAL_URL],
          ['email', email],
          ['oauth', 'google']
        ],
        content: hexShard(shards[i])
      }, secretKey)
      const response = await request(`${operator}/po/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pomegranate-Operator-Token': bytesToHex(sha256(utf8.encode(`${session}:${operator}`)))
        },
        body: JSON.stringify(event)
      }, fetchImpl)
      if (!response.ok) throw pomegranateError('POMEGRANATE_OPERATOR_REGISTRATION_FAILED')
      reportStep(`Registering with operator ${i + 1}`, onStep)
    }
    const account = await pollAccount(token, getPublicKey(secretKey), fetchImpl)
    const picture = await _neutralAvatar(account.pubkey)
    const bootstrap = await _publishBootstrap({
      secretKey,
      name: _randomName(),
      picture
    })
    return { account, bootstrap }
  } finally {
    secretKey.fill(0)
    if (shards) {
      for (const shard of shards) {
        if (!shard) continue
        shard.secret = 0n
        shard.pubkey = null
        shard.pubShard = null
      }
      shards.fill(null)
    }
    shards = null
  }
}

export async function getDefaultPomegranateProfile (token, fetchImpl = fetch) {
  const response = await request(`${CENTRAL_URL}/profiles`, {
    headers: authHeaders(token)
  }, fetchImpl)
  if (!response.ok) throw pomegranateError('POMEGRANATE_PROFILES_FAILED')
  let profiles
  try { profiles = await response.json() } catch { throw pomegranateError('POMEGRANATE_PROFILES_FAILED') }
  const defaults = (Array.isArray(profiles) ? profiles : [])
    .filter(profile => profile?.name === PROFILE_NAME && HEX32.test(profile.handler_pubkey || ''))
    .sort((a, b) => a.handler_pubkey.localeCompare(b.handler_pubkey))
  if (defaults.length) return defaults[0]

  const created = await request(`${CENTRAL_URL}/profiles`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: PROFILE_NAME })
  }, fetchImpl)
  if (!created.ok) throw pomegranateError('POMEGRANATE_PROFILE_CREATION_FAILED')
  let profile
  try { profile = await created.json() } catch { throw pomegranateError('POMEGRANATE_PROFILE_CREATION_FAILED') }
  if (!HEX32.test(profile?.handler_pubkey || '')) throw pomegranateError('POMEGRANATE_PROFILE_CREATION_FAILED')
  return profile
}

export async function resolvePomegranateAccount ({
  token,
  email,
  fetchImpl = fetch,
  onStep,
  _createAccount = createPomegranateAccount,
  beforeCreate
}) {
  const existing = await getAccount(token, fetchImpl)
  if (existing) return { account: validatePomegranateAccount(existing), bootstrap: null, created: false }
  await beforeCreate?.()
  const created = await _createAccount({ token, email, fetchImpl, onStep })
  return { ...created, created: true }
}

export async function runPomegranateFlow ({
  authenticate = authenticateWithGoogle,
  fetchImpl = fetch,
  onStep,
  _createAccount = createPomegranateAccount,
  _resolveAccount = resolvePomegranateAccount,
  _getProfile = getDefaultPomegranateProfile,
  _prepareBunker = prepareBunker,
  _commitPrepared = commitPrepared,
  _ensureRegistered = passkey.ensureRegistered
} = {}) {
  const auth = await authenticate()
  const { token, email } = decodePomegranateToken(auth.token)
  let protectionReady = false
  const ensureProtection = async () => {
    if (protectionReady) return
    await _ensureRegistered()
    protectionReady = true
  }
  const { account, bootstrap } = await _resolveAccount({
    token,
    email,
    fetchImpl,
    onStep,
    _createAccount,
    beforeCreate: ensureProtection
  })
  // Existing accounts need no remote creation, so settle protection here,
  // before profile creation or the bunker connection can change state.
  await ensureProtection()
  const profile = await _getProfile(token, fetchImpl)
  const bunkerUrl = `bunker://${profile.handler_pubkey}?relay=${encodeURIComponent(CENTRAL_RELAY)}`
  const intake = createIntakeToken()
  try {
    const prepared = await _prepareBunker(bunkerUrl, intake, { neutralAvatar: true })
    if (prepared.pubkey !== account.pubkey) throw pomegranateError('POMEGRANATE_ACCOUNT_MISMATCH')
    if (bootstrap && !prepared.skipped) prepared.record = { ...prepared.record, ...bootstrap }
    if (!prepared.skipped) await _commitPrepared([prepared], { protectionReady })
    return { pubkey: account.pubkey, skipped: Boolean(prepared.skipped) }
  } catch (err) {
    abortIntake(intake)
    throw err
  }
}

export function continueWithGoogle (options) {
  if (activePromise) return activePromise
  setBusy(true)
  activePromise = runPomegranateFlow(options).finally(() => {
    activePromise = null
    setBusy(false)
  })
  return activePromise
}
