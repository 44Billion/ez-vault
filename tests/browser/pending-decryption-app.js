// Browser-only consumer: every crypto/storage operation uses the real injected
// signer and event store. Only relay transport is controlled by the parent test.
import { createPrivateMessenger } from 'libp2r2p/private-messenger'
import { wireEvent } from 'libp2r2p/private-messenger/session'
import { base64ToBytes, bytesToBase64 } from 'libp2r2p/base64'

const settlePermission = async operation => {
  try { return await operation() } finally { await new Promise(resolve => setTimeout(resolve, 50)) }
}

function adapter (signer, contentKeys = false) {
  const value = {
    getPublicKey: () => settlePermission(() => signer.getPublicKey()),
    signEvent: event => settlePermission(() => signer.signEvent(event)),
    nip44v3Encrypt: (peer, kind, scope, value) => settlePermission(() => signer.nip44v3.encrypt(peer, kind, scope, base64ToBytes(value).buffer)),
    nip44v3Decrypt: async (peer, kind, scope, value) => bytesToBase64(new Uint8Array(await settlePermission(() => signer.nip44v3.decrypt(peer, kind, scope, value))))
  }
  if (contentKeys) {
    value.nip44EncryptDoubleDH = (peer, kind, scope, value, contentPubkey) => settlePermission(() => signer.nip44v3.encryptDoubleDH(peer, kind, scope, base64ToBytes(value).buffer, contentPubkey))
    value.nip44DecryptDoubleDH = async (...args) => bytesToBase64(new Uint8Array(await settlePermission(() => signer.nip44v3.decryptDoubleDH(...args))))
  }
  return value
}

let owner
let messenger
let draining
let redrain = false
const changes = []
const delivered = []
const errors = []
const stop = window.napp.onContentKeysChanged(state => {
  changes.push(state)
  return messenger?.retryPendingDecryptions()
})

async function drain () {
  redrain = true
  if (draining) return draining
  draining = (async () => {
    do {
      redrain = false
      while (true) {
        const delivery = await messenger.nextMessage()
        if (!delivery) break
        try {
          const saved = await window.napp.eventStore.addPersonalCopy(wireEvent(delivery.message.event, owner), { context: `dm:${owner}` })
          if (!saved.result.ok) throw new Error('Fixture inbox persistence failed')
          await delivery.ack()
          delivered.push(delivery.message.event.content)
        } catch (error) { await delivery.nack(); throw error }
      }
    } while (redrain)
  })().finally(() => { draining = null })
  return draining
}

export const pendingProbe = {
  changes, delivered, errors,
  async start () {
    owner = await settlePermission(() => window.nostr.getPublicKey())
    await stop.ready
    const channel = adapter(window.nostr.withSharedKey(owner, 'pending-decryption-browser-v1'))
    messenger = await createPrivateMessenger({
      userSigner: adapter(window.nostr, true), useContentKeys: false,
      channels: [{ signer: channel, relays: ['wss://relay.44billion.net'], mode: 'leecher', offlineRecoverySeconds: 0 }],
      onMessageQueued: () => { if (messenger) drain().catch(error => errors.push(error.message)) },
      onError: error => errors.push(error.message)
    })
    await messenger.update({}, { waitForBackground: true })
    await drain()
  },
  async send (content) {
    return messenger.broadcastRumor({ receiverPubkeys: [owner], rumor: { kind: 9, created_at: Math.floor(Date.now() / 1000), tags: [], content } })
  },
  async count () { return (await messenger.pendingDecryption.records({ force: true })).length },
  async snapshot () {
    return { errors, delivered, changes, pending: (await messenger.pendingDecryption.records({ force: true })).map(({ code, macAttempts }) => ({ code, macAttempts })), inbox: await messenger.queue.getCapacity(), status: messenger.readStatus() }
  }
}
