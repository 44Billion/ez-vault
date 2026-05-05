import * as store from '../services/accounts-store.js'
import * as nostr from '../services/nostr.js'
import { ExportSession, buildExportPayload } from '../services/nostrpair.js'
import { generateQrDataUrl } from '../helpers/qrcode.js'
import { injectComponentStyles } from '../helpers/dom.js'

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'

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
    flex-shrink: 0;
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
    font-size: 14rem;
    font-weight: 600;
    align-self: center;
    color: oklch(0.7 0 89.88);
  }
  /* OTP-style: six separate cells, equally spaced. flex: 1 1 0 + min-width: 0
     lets them shrink as the panel narrows so they never overflow. */
  account-export .export-pin {
    display: flex;
    justify-content: center;
    gap: 8px;
  }
  account-export .pin-cell {
    flex: 1 1 0;
    min-width: 0;
    max-width: 32px;
    width: auto;
    height: 52px;
    padding: 0;
    text-align: center;
    font-size: 22rem;
    font-variant-numeric: tabular-nums;
    background-color: oklch(0.28 0 89.88);
    border: 1px solid transparent;
    border-radius: 6px;
    outline: none;
    /* Hide the iOS/Chrome auto-fill yellow + spinners since this is one
       digit per cell, not a number. */
    -moz-appearance: textfield;
  }
  account-export .pin-cell::-webkit-outer-spin-button,
  account-export .pin-cell::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  account-export .pin-cell:focus {
    border-color: oklch(0.55 0.18 145);
    background-color: oklch(0.32 0 89.88);
  }
  account-export .pin-cell:disabled {
    opacity: 0.6;
  }
  account-export .export-pin.is-error .pin-cell {
    background-color: oklch(0.32 0.12 25);
  }
  account-export .export-status {
    font-size: 12rem;
    align-self: center;
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
      <span class="export-title">Scan the QR code or paste the URL into another device</span>
    </div>
    <div class="export-qr-wrap"><img class="export-qr" alt="" /></div>
    <div class="export-url-row">
      <input class="export-url" readonly />
      <button class="export-copy" type="button" title="Copy URL">${ICON_COPY}</button>
    </div>
    <label class="export-pin-label">Then type the 6-digit code shown on the other device:</label>
    <div class="export-pin">
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 1" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 2" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 3" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 4" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 5" />
      <input class="pin-cell" type="text" inputmode="numeric" maxlength="1" pattern="\\d" autocomplete="off" aria-label="Digit 6" />
    </div>
    <div class="export-status"></div>
  </div>
`

export class AccountExport extends HTMLElement {
  #qrImage
  #urlInput
  #copyBtn
  #cancelBtn
  #pinWrap
  #pinCells = []
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
    this.#pinWrap = this.querySelector('.export-pin')
    this.#pinCells = Array.from(this.querySelectorAll('.pin-cell'))
    this.#status = this.querySelector('.export-status')

    this.#cancelBtn.addEventListener('click', () => this.close())
    this.#copyBtn.addEventListener('click', this.#onCopyUrl)
    this.#urlInput.addEventListener('focus', () => this.#urlInput.select())
    for (const cell of this.#pinCells) {
      cell.addEventListener('input', this.#onPinInput)
      cell.addEventListener('keydown', this.#onPinKeydown)
      cell.addEventListener('paste', this.#onPinPaste)
      // Select-on-focus so retyping a wrong digit replaces it instead of
      // refusing the keystroke (the cell already has a char, maxlength=1).
      cell.addEventListener('focus', () => cell.select())
    }
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
    this.#clearPin()
    this.#pinWrap.classList.remove('is-error')
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
        this.#setStatus('Status: Type the code displayed on the other device.', null)
        this.#pinCells[0]?.focus()
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
    this.#setStatus('Status: Waiting for the other device to scan or paste the above URL.', null)
  }

  #getPinValue () {
    return this.#pinCells.map(c => c.value).join('')
  }

  #clearPin () {
    for (const cell of this.#pinCells) cell.value = ''
  }

  #setPinDisabled (disabled) {
    for (const cell of this.#pinCells) cell.disabled = disabled
  }

  #onPinInput = async (e) => {
    if (this.#busy) return
    const cell = e.target
    // Strip non-digits and keep only the last keystroke. Mobile IMEs and
    // browser autofill can deliver multi-char strings even with maxlength=1.
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
      // Empty cell + backspace → step back into the previous cell and clear
      // it, the standard OTP-input behaviour.
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
    // Park focus on the next-empty cell, or the last one if all filled, so
    // the user can keep typing or correct the final digit.
    const focusIdx = Math.min(text.length, this.#pinCells.length - 1)
    this.#pinCells[focusIdx].focus()
    await this.#tryPinSubmit()
  }

  #tryPinSubmit = async () => {
    if (this.#busy || !this.#session) return
    const code = this.#getPinValue()
    if (code.length < 6) return

    this.#busy = true
    this.#setPinDisabled(true)
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
      const ok = await this.#session.confirmImport(code, payload)
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
      this.#setPinDisabled(false)
    }
  }

  #flashPinError (msg) {
    this.#pinWrap.classList.add('is-error')
    this.#setStatus(msg, 'error')
    if (this.#pinErrorTimer) clearTimeout(this.#pinErrorTimer)
    this.#pinErrorTimer = setTimeout(() => {
      this.#pinWrap.classList.remove('is-error')
      this.#clearPin()
      this.#pinCells[0]?.focus()
      this.#setStatus('Status: Type the code displayed on the other device.', null)
    }, FLASH_MS)
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

  #setStatus (msg, kind) {
    this.#status.textContent = msg
    this.#status.classList.toggle('is-error', kind === 'error')
    this.#status.classList.toggle('is-success', kind === 'success')
  }
}

customElements.define('account-export', AccountExport)
