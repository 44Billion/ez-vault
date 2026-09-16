import { closeStorage } from './storage/index.js'

// Development-only environment wipe requested by the launcher's full reset
// (see `services/messenger.js`). The vault is the only context allowed to
// delete its own origin's storage: the launcher cannot reach another origin,
// and the accounts plus their sealed secrets live here.
//
// Every step is best effort and reported back, because a partially wiped
// development environment is still more useful than an exception that hides
// which provider failed. Databases are enumerated and deleted rather than
// hardcoded, mirroring the launcher's own trusted-page cleanup.
const DELETE_TIMEOUT_MS = 5000

function normalizeError (error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error ?? 'Unknown error')
  }
}

function deleteDatabase (indexedDB, name, timeoutMs = DELETE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let request
    try {
      request = indexedDB.deleteDatabase(name)
    } catch (err) {
      reject(err)
      return
    }
    // `blocked` means another connection is still closing; the shared library
    // closes on `versionchange`, so keep waiting for `success`. The timeout
    // only bounds the caller's wait and still reports the unconfirmed delete:
    // it completes once the remaining connection goes away (e.g. our reload).
    let blocked = false
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (result?.error) reject(result.error)
      else resolve(result)
    }
    const timer = setTimeout(() => finish({ name, blocked: true }), timeoutMs)
    request.onblocked = () => { blocked = true }
    request.onsuccess = () => finish({ name, blocked })
    request.onerror = () => finish({ error: request.error || new Error(`IDB_DELETE_FAILED: ${name}`) })
  })
}

async function clearCacheStorage (caches) {
  if (typeof caches?.keys !== 'function' || typeof caches?.delete !== 'function') return
  const names = await caches.keys()
  await Promise.all((names || []).map(name => caches.delete(name)))
}

async function clearOpfs (storage) {
  if (typeof storage?.getDirectory !== 'function') return
  const directory = await storage.getDirectory()
  if (typeof directory?.entries !== 'function' || typeof directory?.removeEntry !== 'function') return
  for await (const [name] of directory.entries()) {
    await directory.removeEntry(name, { recursive: true })
  }
}

export async function wipeLocalDevData ({
  _window = globalThis.window,
  _navigator = globalThis.navigator,
  _caches = globalThis.caches,
  _indexedDB = globalThis.indexedDB,
  _closeStorage = closeStorage,
  _deleteTimeoutMs = DELETE_TIMEOUT_MS,
  _console = console
} = {}) {
  const failures = []
  const deletedDatabases = []
  const blockedDatabases = []
  const run = async (step, work) => {
    try {
      await work()
    } catch (error) {
      failures.push({ step, ...normalizeError(error) })
      _console?.warn?.(`[local-dev-wipe] ${step} failed`, error)
    }
  }

  // Close our own connection first so deleting it below is not blocked.
  await run('storage', () => _closeStorage())

  await run('indexedDB', async () => {
    if (typeof _indexedDB?.databases !== 'function' || typeof _indexedDB?.deleteDatabase !== 'function') {
      throw new Error('IDB_UNAVAILABLE')
    }
    const databases = (await _indexedDB.databases()) || []
    for (const database of databases) {
      if (typeof database?.name !== 'string' || !database.name) continue
      const result = await deleteDatabase(_indexedDB, database.name, _deleteTimeoutMs)
      deletedDatabases.push(result.name)
      if (result.blocked) blockedDatabases.push(result.name)
    }
  })
  await run('localStorage', () => _window?.localStorage?.clear?.())
  await run('sessionStorage', () => _window?.sessionStorage?.clear?.())
  await run('caches', () => clearCacheStorage(_caches))
  await run('opfs', () => clearOpfs(_navigator?.storage))

  return { databases: deletedDatabases, blockedDatabases, failures }
}
