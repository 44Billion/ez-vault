import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getAppIconMonogram } from '../docs/helpers/app-monogram.js'

test('builds deterministic monograms from app identity', () => {
  const first = getAppIconMonogram('jumble-1', 'Jumble')
  const second = getAppIconMonogram('jumble-1', 'Jumble')
  assert.deepEqual(first, second)
  assert.equal(first.label, 'JU')
  assert.ok(first.paletteIndex >= 0 && first.paletteIndex < 10)
})

test('falls back to a stable glyph and a deterministic palette without a name', () => {
  const monogram = getAppIconMonogram('abc123', '')
  assert.equal(monogram.label, '◈')
  assert.deepEqual(monogram, getAppIconMonogram('abc123', ''))
  assert.ok(monogram.paletteIndex >= 0 && monogram.paletteIndex < 10)
})
