import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defineLocales,
  getLocale,
  getT,
  launcherLocale,
  resolveSupportedLocale,
  setLocale,
  subscribeLocaleChanged
} from '../docs/i18n/index.js'

const locales = defineLocales({
  Hello: ['Bonjour', 'Ciao', 'Hallo', 'Hola', 'Olá', 'Привет', '你好', '你好', 'こんにちは', '안녕하세요']
})

afterEach(() => setLocale('en'))

test('resolves the supported device-locale variants', () => {
  assert.equal(resolveSupportedLocale('pt-PT'), 'pt-BR')
  assert.equal(resolveSupportedLocale('zh-Hant-HK'), 'zh-TW')
  assert.equal(resolveSupportedLocale('zh-Hans-SG'), 'zh-CN')
  assert.equal(resolveSupportedLocale('invalid locale'), 'en')
})

test('uses exact launcher locales and the legacy language fallback', () => {
  assert.equal(launcherLocale('ja', 'en'), 'ja')
  assert.equal(launcherLocale(undefined, 'pt'), 'pt-BR')
  assert.equal(launcherLocale(undefined, 'en'), 'en')
  assert.throws(() => launcherLocale('xx', 'en'), /Unsupported locale/)
  assert.throws(() => launcherLocale('xx', 'xx'), /Unsupported locale/)
})

test('updates translators and subscriptions without duplicate notifications', () => {
  const t = getT(locales)
  const seen = []
  const unsubscribe = subscribeLocaleChanged(locale => seen.push(locale))
  setLocale('fr')
  setLocale('fr')
  assert.equal(getLocale(), 'fr')
  assert.equal(t('Hello'), 'Bonjour')
  assert.deepEqual(seen, ['fr'])
  unsubscribe()
  unsubscribe()
  setLocale('ja')
  assert.deepEqual(seen, ['fr'])
})

test('validates compact component-local catalogs', () => {
  assert.throws(() => defineLocales({ Broken: ['only one'] }), /should contain 10 values/)
  assert.equal(getT(locales, { locale: 'ko' })('Hello'), '안녕하세요')
})
