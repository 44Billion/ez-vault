import * as store from '../../services/accounts-store.js'
import * as nostr from 'libp2r2p/key'
import * as passkey from '../../services/passkey.js'
import * as secrets from '../../services/secrets.js'
import {
  HostSession,
  buildSyncAccountPayload
} from '../../services/nostrpair.js'
import {
  createIntakeToken,
  abortIntake,
  prepareBareKey,
  commitPrepared
} from '../../services/account-intake.js'
import { generateQrDataUrl } from '../../helpers/qrcode.js'
import { injectComponentStyles } from '../../helpers/dom.js'
import { detectPlatform } from '../../helpers/platform.js'
import * as toast from '../shared/toast.js'
import { defineLocales, getT, subscribeLocaleChanged } from '../../i18n/index.js'

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'

const FLASH_MS = 1500
const CLOSE_RESET_MS = 300

export const syncHostLocales = defineLocales({
  Cancel: ['Annuler', 'Annulla', 'Abbrechen', 'Cancelar', 'Cancelar', 'Отмена', '取消', '取消', 'キャンセル', '취소'],
  'Scan the QR code or paste the URL on the other device': ['Scannez le code QR ou collez l’URL sur l’autre appareil', 'Scansiona il codice QR o incolla l’URL sull’altro dispositivo', 'QR-Code scannen oder URL auf dem anderen Gerät einfügen', 'Escanea el código QR o pega la URL en el otro dispositivo', 'Leia o QR code ou cole a URL no outro dispositivo', 'Отсканируйте QR-код или вставьте URL на другом устройстве', '在另一台设备上扫描二维码或粘贴 URL', '在另一台裝置上掃描 QR 碼或貼上 URL', '別のデバイスで QR コードをスキャンするか URL を貼り付けてください', '다른 기기에서 QR 코드를 스캔하거나 URL을 붙여 넣으세요'],
  'Copy URL': ['Copier l’URL', 'Copia URL', 'URL kopieren', 'Copiar URL', 'Copiar URL', 'Копировать URL', '复制 URL', '複製 URL', 'URL をコピー', 'URL 복사'],
  'Type this code on the other device:': ['Saisissez ce code sur l’autre appareil :', 'Digita questo codice sull’altro dispositivo:', 'Diesen Code auf dem anderen Gerät eingeben:', 'Escribe este código en el otro dispositivo:', 'Digite este código no outro dispositivo:', 'Введите этот код на другом устройстве:', '在另一台设备上输入此代码：', '在另一台裝置上輸入此代碼：', '別のデバイスでこのコードを入力してください：', '다른 기기에 이 코드를 입력하세요:'],
  'Copy code': ['Copier le code', 'Copia codice', 'Code kopieren', 'Copiar código', 'Copiar código', 'Копировать код', '复制代码', '複製代碼', 'コードをコピー', '코드 복사'],
  'Other device connected: exchanging trust…': ['Autre appareil connecté : échange de confiance…', 'Altro dispositivo connesso: scambio di fiducia…', 'Anderes Gerät verbunden: Vertrauen wird ausgetauscht…', 'Otro dispositivo conectado: intercambiando confianza…', 'Outro dispositivo conectado: trocando confiança…', 'Другое устройство подключено: обмен доверием…', '另一台设备已连接：正在交换信任信息…', '另一台裝置已連線：正在交換信任資訊…', '別のデバイスが接続されました：信頼情報を交換中…', '다른 기기가 연결됨: 신뢰 정보 교환 중…'],
  'Waiting: type the code above on the other device.': ['En attente : saisissez le code ci-dessus sur l’autre appareil.', 'In attesa: digita il codice qui sopra sull’altro dispositivo.', 'Warten: Den obigen Code auf dem anderen Gerät eingeben.', 'Esperando: escribe el código anterior en el otro dispositivo.', 'Aguardando: digite o código acima no outro dispositivo.', 'Ожидание: введите указанный выше код на другом устройстве.', '等待中：请在另一台设备上输入上方代码。', '等待中：請在另一台裝置上輸入上方代碼。', '待機中：別のデバイスで上のコードを入力してください。', '대기 중: 다른 기기에 위 코드를 입력하세요.'],
  'Pairing channel error: try again.': ['Erreur du canal d’association : réessayez.', 'Errore del canale di associazione: riprova.', 'Fehler im Kopplungskanal: Erneut versuchen.', 'Error del canal de emparejamiento: inténtalo de nuevo.', 'Erro no canal de pareamento: tente novamente.', 'Ошибка канала сопряжения: попробуйте ещё раз.', '配对通道出错：请重试。', '配對通道錯誤：請重試。', 'ペアリングチャネルエラー：もう一度お試しください。', '페어링 채널 오류: 다시 시도하세요.'],
  'Waiting for the other device to scan or paste the URL.': ['En attente du scan ou du collage de l’URL par l’autre appareil.', 'In attesa che l’altro dispositivo scansioni o incolli l’URL.', 'Warten, bis das andere Gerät die URL scannt oder einfügt.', 'Esperando a que el otro dispositivo escanee o pegue la URL.', 'Aguardando o outro dispositivo ler ou colar a URL.', 'Ожидание сканирования или вставки URL на другом устройстве.', '正在等待另一台设备扫描或粘贴 URL。', '正在等待另一台裝置掃描或貼上 URL。', '別のデバイスが URL をスキャンまたは貼り付けるのを待っています。', '다른 기기에서 URL을 스캔하거나 붙여 넣기를 기다리는 중입니다.'],
  'Importing accounts from the other device…': ['Importation des comptes de l’autre appareil…', 'Importazione degli account dall’altro dispositivo…', 'Konten vom anderen Gerät werden importiert…', 'Importando cuentas del otro dispositivo…', 'Importando contas do outro dispositivo…', 'Импорт учётных записей с другого устройства…', '正在从另一台设备导入账户…', '正在從另一台裝置匯入帳戶…', '別のデバイスからアカウントをインポート中…', '다른 기기에서 계정 가져오는 중…'],
  'Devices synced': ['Appareils synchronisés', 'Dispositivi sincronizzati', 'Geräte synchronisiert', 'Dispositivos sincronizados', 'Dispositivos sincronizados', 'Устройства синхронизированы', '设备已同步', '裝置已同步', 'デバイスを同期しました', '기기 동기화 완료'],
  'Synced: imported {{count}} accounts': ['Synchronisation terminée : {{count}} comptes importés', 'Sincronizzazione completata: importati {{count}} account', 'Synchronisiert: {{count}} Konten importiert', 'Sincronizado: se importaron {{count}} cuentas', 'Sincronizado: {{count}} contas importadas', 'Синхронизация завершена: импортировано учётных записей — {{count}}', '同步完成：已导入 {{count}} 个账户', '同步完成：已匯入 {{count}} 個帳戶', '同期完了：{{count}} 件のアカウントをインポートしました', '동기화 완료: 계정 {{count}}개를 가져왔습니다'],
  '{{summary}} ({{count}} failed)': ['{{summary}} ({{count}} échecs)', '{{summary}} ({{count}} non riusciti)', '{{summary}} ({{count}} fehlgeschlagen)', '{{summary}} ({{count}} fallidos)', '{{summary}} ({{count}} falharam)', '{{summary}} (ошибок: {{count}})', '{{summary}}（{{count}} 个失败）', '{{summary}}（{{count}} 個失敗）', '{{summary}}（{{count}} 件失敗）', '{{summary}} ({{count}}개 실패)'],
  'Done.': ['Terminé.', 'Fatto.', 'Fertig.', 'Listo.', 'Concluído.', 'Готово.', '完成。', '完成。', '完了しました。', '완료.'],
  'Sync failed': ['Échec de la synchronisation', 'Sincronizzazione non riuscita', 'Synchronisierung fehlgeschlagen', 'Error de sincronización', 'Falha na sincronização', 'Ошибка синхронизации', '同步失败', '同步失敗', '同期に失敗しました', '동기화 실패'],
  'Sync cancelled': ['Synchronisation annulée', 'Sincronizzazione annullata', 'Synchronisierung abgebrochen', 'Sincronización cancelada', 'Sincronização cancelada', 'Синхронизация отменена', '同步已取消', '同步已取消', '同期をキャンセルしました', '동기화 취소됨'],
  'Pairing cancelled': ['Association annulée', 'Associazione annullata', 'Kopplung abgebrochen', 'Emparejamiento cancelado', 'Pareamento cancelado', 'Сопряжение отменено', '配对已取消', '配對已取消', 'ペアリングをキャンセルしました', '페어링 취소됨'],
  'The passkey prompt was cancelled.': ['L’invite de clé d’accès a été annulée.', 'La richiesta della passkey è stata annullata.', 'Die Passkey-Abfrage wurde abgebrochen.', 'Se canceló la solicitud de passkey.', 'A solicitação de passkey foi cancelada.', 'Запрос ключа доступа отменён.', '通行密钥提示已取消。', '通行金鑰提示已取消。', 'パスキーの確認がキャンセルされました。', '패스키 요청이 취소되었습니다.'],
  'Pairing failed': ['Échec de l’association', 'Associazione non riuscita', 'Kopplung fehlgeschlagen', 'Error de emparejamiento', 'Falha no pareamento', 'Ошибка сопряжения', '配对失败', '配對失敗', 'ペアリングに失敗しました', '페어링 실패']
})

const t = getT(syncHostLocales)

const STYLES = /* css */`
  sync-host {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  sync-host[open] {
    max-height: 540px;
  }
  sync-host .host-panel {
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  sync-host .host-header {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  sync-host .host-title {
    font-size: 13rem;
    font-weight: 600;
    color: var(--fg-strong);
  }
  sync-host .host-cancel {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: var(--surface-interactive);
    color: var(--fg-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  sync-host .host-cancel:active {
    background-color: var(--surface-interactive-active);
  }
  sync-host .host-cancel svg {
    width: 12px;
    height: 12px;
  }
  sync-host .host-qr-wrap {
    align-self: center;
    padding: 8px;
    background-color: var(--surface-inverse);
    border-radius: 8px;
  }
  sync-host .host-qr {
    display: block;
    width: 200px;
    height: 200px;
    image-rendering: pixelated;
  }
  sync-host .host-url-row {
    position: relative;
  }
  sync-host .host-url {
    width: 100%;
    padding-right: 42px;
    background-color: var(--surface-interactive);
    font-size: 12rem;
  }
  sync-host .host-copy {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: 5px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: transparent;
    color: var(--fg-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  sync-host .host-copy:active {
    background-color: var(--surface-interactive-active);
  }
  sync-host .host-copy.is-success {
    color: var(--success-fg);
  }
  sync-host .host-copy svg {
    width: 16px;
    height: 16px;
  }
  sync-host .host-panel-gap-reset {
    display: flex;
    flex-direction: column;
  }
  /* Pair code section: collapsed until we have the joiner's pubkey and can
     derive the code. The transition mirrors the host's max-height animation
     so the reveal is one smooth motion. */
  sync-host .host-code-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-height 280ms ease-out, opacity 200ms ease-out;
  }
  sync-host[data-code-ready="true"] .host-code-section {
    max-height: 80px;
    opacity: 1;
    margin-bottom: 10px;
  }
  sync-host .host-code-label {
    font-size: 14rem;
    font-weight: 600;
    color: var(--fg);
  }
  /* 3-column grid centers the digits even though the copy button only sits
     on the right (column 1 mirrors column 3's button width). */
  sync-host .host-code {
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    align-items: center;
    background-color: var(--surface-interactive);
    color: var(--fg-strong);
    padding: 8px;
    border-radius: 6px;
  }
  sync-host .host-code-text {
    grid-column: 2;
    text-align: center;
    letter-spacing: 0.4em;
    font-size: 28rem;
    font-variant-numeric: tabular-nums;
  }
  sync-host .host-code-copy {
    grid-column: 3;
    justify-self: end;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: transparent;
    color: var(--fg-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  sync-host .host-code-copy:active {
    background-color: var(--surface-interactive-active);
  }
  sync-host .host-code-copy.is-success {
    color: var(--success-fg);
  }
  sync-host .host-code-copy svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  sync-host .host-status {
    font-size: 12rem;
    align-self: center;
    color: var(--fg);
    min-height: 16px;
  }
  sync-host .host-status.is-error { color: var(--error-fg); }
  sync-host .host-status.is-success { color: var(--success-fg); }
`

const TEMPLATE = /* html */`
  <div class="host-panel">
    <div class="host-header">
      <button class="host-cancel" type="button" title="Cancel">${ICON_X}</button>
      <span class="host-title">Scan the QR code or paste the URL on the other device</span>
    </div>
    <div class="host-qr-wrap"><img class="host-qr" alt="" /></div>
    <div class="host-url-row">
      <input class="host-url" readonly />
      <button class="host-copy" type="button" title="Copy URL">${ICON_COPY}</button>
    </div>
    <div class="host-panel-gap-reset">
      <div class="host-code-section">
        <span class="host-code-label">Type this code on the other device:</span>
        <div class="host-code">
          <span class="host-code-text">------</span>
          <button class="host-code-copy" type="button" title="Copy code">${ICON_COPY}</button>
        </div>
      </div>
      <div class="host-status"></div>
    </div>
  </div>
`

export class SyncHost extends HTMLElement {
  #qrImage
  #urlInput
  #copyBtn
  #cancelBtn
  #codeText
  #codeCopyBtn
  #status
  #copyTimer = null
  #codeCopyTimer = null
  #resetTimer = null
  #session = null
  #openToken = null
  // Peer signer announced over `register_trusted_signer`; folded into the
  // commit when the exchange request lands so trust + secrets persist
  // (or roll back) together.
  #peerSigner = null
  #intakeToken = null
  #unsubscribeLocale = null
  #statusKey = ''
  #statusValues

  // Wired by the parent sync-panel so cancelling here re-enables sibling
  // toolbar buttons / restores the list.
  list = null
  toolbarButtons = []
  onClosed = null

  connectedCallback () {
    injectComponentStyles('sync-host', STYLES)
    this.innerHTML = TEMPLATE
    this.#qrImage = this.querySelector('.host-qr')
    this.#urlInput = this.querySelector('.host-url')
    this.#copyBtn = this.querySelector('.host-copy')
    this.#cancelBtn = this.querySelector('.host-cancel')
    this.#codeText = this.querySelector('.host-code-text')
    this.#codeCopyBtn = this.querySelector('.host-code-copy')
    this.#status = this.querySelector('.host-status')

    this.#cancelBtn.addEventListener('click', () => this.close())
    this.#copyBtn.addEventListener('click', this.#onCopyUrl)
    this.#urlInput.addEventListener('focus', () => this.#urlInput.select())
    this.#codeCopyBtn.addEventListener('click', this.#onCopyCode)
    this.#translate()
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate())
    this.#resetUi()
  }

  disconnectedCallback () {
    if (this.#copyTimer) clearTimeout(this.#copyTimer)
    if (this.#codeCopyTimer) clearTimeout(this.#codeCopyTimer)
    this.#clearResetTimer()
    this.#openToken = null
    this.#session?.close()
    this.#unsubscribeLocale?.()
    this.#unsubscribeLocale = null
  }

  open () {
    if (this.hasAttribute('open') || this.#openToken) return
    this.#clearResetTimer()
    this.#prepareAndStartSession()
  }

  close ({ completed = false } = {}) {
    const wasOpen = this.hasAttribute('open')
    const wasPreparing = Boolean(this.#openToken)
    if (!wasOpen && !wasPreparing && !this.#session && !this.#intakeToken) return
    this.#openToken = null
    this.removeAttribute('open')
    if (wasOpen) {
      this.list?.exitSelectionMode()
      this.#setToolbarDisabled(false)
    }
    if (wasOpen) this.#resetUiAfterClose()
    else this.#resetUi()
    this.#peerSigner = null
    if (this.#intakeToken) {
      abortIntake(this.#intakeToken)
      this.#intakeToken = null
    }
    if (this.#session) {
      const s = this.#session
      this.#session = null
      try { s.cancel() } catch { /* noop */ }
    }
    this.onClosed?.({ completed })
  }

  #setToolbarDisabled (disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled
    }
  }

  #resetUi () {
    this.#clearResetTimer()
    this.dataset.codeReady = ''
    this.#urlInput.value = ''
    this.#qrImage.removeAttribute('src')
    this.#copyBtn.disabled = true
    this.#copyBtn.classList.remove('is-success')
    this.#copyBtn.innerHTML = ICON_COPY
    this.#codeText.textContent = '------'
    this.#codeCopyBtn.disabled = true
    this.#codeCopyBtn.classList.remove('is-success')
    this.#codeCopyBtn.innerHTML = ICON_COPY
    this.#setStatus('', null)
  }

  #resetUiAfterClose () {
    this.#clearResetTimer()
    this.#resetTimer = setTimeout(() => this.#resetUi(), CLOSE_RESET_MS)
  }

  #clearResetTimer () {
    if (!this.#resetTimer) return
    clearTimeout(this.#resetTimer)
    this.#resetTimer = null
  }

  async #prepareAndStartSession () {
    const token = {}
    this.#openToken = token
    this.#resetUi()
    try {
      await passkey.ensureRegistered()
      if (this.#openToken !== token) return
      await this.#startSession()
    } catch (err) {
      if (this.#openToken !== token) return
      if (err?.name !== 'NotAllowedError') {
        console.error('host pairing preparation failed', err?.message ?? err)
      }
      const { message, longMessage } = passkeyPrepareErrorToToast(err)
      this.close()
      toast.error(message, longMessage)
    }
  }

  async #startSession () {
    this.#session = new HostSession({
      onJoinerConnected: () => this.#setStatus('Other device connected: exchanging trust…', null),
      // Code derived right after `connect`; reveal the code section.
      onPairingCode: (code) => {
        this.#codeText.textContent = code
        this.#codeCopyBtn.disabled = false
        this.dataset.codeReady = 'true'
        this.#setStatus('Waiting: type the code above on the other device.', null)
      },
      onError: (err) => {
        console.error('host session error', err?.message ?? err)
        this.#setStatus('Pairing channel error: try again.', 'error')
      },
      // Joiner's device-level signer pubkey + platform label. Stash it for
      // the commit; return our own pair so the session can publish a
      // symmetric `register_trusted_signer` back to the joiner.
      onTrustedSignerReceived: async ({ platform, signerPubkey }) => {
        this.#peerSigner = { pubkey: signerPubkey, platform }
        await passkey.ensureRegistered()
        const ourSignerPubkey = await secrets.getDeviceSignerPubkey()
        return { signerPubkey: ourSignerPubkey, platform: detectPlatform() }
      },
      // Inbound exchange request — code already validated by the session.
      // Run the inbound prepare/commit BEFORE returning so a commit
      // failure surfaces as an error reply instead of leaving us with
      // the joiner's data committed but our reply unsent.
      onExchangeRequest: async ({ platform: peerPlatform, accounts: peerAccounts }) => {
        return this.#handleExchange(peerPlatform, peerAccounts)
      }
    })
    await this.#session.start()
    if (!this.#openToken || !this.#session) return
    const url = this.#session.url
    this.#urlInput.value = url
    this.#copyBtn.disabled = false
    try {
      this.#qrImage.src = generateQrDataUrl(url, { cellSize: 6, margin: 4 })
    } catch (err) {
      console.error('qr generation failed', err?.message ?? err)
    }
    if (!this.#openToken) return
    this.#setStatus('Waiting for the other device to scan or paste the URL.', null)
    this.#openToken = null
    this.list?.enterSelectionMode()
    this.#setToolbarDisabled(true)
    this.setAttribute('open', '')
  }

  async #handleExchange (peerPlatform, peerAccounts) {
    const token = createIntakeToken()
    this.#intakeToken = token
    try {
      // Build the outgoing envelope first so the passkey openSecrets
      // prompt fires while the user is still focused on the host UI.
      const selectedPubkeys = this.list?.getSelectedPubkeys() ?? []
      const accountsToSend = store.list().filter(a => selectedPubkeys.includes(a.pubkey))
      let outgoing = { platform: detectPlatform(), accounts: [] }
      if (accountsToSend.length) {
        const entries = await passkey.openSecrets()
        if (token.cancelled) throw new Error('IMPORT_CANCELLED')
        outgoing = {
          platform: detectPlatform(),
          ...buildSyncAccountPayload(accountsToSend, entries, {
            nsecFromHex: nostr.nsecFromHex,
            npubFromPubkey: nostr.npubFromPubkey
          })
        }
      }

      // Inbound prepare + commit. Empty list is fine — we still want the
      // peer signer trust write to happen via commitPrepared so it lands
      // (or rolls back) atomically.
      this.#setStatus('Importing accounts from the other device…', null)
      const prepared = []
      const errors = []
      for (let i = peerAccounts.length - 1; i >= 0; i--) {
        if (token.cancelled) throw new Error('IMPORT_CANCELLED')
        try {
          const p = await prepareBareKey(peerAccounts[i], token)
          if (p.skipped) errors.push(p.reason)
          else prepared.push(p)
        } catch (err) {
          if (err?.message === 'IMPORT_CANCELLED') throw err
          errors.push(err?.message ?? String(err))
        }
      }
      if (token.cancelled) throw new Error('IMPORT_CANCELLED')

      const peerSigner = this.#peerSigner
        ? { pubkey: this.#peerSigner.pubkey, platform: peerPlatform || this.#peerSigner.platform }
        : null
      await commitPrepared(prepared, { peerSigner })

      // Success toast — varies by what arrived.
      const summary = peerAccounts.length === 0
        ? t('Devices synced')
        : t('Synced: imported {{count}} accounts', { count: prepared.length })
      if (errors.length) toast.warning(t('{{summary}} ({{count}} failed)', { summary, count: errors.length }), errors.join('\n'))
      else toast.success(summary)

      this.#setStatus('Done.', 'success')
      setTimeout(() => this.close({ completed: true }), 1200)
      return outgoing
    } catch (err) {
      this.#setStatus('Sync failed', 'error') // User sees toast for details
      const message = err?.message === 'IMPORT_CANCELLED' ? t('Sync cancelled') : t('Sync failed')
      toast.error(message, err?.message ?? String(err))
      // Re-throw so the session sends an error reply to the joiner.
      throw err
    } finally {
      if (this.#intakeToken === token) this.#intakeToken = null
    }
  }

  #onCopyUrl = async () => {
    const value = this.#urlInput.value
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      this.#copyBtn.classList.add('is-success')
      this.#copyBtn.innerHTML = ICON_CHECK
      if (this.#copyTimer) clearTimeout(this.#copyTimer)
      this.#copyTimer = setTimeout(() => {
        this.#copyBtn.classList.remove('is-success')
        this.#copyBtn.innerHTML = ICON_COPY
      }, FLASH_MS)
    } catch (err) {
      console.error('copy failed', err?.message ?? err)
    }
  }

  #onCopyCode = async () => {
    const code = this.#codeText.textContent
    if (!code || code === '------') return
    try {
      await navigator.clipboard.writeText(code)
      this.#codeCopyBtn.classList.add('is-success')
      this.#codeCopyBtn.innerHTML = ICON_CHECK
      if (this.#codeCopyTimer) clearTimeout(this.#codeCopyTimer)
      this.#codeCopyTimer = setTimeout(() => {
        this.#codeCopyBtn.classList.remove('is-success')
        this.#codeCopyBtn.innerHTML = ICON_COPY
      }, FLASH_MS)
    } catch (err) {
      console.error('copy code failed', err?.message ?? err)
    }
  }

  #setStatus (key, kind, values) {
    this.#statusKey = key
    this.#statusValues = values
    this.#status.textContent = key ? t(key, values) : ''
    this.#status.classList.toggle('is-error', kind === 'error')
    this.#status.classList.toggle('is-success', kind === 'success')
  }

  #translate () {
    if (!this.#cancelBtn) return
    this.#cancelBtn.title = t('Cancel')
    this.querySelector('.host-title').textContent = t('Scan the QR code or paste the URL on the other device')
    this.#copyBtn.title = t('Copy URL')
    this.querySelector('.host-code-label').textContent = t('Type this code on the other device:')
    this.#codeCopyBtn.title = t('Copy code')
    if (this.#statusKey) this.#status.textContent = t(this.#statusKey, this.#statusValues)
  }
}

function passkeyPrepareErrorToToast (err) {
  if (err?.name === 'NotAllowedError') {
    return { message: t('Pairing cancelled'), longMessage: t('The passkey prompt was cancelled.') }
  }
  return { message: t('Pairing failed'), longMessage: err?.message ?? String(err) }
}

customElements.define('sync-host', SyncHost)
