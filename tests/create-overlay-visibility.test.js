import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldShowCreateOverlay } from '../docs/helpers/create-overlay-visibility.js'

test('shows the create overlay only with no visible accounts and no locked pending mutation', () => {
  assert.equal(shouldShowCreateOverlay([], false, false), true)
  assert.equal(shouldShowCreateOverlay([], true, false), false)
  assert.equal(shouldShowCreateOverlay([], true, true), true)
  assert.equal(shouldShowCreateOverlay([{ type: 'npub' }], false, false), false)
  assert.equal(shouldShowCreateOverlay([{ type: 'nsec' }], false, true), false)
  assert.equal(shouldShowCreateOverlay([{ type: 'nsec' }], true, true), false)
  assert.equal(shouldShowCreateOverlay([{ type: 'nsec' }, { type: 'npub' }], false, false), false)
})
