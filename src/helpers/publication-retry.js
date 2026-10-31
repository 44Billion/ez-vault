// Publication errors may carry absolute or relative relay advice at any level
// of a wrapped failure. Preserve the latest usable deadline.
export function publicationRetryAt (value, now = Date.now()) {
  const pending = [value]
  const seen = new Set()
  let retryAt = 0
  while (pending.length) {
    const current = pending.pop()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    if (Array.isArray(current)) {
      pending.push(...current)
      continue
    }
    if (Number.isSafeInteger(current.retryAt) && current.retryAt > retryAt) retryAt = current.retryAt
    if (Number.isSafeInteger(current.retryAfterMs) && current.retryAfterMs >= 0) {
      retryAt = Math.max(retryAt, now + current.retryAfterMs)
    }
    for (const key of ['cause', 'reason', 'error']) pending.push(current[key])
    for (const key of ['errors', 'relays', 'reports']) {
      if (Array.isArray(current[key])) pending.push(...current[key])
    }
  }
  return retryAt
}

export function retryAtAfterPublicationError (error, delay, now = Date.now()) {
  return Math.max(now + delay, publicationRetryAt(error, now))
}

export function publicationError (message, value, now = Date.now()) {
  const error = new Error(message)
  error.code = message
  const retryAt = publicationRetryAt(value, now)
  if (retryAt > 0) error.retryAt = retryAt
  return error
}

export async function publicationErrorFromResult (result, message = 'PUBLICATION_FAILED') {
  const reports = result?.delivery?.reports
  const failed = (result?.delivery && (!Array.isArray(reports) || !reports.length ||
      reports.some(report => report?.success !== true))) ||
    result?.success === false
  if (!failed) return null

  const details = [result]
  if (result?.promise) {
    try {
      details.push(await result.promise)
    } catch (cause) {
      details.push({ errors: [{ reason: cause }] })
    }
  }
  for (const report of reports || []) {
    details.push(report)
    if (!report?.promise) continue
    try {
      details.push(await report.promise)
    } catch (cause) {
      details.push({ errors: [{ reason: cause }] })
    }
  }
  return publicationError(message, details)
}
