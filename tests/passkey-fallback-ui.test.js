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
  assert.match(dialog, /outside.*#settle\('local'\)/s)
  assert.match(dialog, /#onCancel[\s\S]*#settle\('local'\)/)
  assert.match(dialog, /If you plan to share this device/)
  assert.match(dialog, /Protect your account on this device/)
  assert.match(dialog, /usually uses biometrics or your device PIN/)
  assert.match(dialog, /Create passkey/)
  assert.match(dialog, /Recommended/)
  assert.match(dialog, /requestPomegranateProtectionChoice/)
  assert.match(dialog, /subscribeLocaleChanged/)
  assert.doesNotMatch(dialog, /from ['"]thenameisf['"]/)
  assert.doesNotMatch(dialog, /f-svg/)
})

test('destructive removals use local confirmation or fresh passkey verification', () => {
  const passkey = source('src/services/passkey.js')
  const accountAvatar = source('src/components/account-avatar.js')
  const trustedPanel = source('src/components/trusted-signers-panel.js')
  const deleteMethod = accountAvatar.slice(
    accountAvatar.indexOf('async #deleteAccount'),
    accountAvatar.indexOf('  async #copy (')
  )
  const removeSignerMethod = trustedPanel.slice(
    trustedPanel.indexOf('async #removeSigner'),
    trustedPanel.indexOf('  async #unlock')
  )
  const messengerLog = source('src/services/messenger-log/index.js')
  const contentKeys = source('src/services/secrets.js')

  assert.match(passkey, /return secrets\.discloseCurrentEntries\(\)/)
  assert.match(deleteMethod, /!protectedByPasskey && !window\.confirm/)
  assert.match(deleteMethod, /if \(protectedByPasskey\)[\s\S]*await passkey\.openSecrets\(\)/)
  assert.doesNotMatch(deleteMethod, /passkey\.ensureRegistered\(\)/)
  assert.match(deleteMethod, /reportAuthenticationFailure\(btn, 'delete-account'/)
  assert.match(removeSignerMethod, /!protectedByPasskey && !window\.confirm/)
  assert.match(removeSignerMethod, /if \(protectedByPasskey\)[\s\S]*await passkey\.openSecrets\(\)/)
  assert.doesNotMatch(removeSignerMethod, /passkey\.ensureRegistered\(\)/)
  assert.match(removeSignerMethod, /toast\.error\(t\('Authentication failed'\)\)/)
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
  assert.match(pomegranate, /settlePomegranateProtection/)
  assert.match(pomegranate, /preparePasskeyRegistration/)
  assert.match(pomegranate, /continueWithoutPasskey/)
  assert.match(syncHost, /protectionReady: this\.#protectionReady/)
  assert.match(syncJoiner, /protectionReady: true/)
})
