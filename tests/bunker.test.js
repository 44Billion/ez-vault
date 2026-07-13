import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripBunkerSecret } from '../docs/services/bunker.js'

const PUBKEY = 'a'.repeat(64)

test('bunker URL cleanup keeps the relay pointer while dropping only its one-use secret', () => {
  const url = `bunker://${PUBKEY}?relay=wss%3A%2F%2Fone.example&relay=wss%3A%2F%2Ftwo.example&secret=one-use#client_key=local`

  assert.equal(
    stripBunkerSecret(url),
    `bunker://${PUBKEY}?relay=wss%3A%2F%2Fone.example&relay=wss%3A%2F%2Ftwo.example#client_key=local`
  )
  assert.equal(stripBunkerSecret('https://example.com/?secret=keep'), 'https://example.com/?secret=keep')
})
