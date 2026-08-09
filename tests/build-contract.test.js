import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getT } from '../src/i18n/index.js'
import { swUpdateLocales } from '../src/i18n/sw-update.js'

const projectUrl = new URL('../', import.meta.url)
const html = await readFile(new URL('src/index.html', projectUrl), 'utf8')
const swSource = await readFile(new URL('src/sw.src.js', projectUrl), 'utf8')

test('index.html no longer ships an importmap and loads the bundled entry', () => {
  assert.doesNotMatch(html, /type=["']importmap["']/)
  assert.doesNotMatch(html, /ga\.jspm\.io/)
  assert.match(html, /<script\s+type="module"\s+src="\.\/app\.js"><\/script>/)
})

test('index.html contains the non-dismissible update banner shell', () => {
  assert.match(html, /id="update-banner"/)
  assert.match(html, /id="update-banner-apply"/)
})

test('index.html links the favicon that the passkey icon helper fetches', () => {
  assert.match(html, /rel="icon"[^>]*href="\.\/favicon\.png"/)
})

test('service worker source uses build-injected version and deploy hashes', () => {
  assert.match(swSource, /\bLAUNCHER_SW_VERSION\b/)
  assert.match(swSource, /\bLAUNCHER_DEPLOY_HASH\b/)
  assert.match(swSource, /SKIP_WAITING/)
})

test('sw update locales cover every supported language', () => {
  const t = getT(swUpdateLocales)
  assert.equal(t('Update available'), 'Update available')
  assert.equal(getT(swUpdateLocales, { locale: 'pt-BR' })('Update available'), 'Atualização disponível')
  assert.equal(getT(swUpdateLocales, { locale: 'ja' })('Update'), '更新')
})
