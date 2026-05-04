import * as store from '../services/accounts-store.js'
import * as nostr from '../services/nostr.js'
import {
  fetchLatestProfile,
  fetchRelayListEvent,
  parseRelayListEvent,
  freeRelays
} from '../services/relays.js'
import { fetchBunkerUserPubkey, releaseBunker } from '../services/bunker.js'
import { releaseSigner } from '../services/signer.js'
import { seededAvatarDataUrl } from '../services/avatar.js'
import { ImportSession, extractBunkerClientKey } from '../services/nostrpair.js'
import { QrScanner, isCameraSupported } from '../services/qr-scanner.js'
import { injectComponentStyles } from '../helpers/dom.js'

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'
const ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'
const ICON_CAMERA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1a2 2 0 0 0 2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>'

const ERROR_FLASH_MS = 1500

const STYLES = /* css */`
  account-import {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 280ms ease-out;
  }
  account-import[open] {
    max-height: 60px;
  }
  /* Pair flow opens an extra status panel below the input — let the host
     element grow tall enough to show the code + helper text. */
  account-import[open][data-pair="active"] {
    max-height: 240px;
  }
  /* Scan flow swaps the input row out for a camera preview + Stop button.
     Drop the height cap entirely so the video gets its natural box. */
  account-import[open][data-scanning="true"] {
    max-height: 420px;
  }
  account-import .import-form {
    position: relative;
    padding-top: 12px;
  }
  account-import .import-input {
    padding-left: 36px;
    padding-right: 42px;
    background-color: oklch(0.28 0 89.88);
  }
  account-import[data-camera="true"] .import-input {
    padding-right: 78px;
  }
  account-import .import-btn {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.92 0 89.88);
  }
  account-import .import-btn:disabled {
    opacity: 0.6;
  }
  account-import .import-btn[data-action="cancel"] {
    top: calc(50% + 6px);
    transform: translateY(-50%);
    left: 5px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: transparent;
  }
  account-import .import-btn[data-action="cancel"]:active {
    background-color: oklch(0.38 0 89.88);
  }
  account-import .import-btn[data-action="scan"] {
    top: calc(50% + 6px);
    transform: translateY(-50%);
    right: 42px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: transparent;
    display: none;
  }
  account-import[data-camera="true"] .import-btn[data-action="scan"] {
    display: inline-flex;
  }
  account-import .import-btn[data-action="scan"]:active {
    background-color: oklch(0.38 0 89.88);
  }
  account-import .import-btn[data-action="confirm"] {
    top: 12px;
    right: 0;
    bottom: 0;
    width: 36px;
    border-radius: 0 7px 7px 0;
    background-color: oklch(0.55 0.18 145);
  }
  account-import .import-btn[data-action="confirm"]:active {
    background-color: oklch(0.48 0.16 145);
  }
  account-import .import-btn[data-action="confirm"].is-error {
    background-color: oklch(0.55 0.2 25);
    color: oklch(0.98 0 0);
  }
  account-import .import-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  account-import .import-btn-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  account-import .import-btn[data-action="scan"] svg {
    width: 16px;
    height: 16px;
  }
  account-import .pair-panel {
    display: none;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
  }
  account-import[data-pair="active"] .pair-panel {
    display: flex;
  }
  account-import .pair-label {
    font-size: 12rem;
    color: oklch(0.7 0 89.88);
  }
  account-import .pair-code {
    text-align: center;
    letter-spacing: 0.4em;
    font-size: 28rem;
    font-variant-numeric: tabular-nums;
    background-color: oklch(0.28 0 89.88);
    color: oklch(0.92 0 89.88);
    padding: 8px;
    border-radius: 6px;
  }
  account-import .pair-status {
    font-size: 12rem;
    color: oklch(0.7 0 89.88);
    min-height: 16px;
  }
  account-import .pair-status.is-error { color: oklch(0.7 0.18 25); }
  account-import .pair-cancel {
    align-self: flex-start;
    padding: 4px 10px;
    background-color: oklch(0.28 0 89.88);
    color: oklch(0.92 0 89.88);
    border-radius: 4px;
    font-size: 11rem;
  }
  account-import .pair-cancel:active {
    background-color: oklch(0.38 0 89.88);
  }
  account-import .scan-overlay {
    display: none;
    flex-direction: column;
    gap: 8px;
    padding-top: 14px;
  }
  account-import[data-scanning="true"] .scan-overlay {
    display: flex;
  }
  account-import[data-scanning="true"] .import-form {
    display: none;
  }
  account-import .scan-video-wrap {
    position: relative;
  }
  account-import .scan-video {
    width: 100%;
    max-height: 320px;
    border-radius: 8px;
    background-color: oklch(0.18 0 89.88);
    object-fit: cover;
    display: block;
  }
  account-import .scan-stop {
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
    /* Drop-shadow on the actual ink (filter:, not box-shadow) so the X stays
       visible even when the frame behind it is the same colour as the pill. */
    filter: drop-shadow(0 1px 2px oklch(0 0 0 / 0.7));
    z-index: 1;
  }
  account-import .scan-stop:active {
    background-color: oklch(0 0 0 / 0.65);
  }
  account-import .scan-stop svg {
    width: 18px;
    height: 18px;
  }
`

const TEMPLATE = /* html */`
  <form class="import-form" autocomplete="off">
    <button class="import-btn" data-action="cancel" type="button" title="Cancel">
      <span class="import-btn-icon">${ICON_X}</span>
    </button>
    <input class="import-input" type="text" placeholder="nsec1.../hex, npub1..., bunker://, or nostrpair://" spellcheck="false" autocorrect="off" autocapitalize="off" />
    <button class="import-btn" data-action="scan" type="button" title="Scan QR">${ICON_CAMERA}</button>
    <button class="import-btn" data-action="confirm" type="submit" title="Import">
      <span class="import-btn-icon">${ICON_CHECK}</span>
    </button>
  </form>
  <div class="pair-panel">
    <span class="pair-label">Show this code on the other device:</span>
    <div class="pair-code">------</div>
    <span class="pair-status"></span>
    <button class="pair-cancel" type="button">Cancel pairing</button>
  </div>
  <div class="scan-overlay">
    <div class="scan-video-wrap">
      <button class="scan-stop" type="button" title="Stop scanning">${ICON_X}</button>
    </div>
  </div>
`

export class AccountImport extends HTMLElement {
  #form
  #input
  #cancelBtn
  #scanBtn
  #confirmBtn
  #confirmIcon
  #pairPanel
  #pairCodeEl
  #pairStatusEl
  #pairCancelBtn
  #scanWrap
  #scanStopBtn
  #errorTimer = null
  #busy = false
  #pairSession = null
  #scanner = null
  #activeImport = null

  connectedCallback () {
    injectComponentStyles('account-import', STYLES)
    this.innerHTML = TEMPLATE
    this.#form = this.querySelector('.import-form')
    this.#input = this.querySelector('.import-input')
    this.#cancelBtn = this.querySelector('button[data-action="cancel"]')
    this.#scanBtn = this.querySelector('button[data-action="scan"]')
    this.#confirmBtn = this.querySelector('button[data-action="confirm"]')
    this.#confirmIcon = this.#confirmBtn.querySelector('.import-btn-icon')
    this.#pairPanel = this.querySelector('.pair-panel')
    this.#pairCodeEl = this.querySelector('.pair-code')
    this.#pairStatusEl = this.querySelector('.pair-status')
    this.#pairCancelBtn = this.querySelector('.pair-cancel')
    this.#scanWrap = this.querySelector('.scan-video-wrap')
    this.#scanStopBtn = this.querySelector('.scan-stop')

    this.#form.addEventListener('submit', this.#onSubmit)
    this.#cancelBtn.addEventListener('click', this.#onCancel)
    this.#scanBtn.addEventListener('click', this.#onStartScan)
    this.#scanStopBtn.addEventListener('click', () => this.#stopScan())
    this.#pairCancelBtn.addEventListener('click', () => this.#cancelPair())

    if (isCameraSupported()) this.dataset.camera = 'true'
  }

  disconnectedCallback () {
    if (this.#errorTimer) clearTimeout(this.#errorTimer)
    this.#stopScan()
    this.#pairSession?.close()
  }

  open () {
    if (this.hasAttribute('open')) return
    this.setAttribute('open', '')
    requestAnimationFrame(() => this.#input?.focus())
  }

  close () {
    // No #busy guard: the X button intentionally aborts an in-flight import
    // via #onCancel before getting here. Other call sites should call
    // #abortActiveImport() first if they need the same behaviour.
    this.removeAttribute('open')
    this.#input.value = ''
    this.#clearErrorFlash()
    this.#stopScan()
  }

  #onCancel = () => {
    if (this.#busy) this.#abortActiveImport()
    this.close()
  }

  #abortActiveImport () {
    const token = this.#activeImport
    if (!token || token.cancelled) return
    token.cancelled = true
    for (const fn of token.cleanups) {
      try { fn() } catch (err) { console.warn('import cleanup failed', err?.message ?? err) }
    }
    token.cleanups.length = 0
    token.cancelReject?.(new Error('IMPORT_CANCELLED'))
  }

  #onSubmit = async (e) => {
    e.preventDefault()
    if (this.#busy) return
    const raw = this.#input.value.trim()
    if (!raw) return
    await this.#runImport(raw)
  }

  async #runImport (raw) {
    this.#setBusy(true)
    const token = createImportToken()
    this.#activeImport = token

    // Run dispatch separately so a post-cancel rejection (e.g. the bunker
    // handle finally errors out after we've already moved on) gets swallowed
    // here instead of surfacing as an unhandled promise rejection.
    const dispatchPromise = this.#dispatch(raw, token).catch(err => {
      if (token.cancelled) return
      throw err
    })

    try {
      // Race the dispatch against the cancel signal so the X button can
      // unblock the UI immediately, even when the bunker is still hanging on
      // the connect/getPublicKey RPC.
      await Promise.race([dispatchPromise, token.cancelPromise])
      if (token.cancelled) return
      this.removeAttribute('open')
      this.#input.value = ''
    } catch (err) {
      if (token.cancelled || err?.message === 'IMPORT_CANCELLED') return
      console.error('import failed', err?.message ?? err)
      this.#flashError()
    } finally {
      if (this.#activeImport === token) this.#activeImport = null
      this.#setBusy(false)
    }
  }

  // Single dispatch point so the nostrpair flow can fan out the same way the
  // user-typed input does (without re-entering the nostrpair branch).
  async #dispatch (raw, token) {
    if (raw.startsWith('nostrpair://')) return this.#importNostrpair(raw, token)
    if (raw.startsWith('bunker://')) return this.#importBunker(raw, token)
    if (raw.startsWith('npub1')) return this.#importNpub(raw)
    return this.#importSeckey(raw)
  }

  #setBusy (on) {
    this.#busy = on
    this.#input.disabled = on
    // Cancel button stays enabled on purpose — clicking it during a pending
    // import aborts the in-flight bunker handshake/network work and closes
    // the panel via #abortActiveImport.
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

  async #importSeckey (raw) {
    const { pubkey, seckey } = nostr.keypairFromSeckey(raw)
    // A bare secret key gives strictly more capability than a bunker URL or a
    // read-only npub, so importing a seckey for a pubkey currently held as
    // either is an in-place upgrade. An existing seckey entry is a duplicate.
    const existing = store.get(pubkey)
    if (existing && existing.type === 'nsec') throw new Error('ACCOUNT_EXISTS')
    const meta = await resolveMetadata(pubkey)
    const picture = meta.picture || existing?.picture || await seededAvatarDataUrl(pubkey)
    const record = {
      type: 'nsec',
      pubkey,
      seckey,
      picture,
      name: meta.name || existing?.name || '',
      profileEvent: meta.profileEvent || existing?.profileEvent,
      relayListEvent: meta.relayListEvent || existing?.relayListEvent,
      writeRelays: meta.writeRelays
    }
    if (existing) {
      // Upgrading from bunker/npub → nsec: any live signer backing the prior
      // entry is now obsolete, tear it down so it doesn't linger.
      releaseSigner(pubkey)
      store.replace(pubkey, record)
    } else {
      store.add(record)
    }
  }

  async #importNpub (npub) {
    const pubkey = nostr.pubkeyFromNpub(npub)
    // npub is the weakest form (read-only), so it can never overwrite an
    // existing entry — any nsec/bunker/npub at this pubkey wins.
    if (store.get(pubkey)) throw new Error('ACCOUNT_EXISTS')
    const meta = await resolveMetadata(pubkey)
    const picture = meta.picture || await seededAvatarDataUrl(pubkey)
    store.add({
      type: 'npub',
      pubkey,
      picture,
      name: meta.name || '',
      profileEvent: meta.profileEvent,
      relayListEvent: meta.relayListEvent,
      writeRelays: meta.writeRelays
    })
  }

  async #importBunker (bunkerUrlInput, token) {
    // Pairing-imported bunker URLs carry the persistent client key as a
    // local-only `#client_key=` fragment so the receiving device can adopt
    // the same client identity instead of generating a fresh one (a fresh
    // key would force a re-auth on the bunker, defeating the point).
    const { url: cleanedUrl, clientKey: suppliedClientKey } = extractBunkerClientKey(bunkerUrlInput)

    let bunkerHandle = null
    let committed = false
    // Closes the in-flight handle if cancel happens before store commit.
    // After commit the handle is the live connection for the new account
    // and must stay alive — `committed` short-circuits the cleanup then.
    const cleanup = () => {
      if (committed) return
      try { bunkerHandle?.close() } catch { /* noop */ }
    }
    token?.cleanups.push(cleanup)

    try {
      // fetchBunkerUserPubkey spins up a pooled BunkerHandle, generates the
      // persistent client key (or uses the supplied one), burns the URL's
      // one-use secret on connect, and returns the values we must persist.
      // The handle keeps the connection warm for the rehydrator/sign path
      // that follows.
      const { pubkey, clientKey, bunkerUrl } = await fetchBunkerUserPubkey(cleanedUrl, {
        clientKey: suppliedClientKey ?? undefined,
        onHandle: (h) => { bunkerHandle = h }
      })
      if (token?.cancelled) throw new Error('IMPORT_CANCELLED')

      const existing = store.get(pubkey)
      // A bunker import can replace another bunker entry (URL/secret
      // refresh) or upgrade a read-only npub; an existing nsec is strictly
      // more capable, so we reject that case.
      if (existing && existing.type !== 'bunker' && existing.type !== 'npub') {
        // The handle has already registered itself in the pool keyed by
        // this pubkey — clean it up since we're rejecting the import.
        releaseBunker(pubkey)
        throw new Error('ACCOUNT_EXISTS')
      }
      const meta = await resolveMetadata(pubkey)
      if (token?.cancelled) throw new Error('IMPORT_CANCELLED')
      const picture = meta.picture || existing?.picture || await seededAvatarDataUrl(pubkey)
      if (token?.cancelled) throw new Error('IMPORT_CANCELLED')
      const record = {
        type: 'bunker',
        pubkey,
        bunker: bunkerUrl,
        bunkerClientKey: clientKey,
        picture,
        name: meta.name || existing?.name || '',
        profileEvent: meta.profileEvent || existing?.profileEvent,
        relayListEvent: meta.relayListEvent || existing?.relayListEvent,
        writeRelays: meta.writeRelays
      }
      if (existing) store.replace(pubkey, record)
      else store.add(record)
      committed = true
    } finally {
      if (token) {
        const idx = token.cleanups.indexOf(cleanup)
        if (idx >= 0) token.cleanups.splice(idx, 1)
      }
    }
  }

  async #importNostrpair (url, token) {
    if (this.#pairSession) throw new Error('PAIR_IN_PROGRESS')
    this.dataset.pair = 'active'
    this.#pairCodeEl.textContent = '------'
    this.#setPairStatus('Connecting…', null)

    const session = new ImportSession(url, {
      onConnected: () => this.#setPairStatus('Connected. Computing pairing code…', null),
      onPairingCode: (code) => {
        this.#pairCodeEl.textContent = code
        this.#setPairStatus('Type this code on the other device.', null)
      },
      onError: (err) => {
        console.error('pair import error', err?.message ?? err)
        this.#setPairStatus('Pairing channel error.', 'error')
      }
    })
    this.#pairSession = session

    // Tie the pair session to the import token so the X button (or any
    // other abort) closes the channel and resets the pair UI in one go.
    const pairCleanup = () => this.#cancelPair()
    token?.cleanups.push(pairCleanup)

    try {
      let accounts
      try {
        accounts = await session.run()
      } finally {
        this.#pairSession = null
        session.close()
      }

      if (token?.cancelled) throw new Error('IMPORT_CANCELLED')

      if (!accounts.length) {
        this.dataset.pair = ''
        this.#setPairStatus('', null)
        throw new Error('IMPORT_REJECTED')
      }

      this.#setPairStatus(`Importing ${accounts.length} account${accounts.length === 1 ? '' : 's'}…`, null)

      const errors = []
      // Iterate the payload in reverse: store.add() unshifts each new record
      // to the head of the list, so the LAST imported entry ends up topmost.
      // Reversing the iteration order makes the source's [A, B, ...] order
      // preserved on the target ([A, B, ...existing]) instead of mirrored.
      for (let i = accounts.length - 1; i >= 0; i--) {
        if (token?.cancelled) break
        const item = accounts[i]
        if (typeof item !== 'string') continue
        try {
          if (item.startsWith('bunker://')) await this.#importBunker(item, token)
          else if (item.startsWith('npub1')) await this.#importNpub(item)
          else if (item.startsWith('nsec1')) await this.#importSeckey(item)
          else errors.push(`unknown entry: ${item.slice(0, 16)}…`)
        } catch (err) {
          if (err?.message === 'IMPORT_CANCELLED') throw err
          // Don't abort the whole batch on a single bad entry — the user
          // gets whatever else came through, and we log the rest.
          errors.push(err?.message ?? String(err))
        }
      }

      this.dataset.pair = ''
      this.#setPairStatus('', null)
      if (errors.length === accounts.length) throw new Error('IMPORT_FAILED')
    } finally {
      if (token) {
        const idx = token.cleanups.indexOf(pairCleanup)
        if (idx >= 0) token.cleanups.splice(idx, 1)
      }
    }
  }

  #cancelPair () {
    const s = this.#pairSession
    this.#pairSession = null
    if (s) s.close()
    this.dataset.pair = ''
    this.#setPairStatus('', null)
  }

  #setPairStatus (text, kind) {
    this.#pairStatusEl.textContent = text
    this.#pairStatusEl.classList.toggle('is-error', kind === 'error')
  }

  #onStartScan = async () => {
    if (this.#scanner || this.#busy) return
    // Pulsate + disable the camera button so the user has visible feedback
    // while we wait for the camera permission prompt and the first frame.
    // We delay flipping `data-scanning` until after start() resolves —
    // otherwise the panel grows to a blank rectangle and then jumps when
    // the stream actually lights up.
    this.#scanBtn.disabled = true
    this.#scanBtn.classList.add('pulsate')
    const scanner = new QrScanner({
      onResult: (value) => {
        this.#stopScan()
        this.#input.value = value
        // Auto-submit so the user doesn't have to tap again — they already
        // committed to "scan and import" by opening the camera.
        this.#runImport(value.trim())
      },
      onError: (err) => console.warn('qr scan error', err?.message ?? err)
    })
    // Mount the video into the (still-hidden) overlay so it can prebuffer
    // frames during init. `display: none` doesn't pause the stream.
    this.#scanWrap.appendChild(scanner.videoElement)
    scanner.videoElement.classList.add('scan-video')
    try {
      await scanner.start()
      this.#scanner = scanner
      // First frame is decoded — now reveal the overlay and grow the panel.
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

  // Targeted removal of the dynamically-mounted <video>: the X overlay is a
  // permanent child of .scan-video-wrap, so a blanket replaceChildren()
  // would wipe it.
  #removeScanVideo () {
    const video = this.#scanWrap.querySelector('video')
    if (video) video.remove()
  }
}

// Per-import abort token. Carries:
//   - cancelled: flag that import steps poll between awaits
//   - cleanups:  effect-rollback fns registered by individual import paths
//                (e.g. close the bunker handle if cancel hits before commit)
//   - cancelPromise/cancelReject: lets #runImport unblock immediately on
//                cancel via Promise.race instead of waiting for the
//                underlying RPC to time out
function createImportToken () {
  const token = {
    cancelled: false,
    cancelReject: null,
    cleanups: [],
    cancelPromise: null
  }
  token.cancelPromise = new Promise((_resolve, reject) => { token.cancelReject = reject })
  // If cancel never fires, cancelPromise stays pending forever and gets
  // GC'd with the token — no unhandled rejection. The handler here just
  // covers the post-race window where nothing else is awaiting it.
  token.cancelPromise.catch(() => {})
  return token
}

async function resolveMetadata (pubkey) {
  const relayListEvent = await fetchRelayListEvent(pubkey)
  const parsed = relayListEvent ? parseRelayListEvent(relayListEvent) : { write: [] }
  const writeRelays = parsed.write.length ? parsed.write : freeRelays.slice(0, 2)
  const profileEvent = await fetchLatestProfile(pubkey, { writeRelays })
  const parsedProfile = profileEvent ? nostr.parseProfileEvent(profileEvent) : { name: '', picture: '' }
  return {
    profileEvent: profileEvent || undefined,
    relayListEvent: relayListEvent || undefined,
    writeRelays,
    name: parsedProfile.name || '',
    picture: parsedProfile.picture || ''
  }
}

customElements.define('account-import', AccountImport)
