import * as store from '../../services/accounts-store.js'
import * as nostr from '../../helpers/nostr/index.js'
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

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'

const FLASH_MS = 1500
const CLOSE_RESET_MS = 300

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
    color: oklch(0.92 0 89.88);
  }
  sync-host .host-cancel {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: oklch(0.28 0 89.88);
    color: oklch(0.92 0 89.88);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  sync-host .host-cancel:active {
    background-color: oklch(0.38 0 89.88);
  }
  sync-host .host-cancel svg {
    width: 12px;
    height: 12px;
  }
  sync-host .host-qr-wrap {
    align-self: center;
    padding: 8px;
    background-color: oklch(0.98 0 0);
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
    background-color: oklch(0.28 0 89.88);
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
    color: oklch(0.92 0 89.88);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  sync-host .host-copy:active {
    background-color: oklch(0.38 0 89.88);
  }
  sync-host .host-copy.is-success {
    color: oklch(0.55 0.18 145);
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
    color: oklch(0.7 0 89.88);
  }
  /* 3-column grid centers the digits even though the copy button only sits
     on the right (column 1 mirrors column 3's button width). */
  sync-host .host-code {
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    align-items: center;
    background-color: oklch(0.28 0 89.88);
    color: oklch(0.92 0 89.88);
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
    color: oklch(0.92 0 89.88);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  sync-host .host-code-copy:active {
    background-color: oklch(0.38 0 89.88);
  }
  sync-host .host-code-copy.is-success {
    color: oklch(0.55 0.18 145);
  }
  sync-host .host-code-copy svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  sync-host .host-status {
    font-size: 12rem;
    align-self: center;
    color: oklch(0.7 0 89.88);
    min-height: 16px;
  }
  sync-host .host-status.is-error { color: oklch(0.7 0.18 25); }
  sync-host .host-status.is-success { color: oklch(0.7 0.16 145); }
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
    this.#resetUi()
  }

  disconnectedCallback () {
    if (this.#copyTimer) clearTimeout(this.#copyTimer)
    if (this.#codeCopyTimer) clearTimeout(this.#codeCopyTimer)
    this.#clearResetTimer()
    this.#openToken = null
    this.#session?.close()
  }

  open () {
    if (this.hasAttribute('open') || this.#openToken) return
    this.#clearResetTimer()
    this.#prepareAndStartSession()
  }

  close () {
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
    this.onClosed?.()
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
        ? 'Devices synced'
        : `Synced: imported ${prepared.length} account${prepared.length === 1 ? '' : 's'}`
      if (errors.length) toast.warning(`${summary} (${errors.length} failed)`, errors.join('\n'))
      else toast.success(summary)

      this.#setStatus('Done.', 'success')
      setTimeout(() => this.close(), 1200)
      return outgoing
    } catch (err) {
      this.#setStatus('Sync failed', 'error') // User sees toast for details
      const message = err?.message === 'IMPORT_CANCELLED' ? 'Sync cancelled' : 'Sync failed'
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

  #setStatus (msg, kind) {
    this.#status.textContent = msg
    this.#status.classList.toggle('is-error', kind === 'error')
    this.#status.classList.toggle('is-success', kind === 'success')
  }
}

function passkeyPrepareErrorToToast (err) {
  if (err?.name === 'NotAllowedError') {
    return { message: 'Pairing cancelled', longMessage: 'The passkey prompt was cancelled.' }
  }
  return { message: 'Pairing failed', longMessage: err?.message ?? String(err) }
}

customElements.define('sync-host', SyncHost)
