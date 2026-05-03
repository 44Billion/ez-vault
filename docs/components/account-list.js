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
  /* Hide in-progress create tiles while the export panel is open — exporting
     drafts that don't have a pubkey yet is meaningless. */
  account-list[mode="exporting"] account-avatar[mode="creating"] {
    display: none;
  }
`

export class AccountList extends HTMLElement {
  #unsub
  #selected = new Set()

  connectedCallback () {
    injectComponentStyles('account-list', STYLES)
    this.#render()
    this.#unsub = store.subscribe(() => this.#render())
    this.addEventListener('click', this.#onClick)
  }

  disconnectedCallback () {
    this.#unsub?.()
    this.removeEventListener('click', this.#onClick)
  }

  startCreate () {
    if (this.querySelector('account-avatar[mode="creating"]')) return
    const tile = document.createElement('account-avatar')
    tile.setAttribute('mode', 'creating')
    this.prepend(tile)
  }

  // Enter export-selection mode. By spec, every existing account starts
  // selected; the user can deselect individuals with a tap. Returns the
  // initial selection so the caller can keep its own pre-export snapshot.
  enterExportMode () {
    this.setAttribute('mode', 'exporting')
    this.#selected = new Set(store.list().map(a => a.pubkey))
    this.#applySelectionAttrs()
  }

  exitExportMode () {
    this.removeAttribute('mode')
    this.#selected.clear()
    this.#applySelectionAttrs()
  }

  isExporting () {
    return this.getAttribute('mode') === 'exporting'
  }

  getSelectedPubkeys () {
    return [...this.#selected]
  }

  #onClick = (e) => {
    if (!this.isExporting()) return
    // The avatar's own buttons are hidden in this mode, but guard anyway in
    // case some future control sneaks through — toggling on a button click
    // would be confusing.
    if (e.target.closest('button')) return
    const tile = e.target.closest('account-avatar[pubkey]')
    if (!tile || !this.contains(tile)) return
    const pk = tile.getAttribute('pubkey')
    if (!pk) return
    if (this.#selected.has(pk)) this.#selected.delete(pk)
    else this.#selected.add(pk)
    this.#applySelectionAttrs()
  }

  #applySelectionAttrs () {
    const exporting = this.isExporting()
    for (const tile of this.querySelectorAll('account-avatar[pubkey]')) {
      tile.toggleAttribute('selecting', exporting)
      const pk = tile.getAttribute('pubkey')
      tile.toggleAttribute('selected', exporting && this.#selected.has(pk))
    }
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
    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i]
      if (existing.has(acc.pubkey)) continue
      const tile = document.createElement('account-avatar')
      tile.setAttribute('mode', 'normal')
      tile.setAttribute('pubkey', acc.pubkey)
      // Insert before the first following account that already has a tile
      // so new records (e.g. imports added via store.unshift) land at their
      // store-order position instead of at the end of the DOM.
      let nextTile = null
      for (let j = i + 1; j < accounts.length; j++) {
        const sibling = existing.get(accounts[j].pubkey)
        if (sibling) { nextTile = sibling; break }
      }
      if (nextTile) this.insertBefore(tile, nextTile)
      else this.appendChild(tile)
    }
    // New tiles from a store update need their selecting/selected attrs
    // synced too — and accounts added during the export flow auto-select so
    // they're not silently left out of the export payload.
    if (this.isExporting()) {
      for (const acc of accounts) this.#selected.add(acc.pubkey)
      this.#applySelectionAttrs()
    }
  }
}

customElements.define('account-list', AccountList)
