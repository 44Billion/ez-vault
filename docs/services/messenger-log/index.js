import * as secrets from '../secrets.js'
import {
  appendMessengerLog,
  clearMessengerLogs,
  listMessengerLogs,
  removeMessengerLogsForPubkey
} from '../storage/index.js'

export const MAX_ENTRIES_PER_APP = 500
export const MAX_LOG_BYTES = 64 * 1024 * 1024
export const PAGE_SIZE = 100

// The activity log is advisory, but its sensitive fields remain sealed with
// the vault key. IndexedDB gives each app its own 500-entry FIFO allowance;
// entries without an app id share the launcher bucket, while an explicit
// `ez-vault` id remains a separate app like any other.

const listeners = new Set()

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

export async function append (entry) {
  try {
    const { params, result, ...rest } = entry
    const sealedFields = {}
    if (params !== undefined) sealedFields.params = params
    if (result !== undefined) sealedFields.result = result

    const stored = {
      ts: Math.floor(Date.now() / 1000),
      ...rest,
      appKey: appKey(entry)
    }
    if (Object.keys(sealedFields).length && secrets.isUnlocked()) {
      stored.sealed = secrets.vaultEncrypt(JSON.stringify(sealedFields))
    }

    await appendMessengerLog(stored, {
      maxEntriesPerApp: MAX_ENTRIES_PER_APP,
      maxBytes: MAX_LOG_BYTES
    })
    notify()
  } catch (err) {
    // Audit history must never make a signing request fail.
    console.warn('messenger-log write failed', err?.message ?? err)
  }
}

export async function list (options = {}) {
  return (await listMessengerLogs({ limit: PAGE_SIZE, ...options })).map(inflate)
}

export async function removeForPubkey (pubkey) {
  try {
    if (await removeMessengerLogsForPubkey(pubkey)) notify()
  } catch (err) {
    console.warn('messenger-log removal failed', err?.message ?? err)
  }
}

export async function clear () {
  try {
    await clearMessengerLogs()
    notify()
  } catch (err) {
    console.warn('messenger-log clear failed', err?.message ?? err)
  }
}
