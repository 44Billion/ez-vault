import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as accountStatus from '../src/services/account-status.js'
import { probeBunkerAccount } from '../src/services/profile-rehydrator.js'

test('a failed bunker probe stays marked until a later probe succeeds', async () => {
  const account = { type: 'bunker', pubkey: 'a'.repeat(64) }

  await assert.rejects(probeBunkerAccount(account, {
    _getHandle: () => ({
      getPublicKey: async () => { throw new Error('NIP46_REQUEST_TIMEOUT') }
    })
  }), /NIP46_REQUEST_TIMEOUT/)
  assert.equal(accountStatus.get(account.pubkey)?.error, 'NIP46_REQUEST_TIMEOUT')

  assert.equal(await probeBunkerAccount(account, {
    _getHandle: () => ({ getPublicKey: async () => account.pubkey })
  }), account.pubkey)
  assert.equal(accountStatus.get(account.pubkey), null)
})

test('a locked bunker account is not marked as a connectivity failure', async () => {
  const account = { type: 'bunker', pubkey: 'b'.repeat(64) }
  assert.equal(await probeBunkerAccount(account, { _getHandle: () => null }), null)
  assert.equal(accountStatus.get(account.pubkey), null)
})
