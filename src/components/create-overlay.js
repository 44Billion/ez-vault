import * as store from '../services/accounts-store.js'
import * as secrets from '../services/secrets.js'
import {
  pendingMutationNeedsUnlock,
  subscribePendingMutations
} from '../services/account-mutations.js'
import { injectComponentStyles } from '../helpers/dom.js'
import { shouldShowCreateOverlay } from '../helpers/create-overlay-visibility.js'
import { defineLocales, getT, subscribeLocaleChanged } from '../i18n/index.js'
import { swUpdateLocales } from '../i18n/sw-update.js'
import './account-avatar.js'
import { requestVaultClose } from '../services/messenger.js'
import { applySwUpdate, isUpdateAvailable, subscribeSwUpdate } from '../services/sw-manager.js'
import { subscribePomegranateBusy } from '../services/pomegranate.js'
import './google-login-button.js'

// Tabler outline user-plus icon (icons/user-plus.svg), inlined so it
// inherits currentColor.
const ICON_USER_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M16 19h6" /><path d="M19 16v6" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4" /></svg>'

export const createOverlayLocales = defineLocales({
  'Create your first account': ['Créez votre premier compte', 'Crea il tuo primo account', 'Erstelle dein erstes Konto', 'Crea tu primera cuenta', 'Crie sua primeira conta', 'Создайте первую учётную запись', '创建您的第一个账户', '建立您的第一個帳戶', '最初のアカウントを作成', '첫 계정을 만드세요'],
  'I already have an account': ['J’ai déjà un compte', 'Ho già un account', 'Ich habe bereits ein Konto', 'Ya tengo una cuenta', 'Já tenho uma conta', 'У меня уже есть учётная запись', '我已有账户', '我已有帳戶', 'すでにアカウントがあります', '이미 계정이 있습니다']
})

const t = getT(createOverlayLocales)
const swT = getT(swUpdateLocales)

const STYLES = /* css */`
  create-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 32px 24px;
    background-color: var(--surface-sunken);
    color: var(--fg-strong);
  }
  create-overlay[hidden] {
    display: none;
  }
  create-overlay .create-title {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 18rem;
    font-weight: 600;
    text-align: center;
    margin: 0;
  }
  create-overlay .create-main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    transition: opacity 180ms ease-out;
  }
  create-overlay[data-pomegranate-busy="true"] .create-main {
    opacity: 0.3;
  }
  create-overlay .create-title-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted);
    flex-shrink: 0;
  }
  create-overlay .create-title-icon svg {
    width: 22px;
    height: 22px;
    display: block;
  }
  /* The embedded creating tile reuses the account-avatar flow; only its
     size and touch targets change here. The tile's cancel button is hidden
     because the overlay's own dismiss button owns leaving this screen. */
  create-overlay account-avatar {
    max-width: 160px;
  }
  /* The tile's children are absolutely positioned, so the wrapper needs an
     explicit width or the avatar (width: 100%) collapses to 0x0. */
  create-overlay .create-tile {
    width: 160px;
  }
  create-overlay account-avatar .avatar-btn {
    width: 36px;
    height: 36px;
  }
  create-overlay account-avatar .avatar-btn-icon svg {
    width: 20px;
    height: 20px;
  }
  create-overlay account-avatar .avatar-btn[data-action="cancel-create"] {
    display: none !important;
  }
  create-overlay .create-dismiss {
    background: transparent;
    border: 0;
    padding: 8px 12px;
    border-radius: 8px;
    color: var(--fg-muted);
    font-size: 13rem;
    cursor: pointer;
  }
  create-overlay .create-dismiss:active {
    color: var(--fg-strong);
  }
  create-overlay .create-dismiss:disabled {
    opacity: 0.6;
  }
  create-overlay .overlay-update-indicator {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px 6px 14px;
    background-color: var(--surface-raised);
    color: var(--fg-strong);
    border: 1px solid var(--border);
    border-radius: 9999px;
    font-size: 13rem;
    cursor: pointer;
  }
  create-overlay .overlay-update-indicator[hidden] {
    display: none;
  }
  create-overlay .overlay-update-label {
    color: var(--fg);
    font-weight: 500;
  }
  create-overlay .overlay-update-action {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    border-radius: 9999px;
    padding: 6px 12px;
    font-weight: 600;
  }
  create-overlay .overlay-update-indicator:active .overlay-update-action {
    background-color: var(--accent-active);
  }
  create-overlay .overlay-google-login {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  create-overlay .overlay-google-login[inert] {
    opacity: 0.6;
  }
`

// Shown when the vault has no visible accounts: a one-tap create flow that
// reuses the existing account-avatar creating tile (same passkey, relay and
// journal logic), plus a low-emphasis dismiss that reveals the regular
// toolbar for the rest of this session.
export class CreateOverlay extends HTMLElement {
  #unsubStore = null
  #unsubPending = null
  #unsubLocale = null
  #tileObserver = null
  #tile = null
  #dismissBtn = null
  #updateIndicator = null
  #unsubUpdate = null
  #dismissed = false
  #wasVisible = false
  #closing = false
  #googleWrap = null
  #pomegranateBusy = false
  #unsubPomegranate = null

  connectedCallback () {
    injectComponentStyles('create-overlay', STYLES)
    this.innerHTML = `
      <button type="button" class="overlay-update-indicator" hidden>
        <span class="overlay-update-label"></span>
        <span class="overlay-update-action"></span>
      </button>
      <div class="create-main">
        <h2 class="create-title">
          <span class="create-title-icon" aria-hidden="true">${ICON_USER_PLUS}</span>
          <span class="create-title-text">Create your first account</span>
        </h2>
        <div class="create-tile"></div>
        <button type="button" class="create-dismiss">I already have an account</button>
      </div>
      <div class="overlay-google-login"><google-login-button></google-login-button></div>
    `
    this.#dismissBtn = this.querySelector('.create-dismiss')
    this.#dismissBtn.addEventListener('click', this.#onDismiss)
    this.#updateIndicator = this.querySelector('.overlay-update-indicator')
    this.#updateIndicator.addEventListener('click', applySwUpdate)
    this.#googleWrap = this.querySelector('.overlay-google-login')
    this.#unsubPomegranate = subscribePomegranateBusy(this.#setPomegranateBusy)
    document.addEventListener('pomegranate-account-added', this.#onPomegranateAdded)
    this.#unsubUpdate = subscribeSwUpdate(available =>
      this.#updateIndicator.toggleAttribute('hidden', !isUpdateAvailable(available))
    )
    this.#translate()
    this.#unsubLocale = subscribeLocaleChanged(() => this.#translate())

    this.#applyVisibility()
    this.#unsubStore = store.subscribe(() => this.#applyVisibility())
    this.#unsubPending = subscribePendingMutations(() => this.#applyVisibility())
  }

  disconnectedCallback () {
    this.#unsubStore?.()
    this.#unsubStore = null
    this.#unsubPending?.()
    this.#unsubPending = null
    this.#unsubLocale?.()
    this.#unsubLocale = null
    this.#dismissBtn?.removeEventListener('click', this.#onDismiss)
    this.#updateIndicator?.removeEventListener('click', applySwUpdate)
    this.#updateIndicator = null
    this.#unsubUpdate?.()
    this.#unsubUpdate = null
    this.#unsubPomegranate?.()
    this.#unsubPomegranate = null
    document.removeEventListener('pomegranate-account-added', this.#onPomegranateAdded)
    this.#googleWrap = null
    this.#removeTile()
  }

  #applyVisibility () {
    const accounts = store.list()
    const pendingNeedsUnlock = pendingMutationNeedsUnlock()
    // While the tile is saving, keep the overlay even though the journal may
    // hide the not-yet-committed account (or a pending mutation shows up).
    const ownCreateInFlight = this.#tile?.getAttribute('mode') === 'creating'
    const shouldShow = !this.#dismissed && (
      ownCreateInFlight ||
      shouldShowCreateOverlay(accounts, pendingNeedsUnlock, secrets.isUnlocked())
    )
    if (shouldShow) {
      this.#wasVisible = true
      this.#closing = false
      this.toggleAttribute('hidden', false)
      this.#ensureTile()
      return
    }
    if (this.#closing) return
    // Account created through the tile: keep the overlay covering the main
    // UI while asking the launcher to close the drawer, then hide.
    if (this.#wasVisible && !this.#dismissed && accounts.length > 0) {
      this.#closeAfterCreation()
      return
    }
    this.#wasVisible = false
    this.toggleAttribute('hidden', true)
    this.#removeTile()
  }

  #ensureTile () {
    if (this.#tile?.isConnected) return
    const tile = document.createElement('account-avatar')
    tile.setAttribute('mode', 'creating')
    this.querySelector('.create-tile').appendChild(tile)
    this.#tile = tile
    this.#watchTile(tile)
  }

  #removeTile () {
    this.#stopWatchingTile()
    this.#tile?.remove()
    this.#tile = null
  }

  #watchTile (tile) {
    this.#stopWatchingTile()
    this.#tileObserver = new MutationObserver(() => {
      this.#syncBusyState()
    })
    this.#tileObserver.observe(tile, { attributes: true, attributeFilter: ['aria-busy'] })
    this.#syncBusyState()
  }

  #stopWatchingTile () {
    this.#tileObserver?.disconnect()
    this.#tileObserver = null
  }

  #setPomegranateBusy = busy => {
    this.#pomegranateBusy = busy
    this.dataset.pomegranateBusy = String(busy)
    this.#syncBusyState()
  }

  #onPomegranateAdded = () => {
    if (!this.#wasVisible || this.hasAttribute('hidden')) return
    this.#closeAfterCreation()
  }

  #closeAfterCreation () {
    if (this.#closing) return
    this.#closing = true
    requestVaultClose().then(() => {
      this.#closing = false
      this.#wasVisible = false
      this.toggleAttribute('hidden', true)
      this.#removeTile()
    })
  }

  #syncBusyState () {
    const tileBusy = this.#tile?.hasAttribute('aria-busy') || false
    if (this.#dismissBtn) this.#dismissBtn.disabled = tileBusy || this.#pomegranateBusy
    if (this.#tile) this.#tile.inert = this.#pomegranateBusy
    if (this.#googleWrap) this.#googleWrap.inert = tileBusy
  }

  #onDismiss = () => {
    if (this.#dismissBtn.disabled) return
    this.#dismissed = true
    this.#applyVisibility()
  }

  #translate () {
    this.querySelector('.create-title-text').textContent = t('Create your first account')
    this.querySelector('.create-dismiss').textContent = t('I already have an account')
    this.querySelector('.overlay-update-label').textContent = swT('Update available')
    this.querySelector('.overlay-update-action').textContent = swT('Update')
  }
}

customElements.define('create-overlay', CreateOverlay)
