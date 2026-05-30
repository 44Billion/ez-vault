import './components/account-list.js'
import './components/account-add.js'
import './components/sync/sync-panel.js'
import './components/shared/accordion-panel.js'
import './components/shared/toast.js'
import './components/activity-log.js'
import './components/lock-overlay.js'
import { cleanupTemporaryStorage } from './services/temporary-storage.js'
import * as secrets from './services/secrets.js'
import * as passkey from './services/passkey.js'
import { rehydrateAll } from './services/profile-rehydrator.js'
import { initMessenger } from './services/messenger.js'
import * as sync from './services/sync/index.js'

cleanupTemporaryStorage()

const list = document.querySelector('account-list')
const addPanel = document.querySelector('account-add')
const syncPanel = document.querySelector('sync-panel')
const createBtn = document.getElementById('create-account-btn')
const addBtn = document.getElementById('add-account-btn')
const syncBtn = document.getElementById('sync-devices-btn')

// Each toolbar button represents one mutually-exclusive feature. The
// owning component disables the *other* two while its feature is open,
// and flips its own button to .is-active so the user can tell which
// feature owns the screen (we deliberately don't have sub-routes).
list.toolbarButtons = [addBtn, syncBtn]
list.createButton = createBtn

addPanel.toolbarButtons = [createBtn, syncBtn]
addPanel.activeButton = addBtn

syncPanel.list = list
syncPanel.toolbarButtons = [createBtn, addBtn]
syncPanel.activeButton = syncBtn

// When the button is already active, route the click to the feature's own
// cancel ("X") control instead of re-opening. Lets the toolbar button act
// as a quick toggle and keeps the cancel logic in one place (each flow's
// X handler already knows how to abort in-flight work).
createBtn.addEventListener('click', () => {
  if (createBtn.classList.contains('is-active')) {
    list.querySelector('account-avatar[mode="creating"] button[data-action="cancel-create"]')?.click()
  } else {
    list.startCreate()
  }
})
addBtn.addEventListener('click', () => {
  if (addBtn.classList.contains('is-active')) {
    addPanel.querySelector('button[data-action="cancel"]')?.click()
  } else {
    addPanel.open()
  }
})
syncBtn.addEventListener('click', () => {
  if (syncBtn.classList.contains('is-active')) {
    syncPanel.querySelector('.panel-cancel')?.click()
  } else {
    syncPanel.open()
  }
})

// Bunker rehydrate needs the per-account client key from `secrets`, so the
// initial pass only succeeds if the vault is already unlocked (typical only
// for an npub-only state). The subscription below re-runs rehydrate the
// moment the user unlocks so bunker connections come back without waiting
// for the 60s backoff timer.
let lastUnlocked = secrets.isUnlocked()
secrets.subscribe(() => {
  const nowUnlocked = secrets.isUnlocked()
  if (!lastUnlocked && nowUnlocked) rehydrateAll()
  lastUnlocked = nowUnlocked
})
rehydrateAll()
initMessenger()
sync.init()

if (window === window.top) {
  document.body.classList.add('dev')
  import('./components/dev-panel.js').then(() => {
    document.querySelector('.diagnostics-section')?.append(document.createElement('dev-panel'))
  })
}

// If we boot into a locked state, take the opportunity to compare the live
// favicon against what was stored at the last passkey registration/signal.
// Any difference is staged for `lock-overlay` to push via
// `signalCurrentUserDetails` right after the user unlocks.
if (passkey.hasPasskey() && !secrets.isUnlocked()) {
  passkey.checkForIconUpdate().catch(err => {
    console.warn('icon update check failed', err?.message ?? err)
  })
}
