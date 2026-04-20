import * as store from '../services/accounts-store.js'
import { injectComponentStyles } from '../helpers/dom.js'
import './account-avatar.js'

const STYLES = /* css */`
  account-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 18px;
    align-content: start;
  }
`

export class AccountList extends HTMLElement {
  #unsub

  connectedCallback () {
    injectComponentStyles('account-list', STYLES)
    this.#render()
    this.#unsub = store.subscribe(() => this.#render())
  }

  disconnectedCallback () {
    this.#unsub?.()
  }

  startCreate () {
    if (this.querySelector('account-avatar[mode="creating"]')) return
    const tile = document.createElement('account-avatar')
    tile.setAttribute('mode', 'creating')
    this.prepend(tile)
  }

  #render () {
    const accounts = store.list()
    const accountPubkeys = new Set(accounts.map(a => a.pubkey))
    const existing = new Map()
    for (const tile of this.querySelectorAll('account-avatar[pubkey]:not([mode="creating"])')) {
      existing.set(tile.getAttribute('pubkey'), tile)
    }
    for (const [pk, tile] of existing) {
      if (!accountPubkeys.has(pk)) tile.remove()
      else tile.refresh?.()
    }
    for (const acc of accounts) {
      if (existing.has(acc.pubkey)) continue
      const tile = document.createElement('account-avatar')
      tile.setAttribute('mode', 'normal')
      tile.setAttribute('pubkey', acc.pubkey)
      this.appendChild(tile)
    }
  }
}

customElements.define('account-list', AccountList)
