let shell = null

export function setVaultViewShell (nextShell) {
  shell = nextShell
}

export function resetVaultView () {
  if (!shell) return

  const {
    list,
    addPanel,
    syncPanel,
    toolbarButtons = []
  } = shell

  // Use each flow's existing cancel/close entry point so in-flight imports,
  // scanners, sync sessions, and account selection are torn down by their
  // owner instead of duplicating that lifecycle in the messenger.
  addPanel?.querySelector('button[data-action="cancel"]')?.click()
  syncPanel?.close()

  for (const avatar of list?.querySelectorAll('account-avatar[mode="creating"]') ?? []) {
    avatar.querySelector('button[data-action="cancel-create"]')?.click()
  }
  for (const avatar of list?.querySelectorAll('account-avatar[mode="editing"]') ?? []) {
    avatar.querySelector('button[data-action="cancel-edit"]')?.click()
  }

  list?.exitSelectionMode()

  // Leave a simple, auditable shell invariant even if a flow was only
  // partially mounted when the launcher requested the reset.
  for (const button of toolbarButtons) {
    if (!button) continue
    button.disabled = false
    button.classList.remove('is-active')
  }
}
