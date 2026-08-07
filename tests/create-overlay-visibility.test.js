import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldShowCreateOverlay } from '../docs/helpers/create-overlay-visibility.js'

test('shows the create overlay only with no visible accounts and no pending unlock', () => {
  assert.equal(shouldShowCreateOverlay([], false), true)
  assert.equal(shouldShowCreateOverlay([], true), false)
  assert.equal(shouldShowCreateOverlay([{ type: 'npub' }], false), false)
  assert.equal(shouldShowCreateOverlay([{ type: 'nsec' }], false), false)
  assert.equal(shouldShowCreateOverlay([{ type: 'nsec' }, { type: 'npub' }], false), false)
})
