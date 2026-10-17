// Compiled only for the guarded browser regression, never shipped by the vault.
import '../../src/index.js'
import * as secrets from '../../src/services/secrets.js'
import * as log from '../../src/services/messenger-log/index.js'
import { appendMessengerLog } from '../../src/services/storage/index.js'
import { run } from 'libp2r2p/idb'

let release
globalThis.auditProbe = {
  hold () { release = secrets.beginVaultTransition() },
  release () { release?.(); release = null },
  flush: () => log.flush(),
  records: async () => (await log.list()).filter(entry => entry.eventScope === 'audit-response-test'),
  async retention () {
    await log.flush()
    const appKey = 'app:large-audit-retention-test'
    const entry = { appKey, sealed: secrets.vaultEncrypt(JSON.stringify({ result: 'x'.repeat(192 * 1024) })) }
    const first = await appendMessengerLog(entry, { maxEntriesPerApp: 1 })
    const originalGet = IDBObjectStore.prototype.get
    let failedReads = 0
    let second
    try {
      IDBObjectStore.prototype.get = function (key) {
        if (this.name === 'messengerLog' && key === first) {
          failedReads++
          throw new DOMException('Failed to read large IndexedDB value', 'UnknownError')
        }
        return originalGet.call(this, key)
      }
      second = await appendMessengerLog(entry, { maxEntriesPerApp: 1 })
    } finally { IDBObjectStore.prototype.get = originalGet }
    const request = indexedDB.open('ez-vault')
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const tx = db.transaction(['messengerLog', 'state'], 'readonly')
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onabort = () => reject(tx.error)
        tx.onerror = () => reject(tx.error)
      })
      const records = (await run('getAll', [], 'messengerLog', null, { tx })).result
      const usage = (await run('get', ['messenger-log:usage'], 'state', null, { tx })).result.value
      await done
      return {
        failedReads,
        largeValue: entry.sealed.length > 128 * 1024,
        replaced: !records.some(row => row.id === first) && records.some(row => row.id === second),
        originalSchema: db.version === 1 && !db.objectStoreNames.contains('messengerLogMetadata'),
        usageMatches: usage === records.reduce((sum, row) => sum + row.byteSize, 0)
      }
    } finally { db.close() }
  }
}
