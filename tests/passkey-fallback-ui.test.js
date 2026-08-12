import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source (relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

test('passkey fallback is a native modal with explicit security choices', () => {
  const dialog = source('src/components/passkey-fallback-dialog.js')

  assert.match(dialog, /extends HTMLElement/)
  assert.match(dialog, /<dialog/)
  assert.match(dialog, /showModal\(\)/)
  assert.match(dialog, /data-choice="retry"/)
  assert.match(dialog, /data-choice="local"/)
  assert.match(dialog, /getBoundingClientRect\(\)/)
  assert.match(dialog, /outside.*#settle\('cancel'\)/s)
  assert.match(dialog, /Anyone who can read this device’s site data/)
  assert.match(dialog, /subscribeLocaleChanged/)
  assert.doesNotMatch(dialog, /from ['"]thenameisf['"]/)
  assert.doesNotMatch(dialog, /f-svg/)
})

test('local copy and frequent background writes do not initiate passkey registration', () => {
  const passkey = source('src/services/passkey.js')
  const accountAvatar = source('src/components/account-avatar.js')
  const messengerLog = source('src/services/messenger-log/index.js')
  const contentKeys = source('src/services/secrets.js')

  assert.match(passkey, /return secrets\.discloseCurrentEntries\(\)/)
  assert.match(accountAvatar, /if \(!passkey\.isUnprotectedLocalVault\(\)\) await passkey\.ensureRegistered\(\)/)
  assert.doesNotMatch(messengerLog, /ensureRegistered/)
  assert.doesNotMatch(contentKeys, /ensureRegistered/)
})

test('flows that settle protection before remote effects do not retry it during commit', () => {
  const intake = source('src/services/account-intake.js')
  const accountAdd = source('src/components/account-add.js')
  const pomegranate = source('src/services/pomegranate.js')
  const syncHost = source('src/components/sync/sync-host.js')
  const syncJoiner = source('src/components/sync/sync-joiner.js')

  assert.match(intake, /!protectionReady.*ensureRegistered\(\)/)
  assert.match(accountAdd, /commitPrepared\(\[prepared\], \{ protectionReady \}\)/)
  assert.match(pomegranate, /_commitPrepared\(\[prepared\], \{ protectionReady \}\)/)
  assert.match(syncHost, /protectionReady: this\.#protectionReady/)
  assert.match(syncJoiner, /protectionReady: true/)
})
