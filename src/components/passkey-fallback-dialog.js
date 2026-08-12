import { injectComponentStyles } from '../helpers/dom.js'
import { defineLocales, getT, subscribeLocaleChanged } from '../i18n/index.js'

const ICON_WARNING = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'

export const passkeyFallbackLocales = defineLocales({
  'Continue without a passkey?': ['Continuer sans clé d’accès ?', 'Continuare senza passkey?', 'Ohne Passkey fortfahren?', '¿Continuar sin passkey?', 'Prosseguir sem passkey?', 'Продолжить без ключа доступа?', '不使用通行密钥继续？', '不使用通行金鑰繼續？', 'パスキーなしで続行しますか？', '패스키 없이 계속할까요?'],
  'Anyone who can read this device’s site data will be able to recover your account secrets. You can try creating a passkey again later.': ['Toute personne pouvant lire les données de ce site sur cet appareil pourra récupérer les secrets de vos comptes. Vous pourrez réessayer de créer une clé d’accès plus tard.', 'Chiunque possa leggere i dati del sito su questo dispositivo potrà recuperare i segreti degli account. Potrai riprovare a creare una passkey in seguito.', 'Jeder, der die Websitedaten dieses Geräts lesen kann, kann Ihre Kontogeheimnisse wiederherstellen. Sie können später erneut einen Passkey erstellen.', 'Cualquiera que pueda leer los datos de este sitio en el dispositivo podrá recuperar los secretos de tus cuentas. Podrás volver a intentar crear una passkey más adelante.', 'Qualquer pessoa que consiga ler os dados deste site no dispositivo poderá recuperar os segredos das suas contas. Você poderá tentar criar uma passkey novamente mais tarde.', 'Любой, кто сможет прочитать данные этого сайта на устройстве, сможет восстановить секреты ваших учётных записей. Позже можно снова попробовать создать ключ доступа.', '任何能够读取此设备网站数据的人都能恢复你的账户机密。你可以稍后再次尝试创建通行密钥。', '任何能夠讀取此裝置網站資料的人都能復原你的帳戶機密。你可以稍後再次嘗試建立通行金鑰。', 'この端末のサイトデータを読める人は、アカウントの秘密情報を復元できます。パスキーの作成は後でもう一度試せます。', '이 기기의 사이트 데이터를 읽을 수 있는 사람은 계정 비밀을 복구할 수 있습니다. 나중에 패스키 생성을 다시 시도할 수 있습니다.'],
  'Try passkey again': ['Réessayer la clé d’accès', 'Riprova la passkey', 'Passkey erneut versuchen', 'Volver a intentar la passkey', 'Tentar passkey novamente', 'Повторить попытку с ключом доступа', '重试通行密钥', '重試通行金鑰', 'パスキーを再試行', '패스키 다시 시도'],
  'Continue without passkey': ['Continuer sans clé d’accès', 'Continua senza passkey', 'Ohne Passkey fortfahren', 'Continuar sin passkey', 'Continuar sem passkey', 'Продолжить без ключа доступа', '不使用通行密钥继续', '不使用通行金鑰繼續', 'パスキーなしで続行', '패스키 없이 계속']
})

const t = getT(passkeyFallbackLocales)

const STYLES = /* css */`
  passkey-fallback-dialog dialog {
    width: min(340px, calc(100vw - 32px));
    margin: auto;
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background-color: var(--surface-raised);
    color: var(--fg-strong);
    box-shadow: 0 12px 36px var(--shadow-strong);
  }
  passkey-fallback-dialog dialog::backdrop {
    background-color: var(--scrim-strong);
  }
  passkey-fallback-dialog .passkey-fallback-icon {
    display: flex;
    width: 40px;
    height: 40px;
    margin: 0 auto 16px;
    color: var(--warning-fg);
  }
  passkey-fallback-dialog .passkey-fallback-icon svg {
    width: 100%;
    height: 100%;
  }
  passkey-fallback-dialog h2 {
    margin: 0;
    text-align: center;
    font-size: 18rem;
  }
  passkey-fallback-dialog p {
    margin: 12px 0 20px;
    color: var(--fg);
    font-size: 14rem;
    line-height: 1.45;
    text-align: center;
  }
  passkey-fallback-dialog .passkey-fallback-actions {
    display: grid;
    gap: 10px;
    text-align: center;
  }
  passkey-fallback-dialog button {
    width: 100%;
    border-radius: 9999px;
    padding: 11px 16px;
    font-size: 14rem;
    font-weight: 600;
  }
  passkey-fallback-dialog [data-choice="retry"] {
    background-color: var(--accent);
    color: var(--fg-on-accent);
  }
  passkey-fallback-dialog [data-choice="retry"]:active {
    background-color: var(--accent-active);
  }
  passkey-fallback-dialog [data-choice="local"] {
    border: 1px solid var(--warning-fg);
    background-color: transparent;
    color: var(--warning-fg);
  }
  passkey-fallback-dialog [data-choice="local"]:active {
    background-color: var(--surface-interactive-active);
  }
`

export class PasskeyFallbackDialog extends HTMLElement {
  #dialog = null
  #resolve = null
  #unsubscribeLocale = null

  connectedCallback () {
    injectComponentStyles('passkey-fallback-dialog', STYLES)
    this.innerHTML = `
      <dialog aria-labelledby="passkey-fallback-title" aria-describedby="passkey-fallback-description">
        <span class="passkey-fallback-icon" aria-hidden="true">${ICON_WARNING}</span>
        <h2 id="passkey-fallback-title"></h2>
        <p id="passkey-fallback-description"></p>
        <div class="passkey-fallback-actions">
          <button type="button" data-choice="retry"></button>
          <button type="button" data-choice="local"></button>
        </div>
      </dialog>
    `
    this.#dialog = this.querySelector('dialog')
    this.#dialog.addEventListener('click', this.#onClick)
    this.#dialog.addEventListener('cancel', this.#onCancel)
    this.#translate()
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate())
  }

  disconnectedCallback () {
    this.#dialog?.removeEventListener('click', this.#onClick)
    this.#dialog?.removeEventListener('cancel', this.#onCancel)
    this.#unsubscribeLocale?.()
    this.#unsubscribeLocale = null
    this.#settle('cancel')
  }

  request () {
    if (this.#resolve) return Promise.reject(new Error('PASSKEY_FALLBACK_DIALOG_BUSY'))
    return new Promise(resolve => {
      this.#resolve = resolve
      this.#dialog.showModal()
      this.querySelector('[data-choice="retry"]')?.focus()
    })
  }

  #translate () {
    this.querySelector('#passkey-fallback-title')?.replaceChildren(t('Continue without a passkey?'))
    this.querySelector('#passkey-fallback-description')?.replaceChildren(t('Anyone who can read this device’s site data will be able to recover your account secrets. You can try creating a passkey again later.'))
    this.querySelector('[data-choice="retry"]')?.replaceChildren(t('Try passkey again'))
    this.querySelector('[data-choice="local"]')?.replaceChildren(t('Continue without passkey'))
  }

  #onClick = event => {
    const choice = event.target.closest('button[data-choice]')?.dataset.choice
    if (choice) {
      this.#settle(choice)
      return
    }
    if (event.target !== this.#dialog) return
    const rect = this.#dialog.getBoundingClientRect()
    const outside = event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom
    if (outside) this.#settle('cancel')
  }

  #onCancel = event => {
    event.preventDefault()
    this.#settle('cancel')
  }

  #settle (choice) {
    if (!this.#resolve) return
    const resolve = this.#resolve
    this.#resolve = null
    this.#dialog?.close()
    resolve(choice)
  }
}

if (!customElements.get('passkey-fallback-dialog')) {
  customElements.define('passkey-fallback-dialog', PasskeyFallbackDialog)
}

let instance = null

export function requestPasskeyFallback () {
  if (!instance?.isConnected) {
    instance = document.createElement('passkey-fallback-dialog')
    document.body.append(instance)
  }
  return instance.request()
}
