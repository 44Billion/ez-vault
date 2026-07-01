import { ask, askStream, tell } from '../helpers/window-message.js'
import * as store from './accounts-store.js'

const NOSTRDB_ONE_SHOT_METHODS = [
  'add',
  'query',
  'count',
  'supports',
  'exportEventsByAppPage',
  'addEventsForApp'
]
const NOSTRDB_STREAM_DONE = 'nostrdb:done'
const DEFAULT_TIMEOUT = 5 * 60 * 1000
const HEX32 = /^[0-9a-f]{64}$/i

let launcherPort = null

function defaultSubscriptionId () {
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function normalizeOwnerPubkey (ownerPubkey) {
  const pubkey = typeof ownerPubkey === 'string' ? ownerPubkey.toLowerCase() : ''
  if (!HEX32.test(pubkey)) throw new Error('NOSTRDB_OWNER_REQUIRED')
  return pubkey
}

function isWritableVaultAccount (ownerPubkey, accounts) {
  return (Array.isArray(accounts) ? accounts : []).some(account =>
    normalizePubkey(account?.pubkey) === ownerPubkey && account.type !== 'npub'
  )
}

function normalizePubkey (value) {
  const pubkey = typeof value === 'string' ? value.toLowerCase() : ''
  return HEX32.test(pubkey) ? pubkey : ''
}

function isStreamDone (payload, subscriptionId) {
  return payload?.type === NOSTRDB_STREAM_DONE && payload.subscriptionId === subscriptionId
}

function createNostrDbMethod (ownerPubkey, method, { getPort, ask: askFn, timeout }) {
  return async (...params) => {
    const port = getPort()
    if (!port) throw new Error('NOSTRDB_UNAVAILABLE')

    const { payload, error } = await askFn(
      port,
      { code: 'NOSTRDB', payload: { ownerPubkey, method, params } },
      { timeout }
    )
    if (error) throw error
    return payload
  }
}

function createNostrDbSubscription (ownerPubkey, params, {
  getPort,
  askStream: askStreamFn,
  tell: tellFn,
  subscriptionId
}) {
  let port
  let streamIterator
  let started = false

  async function start () {
    if (started) return
    started = true
    port = getPort()
    if (!port) throw new Error('NOSTRDB_UNAVAILABLE')
    streamIterator = askStreamFn(
      port,
      { code: 'NOSTRDB', payload: { ownerPubkey, method: 'subscribe', params, subscriptionId } },
      { timeout: null }
    )[Symbol.asyncIterator]()
  }

  return {
    [Symbol.asyncIterator] () {
      return this
    },
    async next () {
      await start()
      const next = await streamIterator.next()
      if (next.done) return { done: true }
      const { payload, error } = next.value
      if (error) throw error
      if (isStreamDone(payload, subscriptionId)) return { done: true }
      return { value: payload, done: false }
    },
    async return () {
      if (started && port) {
        tellFn(port, { code: 'NOSTRDB_CANCEL', payload: { ownerPubkey, subscriptionId } })
        await streamIterator?.return?.()
      }
      return { done: true }
    }
  }
}

export function createNostrDbService ({
  getPort = () => launcherPort,
  listAccounts = store.list,
  ask: askFn = ask,
  askStream: askStreamFn = askStream,
  tell: tellFn = tell,
  makeSubscriptionId = defaultSubscriptionId,
  timeout = DEFAULT_TIMEOUT
} = {}) {
  return {
    forAccount (ownerPubkey) {
      const normalizedOwnerPubkey = normalizeOwnerPubkey(ownerPubkey)
      if (!isWritableVaultAccount(normalizedOwnerPubkey, listAccounts())) {
        throw new Error('NOSTRDB_OWNER_NOT_CONTROLLED')
      }
      const nostrdb = {}
      for (const method of NOSTRDB_ONE_SHOT_METHODS) {
        nostrdb[method] = createNostrDbMethod(normalizedOwnerPubkey, method, {
          getPort,
          ask: askFn,
          timeout
        })
      }
      nostrdb.subscribe = (...params) => createNostrDbSubscription(normalizedOwnerPubkey, params, {
        getPort,
        askStream: askStreamFn,
        tell: tellFn,
        subscriptionId: makeSubscriptionId()
      })
      return nostrdb
    }
  }
}

const defaultService = createNostrDbService()

export function connect (port) {
  launcherPort = port || null
}

export function disconnect (port = launcherPort) {
  if (!port || port === launcherPort) launcherPort = null
}

export function isConnected () {
  return !!launcherPort
}

export function forAccount (ownerPubkey) {
  return defaultService.forAccount(ownerPubkey)
}
