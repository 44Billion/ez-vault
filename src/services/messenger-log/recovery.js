const INITIAL_RETRY_MS = 5000
const MAX_RETRY_MS = 60000
const SAFE_ERROR_NAMES = new Set([
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'DataCloneError',
  'UnknownError', 'NotReadableError', 'NotFoundError', 'QuotaExceededError',
  'AbortError', 'TransactionInactiveError', 'ReadOnlyError', 'InvalidStateError',
  'DataError', 'ConstraintError', 'SecurityError', 'InvalidAccessError',
  'TimeoutError', 'NotSupportedError', 'OperationError'
])
const SAFE_MESSAGES = new Set([
  'Failed to read large IndexedDB value',
  'Data lost due to missing file. Affected record should be considered irrecoverable',
  'IDB_UNAVAILABLE',
  'IDB_TRANSACTION_ABORTED',
  'IDB_TRANSACTION_FAILED',
  'IDB_REQUEST_FAILED'
])

// Select operational fields explicitly. Clone/serialization errors can include
// input values in their messages; arbitrary messages must never reach the log.
export function reportLogFailure (error, context, retry = {}) {
  const storage = error?.activityLog
  const name = error?.name
  const appKey = context.appKey || storage?.appKey
  const detail = {
    phase: context.phase,
    ...(appKey ? { appKey: String(appKey).slice(0, 256) } : {}),
    database: 'ez-vault',
    store: storage?.store || 'messengerLog',
    stage: storage?.stage || context.phase,
    ...(storage?.operation ? { operation: storage.operation } : {}),
    ...(Number.isSafeInteger(storage?.recordId) ? { recordId: storage.recordId } : {}),
    errorName: SAFE_ERROR_NAMES.has(name) ? name : 'Error',
    ...(SAFE_MESSAGES.has(error?.message) ? { message: error.message } : {}),
    ...retry
  }
  console.warn('messenger-log write failed ' + JSON.stringify(detail))
}

// New activity drives retries. No recurring timer, retained payload or automatic
// deletion: failures suspend attempts for 5, 10, 20, 40, then 60 seconds.
export function createLogBackoff (context) {
  let failures = 0
  let retryAt = 0
  let skipped = 0
  return {
    allow () {
      if (Date.now() >= retryAt) return true
      skipped++
      return false
    },
    fail (error, detail = {}) {
      const retryInMs = Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * (2 ** Math.min(failures, 4)))
      failures++
      retryAt = Date.now() + retryInMs
      reportLogFailure(error, { ...context, ...detail }, { failures, retryInMs, skipped })
      skipped = 0
    },
    success () {
      if (failures) console.info('messenger-log recovered ' + JSON.stringify({ ...context, failures, skipped }))
      this.reset()
    },
    reset () {
      failures = 0
      retryAt = 0
      skipped = 0
    }
  }
}
