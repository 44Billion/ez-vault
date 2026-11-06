import { getPublicKey } from 'libp2r2p/key'
import { bytesToHex, hexToBytes } from 'libp2r2p/base16'
import { sha256 } from '@noble/hashes/sha2.js'
import * as store from '../accounts-store.js'
import * as secrets from '../secrets.js'
import { filterVisibleAccounts } from '../account-mutations.js'
import { upsertContentKeyEvent } from '../content-key/index.js'
import { assertSupportedPayloadVersion, syncPayloadInvalid } from './payload-error.js'

// Flow notes:
// - This trusted-device layer only syncs content-key material for local nsec
//   accounts. Local NostrDB sync lives in a sibling module with separate codes.
// - The account owner is inferred from the account-scoped sync channel.
// - announce is public metadata over the private channel: "these content-key
//   pubkeys exist for this owner." It never includes secret keys.
// - ask is sent only for announced pubkeys this device does not already hold.
// - reply sends only the requested content-key secrets, encrypted to the trusted
//   peer through the account-scoped private channel.
// - Imported secrets may trigger another public-metadata announce. That is not
//   an echo of secret material; peers that already hold the pubkey will not ask
//   for the secret back.

// payload: { keys: [{ pubkey, createdAt }] }
export const CONTENT_KEYS_ANNOUNCE_CODE = 'contentKeys_announce_t7y8'
// payload: { pubkeys: [pubkey] }
export const CONTENT_KEYS_ASK_CODE = 'contentKeys_ask_t7y8'
// payload: { keys: [{ pubkey, seckey, createdAt }] }
export const CONTENT_KEYS_REPLY_CODE = 'contentKeys_reply_t7y8'

const HEX32 = /^[0-9a-f]{64}$/i
const MAX_SYNC_ENTRIES = 512
const encoder = new TextEncoder()

const listeners = new Set()
const debugSourceByKey = new Map()
const publishStatusByOwner = new Map()

function sourceKey (ownerPubkey, contentPubkey) {
  return `${ownerPubkey}:${contentPubkey}`
}

function notifyDebug () {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.warn('content-key sync debug listener threw', err) }
  }
}

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function normalizePubkey (value) {
  const pubkey = typeof value === 'string' ? value.toLowerCase() : ''
  return HEX32.test(pubkey) ? pubkey : ''
}

function normalizeCreatedAt (value) {
  const createdAt = Math.floor(Number(value) || 0)
  return Number.isSafeInteger(createdAt) && createdAt >= 0 ? createdAt : 0
}

function normalizeMetaKey (entry) {
  const pubkey = normalizePubkey(entry?.pubkey)
  if (!pubkey) return null
  return { pubkey, createdAt: normalizeCreatedAt(entry.createdAt) }
}

function normalizeSecretKey (entry) {
  const pubkey = normalizePubkey(entry?.pubkey)
  const seckey = normalizePubkey(entry?.seckey)
  if (!pubkey || !seckey) return null
  try {
    if (getPublicKey(hexToBytes(seckey)) !== pubkey) return null
  } catch {
    return null
  }
  return { pubkey, seckey, createdAt: normalizeCreatedAt(entry.createdAt) }
}

function normalizePubkeyList (values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizePubkey).filter(Boolean))]
}

function coalescingDigest (parts) {
  return bytesToHex(sha256(encoder.encode(JSON.stringify(parts))))
}

function contentKeysForOwner (ownerPubkey) {
  return secrets.listContentKeys(ownerPubkey)
    .map(normalizeMetaKey)
    .filter(Boolean)
}

function shortPubkey (pubkey) {
  return pubkey ? `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}` : ''
}

function trustedLabel (pubkey, trustedByPubkey) {
  const signer = trustedByPubkey?.get?.(pubkey)
  return signer?.platform || shortPubkey(pubkey)
}

function setDebugSource (ownerPubkey, contentPubkey, source) {
  debugSourceByKey.set(sourceKey(ownerPubkey, contentPubkey), source)
  notifyDebug()
}

function setPublishStatus (ownerPubkey, status) {
  if (status) publishStatusByOwner.set(ownerPubkey, status)
  else publishStatusByOwner.delete(ownerPubkey)
  notifyDebug()
}

function emitDebug (debug, action, detail = {}) {
  try {
    debug?.({ source: 'content-keys', action, ...detail })
  } catch (err) {
    console.warn('content-key sync debug hook threw', err)
  }
}

function messageCode (message) {
  return isPlainObject(message?.payload) ? message.payload.code || '' : ''
}

function messageBody (message) {
  return isPlainObject(message?.payload?.payload) ? message.payload.payload : {}
}

export function askCoalescingDigest (message) {
  if (messageCode(message) !== CONTENT_KEYS_ASK_CODE) return null
  const body = message?.payload?.payload
  if (!isPlainObject(body) || !Array.isArray(body.pubkeys) ||
      body.pubkeys.length > MAX_SYNC_ENTRIES || (body.v != null && body.v !== 1)) return null
  const pubkeys = normalizePubkeyList(body.pubkeys).sort()
  if (!pubkeys.length) return null
  return coalescingDigest(['content-keys-ask', pubkeys])
}

function requireDataBody (message) {
  const body = message?.payload?.payload
  if (!isPlainObject(body)) throw syncPayloadInvalid('payload-object-required')
  assertSupportedPayloadVersion(body)
  return body
}

function isTrustedSender (message, trustedByPubkey) {
  return trustedByPubkey?.has?.(message?.event?.pubkey) || false
}

function localOwnerForChannel (channelPubkey, context = {}) {
  const ownerPubkey = normalizePubkey(context.ownerPubkeyForChannel?.(channelPubkey) || channelPubkey)
  return store.get(ownerPubkey)?.type === 'nsec' ? ownerPubkey : ''
}

function contentKeyDiff (ownerPubkey, announcedKeys) {
  const knownPubkeys = contentKeysForOwner(ownerPubkey).map(key => key.pubkey)
  const held = new Set(knownPubkeys)
  const announcedPubkeys = [...new Set(announcedKeys
    .map(key => key.pubkey)
    .filter(Boolean))]
  return {
    knownPubkeys,
    announcedPubkeys,
    missingPubkeys: announcedPubkeys.filter(pubkey => !held.has(pubkey))
  }
}

export function subscribeDebug (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function resetDebugSources () {
  debugSourceByKey.clear()
  publishStatusByOwner.clear()
  notifyDebug()
}

export function getDebugSnapshot () {
  const accounts = filterVisibleAccounts(store.list())
    .filter(account => account.type === 'nsec')
    .map(account => {
      const keys = secrets.isUnlocked()
        ? contentKeysForOwner(account.pubkey).map(key => ({
          ...key,
          source: debugSourceByKey.get(sourceKey(account.pubkey, key.pubkey)) || 'persisted local'
        }))
        : []
      const activePubkey = secrets.getLatestContentKeySigner(account.pubkey)?.getPublicKey()
      const latest = keys.find(key => key.pubkey === activePubkey) || null
      return {
        account,
        keys,
        latest,
        source: latest?.source || '',
        publishStatus: publishStatusByOwner.get(account.pubkey) || null
      }
    })
  return { unlocked: secrets.isUnlocked(), accounts }
}

export async function announceContentKeys ({ messenger, ownerPubkey, channelPubkey = ownerPubkey, receiverPubkeys, debug }) {
  const keys = contentKeysForOwner(ownerPubkey)
  const receivers = normalizePubkeyList(receiverPubkeys)
  if (!keys.length || !receivers.length) return null
  emitDebug(debug, 'announce', {
    type: 'yell',
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    channelPubkey,
    ownerPubkey,
    receiverPubkeys: receivers,
    receiverCount: receivers.length,
    pubkeys: keys.map(key => key.pubkey),
    count: keys.length
  })
  return messenger.yell({
    channelPubkey,
    receiverPubkeys: receivers,
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    payload: { keys },
    useBulkPacing: true
  })
}

export async function announceAllContentKeys ({ messenger, receiverPubkeys, debug }) {
  const results = []
  for (const account of filterVisibleAccounts(store.list())) {
    if (account.type !== 'nsec') continue
    const result = await announceContentKeys({ messenger, ownerPubkey: account.pubkey, receiverPubkeys, debug })
    if (result) results.push(result)
  }
  return results
}

export async function generateAndPublishContentKey ({
  ownerPubkey,
  _upsertContentKeyEvent = upsertContentKeyEvent
}) {
  const account = store.get(ownerPubkey)
  if (account?.type !== 'nsec') throw new Error('NSEC_ACCOUNT_REQUIRED')
  const userSigner = secrets.getNsecSigner(ownerPubkey)
  if (!userSigner) throw new Error('VAULT_LOCKED')

  const contentKeySigner = await secrets.createContentKeySecret(ownerPubkey)
  const pubkey = await contentKeySigner.getPublicKey()
  const createdAt = contentKeysForOwner(ownerPubkey).find(key => key.pubkey === pubkey).createdAt

  setDebugSource(ownerPubkey, pubkey, 'generated locally')
  setPublishStatus(ownerPubkey, { state: 'publishing', message: '' })

  let result = null
  let error = null
  try {
    result = await _upsertContentKeyEvent({ userSigner, contentKeySigner, createdAt })
    setPublishStatus(ownerPubkey, { state: 'published', message: '' })
  } catch (err) {
    error = err
    setPublishStatus(ownerPubkey, {
      state: 'publish failed',
      message: err?.message || String(err)
    })
  }

  return { ownerPubkey, pubkey, createdAt, result, error }
}

async function handleAnnounce (message, context) {
  const ownerPubkey = localOwnerForChannel(message.channelPubkey, context)
  if (!ownerPubkey) return false
  const channelPubkey = message.channelPubkey || ownerPubkey
  const body = requireDataBody(message)
  if (!Array.isArray(body.keys) || body.keys.length > MAX_SYNC_ENTRIES) {
    throw syncPayloadInvalid('keys-array-invalid')
  }
  const keys = body.keys.map(normalizeMetaKey).filter(Boolean)
  const rejected = body.keys.length - keys.length
  const { knownPubkeys, announcedPubkeys, missingPubkeys: pubkeys } = contentKeyDiff(ownerPubkey, keys)
  if (!pubkeys.length) {
    if (rejected) throw syncPayloadInvalid('keys-entries-invalid', { partial: true })
    return true
  }

  emitDebug(context.debug, 'request', {
    type: 'ask',
    code: CONTENT_KEYS_ASK_CODE,
    channelPubkey,
    ownerPubkey,
    receiverPubkey: message.event.pubkey,
    announcedCount: announcedPubkeys.length,
    knownCount: knownPubkeys.length,
    pubkeys,
    count: pubkeys.length
  })
  await context.messenger.ask({
    channelPubkey,
    receiverPubkey: message.event.pubkey,
    code: CONTENT_KEYS_ASK_CODE,
    payload: { pubkeys },
    useBulkPacing: true
  })
  if (rejected) throw syncPayloadInvalid('keys-entries-invalid', { partial: true })
  return true
}

async function handleRequest (message, context) {
  const ownerPubkey = localOwnerForChannel(message.channelPubkey, context)
  if (!ownerPubkey || !message.event?.id) return false
  const channelPubkey = message.channelPubkey || ownerPubkey
  const body = messageBody(message)
  if (!isPlainObject(message?.payload?.payload) || !Array.isArray(body.pubkeys) ||
    body.pubkeys.length > MAX_SYNC_ENTRIES || (body.v != null && body.v !== 1)) return true
  const pubkeys = normalizePubkeyList(body.pubkeys)
  if (!pubkeys.length) return true

  await secrets.replyWithContentKeySecrets({
    ownerPubkey,
    pubkeys,
    send: payload => {
      const keys = Array.isArray(payload?.keys) ? payload.keys : []
      emitDebug(context.debug, 'reply', {
        type: 'reply',
        code: CONTENT_KEYS_REPLY_CODE,
        channelPubkey,
        ownerPubkey,
        receiverPubkey: message.event.pubkey,
        pubkeys: keys.map(key => key.pubkey).filter(Boolean),
        count: keys.length
      })
      return context.messenger.reply({
        channelPubkey,
        question: message.event,
        receiverPubkey: message.event.pubkey,
        code: CONTENT_KEYS_REPLY_CODE,
        idempotencyKey: `${CONTENT_KEYS_REPLY_CODE}:${message.event.id}`,
        payload,
        useBulkPacing: true
      })
    }
  })
  return true
}

async function handleReply (message, context) {
  const ownerPubkey = localOwnerForChannel(message.channelPubkey, context)
  if (!ownerPubkey) return false
  const channelPubkey = message.channelPubkey || ownerPubkey
  const body = requireDataBody(message)
  if (!Array.isArray(body.keys) || body.keys.length > MAX_SYNC_ENTRIES) {
    throw syncPayloadInvalid('keys-array-invalid')
  }
  const label = trustedLabel(message.event.pubkey, context.trustedByPubkey)
  const existingByPubkey = new Map(contentKeysForOwner(ownerPubkey).map(key => [key.pubkey, key]))
  let changed = false
  const importedPubkeys = []
  let rejected = 0

  for (const key of body.keys) {
    const normalized = normalizeSecretKey(key)
    if (!normalized) {
      rejected++
      continue
    }

    const existing = existingByPubkey.get(normalized.pubkey)
    if (existing && (existing.createdAt || 0) >= normalized.createdAt) continue

    const signer = await secrets.setContentKeySecret(ownerPubkey, normalized.seckey, normalized.createdAt)
    if (!signer) continue
    existingByPubkey.set(normalized.pubkey, { pubkey: normalized.pubkey, createdAt: normalized.createdAt })
    debugSourceByKey.set(sourceKey(ownerPubkey, normalized.pubkey), `synced from ${label}`)
    importedPubkeys.push(normalized.pubkey)
    changed = true
  }

  if (changed) {
    notifyDebug()
    emitDebug(context.debug, 'import', {
      type: 'reply',
      code: CONTENT_KEYS_REPLY_CODE,
      channelPubkey,
      ownerPubkey,
      senderPubkey: message.event.pubkey,
      pubkeys: importedPubkeys,
      count: importedPubkeys.length
    })
  }
  if (rejected) throw syncPayloadInvalid('keys-entries-invalid', { partial: true })
  return true
}

export async function handleMessage (message, context) {
  const code = messageCode(message)
  if (
    code !== CONTENT_KEYS_ANNOUNCE_CODE &&
    code !== CONTENT_KEYS_ASK_CODE &&
    code !== CONTENT_KEYS_REPLY_CODE
  ) return false
  if (!localOwnerForChannel(message?.channelPubkey, context)) return false
  if (!isTrustedSender(message, context.trustedByPubkey)) return false

  if (code === CONTENT_KEYS_ANNOUNCE_CODE) return handleAnnounce(message, context)
  if (code === CONTENT_KEYS_ASK_CODE) return handleRequest(message, context)
  return handleReply(message, context)
}
