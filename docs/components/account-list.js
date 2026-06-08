import * as store from '../services/accounts-store.js'
import { injectComponentStyles } from '../helpers/dom.js'
import './account-avatar.js'

const STYLES = /* css */`
  account-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    column-gap: 31px;
    row-gap: 27px;
    align-content: start;
  }
  /* Hide in-progress create tiles while a selection panel is open — selecting
     drafts that don't have a pubkey yet is meaningless. */
  account-list[mode="selecting"] account-avatar[mode="creating"] {
    display: none;
  }
`

export class AccountList extends HTMLElement {
  #unsub
  #observer = null
  #selected = new Set()
  #wasCreating = false

  // Wired by index.js. The create flow has no dedicated panel — it's an
  // inline tile in this list — so the list itself manages the toolbar
  // state: greys out `toolbarButtons` and flips `createButton` to
  // .is-active while a `[mode="creating"]` tile exists.
  toolbarButtons = []
  createButton = null

  connectedCallback () {
    injectComponentStyles('account-list', STYLES)
    this.#render()
    this.#unsub = store.subscribe(() => this.#render())
    this.addEventListener('click', this.#onClick)
    // Cancel-create removes the tile; save flips its `mode` to 'normal'.
    // Watching both events lets a single sync function cover both exits.
    this.#observer = new MutationObserver(() => this.#syncCreateActive())
    this.#observer.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['mode']
    })
  }

  disconnectedCallback () {
    this.#unsub?.()
    this.removeEventListener('click', this.#onClick)
    this.#observer?.disconnect()
    this.#observer = null
  }

  startCreate () {
    if (this.querySelector('account-avatar[mode="creating"]')) return
    const tile = document.createElement('account-avatar')
    tile.setAttribute('mode', 'creating')
    this.prepend(tile)
    // Observer would catch this on the next microtask, but updating
    // synchronously closes the small window where the user could still
    // click another toolbar button.
    this.#syncCreateActive()
  }

  #syncCreateActive () {
    // Only act on transitions. The observer is broad (it also fires when
    // we flip our own `mode` attribute for sync selection), so a flat
    // re-write would clobber the disabled state set by whichever feature
    // is currently active — e.g. opening sync, then Device One, would
    // re-enable the Add button via the list's mode change.
    const creating = !!this.querySelector('account-avatar[mode="creating"]')
    if (creating === this.#wasCreating) return
    this.#wasCreating = creating
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = creating
    }
    this.createButton?.classList.toggle('is-active', creating)
  }

  // Enter selection mode for a sync flow. Every existing account starts
  // selected; the user can deselect individuals with a tap. Used by both
  // sync-host (Device 1) and sync-joiner (Device 2) — neither side has any
  // exporting / importing semantics anymore, just "which accounts to send".
  enterSelectionMode () {
    this.setAttribute('mode', 'selecting')
    this.#selected = new Set(store.list().map(a => a.pubkey))
    this.#applySelectionAttrs()
  }

  exitSelectionMode () {
    this.removeAttribute('mode')
    this.#selected.clear()
    this.#applySelectionAttrs()
  }

  isSelecting () {
    return this.getAttribute('mode') === 'selecting'
  }

  getSelectedPubkeys () {
    return [...this.#selected]
  }

  #onClick = (e) => {
    if (!this.isSelecting()) return
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
    const selecting = this.isSelecting()
    for (const tile of this.querySelectorAll('account-avatar[pubkey]')) {
      tile.toggleAttribute('selecting', selecting)
      const pk = tile.getAttribute('pubkey')
      tile.toggleAttribute('selected', selecting && this.#selected.has(pk))
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
    // synced too — and accounts added during selection mode auto-select so
    // they're not silently left out of the sync payload.
    if (this.isSelecting()) {
      for (const acc of accounts) this.#selected.add(acc.pubkey)
      this.#applySelectionAttrs()
    }
  }
}

customElements.define('account-list', AccountList)
