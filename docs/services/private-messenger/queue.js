export function createQueue ({ prefix }) {
  const stateKey = `${prefix}:queue`
  const itemPrefix = `${prefix}:queue:item:`
  const waiters = new Set()

  function storage () {
    return globalThis.localStorage
  }

  function readState () {
    try {
      const parsed = JSON.parse(storage().getItem(stateKey) || '{}')
      return {
        head: Number.isSafeInteger(parsed.head) ? parsed.head : 0,
        tail: Number.isSafeInteger(parsed.tail) ? parsed.tail : 0
      }
    } catch {
      return { head: 0, tail: 0 }
    }
  }

  function writeState (state) {
    if (state.head >= state.tail) storage().removeItem(stateKey)
    else storage().setItem(stateKey, JSON.stringify(state))
  }

  function itemKey (id) {
    return `${itemPrefix}${id}`
  }

  function wake () {
    for (const resolve of waiters) resolve()
    waiters.clear()
  }

  function enqueue (item) {
    const state = readState()
    const id = state.tail++
    storage().setItem(itemKey(id), JSON.stringify({ id, ...item }))
    writeState(state)
    wake()
    return id
  }

  function shift () {
    const state = readState()
    while (state.head < state.tail) {
      const key = itemKey(state.head)
      const raw = storage().getItem(key)
      storage().removeItem(key)
      state.head++
      writeState(state)
      if (!raw) continue
      try { return JSON.parse(raw) } catch { /* skip malformed item */ }
    }
    return null
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

  function removeWhere (predicate) {
    const state = readState()
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
  }

  return { enqueue, shift, items, removeWhere, clear }
}
