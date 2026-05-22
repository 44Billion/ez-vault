import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createQueue } from '../docs/services/web-storage-queue.js'

const data = new Map()
let failNextItemWrite = false
let failNextItemRemove = false
globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  key: index => [...data.keys()][index] ?? null,
  removeItem: key => {
    if (failNextItemRemove && String(key).startsWith('test:queue:item:')) {
      failNextItemRemove = false
      throw new Error('ITEM_REMOVE_FAILED')
    }
    data.delete(String(key))
  },
  setItem: (key, value) => {
    if (failNextItemWrite && String(key).startsWith('test:queue:item:')) {
      failNextItemWrite = false
      throw new Error('ITEM_WRITE_FAILED')
    }
    data.set(String(key), String(value))
  },
  get length () { return data.size }
}

afterEach(() => {
  failNextItemWrite = false
  failNextItemRemove = false
  globalThis.localStorage.clear()
})

function setJson (key, value) {
  globalThis.localStorage.setItem(key, JSON.stringify(value))
}

function createStorageArea () {
  const store = new Map()
  return {
    clear: () => store.clear(),
    getItem: key => store.has(String(key)) ? store.get(String(key)) : null,
    removeItem: key => store.delete(String(key)),
    setItem: (key, value) => store.set(String(key), String(value)),
    get length () { return store.size }
  }
}

test('queue can use an explicit storage area instead of localStorage', () => {
  const storageArea = createStorageArea()
  const queue = createQueue({ prefix: 'test', storageArea })

  queue.push({ value: 'custom' })

  assert.equal(globalThis.localStorage.getItem('test:queue'), null)
  assert.notEqual(storageArea.getItem('test:queue'), null)
  assert.deepEqual(queue.shift().value, 'custom')
})

test('queue trims a tail reserved before its item was persisted', () => {
  setJson('test:queue', { head: 0, tail: 1 })

  const queue = createQueue({ prefix: 'test' })

  assert.equal(queue.shift(), null)
  assert.equal(globalThis.localStorage.getItem('test:queue'), null)
})

test('queue repairs stale tail and skips missing head items', () => {
  setJson('test:queue', { head: 0, tail: 2 })
  setJson('test:queue:item:1', { id: 1, value: 'second' })

  const queue = createQueue({ prefix: 'test' })

  assert.deepEqual(queue.shift(), { id: 1, value: 'second' })
  assert.equal(queue.shift(), null)
})

test('queue repairs a failed enqueue that only persisted the tail reservation', () => {
  const queue = createQueue({ prefix: 'test' })
  failNextItemWrite = true

  assert.throws(() => queue.enqueue({ value: 'failed' }), /ITEM_WRITE_FAILED/)
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('test:queue')), { head: 0, tail: 1 })

  const recovered = createQueue({ prefix: 'test' })

  assert.equal(recovered.shift(), null)
  assert.equal(globalThis.localStorage.getItem('test:queue'), null)
})

test('queue repairs a failed unshift that only persisted the head reservation', () => {
  const queue = createQueue({ prefix: 'test' })
  failNextItemWrite = true

  assert.throws(() => queue.unshift({ value: 'failed' }), /ITEM_WRITE_FAILED/)
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('test:queue')), { head: -1, tail: 0 })

  const recovered = createQueue({ prefix: 'test' })

  assert.equal(recovered.shift(), null)
  assert.equal(globalThis.localStorage.getItem('test:queue'), null)
})

test('queue repairs a failed shift that only persisted the head advance', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.enqueue({ value: 'first' })
  failNextItemRemove = true

  assert.throws(() => queue.shift(), /ITEM_REMOVE_FAILED/)
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('test:queue')), { head: 1, tail: 1 })
  assert.notEqual(globalThis.localStorage.getItem('test:queue:item:0'), null)

  const recovered = createQueue({ prefix: 'test' })

  assert.deepEqual(recovered.shift(), { id: 0, value: 'first' })
  assert.equal(recovered.shift(), null)
})

test('queue supports push unshift shift and pop', () => {
  const queue = createQueue({ prefix: 'test' })

  assert.equal(queue.push({ value: 'middle' }), 1)
  assert.equal(queue.unshift({ value: 'first' }), 2)
  assert.equal(queue.push({ value: 'last' }), 3)

  assert.deepEqual(queue.shift().value, 'first')
  assert.deepEqual(queue.pop().value, 'last')
  assert.deepEqual(queue.shift().value, 'middle')
  assert.equal(queue.shift(), null)
})

test('enqueue is an alias of push', () => {
  const queue = createQueue({ prefix: 'test' })

  queue.enqueue({ value: 'pushed' })

  assert.deepEqual(queue.shift().value, 'pushed')
})

test('queue repairs a failed pop that only persisted the tail retreat', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'last' })
  failNextItemRemove = true

  assert.throws(() => queue.pop(), /ITEM_REMOVE_FAILED/)
  assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('test:queue')), { head: 0, tail: 0 })
  assert.notEqual(globalThis.localStorage.getItem('test:queue:item:0'), null)

  const recovered = createQueue({ prefix: 'test' })

  assert.deepEqual(recovered.pop(), { id: 0, value: 'last' })
  assert.equal(recovered.pop(), null)
})

test('queue can setAt by logical index', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'b' })
  queue.push({ value: 'c' })

  assert.equal(queue.setAt(1, { value: 'B' }), 1)

  assert.deepEqual(queue.shift().value, 'a')
  assert.deepEqual(queue.shift().value, 'B')
  assert.deepEqual(queue.shift().value, 'c')
})

test('queue can insertAt by logical index moving current and later items forward', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'c' })

  assert.equal(queue.insertAt(1, { value: 'b' }), 1)

  assert.deepEqual(queue.shift().value, 'a')
  assert.deepEqual(queue.shift().value, 'b')
  assert.deepEqual(queue.shift().value, 'c')
})

test('queue can insert before the first item matching a predicate', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'c' })

  assert.equal(queue.insertWhere(item => item.value === 'c', { value: 'b' }), 1)

  assert.deepEqual(queue.shift().value, 'a')
  assert.deepEqual(queue.shift().value, 'b')
  assert.deepEqual(queue.shift().value, 'c')
})

test('queue leaves the queue unchanged when insertWhere finds no match by default', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'b' })

  assert.equal(queue.insertWhere(item => item.value === 'missing', { value: 'c' }), null)

  assert.deepEqual(queue.shift().value, 'a')
  assert.deepEqual(queue.shift().value, 'b')
  assert.equal(queue.shift(), null)
})

test('queue can append when insertWhere finds no match if configured', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'b' })

  assert.equal(queue.insertWhere(item => item.value === 'missing', { value: 'c' }, { appendIfMissing: true }), 2)

  assert.deepEqual(queue.shift().value, 'a')
  assert.deepEqual(queue.shift().value, 'b')
  assert.deepEqual(queue.shift().value, 'c')
})

test('queue can remove by logical index moving later items backward', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'b' })
  queue.push({ value: 'c' })

  assert.deepEqual(queue.removeAt(1).value, 'b')

  assert.deepEqual(queue.shift().value, 'a')
  assert.deepEqual(queue.shift().value, 'c')
  assert.equal(queue.shift(), null)
})

test('queue resumes a removeAt that failed while moving items', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'b' })
  queue.push({ value: 'c' })
  queue.push({ value: 'd' })
  failNextItemRemove = true

  assert.throws(() => queue.removeAt(1), /ITEM_REMOVE_FAILED/)
  assert.notEqual(globalThis.localStorage.getItem('test:queue:operation'), null)

  const recovered = createQueue({ prefix: 'test' })

  assert.deepEqual(recovered.shift().value, 'a')
  assert.deepEqual(recovered.shift().value, 'c')
  assert.deepEqual(recovered.shift().value, 'd')
  assert.equal(recovered.shift(), null)
  assert.equal(globalThis.localStorage.getItem('test:queue:operation'), null)
})

test('removeWhere removes matching items sparsely and readers skip the holes', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'b' })
  queue.push({ value: 'c' })

  queue.removeWhere(item => item.value === 'b')

  assert.deepEqual(queue.shift().value, 'a')
  assert.deepEqual(queue.shift().value, 'c')
  assert.equal(queue.shift(), null)
})

test('queue resumes a forward insertAt that failed while moving items', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'c' })
  queue.push({ value: 'd' })
  failNextItemRemove = true

  assert.throws(() => queue.insertAt(1, { value: 'b' }), /ITEM_REMOVE_FAILED/)
  assert.notEqual(globalThis.localStorage.getItem('test:queue:operation'), null)

  const recovered = createQueue({ prefix: 'test' })

  assert.deepEqual(recovered.shift().value, 'a')
  assert.deepEqual(recovered.shift().value, 'b')
  assert.deepEqual(recovered.shift().value, 'c')
  assert.deepEqual(recovered.shift().value, 'd')
  assert.equal(globalThis.localStorage.getItem('test:queue:operation'), null)
})

test('queue insertAt inserts after an item by using the next logical index', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'a' })
  queue.push({ value: 'b' })

  assert.equal(queue.insertAt(2, { value: 'c' }), 2)

  assert.deepEqual(queue.shift().value, 'a')
  assert.deepEqual(queue.shift().value, 'b')
  assert.deepEqual(queue.shift().value, 'c')
})

test('items consumes from the front', async () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'first' })
  queue.push({ value: 'second' })
  const iterator = queue.items()

  assert.deepEqual((await iterator.next()).value.value, 'first')
  assert.deepEqual((await iterator.next()).value.value, 'second')
  await iterator.return()
})

test('reverseItems consumes from the end', async () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'first' })
  queue.push({ value: 'second' })
  const iterator = queue.reverseItems()

  assert.deepEqual((await iterator.next()).value.value, 'second')
  assert.deepEqual((await iterator.next()).value.value, 'first')
  await iterator.return()
})

test('storedItems scans stored items without consuming them', async () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'first' })
  queue.push({ value: 'second' })

  const values = []
  for await (const item of queue.storedItems()) values.push(item.value)

  assert.deepEqual(values, ['first', 'second'])
  assert.deepEqual(queue.shift().value, 'first')
  assert.deepEqual(queue.shift().value, 'second')
})

test('clear removes queued items state and pending operation metadata', () => {
  const queue = createQueue({ prefix: 'test' })
  queue.push({ value: 'first' })
  queue.push({ value: 'second' })
  setJson('test:queue:operation', { type: 'unknown' })

  queue.clear()

  assert.equal(globalThis.localStorage.getItem('test:queue'), null)
  assert.equal(globalThis.localStorage.getItem('test:queue:item:0'), null)
  assert.equal(globalThis.localStorage.getItem('test:queue:item:1'), null)
  assert.equal(globalThis.localStorage.getItem('test:queue:operation'), null)
  assert.equal(queue.shift(), null)
})
