import {
  createIntakeToken,
  abortIntake,
  prepareSeckey,
  prepareNpub,
  prepareBunker,
  commitPrepared
} from '../services/account-intake.js'
import { QrScanner, isCameraSupported } from '../services/qr-scanner.js'
import * as toast from './shared/toast.js'
import { injectComponentStyles } from '../helpers/dom.js'

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'
const ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'
const ICON_CAMERA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1a2 2 0 0 0 2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>'

const ERROR_FLASH_MS = 1500

const STYLES = /* css */`
  account-add {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  account-add[open] {
    max-height: 60px;
  }
  /* Scan flow swaps the input row out for a camera preview + Stop button.
     Drop the height cap entirely so the video gets its natural box. */
  account-add[open][data-scanning="true"] {
    max-height: 420px;
  }
  account-add .add-form {
    position: relative;
    padding-top: 12px;
  }
  account-add .add-input {
    padding-left: 36px;
    padding-right: 42px;
    background-color: oklch(0.28 0 89.88);
  }
  account-add[data-camera="true"] .add-input {
    padding-right: 78px;
  }
  account-add .add-btn {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.92 0 89.88);
  }
  account-add .add-btn:disabled {
    opacity: 0.6;
  }
  account-add .add-btn[data-action="cancel"] {
    top: calc(50% + 6px);
    transform: translateY(-50%);
    left: 5px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: transparent;
  }
  account-add .add-btn[data-action="cancel"]:active {
    background-color: oklch(0.38 0 89.88);
  }
  account-add .add-btn[data-action="scan"] {
    top: calc(50% + 6px);
    transform: translateY(-50%);
    right: 42px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: transparent;
    display: none;
  }
  account-add[data-camera="true"] .add-btn[data-action="scan"] {
    display: inline-flex;
  }
  account-add .add-btn[data-action="scan"]:active {
    background-color: oklch(0.38 0 89.88);
  }
  account-add .add-btn[data-action="confirm"] {
    top: 12px;
    right: 0;
    bottom: 0;
    width: 36px;
    border-radius: 0 7px 7px 0;
    background-color: oklch(0.55 0.18 145);
  }
  account-add .add-btn[data-action="confirm"]:active {
    background-color: oklch(0.48 0.16 145);
  }
  account-add .add-btn[data-action="confirm"].is-error {
    background-color: oklch(0.55 0.2 25);
    color: oklch(0.98 0 0);
  }
  account-add .add-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  account-add .add-btn-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  account-add .add-btn[data-action="scan"] svg {
    width: 16px;
    height: 16px;
  }
  account-add .scan-overlay {
    display: none;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
  }
  account-add[data-scanning="true"] .scan-overlay {
    display: flex;
  }
  account-add[data-scanning="true"] .add-form {
    display: none;
  }
  account-add .scan-video-wrap {
    position: relative;
  }
  account-add .scan-video {
    width: 100%;
    max-height: 320px;
    border-radius: 8px;
    background-color: oklch(0.18 0 89.88);
    object-fit: cover;
    display: block;
  }
  account-add .scan-stop {
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
  account-add .scan-stop:active {
    background-color: oklch(0 0 0 / 0.65);
  }
  account-add .scan-stop svg {
    width: 18px;
    height: 18px;
  }
`

const TEMPLATE = /* html */`
  <form class="add-form" autocomplete="off">
    <button class="add-btn" data-action="cancel" type="button" title="Cancel">
      <span class="add-btn-icon">${ICON_X}</span>
    </button>
    <input class="add-input" type="text" placeholder="nsec1.../hex, npub1..., or bunker://" spellcheck="false" autocorrect="off" autocapitalize="off" />
    <button class="add-btn" data-action="scan" type="button" title="Scan QR">${ICON_CAMERA}</button>
    <button class="add-btn" data-action="confirm" type="submit" title="Add">
      <span class="add-btn-icon">${ICON_CHECK}</span>
    </button>
  </form>
  <div class="scan-overlay">
    <div class="scan-video-wrap">
      <button class="scan-stop" type="button" title="Stop scanning">${ICON_X}</button>
    </div>
  </div>
`

export class AccountAdd extends HTMLElement {
  #form
  #input
  #cancelBtn
  #scanBtn
  #confirmBtn
  #confirmIcon
  #scanWrap
  #scanStopBtn
  #errorTimer = null
  #busy = false
  #scanner = null
  #activeIntake = null

  // Wired by index.js. `toolbarButtons` are the sibling toolbar buttons
  // we grey out while the add panel owns the screen; `activeButton` is
  // our own toolbar button, flipped to .is-active for the duration so
  // the user can tell which feature is open.
  toolbarButtons = []
  activeButton = null

  connectedCallback () {
    injectComponentStyles('account-add', STYLES)
    this.innerHTML = TEMPLATE
    this.#form = this.querySelector('.add-form')
    this.#input = this.querySelector('.add-input')
    this.#cancelBtn = this.querySelector('button[data-action="cancel"]')
    this.#scanBtn = this.querySelector('button[data-action="scan"]')
    this.#confirmBtn = this.querySelector('button[data-action="confirm"]')
    this.#confirmIcon = this.#confirmBtn.querySelector('.add-btn-icon')
    this.#scanWrap = this.querySelector('.scan-video-wrap')
    this.#scanStopBtn = this.querySelector('.scan-stop')

    this.#form.addEventListener('submit', this.#onSubmit)
    this.#cancelBtn.addEventListener('click', this.#onCancel)
    this.#scanBtn.addEventListener('click', this.#onStartScan)
    this.#scanStopBtn.addEventListener('click', () => this.#stopScan())

    if (isCameraSupported()) this.dataset.camera = 'true'
  }

  disconnectedCallback () {
    if (this.#errorTimer) clearTimeout(this.#errorTimer)
    this.#stopScan()
  }

  open () {
    if (this.hasAttribute('open')) return
    this.setAttribute('open', '')
    this.#setToolbarDisabled(true)
    this.activeButton?.classList.add('is-active')
    requestAnimationFrame(() => this.#input?.focus())
  }

  close () {
    this.removeAttribute('open')
    this.#input.value = ''
    this.#clearErrorFlash()
    this.#stopScan()
    this.#setToolbarDisabled(false)
    this.activeButton?.classList.remove('is-active')
  }

  #setToolbarDisabled (disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled
    }
  }

  #onCancel = () => {
    if (this.#busy) abortIntake(this.#activeIntake)
    this.close()
  }

  #onSubmit = async (e) => {
    e.preventDefault()
    if (this.#busy) return
    const raw = this.#input.value.trim()
    if (!raw) return
    await this.#runAdd(raw)
  }

  async #runAdd (raw) {
    // nostrpair URLs go through the Sync Devices flow now. We could detect
    // and redirect here, but auto-jumping panels would surprise the user
    // mid-flow — a toast tells them what to do instead.
    if (raw.startsWith('nostrpair://')) {
      toast.info('Use "Sync Devices" for nostrpair URLs.')
      this.#flashError()
      return
    }
    this.#setBusy(true)
    const token = createIntakeToken()
    this.#activeIntake = token

    const dispatchPromise = this.#dispatch(raw, token).catch(err => {
      if (token.cancelled) return
      throw err
    })

    try {
      await Promise.race([dispatchPromise, token.cancelPromise])
      if (token.cancelled) return
      this.close()
    } catch (err) {
      if (token.cancelled || err?.message === 'IMPORT_CANCELLED') return
      console.error('add failed', err?.message ?? err)
      this.#flashError()
    } finally {
      if (this.#activeIntake === token) this.#activeIntake = null
      this.#setBusy(false)
    }
  }

  async #dispatch (raw, token) {
    let prepared
    if (raw.startsWith('bunker://')) prepared = await prepareBunker(raw, token)
    else if (raw.startsWith('npub1')) prepared = await prepareNpub(raw)
    else prepared = await prepareSeckey(raw)
    if (prepared.skipped) throw new Error(prepared.reason)
    await commitPrepared([prepared])
  }

  #setBusy (on) {
    this.#busy = on
    this.#input.disabled = on
    // Cancel button stays enabled on purpose — clicking it during a pending
    // add aborts the in-flight bunker handshake/network work and closes
    // the panel via abortIntake.
    this.#scanBtn.disabled = on
    this.#confirmBtn.disabled = on
    this.#confirmIcon.classList.toggle('pulsate', on)
  }

  #flashError () {
    this.#clearErrorFlash()
    this.#confirmBtn.disabled = true
    this.#confirmBtn.classList.add('is-error')
    this.#confirmIcon.innerHTML = ICON_ALERT
    this.#errorTimer = setTimeout(() => this.#clearErrorFlash(), ERROR_FLASH_MS)
  }

  #clearErrorFlash () {
    if (this.#errorTimer) {
      clearTimeout(this.#errorTimer)
      this.#errorTimer = null
    }
    this.#confirmBtn.classList.remove('is-error')
    this.#confirmIcon.innerHTML = ICON_CHECK
    if (!this.#busy) this.#confirmBtn.disabled = false
  }

  #onStartScan = async () => {
    if (this.#scanner || this.#busy) return
    this.#scanBtn.disabled = true
    this.#scanBtn.classList.add('pulsate')
    const scanner = new QrScanner({
      onResult: (value) => {
        this.#stopScan()
        this.#input.value = value
        // Auto-submit so the user doesn't have to tap again — they already
        // committed to "scan and add" by opening the camera.
        this.#runAdd(value.trim())
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

customElements.define('account-add', AccountAdd)
