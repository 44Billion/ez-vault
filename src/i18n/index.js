import {
  createI18n,
  getT,
  provideI18n
} from 'thenameisf/i18n'

export const SUPPORTED_LOCALES = Object.freeze([
  'en', 'fr', 'it', 'de', 'es', 'pt-BR', 'ru', 'zh-CN', 'zh-TW', 'ja', 'ko'
])
const TRANSLATED_LOCALES = SUPPORTED_LOCALES.slice(1)

export const i18n = createI18n({
  supportedLocales: SUPPORTED_LOCALES,
  fallbackLocale: 'en',
  validation: {
    requiredLocales: 'supported',
    referenceLocale: 'en',
    requireReferenceKey: true
  },
  browser: {
    syncDocumentLanguage: true
  }
})

// This vanilla application intentionally owns one provider for the full page
// lifetime. Components keep their explicit subscriptions for DOM updates.
provideI18n(i18n)

export const resolveSupportedLocale = i18n.resolveLocale
export const getLocale = i18n.getLocale
export const subscribeLocaleChanged = i18n.subscribeLocaleChanged

export function launcherLocale (locale, legacyLanguage) {
  if (locale !== undefined && locale !== null) {
    if (SUPPORTED_LOCALES.includes(locale)) return locale
    throw new RangeError(`Unsupported locale: ${locale}`)
  }
  if (legacyLanguage === 'pt') return 'pt-BR'
  if (legacyLanguage === 'en') return 'en'
  throw new RangeError(`Unsupported locale: ${locale ?? legacyLanguage}`)
}

export function setLocale (locale) {
  const previous = getLocale()
  i18n.setLocale(locale)
  return getLocale() !== previous
}

// Keeps component-local catalogs compact. Entries follow the locale order in
// SUPPORTED_LOCALES, excluding English because the key itself is English.
export function defineLocales (entries) {
  return Object.fromEntries(Object.entries(entries).map(([key, translations]) => {
    if (!Array.isArray(translations) || translations.length !== TRANSLATED_LOCALES.length) {
      throw new TypeError(`translations for "${key}" should contain ${TRANSLATED_LOCALES.length} values`)
    }
    return [key, {
      en: key,
      ...Object.fromEntries(TRANSLATED_LOCALES.map((locale, index) => [locale, translations[index]]))
    }]
  }))
}

export { getT }
