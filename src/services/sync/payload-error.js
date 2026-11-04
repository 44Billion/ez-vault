export const SYNC_PAYLOAD_INVALID = 'SYNC_PAYLOAD_INVALID'
export const SYNC_SCHEMA_UNSUPPORTED = 'SYNC_SCHEMA_UNSUPPORTED'

export class SyncPayloadError extends Error {
  constructor (code, reason, { quarantineable = true, partial = false } = {}) {
    super(code)
    this.name = 'SyncPayloadError'
    this.code = code
    this.reason = typeof reason === 'string' ? reason.slice(0, 128) : ''
    this.quarantineable = quarantineable === true
    this.partial = partial === true
  }
}

export function syncPayloadInvalid (reason, options) {
  return new SyncPayloadError(SYNC_PAYLOAD_INVALID, reason, options)
}

export function syncSchemaUnsupported (reason, options) {
  return new SyncPayloadError(SYNC_SCHEMA_UNSUPPORTED, reason, options)
}

export function isSyncPayloadError (error) {
  return error instanceof SyncPayloadError ||
    (error?.name === 'SyncPayloadError' &&
      [SYNC_PAYLOAD_INVALID, SYNC_SCHEMA_UNSUPPORTED].includes(error.code))
}

export function assertSupportedPayloadVersion (payload, options) {
  if (payload?.v == null) return
  if (payload.v !== 1) throw syncSchemaUnsupported('unsupported-payload-version', options)
}
