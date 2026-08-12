import {
  continueWithGoogle,
  subscribePomegranateBusy
} from '../services/pomegranate.js'
import * as toast from './shared/toast.js'
import { injectComponentStyles } from '../helpers/dom.js'
import { defineLocales, getT, subscribeLocaleChanged } from '../i18n/index.js'

export const googleLoginLocales = defineLocales({
  'Continue with Google': ['Continuer avec Google', 'Continua con Google', 'Mit Google fortfahren', 'Continuar con Google', 'Continuar com o Google', 'Продолжить с Google', '使用 Google 继续', '使用 Google 繼續', 'Google で続行', 'Google로 계속'],
  'Could not continue with Google': ['Impossible de continuer avec Google', 'Impossibile continuare con Google', 'Mit Google konnte nicht fortgefahren werden', 'No se pudo continuar con Google', 'Não foi possível continuar com o Google', 'Не удалось продолжить с Google', '无法使用 Google 继续', '無法使用 Google 繼續', 'Google で続行できませんでした', 'Google로 계속할 수 없습니다']
})

const t = getT(googleLoginLocales)

// Tabler outline brand-google icon, inlined like the other vault icons so it
// inherits currentColor without introducing a component framework.
const ICON_BRAND_GOOGLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.945 11a9 9 0 1 1 -3.284 -5.997l-2.655 2.392a5.5 5.5 0 1 0 2.119 6.605h-4.125v-3h7.945" /></svg>'

const STYLES = /* css */`
  google-login-button .google-login-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    background-color: transparent;
    color: var(--fg);
    font-size: 13rem;
    cursor: pointer;
  }
  google-login-button .google-login-button:active {
    background-color: var(--surface-interactive-active);
    color: var(--fg-strong);
  }
  google-login-button .google-login-button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  google-login-button .google-login-content,
  google-login-button .google-login-icon {
    display: inline-flex;
    align-items: center;
  }
  google-login-button .google-login-content {
    gap: 8px;
  }
  google-login-button .google-login-icon {
    width: 17px;
    height: 17px;
  }
  google-login-button .google-login-icon svg {
    display: block;
    width: 100%;
    height: 100%;
  }
`

export class GoogleLoginButton extends HTMLElement {
  #button = null
  #content = null
  #label = null
  #busy = false
  #unsubBusy = null
  #unsubLocale = null

  connectedCallback () {
    injectComponentStyles('google-login-button', STYLES)
    this.innerHTML = `
      <button type="button" class="google-login-button">
        <span class="google-login-content">
          <span class="google-login-icon" aria-hidden="true">${ICON_BRAND_GOOGLE}</span>
          <span class="google-login-label"></span>
        </span>
      </button>
    `
    this.#button = this.querySelector('.google-login-button')
    this.#content = this.querySelector('.google-login-content')
    this.#label = this.querySelector('.google-login-label')
    this.#button.addEventListener('click', this.#start)
    this.#unsubBusy = subscribePomegranateBusy(this.#setBusy)
    this.#unsubLocale = subscribeLocaleChanged(() => this.#translate())
    this.#translate()
  }

  disconnectedCallback () {
    this.#button?.removeEventListener('click', this.#start)
    this.#unsubBusy?.()
    this.#unsubBusy = null
    this.#unsubLocale?.()
    this.#unsubLocale = null
    this.#button = null
    this.#content = null
    this.#label = null
  }

  #setBusy = busy => {
    this.#busy = busy
    if (this.#button) this.#button.disabled = busy
    this.#content?.classList.toggle('pulsate', busy)
  }

  #translate () {
    if (this.#label) this.#label.textContent = t('Continue with Google')
  }

  #start = async () => {
    if (this.#busy) return
    try {
      const result = await continueWithGoogle()
      document.dispatchEvent(new CustomEvent('pomegranate-account-added', { detail: result }))
    } catch (err) {
      if (err?.code === 'POMEGRANATE_CANCELLED') return
      console.warn('pomegranate flow failed', err?.code || err?.message || err)
      toast.error(t('Could not continue with Google'), err?.code || '')
    }
  }
}

customElements.define('google-login-button', GoogleLoginButton)
