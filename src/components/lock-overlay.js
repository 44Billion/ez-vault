import * as store from '../services/accounts-store.js'
import * as secrets from '../services/secrets.js'
import * as passkey from '../services/passkey.js'
import { filterVisibleAccounts, pendingMutationNeedsUnlock, subscribePendingMutations } from '../services/account-mutations.js'
import * as toast from './shared/toast.js'
import { injectComponentStyles } from '../helpers/dom.js'
import { defineLocales, getT, subscribeLocaleChanged } from '../i18n/index.js'
import { swUpdateLocales } from '../i18n/sw-update.js'
import { requestVaultClose } from '../services/messenger.js'
import { applySwUpdate, isUpdateAvailable, subscribeSwUpdate } from '../services/sw-manager.js'

const ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>'

export const lockOverlayLocales = defineLocales({
  'Vault locked': ['Coffre verrouillé', 'Vault bloccato', 'Tresor gesperrt', 'Bóveda bloqueada', 'Cofre bloqueado', 'Хранилище заблокировано', '保险库已锁定', '保險庫已鎖定', '保管庫はロックされています', '볼트 잠김'],
  'Unlock your encrypted account secrets with your passkey.': ['Déverrouillez les secrets chiffrés de vos comptes avec votre clé d’accès.', 'Sblocca con la passkey i segreti cifrati dei tuoi account.', 'Entsperre deine verschlüsselten Kontogeheimnisse mit deinem Passkey.', 'Desbloquea con tu llave de acceso los secretos cifrados de tus cuentas.', 'Desbloqueie com a sua chave de acesso os segredos criptografados das suas contas.', 'Разблокируйте зашифрованные секреты учётных записей с помощью ключа доступа.', '使用通行密钥解锁加密的账户机密。', '使用通行密鑰解鎖加密的帳戶機密。', 'パスキーで暗号化されたアカウントの秘密情報をロック解除してください。', '패스키로 암호화된 계정 비밀을 잠금 해제하세요.'],
  'Unlock with passkey': ['Déverrouiller avec la clé d’accès', 'Sblocca con passkey', 'Mit Passkey entsperren', 'Desbloquear con llave de acceso', 'Desbloquear com chave de acesso', 'Разблокировать ключом доступа', '使用通行密钥解锁', '使用通行密鑰解鎖', 'パスキーでロック解除', '패스키로 잠금 해제'],
  'Could not unlock': ['Impossible de déverrouiller', 'Impossibile sbloccare', 'Entsperren nicht möglich', 'No se pudo desbloquear', 'Não foi possível desbloquear', 'Не удалось разблокировать', '无法解锁', '無法解鎖', 'ロックを解除できませんでした', '잠금을 해제하지 못했습니다']
})

const t = getT(lockOverlayLocales)
const swT = getT(swUpdateLocales)

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
    background-color: var(--surface-sunken);
    color: var(--fg-strong);
  }
  lock-overlay[hidden] {
    display: none;
  }
  lock-overlay .lock-badge {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    background-color: var(--surface);
    box-shadow: 0 0 0 2px var(--accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-fg);
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
    color: var(--fg-muted);
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
    background-color: var(--success);
    color: var(--fg-on-accent);
    border-radius: 9999px;
    padding: 12px 24px;
    font-size: 14rem;
    font-weight: 600;
    min-width: 200px;
  }
  lock-overlay .lock-unlock:active {
    background-color: var(--success-active);
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
  lock-overlay .overlay-update-indicator {
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
  lock-overlay .overlay-update-indicator[hidden] {
    display: none;
  }
  lock-overlay .overlay-update-label {
    color: var(--fg);
    font-weight: 500;
  }
  lock-overlay .overlay-update-action {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    border-radius: 9999px;
    padding: 6px 12px;
    font-weight: 600;
  }
  lock-overlay .overlay-update-indicator:active .overlay-update-action {
    background-color: var(--accent-active);
  }
`

// Visibility rule: shown when at least one non-npub account exists *and* the
// vault is locked. An npub-only state (or an empty store) leaves the regular
// UI fully reachable.
function shouldShow () {
  if (secrets.isUnlocked()) return false
  if (pendingMutationNeedsUnlock()) return true
  return filterVisibleAccounts(store.list()).some(a => a.type !== 'npub')
}

export class LockOverlay extends HTMLElement {
  #unsubStore = null
  #unsubSecrets = null
  #unsubPending = null
  #unlockBtn = null
  #unlockIcon = null
  #unsubLocale = null
  #updateIndicator = null
  #unsubUpdate = null
  #wasVisible = false
  #closing = false

  connectedCallback () {
    injectComponentStyles('lock-overlay', STYLES)
    this.innerHTML = `
      <button type="button" class="overlay-update-indicator" hidden>
        <span class="overlay-update-label"></span>
        <span class="overlay-update-action"></span>
      </button>
      <span class="lock-badge" aria-hidden="true">${ICON_LOCK}</span>
      <h2 class="lock-title">Vault locked</h2>
      <p class="lock-hint">Unlock your encrypted account secrets with your passkey.</p>
      <button type="button" class="lock-unlock">
        <span class="lock-unlock-icon">${ICON_LOCK}</span>
        <span>Unlock with passkey</span>
      </button>
    `
    this.#unlockBtn = this.querySelector('.lock-unlock')
    this.#unlockIcon = this.querySelector('.lock-unlock-icon')
    this.#unlockBtn.addEventListener('click', this.#onUnlock)
    this.#updateIndicator = this.querySelector('.overlay-update-indicator')
    this.#updateIndicator.addEventListener('click', applySwUpdate)
    this.#unsubUpdate = subscribeSwUpdate(available =>
      this.#updateIndicator.toggleAttribute('hidden', !isUpdateAvailable(available))
    )
    this.#translate()
    this.#unsubLocale = subscribeLocaleChanged(() => this.#translate())

    this.#applyVisibility()
    this.#unsubStore = store.subscribe(() => this.#applyVisibility())
    this.#unsubSecrets = secrets.subscribe(() => this.#applyVisibility())
    this.#unsubPending = subscribePendingMutations(() => this.#applyVisibility())
  }

  disconnectedCallback () {
    this.#unsubStore?.()
    this.#unsubStore = null
    this.#unsubSecrets?.()
    this.#unsubSecrets = null
    this.#unsubPending?.()
    this.#unsubPending = null
    this.#unlockBtn?.removeEventListener('click', this.#onUnlock)
    this.#updateIndicator?.removeEventListener('click', applySwUpdate)
    this.#updateIndicator = null
    this.#unsubUpdate?.()
    this.#unsubUpdate = null
    this.#unsubLocale?.()
    this.#unsubLocale = null
  }

  #applyVisibility () {
    const show = shouldShow()
    if (show) {
      this.#wasVisible = true
      this.#closing = false
      this.toggleAttribute('hidden', false)
      return
    }
    if (this.#closing) return
    // Successful unlock: keep the overlay covering the main UI while asking
    // the launcher to close the drawer, then hide.
    if (this.#wasVisible && secrets.isUnlocked()) {
      this.#closing = true
      requestVaultClose().then(() => {
        this.#closing = false
        this.#wasVisible = false
        this.toggleAttribute('hidden', true)
      })
      return
    }
    this.#wasVisible = false
    this.toggleAttribute('hidden', true)
  }

  #onUnlock = async () => {
    if (this.#unlockBtn.disabled) return
    this.#unlockBtn.disabled = true
    this.#unlockIcon.classList.add('pulsate')
    try {
      await passkey.unlock()
      // Visibility flips automatically via the secrets subscription.
      // Fire-and-forget any staged icon refresh — piggybacks on the UV
      // prompt the unlock just triggered, in case `signalCurrentUserDetails`
      // isn't fully silent on some platform.
      passkey.flushPendingIconUpdate().catch(err => {
        console.warn('icon signal failed', err?.message ?? err)
      })
    } catch (err) {
      console.error('passkey unlock failed', err?.message ?? err)
      toast.error(t('Could not unlock'), err?.message ?? '')
    } finally {
      this.#unlockBtn.disabled = false
      this.#unlockIcon.classList.remove('pulsate')
    }
  }

  #translate () {
    this.querySelector('.lock-title').textContent = t('Vault locked')
    this.querySelector('.lock-hint').textContent = t('Unlock your encrypted account secrets with your passkey.')
    this.querySelector('.lock-unlock span:last-child').textContent = t('Unlock with passkey')
    this.querySelector('.overlay-update-label').textContent = swT('Update available')
    this.querySelector('.overlay-update-action').textContent = swT('Update')
  }
}

customElements.define('lock-overlay', LockOverlay)
