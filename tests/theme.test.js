import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const srcRoot = path.resolve(import.meta.dirname, '../src')
const themeCssPath = path.join(srcRoot, 'styles/theme.css')
const resetCssPath = path.join(srcRoot, 'styles/reset.css')

const normalTextPairs = [
  ['fg-strong', 'surface'],
  ['fg', 'surface'],
  ['fg-muted', 'surface'],
  ['fg', 'surface-sunken'],
  ['fg-muted', 'surface-sunken'],
  ['fg-strong', 'surface-interactive'],
  ['fg', 'surface-interactive-active'],
  ['fg-on-accent', 'accent'],
  ['fg-on-accent', 'accent-hover'],
  ['fg-on-accent', 'accent-active'],
  ['fg-on-accent', 'success'],
  ['fg-on-accent', 'error'],
  ['accent-fg', 'surface'],
  ['accent-fg', 'accent-soft'],
  ['fg', 'accent-soft'],
  ['success-fg', 'surface'],
  ['error-fg', 'surface'],
  ['warning-fg', 'surface'],
  ['info-fg', 'surface']
]

// Disabled/tertiary text is exempt from the 4.5:1 floor (WCAG inactive
// UI-component exception) but must stay readable at 3:1.
const faintTextPairs = [
  ['fg-faint', 'surface']
]

describe('native color themes', () => {
  it('keeps every theme token as a light-dark pair or a derived expression', async () => {
    const tokens = await parseThemeTokens()
    assert.ok(Object.keys(tokens).length >= 20)
    for (const [name, value] of Object.entries(tokens)) {
      if (value.startsWith('light-dark(')) {
        assert.equal(
          countCommas(value.slice('light-dark('.length, -1)),
          1,
          `${name} must be a two-value light-dark() pair`
        )
      } else {
        assert.match(value, /^oklch\(from var\(--[a-z0-9-]+\) /, `${name} must derive from an existing token`)
      }
    }
  })

  it('keeps every used var() reference defined in theme.css', async () => {
    const tokens = await parseThemeTokens()
    const files = await listDocsFiles()
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
        assert.ok(tokens[match[1].slice(2)] !== undefined, `${path.relative(srcRoot, file)} uses undefined ${match[1]}`)
      }
    }
  })

  it('links theme.css before global.css in index.html', async () => {
    const html = await readFile(path.join(srcRoot, 'index.html'), 'utf8')
    const themeLink = html.indexOf('./styles/theme.css')
    const globalLink = html.indexOf('./styles/global.css')
    assert.ok(themeLink !== -1, 'index.html must link theme.css')
    assert.ok(globalLink !== -1, 'index.html must link global.css')
    assert.ok(themeLink < globalLink, 'theme.css must come before global.css')
  })

  it('keeps every used text pair at WCAG AA contrast in both schemes', async () => {
    const tokens = await parseThemeTokens()
    for (const scheme of ['light', 'dark']) {
      for (const [foreground, background] of normalTextPairs) {
        assert.ok(
          contrastRatio(
            pairValue(tokens[foreground], scheme),
            pairValue(tokens[background], scheme)
          ) >= 4.5,
          `${scheme} ${foreground}/${background} must reach 4.5:1`
        )
      }
    }
  })

  it('keeps faint/disabled text at 3:1 in both schemes', async () => {
    const tokens = await parseThemeTokens()
    for (const scheme of ['light', 'dark']) {
      for (const [foreground, background] of faintTextPairs) {
        assert.ok(
          contrastRatio(
            pairValue(tokens[foreground], scheme),
            pairValue(tokens[background], scheme)
          ) >= 3,
          `${scheme} ${foreground}/${background} must reach 3:1`
        )
      }
    }
  })

  it('keeps authored color literals and light-theme inversion out of consumers', async () => {
    const files = (await listDocsFiles())
      .filter(file => file !== themeCssPath && file !== resetCssPath)
    const hexColor = /#[\da-f]{3,8}\b/i
    const authoredOklch = /oklch\(\s*(?!from)/i
    const authoredRgbHsl = /(?:rgba?|hsla?)\(\s*\d/i
    const lightDark = /light-dark\(/i
    const colorKeyword = /(?:color|background(?:-color)?|border(?:-color)?|fill|stroke)\s*:\s*(?:black|white)\b/i
    const invertFilter = /\bfilter\s*:\s*invert\(/i
    const legacyHueClasses = /\b(?:hue-revert|do-hue-invert)\b/

    for (const file of files) {
      let source = await readFile(file, 'utf8')
      // `#add-account-btn` is an id selector, not a hex color; strip it so
      // the hex-color regex can't false-positive on its all-hex letters.
      source = source.replace(/#add-account-btn/g, '')
      const relative = path.relative(srcRoot, file)
      assert.doesNotMatch(source, hexColor, relative)
      assert.doesNotMatch(source, authoredOklch, relative)
      assert.doesNotMatch(source, authoredRgbHsl, relative)
      assert.doesNotMatch(source, lightDark, relative)
      assert.doesNotMatch(source, colorKeyword, relative)
      assert.doesNotMatch(source, invertFilter, relative)
      assert.doesNotMatch(source, legacyHueClasses, relative)
    }
  })
})

async function parseThemeTokens () {
  const themeCss = await readFile(themeCssPath, 'utf8')
  const rootBlock = themeCss.match(/:root\s*\{([\s\S]*)\}/)
  assert.ok(rootBlock, 'theme.css must contain a :root block')
  const tokens = {}
  for (const match of rootBlock[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim()
  }
  return tokens
}

function pairValue (declaration, scheme) {
  assert.ok(declaration.startsWith('light-dark('), `expected a light-dark() pair, got ${declaration}`)
  const [light, dark] = declaration.slice('light-dark('.length, -1).split(/,\s*/)
  return scheme === 'light' ? light : dark
}

function countCommas (value) {
  return value.split(',').length - 1
}

async function listDocsFiles (directory = srcRoot) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => {
    // Generated build outputs (esbuild) contain vendor code with their own
    // colors — only authored sources are scanned for literals.
    if (entry.name === 'chunks' || entry.name === 'app.js' || entry.name === 'sw.js') return []
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listDocsFiles(entryPath)
    return /\.(?:css|js|html)$/.test(entry.name) ? [entryPath] : []
  }))
  return nested.flat()
}

function contrastRatio (foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((left, right) => right - left)
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance (color) {
  const match = /^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/.exec(color)
  assert.ok(match, `Expected an opaque OKLCH color, received ${color}`)
  const [, lightness, chroma, hue] = match.map(Number)
  const hueRadians = hue * Math.PI / 180
  const a = chroma * Math.cos(hueRadians)
  const b = chroma * Math.sin(hueRadians)
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = lRoot ** 3
  const m = mRoot ** 3
  const s = sRoot ** 3
  const [red, green, blue] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map(channel => Math.min(1, Math.max(0, channel)))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}
