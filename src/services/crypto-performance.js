const recent = []
export function recordCryptoPerformance (entry) {
  if (typeof IS_DEVELOPMENT === 'undefined' || !IS_DEVELOPMENT) return
  const value = Object.fromEntries(['stage', 'requestId', 'parentId', 'eventId', 'seedRecordId', 'cacheHit', 'count'].filter(key => typeof entry[key] === 'boolean' || typeof entry[key] === 'number' || (typeof entry[key] === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(entry[key]))).map(key => [key, entry[key]]))
  recent.push(value)
  if (recent.length > 128) recent.shift()
  try { console.debug(`[messaging-performance] ${JSON.stringify(value)}`) } catch {}
}
