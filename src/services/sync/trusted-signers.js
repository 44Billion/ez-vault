import { bytesToHex } from 'libp2r2p/base16'
import { sha256 } from '@noble/hashes/sha2.js'
import { publicationErrorFromResult } from '../../helpers/publication-retry.js'
import { assertSupportedPayloadVersion, syncPayloadInvalid } from './payload-error.js'

export const TRUSTED_SIGNERS_STATE_CODE = 'trustedSigners_state_v1'
export const TRUSTED_SIGNER_SYNC_INFO = 'trusted-signer-list-sync-v1'

const HEX32 = /^[0-9a-f]{64}$/i
const MAX_SYNC_ENTRIES = 512
const encoder = new TextEncoder()

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function normalizePubkey (value) {
  const pubkey = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return HEX32.test(pubkey) ? pubkey : ''
}

function normalizeTimestamp (value) {
  const timestamp = Math.floor(Number(value) || 0)
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : 0
}

function messageCode (message) {
  return isPlainObject(message?.payload) ? message.payload.code || '' : ''
}

function normalizeEntry (entry) {
  const pubkey = normalizePubkey(entry?.pubkey)
  if (!pubkey) return null
  const status = entry.status === 'removed' ? 'removed' : entry.status === 'trusted' ? 'trusted' : ''
  if (!status) return null
  const updatedAt = normalizeTimestamp(entry.updatedAt)
  if (!updatedAt) return null
  return {
    pubkey,
    platform: typeof entry.platform === 'string' ? entry.platform.trim() : '',
    status,
    updatedAt,
    actorPubkey: normalizePubkey(entry.actorPubkey) || ''
  }
}

export function stateEntries (records) {
  return (Array.isArray(records) ? records : [])
    .map(normalizeEntry)
    .filter(Boolean)
}

function coalescingDigest (parts) {
  return bytesToHex(sha256(encoder.encode(JSON.stringify(parts))))
}

export function coalescingHint (message) {
  if (messageCode(message) !== TRUSTED_SIGNERS_STATE_CODE) return null
  const body = message?.payload?.payload
  if (!isPlainObject(body) || !Array.isArray(body.entries) ||
      body.entries.length > MAX_SYNC_ENTRIES || (body.v != null && body.v !== 1)) return null
  const entries = stateEntries(body.entries)
  if (!entries.length || entries.length !== body.entries.length) return null
  return {
    key: coalescingDigest(['trusted-signers-state-stream']),
    keep: 'latest'
  }
}

function entriesExceptPubkey (entries, pubkey) {
  const normalizedPubkey = normalizePubkey(pubkey)
  return normalizedPubkey ? entries.filter(entry => entry.pubkey !== normalizedPubkey) : entries
}

function senderTrustUpdatedAt (context, senderPubkey) {
  return normalizeTimestamp(context.trustedByPubkey?.get?.(senderPubkey)?.updatedAt)
}

async function assertPublished (result) {
  if (!result?.delivery) return result
  const reports = result.delivery.reports
  if (!Array.isArray(reports) || !reports.length || reports.some(report => report?.success !== true)) {
    throw await publicationErrorFromResult(result, 'SYNC_PUBLICATION_FAILED')
  }
  return result
}

export async function announceTrustedSignerState ({
  messenger,
  peerChannels,
  records,
  activePeerPubkeys,
  reminderRecords
} = {}) {
  if (!messenger) return { sent: 0 }
  const channels = peerChannels || new Map()
  const active = [...new Set(activePeerPubkeys || [])].map(normalizePubkey).filter(Boolean)
  const entries = stateEntries(records)
  let sent = 0

  if (entries.length) {
    for (const peerPubkey of active) {
      const channelPubkey = channels.get(peerPubkey)
      if (!channelPubkey) continue
      const payloadEntries = entriesExceptPubkey(entries, peerPubkey)
      if (!payloadEntries.length) continue
      await assertPublished(await messenger.tell({
        channelPubkey,
        receiverPubkey: peerPubkey,
        code: TRUSTED_SIGNERS_STATE_CODE,
        payload: { entries: payloadEntries },
        useBulkPacing: true
      }))
      sent += 1
    }
  }

  for (const record of stateEntries(reminderRecords)) {
    if (record.status !== 'removed') continue
    if (active.includes(record.pubkey)) continue
    const channelPubkey = channels.get(record.pubkey)
    if (!channelPubkey) continue
    await assertPublished(await messenger.tell({
      channelPubkey,
      receiverPubkey: record.pubkey,
      code: TRUSTED_SIGNERS_STATE_CODE,
      payload: { entries: [record] },
      useBulkPacing: true
    }))
    sent += 1
  }

  return { sent }
}

export async function handleMessage (message, context = {}) {
  if (messageCode(message) !== TRUSTED_SIGNERS_STATE_CODE) return false
  const senderPubkey = normalizePubkey(message?.event?.pubkey)
  if (!senderPubkey || !context.trustedByPubkey?.has?.(senderPubkey)) return true

  const body = message?.payload?.payload
  if (!isPlainObject(body)) throw syncPayloadInvalid('payload-object-required')
  assertSupportedPayloadVersion(body)
  if (!Array.isArray(body.entries) || body.entries.length > MAX_SYNC_ENTRIES) {
    throw syncPayloadInvalid('entries-array-invalid')
  }
  const entries = stateEntries(body.entries)
  const rejected = body.entries.length - entries.length
  if (!entries.length) {
    if (rejected) throw syncPayloadInvalid('entries-invalid', { partial: true })
    return true
  }

  const devicePubkey = normalizePubkey(context.devicePubkey)
  const selfRemoval = entries.find(entry => entry.status === 'removed' && entry.pubkey === devicePubkey)
  if (selfRemoval) {
    // Old direct-removal reminders may arrive after this peer was re-trusted.
    // Only a removal at least as fresh as the sender trust can clear us.
    if (selfRemoval.updatedAt < senderTrustUpdatedAt(context, senderPubkey)) {
      if (rejected) throw syncPayloadInvalid('entries-invalid', { partial: true })
      return true
    }
    await context.trustedSigners?.clearActive?.({
      actorPubkey: devicePubkey,
      updatedAt: selfRemoval.updatedAt,
      tombstone: false
    })
    if (rejected) throw syncPayloadInvalid('entries-invalid', { partial: true })
    return true
  }

  const mergeEntries = entriesExceptPubkey(entries, devicePubkey)
  if (mergeEntries.length) await context.trustedSigners?.mergeRecords?.(mergeEntries, { action: 'sync' })
  if (rejected) throw syncPayloadInvalid('entries-invalid', { partial: true })
  return true
}
