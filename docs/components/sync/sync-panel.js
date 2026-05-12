import { injectComponentStyles } from '../../helpers/dom.js'
import './sync-host.js'
import './sync-joiner.js'

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_BULB = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" /><path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3" /><path d="M9.7 17l4.6 0" /></svg>'

const STYLES = /* css */`
  sync-panel {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  /* Picker (hint + two device buttons) is short. Once a device flow opens
     we let its internal max-height drive the height — the picker's max
     is roughly the bulb hint + button row + paddings. */
  sync-panel[open] {
    max-height: 200px;
  }
  /* When one of the inner flows is showing instead of the picker, drop the
     panel-level cap entirely so the inner flow's own transitions own the
     animation. */
  sync-panel[open][data-flow] {
    max-height: 800px;
  }
  sync-panel .panel-wrap {
    padding-top: 12px;
  }
  sync-panel .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  sync-panel .panel-title {
    font-size: 14rem;
    font-weight: 600;
    color: oklch(0.92 0 89.88);
  }
  sync-panel .panel-cancel {
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
  sync-panel .panel-cancel:active {
    background-color: oklch(0.38 0 89.88);
  }
  sync-panel .panel-cancel svg {
    width: 16px;
    height: 16px;
  }
  sync-panel .panel-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background-color: oklch(0.22 0 89.88);
    border-radius: 4px;
    border-left: 3px solid oklch(0.65 0.14 80);
    font-size: 13rem;
    color: oklch(0.78 0 89.88);
    line-height: 1.35;
  }
  sync-panel .panel-hint .hint-icon {
    flex-shrink: 0;
    color: oklch(0.78 0.14 80);
    position: relative;
    bottom: 2px;
  }
  sync-panel .panel-hint .hint-icon svg {
    width: 18px;
    height: 18px;
    display: block;
  }
  sync-panel .device-buttons {
    display: flex;
    gap: 10px;
  }
  sync-panel .device-btn {
    flex: 1 1 0;
    min-width: 0;
    background-color: oklch(0.3 0.12 274.76);
    color: oklch(0.92 0 89.88);
    border-radius: 8px;
    padding: 10px 8px;
    font-size: 14rem;
    text-align: center;
  }
  sync-panel .device-btn:active {
    background-color: oklch(0.38 0.1 274.76);
  }
  /* Mirror the toolbar "on" state for the two device buttons — whichever
     flow (host / joiner) is open marks its button is-active and disables
     the sibling, so the user can see which device flow is running. */
  sync-panel .device-btn.is-active {
    background-color: oklch(0.45 0.13 274.76);
    box-shadow: inset 0 2px 4px oklch(0 0 0 / 0.3);
  }
  sync-panel .device-btn:disabled {
    opacity: 0.45;
  }
  sync-panel .panel-picker {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  /* While one of the device flows is open, we could hide the picker so the inner
     panel takes the slot. Th */
  sync-panel[data-flow] .panel-picker {
    /* display: none; */
  }
  sync-panel:not([data-flow]) sync-host,
  sync-panel:not([data-flow]) sync-joiner {
    display: none;
  }
`

const TEMPLATE = /* html */`
  <div class="panel-wrap">
    <div class="panel-picker">
      <div class="panel-header">
        <button class="panel-cancel" type="button" title="Cancel">${ICON_X}</button>
        <span class="panel-title">Sync this device with another</span>
      </div>
      <div class="panel-hint">
        <span class="hint-icon">${ICON_BULB}</span>
        <span>Click each button on a different device or browser.</span>
      </div>
      <div class="device-buttons">
        <button class="device-btn" type="button" data-device="host">Device One</button>
        <button class="device-btn" type="button" data-device="joiner">Device Two</button>
      </div>
    </div>
    <sync-host></sync-host>
    <sync-joiner></sync-joiner>
  </div>
`

export class SyncPanel extends HTMLElement {
  #cancelBtn
  #hostBtn
  #joinerBtn
  #host
  #joiner

  // Wired by index.js. `toolbarButtons` are the *sibling* toolbar buttons
  // we grey out while sync is the active flow; `activeButton` is sync's
  // own toolbar button which we flip to .is-active so the user can tell
  // which feature owns the screen (no client-side router → no URL cue).
  // `list` is the account-list the inner flows drive into selection mode.
  list = null
  toolbarButtons = []
  activeButton = null

  connectedCallback () {
    injectComponentStyles('sync-panel', STYLES)
    this.innerHTML = TEMPLATE
    this.#cancelBtn = this.querySelector('.panel-cancel')
    this.#hostBtn = this.querySelector('button[data-device="host"]')
    this.#joinerBtn = this.querySelector('button[data-device="joiner"]')
    this.#host = this.querySelector('sync-host')
    this.#joiner = this.querySelector('sync-joiner')

    this.#cancelBtn.addEventListener('click', () => this.close())
    // When a device button is already active, route the click to the
    // inner flow's own cancel control — same shortcut pattern as the
    // top-level toolbar buttons. The inner X is the single source of
    // truth for "cancel this device flow".
    this.#hostBtn.addEventListener('click', () => {
      if (this.#hostBtn.classList.contains('is-active')) {
        this.#host.querySelector('.host-cancel')?.click()
      } else {
        this.#openFlow('host')
      }
    })
    this.#joinerBtn.addEventListener('click', () => {
      if (this.#joinerBtn.classList.contains('is-active')) {
        this.#joiner.querySelector('button[data-action="cancel"]')?.click()
      } else {
        this.#openFlow('joiner')
      }
    })
    // When an inner flow closes itself (cancel / success), drop back to
    // the picker so the user can pick the other device or close the panel.
    this.#host.onClosed = () => this.#onFlowClosed('host')
    this.#joiner.onClosed = () => this.#onFlowClosed('joiner')
  }

  open () {
    if (this.hasAttribute('open')) return
    this.setAttribute('open', '')
    this.#setToolbarDisabled(true)
    this.activeButton?.classList.add('is-active')
  }

  close () {
    if (!this.hasAttribute('open')) return
    // Close whichever inner flow is open first so its own teardown runs
    // (cancels session, exits list selection, etc).
    if (this.dataset.flow === 'host') this.#host.close()
    else if (this.dataset.flow === 'joiner') this.#joiner.close()
    this.removeAttribute('open')
    this.dataset.flow = ''
    this.#applyDeviceButtonState(null)
    this.#setToolbarDisabled(false)
    this.activeButton?.classList.remove('is-active')
  }

  #setToolbarDisabled (disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled
    }
  }

  #applyDeviceButtonState (active) {
    // `active` is 'host', 'joiner', or null (picker). Mirrors the toolbar
    // pattern one level down: the active device button is marked
    // is-active, the sibling is disabled.
    this.#hostBtn.classList.toggle('is-active', active === 'host')
    this.#joinerBtn.classList.toggle('is-active', active === 'joiner')
    this.#hostBtn.disabled = active === 'joiner'
    this.#joinerBtn.disabled = active === 'host'
  }

  #openFlow (which) {
    if (this.dataset.flow) return
    this.dataset.flow = which
    this.#applyDeviceButtonState(which)
    if (which === 'host') {
      this.#host.list = this.list
      this.#host.toolbarButtons = []
      this.#host.open()
    } else {
      this.#joiner.list = this.list
      this.#joiner.toolbarButtons = []
      this.#joiner.open()
    }
  }

  #onFlowClosed (which) {
    // Only revert to the picker if the flow that just closed is the one
    // we have recorded — avoids racing with an explicit close() that
    // already cleared `dataset.flow`.
    if (this.dataset.flow === which) {
      this.dataset.flow = ''
      this.#applyDeviceButtonState(null)
    }
  }
}

customElements.define('sync-panel', SyncPanel)
