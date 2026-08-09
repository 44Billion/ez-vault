// node_modules/thenameisf/shared/validation-error.js
var ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;
var ValidationError = class extends Error {
  constructor(code, messageOrOptions = code, causeOrOptions) {
    if (typeof code !== "string" || !ERROR_CODE.test(code)) {
      throw new TypeError("Validation error code should be uppercase snake case");
    }
    const objectOptions = messageOrOptions && typeof messageOrOptions === "object" ? messageOrOptions : null;
    const message = objectOptions === messageOrOptions ? objectOptions.message ?? code : messageOrOptions ?? code;
    const cause = objectOptions ? objectOptions.cause : causeOrOptions && typeof causeOrOptions === "object" && Object.hasOwn(causeOrOptions, "cause") ? causeOrOptions.cause : causeOrOptions;
    super(message, cause === void 0 ? void 0 : { cause });
    Object.defineProperty(this, "name", {
      configurable: true,
      value: "ValidationError",
      writable: true
    });
    Object.defineProperty(this, "code", {
      configurable: false,
      enumerable: true,
      value: code,
      writable: false
    });
  }
};

// node_modules/thenameisf/i18n/translator.js
var DEFAULT_LOCALE = "en";
var INTERPOLATION_RE = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;
function assertLocales(locales) {
  if (!locales || typeof locales !== "object" || Array.isArray(locales)) {
    throw new ValidationError("INVALID_LOCALES", { message: "locales should be an object" });
  }
}
function placeholderSignature(value) {
  return [...String(value).matchAll(INTERPOLATION_RE)].map((match) => match[1]).sort().join(",");
}
function validateTranslationValue(key, locale, value, expectedPlaceholders) {
  if (typeof value === "string") {
    if (placeholderSignature(value) !== expectedPlaceholders) {
      throw new ValidationError("I18N_PLACEHOLDER_MISMATCH", { message: `placeholder mismatch for "${key}" (${locale})` });
    }
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.other !== "string") {
    throw new ValidationError("INVALID_TRANSLATION", { message: `translation for "${key}" (${locale}) should be a string or plural object with an other form` });
  }
  for (const form of Object.values(value)) {
    if (typeof form !== "string") {
      throw new ValidationError("INVALID_PLURAL_TRANSLATION", { message: `plural forms for "${key}" (${locale}) should be strings` });
    }
    if (placeholderSignature(form) !== expectedPlaceholders) {
      throw new ValidationError("I18N_PLACEHOLDER_MISMATCH", { message: `placeholder mismatch for "${key}" (${locale})` });
    }
  }
}
function localeSetSignature(translations) {
  return Object.keys(translations).sort().join("\0");
}
function validateLocales(locales, options = {}) {
  assertLocales(locales);
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new ValidationError("INVALID_I18N_VALIDATION_OPTIONS", { message: "validation options should be an object" });
  }
  const {
    requiredLocales = [],
    referenceLocale = DEFAULT_LOCALE,
    requireReferenceKey = false,
    requireConsistentLocales = false
  } = options;
  if (!Array.isArray(requiredLocales) || requiredLocales.some((locale) => typeof locale !== "string" || !locale)) {
    throw new ValidationError("INVALID_REQUIRED_LOCALES", { message: "requiredLocales should be an array of non-empty strings" });
  }
  if (typeof referenceLocale !== "string" || !referenceLocale) {
    throw new ValidationError("INVALID_REFERENCE_LOCALE", { message: "referenceLocale should be a non-empty string" });
  }
  if (typeof requireReferenceKey !== "boolean" || typeof requireConsistentLocales !== "boolean") {
    throw new ValidationError("INVALID_I18N_VALIDATION_OPTIONS", { message: "validation flags should be booleans" });
  }
  let expectedLocaleSet;
  for (const [key, translations] of Object.entries(locales)) {
    if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
      throw new ValidationError("INVALID_TRANSLATIONS", { message: `translations for "${key}" should be an object` });
    }
    if (requireConsistentLocales) {
      const localeSet = localeSetSignature(translations);
      expectedLocaleSet ??= localeSet;
      if (localeSet !== expectedLocaleSet) {
        throw new ValidationError("INCONSISTENT_TRANSLATION_LOCALES", { message: `translations for "${key}" use a different locale set` });
      }
    }
    for (const locale of requiredLocales) {
      if (!Object.prototype.hasOwnProperty.call(translations, locale)) {
        throw new ValidationError("MISSING_TRANSLATION", { message: `missing translation for "${key}" (${locale})` });
      }
    }
    const expectedPlaceholders = placeholderSignature(key);
    for (const [locale, value] of Object.entries(translations)) {
      validateTranslationValue(key, locale, value, expectedPlaceholders);
    }
    if (requireReferenceKey) {
      if (!Object.prototype.hasOwnProperty.call(translations, referenceLocale)) {
        throw new ValidationError("MISSING_REFERENCE_TRANSLATION", { message: `missing reference translation for "${key}" (${referenceLocale})` });
      }
      const reference = translations[referenceLocale];
      const referenceValue = typeof reference === "string" ? reference : reference.other;
      if (referenceValue !== key) {
        throw new ValidationError("REFERENCE_TRANSLATION_MISMATCH", { message: `reference translation should match key "${key}" (${referenceLocale})` });
      }
    }
  }
  return locales;
}
function canonicalizeLocale(locale) {
  if (typeof locale !== "string" || !locale.trim()) return null;
  const value = locale.trim().replace(/_/g, "-");
  try {
    return Intl.getCanonicalLocales(value)[0] ?? null;
  } catch {
    return null;
  }
}
function getIntlLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return null;
  }
}
function getNavigator() {
  try {
    return globalThis.navigator;
  } catch {
    return null;
  }
}
function getCurrentDeviceLocale() {
  const navigator = getNavigator();
  const candidates = [
    getIntlLocale(),
    navigator?.language,
    navigator?.languages?.[0],
    DEFAULT_LOCALE
  ];
  for (const candidate of candidates) {
    const locale = canonicalizeLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
function localeLanguage(locale) {
  try {
    return new Intl.Locale(locale).language;
  } catch {
    return locale.split("-")[0].toLowerCase();
  }
}
function preferredChineseLocale(locale) {
  if (localeLanguage(locale) !== "zh") return null;
  try {
    const { script, region } = new Intl.Locale(locale);
    if (script === "Hant" || ["TW", "HK", "MO"].includes(region)) return "zh-TW";
    return "zh-CN";
  } catch {
    return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/i.test(locale) ? "zh-TW" : "zh-CN";
  }
}
function canonicalLocaleEntries(locales, code = "INVALID_SUPPORTED_LOCALES") {
  if (!Array.isArray(locales) || locales.length === 0) {
    throw new ValidationError(code, { message: "supportedLocales should be a non-empty array" });
  }
  const entries = locales.map((value) => {
    const canonical = canonicalizeLocale(value);
    if (!canonical) {
      throw new ValidationError(code, { message: "supportedLocales should contain valid locale strings" });
    }
    return { canonical, value };
  });
  const unique = new Set(entries.map(({ canonical }) => canonical.toLowerCase()));
  if (unique.size !== entries.length) {
    throw new ValidationError(code, { message: "supportedLocales should not contain duplicate locales" });
  }
  return entries;
}
function resolveLocale(locale, {
  supportedLocales,
  fallbackLocale = DEFAULT_LOCALE
} = {}) {
  const fallback = canonicalizeLocale(fallbackLocale) ?? DEFAULT_LOCALE;
  const requested = canonicalizeLocale(locale) ?? fallback;
  if (supportedLocales === void 0) return requested;
  const entries = canonicalLocaleEntries(supportedLocales);
  const byCanonical = new Map(entries.map((entry) => [entry.canonical.toLowerCase(), entry]));
  const find = (candidate) => {
    const canonical = canonicalizeLocale(candidate);
    if (!canonical) return null;
    const exact = byCanonical.get(canonical.toLowerCase());
    if (exact) return exact.value;
    const preferredChinese = preferredChineseLocale(canonical);
    const chinese = preferredChinese && byCanonical.get(preferredChinese.toLowerCase());
    if (chinese) return chinese.value;
    const language = localeLanguage(canonical);
    return entries.find((entry) => localeLanguage(entry.canonical) === language)?.value ?? null;
  };
  return find(requested) ?? find(fallback) ?? entries[0].value;
}
function localeCandidates(translations, requestedLocale, fallbackLocale) {
  const keys = Object.keys(translations);
  const canonicalKeys = /* @__PURE__ */ new Map();
  for (const key of keys) {
    const canonical = canonicalizeLocale(key);
    if (canonical && !canonicalKeys.has(canonical.toLowerCase())) {
      canonicalKeys.set(canonical.toLowerCase(), { key, canonical });
    }
  }
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (locale) => {
    const canonical = canonicalizeLocale(locale);
    const match = canonical && canonicalKeys.get(canonical.toLowerCase());
    if (match && !seen.has(match.key)) {
      seen.add(match.key);
      result.push(match);
    }
  };
  const addCompatible = (locale) => {
    const canonical = canonicalizeLocale(locale);
    if (!canonical) return;
    add(canonical);
    add(preferredChineseLocale(canonical));
    const language = localeLanguage(canonical);
    const match = [...canonicalKeys.values()].find((candidate) => localeLanguage(candidate.canonical) === language);
    if (match) add(match.canonical);
  };
  addCompatible(requestedLocale);
  addCompatible(fallbackLocale);
  addCompatible(DEFAULT_LOCALE);
  return result;
}
function selectPlural(forms, locale, values) {
  if (!forms || typeof forms !== "object" || Array.isArray(forms)) return null;
  const count = Number(values?.count);
  if (!Number.isFinite(count)) return null;
  let category = "other";
  try {
    category = new Intl.PluralRules(locale).select(count);
  } catch {
  }
  const value = forms[category] ?? forms.other;
  return typeof value === "string" ? value : null;
}
function selectTemplate(translations, requestedLocale, fallbackLocale, values) {
  if (!translations || typeof translations !== "object" || Array.isArray(translations)) return null;
  for (const { key, canonical } of localeCandidates(translations, requestedLocale, fallbackLocale)) {
    const value = translations[key];
    if (typeof value === "string") return value;
    const plural = selectPlural(value, canonical, values);
    if (plural !== null) return plural;
  }
  return null;
}
function interpolate(template, values) {
  const source = String(template);
  if (!values || typeof values !== "object") return source;
  return source.replace(INTERPOLATION_RE, (token, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
}
function createTranslator(locales, {
  locale = getCurrentDeviceLocale(),
  fallbackLocale = DEFAULT_LOCALE,
  validation
} = {}) {
  assertLocales(locales);
  if (validation !== void 0) validateLocales(locales, validation);
  const requestedLocale = canonicalizeLocale(locale) ?? DEFAULT_LOCALE;
  const canonicalFallback = canonicalizeLocale(fallbackLocale) ?? DEFAULT_LOCALE;
  return function t(key, values) {
    if (typeof key !== "string") {
      throw new ValidationError("INVALID_TRANSLATION_KEY", { message: "translation key should be a string" });
    }
    const translations = Object.prototype.hasOwnProperty.call(locales, key) ? locales[key] : null;
    const template = selectTemplate(translations, requestedLocale, canonicalFallback, values) ?? key;
    return interpolate(template, values);
  };
}

// node_modules/thenameisf/i18n/core.js
var I18N_INSTANCE = Symbol("i18n instance");
var ACTIVATE_BROWSER = Symbol("activate browser");
var PROVIDER_CLEANUPS = Symbol("provider cleanups");
var REACTIVE_I18N = Symbol("reactive i18n");
var activeProvider;
function assertConfigObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("INVALID_I18N_CONFIG", { message: `${name} should be an object` });
  }
}
function normalizeSupportedLocales(supportedLocales) {
  if (supportedLocales === void 0) return void 0;
  if (!Array.isArray(supportedLocales) || supportedLocales.length === 0) {
    throw new ValidationError("INVALID_SUPPORTED_LOCALES", { message: "supportedLocales should be a non-empty array" });
  }
  const normalized = supportedLocales.map((locale) => {
    const canonical = canonicalizeLocale(locale);
    if (!canonical) {
      throw new ValidationError("INVALID_SUPPORTED_LOCALES", { message: "supportedLocales should contain valid locale strings" });
    }
    return canonical;
  });
  const unique = new Set(normalized.map((locale) => locale.toLowerCase()));
  if (unique.size !== normalized.length) {
    throw new ValidationError("INVALID_SUPPORTED_LOCALES", { message: "supportedLocales should not contain duplicate locales" });
  }
  return Object.freeze(normalized);
}
function normalizeValidation(validation, supportedLocales) {
  if (validation === void 0) return void 0;
  assertConfigObject(validation, "validation");
  const normalized = { ...validation };
  if (normalized.requiredLocales === "supported") {
    if (!supportedLocales) {
      throw new ValidationError("MISSING_SUPPORTED_LOCALES", { message: 'requiredLocales "supported" needs supportedLocales' });
    }
    normalized.requiredLocales = supportedLocales;
  }
  validateLocales({}, normalized);
  return Object.freeze(normalized);
}
function normalizeBrowserConfig(browser) {
  if (browser === void 0 || browser === false) return null;
  if (browser === true) return Object.freeze({});
  assertConfigObject(browser, "browser");
  const {
    storageKey,
    automaticPreference = "auto",
    syncDocumentLanguage = false
  } = browser;
  if (storageKey !== void 0 && (typeof storageKey !== "string" || !storageKey)) {
    throw new ValidationError("INVALID_I18N_BROWSER_CONFIG", { message: "browser.storageKey should be a non-empty string" });
  }
  if (typeof automaticPreference !== "string" || !automaticPreference) {
    throw new ValidationError("INVALID_I18N_BROWSER_CONFIG", { message: "browser.automaticPreference should be a non-empty string" });
  }
  if (typeof syncDocumentLanguage !== "boolean") {
    throw new ValidationError("INVALID_I18N_BROWSER_CONFIG", { message: "browser.syncDocumentLanguage should be a boolean" });
  }
  return Object.freeze({ ...browser, storageKey, automaticPreference, syncDocumentLanguage });
}
function globalValue(name) {
  try {
    return globalThis[name];
  } catch {
    return void 0;
  }
}
function browserValue(browser, name) {
  return Object.prototype.hasOwnProperty.call(browser, name) ? browser[name] : globalValue(name);
}
function scheduleMicrotask(fn) {
  if (typeof queueMicrotask === "function") queueMicrotask(fn);
  else Promise.resolve().then(fn);
}
function assertI18nInstance(i18n2) {
  if (!i18n2?.[I18N_INSTANCE]) throw new TypeError("Expected an i18n instance created by createI18n()");
}
function requireProvider() {
  if (!activeProvider) throw new Error("No i18n provider is active");
  return activeProvider;
}
function createVanillaLocaleState(initialValue) {
  let value = initialValue;
  return {
    get() {
      return value;
    },
    peek() {
      return value;
    },
    set(nextValue) {
      value = nextValue;
      return value;
    }
  };
}
function createI18nInstance(config = {}, {
  createLocaleState = createVanillaLocaleState,
  reactive = false,
  useT
} = {}) {
  assertConfigObject(config, "i18n config");
  const supportedLocales = normalizeSupportedLocales(config.supportedLocales);
  const fallbackLocale = resolveLocale(config.fallbackLocale ?? "en", {
    supportedLocales,
    fallbackLocale: supportedLocales?.[0] ?? "en"
  });
  const validation = normalizeValidation(config.validation, supportedLocales);
  const browser = normalizeBrowserConfig(config.browser);
  const deferNotifications = config.deferNotifications ?? false;
  if (typeof deferNotifications !== "boolean") {
    throw new ValidationError("INVALID_I18N_CONFIG", { message: "deferNotifications should be a boolean" });
  }
  let destroyed = false;
  let browserCleanup;
  let preference;
  let activeDocument;
  const listeners = /* @__PURE__ */ new Set();
  const providerCleanups = /* @__PURE__ */ new Set();
  const getStorage = () => browser && (Object.prototype.hasOwnProperty.call(browser, "storage") ? browser.storage : globalValue("localStorage"));
  const getWindow = () => browser && browserValue(browser, "window");
  const getDocument = () => browser && browserValue(browser, "document");
  function assertAlive() {
    if (destroyed) throw new Error("This i18n instance has been destroyed");
  }
  function normalizeExplicitLocale(locale) {
    const canonical = canonicalizeLocale(locale);
    if (!canonical) throw new RangeError(`Unsupported locale: ${locale}`);
    if (!supportedLocales) return canonical;
    const exact = supportedLocales.find((value) => value.toLowerCase() === canonical.toLowerCase());
    if (!exact) throw new RangeError(`Unsupported locale: ${locale}`);
    return exact;
  }
  function readStoredPreference() {
    if (!browser?.storageKey) return preference;
    try {
      const storage = getStorage();
      if (!storage) return preference ?? browser.automaticPreference;
      const value = JSON.parse(storage.getItem(browser.storageKey));
      if (value === browser.automaticPreference) return value;
      return normalizeExplicitLocale(value);
    } catch {
      return browser.automaticPreference;
    }
  }
  function resolvePreference(value) {
    return resolveLocale(
      value === browser?.automaticPreference ? getCurrentDeviceLocale() : value,
      { supportedLocales, fallbackLocale }
    );
  }
  if (browser?.storageKey) {
    preference = readStoredPreference();
  } else {
    preference = resolveLocale(config.initialLocale ?? getCurrentDeviceLocale(), {
      supportedLocales,
      fallbackLocale
    });
  }
  const effectiveLocale = createLocaleState(resolvePreference(preference));
  function updateDocumentLanguage(locale) {
    if (!browser?.syncDocumentLanguage) return;
    const document = activeDocument;
    if (document?.documentElement) document.documentElement.lang = locale;
  }
  function notifyLocaleChanged(locale) {
    for (const listener of [...listeners]) {
      const notify = () => {
        if (!listeners.has(listener)) return;
        try {
          listener(locale);
        } catch (error) {
          console.error(error);
        }
      };
      if (deferNotifications) scheduleMicrotask(notify);
      else notify();
    }
  }
  function updateEffectiveLocale(locale) {
    assertAlive();
    const previous = effectiveLocale.peek();
    updateDocumentLanguage(locale);
    effectiveLocale.set(locale);
    if (locale !== previous) notifyLocaleChanged(locale);
    return locale;
  }
  function refreshEffectiveLocale() {
    if (browser?.storageKey) preference = readStoredPreference();
    return updateEffectiveLocale(resolvePreference(preference));
  }
  function getLocale2() {
    assertAlive();
    return effectiveLocale.get();
  }
  function setLocale2(locale) {
    const normalized = normalizeExplicitLocale(locale);
    if (!browser?.storageKey) preference = normalized;
    return updateEffectiveLocale(normalized);
  }
  function getLocalePreference() {
    assertAlive();
    return browser?.storageKey ? readStoredPreference() : preference;
  }
  function setLocalePreference(nextPreference) {
    assertAlive();
    if (nextPreference !== browser?.automaticPreference) {
      nextPreference = normalizeExplicitLocale(nextPreference);
    }
    preference = nextPreference;
    if (browser?.storageKey) {
      getStorage()?.setItem(browser.storageKey, JSON.stringify(nextPreference));
    }
    return refreshEffectiveLocale();
  }
  function subscribeLocaleChanged2(listener, { emitCurrent = false } = {}) {
    assertAlive();
    if (typeof listener !== "function") throw new TypeError("listener should be a function");
    listeners.add(listener);
    let subscribed = true;
    if (emitCurrent) {
      const emit = () => {
        if (!subscribed) return;
        try {
          listener(effectiveLocale.peek());
        } catch (error) {
          console.error(error);
        }
      };
      if (deferNotifications) scheduleMicrotask(emit);
      else emit();
    }
    return () => {
      if (!subscribed) return;
      subscribed = false;
      listeners.delete(listener);
    };
  }
  function getT2(locales, options = {}) {
    assertAlive();
    validateLocales(locales, validation);
    const translatorFallback = options.fallbackLocale ?? fallbackLocale;
    if (options.locale !== void 0) {
      return createTranslator(locales, {
        locale: options.locale,
        fallbackLocale: translatorFallback
      });
    }
    const translators = /* @__PURE__ */ new Map();
    return (key, values) => {
      const locale = getLocale2();
      let translate = translators.get(locale);
      if (!translate) {
        translate = createTranslator(locales, {
          locale,
          fallbackLocale: translatorFallback
        });
        translators.set(locale, translate);
      }
      return translate(key, values);
    };
  }
  function activateBrowser() {
    assertAlive();
    if (browserCleanup) throw new Error("This i18n instance is already active");
    const window = getWindow();
    const storage = getStorage();
    activeDocument = getDocument();
    const onStorage = (event) => {
      if (event.storageArea === storage && event.key === browser.storageKey) refreshEffectiveLocale();
    };
    const onLanguageChange = () => {
      if (readStoredPreference() === browser.automaticPreference) refreshEffectiveLocale();
    };
    if (browser?.storageKey && window?.addEventListener) {
      window.addEventListener("storage", onStorage);
      window.addEventListener("languagechange", onLanguageChange);
    }
    if (browser?.storageKey) refreshEffectiveLocale();
    else updateDocumentLanguage(effectiveLocale.peek());
    let active = true;
    browserCleanup = () => {
      if (!active) return;
      active = false;
      if (browser?.storageKey && window?.removeEventListener) {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("languagechange", onLanguageChange);
      }
      activeDocument = void 0;
      browserCleanup = void 0;
    };
    return browserCleanup;
  }
  function destroy() {
    if (destroyed) return;
    for (const cleanup of [...providerCleanups]) cleanup();
    browserCleanup?.();
    listeners.clear();
    destroyed = true;
  }
  const instance = Object.freeze({
    [I18N_INSTANCE]: true,
    [ACTIVATE_BROWSER]: activateBrowser,
    [PROVIDER_CLEANUPS]: providerCleanups,
    [REACTIVE_I18N]: reactive,
    supportedLocales,
    fallbackLocale,
    resolveLocale: (locale) => resolveLocale(locale, { supportedLocales, fallbackLocale }),
    getLocale: getLocale2,
    setLocale: setLocale2,
    getLocalePreference,
    setLocalePreference,
    subscribeLocaleChanged: subscribeLocaleChanged2,
    getT: getT2,
    ...useT ? { useT } : {},
    destroy
  });
  return instance;
}
function provideI18n(i18n2) {
  assertI18nInstance(i18n2);
  if (activeProvider) throw new Error("An i18n provider is already active");
  activeProvider = i18n2;
  let deactivate;
  try {
    deactivate = i18n2[ACTIVATE_BROWSER]();
  } catch (error) {
    activeProvider = void 0;
    throw error;
  }
  let active = true;
  const cleanup = () => {
    if (!active) return;
    active = false;
    i18n2[PROVIDER_CLEANUPS].delete(cleanup);
    if (activeProvider === i18n2) activeProvider = void 0;
    deactivate();
  };
  i18n2[PROVIDER_CLEANUPS].add(cleanup);
  return cleanup;
}
function getT(locales, options = {}) {
  let provider = activeProvider;
  let translate = provider?.getT(locales, options);
  return (key, values) => {
    const currentProvider = requireProvider();
    if (provider !== currentProvider) {
      provider = currentProvider;
      translate = provider.getT(locales, options);
    }
    return translate(key, values);
  };
}

// node_modules/thenameisf/i18n/index.js
function createI18n(config = {}) {
  return createI18nInstance(config);
}

// src/i18n/index.js
var SUPPORTED_LOCALES = Object.freeze([
  "en",
  "fr",
  "it",
  "de",
  "es",
  "pt-BR",
  "ru",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko"
]);
var TRANSLATED_LOCALES = SUPPORTED_LOCALES.slice(1);
var i18n = createI18n({
  supportedLocales: SUPPORTED_LOCALES,
  fallbackLocale: "en",
  validation: {
    requiredLocales: "supported",
    referenceLocale: "en",
    requireReferenceKey: true
  },
  browser: {
    syncDocumentLanguage: true
  }
});
provideI18n(i18n);
var resolveSupportedLocale = i18n.resolveLocale;
var getLocale = i18n.getLocale;
var subscribeLocaleChanged = i18n.subscribeLocaleChanged;
function launcherLocale(locale, legacyLanguage) {
  if (locale !== void 0 && locale !== null) {
    if (SUPPORTED_LOCALES.includes(locale)) return locale;
    throw new RangeError(`Unsupported locale: ${locale}`);
  }
  if (legacyLanguage === "pt") return "pt-BR";
  if (legacyLanguage === "en") return "en";
  throw new RangeError(`Unsupported locale: ${locale ?? legacyLanguage}`);
}
function setLocale(locale) {
  const previous = getLocale();
  i18n.setLocale(locale);
  return getLocale() !== previous;
}
function defineLocales(entries) {
  return Object.fromEntries(Object.entries(entries).map(([key, translations]) => {
    if (!Array.isArray(translations) || translations.length !== TRANSLATED_LOCALES.length) {
      throw new TypeError(`translations for "${key}" should contain ${TRANSLATED_LOCALES.length} values`);
    }
    return [key, {
      en: key,
      ...Object.fromEntries(TRANSLATED_LOCALES.map((locale, index) => [locale, translations[index]]))
    }];
  }));
}

export {
  getT,
  getLocale,
  subscribeLocaleChanged,
  launcherLocale,
  setLocale,
  defineLocales
};
