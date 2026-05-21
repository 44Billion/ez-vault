export function createQueue ({ prefix, storageArea = globalThis.localStorage }) {
  const stateKey = `${prefix}:queue`
  const operationKey = `${prefix}:queue:operation`
  const itemPrefix = `${prefix}:queue:item:`
  const waiters = new Set()

  function storage () {
    return storageArea
  }

  function itemKey (id) {
    return `${itemPrefix}${id}`
  }

  function normalizeState (state) {
    const head = Number.isSafeInteger(state.head) ? state.head : 0
    const tail = Number.isSafeInteger(state.tail) && state.tail >= head ? state.tail : head
    return { head, tail }
  }

  function recoverHead (state) {
    let recovered = state
    while (storage().getItem(itemKey(recovered.head - 1))) {
      recovered = { ...recovered, head: recovered.head - 1 }
    }
    while (recovered.head < recovered.tail && !storage().getItem(itemKey(recovered.head))) {
      recovered = { ...recovered, head: recovered.head + 1 }
    }
    if (recovered.head !== state.head || recovered.tail !== state.tail) writeState(recovered)
    return recovered
  }

  function recoverTail (state) {
    let recovered = state
    while (storage().getItem(itemKey(recovered.tail))) {
      recovered = { ...recovered, tail: recovered.tail + 1 }
    }
    while (recovered.tail > recovered.head && !storage().getItem(itemKey(recovered.tail - 1))) {
      recovered = { ...recovered, tail: recovered.tail - 1 }
    }
    if (recovered.head !== state.head || recovered.tail !== state.tail) writeState(recovered)
    return recovered
  }

  function readState () {
    let parsed = {}
    try {
      parsed = JSON.parse(storage().getItem(stateKey) || '{}')
    } catch {
      parsed = {}
    }
    return recoverTail(recoverHead(recoverOperation(normalizeState(parsed))))
  }

  function writeState (state, { keepEmpty = false } = {}) {
    if (!keepEmpty && state.head >= state.tail) storage().removeItem(stateKey)
    else storage().setItem(stateKey, JSON.stringify(state))
  }

  function lengthFromState (state) {
    return Math.max(0, state.tail - state.head)
  }

  function assertIndex (index, length, { allowEnd = false } = {}) {
    const max = allowEnd ? length : length - 1
    if (!Number.isSafeInteger(index) || index < 0 || index > max) throw new Error('QUEUE_INDEX_OUT_OF_RANGE')
  }

  function writeItem (id, item) {
    storage().setItem(itemKey(id), JSON.stringify({ id, ...item }))
  }

  function moveItem (from, to) {
    const raw = storage().getItem(itemKey(from))
    if (!raw) return
    storage().setItem(itemKey(to), raw)
    storage().removeItem(itemKey(from))
  }

  function readItem (id) {
    const raw = storage().getItem(itemKey(id))
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }

  function readOperation () {
    try {
      return JSON.parse(storage().getItem(operationKey) || 'null')
    } catch {
      storage().removeItem(operationKey)
      return null
    }
  }

  function writeOperation (operation) {
    storage().setItem(operationKey, JSON.stringify(operation))
  }

  function clearOperation () {
    storage().removeItem(operationKey)
  }

  function normalizedOperation (operation) {
    if (!operation || (operation.type !== 'insert' && operation.type !== 'remove')) return null
    if (!Number.isSafeInteger(operation.head) || !Number.isSafeInteger(operation.tail) || operation.tail < operation.head) return null
    if (!Number.isSafeInteger(operation.slot) || !Number.isSafeInteger(operation.cursor)) return null
    return operation
  }

  function recoverOperation (state) {
    const operation = normalizedOperation(readOperation())
    if (!operation) {
      clearOperation()
      return state
    }

    if (operation.type === 'insert') return finishInsert(operation)
    return finishRemove(operation)
  }

  function finishInsert (operation) {
    let current = operation
    const state = { head: current.head, tail: current.tail }
    writeState(state)

    while (current.cursor > current.slot) {
      moveItem(current.cursor - 1, current.cursor)
      current = { ...current, cursor: current.cursor - 1 }
      writeOperation(current)
    }

    writeItem(current.slot, current.item)
    clearOperation()
    writeState(state)
    return state
  }

  function finishRemove (operation) {
    let current = operation
    const state = { head: current.head, tail: current.tail }
    writeState(state, { keepEmpty: true })

    while (current.cursor < current.tail) {
      moveItem(current.cursor + 1, current.cursor)
      current = { ...current, cursor: current.cursor + 1 }
      writeOperation(current)
    }

    storage().removeItem(itemKey(current.tail))
    clearOperation()
    writeState(state)
    return state
  }

  function wake () {
    for (const resolve of waiters) resolve()
    waiters.clear()
  }

  function push (item) {
    const state = readState()
    const id = state.tail
    state.tail++
    writeState(state)
    writeItem(id, item)
    wake()
    return lengthFromState(state)
  }

  function unshift (item) {
    const state = readState()
    const id = state.head - 1
    state.head = id
    writeState(state)
    writeItem(id, item)
    wake()
    return lengthFromState(state)
  }

  function shift () {
    const state = readState()
    while (state.head < state.tail) {
      const key = itemKey(state.head)
      const raw = storage().getItem(key)
      state.head++
      writeState(state, { keepEmpty: true })
      storage().removeItem(key)
      writeState(state)
      if (!raw) continue
      try { return JSON.parse(raw) } catch { /* skip malformed item */ }
    }
    return null
  }

  function pop () {
    const state = readState()
    while (state.tail > state.head) {
      const id = state.tail - 1
      const key = itemKey(id)
      const raw = storage().getItem(key)
      state.tail--
      writeState(state, { keepEmpty: true })
      storage().removeItem(key)
      writeState(state)
      if (!raw) continue
      try { return JSON.parse(raw) } catch { /* skip malformed item */ }
    }
    return null
  }

  function setAt (index, item) {
    const state = readState()
    assertIndex(index, lengthFromState(state))
    writeItem(state.head + index, item)
    wake()
    return index
  }

  function insertAt (index, item) {
    const state = readState()
    const length = lengthFromState(state)
    assertIndex(index, length, { allowEnd: true })

    const slot = state.head + index
    state.tail++
    writeState(state)
    writeOperation({
      type: 'insert',
      head: state.head,
      tail: state.tail,
      slot,
      cursor: state.tail - 1,
      item
    })
    finishInsert(readOperation())
    wake()
    return index
  }

  function insertWhere (predicate, item, { appendIfMissing = false } = {}) {
    if (typeof predicate !== 'function') throw new Error('QUEUE_PREDICATE_REQUIRED')
    const state = readState()
    const length = lengthFromState(state)

    for (let index = 0; index < length; index++) {
      const value = readItem(state.head + index)
      if (value && predicate(value, index)) return insertAt(index, item)
    }

    if (appendIfMissing) return insertAt(length, item)
    return null
  }

  function removeAt (index) {
    const state = readState()
    const length = lengthFromState(state)
    assertIndex(index, length)

    const slot = state.head + index
    const raw = storage().getItem(itemKey(slot))
    state.tail--
    writeState(state, { keepEmpty: true })
    writeOperation({
      type: 'remove',
      head: state.head,
      tail: state.tail,
      slot,
      cursor: slot
    })
    finishRemove(readOperation())
    wake()

    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }

  async function * items () {
    while (true) {
      const item = shift()
      if (item) {
        yield item
      } else {
        await new Promise(resolve => waiters.add(resolve))
      }
    }
  }

  async function * reverseItems () {
    while (true) {
      const item = pop()
      if (item) {
        yield item
      } else {
        await new Promise(resolve => waiters.add(resolve))
      }
    }
  }

  function removeWhere (predicate) {
    const state = readState()
    // Bulk predicate removal leaves holes on purpose; shift/pop skip them, and
    // callers that need contiguous positions can use removeAt for compaction.
    for (let id = state.head; id < state.tail; id++) {
      const key = itemKey(id)
      const raw = storage().getItem(key)
      if (!raw) continue
      try {
        if (predicate(JSON.parse(raw))) storage().removeItem(key)
      } catch {
        storage().removeItem(key)
      }
    }
  }

  function clear () {
    const state = readState()
    for (let id = state.head; id < state.tail; id++) storage().removeItem(itemKey(id))
    storage().removeItem(stateKey)
    storage().removeItem(operationKey)
  }

  readState()

  return {
    enqueue: push,
    push,
    pop,
    unshift,
    shift,
    items,
    reverseItems,
    setAt,
    insertAt,
    insertWhere,
    removeAt,
    removeWhere,
    clear
  }
}
