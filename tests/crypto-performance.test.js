import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordCryptoPerformance } from '../src/services/crypto-performance.js'

test('crypto performance remains in memory unless the vault console trace is enabled', () => {
  const previousDevelopment = globalThis.IS_DEVELOPMENT
  const previousTrace = globalThis.__EZ_VAULT_PERFORMANCE_TRACE__
  const previousDebug = console.debug
  const records = []
  globalThis.IS_DEVELOPMENT = true
  delete globalThis.__EZ_VAULT_PERFORMANCE_TRACE__
  console.debug = value => records.push(JSON.parse(value.slice('[messaging-performance] '.length)))
  try {
    recordCryptoPerformance({ stage: 'nip44v3-cache', cacheHit: true, count: 2, durationMs: 0.25 })
    assert.deepEqual(records, [])

    globalThis.__EZ_VAULT_PERFORMANCE_TRACE__ = true
    recordCryptoPerformance({ stage: 'nip44v3-cache', cacheHit: false, count: 3, durationMs: 0.5, ciphertext: 'private' })
    assert.deepEqual(records, [{ stage: 'nip44v3-cache', cacheHit: false, count: 3, durationMs: 0.5 }])

    globalThis.IS_DEVELOPMENT = false
    recordCryptoPerformance({ stage: 'double-dh-cache', cacheHit: true, count: 1, durationMs: 0.1 })
    assert.equal(records.length, 1)
  } finally {
    console.debug = previousDebug
    if (previousDevelopment === undefined) delete globalThis.IS_DEVELOPMENT
    else globalThis.IS_DEVELOPMENT = previousDevelopment
    if (previousTrace === undefined) delete globalThis.__EZ_VAULT_PERFORMANCE_TRACE__
    else globalThis.__EZ_VAULT_PERFORMANCE_TRACE__ = previousTrace
  }
})
