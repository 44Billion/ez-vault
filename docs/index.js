import './components/account-list.js'
import './components/account-import.js'
import './components/shared/accordion-panel.js'
import './components/activity-log.js'
import { rehydrateAll } from './services/profile-rehydrator.js'
import { initMessenger } from './services/messenger.js'

const list = document.querySelector('account-list')
const importPanel = document.querySelector('account-import')
const createBtn = document.getElementById('create-account-btn')
const importBtn = document.getElementById('import-account-btn')

createBtn.addEventListener('click', () => list.startCreate())
importBtn.addEventListener('click', () => importPanel.open())

rehydrateAll()
initMessenger()
