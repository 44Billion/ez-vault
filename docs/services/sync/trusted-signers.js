export const TRUSTED_SIGNERS_STATE_CODE = 'trustedSigners_state_v1'
export const TRUSTED_SIGNER_SYNC_INFO = 'trusted-signer-list-sync-v1'

const HEX32 = /^[0-9a-f]{64}$/i

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

function messageBody (message) {
  return isPlainObject(message?.payload?.payload) ? message.payload.payload : {}
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

function entriesExceptPubkey (entries, pubkey) {
  const normalizedPubkey = normalizePubkey(pubkey)
  return normalizedPubkey ? entries.filter(entry => entry.pubkey !== normalizedPubkey) : entries
}

function senderTrustUpdatedAt (context, senderPubkey) {
  return normalizeTimestamp(context.trustedByPubkey?.get?.(senderPubkey)?.updatedAt)
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
      await messenger.tell({
        channelPubkey,
        receiverPubkey: peerPubkey,
        code: TRUSTED_SIGNERS_STATE_CODE,
        payload: { entries: payloadEntries }
      })
      sent += 1
    }
  }

  for (const record of stateEntries(reminderRecords)) {
    if (record.status !== 'removed') continue
    if (active.includes(record.pubkey)) continue
    const channelPubkey = channels.get(record.pubkey)
    if (!channelPubkey) continue
    await messenger.tell({
      channelPubkey,
      receiverPubkey: record.pubkey,
      code: TRUSTED_SIGNERS_STATE_CODE,
      payload: { entries: [record] }
    })
    sent += 1
  }

  return { sent }
}

export async function handleMessage (message, context = {}) {
  if (messageCode(message) !== TRUSTED_SIGNERS_STATE_CODE) return false
  const senderPubkey = normalizePubkey(message?.event?.pubkey)
  if (!senderPubkey || !context.trustedByPubkey?.has?.(senderPubkey)) return true

  const entries = stateEntries(messageBody(message).entries)
  if (!entries.length) return true

  const devicePubkey = normalizePubkey(context.devicePubkey)
  const selfRemoval = entries.find(entry => entry.status === 'removed' && entry.pubkey === devicePubkey)
  if (selfRemoval) {
    // Old direct-removal reminders may arrive after this peer was re-trusted.
    // Only a removal at least as fresh as the sender trust can clear us.
    if (selfRemoval.updatedAt < senderTrustUpdatedAt(context, senderPubkey)) return true
    context.trustedSigners?.clearActive?.({
      actorPubkey: devicePubkey,
      updatedAt: selfRemoval.updatedAt,
      tombstone: false
    })
    return true
  }

  const mergeEntries = entriesExceptPubkey(entries, devicePubkey)
  if (mergeEntries.length) context.trustedSigners?.mergeRecords?.(mergeEntries, { action: 'sync' })
  return true
}
