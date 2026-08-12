import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source (relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

test('lock control is a native fixed pill with inline Tabler SVG', () => {
  const component = source('src/components/vault-lock-button.js')

  assert.match(component, /extends HTMLElement/)
  assert.match(component, /ICON_LOCK = '<svg/)
  assert.match(component, /position: fixed/)
  assert.match(component, /bottom: 16px/)
  assert.match(component, /border-radius: 9999px/)
  assert.match(component, /is-pulsing/)
  assert.match(component, /subscribePendingMutations/)
  assert.match(component, /secrets\.isUnlocked\(\)/)
  assert.doesNotMatch(component, /from ['"]thenameisf['"]/)
  assert.doesNotMatch(component, /f-svg/)
})

test('main shell reserves scroll space and includes lock in feature coordination', () => {
  const html = source('src/index.html')
  const css = source('src/styles/index.css')
  const index = source('src/index.js')

  assert.match(html, /<vault-lock-button hidden><\/vault-lock-button>/)
  assert.match(css, /padding: 16px 16px 80px/)
  assert.match(index, /import\('\.\/components\/vault-lock-button\.js'\)/)
  assert.match(index, /toolbarButtons: \[createBtn, addBtn, syncBtn, lockButton\]/)
})

test('lock failure copy is fully translated and keeps expected errors specific', () => {
  const component = source('src/components/vault-lock-button.js')

  assert.match(component, /Could not lock vault/)
  assert.match(component, /A passkey is required to lock the vault\./)
  assert.match(component, /isExpectedPasskeyRegistrationFailure/)
  assert.match(component, /toast\.error/)
})
