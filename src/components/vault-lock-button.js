import * as secrets from '../services/secrets.js'
import {
  isExpectedPasskeyRegistrationFailure
} from '../services/passkey.js'
import {
  hasPendingMutation,
  subscribePendingMutations
} from '../services/account-mutations.js'
import { lockAndCloseVault } from '../services/vault-lock.js'
import * as toast from './shared/toast.js'
import { injectComponentStyles } from '../helpers/dom.js'
import { defineLocales, getT, subscribeLocaleChanged } from '../i18n/index.js'

const ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 1 1 8 0v4" /></svg>'

export const vaultLockLocales = defineLocales({
  Lock: ['Verrouiller', 'Blocca', 'Sperren', 'Bloquear', 'Bloquear', 'Заблокировать', '锁定', '鎖定', 'ロック', '잠그기'],
  'Could not lock vault': ['Impossible de verrouiller le coffre', 'Impossibile bloccare il vault', 'Tresor konnte nicht gesperrt werden', 'No se pudo bloquear la bóveda', 'Não foi possível bloquear o cofre', 'Не удалось заблокировать хранилище', '无法锁定保险库', '無法鎖定保險庫', 'ボールトをロックできませんでした', '볼트를 잠글 수 없습니다'],
  'A passkey is required to lock the vault.': ['Une clé d’accès est nécessaire pour verrouiller le coffre.', 'Per bloccare il vault è necessaria una passkey.', 'Zum Sperren des Tresors ist ein Passkey erforderlich.', 'Se necesita una llave de acceso para bloquear la bóveda.', 'Uma chave de acesso é obrigatória para bloquear o cofre.', 'Для блокировки хранилища требуется ключ доступа.', '锁定保险库需要通行密钥。', '鎖定保險庫需要通行密鑰。', 'ボールトをロックするにはパスキーが必要です。', '볼트를 잠그려면 패스키가 필요합니다.']
})

const t = getT(vaultLockLocales)

const STYLES = /* css */`
  vault-lock-button {
    position: fixed;
    left: 50%;
    bottom: 16px;
    z-index: 100;
    transform: translateX(-50%);
  }
  vault-lock-button[hidden] {
    display: none;
  }
  vault-lock-button .vault-lock-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 38px;
    padding: 8px 15px;
    border: 1px solid var(--border);
    border-radius: 9999px;
    background-color: var(--surface-raised);
    color: var(--fg-strong);
    box-shadow: 0 4px 14px var(--shadow);
    font-size: 13rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  vault-lock-button .vault-lock-button:active:not(:disabled) {
    background-color: var(--surface-interactive-active);
  }
  vault-lock-button .vault-lock-button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  vault-lock-button .vault-lock-icon {
    display: inline-flex;
    width: 17px;
    height: 17px;
  }
  vault-lock-button .vault-lock-icon svg {
    width: 100%;
    height: 100%;
  }
  vault-lock-button .vault-lock-content.is-pulsing {
    animation: vault-lock-pulse 900ms ease-in-out infinite alternate;
  }
  vault-lock-button .vault-lock-content {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  @keyframes vault-lock-pulse {
    from { opacity: 0.45; }
    to { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    vault-lock-button .vault-lock-content.is-pulsing { animation: none; }
  }
`

export class VaultLockButton extends HTMLElement {
  #button = null
  #content = null
  #busy = false
  #flowDisabled = false
  #pendingMutation = false
  #unsubscribeSecrets = null
  #unsubscribePending = null
  #unsubscribeLocale = null

  connectedCallback () {
    injectComponentStyles('vault-lock-button', STYLES)
    this.innerHTML = `
      <button type="button" class="vault-lock-button">
        <span class="vault-lock-content">
          <span class="vault-lock-icon" aria-hidden="true">${ICON_LOCK}</span>
          <span class="vault-lock-label"></span>
        </span>
      </button>
    `
    this.#button = this.querySelector('button')
    this.#content = this.querySelector('.vault-lock-content')
    this.#button.addEventListener('click', this.#onClick)
    this.#pendingMutation = hasPendingMutation()
    this.#unsubscribeSecrets = secrets.subscribe(() => this.#syncState())
    this.#unsubscribePending = subscribePendingMutations(() => {
      this.#pendingMutation = hasPendingMutation()
      this.#syncState()
    })
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate())
    this.#translate()
    this.#syncState()
  }

  disconnectedCallback () {
    this.#button?.removeEventListener('click', this.#onClick)
    this.#unsubscribeSecrets?.()
    this.#unsubscribePending?.()
    this.#unsubscribeLocale?.()
    this.#unsubscribeSecrets = null
    this.#unsubscribePending = null
    this.#unsubscribeLocale = null
  }

  get disabled () {
    return this.#flowDisabled
  }

  set disabled (value) {
    this.#flowDisabled = Boolean(value)
    this.#syncState()
  }

  #translate () {
    const label = t('Lock')
    this.querySelector('.vault-lock-label')?.replaceChildren(label)
    if (this.#button) {
      this.#button.title = label
      this.#button.setAttribute('aria-label', label)
    }
  }

  #syncState () {
    this.hidden = !secrets.isUnlocked()
    if (this.#button) {
      this.#button.disabled = this.#busy || this.#flowDisabled || this.#pendingMutation
    }
  }

  #onClick = async () => {
    if (this.#busy || this.#button?.disabled) return
    this.#busy = true
    this.#content?.classList.add('is-pulsing')
    this.#syncState()
    try {
      await lockAndCloseVault()
    } catch (err) {
      const detail = isExpectedPasskeyRegistrationFailure(err)
        ? t('A passkey is required to lock the vault.')
        : err?.message ?? String(err)
      if (!isExpectedPasskeyRegistrationFailure(err)) {
        console.error('vault lock failed', err)
      }
      toast.error(t('Could not lock vault'), detail)
    } finally {
      this.#busy = false
      this.#content?.classList.remove('is-pulsing')
      this.#syncState()
    }
  }
}

if (!customElements.get('vault-lock-button')) {
  customElements.define('vault-lock-button', VaultLockButton)
}
