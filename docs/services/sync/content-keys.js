import { generateSecretKey, getPublicKey } from 'nostr-tools'
import * as store from '../accounts-store.js'
import * as secrets from '../secrets.js'
import { upsertContentKeyEvent } from '../content-key/index.js'
import { bytesToHex, hexToBytes } from '../../helpers/nostr/index.js'

export const CONTENT_KEYS_ANNOUNCE_CODE = 'contentKeys_announce_t7y8'
export const CONTENT_KEYS_ASK_CODE = 'contentKeys_ask_t7y8'
export const CONTENT_KEYS_REPLY_CODE = 'contentKeys_reply_t7y8'

const HEX32 = /^[0-9a-f]{64}$/i

const listeners = new Set()
const debugSourceByKey = new Map()
const publishStatusByOwner = new Map()

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

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

function contentKeysForOwner (ownerPubkey) {
  return secrets.listContentKeys(ownerPubkey)
    .map(normalizeMetaKey)
    .filter(Boolean)
}

function latestKey (keys) {
  let latest = null
  for (const key of keys || []) {
    if (!latest || (key.createdAt || 0) >= (latest.createdAt || 0)) latest = key
  }
  return latest
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

function isTrustedSender (message, trustedByPubkey) {
  return trustedByPubkey?.has?.(message?.event?.pubkey) || false
}

function isLocalNsecChannel (channelPubkey) {
  return store.get(channelPubkey)?.type === 'nsec'
}

function channelOwnerPayload (message) {
  const ownerPubkey = normalizePubkey(messageBody(message).ownerPubkey)
  return ownerPubkey && ownerPubkey === message.channelPubkey ? ownerPubkey : ''
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
  const accounts = store.list()
    .filter(account => account.type === 'nsec')
    .map(account => {
      const keys = secrets.isUnlocked() ? contentKeysForOwner(account.pubkey) : []
      const latest = latestKey(keys)
      const source = latest
        ? debugSourceByKey.get(sourceKey(account.pubkey, latest.pubkey)) || 'persisted local'
        : ''
      return {
        account,
        keys,
        latest,
        source,
        publishStatus: publishStatusByOwner.get(account.pubkey) || null
      }
    })
  return { unlocked: secrets.isUnlocked(), accounts }
}

export async function announceContentKeys ({ messenger, ownerPubkey, receiverPubkeys, debug }) {
  const keys = contentKeysForOwner(ownerPubkey)
  const receivers = normalizePubkeyList(receiverPubkeys)
  if (!keys.length || !receivers.length) return null
  emitDebug(debug, 'announce', {
    type: 'yell',
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    channelPubkey: ownerPubkey,
    ownerPubkey,
    receiverPubkeys: receivers,
    receiverCount: receivers.length,
    pubkeys: keys.map(key => key.pubkey),
    count: keys.length
  })
  return messenger.yell({
    channelPubkey: ownerPubkey,
    receiverPubkeys: receivers,
    code: CONTENT_KEYS_ANNOUNCE_CODE,
    payload: { ownerPubkey, keys }
  })
}

export async function announceAllContentKeys ({ messenger, receiverPubkeys, debug }) {
  const results = []
  for (const account of store.list()) {
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

  const seckey = bytesToHex(generateSecretKey())
  const createdAt = nowSeconds()
  const contentKeySigner = secrets.setContentKeySecret(ownerPubkey, seckey, createdAt)
  const pubkey = await contentKeySigner.getPublicKey()

  setDebugSource(ownerPubkey, pubkey, 'generated locally')
  setPublishStatus(ownerPubkey, { state: 'publishing', message: '' })

  let result = null
  let error = null
  try {
    result = await _upsertContentKeyEvent({ userSigner, contentKeySigner })
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
  const ownerPubkey = channelOwnerPayload(message)
  if (!ownerPubkey) return false
  const keys = (Array.isArray(messageBody(message).keys) ? messageBody(message).keys : [])
    .map(normalizeMetaKey)
    .filter(Boolean)
  const { knownPubkeys, announcedPubkeys, missingPubkeys: pubkeys } = contentKeyDiff(ownerPubkey, keys)
  if (!pubkeys.length) return true

  emitDebug(context.debug, 'request', {
    type: 'ask',
    code: CONTENT_KEYS_ASK_CODE,
    channelPubkey: ownerPubkey,
    ownerPubkey,
    receiverPubkey: message.event.pubkey,
    announcedCount: announcedPubkeys.length,
    knownCount: knownPubkeys.length,
    pubkeys,
    count: pubkeys.length
  })
  await context.messenger.ask({
    channelPubkey: ownerPubkey,
    receiverPubkey: message.event.pubkey,
    code: CONTENT_KEYS_ASK_CODE,
    payload: { ownerPubkey, pubkeys }
  })
  return true
}

async function handleRequest (message, context) {
  const ownerPubkey = channelOwnerPayload(message)
  if (!ownerPubkey || !message.event?.id) return false
  const pubkeys = normalizePubkeyList(messageBody(message).pubkeys)
  if (!pubkeys.length) return true

  await secrets.replyWithContentKeySecrets({
    ownerPubkey,
    pubkeys,
    send: payload => {
      const keys = Array.isArray(payload?.keys) ? payload.keys : []
      emitDebug(context.debug, 'reply', {
        type: 'reply',
        code: CONTENT_KEYS_REPLY_CODE,
        channelPubkey: ownerPubkey,
        ownerPubkey,
        receiverPubkey: message.event.pubkey,
        pubkeys: keys.map(key => key.pubkey).filter(Boolean),
        count: keys.length
      })
      return context.messenger.reply({
        channelPubkey: ownerPubkey,
        question: message.event,
        receiverPubkey: message.event.pubkey,
        code: CONTENT_KEYS_REPLY_CODE,
        payload
      })
    }
  })
  return true
}

async function handleReply (message, context) {
  const ownerPubkey = channelOwnerPayload(message)
  if (!ownerPubkey) return false
  const label = trustedLabel(message.event.pubkey, context.trustedByPubkey)
  const existingByPubkey = new Map(contentKeysForOwner(ownerPubkey).map(key => [key.pubkey, key]))
  let changed = false
  const importedPubkeys = []

  for (const key of (Array.isArray(messageBody(message).keys) ? messageBody(message).keys : [])) {
    const normalized = normalizeSecretKey(key)
    if (!normalized) continue

    const existing = existingByPubkey.get(normalized.pubkey)
    if (existing && (existing.createdAt || 0) >= normalized.createdAt) continue

    const signer = secrets.setContentKeySecret(ownerPubkey, normalized.seckey, normalized.createdAt)
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
      channelPubkey: ownerPubkey,
      ownerPubkey,
      senderPubkey: message.event.pubkey,
      pubkeys: importedPubkeys,
      count: importedPubkeys.length
    })
  }
  return true
}

export async function handleMessage (message, context) {
  const code = messageCode(message)
  if (
    code !== CONTENT_KEYS_ANNOUNCE_CODE &&
    code !== CONTENT_KEYS_ASK_CODE &&
    code !== CONTENT_KEYS_REPLY_CODE
  ) return false
  if (!isLocalNsecChannel(message?.channelPubkey)) return false
  if (!isTrustedSender(message, context.trustedByPubkey)) return false

  if (code === CONTENT_KEYS_ANNOUNCE_CODE) return handleAnnounce(message, context)
  if (code === CONTENT_KEYS_ASK_CODE) return handleRequest(message, context)
  return handleReply(message, context)
}
