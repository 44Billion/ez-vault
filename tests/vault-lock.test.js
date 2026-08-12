import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lockAndCloseVault } from '../src/services/vault-lock.js'

function dependencies (steps, overrides = {}) {
  return {
    _requirePasskey: async () => { steps.push('require-passkey') },
    _lock: () => { steps.push('lock') },
    _publishAccountsState: () => { steps.push('publish-locked-state') },
    _requestVaultClose: async () => { steps.push('close') },
    ...overrides
  }
}

test('manual lock publishes the locked state before requesting close', async () => {
  const steps = []

  await lockAndCloseVault(dependencies(steps))

  assert.deepEqual(steps, ['require-passkey', 'lock', 'publish-locked-state', 'close'])
})

test('failed passkey promotion leaves the vault open and unlocked', async () => {
  const steps = []
  const failure = Object.assign(new Error('Cancelled'), { name: 'NotAllowedError' })

  await assert.rejects(lockAndCloseVault(dependencies(steps, {
    _requirePasskey: async () => {
      steps.push('require-passkey')
      throw failure
    }
  })), failure)

  assert.deepEqual(steps, ['require-passkey'])
})

test('a failure publishing state never requests close or reverses the lock', async () => {
  const steps = []
  const failure = new Error('publish failed')

  await assert.rejects(lockAndCloseVault(dependencies(steps, {
    _publishAccountsState: () => {
      steps.push('publish-locked-state')
      throw failure
    }
  })), failure)

  assert.deepEqual(steps, ['require-passkey', 'lock', 'publish-locked-state'])
})
