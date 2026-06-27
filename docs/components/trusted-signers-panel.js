import { injectComponentStyles } from '../helpers/dom.js'
import * as trustedSigners from '../services/trusted-signers.js'
import * as secrets from '../services/secrets.js'
import * as passkey from '../services/passkey.js'
import * as toast from './shared/toast.js'

const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3l6 0v3" /></svg>'
const ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>'

const STYLES = /* css */`
  trusted-signers-panel {
    display: block;
  }
  body:not(.dev) accordion-panel:has(trusted-signers-panel[data-empty]) {
    display: none;
  }
  trusted-signers-panel .empty-state {
    margin: 0;
    color: oklch(0.72 0 89.88);
    font-size: 13rem;
    line-height: 1.35;
  }
  trusted-signers-panel .locked-state {
    display: grid;
    gap: 10px;
  }
  trusted-signers-panel .unlock-btn {
    min-height: 36px;
    border: 0;
    border-radius: 9999px;
    padding: 9px 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: oklch(0.55 0.18 145);
    color: oklch(0.98 0 0);
    font-size: 13rem;
    font-weight: 600;
    cursor: pointer;
  }
  trusted-signers-panel .unlock-btn:active {
    background-color: oklch(0.48 0.16 145);
  }
  trusted-signers-panel .unlock-btn:disabled {
    opacity: 0.7;
    cursor: default;
  }
  trusted-signers-panel .unlock-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  trusted-signers-panel .unlock-icon svg {
    width: 16px;
    height: 16px;
  }
  trusted-signers-panel .device-list {
    display: grid;
    gap: 8px;
  }
  trusted-signers-panel .device-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    gap: 8px;
    align-items: start;
    padding: 8px 0;
    border-top: 1px solid oklch(0.32 0 89.88);
  }
  trusted-signers-panel .device-row:first-child {
    border-top: 0;
    padding-top: 0;
  }
  trusted-signers-panel .device-title {
    color: oklch(0.9 0 89.88);
    font-size: 14rem;
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  trusted-signers-panel .device-meta {
    margin-top: 3px;
    color: oklch(0.68 0 89.88);
    font-size: 12rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  trusted-signers-panel .remove-btn {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.72 0.18 25);
    background-color: oklch(0.26 0.08 25);
    cursor: pointer;
  }
  trusted-signers-panel .remove-btn:active {
    background-color: oklch(0.32 0.1 25);
  }
  trusted-signers-panel .remove-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }
  trusted-signers-panel .remove-btn svg {
    width: 17px;
    height: 17px;
  }
`

function shortPubkey (pubkey) {
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-8)}`
}

function formatTime (seconds) {
  if (!seconds) return 'unknown'
  try {
    return new Date(seconds * 1000).toLocaleString()
  } catch {
    return 'unknown'
  }
}

export class TrustedSignersPanel extends HTMLElement {
  #unsubscribers = []

  connectedCallback () {
    injectComponentStyles('trusted-signers-panel', STYLES)
    this.#unsubscribers.push(trustedSigners.subscribe(() => this.#render()))
    this.#unsubscribers.push(secrets.subscribe(() => this.#render()))
    this.#render()
  }

  disconnectedCallback () {
    for (const unsubscribe of this.#unsubscribers.splice(0)) unsubscribe()
  }

  #render () {
    const signers = trustedSigners.list()
    if (!signers.length) {
      if (!secrets.isUnlocked() && passkey.hasPasskey() && trustedSigners.hasStoredActive()) {
        this.#renderLocked()
        return
      }
      this.dataset.empty = 'true'
      this.innerHTML = '<p class="empty-state">No trusted devices yet.</p>'
      return
    }
    delete this.dataset.empty
    this.replaceChildren(this.#deviceList(signers))
  }

  #renderLocked () {
    delete this.dataset.empty
    this.innerHTML = `
      <div class="locked-state">
        <p class="empty-state">Unlock to view trusted devices.</p>
        <button type="button" class="unlock-btn">
          <span class="unlock-icon">${ICON_LOCK}</span>
          <span>Unlock with passkey</span>
        </button>
      </div>
    `
    this.querySelector('.unlock-btn')?.addEventListener('click', event => this.#unlock(event.currentTarget))
  }

  #deviceList (signers) {
    const list = document.createElement('div')
    list.className = 'device-list'
    for (const signer of signers) list.append(this.#deviceRow(signer))
    return list
  }

  #deviceRow (signer) {
    const row = document.createElement('div')
    row.className = 'device-row'

    const body = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'device-title'
    title.textContent = signer.platform || 'Trusted device'
    const meta = document.createElement('div')
    meta.className = 'device-meta'
    meta.textContent = `${shortPubkey(signer.pubkey)} · trusted ${formatTime(signer.addedAt || signer.updatedAt)}`
    body.append(title, meta)

    const remove = document.createElement('button')
    remove.className = 'remove-btn'
    remove.type = 'button'
    remove.title = 'Remove trusted device'
    remove.innerHTML = ICON_TRASH
    remove.addEventListener('click', () => this.#removeSigner(signer.pubkey, remove))

    row.append(body, remove)
    return row
  }

  async #removeSigner (pubkey, button) {
    const ok = window.confirm('Remove this trusted device? Future sync will stop, but data already synced to it cannot be removed.')
    if (!ok) return
    button.disabled = true
    try {
      const actorPubkey = await secrets.getDeviceSignerPubkey()
      trustedSigners.remove(pubkey, { actorPubkey })
      toast.success('Trusted device removed')
    } catch (err) {
      button.disabled = false
      toast.error('Could not remove device', err?.message ?? String(err))
    }
  }

  async #unlock (button) {
    if (button.disabled) return
    const icon = button.querySelector('.unlock-icon')
    button.disabled = true
    icon?.classList.add('pulsate')
    try {
      await passkey.unlock()
      passkey.flushPendingIconUpdate().catch(err => {
        console.warn('icon signal failed', err?.message ?? err)
      })
    } catch (err) {
      console.error('passkey unlock failed', err?.message ?? err)
      toast.error('Could not unlock', err?.message ?? '')
    } finally {
      button.disabled = false
      icon?.classList.remove('pulsate')
    }
  }
}

customElements.define('trusted-signers-panel', TrustedSignersPanel)
