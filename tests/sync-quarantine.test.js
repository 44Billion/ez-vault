import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSyncQuarantine,
  SYNC_QUARANTINE_KEY,
  SYNC_QUARANTINE_MAX_PEER_RECORDS,
  SYNC_QUARANTINE_MAX_RECORDS,
  SYNC_QUARANTINE_TTL_MS
} from '../src/services/sync/quarantine.js'
import { syncPayloadInvalid } from '../src/services/sync/payload-error.js'

const OWNER = 'a'.repeat(64)
const PEER = 'b'.repeat(64)

function fixture (now = 1000) {
  const state = new Map()
  const clock = { now }
  const seal = value => `sealed:${Buffer.from(value).toString('base64')}`
  const open = value => Buffer.from(value.slice('sealed:'.length), 'base64').toString()
  const quarantine = createSyncQuarantine({
    _getState: key => state.get(key) ?? null,
    _setState: async (key, value) => { state.set(key, value) },
    _removeState: async key => { state.delete(key) },
    _vaultEncrypt: seal,
    _vaultDecrypt: open,
    _now: () => clock.now,
    _yield: async () => {}
  })
  return { clock, quarantine, state }
}

function message (id, { sender = PEER, code = 'data_code', payload = { secret: 'private-payload' } } = {}) {
  return {
    type: 'reply',
    channelPubkey: 'channel',
    event: { id, pubkey: sender, created_at: 1 },
    payload: { code, payload }
  }
}

function context () {
  return {
    ownerPubkeys: new Set([OWNER]),
    trustedByPubkey: new Map([[PEER, { pubkey: PEER }]]),
    ownerPubkeyForChannel: () => OWNER,
    channelPubkeyForOwner: () => 'channel'
  }
}

test('quarantine is encrypted, deduplicated and bounded globally and per peer', async () => {
  const { quarantine, state } = fixture()
  const first = message('1'.repeat(64), { payload: { secret: 'content-key-secret' } })
  assert.equal((await quarantine.add(first, syncPayloadInvalid('bad-shape'), {
    context: context(), decoderVersion: 1
  })).status, 'stored')
  assert.equal((await quarantine.add(first, syncPayloadInvalid('still-bad'), {
    context: context(), decoderVersion: 1
  })).status, 'updated')
  assert.equal(state.get(SYNC_QUARANTINE_KEY).includes('content-key-secret'), false)
  assert.equal((await quarantine._load()).records[0].attempts, 2)
  const reopened = createSyncQuarantine({
    _getState: key => state.get(key) ?? null,
    _setState: async (key, value) => { state.set(key, value) },
    _removeState: async key => { state.delete(key) },
    _vaultEncrypt: value => `sealed:${Buffer.from(value).toString('base64')}`,
    _vaultDecrypt: value => Buffer.from(value.slice('sealed:'.length), 'base64').toString(),
    _now: () => 1000,
    _yield: async () => {}
  })
  assert.equal((await reopened._load()).records.length, 1)

  for (let index = 0; index < SYNC_QUARANTINE_MAX_PEER_RECORDS + 5; index++) {
    await quarantine.add(message(index.toString(16).padStart(64, '0')), syncPayloadInvalid('bad-shape'), {
      context: context(), decoderVersion: 1
    })
  }
  const peerRecords = (await quarantine._load()).records.filter(record => record.senderPubkey === PEER)
  assert.equal(peerRecords.length, SYNC_QUARANTINE_MAX_PEER_RECORDS)

  const senders = Array.from({ length: 5 }, (_, index) => `${index + 1}`.repeat(64).slice(0, 64))
  const trustedByPubkey = new Map([
    [PEER, { pubkey: PEER }],
    ...senders.map(sender => [sender, { pubkey: sender }])
  ])
  const manyContext = { ...context(), trustedByPubkey }
  for (let index = 0; index < 110; index++) {
    await quarantine.add(message((1000 + index).toString(16).padStart(64, '0'), { sender: senders[index % senders.length] }), syncPayloadInvalid('bad-shape'), {
      context: manyContext, decoderVersion: 1
    })
  }
  assert.equal((await quarantine._load()).records.length, SYNC_QUARANTINE_MAX_RECORDS)

  const oversized = message('f'.repeat(64), { payload: { secret: 'x'.repeat(1024 * 1024) } })
  assert.equal((await quarantine.add(oversized, syncPayloadInvalid('bad-shape'), {
    context: manyContext, decoderVersion: 1
  })).status, 'oversized')

  await quarantine.clear()
  for (let index = 0; index < 4; index++) {
    await quarantine.add(message((2000 + index).toString(16).padStart(64, '0'), {
      payload: { secret: 'b'.repeat(400 * 1024) }
    }), syncPayloadInvalid('bad-shape'), {
      context: context(), decoderVersion: 1
    })
  }
  assert.ok((await quarantine._load()).records.length < 4)
  assert.ok((await quarantine._load()).records.reduce((total, record) => total + record.byteSize, 0) <= 1024 * 1024)
})

test('quarantine prunes expired, untrusted and replaced-channel records', async () => {
  const { clock, quarantine } = fixture()
  await quarantine.add(message('1'.repeat(64)), syncPayloadInvalid('bad-shape'), {
    context: context(), decoderVersion: 1
  })
  await quarantine.add(message('2'.repeat(64), { sender: 'c'.repeat(64) }), syncPayloadInvalid('bad-shape'), {
    context: {
      ...context(),
      trustedByPubkey: new Map([
        [PEER, { pubkey: PEER }],
        ['c'.repeat(64), { pubkey: 'c'.repeat(64) }]
      ])
    },
    decoderVersion: 1
  })
  clock.now += SYNC_QUARANTINE_TTL_MS + 1
  await quarantine.add(message('3'.repeat(64)), syncPayloadInvalid('bad-shape'), {
    context: context(), decoderVersion: 1
  })
  const records = (await quarantine._load()).records
  assert.deepEqual(records.map(record => record.id), ['3'.repeat(64)])

  assert.equal(await quarantine.prune({
    ...context(),
    channelPubkeyForOwner: () => 'different-channel'
  }), 1)
  assert.equal((await quarantine._load()).records.length, 0)
})

test('quarantine replay runs only for an older decoder version and preserves retryable failures', async () => {
  const { quarantine } = fixture()
  const first = message('1'.repeat(64))
  const second = message('2'.repeat(64))
  await quarantine.add(first, syncPayloadInvalid('old-shape'), { context: context(), decoderVersion: 0 })
  await quarantine.add(second, syncPayloadInvalid('old-shape'), { context: context(), decoderVersion: 0 })

  const replayed = []
  const firstPass = await quarantine.replay({
    context: context(),
    decoderVersion: 1,
    handle: async value => { replayed.push(value.event.id); return true }
  })
  assert.deepEqual(firstPass, { pruned: 0, replayed: 2, retained: 0 })
  assert.deepEqual(replayed.sort(), [first.event.id, second.event.id].sort())
  assert.equal((await quarantine._load()).records.length, 0)

  await quarantine.add(first, syncPayloadInvalid('old-shape'), { context: context(), decoderVersion: 0 })
  await assert.rejects(quarantine.replay({
    context: context(),
    decoderVersion: 1,
    handle: async () => { throw new Error('TEMPORARY_STORAGE_FAILURE') }
  }), /TEMPORARY_STORAGE_FAILURE/)
  assert.equal((await quarantine._load()).records[0].handlerVersion, 0)

  let calls = 0
  const retried = await quarantine.replay({
    context: context(),
    decoderVersion: 1,
    handle: async () => { calls++; return true }
  })
  assert.deepEqual(retried, { pruned: 0, replayed: 1, retained: 0 })
  assert.equal(calls, 1)
  assert.equal((await quarantine._load()).records.length, 0)

  await quarantine.add(first, syncPayloadInvalid('still-invalid'), {
    context: context(), decoderVersion: 1
  })
  const sameVersion = await quarantine.replay({
    context: context(),
    decoderVersion: 1,
    handle: async () => { calls++; return true }
  })
  assert.deepEqual(sameVersion, { pruned: 0, replayed: 0, retained: 0 })
  assert.equal(calls, 1)
  assert.equal((await quarantine._load()).records[0].handlerVersion, 1)

  await quarantine.clear()
  await quarantine.add(first, syncPayloadInvalid('old-shape'), {
    context: context(), decoderVersion: 0
  })
  const invalid = await quarantine.replay({
    context: context(),
    decoderVersion: 1,
    handle: async () => { throw syncPayloadInvalid('still-invalid') }
  })
  assert.deepEqual(invalid, { pruned: 0, replayed: 0, retained: 1 })
  assert.equal((await quarantine._load()).records[0].handlerVersion, 1)
})

test('quarantine corruption is reported without replacing or clearing the sealed state', async () => {
  const { quarantine, state } = fixture()
  const sealed = `sealed:${Buffer.from(JSON.stringify({ version: 1, records: [{ id: 'broken' }] })).toString('base64')}`
  state.set(SYNC_QUARANTINE_KEY, sealed)

  await assert.rejects(quarantine._load(), error => error.code === 'SYNC_QUARANTINE_INVALID')
  assert.equal(state.get(SYNC_QUARANTINE_KEY), sealed)
})
