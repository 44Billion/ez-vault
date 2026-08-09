import test from 'node:test'
import assert from 'node:assert/strict'
import { resetVaultView, setVaultViewShell } from '../src/services/view-state.js'

function classList () {
  const values = new Set(['is-active'])
  return {
    contains: value => values.has(value),
    remove: value => values.delete(value)
  }
}

test('resetVaultView delegates teardown to every owning flow and restores toolbar state', () => {
  const calls = []
  const buttons = [
    { disabled: true, classList: classList() },
    { disabled: true, classList: classList() },
    { disabled: true, classList: classList() }
  ]
  const creating = {
    querySelector: selector => selector.includes('cancel-create')
      ? { click: () => calls.push('cancel-create') }
      : null
  }
  const editing = {
    querySelector: selector => selector.includes('cancel-edit')
      ? { click: () => calls.push('cancel-edit') }
      : null
  }
  const list = {
    querySelectorAll: selector => selector.includes('creating') ? [creating] : [editing],
    exitSelectionMode: () => calls.push('exit-selection')
  }
  const addPanel = {
    querySelector: () => ({ click: () => calls.push('cancel-add') })
  }
  const syncPanel = {
    close: () => calls.push('close-sync')
  }

  setVaultViewShell({ list, addPanel, syncPanel, toolbarButtons: buttons })
  resetVaultView()

  assert.deepEqual(calls, [
    'cancel-add',
    'close-sync',
    'cancel-create',
    'cancel-edit',
    'exit-selection'
  ])
  for (const button of buttons) {
    assert.equal(button.disabled, false)
    assert.equal(button.classList.contains('is-active'), false)
  }
})
