export const SEEDER_PRESENCE_CODE = 'seederPresence_9xfzc7e65ju'
export const MISSING_MESSAGES_ASK_CODE = 'missingMessages_8mj8qayg7e3'
export const MISSING_MESSAGES_REPLY_CODE = 'missingMessages_roau5o03bim'

const DEFAULT_EVENTS_PER_CHUNK = 100

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

function eventInRange (event, since, until) {
  if (!Number.isFinite(event?.created_at)) return true
  if (since != null && event.created_at < since) return false
  if (until != null && event.created_at > until) return false
  return true
}

function compactOuter (outer = {}) {
  return {
    id: outer.id,
    kind: outer.kind,
    pubkey: outer.pubkey,
    created_at: outer.created_at,
    tags: outer.tags || []
  }
}

function compactRouter (router = {}) {
  return {
    kind: router.kind,
    pubkey: router.pubkey,
    created_at: router.created_at,
    tags: (router.tags || []).filter(tag => tag[0] !== 'c')
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

function backfillRecordsFromSeed (seed, { receiverPubkey, since, until }) {
  if (!eventInRange(seed.outer, since, until)) return []
  const records = []
  for (const row of splitJsonl(seed.jsonl)) {
    if (receiverPubkey && recordReceiverPubkey(row) !== receiverPubkey) continue
    records.push({
      outer: compactOuter(seed.outer),
      router: compactRouter(seed.router),
      row
    })
  }
  return records
}

function backfillRecordsFromInput (input, options) {
  if (!input) return []
  if (input.jsonl) return backfillRecordsFromSeed(input, options)

  const event = input.event || (Number.isInteger(input.kind) ? input : null)
  if (!event || !eventInRange(event, options.since, options.until)) return []
  return [{ event }]
}

function backfillRequestRange (question, since, until) {
  const content = parseEventContent(question || {})
  const payload = isPlainObject(content?.payload) ? content.payload : {}
  return {
    since: since ?? payload.since ?? 0,
    until: until ?? payload.until ?? nowSeconds()
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
  let chunk = ''
  let chunkEvents = 0
  let index = 0
  let finalized = false

  async function publish (done) {
    const jsonl = chunk
    chunk = ''
    chunkEvents = 0
    await messenger.reply({
      channelPubkey,
      question,
      receiverPubkey,
      code: MISSING_MESSAGES_REPLY_CODE,
      payload: {
        since: range.since,
        until: range.until,
        index: index++,
        done,
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
    await appendRecords(backfillRecordsFromInput(input, { receiverPubkey, since: range.since, until: range.until }))
  }

  async function finalize (input) {
    if (finalized) return
    if (input != null) {
      await appendRecords(backfillRecordsFromInput(input, { receiverPubkey, since: range.since, until: range.until }), { final: true })
    }
    finalized = true
    await publish(true)
  }

  return {
    update,
    finalize
  }
}
