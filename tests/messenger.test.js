import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signerRequestContext } from '../docs/services/messenger.js'

test('signerRequestContext extracts NIP-44 v3 kind and scope', () => {
  assert.deepEqual(
    signerRequestContext('nip44v3_encrypt', ['peer', '263', 'channel-pubkey', 'plain-b64']),
    { eventKind: 263, eventScope: 'channel-pubkey' }
  )
  assert.deepEqual(
    signerRequestContext('nip44v3_decrypt', ['peer', 3560, '', 'ciphertext']),
    { eventKind: 3560, eventScope: '' }
  )
  assert.deepEqual(
    signerRequestContext('nip44v3_encrypt_double_dh', ['peer', 263, 'channel-pubkey', 'plain-b64', 'content-pubkey']),
    { eventKind: 263, eventScope: 'channel-pubkey' }
  )
  assert.deepEqual(
    signerRequestContext('nip44v3_decrypt_double_dh', ['peer', '3560', '', 'ciphertext', 'peer-content', 'own-content']),
    { eventKind: 3560, eventScope: '' }
  )
})

test('signerRequestContext keeps event-kind context scoped to signer methods that expose it', () => {
  assert.deepEqual(
    signerRequestContext('sign_event', [{ kind: 1, content: 'hello' }]),
    { eventKind: 1 }
  )
  assert.deepEqual(
    signerRequestContext('double_sign_event', [{ kind: 30023, content: 'article' }]),
    { eventKind: 30023 }
  )
  assert.deepEqual(signerRequestContext('nip44_encrypt', ['peer', 'plain']), {})
})
