// Same deterministic monogram contract used by the 44billion and nappstore
// launchers: a one- or two-character label derived from the app name (or
// id) and a stable palette index hashed from the app id. Colors live as
// --monogram-* tokens in theme.css, selected via [data-palette].

// Splits text by user-perceived characters when the platform supports it.
function getGraphemes (value) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
      .map(segment => segment.segment)
  }
  return Array.from(value)
}

// Extracts meaningful words while treating camel-case as separate initials.
function getWords (value) {
  const separatedValue = value.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(separatedValue)]
      .filter(segment => segment.isWordLike)
      .map(segment => segment.segment)
  }
  return separatedValue.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

// Builds a stable one- or two-character app monogram and its palette index.
export function getAppIconMonogram (appId, appName) {
  const normalizedName = typeof appName === 'string'
    ? appName.trim().replace(/\s+/gu, ' ')
    : ''
  const words = normalizedName ? getWords(normalizedName) : []
  const rawLabel = words.length > 1
    ? `${getGraphemes(words[0])[0]}${getGraphemes(words.at(-1))[0]}`
    : getGraphemes(words[0] || '').slice(0, 2).join('')
  const label = getGraphemes(rawLabel.toUpperCase()).slice(0, 2).join('') || '◈'
  const seed = String(appId || normalizedName || 'app')
  let hash = 2166136261
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return {
    label,
    paletteIndex: (hash >>> 0) % 10
  }
}
