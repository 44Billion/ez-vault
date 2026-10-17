import * as secrets from '../secrets.js'
import { bytesToBase64 } from 'libp2r2p/base64'
import { arrayBufferBytes } from '../../helpers/array-buffer.js'
import { createLogBackoff, reportLogFailure } from './recovery.js'
import {
  appendMessengerLog,
  clearMessengerLogs,
  listMessengerLogs,
  removeMessengerLogsForPubkey,
  updateMessengerLogAppMetadata
} from '../storage/index.js'

export const MAX_ENTRIES_PER_APP = 500
export const MAX_LOG_BYTES = 64 * 1024 * 1024
export const PAGE_SIZE = 100

// The activity log is advisory, but its sensitive fields remain sealed with
// the vault key. IndexedDB gives each app its own 500-entry FIFO allowance;
// entries without an app id share the launcher bucket, while an explicit
// `ez-vault` id remains a separate app like any other.

const listeners = new Set()
const pending = new Set()
let writeTail = Promise.resolve()
const writeBackoff = createLogBackoff({ phase: 'append' })
// One worker per app coalesces concurrent requests and follows richer metadata
// arriving during its scan. A failed scan has its own cooldown, not the writer's.
const appMetadata = new Map()

// Keep the existing sealed JSON representation readable by the activity UI.
// Binary plaintext is represented as standard Base64 only inside the sealed
// params/result fields; JSON.stringify alone would silently turn it into {}.
function binaryReplacer (_key, value) {
  if (ArrayBuffer.isView(value)) return bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') {
    return bytesToBase64(arrayBufferBytes(value))
  }
  return value
}

function notify () {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.warn('messenger-log listener threw', err) }
  }
}

function appKey (entry) {
  const id = String(entry?.app?.id || '').trim()
  return id ? `app:${id}` : 'launcher'
}

function inflate (entry) {
  const publicEntry = { ...entry }
  delete publicEntry.appKey
  delete publicEntry.byteSize
  if (!publicEntry.sealed) return publicEntry
  if (!secrets.isUnlocked()) return publicEntry
  try {
    const { sealed, ...rest } = publicEntry
    const opened = JSON.parse(secrets.vaultDecrypt(sealed))
    return { ...rest, ...opened }
  } catch (err) {
    console.warn('messenger-log decrypt failed', err?.message ?? err)
    return publicEntry
  }
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function writeEntry (entry) {
  if (!writeBackoff.allow()) return null
  let stored
  try {
    await secrets.waitForVaultTransition()
    const { params, result, ...rest } = entry
    const sealedFields = {}
    if (params !== undefined) sealedFields.params = params
    if (result !== undefined) sealedFields.result = result

    stored = {
      ts: Math.floor(Date.now() / 1000),
      ...rest,
      appKey: appKey(entry)
    }
    if (Object.keys(sealedFields).length && secrets.isUnlocked()) {
      stored.sealed = secrets.vaultEncrypt(JSON.stringify(sealedFields, binaryReplacer))
    }
  } catch (error) {
    reportLogFailure(error, { phase: 'prepare', appKey: appKey(entry) })
    return null
  }
  try {
    await appendMessengerLog(stored, {
      maxEntriesPerApp: MAX_ENTRIES_PER_APP,
      maxBytes: MAX_LOG_BYTES
    })
    writeBackoff.success()
    return stored
  } catch (error) {
    writeBackoff.fail(error)
    return null
  }
}

function metadataKey (app) {
  return JSON.stringify([app.name, app.icon, app.alias])
}

function propagateMetadata (stored) {
  if (!stored.app || ![stored.app.name, stored.app.icon, stored.app.alias].some(Boolean)) return
  let state = appMetadata.get(stored.appKey)
  if (!state) {
    state = { app: {}, completed: null, running: null, retry: createLogBackoff({ phase: 'metadata', appKey: stored.appKey }) }
    appMetadata.set(stored.appKey, state)
  }
  for (const field of ['name', 'icon', 'alias']) {
    if (stored.app[field]) state.app[field] = stored.app[field]
  }
  if (state.running) return state.running
  if (state.completed === metadataKey(state.app) || !state.retry.allow()) return
  state.running = (async () => {
    while (state.completed !== metadataKey(state.app)) {
      const app = { ...state.app }
      try {
        await updateMessengerLogAppMetadata(stored.appKey, app)
        state.completed = metadataKey(app)
        state.retry.success()
      } catch (error) {
        state.retry.fail(error)
        return
      }
    }
  })().finally(() => { state.running = null })
  return state.running
}

export async function append (entry) {
  try {
    // Check the cooldown inside the serialized work as well as before cloning:
    // a failure must stop calls already queued by the same startup burst.
    const writing = writeTail.then(() => writeEntry(entry))
    writeTail = writing.then(() => {}, () => {})
    const stored = await writing
    if (!stored) return
    await propagateMetadata(stored)
    notify()
  } catch (error) {
    // Audit history must never make a signing request fail.
    reportLogFailure(error, { phase: 'append' })
  }
}

// Snapshot binary fields before replying: callers may release or mutate buffers
// while the transition barrier and ordinary encrypted log persistence continue.
export function appendInBackground (entry) {
  if (!writeBackoff.allow()) return Promise.resolve()
  try {
    const work = append(structuredClone(entry))
      .catch(error => reportLogFailure(error, { phase: 'append' }))
    pending.add(work)
    work.then(() => pending.delete(work), () => pending.delete(work))
    return work
  } catch (error) {
    reportLogFailure(error, { phase: 'snapshot' })
    return Promise.resolve()
  }
}

export async function flush () {
  await Promise.all([...pending])
}

export async function list (options = {}) {
  return (await listMessengerLogs({ limit: PAGE_SIZE, ...options })).map(inflate)
}

export async function removeForPubkey (pubkey) {
  try {
    await flush()
    const removed = await removeMessengerLogsForPubkey(pubkey)
    writeBackoff.reset()
    appMetadata.clear()
    if (removed) notify()
  } catch (error) {
    reportLogFailure(error, { phase: 'remove' })
  }
}

export async function clear () {
  try {
    await flush()
    await clearMessengerLogs()
    writeBackoff.reset()
    appMetadata.clear()
    notify()
  } catch (error) {
    reportLogFailure(error, { phase: 'clear' })
  }
}
