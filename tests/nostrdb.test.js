import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  connect,
  createNostrDbService,
  disconnect,
  forAccount,
  isConnected
} from '../docs/services/nostrdb.js'
import * as store from '../docs/services/accounts-store.js'

if (!globalThis.localStorage) {
  const data = new Map()
  globalThis.localStorage = {
    clear: () => data.clear(),
    getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
    removeItem: key => { data.delete(String(key)) },
    setItem: (key, value) => { data.set(String(key), String(value)) }
  }
}

afterEach(() => {
  disconnect()
  globalThis.localStorage.clear()
})

describe('vault nostrdb launcher bridge', () => {
  it('sends one-shot methods with the owner pubkey selected by the vault', async () => {
    const calls = []
    const ownerPubkey = 'A'.repeat(64)
    const service = createNostrDbService({
      listAccounts: () => [{ type: 'nsec', pubkey: ownerPubkey }],
      getPort: () => 'port',
      ask: async (port, message, options) => {
        calls.push({ port, message, options })
        return { payload: { ok: true } }
      },
      timeout: 123
    })

    assert.deepEqual(await service.forAccount(ownerPubkey).add({ id: 'event' }, { appId: 'ignored' }), { ok: true })
    assert.deepEqual(calls, [{
      port: 'port',
      message: {
        code: 'NOSTRDB',
        payload: {
          ownerPubkey: 'a'.repeat(64),
          method: 'add',
          params: [{ id: 'event' }, { appId: 'ignored' }]
        }
      },
      options: { timeout: 123 }
    }])
  })

  it('throws when no trusted launcher port is connected', async () => {
    const service = createNostrDbService({
      listAccounts: () => [{ type: 'nsec', pubkey: 'b'.repeat(64) }],
      getPort: () => null
    })

    await assert.rejects(
      () => service.forAccount('b'.repeat(64)).query({ kinds: [1] }),
      /NOSTRDB_UNAVAILABLE/
    )
  })

  it('propagates launcher errors from one-shot methods', async () => {
    const service = createNostrDbService({
      listAccounts: () => [{ type: 'nsec', pubkey: 'c'.repeat(64) }],
      getPort: () => 'port',
      ask: async () => ({ error: new Error('db failed') })
    })

    await assert.rejects(
      () => service.forAccount('c'.repeat(64)).count({ kinds: [1] }),
      /db failed/
    )
  })

  it('streams subscribe results and sends owner-scoped cancellation', async () => {
    const calls = []
    const service = createNostrDbService({
      listAccounts: () => [{ type: 'nsec', pubkey: 'd'.repeat(64) }],
      getPort: () => 'port',
      askStream: async function * (port, message, options) {
        calls.push({ type: 'askStream', port, message, options })
        yield { payload: { result: { id: 'event' }, meta: { source: 'local' } } }
      },
      tell: (port, message) => calls.push({ type: 'tell', port, message }),
      makeSubscriptionId: () => 'sub-1'
    })
    const iterator = service.forAccount('d'.repeat(64)).subscribe({ kinds: [1] })

    assert.deepEqual(await iterator.next(), {
      value: { result: { id: 'event' }, meta: { source: 'local' } },
      done: false
    })
    assert.deepEqual(await iterator.return(), { done: true })

    assert.deepEqual(calls, [
      {
        type: 'askStream',
        port: 'port',
        message: {
          code: 'NOSTRDB',
          payload: {
            ownerPubkey: 'd'.repeat(64),
            method: 'subscribe',
            params: [{ kinds: [1] }],
            subscriptionId: 'sub-1'
          }
        },
        options: { timeout: null }
      },
      {
        type: 'tell',
        port: 'port',
        message: {
          code: 'NOSTRDB_CANCEL',
          payload: {
            ownerPubkey: 'd'.repeat(64),
            subscriptionId: 'sub-1'
          }
        }
      }
    ])
  })

  it('rejects read-only or unknown owners in the vault before asking the launcher', () => {
    const service = createNostrDbService({
      listAccounts: () => [
        { type: 'npub', pubkey: 'e'.repeat(64) },
        { type: 'nsec', pubkey: 'f'.repeat(64) }
      ]
    })

    assert.throws(
      () => service.forAccount('e'.repeat(64)),
      /NOSTRDB_OWNER_NOT_CONTROLLED/
    )
    assert.throws(
      () => service.forAccount('0'.repeat(64)),
      /NOSTRDB_OWNER_NOT_CONTROLLED/
    )
    assert.deepEqual(Object.keys(service.forAccount('f'.repeat(64))).sort(), [
      'add',
      'addEventsForApp',
      'count',
      'exportEventsByAppPage',
      'query',
      'subscribe',
      'supports'
    ])
  })

  it('exports a singleton connection for app code', async () => {
    const { port1, port2 } = new MessageChannel()
    store.add({ type: 'nsec', pubkey: 'e'.repeat(64) })
    connect(port1)
    assert.equal(isConnected(), true)
    assert.deepEqual(Object.keys(forAccount('e'.repeat(64))).sort(), [
      'add',
      'addEventsForApp',
      'count',
      'exportEventsByAppPage',
      'query',
      'subscribe',
      'supports'
    ])
    disconnect(port1)
    assert.equal(isConnected(), false)
    port1.close()
    port2.close()
  })
})
