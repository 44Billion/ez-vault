// Compiled only for the guarded browser regression, never shipped by the vault.
import '../../src/index.js'
import * as secrets from '../../src/services/secrets.js'
import * as log from '../../src/services/messenger-log/index.js'

let release
globalThis.auditProbe = {
  hold () { release = secrets.beginVaultTransition() },
  release () { release?.(); release = null },
  flush: () => log.flush(),
  records: async () => (await log.list()).filter(entry => entry.eventScope === 'audit-response-test')
}
