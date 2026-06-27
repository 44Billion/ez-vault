import * as store from '../accounts-store.js'
import * as secrets from '../secrets.js'
import { filterVisibleAccounts } from '../account-mutations.js'
import { rotateContentKeyIfStillCanonical } from '../content-key/index.js'

const KEY = 'ez-vault:trusted-signer-sync:content-key-rotation:v1'
const HEX32 = /^[0-9a-f]{64}$/i

export const FALLBACK_ROTATION_DELAY_MS = 30 * 60 * 1000
export const MAX_ROTATION_RETRY_MS = 4 * 60 * 60 * 1000
const MIN_ROTATION_RETRY_MS = 5 * 60 * 1000

let stopRevocationRotation = null

function normalizePubkey (value) {
  const pubkey = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return HEX32.test(pubkey) ? pubkey : ''
}

function normalizeNumber (value) {
  const number = Math.floor(Number(value) || 0)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

function intentKey (intent) {
  return `${intent.ownerPubkey}:${intent.removedSignerPubkey}:${intent.removalUpdatedAt}`
}

function readIntents (storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    const byKey = new Map()
    for (const item of parsed) {
      const intent = normalizeIntent(item)
      if (intent) byKey.set(intentKey(intent), intent)
    }
    return [...byKey.values()]
  } catch {
    return []
  }
}

function writeIntents (intents, storage = globalThis.localStorage) {
  const normalized = intents.map(normalizeIntent).filter(Boolean)
  if (!normalized.length) {
    storage?.removeItem(KEY)
    return
  }
  storage?.setItem(KEY, JSON.stringify(normalized))
}

function normalizeIntent (item) {
  const ownerPubkey = normalizePubkey(item?.ownerPubkey)
  const removedSignerPubkey = normalizePubkey(item?.removedSignerPubkey)
  const removedKnownContentPubkey = normalizePubkey(item?.removedKnownContentPubkey)
  if (!ownerPubkey || !removedSignerPubkey || !removedKnownContentPubkey) return null
  return {
    ownerPubkey,
    removedSignerPubkey,
    removedKnownContentPubkey,
    removalUpdatedAt: normalizeNumber(item.removalUpdatedAt),
    actorPubkey: normalizePubkey(item.actorPubkey),
    nextAttemptAt: normalizeNumber(item.nextAttemptAt),
    attempts: normalizeNumber(item.attempts)
  }
}

function writableOwnerPubkeys (_store = store) {
  return filterVisibleAccounts(_store.list())
    .filter(account => account.type === 'nsec')
    .map(account => account.pubkey)
}

function retryDelay (attempts) {
  return Math.min(MAX_ROTATION_RETRY_MS, MIN_ROTATION_RETRY_MS * (2 ** Math.max(0, attempts)))
}

export async function scheduleRevocationRotationsForRemovedSigner ({
  removedSignerPubkey,
  removalUpdatedAt,
  actorPubkey = '',
  localActorPubkey = '',
  storage = globalThis.localStorage,
  nowMs = Date.now()
} = {}) {
  const removed = normalizePubkey(removedSignerPubkey)
  if (!removed || !secrets.isUnlocked()) return []
  const actor = normalizePubkey(actorPubkey)
  const localActor = normalizePubkey(localActorPubkey)
  const delayMs = actor && localActor && actor === localActor ? 0 : FALLBACK_ROTATION_DELAY_MS
  const nextAttemptAt = nowMs + delayMs
  const current = readIntents(storage)
  const byKey = new Map(current.map(intent => [intentKey(intent), intent]))
  const created = []

  for (const ownerPubkey of writableOwnerPubkeys()) {
    const signer = secrets.getLatestContentKeySigner(ownerPubkey)
    const removedKnownContentPubkey = await signer?.getPublicKey?.()
    if (!normalizePubkey(removedKnownContentPubkey)) continue
    const intent = {
      ownerPubkey,
      removedSignerPubkey: removed,
      removedKnownContentPubkey,
      removalUpdatedAt: normalizeNumber(removalUpdatedAt),
      actorPubkey: actor,
      nextAttemptAt,
      attempts: 0
    }
    const key = intentKey(intent)
    const existing = byKey.get(key)
    if (existing && existing.nextAttemptAt <= nextAttemptAt) continue
    byKey.set(key, existing ? { ...existing, nextAttemptAt: Math.min(existing.nextAttemptAt, nextAttemptAt) } : intent)
    created.push(intent)
  }

  writeIntents([...byKey.values()], storage)
  return created
}

export async function runDueRevocationRotations ({
  storage = globalThis.localStorage,
  nowMs = Date.now(),
  _rotateContentKeyIfStillCanonical = rotateContentKeyIfStillCanonical,
  onError = err => console.warn('revocation rotation failed', err?.message ?? err)
} = {}) {
  if (!secrets.isUnlocked()) return { skipped: 'locked' }
  const intents = readIntents(storage)
  if (!intents.length) return { checked: 0, remaining: 0 }

  const remaining = []
  let checked = 0
  let cleared = 0
  let rotated = 0
  for (const intent of intents) {
    if ((intent.nextAttemptAt || 0) > nowMs) {
      remaining.push(intent)
      continue
    }
    checked += 1
    try {
      const result = await _rotateContentKeyIfStillCanonical(intent)
      if (result?.status === 'rotated') {
        rotated += 1
        continue
      }
      if (result?.status === 'cleared') {
        cleared += 1
        continue
      }
      const attempts = (intent.attempts || 0) + 1
      remaining.push({
        ...intent,
        attempts,
        nextAttemptAt: nowMs + retryDelay(attempts)
      })
    } catch (err) {
      onError(err)
      const attempts = (intent.attempts || 0) + 1
      remaining.push({
        ...intent,
        attempts,
        nextAttemptAt: nowMs + retryDelay(attempts)
      })
    }
  }
  writeIntents(remaining, storage)
  return { checked, cleared, rotated, remaining: remaining.length }
}

export function nextRevocationRotationDelay (storage = globalThis.localStorage, nowMs = Date.now()) {
  const due = readIntents(storage)
    .map(intent => intent.nextAttemptAt || 0)
    .filter(Boolean)
    .sort((a, b) => a - b)[0]
  if (!due) return null
  return Math.max(0, due - nowMs)
}

export function startRevocationRotation ({
  storage = globalThis.localStorage,
  _setTimeout = setTimeout,
  _clearTimeout = clearTimeout,
  ...options
} = {}) {
  stopRevocationRotation?.()
  let stopped = false
  let timer = null
  let running = null

  const clearTimer = () => {
    if (timer) _clearTimeout(timer)
    timer = null
  }
  const schedule = () => {
    if (stopped) return
    clearTimer()
    if (!secrets.isUnlocked()) return
    const delay = nextRevocationRotationDelay(storage)
    if (delay == null) return
    timer = _setTimeout(tick, delay)
    timer?.unref?.()
  }
  const tick = () => {
    if (stopped || !secrets.isUnlocked()) return Promise.resolve()
    if (!running) {
      running = runDueRevocationRotations({ storage, ...options })
        .finally(() => {
          running = null
          schedule()
        })
    }
    return running
  }

  const unsubSecrets = secrets.subscribe(() => {
    if (secrets.isUnlocked()) tick()
  })
  stopRevocationRotation = () => {
    stopped = true
    clearTimer()
    unsubSecrets()
    stopRevocationRotation = null
  }
  tick()
  return stopRevocationRotation
}
