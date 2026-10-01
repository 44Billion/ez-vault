import test from 'node:test'
import assert from 'node:assert/strict'
import { finalizeEvent } from 'libp2r2p/event'
import { getPublicKey, npubFromPubkey, nsecFromHex } from 'libp2r2p/key'
import { accountForLauncher, applyAccountEvents } from '../src/services/messenger.js'
import { resolveMetadata } from '../src/services/account-intake.js'
import { buildSyncAccountPayload } from '../src/services/nostrpair.js'
import * as store from '../src/services/accounts-store.js'

const secret = new Uint8Array(32).fill(4)
const pubkey = getPublicKey(secret)
const profile = { name: 'Paired', picture: 'https://example.test/photo', about: 'Preserved biography' }
const signed = (kind = 0, createdAt = 0, key = secret) => finalizeEvent({ kind, created_at: createdAt, tags: [], content: JSON.stringify(profile) }, key)
const placeholder = { kind: 0, pubkey, created_at: 0, tags: [], content: JSON.stringify(profile) }

for (const legacy of [false, true]) {
  test(`provisional profile survives launcher and pairing export without signed metadata (legacy=${legacy})`, () => {
    const account = { type: 'npub', pubkey, ...(legacy ? { profileEvent: placeholder } : profile) }
    const snapshot = accountForLauncher(account)
    assert.deepEqual(snapshot.profile, { ...profile, npub: npubFromPubkey(pubkey), meta: { events: [] } })
    assert.deepEqual(buildSyncAccountPayload([account], [], { npubFromPubkey, nsecFromHex }).accounts[0].profile, profile)
    assert.equal(account.profileEvent, legacy ? placeholder : undefined)
  })
}

test('metadata export rejects invalid signatures, owners and kinds but accepts signed timestamp zero', () => {
  for (const event of [{ ...signed(), sig: '0'.repeat(128) }, signed(0, 1, new Uint8Array(32).fill(5)), signed(1)]) {
    const account = { type: 'npub', pubkey, ...profile, profileEvent: event, relayListEvent: event }
    assert.deepEqual(accountForLauncher(account).profile.meta.events, [])
    assert.deepEqual(accountForLauncher(account).relays.meta.events, [])
  }
  const event = signed()
  assert.deepEqual(accountForLauncher({ type: 'npub', pubkey, profileEvent: event }).profile.meta.events, [event])
})

test('real metadata replaces a legacy placeholder at timestamp zero and untrusted updates are ignored', async () => {
  await store.add({ type: 'npub', pubkey, profileEvent: placeholder })
  assert.equal(await applyAccountEvents(pubkey, [{ ...signed(), sig: '0'.repeat(128) }, signed(0, 1, new Uint8Array(32).fill(5))]), false)
  const event = signed()
  assert.equal(await applyAccountEvents(pubkey, [event]), true)
  assert.deepEqual(store.get(pubkey).profileEvent, event)
  assert.equal(store.get(pubkey).about, profile.about)
})

test('intake ignores invalid fetched metadata and retains paired presentation', async () => {
  const result = await resolveMetadata(pubkey, {
    pairedProfile: profile,
    _fetchLatestProfile: async () => placeholder,
    _fetchRelayListEvent: async () => signed(10002, 1, new Uint8Array(32).fill(5))
  })
  assert.equal(result.profileEvent, undefined)
  assert.equal(result.relayListEvent, undefined)
  for (const key of Object.keys(profile)) assert.equal(result[key], profile[key])
})
