import { injectComponentStyles } from '../helpers/dom.js'
import './shared/accordion-panel.js'
import * as sync from '../services/sync/index.js'
import * as secrets from '../services/secrets.js'
import * as store from '../services/accounts-store.js'
import * as passkey from '../services/passkey.js'
import { readContentKeyAnnouncement } from '../services/content-key/index.js'
import { hasPendingMutation, subscribePendingMutations } from '../services/account-mutations.js'
import { seededAvatarDataUrl } from '../services/avatar.js'
import { defineLocales, getLocale, getT, subscribeLocaleChanged } from '../i18n/index.js'

const ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>'
const ICON_REFRESH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0 -2.3 5.7" /><path d="M20 4v7h-7" /></svg>'

export const devPanelLocales = defineLocales({
  none: ['aucun', 'nessuno', 'keine', 'ninguno', 'nenhum', 'нет', '无', '無', 'なし', '없음'],
  status: ['état', 'stato', 'Status', 'estado', 'status', 'статус', '状态', '狀態', '状態', '상태'],
  account: ['compte', 'account', 'Konto', 'cuenta', 'conta', 'учётная запись', '账户', '帳戶', 'アカウント', '계정'],
  content: ['contenu', 'contenuto', 'Inhalt', 'contenido', 'conteúdo', 'содержимое', '内容', '內容', 'コンテンツ', '콘텐츠'],
  created: ['créé', 'creato', 'erstellt', 'creado', 'criado', 'создано', '创建时间', '建立時間', '作成日時', '생성됨'],
  source: ['source', 'origine', 'Quelle', 'origen', 'origem', 'источник', '来源', '來源', 'ソース', '출처'],
  Upsert: ['Mettre à jour', 'Aggiorna', 'Aktualisieren', 'Actualizar', 'Atualizar', 'Обновить', '更新', '更新', '更新', '업데이트'],
  Development: ['Développement', 'Sviluppo', 'Entwicklung', 'Desarrollo', 'Desenvolvimento', 'Разработка', '开发', '開發', '開発', '개발'],
  'Vault content-key diagnostics.': ['Diagnostics des clés de contenu du coffre.', 'Diagnostica delle chiavi di contenuto del vault.', 'Inhaltsschlüssel-Diagnose des Tresors.', 'Diagnóstico de claves de contenido de la bóveda.', 'Diagnóstico de chaves de conteúdo do cofre.', 'Диагностика ключей содержимого хранилища.', '保险库内容密钥诊断。', '保險庫內容金鑰診斷。', '保管庫のコンテンツ鍵診断。', '볼트 콘텐츠 키 진단.'],
  'Content keys': ['Clés de contenu', 'Chiavi dei contenuti', 'Inhaltsschlüssel', 'Claves de contenido', 'Chaves de conteúdo', 'Ключи содержимого', '内容密钥', '內容金鑰', 'コンテンツ鍵', '콘텐츠 키'],
  'No nsec accounts.': ['Aucun compte nsec.', 'Nessun account nsec.', 'Keine nsec-Konten.', 'No hay cuentas nsec.', 'Nenhuma conta nsec.', 'Нет учётных записей nsec.', '没有 nsec 账户。', '沒有 nsec 帳戶。', 'nsec アカウントはありません。', 'nsec 계정이 없습니다.'],
  Active: ['Actif', 'Attiva', 'Aktiv', 'Activa', 'Ativa', 'Активный', '当前', '目前', '有効', '활성'],
  'No active content key.': ['Aucune clé de contenu active.', 'Nessuna chiave di contenuto attiva.', 'Kein aktiver Inhaltsschlüssel.', 'No hay una clave de contenido activa.', 'Nenhuma chave de conteúdo ativa.', 'Нет активного ключа содержимого.', '没有当前内容密钥。', '沒有目前內容金鑰。', '有効なコンテンツ鍵はありません。', '활성 콘텐츠 키가 없습니다.'],
  'Local content keys': ['Clés de contenu locales', 'Chiavi di contenuto locali', 'Lokale Inhaltsschlüssel', 'Claves de contenido locales', 'Chaves de conteúdo locais', 'Локальные ключи содержимого', '本地内容密钥', '本機內容金鑰', 'ローカルコンテンツ鍵', '로컬 콘텐츠 키'],
  'No local content keys.': ['Aucune clé de contenu locale.', 'Nessuna chiave di contenuto locale.', 'Keine lokalen Inhaltsschlüssel.', 'No hay claves de contenido locales.', 'Nenhuma chave de conteúdo local.', 'Нет локальных ключей содержимого.', '没有本地内容密钥。', '沒有本機內容金鑰。', 'ローカルコンテンツ鍵はありません。', '로컬 콘텐츠 키가 없습니다.'],
  'Unlock the vault to inspect local content keys.': ['Déverrouillez le coffre pour inspecter les clés de contenu locales.', 'Sblocca il vault per esaminare le chiavi di contenuto locali.', 'Entsperre den Tresor, um lokale Inhaltsschlüssel zu prüfen.', 'Desbloquea la bóveda para inspeccionar las claves de contenido locales.', 'Desbloqueie o cofre para inspecionar as chaves de conteúdo locais.', 'Разблокируйте хранилище для просмотра локальных ключей содержимого.', '解锁保险库以检查本地内容密钥。', '解鎖保險庫以檢查本機內容金鑰。', 'ローカルコンテンツ鍵を確認するには保管庫をロック解除してください。', '로컬 콘텐츠 키를 확인하려면 볼트를 잠금 해제하세요.'],
  'Generate and publish a new content key? This changes the active key used for new events.': ['Générer et publier une nouvelle clé de contenu ? Cela change la clé active utilisée pour les nouveaux événements.', 'Generare e pubblicare una nuova chiave di contenuto? Questo cambia la chiave attiva usata per i nuovi eventi.', 'Neuen Inhaltsschlüssel erzeugen und veröffentlichen? Dadurch ändert sich der aktive Schlüssel für neue Ereignisse.', '¿Generar y publicar una nueva clave de contenido? Esto cambia la clave activa usada para nuevos eventos.', 'Gerar e publicar uma nova chave de conteúdo? Isso altera a chave ativa usada para novos eventos.', 'Создать и опубликовать новый ключ содержимого? Это изменит активный ключ для новых событий.', '生成并发布新的内容密钥吗？这会更改用于新事件的当前密钥。', '產生並發布新的內容金鑰嗎？這會變更用於新事件的目前金鑰。', '新しいコンテンツ鍵を生成して公開しますか？新しいイベントで使用する有効な鍵が変わります。', '새 콘텐츠 키를 생성하고 게시할까요? 새 이벤트에 사용하는 활성 키가 변경됩니다.'],
  'Authentication failed': ['Échec de l’authentification', 'Autenticazione non riuscita', 'Authentifizierung fehlgeschlagen', 'Error de autenticación', 'Falha na autenticação', 'Ошибка аутентификации', '认证失败', '驗證失敗', '認証に失敗しました', '인증하지 못했습니다'],
  'Last Upsert': ['Dernière mise à jour', 'Ultimo aggiornamento', 'Letzter Upsert', 'Último upsert', 'Último upsert', 'Последний upsert', '上次更新', '上次更新', '最後のアップサート', '마지막 업서트'],
  Publishing: ['Publication…', 'Pubblicazione…', 'Wird veröffentlicht…', 'Publicando…', 'Publicando…', 'Публикация…', '正在发布…', '正在發布…', '公開中…', '게시 중…'],
  Published: ['Publié', 'Pubblicato', 'Veröffentlicht', 'Publicado', 'Publicado', 'Опубликовано', '已发布', '已發布', '公開済み', '게시됨'],
  'Publish failed': ['Échec de la publication', 'Pubblicazione non riuscita', 'Veröffentlichung fehlgeschlagen', 'Error de publicación', 'Falha na publicação', 'Ошибка публикации', '发布失败', '發布失敗', '公開に失敗しました', '게시하지 못했습니다'],
  'Relay announcement': ['Annonce du relais', 'Annuncio del relay', 'Relay-Ankündigung', 'Anuncio del relay', 'Anúncio no relay', 'Объявление в релее', '中继公告', '中繼公告', 'リレー公告', '릴레이 공지'],
  Refresh: ['Actualiser', 'Aggiorna', 'Aktualisieren', 'Actualizar', 'Atualizar', 'Обновить', '刷新', '重新整理', '更新', '새로고침'],
  'Not checked': ['Non vérifié', 'Non verificato', 'Nicht geprüft', 'Sin comprobar', 'Não verificado', 'Не проверено', '未检查', '未檢查', '未確認', '확인 안 함'],
  'Checking relays…': ['Vérification des relais…', 'Verifica dei relay…', 'Relays werden geprüft…', 'Comprobando relays…', 'Verificando relays…', 'Проверка релеев…', '正在检查中继…', '正在檢查中繼…', 'リレーを確認中…', '릴레이 확인 중…'],
  Advertised: ['Annoncé', 'Annunciato', 'Angekündigt', 'Anunciado', 'Anunciado', 'Объявлено', '已公告', '已公告', '公告済み', '공지됨'],
  'Not advertised': ['Non annoncé', 'Non annunciato', 'Nicht angekündigt', 'No anunciado', 'Não anunciado', 'Не объявлено', '未公告', '未公告', '未公告', '공지 안 됨'],
  Unknown: ['Inconnu', 'Sconosciuto', 'Unbekannt', 'Desconocido', 'Desconhecido', 'Неизвестно', '未知', '未知', '不明', '알 수 없음'],
  'Secret unavailable': ['Secret indisponible', 'Segreto non disponibile', 'Geheimnis nicht verfügbar', 'Secreto no disponible', 'Segredo indisponível', 'Секрет недоступен', '密钥不可用', '密鑰不可用', 'シークレットを利用できません', '비밀 키를 사용할 수 없음'],
  Remote: ['Distant', 'Remoto', 'Remote', 'Remoto', 'Remoto', 'Удалённый', '远程', '遠端', 'リモート', '원격'],
  relays: ['relais', 'relay', 'relays', 'relays', 'relays', 'релеи', '中继', '中繼', 'リレー', '릴레이'],
  'Last checked': ['Dernière vérification', 'Ultima verifica', 'Zuletzt geprüft', 'Última comprobación', 'Última verificação', 'Последняя проверка', '上次检查', '上次檢查', '最終確認', '마지막 확인'],
  'Could not confirm relay announcement.': ['Impossible de confirmer l’annonce du relais.', 'Impossibile confermare l’annuncio del relay.', 'Die Relay-Ankündigung konnte nicht bestätigt werden.', 'No se pudo confirmar el anuncio del relay.', 'Não foi possível confirmar o anúncio no relay.', 'Не удалось подтвердить объявление в релее.', '无法确认中继公告。', '無法確認中繼公告。', 'リレー公告を確認できませんでした。', '릴레이 공지를 확인하지 못했습니다.']
})

const t = getT(devPanelLocales)

const STYLES = /* css */`
  dev-panel {
    display: block;
    padding-bottom: 24px;
  }
  dev-panel .dev-note {
    color: var(--fg);
    font-size: 12rem;
    line-height: 1.35;
    margin-bottom: 12px;
  }
  dev-panel .dev-section-title {
    color: var(--fg-strong);
    font-size: 13rem;
    font-weight: 700;
    margin-bottom: 10px;
  }
  dev-panel .content-key-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  dev-panel .content-key-row {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
    background-color: var(--surface-sunken);
  }
  dev-panel .row-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  dev-panel .account-identity {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  dev-panel .account-avatar-small {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border-radius: 50%;
    background-color: var(--surface);
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
    box-shadow:
      0 0 0 1px var(--border),
      0 0 0 2px var(--accent);
  }
  dev-panel .account-name {
    min-width: 0;
    color: var(--fg-strong);
    font-size: 13rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  dev-panel .key-groups {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 10px;
  }
  dev-panel .local-keys-header,
  dev-panel .local-key-heading,
  dev-panel .announcement-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  dev-panel .local-keys-heading {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  dev-panel .local-keys-title {
    color: var(--fg-strong);
    font-size: 13rem;
    font-weight: 700;
  }
  dev-panel .local-keys {
    min-width: 0;
  }
  dev-panel .local-keys-count,
  dev-panel .remote-key-label {
    color: var(--fg-muted);
    font-size: 11rem;
  }
  dev-panel .local-keys-heading .status-line {
    margin-top: 2px;
    font-size: 11rem;
  }
  dev-panel .key-badges {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  dev-panel .key-badge {
    border-radius: 999px;
    padding: 2px 7px;
    background-color: var(--surface-sunken);
    color: var(--fg-muted);
    font-size: 11rem;
    font-weight: 700;
  }
  dev-panel .announcement-status .key-badge {
    padding: 0;
  }
  dev-panel .key-badge.is-active {
    background-color: var(--accent-soft);
    color: var(--accent-fg);
  }
  dev-panel .key-badge.is-advertised {
    background-color: var(--surface-sunken);
    color: var(--success-fg);
  }
  dev-panel .key-badge.is-warning {
    background-color: var(--surface-sunken);
    color: var(--error-fg);
  }
  dev-panel .announcement {
    min-width: 0;
  }
  dev-panel .announcement-title {
    color: var(--fg-strong);
    font-size: 13rem;
    font-weight: 700;
    line-height: 1.3;
  }
  dev-panel .refresh-btn {
    min-height: 28px;
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 3px 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background-color: var(--surface);
    color: var(--fg);
    font-size: 11rem;
  }
  dev-panel .refresh-btn:active {
    background-color: var(--surface-interactive);
  }
  dev-panel .refresh-btn:disabled {
    opacity: 0.48;
  }
  dev-panel .refresh-btn svg {
    width: 13px;
    height: 13px;
  }
  dev-panel .announcement-status {
    height: 34px;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 5px;
    color: var(--fg);
    font-size: 11rem;
    line-height: 1.35;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  dev-panel .announcement-status .empty-state,
  dev-panel .announcement-checked {
    color: var(--fg-muted);
  }
  dev-panel .announcement-checked {
    min-width: 0;
  }
  dev-panel .local-key-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-top: 8px;
  }
  dev-panel .announcement .local-key-list {
    margin-top: 0;
  }
  dev-panel .local-key {
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 8px;
    background-color: var(--surface);
  }
  dev-panel .local-key.is-active {
    border-color: var(--accent);
  }
  dev-panel .local-key-pubkey {
    margin-top: 6px;
    color: var(--fg-strong);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  dev-panel .pubkey-line,
  dev-panel .meta-line,
  dev-panel .status-line {
    margin-top: 7px;
    color: var(--fg);
    font-size: 12rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  dev-panel .line-label {
    color: var(--fg-muted);
  }
  dev-panel .status-line.is-error {
    color: var(--error-fg);
  }
  dev-panel .status-line.is-ok {
    color: var(--success-fg);
  }
  dev-panel .generate-btn {
    flex: 0 0 auto;
    min-width: 86px;
    height: 32px;
    border-radius: 8px;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    font-size: 12rem;
    font-weight: 700;
  }
  dev-panel .generate-btn:active {
    background-color: var(--accent-hover);
  }
  dev-panel .generate-btn:disabled {
    opacity: 0.48;
  }
  dev-panel .generate-btn svg {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
  }
  dev-panel .empty-state {
    color: var(--fg-muted);
    font-size: 12rem;
  }
`

function escapeHtml (value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c])
}

function shortPubkey (pubkey) {
  return pubkey ? `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}` : ''
}

function formatDate (createdAt) {
  if (!createdAt) return t('none')
  try {
    return new Date(createdAt * 1000).toLocaleString(getLocale())
  } catch {
    return String(createdAt)
  }
}

function accountAvatarSrc (account) {
  if (account.picture) return Promise.resolve(account.picture)
  return seededAvatarDataUrl(account.pubkey)
}

function setAvatarImage (element, src) {
  element.style.backgroundImage = `url(${JSON.stringify(src)})`
}

function statusLine (status, fallbackError) {
  const label = `<span class="line-label">${t('Last Upsert')}</span>`
  if (fallbackError) {
    return `<div class="status-line is-error" role="status" aria-live="polite">${label} ${escapeHtml(fallbackError)}</div>`
  }
  if (!status) return ''
  const className = status.state === 'publish failed'
    ? 'status-line is-error'
    : status.state === 'published'
      ? 'status-line is-ok'
      : 'status-line'
  const state = status.state === 'publishing'
    ? t('Publishing')
    : status.state === 'published'
      ? t('Published')
      : status.state === 'publish failed'
        ? t('Publish failed')
        : status.state
  const message = status.message ? `: ${status.message}` : ''
  return `<div class="${className}" role="status" aria-live="polite">${label} ${escapeHtml(state + message)}</div>`
}

function localKeyRow (row, key, index, announcement) {
  const isActive = key.pubkey === row.latest?.pubkey
  const isAdvertised = announcement?.status === 'advertised' && announcement.contentPubkey === key.pubkey
  return /* html */`
    <div class="local-key${isActive ? ' is-active' : ''}" data-content-pubkey="${escapeHtml(key.pubkey)}">
      <div class="local-key-heading">
        <span class="local-keys-count">#${index + 1}</span>
        <span class="key-badges">
          ${isActive ? `<span class="key-badge is-active">${t('Active')}</span>` : ''}
          ${isAdvertised ? `<span class="key-badge is-advertised">${t('Advertised')}</span>` : ''}
        </span>
      </div>
      <div class="local-key-pubkey">${escapeHtml(key.pubkey)}</div>
      <div class="meta-line"><span class="line-label">${t('created')}</span> ${escapeHtml(formatDate(key.createdAt))}</div>
      <div class="meta-line"><span class="line-label">${t('source')}</span> ${escapeHtml(key.source || t('none'))}</div>
    </div>
  `
}

function remoteKeyRow (row, announcement) {
  const isActive = announcement.contentPubkey === row.latest?.pubkey
  const presentLocally = (row.keys || []).some(key => key.pubkey === announcement.contentPubkey)
  return /* html */`
    <div class="local-key${isActive ? ' is-active' : ''}" data-content-pubkey="${escapeHtml(announcement.contentPubkey)}">
      <div class="local-key-heading">
        <span class="remote-key-label">${t('Remote')}</span>
        <span class="key-badges">
          ${isActive ? `<span class="key-badge is-active">${t('Active')}</span>` : ''}
          <span class="key-badge is-advertised">${t('Advertised')}</span>
          ${presentLocally ? '' : `<span class="key-badge is-warning">${t('Secret unavailable')}</span>`}
        </span>
      </div>
      <div class="local-key-pubkey">${escapeHtml(announcement.contentPubkey)}</div>
      <div class="meta-line"><span class="line-label">${t('created')}</span> ${escapeHtml(formatDate(announcement.createdAt))}</div>
      <div class="meta-line">${t('relays')} ${announcement.checkedRelayCount || 0}/${announcement.relayCount || 0}</div>
    </div>
  `
}

function announcementStatus (announcement, unlocked) {
  if (!unlocked) return `<span class="empty-state">${t('Unlock the vault to inspect local content keys.')}</span>`
  if (!announcement) return `<span class="key-badge">${t('Not checked')}</span>`
  if (announcement.status === 'loading') return `<span class="key-badge">${t('Checking relays…')}</span>`

  const label = announcement.status === 'advertised'
    ? t('Advertised')
    : announcement.status === 'not-advertised'
      ? t('Not advertised')
      : t('Unknown')
  const className = announcement.status === 'unknown'
    ? 'key-badge is-warning'
    : announcement.status === 'advertised'
      ? 'key-badge is-advertised'
      : 'key-badge'
  const detail = announcement.status === 'unknown' && !announcement.checkedRelayCount
    ? t('Could not confirm relay announcement.')
    : announcement.checkedAt
      ? `${t('Last checked')} ${new Date(announcement.checkedAt).toLocaleString(getLocale())}`
      : ''
  return /* html */`
    <span class="${className}">${label}</span>
    <span class="announcement-checked">${escapeHtml(detail)}</span>
  `
}

function announcementView (row, announcement, unlocked) {
  const refresh = /* html */`
    <button class="refresh-btn" type="button" data-action="refresh-announcement" data-owner="${escapeHtml(row.account.pubkey)}" ${unlocked && announcement?.status !== 'loading' ? '' : 'disabled'}>
      ${ICON_REFRESH}
      <span>${t('Refresh')}</span>
    </button>
  `
  const remote = announcement?.status === 'advertised'
    ? `<div class="local-key-list">${remoteKeyRow(row, announcement)}</div>`
    : ''
  return /* html */`
    <div class="announcement">
      <div class="announcement-header">
        <span class="announcement-title">${t('Relay announcement')}</span>
        ${refresh}
      </div>
      <div class="announcement-status" role="status" aria-live="polite">${announcementStatus(announcement, unlocked)}</div>
      ${remote}
    </div>
  `
}

function accountRow (row, errors, unlocked, announcement) {
  const account = row.account
  const accountName = account.name || shortPubkey(account.pubkey)
  const owner = escapeHtml(account.pubkey)
  const keys = [...(row.keys || [])].sort((a, b) => (
    (b.createdAt || 0) - (a.createdAt || 0) ||
    a.pubkey.localeCompare(b.pubkey)
  ))
  const inventory = !unlocked
    ? `<div class="empty-state">${t('Unlock the vault to inspect local content keys.')}</div>`
    : keys.length
      ? keys.map((key, index) => localKeyRow(row, key, index, announcement)).join('')
      : `<div class="empty-state">${t('No active content key.')}</div>`
  return /* html */`
    <div class="content-key-row">
      <div class="row-top">
        <div class="account-identity">
          <span class="account-avatar-small" data-avatar-pubkey="${owner}" aria-hidden="true"></span>
          <div class="account-name">${escapeHtml(accountName)}</div>
        </div>
      </div>
      <div class="pubkey-line"><span class="line-label">${t('account')}</span> ${owner}</div>
      <div class="key-groups">
        ${announcementView(row, announcement, unlocked)}
        <div class="local-keys">
          <div class="local-keys-header">
            <div class="local-keys-heading">
              <span class="local-keys-title">${t('Local content keys')} (${unlocked ? keys.length : t('none')})</span>
              ${statusLine(row.publishStatus, errors.get(account.pubkey))}
            </div>
            <button class="generate-btn" type="button" data-action="generate-content-key" data-owner="${owner}" title="${escapeHtml(t('Generate and publish a new content key? This changes the active key used for new events.'))}" ${unlocked ? '' : 'disabled'}>
              <span class="btn-icon">${ICON_PLUS}</span>
              <span class="btn-label">${t('Upsert')}</span>
            </button>
          </div>
          <div class="local-key-list">${inventory}</div>
        </div>
      </div>
    </div>
  `
}

export class DevPanel extends HTMLElement {
  #unsubscribeSync = null
  #unsubscribeSecrets = null
  #unsubscribeContentKeys = null
  #unsubscribeStore = null
  #unsubscribePendingMutations = null
  #unsubscribeLocale = null
  #errors = new Map()
  #announcements = new Map()
  #announcementRequests = new Map()
  #announcementGeneration = 0
  #closed = true
  #wasUnlocked = false

  connectedCallback () {
    this.#closed = false
    this.#wasUnlocked = secrets.isUnlocked()
    injectComponentStyles('dev-panel', STYLES)
    this.#unsubscribeSync = sync.subscribeDebug(() => this.render())
    this.#unsubscribeSecrets = secrets.subscribe(() => {
      const unlocked = secrets.isUnlocked()
      if (unlocked !== this.#wasUnlocked) this.#announcementGeneration++
      if (!unlocked) this.#announcements.clear()
      this.#wasUnlocked = unlocked
      this.render()
      if (unlocked) this.#refreshAnnouncements()
    })
    this.#unsubscribeContentKeys = secrets.subscribeContentKeys?.(() => this.render()) || null
    this.#unsubscribeStore = store.subscribe(() => this.render())
    this.#unsubscribePendingMutations = subscribePendingMutations(() => {
      if (!hasPendingMutation()) this.render()
    })
    this.#unsubscribeLocale = subscribeLocaleChanged(() => this.render())
    this.addEventListener('click', this.#onClick)
    this.render()
    if (this.#wasUnlocked) this.#refreshAnnouncements()
  }

  disconnectedCallback () {
    this.#closed = true
    this.#announcementGeneration++
    this.#announcements.clear()
    this.#announcementRequests.clear()
    this.removeEventListener('click', this.#onClick)
    this.#unsubscribeSync?.()
    this.#unsubscribeSecrets?.()
    this.#unsubscribeContentKeys?.()
    this.#unsubscribeStore?.()
    this.#unsubscribePendingMutations?.()
    this.#unsubscribeLocale?.()
  }

  render () {
    const accordionOpen = this.querySelector?.('accordion-panel > details')?.open === true
    const snapshot = sync.getDebugSnapshot()
    const rows = snapshot.accounts.length
      ? snapshot.accounts.map(row => accountRow(
        row,
        this.#errors,
        snapshot.unlocked,
        this.#announcements.get(row.account.pubkey)
      )).join('')
      : `<div class="empty-state">${t('No nsec accounts.')}</div>`
    this.innerHTML = /* html */`
      <accordion-panel header="${t('Development')}" icon="development">
        <div class="dev-note">${t('Vault content-key diagnostics.')}</div>
        <div class="dev-section-title">${t('Content keys')}</div>
        <div class="content-key-list">${rows}</div>
      </accordion-panel>
    `
    const details = this.querySelector?.('accordion-panel > details')
    if (accordionOpen && details) details.open = true
    this.#hydrateAvatars(snapshot.accounts.map(row => row.account))
  }

  #hydrateAvatars (accounts) {
    const avatars = new Map(
      Array.from(this.querySelectorAll('.account-avatar-small'))
        .map(node => [node.dataset.avatarPubkey, node])
    )
    for (const account of accounts) {
      const avatar = avatars.get(account.pubkey)
      if (!avatar) continue
      accountAvatarSrc(account)
        .then(src => {
          if (!this.contains(avatar) || avatar.dataset.avatarPubkey !== account.pubkey) return
          setAvatarImage(avatar, src)
        })
        .catch(err => console.warn('Could not render dev-panel account avatar', err?.message ?? err))
    }
  }

  #refreshAnnouncements () {
    if (this.#closed || !secrets.isUnlocked()) return
    for (const row of sync.getDebugSnapshot().accounts) this.#refreshAnnouncement(row.account.pubkey)
  }

  #refreshAnnouncement (ownerPubkey, { force = false } = {}) {
    if (this.#closed || !secrets.isUnlocked()) return Promise.resolve()
    const pending = this.#announcementRequests.get(ownerPubkey)
    if (pending) {
      return force
        ? pending.then(() => this.#refreshAnnouncement(ownerPubkey, { force: true }))
        : pending
    }
    if (!force && this.#announcements.has(ownerPubkey)) return Promise.resolve()

    const generation = this.#announcementGeneration
    this.#announcements.set(ownerPubkey, { status: 'loading' })
    this.render()
    const read = this._readAnnouncement || readContentKeyAnnouncement
    const request = Promise.resolve()
      .then(() => read({ ownerPubkey }))
      .then(announcement => {
        if (this.#closed || generation !== this.#announcementGeneration || !secrets.isUnlocked()) return
        if (store.get(ownerPubkey)?.type !== 'nsec') return
        this.#announcements.set(ownerPubkey, { ...announcement, checkedAt: Date.now() })
      })
      .catch(() => {
        if (this.#closed || generation !== this.#announcementGeneration || !secrets.isUnlocked()) return
        this.#announcements.set(ownerPubkey, {
          ownerPubkey,
          status: 'unknown',
          reason: 'request-failed',
          relayCount: 0,
          checkedRelayCount: 0,
          failedRelayCount: 0,
          checkedAt: Date.now()
        })
      })
      .finally(() => {
        if (this.#announcementRequests.get(ownerPubkey) === request) this.#announcementRequests.delete(ownerPubkey)
        if (!this.#closed && generation === this.#announcementGeneration) this.render()
      })
    this.#announcementRequests.set(ownerPubkey, request)
    return request
  }

  async #onClick (event) {
    const refreshButton = event.target.closest('button[data-action="refresh-announcement"]')
    if (refreshButton && this.contains(refreshButton)) {
      await this.#refreshAnnouncement(refreshButton.dataset.owner, { force: true })
      return
    }
    const button = event.target.closest('button[data-action="generate-content-key"]')
    if (!button || !this.contains(button)) return
    const ownerPubkey = button.dataset.owner
    this.#errors.delete(ownerPubkey)
    const protectedByPasskey = passkey.hasPasskey()
    if (!protectedByPasskey && !window.confirm(t('Generate and publish a new content key? This changes the active key used for new events.'))) return
    button.disabled = true
    const label = button.querySelector('.btn-label')
    label?.classList.add('pulsate')
    try {
      if (protectedByPasskey) {
        try {
          await passkey.openSecrets()
        } catch (err) {
          console.warn('content-key upsert authentication failed', err?.message ?? err)
          this.#errors.set(ownerPubkey, t('Authentication failed'))
          return
        }
      }
      await sync.generateAndPublishContentKey(ownerPubkey)
      this.#refreshAnnouncement(ownerPubkey, { force: true })
    } catch (err) {
      this.#errors.set(ownerPubkey, err?.message || String(err))
    } finally {
      label?.classList.remove('pulsate')
      this.render()
    }
  }
}

customElements.define('dev-panel', DevPanel)
