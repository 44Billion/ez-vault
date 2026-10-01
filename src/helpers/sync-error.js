// Keep operational buffer diagnostics useful without logging messages or keys.
export function syncErrorDetails (error) {
  if (error?.code !== 'RELAY_LIVE_BUFFER_FULL') return null
  const details = { code: error.code }
  for (const key of ['relay', 'operation', 'phase']) if (typeof error[key] === 'string') details[key] = error[key]
  const buffer = error.buffer
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
