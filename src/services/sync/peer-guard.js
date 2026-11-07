import {
  CONTENT_KEYS_ANNOUNCE_CODE,
  CONTENT_KEYS_ASK_CODE,
  CONTENT_KEYS_REPLY_CODE
} from './content-keys.js'
import {
  NOSTRDB_SYNC_ADVERTISE_CODE,
  NOSTRDB_SYNC_APP_ASK_CODE,
  NOSTRDB_SYNC_APP_REPLY_CODE,
  NOSTRDB_SYNC_ASK_CODE,
  NOSTRDB_SYNC_PUSH_CODE,
  NOSTRDB_SYNC_REPLY_CODE
} from './nostrdb.js'
import { TRUSTED_SIGNERS_STATE_CODE } from './trusted-signers.js'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const WORK_UNIT_BYTES = 128 * 1024

const DEFAULT_POLICY = {
  messageLimit: 300,
  messageWindowMs: MINUTE_MS,
  byteLimit: 32 * 1024 * 1024,
  byteWindowMs: MINUTE_MS,
  unitLimit: 240,
  unitWindowMs: MINUTE_MS,
  announcementLimit: 12,
  announcementWindowMs: HOUR_MS,
  violationLimit: 3,
  violationWindowMs: 10 * MINUTE_MS,
  cooldownLevelsMs: [5 * MINUTE_MS, 15 * MINUTE_MS, 30 * MINUTE_MS],
  stableResetMs: 30 * MINUTE_MS
}

const ANNOUNCEMENT_CODES = new Set([
  CONTENT_KEYS_ANNOUNCE_CODE,
  NOSTRDB_SYNC_ADVERTISE_CODE,
  TRUSTED_SIGNERS_STATE_CODE
])

const BYTE_COST_CODES = new Set([
  CONTENT_KEYS_REPLY_CODE,
  NOSTRDB_SYNC_REPLY_CODE,
  NOSTRDB_SYNC_APP_REPLY_CODE,
  NOSTRDB_SYNC_PUSH_CODE
])

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function boundedInteger (value, minimum, fallback) {
  const number = Math.floor(Number(value))
  return Number.isSafeInteger(number) && number >= minimum ? number : fallback
}

function normalizePolicy (policy = {}) {
  const cooldownLevelsMs = Array.isArray(policy.cooldownLevelsMs) && policy.cooldownLevelsMs.length
    ? policy.cooldownLevelsMs.map(value => boundedInteger(value, 1, 0)).filter(Boolean)
    : DEFAULT_POLICY.cooldownLevelsMs
  return {
    ...DEFAULT_POLICY,
    ...policy,
    cooldownLevelsMs
  }
}

function createBucket (now, capacity, windowMs) {
  return { tokens: capacity, capacity, windowMs, updatedAt: now }
}

function refillBucket (bucket, now) {
  if (now <= bucket.updatedAt) return
  const refill = ((now - bucket.updatedAt) / bucket.windowMs) * bucket.capacity
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + refill)
  bucket.updatedAt = now
}

function canConsume (bucket, amount, now) {
  refillBucket(bucket, now)
  return bucket.tokens + Number.EPSILON >= amount
}

function consume (bucket, amount) {
  bucket.tokens = Math.max(0, bucket.tokens - amount)
}

function increment (counts, key) {
  const token = key || 'unknown'
  counts[token] = (counts[token] || 0) + 1
}

function messageBody (message) {
  return isPlainObject(message?.payload?.payload) ? message.payload.payload : {}
}

function contentAskUnits (message) {
  const pubkeys = Array.isArray(messageBody(message).pubkeys) ? messageBody(message).pubkeys.length : 0
  return Math.min(5, 1 + Math.ceil(pubkeys / 128))
}

function rangeAskUnits (message) {
  const body = messageBody(message)
  const limit = boundedInteger(body.limit ?? body.batchSize, 0, 200)
  const excluded = Array.isArray(body.excludeIds) ? body.excludeIds.length : 0
  return Math.min(10, 1 + Math.ceil((limit + excluded) / 100))
}

function byteUnits (bytes, type) {
  if (type === 'seed') return Math.min(33, 1 + Math.ceil(Math.max(0, bytes) / WORK_UNIT_BYTES))
  return 1
}

function inboundWorkCost (message, context) {
  const code = context.code || ''
  if (code === CONTENT_KEYS_ASK_CODE) return contentAskUnits(message)
  if (code === NOSTRDB_SYNC_ASK_CODE || code === NOSTRDB_SYNC_APP_ASK_CODE) return rangeAskUnits(message)
  if (BYTE_COST_CODES.has(code) || context.type === 'seed') return byteUnits(context.bytes, context.type)
  return 1
}

export function createSyncPeerGuard ({
  onDebug,
  now = Date.now,
  policy: policyOption = {}
} = {}) {
  const policy = normalizePolicy(policyOption)
  const peers = new Map()
  const stats = {
    admitted: 0,
    droppedByQuota: 0,
    droppedByCooldown: 0,
    violations: 0,
    cooldownsOpened: 0,
    cooldownsExpired: 0,
    droppedByCode: {},
    violationsByReason: {}
  }

  function debug (action, detail = {}) {
    try {
      onDebug?.({ source: 'sync-peer-guard', action, ...detail })
    } catch {}
  }

  function peerKey (context) {
    return context.channelPubkey && context.senderPubkey
      ? `${context.channelPubkey}:${context.senderPubkey}`
      : ''
  }

  function peerState (key, current) {
    let state = peers.get(key)
    if (!state) {
      state = {
        messages: createBucket(current, policy.messageLimit, policy.messageWindowMs),
        bytes: createBucket(current, policy.byteLimit, policy.byteWindowMs),
        units: createBucket(current, policy.unitLimit, policy.unitWindowMs),
        announcementCodes: new Map(),
        violations: [],
        lastViolationAt: 0,
        cooldownUntil: 0,
        cooldownLevel: 0
      }
      peers.set(key, state)
    }
    return state
  }

  function recordViolation (context, reason, buckets = []) {
    const key = peerKey(context)
    if (!key) return false
    const current = context.now ?? now()
    const state = peerState(key, current)
    if (current - state.lastViolationAt >= policy.stableResetMs) {
      state.cooldownLevel = 0
      state.violations = []
    }
    state.violations = state.violations.filter(at => at >= current - policy.violationWindowMs)
    state.violations.push(current)
    state.lastViolationAt = current
    stats.violations++
    increment(stats.violationsByReason, reason)
    debug('peer-violation', {
      type: context.type || '',
      code: context.code || '',
      reason,
      buckets,
      violations: state.violations.length
    })
    if (state.violations.length >= policy.violationLimit) {
      const index = Math.min(state.cooldownLevel, policy.cooldownLevelsMs.length - 1)
      const cooldownMs = policy.cooldownLevelsMs[index]
      state.cooldownUntil = current + cooldownMs
      state.cooldownLevel = Math.min(state.cooldownLevel + 1, policy.cooldownLevelsMs.length - 1)
      state.violations = []
      stats.cooldownsOpened++
      debug('peer-cooldown-opened', {
        type: context.type || '',
        code: context.code || '',
        reason,
        cooldownMs
      })
    }
    return true
  }

  function admit (message, context = {}) {
    const key = peerKey(context)
    if (!key) return true
    const current = context.now ?? now()
    const state = peerState(key, current)
    if (state.cooldownUntil) {
      if (current < state.cooldownUntil) {
        stats.droppedByCooldown++
        increment(stats.droppedByCode, context.code)
        debug('peer-message-dropped', {
          type: context.type || '',
          code: context.code || '',
          reason: 'cooldown',
          cooldownRemainingMs: state.cooldownUntil - current
        })
        return false
      }
      state.cooldownUntil = 0
      stats.cooldownsExpired++
      debug('peer-cooldown-expired', {
        type: context.type || '',
        code: context.code || '',
        cooldownLevel: state.cooldownLevel
      })
    }
    if (current - state.lastViolationAt >= policy.stableResetMs) {
      state.cooldownLevel = 0
      state.violations = []
    }

    const code = context.code || ''
    let announcement
    if (ANNOUNCEMENT_CODES.has(code)) {
      announcement = state.announcementCodes.get(code)
      if (!announcement) {
        announcement = createBucket(current, policy.announcementLimit, policy.announcementWindowMs)
        state.announcementCodes.set(code, announcement)
      }
    }
    const bytes = Math.max(1, boundedInteger(context.bytes, 0, 1))
    const units = inboundWorkCost(message, { ...context, bytes })
    const checks = [
      ['messages', state.messages, 1],
      ['bytes', state.bytes, bytes],
      ['units', state.units, units],
      ...(announcement ? [[`code:${code}`, announcement, 1]] : [])
    ]
    const exceeded = checks.filter(([, bucket, amount]) => !canConsume(bucket, amount, current)).map(([name]) => name)
    if (exceeded.length) {
      stats.droppedByQuota++
      increment(stats.droppedByCode, code)
      debug('peer-message-dropped', {
        type: context.type || '',
        code,
        reason: 'quota',
        buckets: exceeded,
        bytes,
        units
      })
      recordViolation({ ...context, now: current }, 'quota', exceeded)
      return false
    }
    for (const [, bucket, amount] of checks) consume(bucket, amount)
    stats.admitted++
    return true
  }

  function recordInvalidPayload (context = {}) {
    return recordViolation({ ...context, now: context.now ?? now() }, 'invalid-payload')
  }

  function snapshot () {
    return structuredClone(stats)
  }

  return {
    admit,
    recordInvalidPayload,
    getDebugSnapshot: () => ({ peerGuard: snapshot() })
  }
}
