import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createDeployHash } from '../bin/deploy-hash.js'

test('deploy announcements change for dependency-only updates and remain deterministic', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ez-vault-deploy-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sources = path.join(root, 'src')
  const lockfile = path.join(root, 'package-lock.json')
  await mkdir(path.join(sources, 'nested'), { recursive: true })
  await writeFile(path.join(sources, 'index.js'), 'export const version = 1\n')
  await writeFile(path.join(sources, 'nested', 'other.js'), 'export const enabled = true\n')
  await writeFile(lockfile, JSON.stringify({ dependencies: { libp2r2p: '0.11.14' } }))
  const previous = await createDeployHash(sources, lockfile)
  assert.match(previous, /^[0-9a-f]{10}$/)
  assert.equal(await createDeployHash(sources, lockfile), previous)
  await writeFile(lockfile, JSON.stringify({ dependencies: { libp2r2p: '0.11.15' } }))
  const dependencyUpdate = await createDeployHash(sources, lockfile)
  assert.notEqual(dependencyUpdate, previous)
  assert.equal(await createDeployHash(sources, lockfile), dependencyUpdate)
  await writeFile(path.join(sources, 'nested', 'other.js'), 'export const enabled = false\n')
  assert.notEqual(await createDeployHash(sources, lockfile), dependencyUpdate)
})
