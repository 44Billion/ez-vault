// Bundled only by the protected browser regression; never shipped by the vault.
import * as passkey from '../../src/services/passkey.js'
import * as secrets from '../../src/services/secrets.js'
import * as accounts from '../../src/services/accounts-store.js'
import * as trust from '../../src/services/trusted-signers.js'
import * as sync from '../../src/services/sync/index.js'
import { prepareSeckey, commitPrepared } from '../../src/services/account-intake.js'
import { accountForLauncher, setAccountsState } from '../../src/services/messenger.js'
import { relayPool } from 'libp2r2p/relay'
import { PrivateMessenger } from 'libp2r2p/private-messenger'

const live = relayPool.getLiveEventsGenerator.bind(relayPool)
const errors = []
const warn = console.warn
console.warn = (...args) => { errors.push(args.map(value => value?.message ?? value)); if (errors.length > 64) errors.shift(); warn(...args) }
let liveLimit
let liveBytes
relayPool.getLiveEventsGenerator = (filter, relays, options) => live(filter, relays, { ...options, ...(liveLimit ? { maxBufferedLiveEvents: liveLimit } : {}), ...(liveBytes ? { maxBufferedLiveBytes: liveBytes } : {}) })
await import('../../src/index.js')
const signer = pubkey => ({
  getPublicKey: () => pubkey,
  withSharedKey: () => ({ getPublicKey: () => `${pubkey}:shared` })
})
async function coalescingProbe () {
  let watch
  let messageIdempotencyKey
  let messageCreatedAtMs
  const privateMessage = {
    watch: async options => {
      watch = options
      return () => {}
    },
    unwatch: async () => {},
    clearChannelState: async () => {}
  }
  const userPubkey = '11'.repeat(32)
  const channelPubkey = '22'.repeat(32)
  const messenger = await new PrivateMessenger({
    _privateMessage: privateMessage,
    _privateChannel: { fetchHistory: async () => [] },
    _isOnline: async () => true,
    _onOnline: () => () => {},
    offlineRecoverySeconds: 0,
    resolveInboundCoalescing: (message, context) => {
      if (message.type !== 'message') return null
      messageIdempotencyKey = context.idempotencyKey
      messageCreatedAtMs = context.eventCreatedAtMs
      return { key: 'a'.repeat(64), keep: 'latest' }
    }
  }).init({
    userSigner: signer(userPubkey),
    channels: [{
      signer: signer(channelPubkey),
      relays: ['wss://relay.example'],
      mode: 'leecher'
    }]
  })
  await messenger.update({}, { waitForBackground: true })
  const envelope = (
    type,
    id,
    createdAt,
    milliseconds = 0,
    kind = type === 'tell' ? 7331 : 9,
    senderPubkey = '33'.repeat(32)
  ) => ({
    event: {
      id,
      kind,
      pubkey: '33'.repeat(32),
      created_at: createdAt,
      tags: [
        ['D', 'browser-operation'],
        ['ms', String(milliseconds)],
        ...(type === 'tell' ? [['r', userPubkey]] : [])
      ],
      content: id
    },
    outer: { id: `outer-${id}`, created_at: createdAt },
    meta: { channelPubkey },
    senderPubkey,
    payload: { code: `${type}:code`, payload: { id } },
    ...(type === 'tell' ? { tell: { id } } : {})
  })
  const tellFirst = '44'.repeat(32)
  const tellSecond = '55'.repeat(32)
  const messageFirst = '66'.repeat(32)
  const messageSecond = '77'.repeat(32)
  try {
    await watch.onTell(envelope('tell', tellFirst, 10))
    await watch.onTell(envelope('tell', tellSecond, 20))
    await watch.onMessage(envelope('message', messageFirst, 30, 100, 7331, '34'.repeat(32)))
    await watch.onMessage(envelope('message', messageSecond, 30, 200, 7331, '34'.repeat(32)))
    const tell = await messenger.nextMessage()
    const message = await messenger.nextMessage()
    await tell?.ack()
    await message?.ack()
    return {
      tellEventId: tell?.message?.event?.id || '',
      tellPayloadId: tell?.message?.payload?.payload?.id || '',
      messageEventId: message?.message?.event?.id || '',
      messageIdempotencyKey,
      messageCreatedAtMs,
      exposedInternalMetadata: Boolean(
        tell?.message?.coalescingKey ||
        tell?.message?.coalescingKeep ||
        tell?.message?.coalescingOrder ||
        message?.message?.coalescingKey ||
        message?.message?.coalescingKeep ||
        message?.message?.coalescingOrder
      )
    }
  } finally {
    await messenger.close()
  }
}

async function identityProbe () {
  let watch
  const privateMessage = {
    watch: async options => {
      watch = options
      return () => {}
    },
    unwatch: async () => {},
    clearChannelState: async () => {}
  }
  const userPubkey = '11'.repeat(32)
  const channelPubkey = '22'.repeat(32)
  const authorPubkey = '33'.repeat(32)
  const messenger = await new PrivateMessenger({
    _privateMessage: privateMessage,
    _privateChannel: { fetchHistory: async () => [] },
    _isOnline: async () => true,
    _onOnline: () => () => {},
    offlineRecoverySeconds: 0
  }).init({
    userSigner: signer(userPubkey),
    channels: [{ signer: signer(channelPubkey), relays: ['wss://relay.example'], mode: 'leecher' }]
  })
  await messenger.update({}, { waitForBackground: true })
  const envelope = (id, createdAt, {
    tags = [],
    senderPubkey = authorPubkey,
    signed = false
  } = {}) => ({
    event: {
      id,
      kind: 9,
      pubkey: authorPubkey,
      created_at: createdAt,
      tags,
      content: id,
      ...(signed ? { sig: 'browser-signature' } : {})
    },
    outer: { id: `outer-${id}`, created_at: createdAt },
    meta: { channelPubkey },
    senderPubkey
  })
  const take = async () => {
    const delivery = await messenger.nextMessage()
    const value = delivery?.message || null
    await delivery?.ack()
    return value
  }
  try {
    await watch.onMessage(envelope('aa'.repeat(32), 10))
    await watch.onMessage(envelope('aa'.repeat(32), 10, { signed: true }))
    const sameId = await take()

    await watch.onMessage(envelope('bb'.repeat(32), 20, { tags: [['d', 'state']] }))
    await watch.onMessage(envelope('cc'.repeat(32), 30, { tags: [['d', 'state']] }))
    const newerAddress = await take()

    await watch.onMessage(envelope('ee'.repeat(32), 40, { tags: [['d', 'tie']] }))
    await watch.onMessage(envelope('dd'.repeat(32), 40, { tags: [['d', 'tie']] }))
    const lowerIdAddress = await take()

    await watch.onMessage(envelope('ff'.repeat(32), 50, { tags: [['d', 'trust']] }))
    await watch.onMessage(envelope('00'.repeat(32), 60, {
      tags: [['d', 'trust']],
      senderPubkey: '44'.repeat(32)
    }))
    const trustedAddress = await take()

    return {
      sameIdProvenance: sameId?.provenance || '',
      newerAddressId: newerAddress?.event?.id || '',
      lowerIdAddressId: lowerIdAddress?.event?.id || '',
      trustedAddressId: trustedAddress?.event?.id || '',
      remaining: await messenger.nextMessage() === null,
      exposedInternalMetadata: Boolean(
        sameId?.coalescingKey ||
        sameId?.coalescingKeep ||
        sameId?.coalescingOrder ||
        newerAddress?.coalescingKey ||
        newerAddress?.coalescingKeep ||
        newerAddress?.coalescingOrder
      )
    }
  } finally {
    await messenger.close()
  }
}
globalThis.syncProbe = {
  errors,
  async importAccount (secret) {
    await passkey.continueWithoutPasskey()
    const prepared = await prepareSeckey(secret, { pairedProfile: { name: 'Paired profile', about: 'Preserved biography' } })
    await commitPrepared([prepared], { protectionReady: true })
    return { pubkey: prepared.pubkey, device: await secrets.getDeviceSignerPubkey() }
  },
  profile: pubkey => accountForLauncher(accounts.get(pubkey)),
  async trust (pubkey) { await trust.add({ pubkey, platform: 'controlled peer', actorPubkey: await secrets.getDeviceSignerPubkey() }); await sync.refresh() },
  async lock () { secrets.lock(); setAccountsState(); await sync.refresh() },
  async unlock () { if (passkey.hasLocalVault()) await passkey.continueWithoutPasskey(); else await passkey.unlock(); setAccountsState(); await sync.refresh() },
  async limit (limit, bytes) { liveLimit = limit; liveBytes = bytes; await sync.stop(); await sync.refresh() },
  restoreLimits () { liveLimit = liveBytes = undefined },
  unlocked: () => secrets.isUnlocked(),
  debug: () => sync.getDebugSnapshot(),
  coalescingProbe,
  identityProbe
}
