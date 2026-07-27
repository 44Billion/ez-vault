import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const JSPM_ORIGIN = 'https://ga.jspm.io'
const projectUrl = new URL('../', import.meta.url)
const docsUrl = new URL('docs/', projectUrl)
const html = await readFile(new URL('index.html', docsUrl), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('package.json', projectUrl), 'utf8'))
const mapSource = html.match(/<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]
assert.ok(mapSource, 'Missing inline import map')
const importMap = JSON.parse(mapSource)

async function javascriptSources (directoryUrl) {
  const sources = []
  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    const entryUrl = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directoryUrl)
    if (entry.isDirectory()) sources.push(...await javascriptSources(entryUrl))
    else if (extname(entry.name) === '.js') sources.push(await readFile(entryUrl, 'utf8'))
  }
  return sources
}

function packageName (specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/')[0]
}

function bareSpecifiers (sources) {
  const specifiers = new Set()
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g
  ]
  for (const source of sources) {
    for (const pattern of patterns) {
      for (const [, specifier] of source.matchAll(pattern)) {
        if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':')) {
          specifiers.add(specifier)
        }
      }
    }
  }
  return [...specifiers].sort()
}

test('uses granular JSPM mappings with complete remote integrity metadata', async () => {
  const sources = await javascriptSources(docsUrl)
  const usedSpecifiers = bareSpecifiers(sources)
  const localMappings = {
    ...importMap.imports,
    ...Object.fromEntries(
      Object.entries(importMap.scopes ?? {})
        .filter(([scope]) => !/^https?:/.test(scope))
        .flatMap(([, mappings]) => Object.entries(mappings))
    )
  }
  for (const forbidden of ['libp2r2p', 'libp2r2p/', 'thenameisf', 'thenameisf/']) {
    assert.equal(Object.hasOwn(importMap.imports, forbidden), false)
  }
  assert.deepEqual(Object.keys(localMappings).sort(), usedSpecifiers)
  assert.ok(
    Object.keys(importMap.scopes ?? {}).some(scope => scope.startsWith(`${JSPM_ORIGIN}/`)),
    'Expected transitive dependency scopes'
  )

  const mappedEntries = [
    ...Object.entries(importMap.imports),
    ...Object.values(importMap.scopes ?? {}).flatMap(scope => Object.entries(scope))
  ]
  assert.ok(mappedEntries.length > 0)
  for (const [, url] of mappedEntries) {
    assert.match(url, /^https:\/\/ga\.jspm\.io\//)
    if (!url.endsWith('/')) {
      assert.match(importMap.integrity[url], /^sha384-[A-Za-z0-9+/]+={0,2}$/)
    }
  }

  const integrityEntries = Object.entries(importMap.integrity ?? {})
  assert.ok(integrityEntries.length > 0)
  for (const [url, integrity] of integrityEntries) {
    assert.ok(url.startsWith(`${JSPM_ORIGIN}/`))
    assert.match(integrity, /^sha384-[A-Za-z0-9+/]+={0,2}$/)
  }

  for (const [specifier, url] of Object.entries(localMappings)) {
    const name = packageName(specifier)
    const version = packageJson.devDependencies[name]
    assert.ok(version, `Missing devDependency for ${name}`)
    assert.ok(
      url.startsWith(`${JSPM_ORIGIN}/npm:${name}@${version}/`),
      `${specifier} should resolve to ${name}@${version}`
    )
  }

  for (const source of sources) {
    assert.doesNotMatch(source, /\bfrom\s+['"](?:libp2r2p|thenameisf)['"]/)
    assert.doesNotMatch(source, /\bimport\s*\(\s*['"](?:libp2r2p|thenameisf)['"]\s*\)/)
  }
})
