import { injectComponentStyles } from '../helpers/dom.js'
import './shared/accordion-panel.js'
import * as sync from '../services/sync/index.js'
import * as secrets from '../services/secrets.js'
import * as store from '../services/accounts-store.js'
import { seededAvatarDataUrl } from '../services/avatar.js'

const ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l0 14" /><path d="M5 12l14 0" /></svg>'
const avatarCache = new Map()

const STYLES = /* css */`
  dev-panel {
    display: block;
    padding-bottom: 24px;
  }
  dev-panel .dev-note {
    color: oklch(0.68 0 89.88);
    font-size: 12rem;
    line-height: 1.35;
    margin-bottom: 12px;
  }
  dev-panel .dev-section-title {
    color: oklch(0.92 0 89.88);
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
    border: 1px solid oklch(0.33 0 89.88);
    border-radius: 8px;
    padding: 10px;
    background-color: oklch(0.18 0 89.88);
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
    background-color: oklch(0.22 0 89.88);
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
    box-shadow:
      0 0 0 1px oklch(0.18 0 89.88),
      0 0 0 2px oklch(0.3 0.12 274.76);
  }
  dev-panel .account-name {
    min-width: 0;
    color: oklch(0.9 0 89.88);
    font-size: 13rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  dev-panel .pubkey-line,
  dev-panel .meta-line,
  dev-panel .status-line {
    margin-top: 7px;
    color: oklch(0.7 0 89.88);
    font-size: 12rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  dev-panel .line-label {
    color: oklch(0.56 0 89.88);
  }
  dev-panel .status-line.is-error {
    color: oklch(0.72 0.17 28);
  }
  dev-panel .status-line.is-ok {
    color: oklch(0.74 0.14 148);
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
    background-color: oklch(0.3 0.12 274.76);
    color: oklch(0.92 0 89.88);
    font-size: 12rem;
    font-weight: 700;
  }
  dev-panel .generate-btn:active {
    background-color: oklch(0.38 0.1 274.76);
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
    color: oklch(0.64 0 89.88);
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
  if (!createdAt) return 'none'
  try {
    return new Date(createdAt * 1000).toLocaleString()
  } catch {
    return String(createdAt)
  }
}

function accountAvatarSrc (account) {
  if (account.picture) return Promise.resolve(account.picture)
  if (!avatarCache.has(account.pubkey)) {
    avatarCache.set(account.pubkey, seededAvatarDataUrl(account.pubkey))
  }
  return avatarCache.get(account.pubkey)
}

function setAvatarImage (element, src) {
  element.style.backgroundImage = `url(${JSON.stringify(src)})`
}

function statusLine (status, fallbackError) {
  if (fallbackError) {
    return `<div class="status-line is-error"><span class="line-label">status</span> ${escapeHtml(fallbackError)}</div>`
  }
  if (!status) return ''
  const className = status.state === 'publish failed'
    ? 'status-line is-error'
    : status.state === 'published'
      ? 'status-line is-ok'
      : 'status-line'
  const message = status.message ? `: ${status.message}` : ''
  return `<div class="${className}"><span class="line-label">status</span> ${escapeHtml(status.state + message)}</div>`
}

function accountRow (row, errors, unlocked) {
  const account = row.account
  const latest = row.latest
  const accountName = account.name || shortPubkey(account.pubkey)
  const owner = escapeHtml(account.pubkey)
  const pubkey = latest?.pubkey || ''
  const source = latest ? row.source : 'none'
  const createdAt = latest ? formatDate(latest.createdAt) : 'none'
  return /* html */`
    <div class="content-key-row">
      <div class="row-top">
        <div class="account-identity">
          <span class="account-avatar-small" data-avatar-pubkey="${owner}" aria-hidden="true"></span>
          <div class="account-name">${escapeHtml(accountName)}</div>
        </div>
        <button class="generate-btn" type="button" data-action="generate-content-key" data-owner="${owner}" ${unlocked ? '' : 'disabled'}>
          <span class="btn-icon">${ICON_PLUS}</span>
          <span class="btn-label">Upsert</span>
        </button>
      </div>
      <div class="pubkey-line"><span class="line-label">account</span> ${owner}</div>
      <div class="pubkey-line"><span class="line-label">content</span> ${escapeHtml(pubkey || 'none')}</div>
      <div class="meta-line"><span class="line-label">created</span> ${escapeHtml(createdAt)}</div>
      <div class="meta-line"><span class="line-label">source</span> ${escapeHtml(source)}</div>
      ${statusLine(row.publishStatus, errors.get(account.pubkey))}
    </div>
  `
}

export class DevPanel extends HTMLElement {
  #unsubscribeSync = null
  #unsubscribeSecrets = null
  #unsubscribeStore = null
  #errors = new Map()

  connectedCallback () {
    injectComponentStyles('dev-panel', STYLES)
    this.#unsubscribeSync = sync.subscribeDebug(() => this.render())
    this.#unsubscribeSecrets = secrets.subscribe(() => this.render())
    this.#unsubscribeStore = store.subscribe(() => this.render())
    this.addEventListener('click', this.#onClick)
    this.render()
  }

  disconnectedCallback () {
    this.removeEventListener('click', this.#onClick)
    this.#unsubscribeSync?.()
    this.#unsubscribeSecrets?.()
    this.#unsubscribeStore?.()
  }

  render () {
    const snapshot = sync.getDebugSnapshot()
    const rows = snapshot.accounts.length
      ? snapshot.accounts.map(row => accountRow(row, this.#errors, snapshot.unlocked)).join('')
      : '<div class="empty-state">No nsec accounts.</div>'
    this.innerHTML = /* html */`
      <accordion-panel header="Development" icon="development" open>
        <div class="dev-note">Top-level vault diagnostics.</div>
        <div class="dev-section-title">Content keys</div>
        <div class="content-key-list">${rows}</div>
      </accordion-panel>
    `
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

  async #onClick (event) {
    const button = event.target.closest('button[data-action="generate-content-key"]')
    if (!button || !this.contains(button)) return
    const ownerPubkey = button.dataset.owner
    this.#errors.delete(ownerPubkey)
    button.disabled = true
    button.querySelector('.btn-label')?.classList.add('pulsate')
    try {
      await sync.generateAndPublishContentKey(ownerPubkey)
    } catch (err) {
      this.#errors.set(ownerPubkey, err?.message || String(err))
      this.render()
    }
  }
}

customElements.define('dev-panel', DevPanel)
