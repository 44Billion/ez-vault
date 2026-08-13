import { injectComponentStyles } from '../helpers/dom.js'
import { defineLocales, getT, subscribeLocaleChanged } from '../i18n/index.js'

const ICON_WARNING = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'
const ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" /><path d="M8 11v-4a4 4 0 0 1 8 0v4" /><path d="M12 16v.01" /></svg>'

export const passkeyFallbackLocales = defineLocales({
  'Continue without a passkey?': ['Continuer sans clé d’accès ?', 'Continuare senza passkey?', 'Ohne Passkey fortfahren?', '¿Continuar sin llave de acceso?', 'Prosseguir sem chave de acesso?', 'Продолжить без ключа доступа?', '不使用通行密钥继续？', '不使用通行密鑰繼續？', 'パスキーなしで続行しますか？', '패스키 없이 계속할까요?'],
  'If you plan to share this device, we recommend protecting your data with a passkey.': ['Si vous prévoyez de partager cet appareil, nous vous recommandons de protéger vos données avec une clé d’accès.', 'Se prevedi di condividere questo dispositivo, ti consigliamo di proteggere i tuoi dati con una passkey.', 'Wenn Sie dieses Gerät gemeinsam nutzen möchten, empfehlen wir, Ihre Daten mit einem Passkey zu schützen.', 'Si piensas compartir este dispositivo, te recomendamos proteger tus datos con una llave de acceso.', 'Se você pretende compartilhar este dispositivo, é recomendável proteger seus dados com uma chave de acesso.', 'Если вы планируете делиться этим устройством, рекомендуется защитить данные с помощью ключа доступа.', '如果您打算与他人共用此设备，建议使用通行密钥保护您的数据。', '如果您打算與他人共用此裝置，建議使用通行密鑰保護您的資料。', 'この端末を他の人と共有する場合は、パスキーでデータを保護することをおすすめします。', '이 기기를 다른 사람과 공유할 계획이라면 패스키로 데이터를 보호하는 것이 좋습니다.'],
  'Try passkey again': ['Réessayer', 'Riprova', 'Erneut versuchen', 'Volver a intentar', 'Tentar novamente', 'Повторить', '重试', '重試', '再試行', '다시 시도'],
  'Continue without passkey': ['Continuer sans clé d’accès', 'Continua senza passkey', 'Ohne Passkey fortfahren', 'Continuar sin llave de acceso', 'Continuar sem chave de acesso', 'Продолжить без ключа доступа', '不使用通行密钥继续', '不使用通行密鑰繼續', 'パスキーなしで続行', '패스키 없이 계속'],
  'Protect your account on this device': ['Protégez votre compte sur cet appareil', 'Proteggi il tuo account su questo dispositivo', 'Schützen Sie Ihr Konto auf diesem Gerät', 'Protege tu cuenta en este dispositivo', 'Proteja sua conta neste dispositivo', 'Защитите свою учётную запись на этом устройстве', '保护您在此设备上的账户', '保護您在此裝置上的帳戶', 'この端末上のアカウントを保護', '이 기기에서 계정 보호'],
  'A passkey usually uses biometrics or your device PIN to protect your account.': ['Une clé d’accès utilise généralement la biométrie ou le code PIN de votre appareil pour protéger votre compte.', 'Una passkey usa solitamente i dati biometrici o il PIN del dispositivo per proteggere il tuo account.', 'Ein Passkey verwendet normalerweise biometrische Daten oder die Geräte-PIN, um Ihr Konto zu schützen.', 'Una llave de acceso suele usar datos biométricos o el PIN de tu dispositivo para proteger tu cuenta.', 'Uma chave de acesso normalmente usa biometria ou o PIN do dispositivo para proteger sua conta.', 'Ключ доступа обычно использует биометрию или PIN-код устройства для защиты вашей учётной записи.', '通行密钥通常使用生物识别或设备 PIN 码来保护您的账户。', '通行密鑰通常使用生物辨識或裝置 PIN 碼來保護您的帳戶。', 'パスキーは通常、生体認証または端末の PIN を使ってアカウントを保護します。', '패스키는 일반적으로 생체 인식 또는 기기 PIN을 사용해 계정을 보호합니다.'],
  'Create passkey': ['Créer une clé d’accès', 'Crea una passkey', 'Passkey erstellen', 'Crear llave de acceso', 'Criar chave de acesso', 'Создать ключ доступа', '创建通行密钥', '建立通行密鑰', 'パスキーを作成', '패스키 만들기'],
  Recommended: ['Recommandé', 'Consigliato', 'Empfohlen', 'Recomendado', 'Recomendado', 'Рекомендуется', '推荐', '建議', '推奨', '권장']
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
  passkey-fallback-dialog .passkey-recommended-badge {
    display: none;
    margin-left: 8px;
    padding: 2px 7px;
    border-radius: 9999px;
    background-color: var(--accent-soft);
    color: var(--accent-fg);
    font-size: 11rem;
    font-weight: 600;
  }
  passkey-fallback-dialog[data-purpose="pomegranate"] .passkey-recommended-badge {
    display: inline-flex;
  }
  passkey-fallback-dialog[data-purpose="pomegranate"] .passkey-fallback-icon {
    color: var(--accent-fg);
  }
  passkey-fallback-dialog [data-choice="local"] {
    border: 1px solid var(--warning-fg);
    background-color: transparent;
    color: var(--warning-fg);
  }
  passkey-fallback-dialog [data-choice="local"]:active {
    background-color: var(--surface-interactive-active);
  }
  passkey-fallback-dialog[data-purpose="pomegranate"] [data-choice="local"] {
    border-color: var(--border);
    color: var(--fg-muted);
  }
`

export class PasskeyFallbackDialog extends HTMLElement {
  #dialog = null
  #resolve = null
  #unsubscribeLocale = null
  #purpose = 'fallback'

  connectedCallback () {
    injectComponentStyles('passkey-fallback-dialog', STYLES)
    this.innerHTML = `
      <dialog aria-labelledby="passkey-fallback-title" aria-describedby="passkey-fallback-description">
        <span class="passkey-fallback-icon" aria-hidden="true">${ICON_WARNING}</span>
        <h2 id="passkey-fallback-title"></h2>
        <p id="passkey-fallback-description"></p>
        <div class="passkey-fallback-actions">
          <button type="button" data-choice="retry">
            <span class="passkey-primary-label"></span>
            <span class="passkey-recommended-badge"></span>
          </button>
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

  request ({ purpose = 'fallback' } = {}) {
    if (this.#resolve) return Promise.reject(new Error('PASSKEY_FALLBACK_DIALOG_BUSY'))
    this.#purpose = purpose === 'pomegranate' ? 'pomegranate' : 'fallback'
    this.dataset.purpose = this.#purpose
    this.#translate()
    return new Promise(resolve => {
      this.#resolve = resolve
      this.#dialog.showModal()
      this.querySelector('[data-choice="retry"]')?.focus()
    })
  }

  #translate () {
    const pomegranate = this.#purpose === 'pomegranate'
    this.querySelector('.passkey-fallback-icon').innerHTML = pomegranate ? ICON_LOCK : ICON_WARNING
    this.querySelector('#passkey-fallback-title')?.replaceChildren(t(pomegranate ? 'Protect your account on this device' : 'Continue without a passkey?'))
    this.querySelector('#passkey-fallback-description')?.replaceChildren(t(pomegranate ? 'A passkey usually uses biometrics or your device PIN to protect your account.' : 'If you plan to share this device, we recommend protecting your data with a passkey.'))
    this.querySelector('.passkey-primary-label')?.replaceChildren(t(pomegranate ? 'Create passkey' : 'Try passkey again'))
    this.querySelector('.passkey-recommended-badge')?.replaceChildren(t('Recommended'))
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
    if (outside) this.#settle('local')
  }

  #onCancel = event => {
    event.preventDefault()
    this.#settle('local')
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

export function requestPomegranateProtectionChoice () {
  if (!instance?.isConnected) {
    instance = document.createElement('passkey-fallback-dialog')
    document.body.append(instance)
  }
  return instance.request({ purpose: 'pomegranate' })
}
