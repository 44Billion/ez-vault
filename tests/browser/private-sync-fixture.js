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
    resolveAskCoalescingKey: () => 'a'.repeat(64)
  }).init({
    userSigner: signer(userPubkey),
    channels: [{
      signer: signer(channelPubkey),
      relays: ['wss://relay.example'],
      mode: 'leecher'
    }]
  })
  await messenger.update({}, { waitForBackground: true })
  const ask = (id, createdAt) => ({
    event: {
      id,
      kind: 7329,
      pubkey: '33'.repeat(32),
      created_at: createdAt,
      tags: [['r', userPubkey], ['q', id]],
      content: id
    },
    outer: { id: `outer-${id}`, created_at: createdAt },
    meta: { channelPubkey },
    senderPubkey: '33'.repeat(32),
    payload: { code: 'nostrDbSync_ask_kpkr', payload: { requestId: id } },
    question: { id, kind: 7329, pubkey: '33'.repeat(32), created_at: createdAt, tags: [] }
  })
  const first = '44'.repeat(32)
  const second = '55'.repeat(32)
  try {
    await watch.onAsk(ask(first, 10))
    await watch.onAsk(ask(second, 20))
    const delivery = await messenger.nextMessage()
    const result = {
      eventId: delivery?.message?.event?.id || '',
      questionId: delivery?.message?.question?.id || '',
      requestId: delivery?.message?.payload?.payload?.requestId || '',
      exposedInternalKey: Boolean(
        delivery?.message?.askCoalescingKey ||
        delivery?.message?.askCoalescingOrder
      )
    }
    await delivery?.ack()
    return result
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
