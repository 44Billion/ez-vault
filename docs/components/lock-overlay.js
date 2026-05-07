import * as store from '../services/accounts-store.js'
import * as secrets from '../services/secrets.js'
import * as passkey from '../services/passkey.js'
import * as toast from './shared/toast.js'
import { injectComponentStyles } from '../helpers/dom.js'

const ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>'

const STYLES = /* css */`
  lock-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 32px 24px;
    background-color: oklch(0.18 0 89.88);
    color: oklch(0.92 0 89.88);
  }
  lock-overlay[hidden] {
    display: none;
  }
  lock-overlay .lock-badge {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    background-color: oklch(0.22 0 89.88);
    box-shadow: 0 0 0 2px oklch(0.3 0.12 274.76);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.78 0.16 274.76);
  }
  lock-overlay .lock-badge svg {
    width: 44px;
    height: 44px;
  }
  lock-overlay .lock-title {
    font-size: 18rem;
    font-weight: 600;
    text-align: center;
    margin: 0;
  }
  lock-overlay .lock-hint {
    font-size: 13rem;
    color: oklch(0.62 0 89.88);
    text-align: center;
    margin: 0;
    max-width: 280px;
    line-height: 1.4;
  }
  lock-overlay .lock-unlock {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: oklch(0.55 0.18 145);
    color: oklch(0.98 0 0);
    border-radius: 9999px;
    padding: 12px 24px;
    font-size: 14rem;
    font-weight: 600;
    min-width: 200px;
  }
  lock-overlay .lock-unlock:active {
    background-color: oklch(0.48 0.16 145);
  }
  lock-overlay .lock-unlock:disabled {
    opacity: 0.7;
  }
  lock-overlay .lock-unlock-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  lock-overlay .lock-unlock-icon svg {
    width: 18px;
    height: 18px;
    display: block;
  }
`

// Visibility rule: shown when at least one non-npub account exists *and* the
// vault is locked. An npub-only state (or an empty store) leaves the regular
// UI fully reachable.
function shouldShow () {
  if (secrets.isUnlocked()) return false
  return store.list().some(a => a.type !== 'npub')
}

export class LockOverlay extends HTMLElement {
  #unsubStore = null
  #unsubSecrets = null
  #unlockBtn = null
  #unlockIcon = null

  connectedCallback () {
    injectComponentStyles('lock-overlay', STYLES)
    this.innerHTML = `
      <span class="lock-badge" aria-hidden="true">${ICON_LOCK}</span>
      <h2 class="lock-title">Vault locked</h2>
      <p class="lock-hint">Unlock with the passkey that holds your account secrets.</p>
      <button type="button" class="lock-unlock">
        <span class="lock-unlock-icon">${ICON_LOCK}</span>
        <span>Unlock with passkey</span>
      </button>
    `
    this.#unlockBtn = this.querySelector('.lock-unlock')
    this.#unlockIcon = this.querySelector('.lock-unlock-icon')
    this.#unlockBtn.addEventListener('click', this.#onUnlock)

    this.#applyVisibility()
    this.#unsubStore = store.subscribe(() => this.#applyVisibility())
    this.#unsubSecrets = secrets.subscribe(() => this.#applyVisibility())
  }

  disconnectedCallback () {
    this.#unsubStore?.()
    this.#unsubStore = null
    this.#unsubSecrets?.()
    this.#unsubSecrets = null
    this.#unlockBtn?.removeEventListener('click', this.#onUnlock)
  }

  #applyVisibility () {
    this.toggleAttribute('hidden', !shouldShow())
  }

  #onUnlock = async () => {
    if (this.#unlockBtn.disabled) return
    this.#unlockBtn.disabled = true
    this.#unlockIcon.classList.add('pulsate')
    try {
      await passkey.unlock()
      // Visibility flips automatically via the secrets subscription.
    } catch (err) {
      console.error('passkey unlock failed', err?.message ?? err)
      toast.error('Could not unlock', err?.message ?? '')
    } finally {
      this.#unlockBtn.disabled = false
      this.#unlockIcon.classList.remove('pulsate')
    }
  }
}

customElements.define('lock-overlay', LockOverlay)
