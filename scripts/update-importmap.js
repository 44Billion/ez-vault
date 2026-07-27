// EZ Vault runs without a build step, so this keeps its native-browser import
// map and SRI metadata aligned with source imports and exact package versions.
// Pass --check to verify that alignment without modifying docs/index.html.

import { readFile, writeFile } from 'node:fs/promises'

import { Generator } from '@jspm/generator'

const CHECK_FLAG = '--check'
const IMPORT_MAP_RE = /^([ \t]*)<script\s+type=["']importmap["'][^>]*>([\s\S]*?)^\1<\/script>/gim
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const JSPM_ORIGIN = 'https://ga.jspm.io'
const RESOLUTION_PACKAGES = Object.freeze([
  '@noble/ciphers',
  '@noble/curves',
  '@noble/hashes',
  'jsqr',
  'libp2r2p',
  'qrcode-generator',
  'thenameisf'
])

const args = process.argv.slice(2)
if (args.some(arg => arg !== CHECK_FLAG) || args.filter(arg => arg === CHECK_FLAG).length > 1) {
  throw new Error(`Usage: node scripts/update-importmap.js [${CHECK_FLAG}]`)
}
const checkOnly = args.includes(CHECK_FLAG)

const projectUrl = new URL('../', import.meta.url)
const htmlUrl = new URL('docs/index.html', projectUrl)
const packageUrl = new URL('package.json', projectUrl)
const html = await readFile(htmlUrl, 'utf8')
const packageJson = JSON.parse(await readFile(packageUrl, 'utf8'))

function extractImportMap (source) {
  const matches = [...source.matchAll(IMPORT_MAP_RE)]
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one inline import map in ${htmlUrl.pathname}`)
  }
  const [fullMatch, indent, json] = matches[0]
  let map
  try {
    map = JSON.parse(json)
  } catch (cause) {
    throw new Error(`Invalid import map JSON in ${htmlUrl.pathname}`, { cause })
  }
  return { fullMatch, indent, map }
}

function mappedUrls (map) {
  return [
    ...Object.values(map.imports ?? {}),
    ...Object.values(map.scopes ?? {}).flatMap(scope => Object.values(scope))
  ].filter(value => typeof value === 'string' && /^https?:/.test(value))
}

function isJspmMap (map) {
  const urls = mappedUrls(map)
  return urls.length > 0 && urls.every(url => url.startsWith(`${JSPM_ORIGIN}/`))
}

function getResolutions () {
  const resolutions = {}
  for (const packageName of RESOLUTION_PACKAGES) {
    const version = packageJson.devDependencies?.[packageName]
    if (!EXACT_VERSION_RE.test(version ?? '')) {
      throw new Error(`${packageName} should have an exact version in devDependencies`)
    }
    resolutions[packageName] = version
  }
  return resolutions
}

function keepRemoteIntegrity (map, tracedDependencies) {
  for (const url of tracedDependencies) {
    if (!/^https?:/.test(url)) continue
    if (!url.startsWith(`${JSPM_ORIGIN}/`)) {
      throw new Error(`Remote module outside ${JSPM_ORIGIN}: ${url}`)
    }
    if (!map.integrity?.[url]) {
      throw new Error(`Missing integrity metadata for traced module ${url}`)
    }
  }

  for (const url of Object.keys(map.integrity ?? {})) {
    if (/^https?:/.test(url) && !url.startsWith(`${JSPM_ORIGIN}/`)) {
      throw new Error(`Integrity metadata contains a remote module outside ${JSPM_ORIGIN}: ${url}`)
    }
  }

  const integrity = Object.fromEntries(
    Object.entries(map.integrity ?? {})
      .filter(([url]) => url.startsWith(`${JSPM_ORIGIN}/`))
      .sort(([left], [right]) => left.localeCompare(right))
  )
  return {
    ...map,
    integrity
  }
}

function assertGeneratedMap (map) {
  for (const forbidden of ['libp2r2p', 'libp2r2p/', 'thenameisf', 'thenameisf/']) {
    if (Object.hasOwn(map.imports ?? {}, forbidden)) {
      throw new Error(`Generated import map should not contain the root alias "${forbidden}"`)
    }
  }

  const urls = mappedUrls(map)
  if (urls.length === 0 || urls.some(url => !url.startsWith(`${JSPM_ORIGIN}/`))) {
    throw new Error(`Every remote import-map resolution should use ${JSPM_ORIGIN}`)
  }

  const integrityEntries = Object.entries(map.integrity ?? {})
  if (integrityEntries.length === 0) {
    throw new Error('Generated import map should contain remote integrity metadata')
  }
  for (const [url, integrity] of integrityEntries) {
    if (!url.startsWith(`${JSPM_ORIGIN}/`)) {
      throw new Error(`Integrity metadata should only contain ${JSPM_ORIGIN} URLs`)
    }
    if (!/^sha384-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
      throw new Error(`Invalid SHA-384 integrity metadata for ${url}`)
    }
  }
  for (const url of urls) {
    // A trailing-slash mapping is a URL prefix, not a fetchable module.
    // Every concrete module reached through it is covered by tracedDependencies.
    if (!url.endsWith('/') && !map.integrity[url]) {
      throw new Error(`Missing integrity metadata for mapped URL ${url}`)
    }
  }
}

function replaceImportMap (source, fullMatch, indent, map) {
  const json = JSON.stringify(map, null, 2)
    .split('\n')
    .map(line => `${indent}${line}`)
    .join('\n')
  return source.replace(
    fullMatch,
    `${indent}<script type="importmap">\n${json}\n${indent}</script>`
  )
}

const current = extractImportMap(html)
const generator = new Generator({
  mapUrl: htmlUrl,
  defaultProvider: 'jspm.io',
  env: ['browser', 'production', 'module'],
  resolutions: getResolutions(),
  inputMap: isJspmMap(current.map) ? current.map : undefined,
  inputMapFallbacks: 'semver-compatible',
  flattenScopes: false,
  combineSubpaths: 'scopes',
  integrity: true
})

const entrypoints = await generator.linkHtml(html, htmlUrl)
const {
  map: tracedMap,
  staticDeps,
  dynamicDeps
} = await generator.extractMap(
  entrypoints,
  htmlUrl,
  null,
  true
)
const generatedMap = keepRemoteIntegrity(
  tracedMap,
  new Set([...staticDeps, ...dynamicDeps])
)
assertGeneratedMap(generatedMap)

const updatedHtml = replaceImportMap(
  html,
  current.fullMatch,
  current.indent,
  generatedMap
)

if (checkOnly) {
  if (updatedHtml !== html) {
    console.error('Import map is stale. Run npm run update:importmap.')
    process.exitCode = 1
  } else {
    console.log('Import map and remote integrity metadata are current.')
  }
} else if (updatedHtml === html) {
  console.log('Import map is already current.')
} else {
  await writeFile(htmlUrl, updatedHtml)
  console.log('Updated docs/index.html with the JSPM import map and remote integrity metadata.')
}
