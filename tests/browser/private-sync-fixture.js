// Bundled only by the protected browser regression; never shipped by the vault.
import * as passkey from '../../src/services/passkey.js'
import * as secrets from '../../src/services/secrets.js'
import * as accounts from '../../src/services/accounts-store.js'
import * as trust from '../../src/services/trusted-signers.js'
import * as sync from '../../src/services/sync/index.js'
import { prepareSeckey, commitPrepared } from '../../src/services/account-intake.js'
import { accountForLauncher, setAccountsState } from '../../src/services/messenger.js'
import { relayPool } from 'libp2r2p/relay'

const live = relayPool.getLiveEventsGenerator.bind(relayPool)
const errors = []
const warn = console.warn
console.warn = (...args) => { errors.push(args.map(value => value?.message ?? value)); if (errors.length > 64) errors.shift(); warn(...args) }
let liveLimit
relayPool.getLiveEventsGenerator = (filter, relays, options) => live(filter, relays, { ...options, ...(liveLimit ? { maxBufferedLiveEvents: liveLimit } : {}) })
await import('../../src/index.js')
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
  async limit (limit) { liveLimit = limit; await sync.stop(); await sync.refresh() },
  unlocked: () => secrets.isUnlocked(),
  debug: () => sync.getDebugSnapshot()
}
