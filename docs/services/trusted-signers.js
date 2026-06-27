import * as secrets from './secrets.js'

const KEY = 'ez-vault:trusted-signers'
// Plaintext UI hint: tombstones remain sealed for sync/reminders, but a
// tombstone-only blob should not ask the user to unlock an empty panel.
const ACTIVE_HINT_KEY = `${KEY}:active`
export const TOMBSTONE_CAP = 100
export const REMOVAL_REMINDER_SECONDS = 30 * 24 * 60 * 60

const HEX32 = /^[0-9a-f]{64}$/i
const listeners = new Set()

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function normalizePubkey (value) {
  const pubkey = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return HEX32.test(pubkey) ? pubkey : ''
}

function cleanString (value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTimestamp (value) {
  const timestamp = Math.floor(Number(value) || 0)
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : 0
}

function notify (detail = {}) {
  for (const fn of listeners) {
    try { fn(detail) } catch (err) { console.warn('trusted-signers listener threw', err) }
  }
}

function normalizeRecord (entry) {
  const pubkey = normalizePubkey(entry?.pubkey)
  if (!pubkey) return null
  const status = entry.status === 'removed' ? 'removed' : 'trusted'
  const updatedAt = normalizeTimestamp(entry.updatedAt ?? entry.addedAt) || nowSeconds()
  const actorPubkey = normalizePubkey(entry.actorPubkey) || ''
  const addedAt = normalizeTimestamp(entry.addedAt) || updatedAt
  return {
    pubkey,
    platform: cleanString(entry.platform),
    status,
    updatedAt,
    actorPubkey,
    addedAt
  }
}

function compareRecords (left, right) {
  if (!left) return -1
  if (!right) return 1
  if ((left.updatedAt || 0) !== (right.updatedAt || 0)) return (left.updatedAt || 0) - (right.updatedAt || 0)
  const leftActor = left.actorPubkey || ''
  const rightActor = right.actorPubkey || ''
  if (leftActor !== rightActor) return leftActor < rightActor ? -1 : 1
  if (left.status !== right.status) return left.status === 'removed' ? 1 : -1
  return 0
}

function mergeRecordMaps (records, entries) {
  const byPubkey = new Map()
  for (const record of records) byPubkey.set(record.pubkey, record)

  const changedRecords = []
  for (const entry of entries || []) {
    const normalized = normalizeRecord(entry)
    if (!normalized) continue
    const current = byPubkey.get(normalized.pubkey)
    if (compareRecords(current, normalized) >= 0) continue
    byPubkey.set(normalized.pubkey, normalized)
    changedRecords.push(normalized)
  }

  return {
    records: [...byPubkey.values()],
    changedRecords
  }
}

function pruneTombstones (records, now = nowSeconds()) {
  const active = []
  const tombstones = []
  for (const record of records) {
    if (record.status === 'removed') tombstones.push(record)
    else active.push(record)
  }
  if (tombstones.length <= TOMBSTONE_CAP) return records

  const reminderCutoff = now - REMOVAL_REMINDER_SECONDS
  const old = tombstones
    .filter(record => (record.updatedAt || 0) < reminderCutoff)
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
  const drop = new Set()
  for (const record of old) {
    if (tombstones.length - drop.size <= TOMBSTONE_CAP) break
    drop.add(record.pubkey)
  }
  if (tombstones.length - drop.size > TOMBSTONE_CAP) {
    for (const record of [...tombstones].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))) {
      if (tombstones.length - drop.size <= TOMBSTONE_CAP) break
      drop.add(record.pubkey)
    }
  }
  return active.concat(tombstones.filter(record => !drop.has(record.pubkey)))
}

function hasActiveRecord (records) {
  return records.some(record => record.status === 'trusted')
}

function writeActiveHint (records) {
  if (hasActiveRecord(records)) localStorage.setItem(ACTIVE_HINT_KEY, '1')
  else localStorage.setItem(ACTIVE_HINT_KEY, '0')
}

function readRecords () {
  const raw = localStorage.getItem(KEY)
  if (!raw) return []
  if (!secrets.isUnlocked()) return []
  try {
    const plain = secrets.vaultDecrypt(raw)
    const parsed = JSON.parse(plain)
    if (!Array.isArray(parsed)) return []
    const byPubkey = new Map()
    for (const entry of parsed) {
      const record = normalizeRecord(entry)
      if (!record) continue
      const current = byPubkey.get(record.pubkey)
      if (compareRecords(current, record) < 0) byPubkey.set(record.pubkey, record)
    }
    return [...byPubkey.values()]
  } catch (err) {
    console.warn('trusted-signers decrypt failed', err?.message ?? err)
    return []
  }
}

function writeRecords (records, detail = {}) {
  if (!secrets.isUnlocked()) throw new Error('VAULT_LOCKED')
  const pruned = pruneTombstones(records)
  if (!pruned.length) {
    localStorage.removeItem(KEY)
    localStorage.removeItem(ACTIVE_HINT_KEY)
    notify(detail)
    return
  }
  const sealed = secrets.vaultEncrypt(JSON.stringify(pruned))
  localStorage.setItem(KEY, sealed)
  writeActiveHint(pruned)
  notify(detail)
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function hasStored () {
  return Boolean(localStorage.getItem(KEY))
}

export function hasStoredActive () {
  return localStorage.getItem(ACTIVE_HINT_KEY) === '1'
}

export function forgetLocal (pubkey, detail = {}) {
  const normalizedPubkey = normalizePubkey(pubkey)
  if (!normalizedPubkey) return null
  const records = readRecords()
  const record = records.find(entry => entry.pubkey === normalizedPubkey)
  if (!record) return null
  writeRecords(records.filter(entry => entry.pubkey !== normalizedPubkey), {
    action: 'forget-local',
    records: [record],
    ...detail
  })
  return record
}

export function listRecords () {
  return readRecords()
}

export function listRemovedForReminder (now = nowSeconds()) {
  const cutoff = now - REMOVAL_REMINDER_SECONDS
  return readRecords().filter(record => record.status === 'removed' && (record.updatedAt || 0) >= cutoff)
}

export function list () {
  return readRecords()
    .filter(record => record.status === 'trusted')
    .map(record => ({
      pubkey: record.pubkey,
      platform: record.platform || '',
      addedAt: record.addedAt || record.updatedAt || 0,
      updatedAt: record.updatedAt || record.addedAt || 0,
      actorPubkey: record.actorPubkey || ''
    }))
}

export function add ({ pubkey, platform, actorPubkey = '', updatedAt = nowSeconds() }) {
  const record = normalizeRecord({
    pubkey,
    platform,
    status: 'trusted',
    updatedAt,
    actorPubkey,
    addedAt: updatedAt
  })
  if (!record) return null
  const current = readRecords().find(entry => entry.pubkey === record.pubkey)
  if (current?.status === 'trusted' && compareRecords(current, record) >= 0) return null
  const { records, changedRecords } = mergeRecordMaps(readRecords(), [record])
  if (!changedRecords.length) return null
  writeRecords(records, { action: 'add', records: changedRecords, trustedRecords: changedRecords })
  return changedRecords[0]
}

export function addMany (entries, options = {}) {
  if (!entries?.length) return []
  const timestamp = normalizeTimestamp(options.updatedAt) || nowSeconds()
  const recordsToMerge = entries.map(entry => ({
    ...entry,
    status: 'trusted',
    updatedAt: entry.updatedAt ?? timestamp,
    actorPubkey: entry.actorPubkey ?? options.actorPubkey ?? ''
  }))
  const { records, changedRecords } = mergeRecordMaps(readRecords(), recordsToMerge)
  if (!changedRecords.length) return []
  writeRecords(records, { action: 'add-many', records: changedRecords, trustedRecords: changedRecords })
  return changedRecords
}

export function remove (pubkey, { actorPubkey = '', updatedAt = nowSeconds() } = {}) {
  const normalizedPubkey = normalizePubkey(pubkey)
  if (!normalizedPubkey) return null
  const current = readRecords().find(record => record.pubkey === normalizedPubkey)
  const record = normalizeRecord({
    pubkey: normalizedPubkey,
    platform: current?.platform || '',
    status: 'removed',
    updatedAt,
    actorPubkey,
    addedAt: current?.addedAt || updatedAt
  })
  const { records, changedRecords } = mergeRecordMaps(readRecords(), [record])
  if (!changedRecords.length) return null
  writeRecords(records, { action: 'remove', records: changedRecords, removedRecords: changedRecords })
  return changedRecords[0]
}

export function clearActive ({ actorPubkey = '', updatedAt = nowSeconds(), tombstone = true } = {}) {
  const active = readRecords().filter(record => record.status === 'trusted')
  if (!active.length) return []
  if (!tombstone) {
    writeRecords(readRecords().filter(record => record.status !== 'trusted'), { action: 'clear-active', records: [] })
    return active
  }
  const removed = active.map(record => ({
    ...record,
    status: 'removed',
    updatedAt,
    actorPubkey: actorPubkey || record.actorPubkey || ''
  }))
  const { records, changedRecords } = mergeRecordMaps(readRecords(), removed)
  if (!changedRecords.length) return []
  writeRecords(records, { action: 'clear-active', records: changedRecords, removedRecords: changedRecords })
  return changedRecords
}

export function mergeRecords (entries, { action = 'merge' } = {}) {
  const { records, changedRecords } = mergeRecordMaps(readRecords(), entries)
  if (!changedRecords.length) return []
  writeRecords(records, {
    action,
    records: changedRecords,
    trustedRecords: changedRecords.filter(record => record.status === 'trusted'),
    removedRecords: changedRecords.filter(record => record.status === 'removed')
  })
  return changedRecords
}

export function snapshot () {
  return localStorage.getItem(KEY)
}

export function restore (priorCiphertext) {
  if (priorCiphertext === null) {
    localStorage.removeItem(KEY)
    localStorage.removeItem(ACTIVE_HINT_KEY)
  } else {
    localStorage.setItem(KEY, priorCiphertext)
    if (secrets.isUnlocked()) writeActiveHint(readRecords())
    else localStorage.removeItem(ACTIVE_HINT_KEY)
  }
  notify({ action: 'restore' })
}
