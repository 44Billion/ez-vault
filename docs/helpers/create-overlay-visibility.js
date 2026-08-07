// True when the vault holds no visible accounts and no pending secret
// mutation needs an unlock first (that case belongs to the lock overlay).
export function shouldShowCreateOverlay (accounts, pendingNeedsUnlock) {
  return accounts.length === 0 && !pendingNeedsUnlock
}
