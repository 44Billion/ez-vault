function nestedErrors (value) {
  const pending = [value]
  const seen = new Set()
  const found = []
  while (pending.length) {
    const current = pending.pop()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    found.push(current)
    for (const key of ['cause', 'reason', 'error']) pending.push(current[key])
    for (const key of ['errors', 'reports', 'relays']) {
      if (Array.isArray(current[key])) pending.push(...current[key])
    }
  }
  return found
}

function safeInteger (value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

// Keep operational buffer diagnostics useful without logging messages or keys.
export function syncErrorDetails (error) {
  const errors = nestedErrors(error)
  const bufferError = errors.find(value => value.code === 'RELAY_LIVE_BUFFER_FULL')
  if (bufferError) {
    const details = { code: bufferError.code }
    for (const key of ['relay', 'operation', 'phase']) if (typeof bufferError[key] === 'string') details[key] = bufferError[key]
    const buffer = bufferError.buffer
    if (buffer) {
      details.buffer = {}
      if (['delivery', 'reconnect', 'history-wait'].includes(buffer.stage)) details.buffer.stage = buffer.stage
      for (const key of ['queuedEvents', 'queuedBytes', 'incomingBytes', 'oldestQueuedMs']) {
        if (Number.isFinite(buffer[key])) details.buffer[key] = buffer[key]
      }
      details.buffer.limits = {}
      for (const key of ['events', 'bytes']) if (Number.isFinite(buffer.limits?.[key])) details.buffer.limits[key] = buffer.limits[key]
    }
    return details
  }

  const capacityError = errors.find(value => (
    value.code === 'QUEUE_CAPACITY_EXCEEDED' || value.message === 'QUEUE_CAPACITY_EXCEEDED'
  ))
  if (capacityError) {
    const details = { code: 'QUEUE_CAPACITY_EXCEEDED' }
    if (['inbox', 'seeds'].includes(capacityError.queue)) details.queue = capacityError.queue
    for (const key of ['requiredBytes', 'usedBytes', 'maxBytes']) {
      const value = safeInteger(capacityError[key])
      if (value !== undefined) details[key] = value
    }
    const paused = errors.find(value => (
      value.code === 'PRIVATE_MESSENGER_PAUSED' || value.message === 'PRIVATE_MESSENGER_PAUSED'
    )) || capacityError
    if (Array.isArray(paused.pauseReasons)) {
      details.pauseReasons = paused.pauseReasons
        .filter(value => typeof value === 'string' && value)
        .slice(0, 8)
    }
    return details
  }

  const pausedError = errors.find(value => (
    value.code === 'PRIVATE_MESSENGER_PAUSED' || value.message === 'PRIVATE_MESSENGER_PAUSED'
  ))
  if (!pausedError) return null
  return {
    code: 'PRIVATE_MESSENGER_PAUSED',
    ...(Array.isArray(pausedError.pauseReasons)
      ? { pauseReasons: pausedError.pauseReasons.filter(value => typeof value === 'string' && value).slice(0, 8) }
      : {})
  }
}
