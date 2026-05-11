import * as store from '../services/accounts-store.js'
import * as nostr from '../services/nostr.js'
import {
  fetchLatestProfile,
  fetchRelayListEvent,
  parseRelayListEvent,
  freeRelays
} from '../services/relays.js'
import { fetchBunkerUserPubkey } from '../services/bunker.js'
import { seededAvatarDataUrl } from '../services/avatar.js'
import { ImportSession, extractBunkerClientKey } from '../services/nostrpair.js'
import { QrScanner, isCameraSupported } from '../services/qr-scanner.js'
import * as secrets from '../services/secrets.js'
import * as passkey from '../services/passkey.js'
import * as trustedSigners from '../services/trusted-signers.js'
import * as toast from './shared/toast.js'
import { injectComponentStyles, waitForFocus } from '../helpers/dom.js'
import { detectPlatform } from '../helpers/platform.js'

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'
const ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'
const ICON_CAMERA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1a2 2 0 0 0 2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" /><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>'
const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>'

const ERROR_FLASH_MS = 1500
const COPY_FLASH_MS = 1500

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
  /* Pair flow opens an extra status panel below the input. Active (still
     waiting for the 6-digit code) and error both show only the status line,
     so they share the same compact height. */
  account-import[open][data-pair="active"],
  account-import[open][data-pair="error"] {
    max-height: 110px;
  }
  /* Once the code is computed, grow the host so the label + code reveal as
     the .pair-code-section expands inside it (both transitions in step). */
  account-import[open][data-pair="active"][data-pair-ready="true"] {
    max-height: 200px;
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
    /* No flex gap here: the only sibling-spacing we need (between the
       code section and the status line) lives on .pair-code-section's
       margin-bottom, so it can transition with the collapse animation
       and shrink to 0 in the connecting/importing/error states. */
    padding-top: 14px;
  }
  account-import[data-pair="active"] .pair-panel,
  account-import[data-pair="error"] .pair-panel {
    display: flex;
  }
  /* Wraps the label + 6-digit code so we can collapse them as one block
     while still pairing. The transition mirrors the host's max-height
     animation so they slide in together when the code is ready. */
  account-import .pair-code-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 0;
    opacity: 0;
    margin-bottom: 0;
    overflow: hidden;
    transition: max-height 280ms ease-out, opacity 200ms ease-out, margin-bottom 280ms ease-out;
  }
  account-import[data-pair="active"][data-pair-ready="true"] .pair-code-section {
    max-height: 80px;
    opacity: 1;
    margin-bottom: 8px;
  }
  account-import .pair-label {
    font-size: 14rem;
    font-weight: 600;
    color: oklch(0.7 0 89.88);
  }
  /* 3-column grid keeps the digits visually centered in the box even though
     the copy button only sits on the right (column 1 is an empty mirror of
     column 3's button width). */
  account-import .pair-code {
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    align-items: center;
    background-color: oklch(0.28 0 89.88);
    color: oklch(0.92 0 89.88);
    padding: 8px;
    border-radius: 6px;
  }
  account-import .pair-code-text {
    grid-column: 2;
    text-align: center;
    letter-spacing: 0.4em;
    font-size: 28rem;
    font-variant-numeric: tabular-nums;
  }
  account-import .pair-code-copy {
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
  account-import .pair-code-copy:active {
    background-color: oklch(0.38 0 89.88);
  }
  account-import .pair-code-copy.is-success {
    color: oklch(0.55 0.18 145);
  }
  account-import .pair-code-copy svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  account-import .pair-status {
    font-size: 15rem;
    color: oklch(0.7 0 89.88);
    min-height: 16px;
  }
  account-import .pair-status.is-error { color: oklch(0.7 0.18 25); }
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
    <div class="pair-code-section">
      <span class="pair-label">Type this code on the other device:</span>
      <div class="pair-code">
        <span class="pair-code-text">------</span>
        <button class="pair-code-copy" type="button" title="Copy code">${ICON_COPY}</button>
      </div>
    </div>
    <span class="pair-status"></span>
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
  #pairCodeEl
  #pairCopyBtn
  #pairStatusEl
  #scanWrap
  #scanStopBtn
  #errorTimer = null
  #copyTimer = null
  #busy = false
  #pairSession = null
  #scanner = null
  #activeImport = null

  // Wired by index.js. Buttons listed here are .disabled while the import
  // panel is open so the user can't kick off a conflicting flow (currently
  // just the Export button — opening the export pane on top of an active
  // pairing would leave two pair sessions racing on the same relay).
  toolbarButtons = []

  connectedCallback () {
    injectComponentStyles('account-import', STYLES)
    this.innerHTML = TEMPLATE
    this.#form = this.querySelector('.import-form')
    this.#input = this.querySelector('.import-input')
    this.#cancelBtn = this.querySelector('button[data-action="cancel"]')
    this.#scanBtn = this.querySelector('button[data-action="scan"]')
    this.#confirmBtn = this.querySelector('button[data-action="confirm"]')
    this.#confirmIcon = this.#confirmBtn.querySelector('.import-btn-icon')
    this.#pairCodeEl = this.querySelector('.pair-code-text')
    this.#pairCopyBtn = this.querySelector('.pair-code-copy')
    this.#pairStatusEl = this.querySelector('.pair-status')
    this.#scanWrap = this.querySelector('.scan-video-wrap')
    this.#scanStopBtn = this.querySelector('.scan-stop')

    this.#form.addEventListener('submit', this.#onSubmit)
    this.#cancelBtn.addEventListener('click', this.#onCancel)
    this.#scanBtn.addEventListener('click', this.#onStartScan)
    this.#scanStopBtn.addEventListener('click', () => this.#stopScan())
    this.#pairCopyBtn.addEventListener('click', this.#onCopyPairCode)

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
    this.#setToolbarDisabled(true)
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
    // Drop any pair UI residue (e.g. a lingering "error" state from a failed
    // pairing) so the next open() starts clean.
    this.dataset.pair = ''
    this.dataset.pairReady = ''
    this.#setPairStatus('', null)
    this.#resetPairCopy()
    this.#setToolbarDisabled(false)
  }

  #setToolbarDisabled (disabled) {
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = disabled
    }
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
    // Clear any stale pair-error UI from a previous failed pairing — a fresh
    // submission (or scan result) is the user's "try again" signal, so the
    // pair-cancel button should reappear on the new attempt if it's a
    // nostrpair URL. Non-nostrpair imports just leave it empty.
    this.dataset.pair = ''
    this.dataset.pairReady = ''
    this.#setPairStatus('', null)
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
      // Funnel through close() so the toolbar re-enable / scan-stop / pair
      // reset all run together (the explicit-cancel path already did them).
      this.close()
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
  // user-typed input does (without re-entering the nostrpair branch). Both
  // paths funnel through #commitPrepared so the passkey ceremony and the
  // largeBlob write run back-to-back, with rollback on writeBlob failure.
  async #dispatch (raw, token) {
    if (raw.startsWith('nostrpair://')) return this.#importNostrpair(raw, token)
    let prepared
    if (raw.startsWith('bunker://')) prepared = await this.#prepareBunker(raw, token)
    else if (raw.startsWith('npub1')) prepared = await this.#prepareNpub(raw)
    else prepared = await this.#prepareSeckey(raw)
    await this.#commitPrepared([prepared])
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

  // Each #prepare* call resolves the pubkey, runs the duplicate check, and
  // fetches metadata + the seeded avatar, but does NOT touch the store or the
  // secrets module. The returned object holds everything #commitPrepared
  // needs to apply the mutation synchronously, so the passkey + largeBlob
  // prompts can fire back-to-back with no awaited work splitting them.

  async #prepareSeckey (raw) {
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
      picture,
      name: meta.name || existing?.name || '',
      profileEvent: meta.profileEvent || existing?.profileEvent,
      relayListEvent: meta.relayListEvent || existing?.relayListEvent,
      writeRelays: meta.writeRelays
    }
    return { type: 'nsec', pubkey, record, seckey }
  }

  async #prepareNpub (npub) {
    const pubkey = nostr.pubkeyFromNpub(npub)
    // npub is the weakest form (read-only), so it can never overwrite an
    // existing entry — any nsec/bunker/npub at this pubkey wins.
    if (store.get(pubkey)) throw new Error('ACCOUNT_EXISTS')
    const meta = await resolveMetadata(pubkey)
    const picture = meta.picture || await seededAvatarDataUrl(pubkey)
    const record = {
      type: 'npub',
      pubkey,
      picture,
      name: meta.name || '',
      profileEvent: meta.profileEvent,
      relayListEvent: meta.relayListEvent,
      writeRelays: meta.writeRelays
    }
    return { type: 'npub', pubkey, record }
  }

  async #prepareBunker (bunkerUrlInput, token) {
    // Pairing-imported bunker URLs carry the persistent client key as a
    // local-only `#client_key=` fragment so the receiving device can adopt
    // the same client identity instead of generating a fresh one (a fresh
    // key would force a re-auth on the bunker, defeating the point).
    const { url: cleanedUrl, clientKey: suppliedClientKey } = extractBunkerClientKey(bunkerUrlInput)

    let bunkerHandle = null
    let committed = false
    // Closes the in-flight handle if cancel happens before commit. After
    // commit the handle is the live connection for the new account and
    // must stay alive — `committed` short-circuits the cleanup then.
    // The cleanup stays armed on token.cleanups across the prepare→commit
    // boundary and is dropped (along with the committed=true flip) by the
    // `markCommitted` returned to the caller.
    const cleanup = () => {
      if (committed) return
      try { bunkerHandle?.close() } catch { /* noop */ }
    }
    token?.cleanups.push(cleanup)

    try {
      // fetchBunkerUserPubkey spins up a transient BunkerHandle, generates
      // the persistent client key (or uses the supplied one), burns the
      // URL's one-use secret on connect, and resolves with the user pubkey.
      // The clientKey is intentionally not returned — it lives in the
      // handle's WeakMap-backed slot until `bunkerHandle.commit()` adopts
      // the handle into secrets's pool below.
      const { pubkey, bunkerUrl } = await fetchBunkerUserPubkey(cleanedUrl, {
        clientKey: suppliedClientKey ?? undefined,
        onHandle: (h) => { bunkerHandle = h }
      })
      if (token?.cancelled) throw new Error('IMPORT_CANCELLED')

      const existing = store.get(pubkey)
      // A bunker import can replace another bunker entry (URL/secret
      // refresh) or upgrade a read-only npub; an existing nsec is strictly
      // more capable, so we reject that case.
      if (existing && existing.type !== 'bunker' && existing.type !== 'npub') {
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
        picture,
        name: meta.name || existing?.name || '',
        profileEvent: meta.profileEvent || existing?.profileEvent,
        relayListEvent: meta.relayListEvent || existing?.relayListEvent,
        writeRelays: meta.writeRelays
      }
      return {
        type: 'bunker',
        pubkey,
        record,
        bunkerHandle,
        markCommitted: () => {
          committed = true
          if (token) {
            const idx = token.cleanups.indexOf(cleanup)
            if (idx >= 0) token.cleanups.splice(idx, 1)
          }
        }
      }
    } catch (err) {
      // Prepare failed — close the in-flight handle and unregister the
      // cleanup before re-throwing, so the per-item failure can't leave a
      // dangling token.cleanups entry that closes a stale handle later.
      cleanup()
      if (token) {
        const idx = token.cleanups.indexOf(cleanup)
        if (idx >= 0) token.cleanups.splice(idx, 1)
      }
      throw err
    }
  }

  // Atomic-ish commit for a batch of prepared items. The passkey ceremony
  // (ensureRegistered + writeSecretsBlob) brackets the synchronous store /
  // secrets mutations + the trusted-signers write. If the trailing
  // writeSecretsBlob throws — or any of the inner mutations does — we roll
  // the store back to its prior records, reload the secrets pool from a
  // snapshot taken just before commit, and restore the trusted-signers
  // ciphertext. Net effect: either every record in the batch lands cleanly
  // on disk or none of them do.
  //
  // `options.trustedSigners` is `[{ accountPubkey, pubkey, platform }, ...]`
  // — the peer-signer list the pair flow received from the source. Omitted
  // for single-account dispatch paths (no peer to receive trust from).
  async #commitPrepared (prepared, options = {}) {
    if (!prepared.length) return
    const { trustedSigners: incomingTrust = null } = options
    const needsSecretsPersist = prepared.some(p => p.type !== 'npub')
    if (needsSecretsPersist) await passkey.ensureRegistered()

    // Snapshots are taken AFTER ensureRegistered so a first-time registration
    // is the baseline we'd revert to (an empty pool) rather than a not-yet-
    // unlocked state.
    const priorBlob = needsSecretsPersist ? secrets.sealCurrentEntries() : null
    const priorStoreRecords = new Map()
    for (const p of prepared) priorStoreRecords.set(p.pubkey, store.get(p.pubkey))
    const priorTrustedSignersBlob = incomingTrust?.length ? trustedSigners.snapshot() : null

    // Derive any signer seckeys that haven't been pre-filled yet. The pair
    // flow fills them earlier (so it can announce the signer pubkeys in
    // `register_trusted_signers` BEFORE this commit runs); single-account
    // paths leave them empty and we derive here. Idempotent — re-derivation
    // returns the same bytes.
    for (const p of prepared) {
      if (p.type === 'npub') continue
      if (!p.signerSeckey) p.signerSeckey = await secrets.deriveAccountSignerSecret(p.pubkey)
    }

    let committedCount = 0
    let trustedSignersWritten = false
    try {
      for (const p of prepared) {
        const prior = priorStoreRecords.get(p.pubkey)
        if (prior) store.replace(p.pubkey, p.record)
        else store.add(p.record)
        if (p.type === 'nsec') {
          // secrets.setNsecSecret also drops any prior bunker handle / nsec
          // signer cached for this pubkey, so no separate teardown call.
          secrets.setNsecSecret(p.pubkey, p.seckey)
        } else if (p.type === 'bunker') {
          // Adopts the live handle (with its WeakMap-protected clientKey)
          // into the secrets pool. The bytes never travel through this scope.
          p.bunkerHandle.commit()
          p.markCommitted()
        }
        if (p.signerSeckey) secrets.setSignerSecret(p.pubkey, p.signerSeckey)
        committedCount++
      }
      // Trusted-signers BEFORE the largeBlob write: the user's stated intent
      // is "store the trusted public keys before importing secrets", and
      // bracketing both inside this try/catch means the rollback can put the
      // prior ciphertext back if writeSecretsBlob below throws.
      if (incomingTrust?.length) {
        trustedSigners.addMany(incomingTrust)
        trustedSignersWritten = true
      }
      if (needsSecretsPersist) await passkey.writeSecretsBlob()
    } catch (err) {
      for (let i = 0; i < committedCount; i++) {
        const p = prepared[i]
        const prior = priorStoreRecords.get(p.pubkey)
        try {
          if (prior) store.replace(p.pubkey, prior)
          else store.remove(p.pubkey)
        } catch { /* noop */ }
      }
      // secrets.reload's clearAll() closes any bunker handles currently in
      // the pool — which includes the ones we just committed — and re-adopts
      // the prior set from the snapshot. Nsec signers and bunker handles
      // adopted by the reload are fresh instances, but functionally equal to
      // the pre-batch pool.
      if (priorBlob !== null) {
        try { secrets.reload(priorBlob) } catch (e) {
          console.warn('secrets rollback failed', e?.message ?? e)
        }
      }
      if (trustedSignersWritten) {
        try { trustedSigners.restore(priorTrustedSignersBlob) } catch (e) {
          console.warn('trusted-signers rollback failed', e?.message ?? e)
        }
      }
      throw err
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
        // Reveal the label + code section. Sized via CSS — the host's
        // max-height grows in lockstep so the reveal is one smooth motion.
        // The label already says "Show this code on the other device:", so
        // the status line is cleared until the source replies with accounts.
        this.dataset.pairReady = 'true'
        this.#setPairStatus('', null)
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
      // Envelope shape from session.run():
      //   { platform: string, accounts: [[bareKey], [bareKey, signerPubkey], ...] }
      // We leave the session OPEN — it's needed for `register_trusted_signers`
      // below — and close it ourselves once the round-trip completes.
      const { platform: sourcePlatform, accounts } = await session.run()

      if (token?.cancelled) throw new Error('IMPORT_CANCELLED')
      if (!accounts.length) throw new Error('IMPORT_REJECTED')

      // Source has replied — the code is no longer useful. Collapse the
      // code section (and shrink the host) the same way it expanded.
      this.dataset.pairReady = ''
      // WebAuthn (passkey create/get) requires the page to have focus —
      // and the user is typically still on the source tab when the reply
      // lands here, so any ensureRegistered() / writeSecretsBlob() below
      // would throw "the page does not have focus" without ever showing
      // a prompt. Park the flow until they tab back in; the click that
      // refocuses the document also grants the transient activation
      // WebAuthn needs.
      if (!document.hasFocus()) {
        this.#setPairStatus('Switch back to this tab to continue…', null)
        await waitForFocus(cancel => token?.cleanups.push(cancel))
        if (token?.cancelled) throw new Error('IMPORT_CANCELLED')
      }
      // Status counts down as each entry is prepared: starts at the full
      // payload size and drops by one after every iteration so the user
      // sees "Importing 1 account…" once the prior entry's metadata fetch
      // has settled.
      let remaining = accounts.length
      const showRemaining = () => this.#setPairStatus(
        `Importing ${remaining} account${remaining === 1 ? '' : 's'}…`,
        null
      )
      showRemaining()

      // Phase 1 — prepare every item in memory. All the network work
      // (fetchBunkerUserPubkey, resolveMetadata, seededAvatarDataUrl) happens
      // here, with no store/secrets mutations. Iterate the payload in
      // reverse: store.add() unshifts each new record to the head of the
      // list, so the LAST imported entry ends up topmost. Reversing the
      // iteration order makes the source's [A, B, ...] order preserved on
      // the target ([A, B, ...existing]) instead of mirrored.
      const prepared = []
      const errors = []
      for (let i = accounts.length - 1; i >= 0; i--) {
        if (token?.cancelled) throw new Error('IMPORT_CANCELLED')
        const tuple = accounts[i]
        if (!Array.isArray(tuple) || typeof tuple[0] !== 'string') {
          remaining -= 1
          if (remaining > 0) showRemaining()
          continue
        }
        const bareKey = tuple[0]
        const sourceSignerPubkey = typeof tuple[1] === 'string' ? tuple[1] : null
        try {
          let p
          if (bareKey.startsWith('bunker://')) p = await this.#prepareBunker(bareKey, token)
          else if (bareKey.startsWith('npub1')) p = await this.#prepareNpub(bareKey)
          else if (bareKey.startsWith('nsec1')) p = await this.#prepareSeckey(bareKey)
          else throw new Error(`unknown entry: ${bareKey.slice(0, 16)}…`)
          // Stash the source's announced signer pubkey for this account so
          // we can fold it into the trusted-signers write at commit time.
          if (sourceSignerPubkey) p.sourceSignerPubkey = sourceSignerPubkey
          prepared.push(p)
        } catch (err) {
          if (err?.message === 'IMPORT_CANCELLED') throw err
          // Don't abort the whole batch on a single bad entry — the user
          // gets whatever else came through, and we log the rest.
          errors.push(err?.message ?? String(err))
        }
        remaining -= 1
        // Skip the final "Importing 0 accounts…" flash; the commit step
        // below clears the status anyway.
        if (remaining > 0) showRemaining()
      }

      if (!prepared.length) throw new Error('IMPORT_FAILED')
      if (token?.cancelled) throw new Error('IMPORT_CANCELLED')

      // Phase 2 — unlock the vault (passkey prompt #1) so we can derive
      // each non-npub account's signer keypair. The pubkeys then travel
      // back over the session in `register_trusted_signers`; the seckeys
      // stay on this device and ride into the same writeBlob as the
      // imported secrets below.
      await passkey.ensureRegistered()
      if (token?.cancelled) throw new Error('IMPORT_CANCELLED')

      const ourSigners = []
      const incomingTrust = []
      for (const p of prepared) {
        if (p.type === 'npub') continue
        const { seckey, pubkey } = await secrets.deriveAccountSignerKeypair(p.pubkey)
        p.signerSeckey = seckey
        ourSigners.push({ accountPubkey: p.pubkey, signerPubkey: pubkey })
        if (p.sourceSignerPubkey) {
          incomingTrust.push({
            accountPubkey: p.pubkey,
            pubkey: p.sourceSignerPubkey,
            platform: sourcePlatform
          })
        }
      }

      // Phase 3 — trusted-signer exchange. Source receives our signer
      // pubkeys, stores them, replies 'ack'. Skip when nothing to exchange
      // (an all-npub payload is theoretically possible).
      if (ourSigners.length) {
        await session.registerTrustedSigners({
          platform: detectPlatform(),
          signers: ourSigners
        })
        if (token?.cancelled) throw new Error('IMPORT_CANCELLED')
      }

      // Round-trip done — drop the session before commit so a cancel mid-
      // commit doesn't try to close it again from pairCleanup.
      this.#pairSession = null
      session.close()

      // Phase 4 — passkey ceremony tail (writeBlob = prompt #2) +
      // synchronous store/secret mutations + trusted-signers write, all
      // bracketed by a single rollback. The ensureRegistered call inside
      // commitPrepared is a no-op (vault already unlocked above), and the
      // pre-derived signer seckeys mean commit just adopts them as-is.
      await this.#commitPrepared(prepared, { trustedSigners: incomingTrust })

      this.dataset.pair = ''
      this.dataset.pairReady = ''
      this.#setPairStatus('', null)
      const summary = `Imported ${prepared.length} account${prepared.length === 1 ? '' : 's'}`
      if (errors.length) toast.warning(`${summary} (${errors.length} failed)`, errors.join('\n'))
      else toast.success(summary)
    } catch (err) {
      // Cancellation is user-initiated and surfaces no UI error: #cancelPair
      // (or close()) has already cleared the pair UI in that case.
      if (err?.message !== 'IMPORT_CANCELLED') {
        this.dataset.pair = 'error'
        this.dataset.pairReady = ''
        this.#setPairStatus('Error. Try again!', 'error')
        const { message, longMessage } = pairErrorToToast(err)
        toast.error(message, longMessage)
      }
      throw err
    } finally {
      if (token) {
        const idx = token.cleanups.indexOf(pairCleanup)
        if (idx >= 0) token.cleanups.splice(idx, 1)
      }
      // Idempotent — Phase 3 closes the session on the happy path, and
      // #cancelPair closes it on user-cancel. This covers any other
      // exit path (prepare failure, register_trusted_signers reject,
      // commit failure) so we don't leak the relay subscription.
      try { session.close() } catch { /* noop */ }
      this.#pairSession = null
    }
  }

  #cancelPair () {
    const s = this.#pairSession
    this.#pairSession = null
    if (s) s.close()
    this.dataset.pair = ''
    this.dataset.pairReady = ''
    this.#setPairStatus('', null)
    this.#resetPairCopy()
  }

  #onCopyPairCode = async () => {
    const code = this.#pairCodeEl.textContent
    // Don't copy the placeholder ('------') if the button is somehow reached
    // before the real code arrives (it shouldn't, since the code section is
    // collapsed until then).
    if (!code || code === '------') return
    try {
      await navigator.clipboard.writeText(code)
      this.#pairCopyBtn.classList.add('is-success')
      this.#pairCopyBtn.innerHTML = ICON_CHECK
      if (this.#copyTimer) clearTimeout(this.#copyTimer)
      this.#copyTimer = setTimeout(() => this.#resetPairCopy(), COPY_FLASH_MS)
    } catch (err) {
      console.error('copy pair code failed', err?.message ?? err)
    }
  }

  #resetPairCopy () {
    if (this.#copyTimer) {
      clearTimeout(this.#copyTimer)
      this.#copyTimer = null
    }
    this.#pairCopyBtn.classList.remove('is-success')
    this.#pairCopyBtn.innerHTML = ICON_COPY
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
    // Drop any pair-error residue so we don't render the error message under
    // the camera preview while scanning.
    this.dataset.pair = ''
    this.dataset.pairReady = ''
    this.#setPairStatus('', null)
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

// Map nostrpair-flow error codes to toast copy. Unknown codes (e.g. a custom
// reply.error string from the source device) fall through to a generic header
// with the raw code as the expandable detail.
function pairErrorToToast (err) {
  const code = err?.message ?? String(err)
  switch (code) {
    case 'IMPORT_TIMEOUT':
      return { message: 'Pairing timed out', longMessage: 'The other device did not respond in time.' }
    case 'IMPORT_REJECTED':
      return { message: 'Pairing rejected', longMessage: 'The other device declined the request or sent no accounts.' }
    case 'IMPORT_BAD_RESPONSE':
      return { message: 'Pairing failed', longMessage: 'Got an unexpected response from the other device.' }
    case 'IMPORT_FAILED':
      return { message: 'Import failed', longMessage: 'No accounts could be imported.' }
    case 'INVALID_NOSTRPAIR_URL':
      return { message: 'Invalid pairing URL', longMessage: '' }
    default:
      return { message: 'Pairing failed', longMessage: code }
  }
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
