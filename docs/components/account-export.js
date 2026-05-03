import * as store from '../services/accounts-store.js'
import * as nostr from '../services/nostr.js'
import { ExportSession, buildExportPayload } from '../services/nostrpair.js'
import { generateQrDataUrl } from '../helpers/qrcode.js'
import { injectComponentStyles } from '../helpers/dom.js'

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>'

const FLASH_MS = 1500

const STYLES = /* css */`
  account-export {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  account-export[open] {
    max-height: 620px;
  }
  account-export .export-panel {
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  account-export .export-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  account-export .export-title {
    font-size: 14rem;
    font-weight: 600;
    color: oklch(0.92 0 89.88);
  }
  account-export .export-cancel {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: oklch(0.28 0 89.88);
    color: oklch(0.92 0 89.88);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  account-export .export-cancel:active {
    background-color: oklch(0.38 0 89.88);
  }
  account-export .export-cancel svg {
    width: 16px;
    height: 16px;
  }
  account-export .export-qr-wrap {
    align-self: center;
    padding: 8px;
    background-color: oklch(0.98 0 0);
    border-radius: 8px;
  }
  account-export .export-qr {
    display: block;
    width: 200px;
    height: 200px;
    image-rendering: pixelated;
  }
  account-export .export-url-row {
    position: relative;
  }
  account-export .export-url {
    width: 100%;
    padding-right: 42px;
    background-color: oklch(0.28 0 89.88);
    font-size: 12rem;
  }
  account-export .export-copy {
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
  account-export .export-copy:active {
    background-color: oklch(0.38 0 89.88);
  }
  account-export .export-copy.is-success {
    color: oklch(0.55 0.18 145);
  }
  account-export .export-copy svg {
    width: 16px;
    height: 16px;
  }
  account-export .export-pin-label {
    font-size: 12rem;
    color: oklch(0.7 0 89.88);
  }
  account-export .export-pin {
    width: 100%;
    text-align: center;
    letter-spacing: 0.4em;
    font-size: 22rem;
    font-variant-numeric: tabular-nums;
    background-color: oklch(0.28 0 89.88);
  }
  account-export .export-pin.is-error {
    background-color: oklch(0.32 0.12 25);
  }
  account-export .export-status {
    font-size: 12rem;
    color: oklch(0.7 0 89.88);
    min-height: 16px;
  }
  account-export .export-status.is-error { color: oklch(0.7 0.18 25); }
  account-export .export-status.is-success { color: oklch(0.7 0.16 145); }
`

const TEMPLATE = /* html */`
  <div class="export-panel">
    <div class="export-header">
      <button class="export-cancel" type="button" title="Cancel">${ICON_X}</button>
      <span class="export-title">Pair another vault</span>
    </div>
    <div class="export-qr-wrap"><img class="export-qr" alt="" /></div>
    <div class="export-url-row">
      <input class="export-url" readonly />
      <button class="export-copy" type="button" title="Copy URL">${ICON_COPY}</button>
    </div>
    <label class="export-pin-label">Type the 6-digit code shown on the other device</label>
    <input class="export-pin" inputmode="numeric" maxlength="6" placeholder="------" autocomplete="off" />
    <div class="export-status"></div>
  </div>
`

export class AccountExport extends HTMLElement {
  #qrImage
  #urlInput
  #copyBtn
  #cancelBtn
  #pinInput
  #status
  #copyTimer = null
  #pinErrorTimer = null
  #session = null
  #busy = false

  // Wired by index.js so the panel can drive the list's selection mode and
  // re-enable the disabled toolbar buttons on close.
  list = null
  toolbarButtons = []

  connectedCallback () {
    injectComponentStyles('account-export', STYLES)
    this.innerHTML = TEMPLATE
    this.#qrImage = this.querySelector('.export-qr')
    this.#urlInput = this.querySelector('.export-url')
    this.#copyBtn = this.querySelector('.export-copy')
    this.#cancelBtn = this.querySelector('.export-cancel')
    this.#pinInput = this.querySelector('.export-pin')
    this.#status = this.querySelector('.export-status')

    this.#cancelBtn.addEventListener('click', () => this.close())
    this.#copyBtn.addEventListener('click', this.#onCopyUrl)
    this.#pinInput.addEventListener('input', this.#onPinInput)
    this.#urlInput.addEventListener('focus', () => this.#urlInput.select())
  }

  disconnectedCallback () {
    if (this.#copyTimer) clearTimeout(this.#copyTimer)
    if (this.#pinErrorTimer) clearTimeout(this.#pinErrorTimer)
    this.#session?.close()
  }

  open () {
    if (this.hasAttribute('open')) return
    this.#startSession()
    this.setAttribute('open', '')
    this.list?.enterExportMode()
    this.#setToolbarDisabled(true)
  }

  async close () {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.list?.exitExportMode()
    this.#setToolbarDisabled(false)
    this.#pinInput.value = ''
    this.#pinInput.classList.remove('is-error')
    this.#setStatus('', null)
    if (this.#session) {
      const s = this.#session
      this.#session = null
      // Active cancel: lets the target see an explicit empty-array+error
      // reply so it stops waiting on the relay for a code that will never
      // come.
      try { await s.cancel() } catch { /* noop */ }
    }
  }

  #setToolbarDisabled (disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled
    }
  }

  #startSession () {
    this.#session = new ExportSession({
      onTargetConnected: () => this.#setStatus('Other device connected — waiting for it to request accounts.', null),
      onPairingCode: () => {
        // Don't reveal the code on the source — the user is supposed to read
        // it off the other device and type it here. We just enable input.
        this.#setStatus('Type the code displayed on the other device.', null)
        this.#pinInput.focus()
      },
      onError: (err) => {
        console.error('export session error', err?.message ?? err)
        this.#setStatus('Pairing channel error — try again.', 'error')
      }
    })
    this.#session.start()
    const url = this.#session.url
    this.#urlInput.value = url
    try {
      this.#qrImage.src = generateQrDataUrl(url, { cellSize: 6, margin: 4 })
    } catch (err) {
      console.error('qr generation failed', err?.message ?? err)
    }
    this.#setStatus('Waiting for the other device to scan or paste this URL.', null)
  }

  #onPinInput = async () => {
    if (this.#busy) return
    // Sanitize: only digits, max 6.
    const cleaned = this.#pinInput.value.replace(/\D/g, '').slice(0, 6)
    if (cleaned !== this.#pinInput.value) this.#pinInput.value = cleaned
    if (cleaned.length < 6) return
    if (!this.#session) return

    this.#busy = true
    this.#pinInput.disabled = true
    try {
      const accounts = store.list().filter(a => this.list?.getSelectedPubkeys().includes(a.pubkey))
      if (!accounts.length) {
        this.#flashPinError('Select at least one account before confirming.')
        return
      }
      const payload = buildExportPayload(accounts, {
        nsecFromHex: nostr.nsecFromHex,
        npubFromPubkey: nostr.npubFromPubkey
      })
      const ok = await this.#session.confirmImport(cleaned, payload)
      if (!ok) {
        this.#flashPinError('Code mismatch — check the digits on the other device.')
        return
      }
      this.#setStatus('Accounts sent. The other device should now show them.', 'success')
      // Brief pause so the user sees the success state before the panel
      // collapses and the export-mode UI tears down.
      setTimeout(() => this.close(), 1200)
    } finally {
      this.#busy = false
      this.#pinInput.disabled = false
    }
  }

  #flashPinError (msg) {
    this.#pinInput.classList.add('is-error')
    this.#setStatus(msg, 'error')
    if (this.#pinErrorTimer) clearTimeout(this.#pinErrorTimer)
    this.#pinErrorTimer = setTimeout(() => {
      this.#pinInput.classList.remove('is-error')
      this.#pinInput.value = ''
      this.#pinInput.focus()
      this.#setStatus('Type the code displayed on the other device.', null)
    }, FLASH_MS)
  }

  #onCopyUrl = async () => {
    const value = this.#urlInput.value
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      this.#copyBtn.classList.add('is-success')
      if (this.#copyTimer) clearTimeout(this.#copyTimer)
      this.#copyTimer = setTimeout(() => this.#copyBtn.classList.remove('is-success'), FLASH_MS)
    } catch (err) {
      console.error('copy failed', err?.message ?? err)
    }
  }

  #setStatus (msg, kind) {
    this.#status.textContent = msg
    this.#status.classList.toggle('is-error', kind === 'error')
    this.#status.classList.toggle('is-success', kind === 'success')
  }
}

customElements.define('account-export', AccountExport)
