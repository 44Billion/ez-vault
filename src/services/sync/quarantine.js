import * as secrets from '../secrets.js'
import { getState, removeState, setState } from '../storage/index.js'
import { isSyncPayloadError } from './payload-error.js'

export const SYNC_QUARANTINE_KEY = 'ez-vault:sync-quarantine:v1'
export const SYNC_QUARANTINE_DECODER_VERSION = 2
export const SYNC_QUARANTINE_MAX_RECORDS = 100
export const SYNC_QUARANTINE_MAX_BYTES = 4 * 1024 * 1024
export const SYNC_QUARANTINE_MAX_PEER_RECORDS = 25
export const SYNC_QUARANTINE_MAX_PEER_BYTES = 1024 * 1024
export const SYNC_QUARANTINE_MAX_RECORD_BYTES = 1024 * 1024
export const SYNC_QUARANTINE_TTL_MS = 30 * 24 * 60 * 60 * 1000

const encoder = new TextEncoder()
const FORMAT_VERSION = 1

function clone (value) {
  return value === undefined ? undefined : structuredClone(value)
}

function byteSize (value) {
  try { return encoder.encode(JSON.stringify(value)).byteLength } catch { return Infinity }
}

function emptyState () {
  return { version: FORMAT_VERSION, records: [] }
}

function normalizeRecord (record) {
  if (!record || typeof record !== 'object') return null
  if (typeof record.id !== 'string' || !record.id) return null
  if (typeof record.senderPubkey !== 'string' || !record.senderPubkey) return null
  if (typeof record.code !== 'string' || !record.code) return null
  if (typeof record.reason !== 'string') return null
  if (!Number.isSafeInteger(record.firstAt) || record.firstAt < 0) return null
  if (!Number.isSafeInteger(record.lastAt) || record.lastAt < 0) return null
  if (!Number.isSafeInteger(record.handlerVersion) || record.handlerVersion < 0) return null
  if (!Number.isSafeInteger(record.attempts) || record.attempts < 1) return null
  if (!record.message || typeof record.message !== 'object') return null
  return {
    ...clone(record),
    ownerPubkey: typeof record.ownerPubkey === 'string' ? record.ownerPubkey : '',
    channelPubkey: typeof record.channelPubkey === 'string' ? record.channelPubkey : '',
    partial: record.partial === true,
    byteSize: Number.isSafeInteger(record.byteSize) && record.byteSize >= 0
      ? record.byteSize
      : byteSize(record)
  }
}

function normalizeState (value) {
  if (!value || value.version !== FORMAT_VERSION || !Array.isArray(value.records)) {
    throw Object.assign(new Error('SYNC_QUARANTINE_INVALID'), { code: 'SYNC_QUARANTINE_INVALID' })
  }
  const records = value.records.map(normalizeRecord)
  if (records.some(record => !record)) {
    throw Object.assign(new Error('SYNC_QUARANTINE_INVALID'), { code: 'SYNC_QUARANTINE_INVALID' })
  }
  return {
    version: FORMAT_VERSION,
    records
  }
}

function recordBytes (record) {
  return Math.max(1, byteSize(record))
}

function removeOldestMatching (records, predicate) {
  const index = records.findIndex(predicate)
  if (index < 0) return false
  records.splice(index, 1)
  return true
}

function pruneState (state, context, now) {
  const cutoff = now - SYNC_QUARANTINE_TTL_MS
  const owners = context?.ownerPubkeys instanceof Set ? context.ownerPubkeys : null
  const trusted = context?.trustedByPubkey
  const before = state.records.length
  state.records = state.records.filter(record => {
    if (record.firstAt < cutoff) return false
    if (trusted && !trusted.has?.(record.senderPubkey)) return false
    if (owners && record.ownerPubkey && !owners.has(record.ownerPubkey)) return false
    if (record.ownerPubkey && typeof context?.channelPubkeyForOwner === 'function') {
      const channelPubkey = context.channelPubkeyForOwner(record.ownerPubkey)
      if (channelPubkey && channelPubkey !== record.channelPubkey) return false
    }
    return true
  })
  return before - state.records.length
}

export function createSyncQuarantine ({
  _getState = getState,
  _setState = setState,
  _removeState = removeState,
  _vaultEncrypt = secrets.vaultEncrypt,
  _vaultDecrypt = secrets.vaultDecrypt,
  _now = Date.now,
  _yield = () => new Promise(resolve => setTimeout(resolve, 0))
} = {}) {
  async function load () {
    const sealed = _getState(SYNC_QUARANTINE_KEY)
    if (!sealed) return emptyState()
    let value
    try { value = JSON.parse(_vaultDecrypt(sealed)) } catch {
      throw Object.assign(new Error('SYNC_QUARANTINE_DECRYPT_FAILED'), { code: 'SYNC_QUARANTINE_DECRYPT_FAILED' })
    }
    return normalizeState(value)
  }

  async function save (state) {
    const normalized = normalizeState(state)
    await _setState(SYNC_QUARANTINE_KEY, _vaultEncrypt(JSON.stringify(normalized)))
  }

  function enforcePeerLimit (state, senderPubkey) {
    let evicted = 0
    const owns = record => record.senderPubkey === senderPubkey
    while (state.records.filter(owns).length > SYNC_QUARANTINE_MAX_PEER_RECORDS) {
      if (!removeOldestMatching(state.records, owns)) break
      evicted++
    }
    while (state.records.filter(owns).reduce((total, record) => total + record.byteSize, 0) >
      SYNC_QUARANTINE_MAX_PEER_BYTES) {
      if (!removeOldestMatching(state.records, owns)) break
      evicted++
    }
    return evicted
  }

  function enforceGlobalLimit (state) {
    let evicted = 0
    while (state.records.length > SYNC_QUARANTINE_MAX_RECORDS) {
      state.records.shift()
      evicted++
    }
    while (state.records.reduce((total, record) => total + record.byteSize, 0) > SYNC_QUARANTINE_MAX_BYTES) {
      if (!state.records.length) break
      state.records.shift()
      evicted++
    }
    return evicted
  }

  async function add (message, error, { context = {}, decoderVersion = SYNC_QUARANTINE_DECODER_VERSION } = {}) {
    const eventId = message?.event?.id
    const senderPubkey = message?.event?.pubkey
    const code = message?.payload?.code
    if (typeof eventId !== 'string' || !eventId || typeof senderPubkey !== 'string' ||
      !senderPubkey || typeof code !== 'string' || !code) {
      return { status: 'ignored', evicted: 0 }
    }
    const state = await load()
    pruneState(state, context, _now())
    const now = _now()
    const existing = state.records.find(record => record.id === eventId)
    const base = {
      id: eventId,
      ownerPubkey: context.ownerPubkeyForChannel?.(message.channelPubkey) || '',
      channelPubkey: message.channelPubkey || '',
      senderPubkey,
      code,
      reason: error?.reason || error?.code || 'handler-failure',
      partial: error?.partial === true,
      handlerVersion: decoderVersion,
      firstAt: existing?.firstAt ?? now,
      lastAt: now,
      attempts: (existing?.attempts || 0) + 1,
      message: clone(message)
    }
    base.byteSize = recordBytes(base)
    if (base.byteSize > SYNC_QUARANTINE_MAX_RECORD_BYTES) {
      if (existing) {
        state.records = state.records.filter(record => record.id !== eventId)
        await save(state)
      }
      return { status: 'oversized', evicted: existing ? 1 : 0, bytes: base.byteSize }
    }
    let status = 'stored'
    if (existing) {
      state.records[state.records.indexOf(existing)] = base
      status = 'updated'
    } else {
      state.records.push(base)
    }
    const evicted = enforcePeerLimit(state, senderPubkey) + enforceGlobalLimit(state)
    await save(state)
    return { status, evicted, bytes: base.byteSize }
  }

  async function replay ({
    context = {},
    decoderVersion = SYNC_QUARANTINE_DECODER_VERSION,
    handle,
    signal
  } = {}) {
    if (typeof handle !== 'function') throw new TypeError('SYNC_QUARANTINE_HANDLER_REQUIRED')
    const state = await load()
    const pruned = pruneState(state, context, _now())
    let replayed = 0
    let retained = 0
    for (const record of [...state.records]) {
      signal?.throwIfAborted()
      if (record.handlerVersion >= decoderVersion) continue
      try {
        const handled = await handle(clone(record.message), record)
        if (!handled) throw new Error('SYNC_QUARANTINE_MESSAGE_UNHANDLED')
        state.records = state.records.filter(item => item.id !== record.id)
        replayed++
      } catch (error) {
        if (!isSyncPayloadError(error)) {
          await save(state)
          throw error
        }
        record.reason = error.reason || error.code
        record.partial = error.partial === true
        record.handlerVersion = decoderVersion
        record.lastAt = _now()
        record.attempts++
        retained++
      }
      await save(state)
      await _yield()
    }
    if (!state.records.length && _getState(SYNC_QUARANTINE_KEY)) {
      await _removeState(SYNC_QUARANTINE_KEY)
    } else if (pruned || replayed || retained) {
      await save(state)
    }
    return { pruned, replayed, retained }
  }

  async function prune (context = {}) {
    const state = await load()
    const removed = pruneState(state, context, _now())
    if (removed) await save(state)
    return removed
  }

  async function clear () {
    await _removeState(SYNC_QUARANTINE_KEY)
  }

  return { add, replay, prune, clear, _load: load }
}

export const syncQuarantine = createSyncQuarantine()
