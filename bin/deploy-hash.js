import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

async function hashTree (dir, hash) {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    hash.update(entry.name)
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) await hashTree(file, hash)
    else hash.update(await readFile(file))
  }
}

// Dependency-only deployments must also change the worker's announcement hash.
// The worker logic hash, and therefore its cache identity, remain independent.
export async function createDeployHash (sourceDir, lockfile) {
  const hash = createHash('sha256')
  await hashTree(sourceDir, hash)
  hash.update(await readFile(lockfile))
  return hash.digest('hex').slice(0, 10)
}
