import { ask, reply, tell } from '../helpers/window-message.js'
import { serializeError } from '../helpers/error.js'
import * as store from './accounts-store.js'
import { filterVisibleAccounts } from './account-mutations.js'
import * as accountMutationJournal from './account-mutation-journal.js'
import * as signer from './signer.js'
import * as log from './messenger-log/index.js'
import * as secrets from './secrets.js'
import * as nostrdb from './nostrdb.js'
import * as sync from './sync/index.js'
import { npubFromPubkey, parseProfileEvent } from '../helpers/nostr/index.js'
import { parseRelayListEvent } from './relays.js'

// Read-only disclosures — the result is publicly derivable, so logging them
// would just be noise in the audit trail. Match both wire and JS spellings.
const UNLOGGED_METHODS = new Set([
  'getPublicKey', 'get_public_key',
  'getRelays', 'get_relays'
])

const NIP44_V3_CONTEXT_METHODS = new Set([
  'nip44v3_encrypt',
  'nip44v3_decrypt',
  'nip44v3_encrypt_double_dh',
  'nip44v3_decrypt_double_dh'
])

const LAUNCHER_APP_NAME = 'App launcher'

function normalizedEventKind (kind) {
  const n = typeof kind === 'string' && kind.trim() !== '' ? Number(kind) : kind
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n : undefined
}

export function signerRequestApp (app) {
  const id = app?.id ?? ''
  const name = app?.name ?? ''
  const icon = app?.icon ?? ''
  if (!String(id).trim() && !String(name).trim() && !String(icon).trim()) {
    return { id: '', name: LAUNCHER_APP_NAME, icon: '' }
  }
  return { id, name, icon }
}

export function signerRequestContext (method, params = []) {
  if (method === 'sign_event' || method === 'double_sign_event') {
    return params?.[0]?.kind == null ? {} : { eventKind: params[0].kind }
  }
  if (!NIP44_V3_CONTEXT_METHODS.has(method)) return {}

  const eventKind = normalizedEventKind(params?.[1])
  return {
    ...(eventKind === undefined ? {} : { eventKind }),
    eventScope: String(params?.[2] ?? '')
  }
}

// Only parents on this list are treated as the launcher. When we can resolve
// the parent's origin (ancestorOrigins or document.referrer), we target
// VAULT_READY at it specifically so the port never reaches an untrusted
// frame. When we can't, we fall back to "*" and rely on LAUNCHER_READY as
// the gate.
const TRUSTED_ORIGIN_PATTERNS = [
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/,
  'https://nostrapps.com'
]

function isTrustedOrigin (origin) {
  if (!origin || typeof origin !== 'string') return false
  for (const rule of TRUSTED_ORIGIN_PATTERNS) {
    if (rule instanceof RegExp ? rule.test(origin) : rule === origin) return true
  }
  return false
}

// Chromium/WebKit expose ancestorOrigins synchronously. Firefox doesn't, so
// we try document.referrer's origin next — that can be stripped by the
// parent's referrer-policy, in which case we return null and the caller
// falls back to targetOrigin="*".
function syncTrustedParentOrigin () {
  const ancestors = window.location.ancestorOrigins
  if (ancestors?.length) {
    return isTrustedOrigin(ancestors[0]) ? ancestors[0] : null
  }
  try {
    if (!document.referrer) return null
    const origin = new URL(document.referrer).origin
    return isTrustedOrigin(origin) ? origin : null
  } catch {
    return null
  }
}

function eventList (event) {
  return event ? [event] : []
}

function launcherProfile (account) {
  const parsed = parseProfileEvent(account.profileEvent)
  return {
    name: parsed.name || account.name || '',
    about: parsed.about || '',
    picture: parsed.picture || account.picture || '',
    npub: npubFromPubkey(account.pubkey),
    meta: { events: eventList(account.profileEvent) }
  }
}

function launcherRelays (account) {
  const parsed = parseRelayListEvent(account.relayListEvent)
  return {
    read: parsed.read,
    write: parsed.write.length ? parsed.write : [...(account.writeRelays || [])],
    meta: { events: eventList(account.relayListEvent) }
  }
}

function isAccountLocked (account) {
  if (account.type === 'npub') return false
  if (account.type === 'nsec') return !secrets.getNsecSigner(account.pubkey)
  if (account.type === 'bunker') return !secrets.getBunkerHandle(account.pubkey)
  return true
}

// Launcher-facing account shape. Secret keys and bunker URLs stay in the vault.
export function accountForLauncher (account) {
  return {
    pubkey: account.pubkey,
    profile: launcherProfile(account),
    relays: launcherRelays(account),
    isReadOnly: account.type === 'npub',
    isLocked: isAccountLocked(account)
  }
}

export function snapshotAccounts () {
  return filterVisibleAccounts(store.list()).map(accountForLauncher)
}

function isNewerEvent (event, storedEvent) {
  return Number.isFinite(event?.created_at) && event.created_at > (storedEvent?.created_at ?? 0)
}

export function applyAccountEvents (pubkey, events) {
  const account = pubkey ? store.get(pubkey) : null
  if (!account || !Array.isArray(events) || !events.length) return false

  const patch = {}
  for (const event of events) {
    if (event?.kind === 0 && isNewerEvent(event, patch.profileEvent || account.profileEvent)) {
      const parsed = parseProfileEvent(event)
      patch.profileEvent = event
      patch.name = parsed.name || account.name || ''
      patch.picture = parsed.picture || account.picture || ''
    } else if (event?.kind === 10002 && isNewerEvent(event, patch.relayListEvent || account.relayListEvent)) {
      const relays = parseRelayListEvent(event)
      patch.relayListEvent = event
      patch.writeRelays = relays.write
    }
  }

  if (!Object.keys(patch).length) return false
  store.update(pubkey, patch)
  return true
}

let launcherPort = null
let launcherOrigin = null
let handshakeComplete = false
let unsubscribeStore = null
let unsubscribeSecrets = null
let unsubscribeJournal = null
let accountsStateQueued = false

export function setAccountsState () {
  if (!handshakeComplete || !launcherPort) return
  tell(launcherPort, {
    code: 'SET_ACCOUNTS_STATE',
    payload: { accounts: snapshotAccounts() }
  })
}

function scheduleAccountsState () {
  if (accountsStateQueued) return
  accountsStateQueued = true
  queueMicrotask(() => {
    accountsStateQueued = false
    setAccountsState()
  })
}

function startAccountStateSubscriptions () {
  unsubscribeStore?.()
  unsubscribeSecrets?.()
  unsubscribeJournal?.()
  unsubscribeStore = store.subscribe(scheduleAccountsState)
  unsubscribeSecrets = secrets.subscribe(scheduleAccountsState)
  unsubscribeJournal = accountMutationJournal.subscribe(scheduleAccountsState)
}

export async function initMessenger () {
  // No parent to talk to — we're top-level (opened directly).
  if (window === window.top) return

  launcherOrigin = syncTrustedParentOrigin()
  // The launcher can't know when the vault is ready, so we send VAULT_READY
  // unprompted. If we can't pin a trusted origin up front, fall back to "*"
  // — the port may end up in an untrusted parent, but it can't drive NIP07
  // until handshakeComplete flips, and that gate requires a REPLY whose
  // window-level origin we verify (port messages carry no origin).
  const targetOrigin = launcherOrigin ?? '*'

  const { port1, port2 } = new MessageChannel()
  port1.addEventListener('message', onPortMessage)
  port1.start()
  launcherPort = port1

  // ask() generates a reqId, posts on window.parent, and resolves on the
  // matching REPLY (also a window-level message — that's where e.origin
  // lives). We validate origin against the allowlist before flipping the
  // gate; a malicious parent that grabbed the port via the "*" fallback
  // can't fake a trusted e.origin on the reply.
  const { error, origin } = await ask(window.parent, {
    code: 'VAULT_READY',
    payload: { accounts: snapshotAccounts() }
  }, { targetOrigin, transfer: [port2] })
  if (error || !isTrustedOrigin(origin)) {
    // Disentangle the channel — port2 may be held by an untrusted parent via
    // the "*" fallback; closing port1 guarantees any message they post on it
    // can no longer reach us.
    try { port1.close() } catch { /* noop */ }
    nostrdb.disconnect(port1)
    launcherPort = null
    return
  }
  launcherOrigin ??= origin
  handshakeComplete = true
  nostrdb.connect(launcherPort)
  startAccountStateSubscriptions()
}

function onPortMessage (e) {
  if (!e.data || typeof e.data !== 'object') return
  const { code } = e.data
  // REPLY frames belong to window-message's own listener when/if we make
  // port-side asks. We currently don't, but guard against stray ones.
  if (code === 'REPLY') return
  if (!handshakeComplete) return
  if (code === 'UPDATE_ACCOUNT_EVENTS') return handleUpdateAccountEvents(e)
  if (code === 'NOSTRDB_APP_BACKFILL') return handleNostrDbAppBackfill(e)
  if (code === 'NIP07') return handleNip07(e)
}

function handleUpdateAccountEvents (e) {
  const { pubkey, events } = e.data.payload ?? {}
  try {
    applyAccountEvents(pubkey, events)
  } catch (err) {
    console.warn('UPDATE_ACCOUNT_EVENTS failed', err?.message ?? err)
  }
}

function handleNostrDbAppBackfill (e) {
  const { ownerPubkey, appId } = e.data.payload ?? {}
  let accepted = false
  try {
    accepted = sync.requestNostrDbAppBackfill({ ownerPubkey, appId }) === true
  } catch (err) {
    console.warn('NOSTRDB_APP_BACKFILL failed', err?.message ?? err)
  }
  if (e.data.reqId) reply(e, { payload: { accepted } }, { to: launcherPort })
}

async function handleSignerRequest (e, { code, run }) {
  const { pubkey, method, params = [], app = {}, with_shared_key: withSharedKey = null, context: requestContext = '' } = e.data.payload ?? {}
  const signerContext = signerRequestContext(method, params)
  const context = typeof requestContext === 'string' && requestContext ? requestContext : ''
  const errorContext = {
    ...signerContext,
    ...(context ? { context } : {})
  }

  const logBase = {
    code,
    pubkey,
    method,
    app: signerRequestApp(app),
    origin: launcherOrigin,
    ...signerContext,
    ...(context ? { context } : {})
  }

  const shouldLog = !UNLOGGED_METHODS.has(method)

  try {
    const payload = await run({ pubkey, method, params, withSharedKey })
    if (shouldLog) {
      log.append({ ...logBase, status: 'success', params, result: payload })
    }
    reply(e, { payload }, { to: launcherPort })
  } catch (err) {
    const serialized = serializeError(err, errorContext)
    if (shouldLog) {
      log.append({
        ...logBase,
        status: 'failure',
        params,
        error: { message: err.message }
      })
    }
    reply(e, { error: serialized }, { to: launcherPort })
  }
}

async function handleNip07 (e) {
  return handleSignerRequest(e, { code: 'NIP07', run: signer.run })
}
