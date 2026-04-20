import './components/account-list.js'
import { rehydrateAll } from './services/profile-rehydrator.js'

const list = document.querySelector('account-list')
const createBtn = document.getElementById('create-account-btn')
const importBtn = document.getElementById('import-account-btn')

createBtn.addEventListener('click', () => list.startCreate())
importBtn.addEventListener('click', () => {
  // TODO: importing an existing account via nsec (next step)
})

rehydrateAll()
