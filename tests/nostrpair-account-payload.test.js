import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import {
  buildSyncAccountPayload
} from '../docs/services/nostrpair.js'
import {
  bytesToHex,
  nsecFromHex,
  npubFromPubkey
} from '../docs/helpers/nostr/index.js'

function nsecAccount () {
  const secretKey = generateSecretKey()
  const seckey = bytesToHex(secretKey)
  const pubkey = getPublicKey(secretKey)
  return {
    account: {
      type: 'nsec',
      pubkey,
      name: 'Azure Ember',
      picture: 'https://example.test/avatar.png',
      profileEvent: {
        kind: 0,
        pubkey,
        created_at: 20,
        tags: [['name', 'Azure Ember']],
        content: JSON.stringify({ name: 'Azure Ember', about: 'paired account' }),
        id: 'profile-id',
        sig: 'profile-sig'
      },
      relayListEvent: {
        kind: 10002,
        pubkey,
        created_at: 10,
        tags: [['r', 'wss://relay.example']],
        content: '',
        id: 'relay-id',
        sig: 'relay-sig'
      },
      writeRelays: ['wss://relay.example']
    },
    secretEntry: { type: 'nsec', pubkey, seckey }
  }
}

test('buildSyncAccountPayload carries self-contained account entries', () => {
  const { account, secretEntry } = nsecAccount()
  const payload = buildSyncAccountPayload([account], [secretEntry], { nsecFromHex, npubFromPubkey })

  assert.deepEqual(payload.accounts, [{
    type: 'nsec',
    value: nsecFromHex(secretEntry.seckey),
    pubkey: account.pubkey,
    profile: {
      name: 'Azure Ember',
      about: 'paired account',
      picture: 'https://example.test/avatar.png'
    }
  }])
})
