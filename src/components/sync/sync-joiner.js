import * as store from '../../services/accounts-store.js'
import * as nostr from 'libp2r2p/key'
import * as passkey from '../../services/passkey.js'
import * as secrets from '../../services/secrets.js'
import {
  JoinerSession,
  buildSyncAccountPayload
} from '../../services/nostrpair.js'
import {
  createIntakeToken,
  abortIntake,
  prepareBareKey,
  commitPrepared
} from '../../services/account-intake.js'
import { QrScanner, isCameraSupported } from '../../services/qr-scanner.js'
import { injectComponentStyles, waitForFocus } from '../../helpers/dom.js'
import { detectPlatform } from '../../helpers/platform.js'
import * as toast from '../shared/toast.js'
import { defineLocales, getT, subscribeLocaleChanged } from '../../i18n/index.js'
import { syncHostLocales } from './sync-host.js'

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'
const ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'
const ICON_CAMERA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1a2 2 0 0 0 2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>'

const ERROR_FLASH_MS = 1500

export const syncJoinerLocales = {
  ...syncHostLocales,
  ...defineLocales({
    Connect: ['Connecter', 'Connetti', 'Verbinden', 'Conectar', 'Conectar', 'Подключить', '连接', '連線', '接続', '연결'],
    'Scan QR': ['Scanner le QR', 'Scansiona QR', 'QR scannen', 'Escanear QR', 'Ler QR', 'Сканировать QR', '扫描二维码', '掃描 QR 碼', 'QR をスキャン', 'QR 스캔'],
    'Stop scanning': ['Arrêter le scan', 'Interrompi scansione', 'Scannen beenden', 'Detener escaneo', 'Parar leitura', 'Остановить сканирование', '停止扫描', '停止掃描', 'スキャンを停止', '스캔 중지'],
    'Could not start the camera': ['Impossible de démarrer la caméra', 'Impossibile avviare la fotocamera', 'Kamera konnte nicht gestartet werden', 'No se pudo iniciar la cámara', 'Não foi possível iniciar a câmera', 'Не удалось запустить камеру', '无法启动相机', '無法啟動相機', 'カメラを起動できませんでした', '카메라를 시작할 수 없습니다'],
    'Type the code shown on the other device:': ['Saisissez le code affiché sur l’autre appareil :', 'Digita il codice mostrato sull’altro dispositivo:', 'Den auf dem anderen Gerät angezeigten Code eingeben:', 'Escribe el código mostrado en el otro dispositivo:', 'Digite o código mostrado no outro dispositivo:', 'Введите код, показанный на другом устройстве:', '输入另一台设备上显示的代码：', '輸入另一台裝置上顯示的代碼：', '別のデバイスに表示されたコードを入力してください：', '다른 기기에 표시된 코드를 입력하세요:'],
    'Digit {{number}}': ['Chiffre {{number}}', 'Cifra {{number}}', 'Ziffer {{number}}', 'Dígito {{number}}', 'Dígito {{number}}', 'Цифра {{number}}', '第 {{number}} 位', '第 {{number}} 位', '{{number}} 桁目', '{{number}}번째 숫자'],
    'Paste a nostrpair:// URL or scan the QR shown by the other device.': ['Collez une URL nostrpair:// ou scannez le QR affiché par l’autre appareil.', 'Incolla un URL nostrpair:// o scansiona il QR mostrato dall’altro dispositivo.', 'Eine nostrpair://-URL einfügen oder den QR-Code des anderen Geräts scannen.', 'Pega una URL nostrpair:// o escanea el QR mostrado por el otro dispositivo.', 'Cole uma URL nostrpair:// ou leia o QR exibido pelo outro dispositivo.', 'Вставьте URL nostrpair:// или отсканируйте QR-код на другом устройстве.', '粘贴 nostrpair:// URL，或扫描另一台设备显示的二维码。', '貼上 nostrpair:// URL，或掃描另一台裝置顯示的 QR 碼。', 'nostrpair:// URL を貼り付けるか、別のデバイスの QR コードをスキャンしてください。', 'nostrpair:// URL을 붙여 넣거나 다른 기기의 QR 코드를 스캔하세요.'],
    'Connecting…': ['Connexion…', 'Connessione…', 'Verbindung wird hergestellt…', 'Conectando…', 'Conectando…', 'Подключение…', '正在连接…', '正在連線…', '接続中…', '연결 중…'],
    'Connected: exchanging trust…': ['Connecté : échange de confiance…', 'Connesso: scambio di fiducia…', 'Verbunden: Vertrauen wird ausgetauscht…', 'Conectado: intercambiando confianza…', 'Conectado: trocando confiança…', 'Подключено: обмен доверием…', '已连接：正在交换信任信息…', '已連線：正在交換信任資訊…', '接続済み：信頼情報を交換中…', '연결됨: 신뢰 정보 교환 중…'],
    'Pairing channel error.': ['Erreur du canal d’association.', 'Errore del canale di associazione.', 'Fehler im Kopplungskanal.', 'Error del canal de emparejamiento.', 'Erro no canal de pareamento.', 'Ошибка канала сопряжения.', '配对通道出错。', '配對通道錯誤。', 'ペアリングチャネルエラー。', '페어링 채널 오류.'],
    'Code matched: exchanging trust…': ['Code vérifié : échange de confiance…', 'Codice verificato: scambio di fiducia…', 'Code stimmt: Vertrauen wird ausgetauscht…', 'Código correcto: intercambiando confianza…', 'Código correto: trocando confiança…', 'Код совпал: обмен доверием…', '代码匹配：正在交换信任信息…', '代碼相符：正在交換信任資訊…', 'コード一致：信頼情報を交換中…', '코드 일치: 신뢰 정보 교환 중…'],
    'Switch back to this tab to continue…': ['Revenez à cet onglet pour continuer…', 'Torna a questa scheda per continuare…', 'Zu diesem Tab zurückkehren, um fortzufahren…', 'Vuelve a esta pestaña para continuar…', 'Volte para esta aba para continuar…', 'Вернитесь на эту вкладку, чтобы продолжить…', '请返回此标签页以继续…', '請返回此分頁以繼續…', '続行するにはこのタブに戻ってください…', '계속하려면 이 탭으로 돌아오세요…'],
    'Sending accounts…': ['Envoi des comptes…', 'Invio degli account…', 'Konten werden gesendet…', 'Enviando cuentas…', 'Enviando contas…', 'Отправка учётных записей…', '正在发送账户…', '正在傳送帳戶…', 'アカウントを送信中…', '계정 전송 중…'],
    'Importing {{count}} accounts…': ['Importation de {{count}} comptes…', 'Importazione di {{count}} account…', '{{count}} Konten werden importiert…', 'Importando {{count}} cuentas…', 'Importando {{count}} contas…', 'Импорт учётных записей: {{count}}…', '正在导入 {{count}} 个账户…', '正在匯入 {{count}} 個帳戶…', '{{count}} 件のアカウントをインポート中…', '계정 {{count}}개 가져오는 중…'],
    'Storing trust…': ['Enregistrement de la confiance…', 'Salvataggio della fiducia…', 'Vertrauen wird gespeichert…', 'Guardando confianza…', 'Salvando confiança…', 'Сохранение доверия…', '正在保存信任信息…', '正在儲存信任資訊…', '信頼情報を保存中…', '신뢰 정보 저장 중…'],
    'Error. Try again.': ['Erreur. Réessayez.', 'Errore. Riprova.', 'Fehler. Erneut versuchen.', 'Error. Inténtalo de nuevo.', 'Erro. Tente novamente.', 'Ошибка. Попробуйте ещё раз.', '出错了，请重试。', '發生錯誤，請重試。', 'エラーです。もう一度お試しください。', '오류입니다. 다시 시도하세요.'],
    'Code mismatch: check the digits on the other device.': ['Code incorrect : vérifiez les chiffres sur l’autre appareil.', 'Codice errato: controlla le cifre sull’altro dispositivo.', 'Code stimmt nicht: Ziffern auf dem anderen Gerät prüfen.', 'El código no coincide: comprueba los dígitos del otro dispositivo.', 'Código incorreto: confira os dígitos no outro dispositivo.', 'Код не совпадает: проверьте цифры на другом устройстве.', '代码不匹配：请检查另一台设备上的数字。', '代碼不符：請檢查另一台裝置上的數字。', 'コードが一致しません：別のデバイスの数字を確認してください。', '코드 불일치: 다른 기기의 숫자를 확인하세요.'],
    'Pairing timed out': ['Délai d’association dépassé', 'Tempo di associazione scaduto', 'Zeitüberschreitung bei der Kopplung', 'Tiempo de emparejamiento agotado', 'Tempo de pareamento esgotado', 'Время сопряжения истекло', '配对超时', '配對逾時', 'ペアリングがタイムアウトしました', '페어링 시간 초과'],
    'The other device did not respond in time.': ['L’autre appareil n’a pas répondu à temps.', 'L’altro dispositivo non ha risposto in tempo.', 'Das andere Gerät hat nicht rechtzeitig geantwortet.', 'El otro dispositivo no respondió a tiempo.', 'O outro dispositivo não respondeu a tempo.', 'Другое устройство не ответило вовремя.', '另一台设备未及时响应。', '另一台裝置未及時回應。', '別のデバイスが時間内に応答しませんでした。', '다른 기기가 제시간에 응답하지 않았습니다.'],
    'Pairing rejected': ['Association refusée', 'Associazione rifiutata', 'Kopplung abgelehnt', 'Emparejamiento rechazado', 'Pareamento recusado', 'Сопряжение отклонено', '配对被拒绝', '配對遭拒', 'ペアリングが拒否されました', '페어링 거부됨'],
    'The other device declined the request.': ['L’autre appareil a refusé la demande.', 'L’altro dispositivo ha rifiutato la richiesta.', 'Das andere Gerät hat die Anfrage abgelehnt.', 'El otro dispositivo rechazó la solicitud.', 'O outro dispositivo recusou a solicitação.', 'Другое устройство отклонило запрос.', '另一台设备拒绝了请求。', '另一台裝置拒絕了要求。', '別のデバイスがリクエストを拒否しました。', '다른 기기가 요청을 거부했습니다.'],
    'Got an unexpected response from the other device.': ['Réponse inattendue de l’autre appareil.', 'Risposta imprevista dall’altro dispositivo.', 'Unerwartete Antwort vom anderen Gerät.', 'Se recibió una respuesta inesperada del otro dispositivo.', 'O outro dispositivo enviou uma resposta inesperada.', 'Получен неожиданный ответ от другого устройства.', '收到另一台设备的意外响应。', '收到另一台裝置的非預期回應。', '別のデバイスから予期しない応答がありました。', '다른 기기에서 예상치 못한 응답을 받았습니다.'],
    'Pairing relay failed': ['Échec du relais d’association', 'Relay di associazione non riuscito', 'Kopplungs-Relay fehlgeschlagen', 'Falló el relay de emparejamiento', 'Falha no relay de pareamento', 'Ошибка ретранслятора сопряжения', '配对中继失败', '配對中繼失敗', 'ペアリングリレーに失敗しました', '페어링 릴레이 실패'],
    'The relay did not accept the pairing message. Try again, or generate a fresh pairing URL.': ['Le relais n’a pas accepté le message d’association. Réessayez ou générez une nouvelle URL.', 'Il relay non ha accettato il messaggio di associazione. Riprova o genera un nuovo URL.', 'Das Relay hat die Kopplungsnachricht nicht akzeptiert. Erneut versuchen oder eine neue URL erzeugen.', 'El relay no aceptó el mensaje de emparejamiento. Inténtalo de nuevo o genera una URL nueva.', 'O relay não aceitou a mensagem de pareamento. Tente novamente ou gere uma nova URL.', 'Ретранслятор не принял сообщение сопряжения. Повторите попытку или создайте новый URL.', '中继未接受配对消息。请重试或生成新的配对 URL。', '中繼未接受配對訊息。請重試或產生新的配對 URL。', 'リレーがペアリングメッセージを受け付けませんでした。再試行するか、新しい URL を生成してください。', '릴레이가 페어링 메시지를 수락하지 않았습니다. 다시 시도하거나 새 URL을 생성하세요.'],
    'Trust exchange failed': ['Échec de l’échange de confiance', 'Scambio di fiducia non riuscito', 'Vertrauensaustausch fehlgeschlagen', 'Falló el intercambio de confianza', 'Falha na troca de confiança', 'Ошибка обмена доверием', '信任交换失败', '信任交換失敗', '信頼情報の交換に失敗しました', '신뢰 정보 교환 실패'],
    "The other device could not store this device's signer key.": ['L’autre appareil n’a pas pu enregistrer la clé de signature de cet appareil.', 'L’altro dispositivo non ha potuto salvare la chiave di firma di questo dispositivo.', 'Das andere Gerät konnte den Signaturschlüssel dieses Geräts nicht speichern.', 'El otro dispositivo no pudo guardar la clave de firma de este dispositivo.', 'O outro dispositivo não pôde salvar a chave de assinatura deste dispositivo.', 'Другое устройство не смогло сохранить ключ подписи этого устройства.', '另一台设备无法保存此设备的签名密钥。', '另一台裝置無法儲存此裝置的簽署金鑰。', '別のデバイスはこのデバイスの署名鍵を保存できませんでした。', '다른 기기가 이 기기의 서명 키를 저장하지 못했습니다.'],
    'Pairing device locked': ['Appareil d’association verrouillé', 'Dispositivo di associazione bloccato', 'Kopplungsgerät gesperrt', 'Dispositivo de emparejamiento bloqueado', 'Dispositivo de pareamento bloqueado', 'Устройство сопряжения заблокировано', '配对设备已锁定', '配對裝置已鎖定', 'ペアリングするデバイスがロックされています', '페어링 기기 잠김'],
    'Unlock or create the passkey on the other device, then try pairing again.': ['Déverrouillez ou créez la clé d’accès sur l’autre appareil, puis réessayez.', 'Sblocca o crea la passkey sull’altro dispositivo, poi riprova.', 'Passkey auf dem anderen Gerät entsperren oder erstellen und erneut versuchen.', 'Desbloquea o crea la llave de acceso en el otro dispositivo y vuelve a intentarlo.', 'Desbloqueie ou crie a chave de acesso no outro dispositivo e tente novamente.', 'Разблокируйте или создайте ключ доступа на другом устройстве и повторите попытку.', '请在另一台设备上解锁或创建通行密钥，然后重试。', '請在另一台裝置上解鎖或建立通行密鑰，然後重試。', '別のデバイスでパスキーを解除または作成してから、もう一度お試しください。', '다른 기기에서 패스키를 잠금 해제하거나 만든 뒤 다시 시도하세요.'],
    'Code mismatch': ['Code incorrect', 'Codice errato', 'Code stimmt nicht', 'El código no coincide', 'Código incorreto', 'Код не совпадает', '代码不匹配', '代碼不符', 'コードが一致しません', '코드 불일치'],
    'Double-check the digits shown on the other device.': ['Vérifiez les chiffres affichés sur l’autre appareil.', 'Ricontrolla le cifre mostrate sull’altro dispositivo.', 'Die Ziffern auf dem anderen Gerät erneut prüfen.', 'Comprueba los dígitos mostrados en el otro dispositivo.', 'Confira os dígitos exibidos no outro dispositivo.', 'Перепроверьте цифры на другом устройстве.', '请再次核对另一台设备上显示的数字。', '請再次核對另一台裝置上顯示的數字。', '別のデバイスに表示された数字をもう一度確認してください。', '다른 기기에 표시된 숫자를 다시 확인하세요.'],
    'Invalid pairing URL': ['URL d’association invalide', 'URL di associazione non valido', 'Ungültige Kopplungs-URL', 'URL de emparejamiento no válida', 'URL de pareamento inválida', 'Недопустимый URL сопряжения', '配对 URL 无效', '配對 URL 無效', 'ペアリング URL が無効です', '잘못된 페어링 URL']
  })
}

const t = getT(syncJoinerLocales)

const STYLES = /* css */`
  sync-joiner {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  sync-joiner[open] {
    max-height: 80px;
  }
  /* Once a URL is parsed and the session is live, reveal the OTP + status
     panel below the URL input. */
  sync-joiner[open][data-pair="active"] {
    max-height: 240px;
  }
  sync-joiner[open][data-scanning="true"] {
    max-height: 420px;
  }
  sync-joiner .joiner-form {
    position: relative;
    padding-top: 12px;
  }
  sync-joiner .joiner-input {
    padding-left: 36px;
    padding-right: 42px;
    background-color: var(--surface-interactive);
  }
  sync-joiner[data-camera="true"] .joiner-input {
    padding-right: 78px;
  }
  sync-joiner .joiner-btn {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-strong);
  }
  sync-joiner .joiner-btn:disabled {
    opacity: 0.6;
  }
  sync-joiner .joiner-btn[data-action="cancel"] {
    top: calc(50% + 6px);
    transform: translateY(-50%);
    left: 5px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: transparent;
  }
  sync-joiner .joiner-btn[data-action="cancel"]:active {
    background-color: var(--surface-interactive-active);
  }
  sync-joiner .joiner-btn[data-action="scan"] {
    top: calc(50% + 6px);
    transform: translateY(-50%);
    right: 42px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: transparent;
    display: none;
  }
  sync-joiner[data-camera="true"] .joiner-btn[data-action="scan"] {
    display: inline-flex;
  }
  sync-joiner .joiner-btn[data-action="scan"]:active {
    background-color: var(--surface-interactive-active);
  }
  sync-joiner .joiner-btn[data-action="connect"] {
    top: 12px;
    right: 0;
    bottom: 0;
    width: 36px;
    border-radius: 0 7px 7px 0;
    background-color: var(--success);
  }
  sync-joiner .joiner-btn[data-action="connect"]:active {
    background-color: var(--success-active);
  }
  sync-joiner .joiner-btn[data-action="connect"].is-error {
    background-color: var(--error);
    color: var(--fg-on-accent);
  }
  sync-joiner .joiner-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  sync-joiner .joiner-btn-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  sync-joiner .joiner-btn[data-action="scan"] svg {
    width: 16px;
    height: 16px;
  }
  /* Pair-active panel — code input + status. Sized via container heights. */
  sync-joiner .pair-panel {
    display: none;
    flex-direction: column;
    gap: 10px;
    padding-top: 14px;
  }
  sync-joiner[data-pair="active"] .pair-panel {
    display: flex;
  }
  sync-joiner .pair-label {
    font-size: 14rem;
    font-weight: 600;
    color: var(--fg);
    align-self: center;
  }
  /* OTP-style: six separate cells, equally spaced. flex: 1 1 0 + min-width: 0
     lets them shrink as the panel narrows so they never overflow. */
  sync-joiner .pair-pin {
    display: flex;
    justify-content: center;
    gap: 8px;
  }
  sync-joiner .pin-cell {
    flex: 1 1 0;
    min-width: 0;
    max-width: 32px;
    width: auto;
    height: 52px;
    padding: 0;
    text-align: center;
    font-size: 22rem;
    font-variant-numeric: tabular-nums;
    background-color: var(--surface-interactive);
    border: 1px solid transparent;
    border-radius: 6px;
    outline: none;
    -moz-appearance: textfield;
  }
  sync-joiner .pin-cell::-webkit-outer-spin-button,
  sync-joiner .pin-cell::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  sync-joiner .pin-cell:focus {
    border-color: var(--success);
    background-color: var(--surface-interactive);
  }
  sync-joiner .pin-cell:disabled {
    opacity: 0.6;
  }
  sync-joiner .pair-pin.is-error .pin-cell {
    background-color: oklch(from var(--error) l c h / 0.5);
  }
  sync-joiner .pair-status {
    font-size: 12rem;
    align-self: center;
    color: var(--fg);
    min-height: 16px;
  }
  sync-joiner .pair-status.is-error { color: var(--error-fg); }
  sync-joiner .pair-status.is-success { color: var(--success-fg); }
  sync-joiner .scan-overlay {
    display: none;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
  }
  sync-joiner[data-scanning="true"] .scan-overlay {
    display: flex;
  }
  sync-joiner[data-scanning="true"] .joiner-form,
  sync-joiner[data-scanning="true"] .pair-panel {
    display: none;
  }
  sync-joiner .scan-video-wrap {
    position: relative;
  }
  sync-joiner .scan-video {
    width: 100%;
    max-height: 320px;
    border-radius: 8px;
    background-color: var(--surface-sunken);
    object-fit: cover;
    display: block;
  }
  sync-joiner .scan-stop {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: var(--scrim);
    color: var(--fg-on-accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 1px 2px var(--shadow-strong));
    z-index: 1;
  }
  sync-joiner .scan-stop:active {
    background-color: var(--scrim-strong);
  }
  sync-joiner .scan-stop svg {
    width: 18px;
    height: 18px;
  }
`

const TEMPLATE = /* html */`
  <form class="joiner-form" autocomplete="off">
    <button class="joiner-btn" data-action="cancel" type="button" title="Cancel">
      <span class="joiner-btn-icon">${ICON_X}</span>
    </button>
    <input class="joiner-input" type="text" placeholder="nostrpair://" spellcheck="false" autocorrect="off" autocapitalize="off" />
    <button class="joiner-btn" data-action="scan" type="button" title="Scan QR">${ICON_CAMERA}</button>
    <button class="joiner-btn" data-action="connect" type="submit" title="Connect">
      <span class="joiner-btn-icon">${ICON_CHECK}</span>
    </button>
  </form>
  <div class="pair-panel">
    <span class="pair-label">Type the code shown on the other device:</span>
    <div class="pair-pin">
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 1" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 2" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 3" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 4" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 5" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 6" />
    </div>
    <span class="pair-status"></span>
  </div>
  <div class="scan-overlay">
    <div class="scan-video-wrap">
      <button class="scan-stop" type="button" title="Stop scanning">${ICON_X}</button>
    </div>
  </div>
`

export class SyncJoiner extends HTMLElement {
  #form
  #input
  #cancelBtn
  #scanBtn
  #connectBtn
  #connectIcon
  #pinWrap
  #pinCells = []
  #statusEl
  #scanWrap
  #scanStopBtn
  #errorTimer = null
  #pinErrorTimer = null
  #busy = false
  #session = null
  #scanner = null
  #intakeToken = null
  #unsubscribeLocale = null
  #statusKey = ''
  #statusValues
  // Joiner derives its own pair code locally so we can verify the user's
  // typed digits before sending — saves a round-trip on user typos and
  // makes the channel's authenticity check happen entirely on this device.
  #expectedCode = null

  // Wired by the parent sync-panel.
  list = null
  toolbarButtons = []
  onClosed = null

  connectedCallback () {
    injectComponentStyles('sync-joiner', STYLES)
    this.innerHTML = TEMPLATE
    this.#form = this.querySelector('.joiner-form')
    this.#input = this.querySelector('.joiner-input')
    this.#cancelBtn = this.querySelector('button[data-action="cancel"]')
    this.#scanBtn = this.querySelector('button[data-action="scan"]')
    this.#connectBtn = this.querySelector('button[data-action="connect"]')
    this.#connectIcon = this.#connectBtn.querySelector('.joiner-btn-icon')
    this.#pinWrap = this.querySelector('.pair-pin')
    this.#pinCells = Array.from(this.querySelectorAll('.pin-cell'))
    this.#statusEl = this.querySelector('.pair-status')
    this.#scanWrap = this.querySelector('.scan-video-wrap')
    this.#scanStopBtn = this.querySelector('.scan-stop')

    this.#form.addEventListener('submit', this.#onSubmit)
    this.#cancelBtn.addEventListener('click', this.#onCancel)
    this.#scanBtn.addEventListener('click', this.#onStartScan)
    this.#scanStopBtn.addEventListener('click', () => this.#stopScan())
    for (const cell of this.#pinCells) {
      cell.addEventListener('input', this.#onPinInput)
      cell.addEventListener('keydown', this.#onPinKeydown)
      cell.addEventListener('paste', this.#onPinPaste)
      cell.addEventListener('focus', () => cell.select())
    }

    this.#translate()
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.#translate())

    if (isCameraSupported()) this.dataset.camera = 'true'
  }

  disconnectedCallback () {
    if (this.#errorTimer) clearTimeout(this.#errorTimer)
    if (this.#pinErrorTimer) clearTimeout(this.#pinErrorTimer)
    this.#stopScan()
    this.#session?.close()
    this.#unsubscribeLocale?.()
    this.#unsubscribeLocale = null
  }

  open () {
    if (this.hasAttribute('open')) return
    this.setAttribute('open', '')
    this.#setToolbarDisabled(true)
    requestAnimationFrame(() => this.#input?.focus())
  }

  close ({ completed = false } = {}) {
    this.removeAttribute('open')
    this.#input.value = ''
    this.#clearErrorFlash()
    this.#stopScan()
    this.#tearDownPair()
    this.list?.exitSelectionMode()
    this.#setToolbarDisabled(false)
    this.onClosed?.({ completed })
  }

  #setToolbarDisabled (disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled
    }
  }

  #onCancel = () => {
    if (this.#busy && this.#intakeToken) abortIntake(this.#intakeToken)
    this.close()
  }

  #onSubmit = async (e) => {
    e.preventDefault()
    if (this.#busy) return
    const raw = this.#input.value.trim()
    if (!raw) return
    if (!raw.startsWith('nostrpair://')) {
      toast.info(t('Paste a nostrpair:// URL or scan the QR shown by the other device.'))
      this.#flashError()
      return
    }
    await this.#startPair(raw)
  }

  async #startPair (url) {
    this.#setBusy(true)
    this.#setPinDisabled(false)
    this.dataset.pair = 'active'
    this.#setStatus('Connecting…', null)
    this.list?.enterSelectionMode()
    try {
      this.#session = new JoinerSession(url, {
        onConnected: () => this.#setStatus('Connected: exchanging trust…', null),
        onPairingCode: (code) => {
          // Stash but don't render — the user types what they see on the
          // host. Local compare prevents a round-trip on typos.
          this.#expectedCode = code
          this.#setPinDisabled(false)
          this.#setConnectPending(false)
          this.#setStatus('Type the code shown on the other device.', null)
          this.#pinCells[0]?.focus()
        },
        onError: (err) => {
          console.error('joiner session error', err?.message ?? err)
          this.#setStatus('Pairing channel error.', 'error')
        }
      })
      await this.#session.connect()
    } catch (err) {
      this.#setBusy(false)
      console.error('joiner connect failed', err?.message ?? err)
      const { message, longMessage } = pairErrorToToast(err)
      toast.error(t(message), longMessage ? t(longMessage) : '')
      this.#tearDownPair()
      this.list?.exitSelectionMode()
      return
    }
    // Keep #busy true to lock the URL input/scan button while pairing is
    // in progress — the user's next action is typing the code, not
    // submitting another URL.
    this.#setConnectPending(false)
  }

  #tearDownPair () {
    this.dataset.pair = ''
    this.#expectedCode = null
    if (this.#pinErrorTimer) {
      clearTimeout(this.#pinErrorTimer)
      this.#pinErrorTimer = null
    }
    this.#clearPin()
    this.#setPinDisabled(false)
    this.#pinWrap.classList.remove('is-error')
    this.#setStatus('', null)
    if (this.#session) {
      try { this.#session.close() } catch { /* noop */ }
      this.#session = null
    }
    this.#setBusy(false)
  }

  #onPinInput = async (e) => {
    if (!this.#session) return
    const cell = e.target
    const clean = cell.value.replace(/\D/g, '').slice(-1)
    if (clean !== cell.value) cell.value = clean
    if (clean) {
      const idx = this.#pinCells.indexOf(cell)
      if (idx < this.#pinCells.length - 1) this.#pinCells[idx + 1].focus()
    }
    await this.#tryPinSubmit()
  }

  #onPinKeydown = (e) => {
    const idx = this.#pinCells.indexOf(e.target)
    if (idx < 0) return
    if (e.key === 'Backspace') {
      if (!e.target.value && idx > 0) {
        e.preventDefault()
        this.#pinCells[idx - 1].value = ''
        this.#pinCells[idx - 1].focus()
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault()
      this.#pinCells[idx - 1].focus()
    } else if (e.key === 'ArrowRight' && idx < this.#pinCells.length - 1) {
      e.preventDefault()
      this.#pinCells[idx + 1].focus()
    }
  }

  #onPinPaste = async (e) => {
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6)
    if (!text) return
    e.preventDefault()
    for (let i = 0; i < this.#pinCells.length; i++) {
      this.#pinCells[i].value = text[i] || ''
    }
    const focusIdx = Math.min(text.length, this.#pinCells.length - 1)
    this.#pinCells[focusIdx].focus()
    await this.#tryPinSubmit()
  }

  #tryPinSubmit = async () => {
    if (!this.#session || !this.#expectedCode) return
    const code = this.#pinCells.map(c => c.value).join('')
    if (code.length < 6) return
    if (code !== this.#expectedCode) {
      this.#flashPinError('Code mismatch: check the digits on the other device.')
      return
    }
    if (this.#intakeToken) return
    await this.#runExchange(code)
  }

  async #runExchange (code) {
    this.#setPinDisabled(true)
    const token = createIntakeToken()
    this.#intakeToken = token
    this.#setStatus('Code matched: exchanging trust…', null)

    try {
      // WebAuthn (passkey create/get) requires page focus. The user just
      // typed on this device, so they almost certainly have focus, but
      // covered for completeness.
      if (!document.hasFocus()) {
        this.#setStatus('Switch back to this tab to continue…', null)
        await waitForFocus(cancel => token.cleanups.push(cancel))
        if (token.cancelled) throw new Error('IMPORT_CANCELLED')
      }

      // Trust exchange. Bidirectional in one call — peer signer arrives in
      // the same round-trip the host acks ours.
      await passkey.ensureRegistered()
      if (token.cancelled) throw new Error('IMPORT_CANCELLED')
      const ourSignerPubkey = await secrets.getDeviceSignerPubkey()
      const peer = await this.#session.exchangeTrust({
        platform: detectPlatform(),
        signerPubkey: ourSignerPubkey
      })
      if (token.cancelled) throw new Error('IMPORT_CANCELLED')

      // Build outgoing envelope (selected accounts only).
      const selectedPubkeys = this.list?.getSelectedPubkeys() ?? []
      const accountsToSend = store.list().filter(a => selectedPubkeys.includes(a.pubkey))
      let outgoing = { accounts: [] }
      if (accountsToSend.length) {
        const entries = await passkey.openSecrets()
        if (token.cancelled) throw new Error('IMPORT_CANCELLED')
        outgoing = buildSyncAccountPayload(accountsToSend, entries, {
          nsecFromHex: nostr.nsecFromHex,
          npubFromPubkey: nostr.npubFromPubkey
        })
      }

      // Send our envelope (with the typed code as the gate) and await the
      // host's reply with its envelope.
      this.#setStatus('Sending accounts…', null)
      const reply = await this.#session.exchangeAccounts({
        code,
        platform: detectPlatform(),
        accounts: outgoing.accounts
      })
      if (token.cancelled) throw new Error('IMPORT_CANCELLED')

      // Prepare + commit inbound accounts from the host's envelope. Empty
      // is fine — we still commit the peer signer trust.
      this.#setStatus(reply.accounts.length
        ? 'Importing {{count}} accounts…'
        : 'Storing trust…', null, { count: reply.accounts.length })
      const prepared = []
      const errors = []
      for (let i = reply.accounts.length - 1; i >= 0; i--) {
        if (token.cancelled) throw new Error('IMPORT_CANCELLED')
        try {
          const p = await prepareBareKey(reply.accounts[i], token)
          if (p.skipped) errors.push(p.reason)
          else prepared.push(p)
        } catch (err) {
          if (err?.message === 'IMPORT_CANCELLED') throw err
          errors.push(err?.message ?? String(err))
        }
      }
      if (token.cancelled) throw new Error('IMPORT_CANCELLED')

      await commitPrepared(prepared, {
        peerSigner: { pubkey: peer.signerPubkey, platform: peer.platform || reply.platform },
        protectionReady: true
      })

      const summary = reply.accounts.length === 0
        ? t('Devices synced')
        : t('Synced: imported {{count}} accounts', { count: prepared.length })
      if (errors.length) toast.warning(t('{{summary}} ({{count}} failed)', { summary, count: errors.length }), errors.join('\n'))
      else toast.success(summary)

      this.#setStatus('Done.', 'success')
      setTimeout(() => this.close({ completed: true }), 1200)
    } catch (err) {
      if (err?.message !== 'IMPORT_CANCELLED') {
        console.error('joiner exchange failed', err?.message ?? err)
        const { message, longMessage } = pairErrorToToast(err)
        toast.error(t(message), longMessage ? t(longMessage) : '')
        this.#setStatus('Error. Try again.', 'error')
        this.#setPinDisabled(false)
      }
    } finally {
      if (this.#intakeToken === token) this.#intakeToken = null
    }
  }

  #setPinDisabled (disabled) {
    for (const cell of this.#pinCells) cell.disabled = disabled
  }

  #clearPin () {
    for (const cell of this.#pinCells) cell.value = ''
  }

  #flashPinError (msg) {
    this.#pinWrap.classList.add('is-error')
    this.#setStatus(msg, 'error')
    if (this.#pinErrorTimer) clearTimeout(this.#pinErrorTimer)
    this.#pinErrorTimer = setTimeout(() => {
      this.#pinWrap.classList.remove('is-error')
      this.#clearPin()
      this.#pinCells[0]?.focus()
      this.#setStatus('Type the code shown on the other device.', null)
    }, ERROR_FLASH_MS)
  }

  #setBusy (on) {
    this.#busy = on
    this.#input.disabled = on
    this.#scanBtn.disabled = on
    this.#connectBtn.disabled = on
    this.#setConnectPending(on)
  }

  #setConnectPending (on) {
    this.#connectIcon.classList.toggle('pulsate', on)
  }

  #flashError () {
    this.#clearErrorFlash()
    this.#connectBtn.disabled = true
    this.#connectBtn.classList.add('is-error')
    this.#connectIcon.innerHTML = ICON_ALERT
    this.#errorTimer = setTimeout(() => this.#clearErrorFlash(), ERROR_FLASH_MS)
  }

  #clearErrorFlash () {
    if (this.#errorTimer) {
      clearTimeout(this.#errorTimer)
      this.#errorTimer = null
    }
    this.#connectBtn.classList.remove('is-error')
    this.#connectIcon.innerHTML = ICON_CHECK
    if (!this.#busy) this.#connectBtn.disabled = false
  }

  #setStatus (key, kind, values) {
    this.#statusKey = key
    this.#statusValues = values
    this.#statusEl.textContent = key ? t(key, values) : ''
    this.#statusEl.classList.toggle('is-error', kind === 'error')
    this.#statusEl.classList.toggle('is-success', kind === 'success')
  }

  #translate () {
    if (!this.#cancelBtn) return
    this.#cancelBtn.title = t('Cancel')
    this.#scanBtn.title = t('Scan QR')
    this.#connectBtn.title = t('Connect')
    this.querySelector('.pair-label').textContent = t('Type the code shown on the other device:')
    this.#pinCells.forEach((cell, index) => cell.setAttribute('aria-label', t('Digit {{number}}', { number: index + 1 })))
    this.#scanStopBtn.title = t('Stop scanning')
    if (this.#statusKey) this.#statusEl.textContent = t(this.#statusKey, this.#statusValues)
  }

  #onStartScan = async () => {
    if (this.#scanner || this.#busy) return
    this.#scanBtn.disabled = true
    this.#scanBtn.classList.add('pulsate')
    const scanner = new QrScanner({
      onResult: (value) => {
        this.#stopScan()
        this.#input.value = value
        this.#startPair(value.trim())
      },
      onError: (err) => console.warn('qr scan error', err?.message ?? err)
    })
    this.#scanWrap.appendChild(scanner.videoElement)
    scanner.videoElement.classList.add('scan-video')
    try {
      await scanner.start()
      this.#scanner = scanner
      this.dataset.scanning = 'true'
    } catch (err) {
      console.error('camera start failed', err?.message ?? err)
      toast.error(t('Could not start the camera'), err?.message ?? '')
      try { scanner.stop() } catch { /* noop */ }
      this.#removeScanVideo()
      this.#flashError()
    } finally {
      this.#scanBtn.disabled = false
      this.#scanBtn.classList.remove('pulsate')
    }
  }

  #stopScan () {
    if (this.#scanner) {
      try { this.#scanner.stop() } catch { /* noop */ }
      this.#scanner = null
    }
    this.#removeScanVideo()
    this.dataset.scanning = ''
  }

  #removeScanVideo () {
    const video = this.#scanWrap.querySelector('video')
    if (video) video.remove()
  }
}

// Map nostrpair-flow error codes to toast copy. Unknown codes (e.g. a custom
// reply.error string from the host) fall through to a generic header with
// the raw code as the expandable detail.
function pairErrorToToast (err) {
  const code = err?.message ?? String(err)
  switch (code) {
    case 'SYNC_TIMEOUT':
      return { message: 'Pairing timed out', longMessage: 'The other device did not respond in time.' }
    case 'SYNC_REJECTED':
      return { message: 'Pairing rejected', longMessage: 'The other device declined the request.' }
    case 'SYNC_BAD_RESPONSE':
      return { message: 'Pairing failed', longMessage: 'Got an unexpected response from the other device.' }
    case 'PAIRING_PUBLISH_FAILED':
    case 'PAIRING_PUBLISH_TIMEOUT':
      return { message: 'Pairing relay failed', longMessage: 'The relay did not accept the pairing message. Try again, or generate a fresh pairing URL.' }
    case 'REGISTER_TRUSTED_SIGNER_FAILED':
      return { message: 'Trust exchange failed', longMessage: 'The other device could not store this device\'s signer key.' }
    case 'VAULT_LOCKED':
      return { message: 'Pairing device locked', longMessage: 'Unlock or create the passkey on the other device, then try pairing again.' }
    case 'invalid pairing code':
      return { message: 'Code mismatch', longMessage: 'Double-check the digits shown on the other device.' }
    case 'INVALID_NOSTRPAIR_URL':
      return { message: 'Invalid pairing URL', longMessage: '' }
    default:
      return { message: 'Sync failed', longMessage: code }
  }
}

customElements.define('sync-joiner', SyncJoiner)
