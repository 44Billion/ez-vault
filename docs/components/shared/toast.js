import { injectComponentStyles } from '../../helpers/dom.js'

const SHORT_TIMER_MS = 4000
const LONG_TIMER_MS = 8000
const OPEN_ANIM_MS = 200
const SWAP_FADE_MS = 120
const TYPES = new Set(['success', 'error', 'warning', 'info'])

// Tabler outline icons inlined so stroke="currentColor" inherits the host
// text color — `<img src>` would isolate them from CSS and break theming.
const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6" /></svg>'
const ICON_SUCCESS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M9 12l2 2l4 -4" /></svg>'
const ICON_ERROR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>'
const ICON_WARNING = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'
const ICON_INFO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" /><path d="M12 9h.01" /><path d="M11 12h1v4h1" /></svg>'

const TYPE_ICON = {
  success: ICON_SUCCESS,
  error: ICON_ERROR,
  warning: ICON_WARNING,
  info: ICON_INFO
}

const STYLES = /* css */`
  toast-message {
    position: fixed;
    top: 12px;
    left: 12px;
    right: 12px;
    z-index: 9999;
    box-sizing: border-box;
    background-color: oklch(0.22 0 89.88);
    color: oklch(0.92 0 89.88);
    border: 1px solid oklch(0.3 0 89.88);
    border-radius: 4px;
    padding: 10px 12px;
    box-shadow: 0 6px 18px oklch(0 0 0 / 0.45);
    opacity: 0.7;
    transform: translateY(6px);
    transition: opacity ${OPEN_ANIM_MS}ms ease-out, transform ${OPEN_ANIM_MS}ms ease-out;
  }
  toast-message.is-open {
    opacity: 1;
    transform: translateY(0);
  }
  toast-message.is-closing {
    opacity: 0;
    transform: translateY(6px);
  }
  toast-message[data-type="success"] { border-left: 4px solid oklch(0.55 0.18 145); }
  toast-message[data-type="error"]   { border-left: 4px solid oklch(0.55 0.2 25); }
  toast-message[data-type="warning"] { border-left: 4px solid oklch(0.72 0.16 80); }
  toast-message[data-type="info"]    { border-left: 4px solid oklch(0.6 0.15 240); }

  toast-message .toast-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  toast-message .toast-icon {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
  }
  toast-message .toast-icon svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  toast-message[data-type="success"] .toast-icon { color: oklch(0.72 0.18 145); }
  toast-message[data-type="error"]   .toast-icon { color: oklch(0.7 0.2 25); }
  toast-message[data-type="warning"] .toast-icon { color: oklch(0.82 0.16 80); }
  toast-message[data-type="info"]    .toast-icon { color: oklch(0.75 0.15 240); }

  toast-message .toast-body {
    flex: 1 1 auto;
    min-width: 0;
    align-self: center;
  }
  toast-message .toast-message {
    font-size: 14rem;
    line-height: 1.35;
    word-break: break-word;
  }

  /* Reset so a button works as a clickable inline row. */
  toast-message .toast-long {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0;
    width: 100%;
    text-align: left;
    cursor: pointer;
    margin-top: 6px;
    display: none;
    align-items: center;
    gap: 6px;
    font-size: 12rem;
    color: oklch(0.7 0 89.88);
    font-family: inherit;
  }
  toast-message[data-has-long] .toast-long {
    display: flex;
  }
  toast-message .toast-long:active {
    color: oklch(0.92 0 89.88);
  }
  toast-message .toast-long-preview {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  toast-message .toast-long-toggle {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
    transition: transform 180ms ease-out;
  }
  toast-message .toast-long-toggle svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  toast-message[data-expanded] .toast-long-toggle {
    transform: rotate(180deg);
  }
  toast-message .toast-long-text {
    margin-top: 6px;
    padding: 8px 10px;
    background-color: oklch(0.18 0 89.88);
    border-radius: 6px;
    font-size: 12rem;
    line-height: 1.4;
    color: oklch(0.85 0 89.88);
    word-break: break-word;
    white-space: pre-wrap;
    max-height: 240px;
    overflow: auto;
    display: none;
  }
  toast-message[data-has-long][data-expanded] .toast-long-text {
    display: block;
  }

  toast-message .toast-btn {
    flex-shrink: 0;
    background: transparent;
    border: 0;
    padding: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.7 0 89.88);
    cursor: pointer;
  }
  toast-message .toast-btn:active {
    background-color: oklch(0.3 0 89.88);
    color: oklch(0.92 0 89.88);
  }
  toast-message .toast-btn:disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  toast-message .toast-btn svg {
    width: 16px;
    height: 16px;
    display: block;
  }

  toast-message .toast-nav {
    margin-top: 8px;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: oklch(0.7 0 89.88);
    font-size: 12rem;
  }
  toast-message[data-multi] .toast-nav {
    display: flex;
  }
  toast-message .toast-nav-prev svg { transform: rotate(90deg); }
  toast-message .toast-nav-next svg { transform: rotate(-90deg); }
  toast-message .toast-counter {
    min-width: 36px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* Content swap fade — close button is excluded so it's always tappable. */
  toast-message .toast-fader {
    transition: opacity ${SWAP_FADE_MS}ms ease-out;
  }
  toast-message.is-swapping .toast-fader {
    opacity: 0.35;
  }
`

const TEMPLATE = /* html */`
  <div class="toast-row">
    <span class="toast-icon toast-fader" aria-hidden="true"></span>
    <div class="toast-body toast-fader">
      <div class="toast-message"></div>
      <button type="button" class="toast-long" data-action="toggle-long" aria-label="Toggle details">
        <span class="toast-long-preview"></span>
        <span class="toast-long-toggle" aria-hidden="true">${ICON_CHEVRON}</span>
      </button>
      <div class="toast-long-text"></div>
    </div>
    <button type="button" class="toast-btn toast-close" data-action="close" aria-label="Close">${ICON_X}</button>
  </div>
  <div class="toast-nav toast-fader">
    <button type="button" class="toast-btn toast-nav-prev" data-action="prev" aria-label="Previous">${ICON_CHEVRON}</button>
    <span class="toast-counter"></span>
    <button type="button" class="toast-btn toast-nav-next" data-action="next" aria-label="Next">${ICON_CHEVRON}</button>
  </div>
`

export class Toast extends HTMLElement {
  #queue = []
  #index = 0
  #timerId = null
  #timerDuration = SHORT_TIMER_MS
  #remainingMs = 0
  #timerStartedAt = 0
  #pressed = false
  #closing = false
  #closeAnimId = null
  #swapId = null

  connectedCallback () {
    injectComponentStyles('toast-message', STYLES)
    this.innerHTML = TEMPLATE

    this.addEventListener('click', this.#onClick)
    this.addEventListener('pointerdown', this.#onPointerDown)
    this.addEventListener('pointerup', this.#onPointerUp)
    this.addEventListener('pointercancel', this.#onPointerUp)
    this.addEventListener('pointerleave', this.#onPointerUp)

    // Double-rAF so the initial styles paint before the open transition runs.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.isConnected && !this.#closing) this.classList.add('is-open')
      })
    })
  }

  disconnectedCallback () {
    this.#clearTimer()
    if (this.#closeAnimId) { clearTimeout(this.#closeAnimId); this.#closeAnimId = null }
    if (this.#swapId) { clearTimeout(this.#swapId); this.#swapId = null }
  }

  get isClosing () { return this.#closing }

  pushMessage (entry) {
    if (this.#closing) return
    const normalized = {
      type: TYPES.has(entry?.type) ? entry.type : 'info',
      message: entry?.message ?? '',
      longMessage: entry?.longMessage ?? ''
    }
    // Drop any earlier entry with identical content — same content shows
    // as new and the old copy is discarded so the queue stays unique.
    this.#queue = this.#queue.filter(m =>
      m.type !== normalized.type ||
      m.message !== normalized.message ||
      m.longMessage !== normalized.longMessage
    )
    const wasEmpty = this.#queue.length === 0
    this.#queue.push(normalized)
    this.#index = this.#queue.length - 1
    if (wasEmpty) this.#renderContent()
    else this.#swapContent()
    if (!this.#pressed) this.#startTimer(this.#timerDuration)
  }

  closeToast () {
    if (this.#closing) return
    this.#closing = true
    this.#clearTimer()
    this.classList.remove('is-open')
    this.classList.add('is-closing')
    this.#closeAnimId = setTimeout(() => this.remove(), OPEN_ANIM_MS + 50)
  }

  #renderContent () {
    const msg = this.#queue[this.#index]
    if (!msg) return
    this.setAttribute('data-type', msg.type)
    this.querySelector('.toast-icon').innerHTML = TYPE_ICON[msg.type]
    this.querySelector('.toast-message').textContent = msg.message
    const hasLong = !!msg.longMessage
    this.toggleAttribute('data-has-long', hasLong)
    if (!hasLong) this.removeAttribute('data-expanded')
    this.querySelector('.toast-long-preview').textContent = msg.longMessage
    this.querySelector('.toast-long-text').textContent = msg.longMessage
    this.toggleAttribute('data-multi', this.#queue.length > 1)
    this.querySelector('.toast-counter').textContent = `${this.#index + 1} / ${this.#queue.length}`
    this.querySelector('.toast-nav-prev').disabled = this.#index === 0
    this.querySelector('.toast-nav-next').disabled = this.#index === this.#queue.length - 1
  }

  #swapContent () {
    if (this.#swapId) clearTimeout(this.#swapId)
    this.classList.add('is-swapping')
    this.#swapId = setTimeout(() => {
      this.#renderContent()
      this.#swapId = setTimeout(() => {
        this.classList.remove('is-swapping')
        this.#swapId = null
      }, 20)
    }, SWAP_FADE_MS)
  }

  #onClick = (e) => {
    const target = e.target.closest('[data-action]')
    if (!target || target.disabled) return
    switch (target.dataset.action) {
      case 'close':
        return this.closeToast()
      case 'toggle-long':
        this.toggleAttribute('data-expanded')
        return
      case 'prev':
        if (this.#index > 0) {
          this.#index -= 1
          this.#swapContent()
        }
        return
      case 'next':
        if (this.#index < this.#queue.length - 1) {
          this.#index += 1
          this.#swapContent()
        }
    }
  }

  #onPointerDown = (e) => {
    // Close button is exempt — pressing it should close, not extend the timer.
    if (e.target.closest('[data-action="close"]')) return
    if (this.#pressed || this.#closing) return
    this.#pressed = true
    this.#pauseTimer()
  }

  #onPointerUp = () => {
    if (!this.#pressed) return
    this.#pressed = false
    if (this.#closing) return
    // Once extended to LONG, stay at LONG for the rest of this toast's life.
    this.#timerDuration = LONG_TIMER_MS
    this.#startTimer(LONG_TIMER_MS)
  }

  #startTimer (ms) {
    this.#clearTimer()
    if (!ms || this.#closing) return
    this.#remainingMs = ms
    this.#timerStartedAt = Date.now()
    this.#timerId = setTimeout(() => this.closeToast(), ms)
  }

  #pauseTimer () {
    if (!this.#timerId) return
    clearTimeout(this.#timerId)
    this.#timerId = null
    this.#remainingMs = Math.max(0, this.#remainingMs - (Date.now() - this.#timerStartedAt))
  }

  #clearTimer () {
    if (this.#timerId) {
      clearTimeout(this.#timerId)
      this.#timerId = null
    }
  }
}

customElements.define('toast-message', Toast)

let instance = null

export function show (entry) {
  if (instance?.isConnected && !instance.isClosing) {
    instance.pushMessage(entry)
    return
  }
  // Lingering closing instance gets cut short so the new one starts fresh
  // with the SHORT timer (the "fully closed and reopened" rule).
  if (instance?.isConnected) instance.remove()
  instance = document.createElement('toast-message')
  document.body.appendChild(instance)
  instance.pushMessage(entry)
}

export function close () {
  instance?.closeToast()
}

export const success = (message, longMessage) => show({ type: 'success', message, longMessage })
export const error = (message, longMessage) => show({ type: 'error', message, longMessage })
export const warning = (message, longMessage) => show({ type: 'warning', message, longMessage })
export const info = (message, longMessage) => show({ type: 'info', message, longMessage })

if (typeof window !== 'undefined') {
  window.toast = { show, close, success, error, warning, info }
}
