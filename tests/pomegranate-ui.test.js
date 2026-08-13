import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source (relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

test('both account entry surfaces include the shared Google action', () => {
  const accountAdd = source('src/components/account-add.js')
  const createOverlay = source('src/components/create-overlay.js')

  assert.match(accountAdd, /<google-login-button><\/google-login-button>/)
  assert.match(accountAdd, /class="add-method-separator"/)
  assert.match(accountAdd, /t\('Or'\)/)
  assert.match(createOverlay, /<google-login-button><\/google-login-button>/)
  assert.match(createOverlay, /bottom:\s*16px/)
  assert.match(createOverlay, /subscribePomegranateBusy/)
  assert.match(createOverlay, /pomegranate-account-added/)
  assert.match(createOverlay, /#closeAfterCreation/)
  assert.match(createOverlay, /data-pomegranate-busy/)
  assert.match(createOverlay, /\.create-main/)
})

test('Google action uses the Tabler component, shared busy pulse and toast path', () => {
  const button = source('src/components/google-login-button.js')

  assert.match(button, /M20\.945 11a9 9/)
  assert.match(button, /extends HTMLElement/)
  assert.doesNotMatch(button, /from ['"]thenameisf['"]/)
  assert.doesNotMatch(button, /f-svg/)
  assert.match(button, /continueWithGoogle/)
  assert.match(button, /subscribePomegranateBusy/)
  assert.match(button, /pulsate/)
  assert.match(button, /toast\.error/)
  assert.match(button, /POMEGRANATE_CANCELLED/)
  assert.match(button, /POMEGRANATE_POPUP_TIMEOUT/)
  assert.match(button, /Google sign-in timed out/)
  const protection = source('src/components/passkey-fallback-dialog.js')
  assert.match(protection, /data-purpose="pomegranate"/)
  assert.match(protection, /passkey-recommended-badge/)
  assert.match(protection, /Protect your account on this device/)
})

test('bunker copy stays behind the vault disclosure gate and uses the pairing constructor', () => {
  const avatar = source('src/components/account-avatar.js')
  const pairing = source('src/services/nostrpair.js')

  assert.match(avatar, /await passkey\.openSecrets\(\)/)
  assert.match(avatar, /buildBunkerBackupUrl/)
  assert.match(pairing, /buildBunkerBackupUrl/)
})
