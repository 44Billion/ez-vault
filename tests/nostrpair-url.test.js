import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNostrpairUrl,
  parseNostrpairInput,
  extractBunkerClientKey,
  buildBunkerUrlWithClientKey
} from '../docs/helpers/nostrpair-url.js'

const PUBKEY = 'a'.repeat(64)
const RELAY = 'wss://relay.44billion.net'
const SECRET = 'deadbeefcafef00d'

test('buildNostrpairUrl and parseNostrpairInput roundtrip', () => {
  const url = buildNostrpairUrl({ pubkey: PUBKEY, relay: RELAY, secret: SECRET })
  assert.ok(url.startsWith(`nostrpair://${PUBKEY}`))
  const parsed = parseNostrpairInput(url)
  assert.equal(parsed.pubkey, PUBKEY)
  assert.equal(parsed.relay, RELAY)
  assert.equal(parsed.secret, SECRET)
})

test('parseNostrpairInput accepts URLs without a secret', () => {
  const url = buildNostrpairUrl({ pubkey: PUBKEY, relay: RELAY })
  const parsed = parseNostrpairInput(url)
  assert.equal(parsed.secret, '')
})

test('parseNostrpairInput tolerates a hex pubkey starting with a digit', () => {
  // URL parsers stash this in url.pathname, not url.hostname, because the
  // host can't start with a digit-only label in some implementations. The
  // helper has to look in both places.
  const numericPub = '1' + 'a'.repeat(63)
  const url = `nostrpair://${numericPub}?relay=${encodeURIComponent(RELAY)}`
  const parsed = parseNostrpairInput(url)
  assert.equal(parsed.pubkey, numericPub)
})

test('parseNostrpairInput rejects wrong protocol, missing relay, bad pubkey', () => {
  assert.throws(() => parseNostrpairInput('bunker://' + PUBKEY + '?relay=' + RELAY))
  assert.throws(() => parseNostrpairInput('nostrpair://' + PUBKEY))
  assert.throws(() => parseNostrpairInput('nostrpair://abc?relay=' + RELAY))
  assert.throws(() => parseNostrpairInput('not a url'))
})

test('extractBunkerClientKey pulls the client_key fragment off a bunker URL', () => {
  const clientKey = 'b'.repeat(64)
  const original = `bunker://${PUBKEY}?relay=${encodeURIComponent(RELAY)}`
  const tagged = buildBunkerUrlWithClientKey(original, clientKey)
  const { url: cleaned, clientKey: extracted } = extractBunkerClientKey(tagged)
  assert.equal(extracted, clientKey)
  assert.ok(!cleaned.includes('#'))
  assert.equal(cleaned, original)
})

test('extractBunkerClientKey returns null for URLs without the fragment', () => {
  const original = `bunker://${PUBKEY}?relay=${encodeURIComponent(RELAY)}`
  const { url, clientKey } = extractBunkerClientKey(original)
  assert.equal(clientKey, null)
  assert.equal(url, original)
})

test('extractBunkerClientKey rejects malformed client_key values', () => {
  const url = `bunker://${PUBKEY}?relay=${encodeURIComponent(RELAY)}#client_key=not-hex`
  const { clientKey } = extractBunkerClientKey(url)
  assert.equal(clientKey, null)
})

test('extractBunkerClientKey ignores non-bunker URLs', () => {
  const url = `nostrpair://${PUBKEY}?relay=${encodeURIComponent(RELAY)}#client_key=${'b'.repeat(64)}`
  const { clientKey } = extractBunkerClientKey(url)
  assert.equal(clientKey, null)
})
