import { ask, reply } from '../helpers/window-message.js'
import { serializeError } from '../helpers/error.js'
import * as store from './accounts-store.js'
import { filterVisibleAccounts } from './account-mutations.js'
import * as signer from './signer.js'
import * as log from './messenger-log/index.js'

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

function normalizedEventKind (kind) {
  const n = typeof kind === 'string' && kind.trim() !== '' ? Number(kind) : kind
  return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n : undefined
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

// Only non-sensitive fields: pubkey, display metadata, and `type` so the
// launcher can render the account list. Secret keys and bunker URLs stay in
// the vault.
function snapshotAccounts () {
  return filterVisibleAccounts(store.list()).map(({ pubkey, name, picture, type }) => ({
    pubkey, name, picture, type
  }))
}

let launcherPort = null
let launcherOrigin = null
let handshakeComplete = false

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
    launcherPort = null
    return
  }
  launcherOrigin ??= origin
  handshakeComplete = true
}

function onPortMessage (e) {
  if (!e.data || typeof e.data !== 'object') return
  const { code } = e.data
  // REPLY frames belong to window-message's own listener when/if we make
  // port-side asks. We currently don't, but guard against stray ones.
  if (code === 'REPLY') return
  if (!handshakeComplete) return
  if (code === 'NIP07') return handleNip07(e)
}

async function handleSignerRequest (e, { code, run }) {
  const { pubkey, method, params = [], app = {}, with_shared_key: withSharedKey = null } = e.data.payload ?? {}
  const context = signerRequestContext(method, params)

  const logBase = {
    code,
    pubkey,
    method,
    app: { id: app.id ?? '', name: app.name ?? '', icon: app.icon ?? '' },
    origin: launcherOrigin,
    ...context
  }

  const shouldLog = !UNLOGGED_METHODS.has(method)

  try {
    const payload = await run({ pubkey, method, params, withSharedKey })
    if (shouldLog) {
      log.append({ ...logBase, status: 'success', params, result: payload })
    }
    reply(e, { payload }, { to: launcherPort })
  } catch (err) {
    const serialized = serializeError(err, context)
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
