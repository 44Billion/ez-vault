import * as passkey from './passkey.js'
import * as secrets from './secrets.js'
import { requestVaultClose, setAccountsState } from './messenger.js'

// Manual locking is deliberately stricter than ordinary sensitive mutations:
// a local-only vault must first complete its monotonic passkey promotion. The
// launcher sees the locked account snapshot before it is asked to close the
// drawer, matching the ordering used by the legacy vault.
export async function lockAndCloseVault ({
  _requirePasskey = passkey.requirePasskey,
  _lock = secrets.lock,
  _publishAccountsState = setAccountsState,
  _requestVaultClose = requestVaultClose
} = {}) {
  await _requirePasskey()
  _lock()
  _publishAccountsState()
  await _requestVaultClose()
}
