import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSyncPeerGuard } from '../src/services/sync/peer-guard.js'
import {
  CONTENT_KEYS_ASK_CODE,
  CONTENT_KEYS_ANNOUNCE_CODE
} from '../src/services/sync/content-keys.js'
import {
  NOSTRDB_SYNC_ASK_CODE,
  NOSTRDB_SYNC_PUSH_CODE
} from '../src/services/sync/nostrdb.js'

const CHANNEL = 'a'.repeat(64)
const CHANNEL_TWO = 'b'.repeat(64)
const PEER = 'c'.repeat(64)
const PEER_TWO = 'd'.repeat(64)

function fixture (policy = {}) {
  let now = 1000
  const debug = []
  const guard = createSyncPeerGuard({
    now: () => now,
    onDebug: event => debug.push(event),
    policy: {
      messageLimit: 10,
      messageWindowMs: 60 * 1000,
      byteLimit: 1024,
      byteWindowMs: 60 * 1000,
      unitLimit: 10,
      unitWindowMs: 60 * 1000,
      announcementLimit: 2,
      announcementWindowMs: 60 * 60 * 1000,
      violationLimit: 3,
      violationWindowMs: 10 * 60 * 1000,
      cooldownLevelsMs: [5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000],
      stableResetMs: 30 * 60 * 1000,
      ...policy
    }
  })
  return {
    guard,
    debug,
    current: () => now,
    advance: ms => { now += ms }
  }
}

function context ({
  channelPubkey = CHANNEL,
  senderPubkey = PEER,
  type = 'tell',
  code = 'tell-code',
  bytes = 10,
  now = 1000
} = {}) {
  return { channelPubkey, senderPubkey, type, code, bytes, now }
}

function message (code = 'tell-code', payload = {}) {
  return { payload: { code, payload } }
}

test('peer guard enforces message limits and isolates peers and channels', () => {
  const f = fixture({ messageLimit: 2 })
  assert.equal(f.guard.admit(message(), context()), true)
  assert.equal(f.guard.admit(message(), context()), true)
  assert.equal(f.guard.admit(message(), context()), false)
  assert.equal(f.guard.admit(message(), context({ senderPubkey: PEER_TWO })), true)
  assert.equal(f.guard.admit(message(), context({ channelPubkey: CHANNEL_TWO })), true)
  assert.equal(f.guard.getDebugSnapshot().peerGuard.droppedByQuota, 1)
})

test('peer guard enforces byte, work-unit, and announcement buckets independently', () => {
  const byteGuard = fixture({ byteLimit: 100 }).guard
  assert.equal(byteGuard.admit(message(), context({ bytes: 101 })), false)

  const unitGuard = fixture({ unitLimit: 2 }).guard
  const rangeAsk = message(NOSTRDB_SYNC_ASK_CODE, { limit: 1, excludeIds: [] })
  assert.equal(unitGuard.admit(rangeAsk, context({
    type: 'ask',
    code: NOSTRDB_SYNC_ASK_CODE
  })), true)
  assert.equal(unitGuard.admit(rangeAsk, context({
    type: 'ask',
    code: NOSTRDB_SYNC_ASK_CODE
  })), false)

  const announcementGuard = fixture({ announcementLimit: 2 }).guard
  const announcement = message(CONTENT_KEYS_ANNOUNCE_CODE)
  const announcementContext = context({
    type: 'yell',
    code: CONTENT_KEYS_ANNOUNCE_CODE
  })
  assert.equal(announcementGuard.admit(announcement, announcementContext), true)
  assert.equal(announcementGuard.admit(announcement, announcementContext), true)
  assert.equal(announcementGuard.admit(announcement, announcementContext), false)
})

test('peer guard applies content and byte-based operation costs', () => {
  const contentGuard = fixture({ unitLimit: 3 }).guard
  const contentAsk = message(CONTENT_KEYS_ASK_CODE, {
    pubkeys: Array.from({ length: 129 }, (_, index) => index.toString(16).padStart(64, '0'))
  })
  assert.equal(contentGuard.admit(contentAsk, context({
    type: 'ask',
    code: CONTENT_KEYS_ASK_CODE
  })), true)
  assert.equal(contentGuard.admit(contentAsk, context({
    type: 'ask',
    code: CONTENT_KEYS_ASK_CODE
  })), false)

  const byteGuard = fixture({ unitLimit: 10, byteLimit: 250 * 1024 }).guard
  assert.equal(byteGuard.admit(message(NOSTRDB_SYNC_PUSH_CODE), context({
    type: 'yell',
    code: NOSTRDB_SYNC_PUSH_CODE,
    bytes: 200 * 1024
  })), true)
  assert.equal(byteGuard.admit(message(NOSTRDB_SYNC_PUSH_CODE), context({
    type: 'yell',
    code: NOSTRDB_SYNC_PUSH_CODE,
    bytes: 200 * 1024
  })), false)
})

test('peer guard opens, enforces, expires, and escalates cooldown', () => {
  const f = fixture({ messageLimit: 1 })
  assert.equal(f.guard.admit(message(), context()), true)
  for (let index = 0; index < 3; index++) {
    assert.equal(f.guard.admit(message(), context()), false)
  }
  let snapshot = f.guard.getDebugSnapshot().peerGuard
  assert.equal(snapshot.cooldownsOpened, 1)

  f.advance(1000)
  assert.equal(f.guard.admit(message(), context({ now: f.current() })), false)
  assert.equal(f.guard.getDebugSnapshot().peerGuard.droppedByCooldown, 1)

  f.advance(5 * 60 * 1000)
  assert.equal(f.guard.admit(message(), context({ now: f.current() })), true)
  for (let index = 0; index < 3; index++) {
    assert.equal(f.guard.admit(message(), context({ now: f.current() })), false)
  }
  snapshot = f.guard.getDebugSnapshot().peerGuard
  assert.equal(snapshot.cooldownsOpened, 2)
  assert.equal(f.debug.filter(event => event.action === 'peer-cooldown-opened').at(-1).cooldownMs, 15 * 60 * 1000)

  f.advance(30 * 60 * 1000)
  assert.equal(f.guard.admit(message(), context({ now: f.current() })), true)
  for (let index = 0; index < 3; index++) {
    assert.equal(f.guard.admit(message(), context({ now: f.current() })), false)
  }
  assert.equal(
    f.debug.filter(event => event.action === 'peer-cooldown-opened').at(-1).cooldownMs,
    5 * 60 * 1000
  )
})

test('invalid payload violations open cooldown without counting network failures', () => {
  const f = fixture()
  for (let index = 0; index < 3; index++) {
    f.guard.recordInvalidPayload(context({ now: f.current() }))
  }
  assert.equal(f.guard.admit(message(), context({ now: f.current() })), false)
  const snapshot = f.guard.getDebugSnapshot().peerGuard
  assert.equal(snapshot.violations, 3)
  assert.equal(snapshot.cooldownsOpened, 1)
  assert.equal(snapshot.droppedByCooldown, 1)
  assert.equal(snapshot.violationsByReason['invalid-payload'], 3)
})

test('peer guard diagnostics contain classifications and measurements only', () => {
  const f = fixture({ messageLimit: 1 })
  f.guard.admit(message(), context())
  f.guard.admit(message(), context())
  for (const event of f.debug) {
    assert.equal(Object.hasOwn(event, 'payload'), false)
    assert.equal(Object.hasOwn(event, 'content'), false)
    assert.equal(Object.hasOwn(event, 'senderPubkey'), false)
    assert.equal(Object.hasOwn(event, 'channelPubkey'), false)
  }
})
