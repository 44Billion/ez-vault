import * as log from '../services/messenger-log/index.js'
import * as accountsStore from '../services/accounts-store.js'
import * as secrets from '../services/secrets.js'
import { seededAvatarDataUrl } from '../services/avatar.js'
import { injectComponentStyles } from '../helpers/dom.js'
import { defineLocales, getLocale, getT, subscribeLocaleChanged } from '../i18n/index.js'
import './shared/table-saw.js'

// Manual override. When true, fixtures.json (next to messenger-log) is
// merged into the displayed list so we can eyeball every method/kind
// shape without driving each one through the real signer pipeline.
const DEV_MODE = window === window.top // true

export const activityLogLocales = defineLocales({
  'Unknown app': ['Application inconnue', 'App sconosciuta', 'Unbekannte App', 'Aplicación desconocida', 'App desconhecido', 'Неизвестное приложение', '未知应用', '未知應用程式', '不明なアプリ', '알 수 없는 앱'],
  Unknown: ['Inconnu', 'Sconosciuto', 'Unbekannt', 'Desconocido', 'Desconhecido', 'Неизвестно', '未知', '未知', '不明', '알 수 없음'],
  'NostrDB merge': ['Fusion NostrDB', 'Unione NostrDB', 'NostrDB-Zusammenführung', 'Fusión de NostrDB', 'Mesclagem do NostrDB', 'Слияние NostrDB', 'NostrDB 合并', 'NostrDB 合併', 'NostrDB マージ', 'NostrDB 병합'],
  'NostrDB maintenance': ['Maintenance NostrDB', 'Manutenzione NostrDB', 'NostrDB-Wartung', 'Mantenimiento de NostrDB', 'Manutenção do NostrDB', 'Обслуживание NostrDB', 'NostrDB 维护', 'NostrDB 維護', 'NostrDB メンテナンス', 'NostrDB 유지관리'],
  'Sign event': ['Signer l’événement', 'Firma evento', 'Event signieren', 'Firmar evento', 'Assinar evento', 'Подписать событие', '签名事件', '簽署事件', 'イベントに署名', '이벤트 서명'],
  'Sign event (kind {{kind}})': ['Signer l’événement (kind {{kind}})', 'Firma evento (kind {{kind}})', 'Event signieren (Kind {{kind}})', 'Firmar evento (kind {{kind}})', 'Assinar evento (kind {{kind}})', 'Подписать событие (kind {{kind}})', '签名事件（kind {{kind}}）', '簽署事件（kind {{kind}}）', 'イベントに署名（kind {{kind}}）', '이벤트 서명(kind {{kind}})'],
  'Double-sign event': ['Signer deux fois l’événement', 'Firma doppia evento', 'Event doppelt signieren', 'Firmar dos veces el evento', 'Assinar evento duas vezes', 'Двойная подпись события', '双重签名事件', '雙重簽署事件', 'イベントに二重署名', '이벤트 이중 서명'],
  'Double-sign event (kind {{kind}})': ['Signer deux fois l’événement (kind {{kind}})', 'Firma doppia evento (kind {{kind}})', 'Event doppelt signieren (Kind {{kind}})', 'Firmar dos veces el evento (kind {{kind}})', 'Assinar evento duas vezes (kind {{kind}})', 'Двойная подпись события (kind {{kind}})', '双重签名事件（kind {{kind}}）', '雙重簽署事件（kind {{kind}}）', 'イベントに二重署名（kind {{kind}}）', '이벤트 이중 서명(kind {{kind}})'],
  Encrypt: ['Chiffrer', 'Cifra', 'Verschlüsseln', 'Cifrar', 'Criptografar', 'Зашифровать', '加密', '加密', '暗号化', '암호화'],
  Decrypt: ['Déchiffrer', 'Decifra', 'Entschlüsseln', 'Descifrar', 'Descriptografar', 'Расшифровать', '解密', '解密', '復号', '복호화'],
  'No activity yet.': ['Aucune activité.', 'Nessuna attività.', 'Noch keine Aktivität.', 'Aún no hay actividad.', 'Ainda não há atividade.', 'Активности пока нет.', '暂无活动。', '尚無活動。', 'アクティビティはまだありません。', '아직 활동이 없습니다.'],
  App: ['Application', 'App', 'App', 'Aplicación', 'App', 'Приложение', '应用', '應用程式', 'アプリ', '앱'],
  Operation: ['Opération', 'Operazione', 'Vorgang', 'Operación', 'Operação', 'Операция', '操作', '操作', '操作', '작업'],
  Data: ['Données', 'Dati', 'Daten', 'Datos', 'Dados', 'Данные', '数据', '資料', 'データ', '데이터'],
  Time: ['Heure', 'Ora', 'Zeit', 'Hora', 'Hora', 'Время', '时间', '時間', '時刻', '시간'],
  failed: ['échec', 'non riuscito', 'fehlgeschlagen', 'fallido', 'falhou', 'ошибка', '失败', '失敗', '失敗', '실패'],
  '(failed)': ['(échec)', '(non riuscito)', '(fehlgeschlagen)', '(fallido)', '(falhou)', '(ошибка)', '（失败）', '（失敗）', '（失敗）', '(실패)'],
  '(no payload)': ['(aucun contenu)', '(nessun payload)', '(keine Nutzdaten)', '(sin contenido)', '(sem conteúdo)', '(нет данных)', '（无内容）', '（無內容）', '（ペイロードなし）', '(페이로드 없음)'],
  Copy: ['Copier', 'Copia', 'Kopieren', 'Copiar', 'Copiar', 'Копировать', '复制', '複製', 'コピー', '복사']
})

const t = getT(activityLogLocales)

const FIXTURES_URL = new URL('../services/messenger-log/fixtures.json', import.meta.url)

const FLASH_MS = 1200

const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'
const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6" /></svg>'

const STYLES = /* css */`
  activity-log {
    display: block;
    padding-top: 6px;
  }
  /* When activity-log has no entries, hide the entire accordion (header
     and all) so the user isn't tempted to expand an empty panel. The
     component owns this rule rather than a parent because the empty
     state is its own state to manage. */
  accordion-panel:has(activity-log[data-empty]) {
    display: none;
  }
  activity-log .empty {
    padding: 16px 4px;
    color: oklch(0.6 0 89.88);
    font-size: 13rem;
    text-align: center;
  }
  activity-log table {
    /* table-layout: fixed — without this, an unbreakable line in any cell
       (e.g. a long base64 ciphertext or a wrapped long-form note rendered
       with white-space: nowrap on the summary) overrides width: 100% and
       pushes the table past <table-saw>, which also hides the Time column
       and defeats text-overflow: ellipsis (no shorter box to clip in). */
    table-layout: fixed;
    width: 100%;
    border-collapse: collapse;
    font-size: 13rem;
    color: oklch(0.85 0 89.88);
  }
  /* In stacked mode table-saw turns cells into display: grid, so the col
     widths only matter for the desktop / wide preview. */
  activity-log col.col-app { width: 25%; }
  activity-log col.col-op { width: 22%; }
  activity-log col.col-data { width: 38%; }
  activity-log col.col-time { width: 15%; }
  /* Below table-saw's default stacking breakpoint the colgroup actively
     fights the stacked grid layout (cells aren't table-cells anymore, so
     the col widths just compress everything against the left). Drop it.
     <table-saw type="container"> creates the inline-size container we
     query here. Keep this in sync with table-saw's default breakpoint. */
  @container (max-width: 39.9375em) {
    activity-log colgroup { display: none; }
    /* zero-padding on table-saw kills horizontal cell padding when stacked,
       so the zebra goes flush to the table-saw edge without it. Put the
       horizontal breathing room on the row instead. */
    activity-log tbody tr {
      padding: 0 10px;
    }
  }
  activity-log thead th {
    overflow-wrap: break-word; /* override overflow-wrap: anywhere; from reset.css */
    text-align: left;
    padding: 6px 6px;
    font-size: 11rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: oklch(0.62 0 89.88);
    border-bottom: 1px solid oklch(0.28 0 89.88);
  }
  activity-log tbody td {
    padding: 10px 6px;
    vertical-align: top;
  }
  activity-log tbody tr {
    border-bottom: 1px solid oklch(0.25 0 89.88);
  }
  /* Explicit on both odd and even so neither row falls through to the
     accordion-panel's bg (which would create an inconsistent zebra). */
  activity-log tbody tr:nth-child(odd) {
    background-color: oklch(0.22 0 89.88);
  }
  activity-log tbody tr:nth-child(even) {
    background-color: oklch(0.25 0 89.88);
  }
  activity-log tbody tr:last-child {
    border-bottom: 0;
  }
  activity-log .app-cell {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  activity-log .app-icon-wrap {
    position: relative;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
  }
  activity-log .app-icon {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    background-color: light-dark(oklch(0.34 0.12 274.76), oklch(0.3 0.12 274.76));
    color: light-dark(oklch(0.88 0 89.88), oklch(0.92 0 89.88));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    overflow: hidden;
    position: relative;
  }
  activity-log .app-icon-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: none;
  }
  activity-log .app-icon[data-loaded="true"] .app-icon-image {
    display: block;
  }
  activity-log .app-icon[data-loaded="true"] .app-icon-fallback {
    display: none;
  }
  activity-log .pubkey-avatar {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: light-dark(oklch(0.78 0 89.88), oklch(0.22 0 89.88));
    border: 1.5px solid light-dark(oklch(0.78 0 89.88), oklch(0.22 0 89.88));
    box-shadow: 0 0 0 1px light-dark(oklch(0.6 0.1 274.76), oklch(0.4 0.1 274.76));
    object-fit: cover;
  }
  activity-log .app-name {
    font-size: 13rem;
    color: oklch(0.85 0 89.88);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  activity-log .op-method {
    display: block;
    font-weight: 600;
    color: light-dark(oklch(0.88 0 89.88), oklch(0.92 0 89.88));
  }
  activity-log .op-status {
    display: inline-block;
    margin-top: 2px;
    font-size: 11rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  activity-log .op-status[data-status="failure"] {
    color: oklch(0.7 0.18 25);
  }
  activity-log .op-status[data-status="success"] {
    display: none;
  }
  activity-log .data-cell details {
    display: block;
  }
  activity-log .data-cell summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    border-radius: 4px;
    color: oklch(0.85 0 89.88);
    user-select: none;
  }
  activity-log .data-cell summary::-webkit-details-marker {
    display: none;
  }
  activity-log .data-cell summary:active {
    background-color: oklch(0.30 0 89.88);
    color: light-dark(oklch(0.88 0 89.88), oklch(0.92 0 89.88));
  }
  activity-log .data-cell .data-preview {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  activity-log .data-cell details[open] .data-preview {
    white-space: normal;
    word-break: break-word;
    color: light-dark(oklch(0.88 0 89.88), oklch(0.92 0 89.88));
  }
  activity-log .data-cell .data-toggle-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.65 0 89.88);
    transition: transform 180ms ease-out;
  }
  activity-log .data-cell .data-toggle-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  activity-log .data-cell details[open] .data-toggle-icon {
    transform: rotate(180deg);
  }
  activity-log .data-cell details[open] summary {
    margin-bottom: 6px;
  }
  activity-log .data-cell .empty-data {
    color: oklch(0.5 0 89.88);
    font-style: italic;
  }
  activity-log .data-full {
    margin: 0;
    background-color: oklch(0.18 0 89.88);
    border-radius: 6px;
    padding: 8px 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 280px;
    overflow: auto;
    color: oklch(0.85 0 89.88);
  }
  activity-log .data-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
  }
  activity-log .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: light-dark(oklch(0.34 0.12 274.76), oklch(0.3 0.12 274.76));
    color: light-dark(oklch(0.88 0 89.88), oklch(0.92 0 89.88));
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12rem;
    cursor: pointer;
    border: 0;
  }
  activity-log .copy-btn:active {
    background-color: oklch(0.38 0.1 274.76);
  }
  activity-log .copy-btn.is-success {
    background-color: oklch(0.55 0.18 145);
  }
  activity-log .copy-btn.is-error {
    background-color: oklch(0.55 0.2 25);
  }
  activity-log .copy-btn .copy-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  activity-log .copy-btn .copy-btn-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  activity-log time {
    color: oklch(0.62 0 89.88);
    font-size: 12rem;
    white-space: nowrap;
  }
`

async function resolvePicture (pubkey) {
  return accountsStore.get(pubkey)?.picture || seededAvatarDataUrl(pubkey)
}

let fixturesPromise = null
function loadFixtures () {
  if (fixturesPromise) return fixturesPromise
  fixturesPromise = fetch(FIXTURES_URL)
    .then(r => r.ok ? r.json() : [])
    .catch(err => {
      console.warn('activity-log: fixtures load failed', err?.message ?? err)
      return []
    })
    .then(arr => Array.isArray(arr) ? arr : [])
  return fixturesPromise
}

function escapeHtml (s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function appFallbackLetters (app) {
  const name = app?.name?.trim()
  const id = (app?.id ?? '').replace(/^\+{1,3}/, '').trim()
  const source = name || id
  return (source.slice(0, 2) || '??').toUpperCase()
}

function appDisplayName (app) {
  const name = app?.name?.trim()
  if (name) return name
  const id = (app?.id ?? '').replace(/^\+{1,3}/, '').trim()
  return id || t('Unknown app')
}

function nip44v3Label (action, suffix, eventKind) {
  const translatedAction = t(action)
  return eventKind != null
    ? `${translatedAction} (NIP-44 v3${suffix}, kind ${eventKind})`
    : `${translatedAction} (NIP-44 v3${suffix})`
}

function contextLabel (context) {
  if (context === 'nostrdb_merge') return t('NostrDB merge')
  if (context === 'nostrdb_maintenance') return t('NostrDB maintenance')
  return ''
}

function methodLabel (method, eventKind, _code, context) {
  let label
  switch (method) {
    case 'sign_event':
      label = eventKind != null ? t('Sign event (kind {{kind}})', { kind: eventKind }) : t('Sign event')
      break
    case 'double_sign_event':
      label = eventKind != null ? t('Double-sign event (kind {{kind}})', { kind: eventKind }) : t('Double-sign event')
      break
    case 'nip04_encrypt':
      label = `${t('Encrypt')} (NIP-04)`
      break
    case 'nip04_decrypt':
      label = `${t('Decrypt')} (NIP-04)`
      break
    case 'nip44_encrypt':
      label = `${t('Encrypt')} (NIP-44)`
      break
    case 'nip44_decrypt':
      label = `${t('Decrypt')} (NIP-44)`
      break
    case 'nip44v3_encrypt':
      label = nip44v3Label('Encrypt', '', eventKind)
      break
    case 'nip44v3_decrypt':
      label = nip44v3Label('Decrypt', '', eventKind)
      break
    case 'nip44v3_encrypt_double_dh':
      label = nip44v3Label('Encrypt', ' Double-DH', eventKind)
      break
    case 'nip44v3_decrypt_double_dh':
      label = nip44v3Label('Decrypt', ' Double-DH', eventKind)
      break
    default:
      label = method ?? t('Unknown')
  }
  const suffix = contextLabel(context)
  return suffix ? `${label} · ${suffix}` : label
}

// Pick the most user-relevant single field per method for the collapsed row
// preview. The expanded `<details>` body shows the whole entry as JSON.
function previewFor (entry) {
  if (entry.status === 'failure') return entry.error?.message ?? t('(failed)')
  switch (entry.method) {
    case 'sign_event':
    case 'double_sign_event':
      return entry.params?.[0]?.content ?? ''
    case 'nip04_encrypt':
    case 'nip44_encrypt':
      return entry.params?.[1] ?? ''
    case 'nip44v3_encrypt':
      return entry.params?.[3] ?? ''
    case 'nip44v3_encrypt_double_dh':
      return entry.params?.[3] ?? ''
    case 'nip04_decrypt':
    case 'nip44_decrypt':
      return entry.result ?? ''
    case 'nip44v3_decrypt':
      return entry.result ?? ''
    case 'nip44v3_decrypt_double_dh':
      return entry.params?.[3] ?? ''
    default:
      return ''
  }
}

function relativeTime (tsSeconds) {
  if (!tsSeconds) return ''
  const now = Math.floor(Date.now() / 1000)
  const diff = Math.max(0, now - tsSeconds)
  const relative = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' })
  if (diff < 60) return relative.format(-diff, 'second')
  if (diff < 3600) return relative.format(-Math.floor(diff / 60), 'minute')
  if (diff < 86400) return relative.format(-Math.floor(diff / 3600), 'hour')
  if (diff < 86400 * 7) return relative.format(-Math.floor(diff / 86400), 'day')
  return new Date(tsSeconds * 1000).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
}

export class ActivityLog extends HTMLElement {
  #unsub = null
  #unsubSecrets = null
  #unsubAccounts = null
  #unsubLocale = null
  #renderId = 0

  connectedCallback () {
    injectComponentStyles('activity-log', STYLES)
    this.addEventListener('click', this.#onClick)
    this.#unsub = log.subscribe(() => this.#render())
    // Sealed entries inflate to their decrypted shape only while the vault
    // is unlocked; re-render on lock state changes so previews refresh.
    this.#unsubSecrets = secrets.subscribe(() => this.#render())
    this.#unsubAccounts = accountsStore.subscribe(() => this.#render())
    this.#unsubLocale = subscribeLocaleChanged(() => this.#render())
    this.#render()
  }

  disconnectedCallback () {
    this.removeEventListener('click', this.#onClick)
    this.#unsub?.()
    this.#unsub = null
    this.#unsubSecrets?.()
    this.#unsubSecrets = null
    this.#unsubAccounts?.()
    this.#unsubAccounts = null
    this.#unsubLocale?.()
    this.#unsubLocale = null
  }

  async #render () {
    const id = ++this.#renderId
    let entries = await log.list()
    if (DEV_MODE) {
      const fixtures = await loadFixtures()
      if (id !== this.#renderId) return
      entries = [...entries, ...fixtures].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    }
    if (id !== this.#renderId) return

    if (entries.length === 0) {
      // [data-empty] hides the wrapping accordion-panel via :has() so the
      // user doesn't see an empty disclosure. Keep the inner empty-state
      // markup as a fallback for contexts where activity-log is used
      // outside an accordion.
      this.toggleAttribute('data-empty', true)
      this.replaceChildren(Object.assign(document.createElement('div'), {
        className: 'empty',
        textContent: t('No activity yet.')
      }))
      return
    }
    this.toggleAttribute('data-empty', false)

    const tableSaw = document.createElement('table-saw')
    tableSaw.setAttribute('type', 'container')
    tableSaw.setAttribute('zero-padding', '')
    tableSaw.innerHTML = `
      <table>
        <colgroup>
          <col class="col-app" />
          <col class="col-op" />
          <col class="col-data" />
          <col class="col-time" />
        </colgroup>
        <thead>
          <tr><th>${t('App')}</th><th>${t('Operation')}</th><th>${t('Data')}</th><th>${t('Time')}</th></tr>
        </thead>
        <tbody>
          ${entries.map((e, i) => this.#rowHtml(e, i)).join('')}
        </tbody>
      </table>
    `
    this.replaceChildren(tableSaw)
    this.#hydratePictures(entries)
  }

  #rowHtml (entry, idx) {
    const app = entry.app ?? {}
    const fallback = appFallbackLetters(app)
    const name = appDisplayName(app)
    const op = methodLabel(entry.method, entry.eventKind, entry.code, entry.context)
    const preview = previewFor(entry)
    const fullJson = JSON.stringify(entry, null, 2)
    const status = entry.status ?? 'success'
    const ts = entry.ts ?? 0
    const rel = relativeTime(ts)
    const iso = ts ? new Date(ts * 1000).toISOString() : ''
    const abs = ts ? new Date(ts * 1000).toLocaleString(getLocale()) : ''
    const summaryInner = preview
      ? escapeHtml(preview)
      : `<span class="empty-data">${t('(no payload)')}</span>`

    return `
      <tr data-row="${idx}">
        <td>
          <div class="app-cell">
            <div class="app-icon-wrap" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}">
              <div class="app-icon" data-loaded="false">
                <img class="app-icon-image" alt="" />
                <span class="app-icon-fallback">${escapeHtml(fallback)}</span>
              </div>
              <img class="pubkey-avatar" alt="" />
            </div>
            <span class="app-name">${escapeHtml(name)}</span>
          </div>
        </td>
        <td>
          <span class="op-method">${escapeHtml(op)}</span>
          <span class="op-status" data-status="${escapeHtml(status)}">${t('failed')}</span>
        </td>
        <td class="data-cell">
          <details>
            <summary>
              <span class="data-preview">${summaryInner}</span>
              <span class="data-toggle-icon" aria-hidden="true">${ICON_CHEVRON}</span>
            </summary>
            <pre class="data-full">${escapeHtml(fullJson)}</pre>
            <div class="data-actions">
              <button type="button" class="copy-btn" data-action="copy">
                <span class="copy-btn-icon">${ICON_COPY}</span>
                <span>${t('Copy')}</span>
              </button>
            </div>
          </details>
        </td>
        <td>
          <time datetime="${escapeHtml(iso)}" title="${escapeHtml(abs)}">${escapeHtml(rel)}</time>
        </td>
      </tr>
    `
  }

  #hydratePictures (entries) {
    const wraps = this.querySelectorAll('.app-icon-wrap')
    wraps.forEach((wrap, i) => {
      const entry = entries[i]
      if (!entry) return

      const app = entry.app ?? {}
      const iconBox = wrap.querySelector('.app-icon')
      const iconImg = wrap.querySelector('.app-icon-image')
      if (iconBox && iconImg && app.icon) {
        iconImg.onload = () => {
          if (iconImg.isConnected) iconBox.dataset.loaded = 'true'
        }
        iconImg.onerror = () => { /* keep fallback letters */ }
        iconImg.src = app.icon
      }

      const pubkeyImg = wrap.querySelector('.pubkey-avatar')
      if (pubkeyImg && entry.pubkey) {
        resolvePicture(entry.pubkey).then(url => {
          if (pubkeyImg.isConnected && url) pubkeyImg.src = url
        })
      }
    })
  }

  #onClick = async (e) => {
    const btn = e.target.closest('button[data-action="copy"]')
    if (!btn || btn.disabled) return
    const pre = btn.closest('details')?.querySelector('.data-full')
    if (!pre) return
    btn.disabled = true
    try {
      await navigator.clipboard.writeText(pre.textContent ?? '')
      this.#flash(btn, ICON_CHECK, 'is-success')
    } catch (err) {
      console.error('activity-log copy failed', err)
      this.#flash(btn, ICON_COPY, 'is-error')
    }
  }

  #flash (btn, glyphHtml, cls) {
    const icon = btn.querySelector('.copy-btn-icon')
    const prev = icon?.innerHTML
    if (icon) icon.innerHTML = glyphHtml
    btn.classList.add(cls)
    setTimeout(() => {
      btn.classList.remove(cls)
      if (icon && prev != null) icon.innerHTML = prev
      btn.disabled = false
    }, FLASH_MS)
  }
}

customElements.define('activity-log', ActivityLog)
