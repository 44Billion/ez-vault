import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getT } from '../src/i18n/index.js'
import { swUpdateLocales } from '../src/i18n/sw-update.js'
import { inlineBootFiles } from '../bin/inline-boot-files.js'

const projectUrl = new URL('../', import.meta.url)
const html = await readFile(new URL('src/index.html', projectUrl), 'utf8')
const swSource = await readFile(new URL('src/sw.src.js', projectUrl), 'utf8')
const bootFailsafeCss = await readFile(new URL('src/boot-failsafe.css', projectUrl), 'utf8')
const bootFailsafeJs = await readFile(new URL('src/boot-failsafe.js', projectUrl), 'utf8')
const swBootstrapJs = await readFile(new URL('src/sw-bootstrap.js', projectUrl), 'utf8')
const builtHtml = inlineBootFiles(html, { bootFailsafeCss, bootFailsafeJs, swBootstrapJs })

test('index.html no longer ships an importmap and loads the bundled entry', () => {
  assert.doesNotMatch(html, /type=["']importmap["']/)
  assert.doesNotMatch(html, /ga\.jspm\.io/)
  assert.match(html, /<script\s+type="module"\s+src="\.\/app\.js"><\/script>/)
})

test('index.html contains the non-dismissible update banner shell', () => {
  assert.match(html, /id="update-banner"/)
  assert.match(html, /id="update-banner-apply"/)
})

test('index.html keeps boot files as build markers instead of inline code', () => {
  assert.match(html, /id="boot-failed-overlay"/)
  assert.match(html, /data-boot-failed-reload/)
  assert.match(html, /data-boot-failed-message/)
  assert.match(html, /<!-- inject:boot-failsafe-css -->/)
  assert.match(html, /<!-- inject:boot-failsafe-js -->/)
  assert.match(html, /<!-- inject:sw-bootstrap-js -->/)
  // The authored files are the single source of the boot logic.
  assert.doesNotMatch(html, /ezVaultBootAutoReloaded|navigator\.serviceWorker\.register/)
})

test('build inlines the boot failsafe with a single automatic reload', () => {
  assert.match(builtHtml, /id="boot-failed-overlay"/)
  assert.match(builtHtml, /ezVaultBootAutoReloaded/)
  assert.match(builtHtml, /BOOT_TIMEOUT_MS\s*=\s*12000/)
  assert.match(builtHtml, /if \(!storageGet\(\)\)/)
  // Exactly two reloads: the guarded automatic one and the manual overlay
  // button — never an unguarded reload loop.
  assert.equal((builtHtml.match(/window\.location\.reload\(\)/g) || []).length, 2)
  assert.doesNotMatch(builtHtml, /<!-- inject:/)
})

test('build inlines the service worker registration before the module graph', () => {
  assert.match(builtHtml, /navigator\.serviceWorker\.register\('\.\/sw\.js',\s*\{\s*updateViaCache:\s*'none'\s*\}\)/)
  assert.match(builtHtml, /isLocalhost/)
  const registerIndex = builtHtml.indexOf("navigator.serviceWorker.register('./sw.js'")
  const moduleIndex = builtHtml.indexOf('<script type="module" src="./app.js">')
  assert.ok(registerIndex !== -1 && moduleIndex !== -1)
  assert.ok(registerIndex < moduleIndex)
})

test('boot files avoid var in favor of const/let', () => {
  assert.doesNotMatch(bootFailsafeJs, /\bvar\b/)
  assert.doesNotMatch(swBootstrapJs, /\bvar\b/)
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
