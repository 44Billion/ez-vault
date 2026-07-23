import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { getPublicKey } from 'libp2r2p/key'
import { deriveSignerSeckey } from '../docs/helpers/signer-key.js'
import { hexToBytes } from 'libp2r2p/base16'

if (!globalThis.crypto) globalThis.crypto = webcrypto

test('deriveSignerSeckey returns a deterministic valid scalar', async () => {
  const prfBytes = hexToBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')

  const seckey = await deriveSignerSeckey(prfBytes)

  assert.equal(seckey, '3181184e174d6c30ec7882d44f53579ab90eb35c46da6f0797b7063230d13fe2')
  assert.match(seckey, /^[0-9a-f]{64}$/)
  assert.match(getPublicKey(hexToBytes(seckey)), /^[0-9a-f]{64}$/)
  assert.equal(await deriveSignerSeckey(prfBytes), seckey)
})
