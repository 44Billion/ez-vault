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
      return {
        key: 'a'.repeat(64),
        keep: 'latest',
        sequence: message.payload.payload.sequence
      }
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
  const envelope = (type, id, createdAt, sequence = 0) => ({
    event: {
      id,
      kind: type === 'tell' ? 7331 : 9,
      pubkey: '33'.repeat(32),
      created_at: createdAt,
      tags: [['D', 'browser-operation'], ...(type === 'tell' ? [['r', userPubkey]] : [])],
      content: id
    },
    outer: { id: `outer-${id}`, created_at: createdAt },
    meta: { channelPubkey },
    senderPubkey: '33'.repeat(32),
    payload: { code: `${type}:code`, payload: { id, sequence } },
    ...(type === 'tell' ? { tell: { id } } : {})
  })
  const tellFirst = '44'.repeat(32)
  const tellSecond = '55'.repeat(32)
  const messageFirst = '66'.repeat(32)
  const messageSecond = '77'.repeat(32)
  try {
    await watch.onTell(envelope('tell', tellFirst, 10))
    await watch.onTell(envelope('tell', tellSecond, 20))
    await watch.onMessage(envelope('message', messageFirst, 30, 10))
    await watch.onMessage(envelope('message', messageSecond, 30, 20))
    const tell = await messenger.nextMessage()
    const message = await messenger.nextMessage()
    await tell?.ack()
    await message?.ack()
    return {
      tellEventId: tell?.message?.event?.id || '',
      tellPayloadId: tell?.message?.payload?.payload?.id || '',
      messageEventId: message?.message?.event?.id || '',
      messageIdempotencyKey,
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
  coalescingProbe
}
