// True when the vault holds no stored accounts and a pending secret mutation
// is not claiming the screen. `accounts` must be the raw store list, not the
// journal-filtered view: an in-flight deletion hides the last account from
// the UI, but the account still exists, so this overlay must not appear.
// A pending mutation only belongs to the lock overlay when the vault is
// locked — during an in-flight account creation the vault is already
// unlocked and this overlay must stay.
export function shouldShowCreateOverlay (accounts, pendingNeedsUnlock, vaultUnlocked) {
  return accounts.length === 0 && (!pendingNeedsUnlock || vaultUnlocked)
}
