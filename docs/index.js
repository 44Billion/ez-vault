import './components/account-list.js'
import './components/account-import.js'
import './components/account-export.js'
import './components/shared/accordion-panel.js'
import './components/shared/toast.js'
import './components/activity-log.js'
import * as store from './services/accounts-store.js'
import { rehydrateAll } from './services/profile-rehydrator.js'
import { initMessenger } from './services/messenger.js'

const list = document.querySelector('account-list')
const importPanel = document.querySelector('account-import')
const exportPanel = document.querySelector('account-export')
const createBtn = document.getElementById('create-account-btn')
const importBtn = document.getElementById('import-account-btn')
const exportBtn = document.getElementById('export-account-btn')

// Hand the export panel the references it needs to drive the rest of the UI:
// the list (selection mode + selected pubkeys) and the toolbar buttons it
// disables for the duration of the export flow.
exportPanel.list = list
exportPanel.toolbarButtons = [createBtn, importBtn, exportBtn]

createBtn.addEventListener('click', () => list.startCreate())
importBtn.addEventListener('click', () => importPanel.open())
exportBtn.addEventListener('click', () => exportPanel.open())

function refreshExportVisibility () {
  // Per spec, the Export button only shows once there's something to export.
  exportBtn.hidden = store.list().length === 0
}

store.subscribe(refreshExportVisibility)
refreshExportVisibility()

rehydrateAll()
initMessenger()
