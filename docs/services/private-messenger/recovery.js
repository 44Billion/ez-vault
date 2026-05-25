import { bytesToBase64, base64ToBytes } from '../../helpers/base64.js'

export const SEEDER_PRESENCE_CODE = 'seederPresence_9xfz'
export const MISSING_MESSAGES_ASK_CODE = 'missingMessages_8mj8'
export const MISSING_MESSAGES_REPLY_CODE = 'missingMessages_roau'

const DEFAULT_EVENTS_PER_CHUNK = 100
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function parseEventContent (event) {
  try { return JSON.parse(event.content) } catch { return event.content }
}

function splitJsonl (jsonl) {
  return String(jsonl || '').split('\n').filter(Boolean)
}

function decodeJsonl (content) {
  try { return decoder.decode(base64ToBytes(content || '')) } catch { return '' }
}

function encodeJsonlRow (row) {
  return bytesToBase64(encoder.encode(String(row).endsWith('\n') ? row : `${row}\n`))
}

function eventInRange (event, since, until) {
  if (!Number.isFinite(event?.created_at)) return true
  if (since != null && event.created_at < since) return false
  if (until != null && event.created_at > until) return false
  return true
}

function compactRouter (router = {}) {
  return {
    kind: router.kind,
    pubkey: router.pubkey,
    created_at: router.created_at,
    tags: (router.tags || []).filter(tag => tag[0] !== 'c')
  }
}

export function compactSeedRouter (router = {}) {
  return {
    ...compactRouter(router),
    content: router.content || ''
  }
}

function routerWithSingleRow (router, row) {
  const compact = compactRouter(router)
  return {
    ...compact,
    tags: compact.tags.concat([['c', '0', '1']]),
    content: encodeJsonlRow(row)
  }
}

function recordReceiverPubkey (line) {
  try {
    const record = JSON.parse(line)
    return Array.isArray(record) ? record[0] : ''
  } catch {
    return ''
  }
}

function compactRoutersFromSeed (seed, { receiverPubkey, since, until }) {
  if (!seed?.router?.content || !eventInRange(seed.router, since, until)) return []
  const records = []
  for (const row of splitJsonl(decodeJsonl(seed.router.content))) {
    if (receiverPubkey && recordReceiverPubkey(row) !== receiverPubkey) continue
    records.push(routerWithSingleRow(seed.router, row))
  }
  return records
}

function backfillRequestRange (question, since, until) {
  const content = parseEventContent(question || {})
  const payload = isPlainObject(content?.payload) ? content.payload : {}
  return {
    since: since ?? payload.since ?? 0,
    until: until ?? payload.until ?? nowSeconds()
  }
}

function eventRecordFromInput (event) {
  return Number.isInteger(event?.kind) ? [event] : []
}

export function createEventReplyPacker ({
  messenger,
  channelPubkey,
  question,
  receiverPubkey = question?.pubkey,
  code,
  payload = {},
  eventsPerChunk = DEFAULT_EVENTS_PER_CHUNK,
  recordsFromInput = eventRecordFromInput
}) {
  if (!messenger?.reply) throw new Error('MESSENGER_REQUIRED')
  if (!question?.id) throw new Error('QUESTION_REQUIRED')
  if (!receiverPubkey) throw new Error('RECEIVER_PUBKEY_REQUIRED')
  if (!code) throw new Error('REPLY_CODE_REQUIRED')
  if (!Number.isSafeInteger(eventsPerChunk) || eventsPerChunk < 1) throw new Error('INVALID_EVENTS_PER_CHUNK')

  let chunk = ''
  let chunkEvents = 0
  let index = 0
  let finalized = false

  async function publish (isLast) {
    const jsonl = chunk
    chunk = ''
    chunkEvents = 0
    await messenger.reply({
      channelPubkey,
      question,
      receiverPubkey,
      code,
      payload: {
        ...payload,
        index: index++,
        isLast,
        jsonl
      }
    })
  }

  async function appendRecord (record, { flush = true } = {}) {
    chunk += `${JSON.stringify(record)}\n`
    chunkEvents++
    if (flush && chunkEvents >= eventsPerChunk) await publish(false)
  }

  async function appendRecords (records, { final = false } = {}) {
    for (let i = 0; i < records.length; i++) {
      const isLast = final && i === records.length - 1
      await appendRecord(records[i], { flush: !isLast })
    }
  }

  async function update (input) {
    if (finalized) throw new Error('PACKER_FINALIZED')
    await appendRecords(await recordsFromInput(input))
  }

  async function finalize (input) {
    if (finalized) return
    if (input != null) await appendRecords(await recordsFromInput(input), { final: true })
    finalized = true
    await publish(true)
  }

  return {
    update,
    finalize
  }
}

export function createMissingMessageReplyPacker ({
  messenger,
  channelPubkey,
  question,
  receiverPubkey = question?.pubkey,
  since,
  until,
  eventsPerChunk = DEFAULT_EVENTS_PER_CHUNK
}) {
  if (!messenger?.reply) throw new Error('MESSENGER_REQUIRED')
  if (!question?.id) throw new Error('QUESTION_REQUIRED')
  if (!receiverPubkey) throw new Error('RECEIVER_PUBKEY_REQUIRED')
  if (!Number.isSafeInteger(eventsPerChunk) || eventsPerChunk < 1) throw new Error('INVALID_EVENTS_PER_CHUNK')

  const range = backfillRequestRange(question, since, until)
  return createEventReplyPacker({
    messenger,
    channelPubkey,
    question,
    receiverPubkey,
    code: MISSING_MESSAGES_REPLY_CODE,
    payload: { since: range.since, until: range.until },
    eventsPerChunk,
    recordsFromInput: seed => compactRoutersFromSeed(seed, { receiverPubkey, since: range.since, until: range.until })
  })
}
