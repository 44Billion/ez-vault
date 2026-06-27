import * as store from '../../services/accounts-store.js'
import * as nostr from '../../helpers/nostr/index.js'
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

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'
const ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'
const ICON_CAMERA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1a2 2 0 0 0 2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>'

const ERROR_FLASH_MS = 1500

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
    background-color: oklch(0.28 0 89.88);
  }
  sync-joiner[data-camera="true"] .joiner-input {
    padding-right: 78px;
  }
  sync-joiner .joiner-btn {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.92 0 89.88);
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
    background-color: oklch(0.38 0 89.88);
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
    background-color: oklch(0.38 0 89.88);
  }
  sync-joiner .joiner-btn[data-action="connect"] {
    top: 12px;
    right: 0;
    bottom: 0;
    width: 36px;
    border-radius: 0 7px 7px 0;
    background-color: oklch(0.55 0.18 145);
  }
  sync-joiner .joiner-btn[data-action="connect"]:active {
    background-color: oklch(0.48 0.16 145);
  }
  sync-joiner .joiner-btn[data-action="connect"].is-error {
    background-color: oklch(0.55 0.2 25);
    color: oklch(0.98 0 0);
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
    color: oklch(0.7 0 89.88);
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
    background-color: oklch(0.28 0 89.88);
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
    border-color: oklch(0.55 0.18 145);
    background-color: oklch(0.32 0 89.88);
  }
  sync-joiner .pin-cell:disabled {
    opacity: 0.6;
  }
  sync-joiner .pair-pin.is-error .pin-cell {
    background-color: oklch(0.32 0.12 25);
  }
  sync-joiner .pair-status {
    font-size: 12rem;
    align-self: center;
    color: oklch(0.7 0 89.88);
    min-height: 16px;
  }
  sync-joiner .pair-status.is-error { color: oklch(0.7 0.18 25); }
  sync-joiner .pair-status.is-success { color: oklch(0.7 0.16 145); }
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
    background-color: oklch(0.18 0 89.88);
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
    background-color: oklch(0 0 0 / 0.45);
    color: oklch(0.98 0 0);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(0 1px 2px oklch(0 0 0 / 0.7));
    z-index: 1;
  }
  sync-joiner .scan-stop:active {
    background-color: oklch(0 0 0 / 0.65);
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

    if (isCameraSupported()) this.dataset.camera = 'true'
  }

  disconnectedCallback () {
    if (this.#errorTimer) clearTimeout(this.#errorTimer)
    if (this.#pinErrorTimer) clearTimeout(this.#pinErrorTimer)
    this.#stopScan()
    this.#session?.close()
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
      toast.info('Paste a nostrpair:// URL or scan the QR shown by the other device.')
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
      toast.error(message, longMessage)
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
        ? `Importing ${reply.accounts.length} account${reply.accounts.length === 1 ? '' : 's'}…`
        : 'Storing trust…', null)
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
        peerSigner: { pubkey: peer.signerPubkey, platform: peer.platform || reply.platform }
      })

      const summary = reply.accounts.length === 0
        ? 'Devices synced'
        : `Synced: imported ${prepared.length} account${prepared.length === 1 ? '' : 's'}`
      if (errors.length) toast.warning(`${summary} (${errors.length} failed)`, errors.join('\n'))
      else toast.success(summary)

      this.#setStatus('Done.', 'success')
      setTimeout(() => this.close({ completed: true }), 1200)
    } catch (err) {
      if (err?.message !== 'IMPORT_CANCELLED') {
        console.error('joiner exchange failed', err?.message ?? err)
        const { message, longMessage } = pairErrorToToast(err)
        toast.error(message, longMessage)
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

  #setStatus (text, kind) {
    this.#statusEl.textContent = text
    this.#statusEl.classList.toggle('is-error', kind === 'error')
    this.#statusEl.classList.toggle('is-success', kind === 'success')
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
