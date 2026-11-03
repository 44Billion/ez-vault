import assert from 'node:assert/strict'
import { test } from 'node:test'
import { debugEnabledForWindow } from '../src/helpers/diagnostics-mode.js'

function windowFixture (search, { topLevel = false, topThrows = false } = {}) {
  const top = {}
  const current = {
    location: { search },
    get top () {
      if (topThrows) throw new Error('cross-origin')
      return topLevel ? current : top
    }
  }
  return current
}

test('top-level vault keeps debug mode enabled without a query parameter', () => {
  assert.equal(debugEnabledForWindow(windowFixture('', { topLevel: true })), true)
})

test('embedded vault enables debug mode only with the exact opt-in query', () => {
  assert.equal(debugEnabledForWindow(windowFixture('?debug=1')), true)
  assert.equal(debugEnabledForWindow(windowFixture('?debug=true')), false)
  assert.equal(debugEnabledForWindow(windowFixture('?diagnostics=1')), false)
  assert.equal(debugEnabledForWindow(windowFixture('?other=1')), false)
})

test('cross-origin parent access falls back to the query decision', () => {
  assert.equal(debugEnabledForWindow(windowFixture('?debug=1', { topThrows: true })), true)
  assert.equal(debugEnabledForWindow(windowFixture('', { topThrows: true })), false)
})
