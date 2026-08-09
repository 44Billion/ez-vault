import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach } from 'node:test'

globalThis.indexedDB = new IDBFactory()
globalThis.IDBKeyRange = IDBKeyRange

const storage = await import('../src/services/storage/index.js')
await storage.initializeStorage()

afterEach(async () => {
  await storage.resetStorageForTests()
  await storage.initializeStorage()
})
