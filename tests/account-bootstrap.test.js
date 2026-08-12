import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import { isValidEvent } from 'libp2r2p/event'
import { publishAccountBootstrap } from '../src/services/account-bootstrap.js'

test('new-account bootstrap publishes relay discovery before the profile', async () => {
  const secretKey = generateSecretKey()
  const pubkey = getPublicKey(secretKey)
  const calls = []
  const relayPool = {
    async sendEvent (event, relays) {
      calls.push({ event, relays })
      return { success: true }
    }
  }

  const result = await publishAccountBootstrap({
    secretKey,
    name: 'Azure Ember',
    picture: 'data:image/svg+xml,neutral',
    _relayPool: relayPool,
    _freeRelays: ['wss://write-one.example', 'wss://write-two.example', 'wss://unused.example'],
    _seedRelays: ['wss://seed.example']
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].event.kind, 10002)
  assert.equal(calls[0].event.pubkey, pubkey)
  assert.equal(isValidEvent(calls[0].event), true)
  assert.deepEqual(calls[0].event.tags, [
    ['r', 'wss://write-one.example'],
    ['r', 'wss://write-two.example']
  ])
  assert.deepEqual(calls[0].relays, ['wss://seed.example'])

  assert.equal(calls[1].event.kind, 0)
  assert.equal(calls[1].event.pubkey, pubkey)
  assert.equal(isValidEvent(calls[1].event), true)
  assert.deepEqual(JSON.parse(calls[1].event.content), {
    name: 'Azure Ember',
    picture: 'data:image/svg+xml,neutral'
  })
  assert.deepEqual(calls[1].relays, ['wss://write-one.example', 'wss://write-two.example'])
  assert.deepEqual(result, {
    name: 'Azure Ember',
    picture: 'data:image/svg+xml,neutral',
    profileEvent: calls[1].event,
    relayListEvent: calls[0].event,
    writeRelays: ['wss://write-one.example', 'wss://write-two.example']
  })
})

test('new-account bootstrap requires both publishes to succeed', async () => {
  let call = 0
  const relayPool = {
    async sendEvent () {
      call++
      return { success: call === 1 }
    }
  }
  await assert.rejects(publishAccountBootstrap({
    secretKey: generateSecretKey(),
    name: 'Azure Ember',
    picture: '',
    _relayPool: relayPool,
    _freeRelays: ['wss://write.example'],
    _seedRelays: ['wss://seed.example']
  }), /PROFILE_PUBLISH_FAILED/)
})
