import { getCurrentDeviceLocale, getT as getBaseT, validateLocales } from 'libp2r2p/i18n'

export const SUPPORTED_LOCALES = Object.freeze([
  'en', 'fr', 'it', 'de', 'es', 'pt-BR', 'ru', 'zh-CN', 'zh-TW', 'ja', 'ko'
])
const TRANSLATED_LOCALES = SUPPORTED_LOCALES.slice(1)

const validation = Object.freeze({
  requiredLocales: SUPPORTED_LOCALES,
  referenceLocale: 'en',
  requireReferenceKey: true
})

function localeLanguage (locale) {
  try {
    return new Intl.Locale(locale).language
  } catch {
    return String(locale).split('-')[0].toLowerCase()
  }
}

export function resolveSupportedLocale (locale) {
  let canonical
  try {
    canonical = Intl.getCanonicalLocales(String(locale).replace(/_/g, '-'))[0]
  } catch {
    return 'en'
  }

  const exact = SUPPORTED_LOCALES.find(value => value.toLowerCase() === canonical.toLowerCase())
  if (exact) return exact

  const language = localeLanguage(canonical)
  if (language === 'zh') {
    try {
      const { script, region } = new Intl.Locale(canonical)
      return script === 'Hant' || ['TW', 'HK', 'MO'].includes(region) ? 'zh-TW' : 'zh-CN'
    } catch {
      return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/i.test(canonical) ? 'zh-TW' : 'zh-CN'
    }
  }

  return SUPPORTED_LOCALES.find(value => localeLanguage(value) === language) ?? 'en'
}

export function launcherLocale (locale, legacyLanguage) {
  if (locale !== undefined && locale !== null) {
    if (SUPPORTED_LOCALES.includes(locale)) return locale
    throw new RangeError(`Unsupported locale: ${locale}`)
  }
  if (legacyLanguage === 'pt') return 'pt-BR'
  if (legacyLanguage === 'en') return 'en'
  throw new RangeError(`Unsupported locale: ${locale ?? legacyLanguage}`)
}

let currentLocale = resolveSupportedLocale(getCurrentDeviceLocale())
const listeners = new Set()

function updateDocumentLanguage () {
  if (globalThis.document?.documentElement) document.documentElement.lang = currentLocale
}

updateDocumentLanguage()

export function getLocale () {
  return currentLocale
}

export function setLocale (locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) throw new RangeError(`Unsupported locale: ${locale}`)
  if (locale === currentLocale) return false
  currentLocale = locale
  updateDocumentLanguage()
  for (const listener of [...listeners]) {
    try { listener(locale) } catch (error) { console.error(error) }
  }
  return true
}

export function subscribeLocaleChanged (listener, { emitCurrent = false } = {}) {
  if (typeof listener !== 'function') throw new TypeError('listener should be a function')
  listeners.add(listener)
  if (emitCurrent) listener(currentLocale)
  let active = true
  return () => {
    if (!active) return
    active = false
    listeners.delete(listener)
  }
}

export function getT (locales, options = {}) {
  validateLocales(locales, validation)
  if (options.locale !== undefined) return getBaseT(locales, { ...options, validation })

  const translators = new Map()
  return (key, values) => {
    let translate = translators.get(currentLocale)
    if (!translate) {
      translate = getBaseT(locales, { ...options, locale: currentLocale })
      translators.set(currentLocale, translate)
    }
    return translate(key, values)
  }
}

// Keeps component-local catalogs compact while still producing the object
// shape validated and consumed by libp2r2p/i18n. Entries follow the locale
// order in SUPPORTED_LOCALES, excluding English because the key is English.
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
