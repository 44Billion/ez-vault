import * as store from '../services/accounts-store.js'
import * as nostr from '../helpers/nostr/index.js'
import * as relays from '../services/relays.js'
import * as accountStatus from '../services/account-status.js'
import * as messengerLog from '../services/messenger-log/index.js'
import * as secrets from '../services/secrets.js'
import * as passkey from '../services/passkey.js'
import { seededAvatarDataUrl } from '../services/avatar.js'
import * as toast from './shared/toast.js'
import { injectComponentStyles, waitForFocus } from '../helpers/dom.js'

const MODE = { CREATING: 'creating', NORMAL: 'normal', EDITING: 'editing' }
const FLASH_MS = 1200

// Tabler outline icons inlined from icons/*.svg so they render with
// `stroke="currentColor"` — `<img>` would isolate them from host CSS.
const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>'
const ICON_REFRESH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>'
const ICON_PENCIL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></svg>'
const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_KEY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0" /><path d="M15 9h.01" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'
const ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>'
const ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'
// Filled silhouette (tabler user-filled) for the empty-avatar fallback.
const ICON_USER_FILLED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 1 1 -5 5l.005 -.217a5 5 0 0 1 4.995 -4.783z" /><path d="M14 14a5 5 0 0 1 5 5v1a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-1a5 5 0 0 1 5 -5h4z" /></svg>'

const STYLES = /* css */`
  account-avatar {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    background-color: oklch(0.22 0 89.88);
  }
  account-avatar .avatar-image {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
  account-avatar .avatar-fallback {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.3 0.12 274.76);
  }
  account-avatar .avatar-fallback svg {
    width: 70%;
    height: 70%;
    display: block;
  }
  account-avatar .avatar-image[data-loaded="true"] + .avatar-fallback {
    display: none;
  }
  account-avatar .avatar-error-overlay {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background-color: oklch(0.55 0.2 25 / 0.5);
    border: 2px solid oklch(0.55 0.2 25);
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  account-avatar[data-error] .avatar-error-overlay {
    display: flex;
  }
  account-avatar .avatar-error-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: oklch(0.55 0.2 25);
  }
  account-avatar .avatar-error-icon svg {
    width: 50%;
    height: 50%;
    display: block;
  }
  account-avatar .avatar-btn {
    position: absolute;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: none;
    align-items: center;
    justify-content: center;
    background-color: oklch(0.22 0 89.88);
    color: oklch(0.92 0 89.88);
    font-size: 13rem;
    line-height: 1;
    box-shadow: 0 0 0 2px oklch(0.3 0.12 274.76);
    z-index: 1;
  }
  account-avatar .avatar-btn:active {
    background-color: oklch(0.38 0.1 274.76);
  }
  account-avatar .avatar-btn.at-top-left { top: 2px; left: 2px; }
  account-avatar .avatar-btn.at-top-right { top: 2px; right: 2px; }
  account-avatar .avatar-btn.at-bottom-left { bottom: 2px; left: 2px; }
  account-avatar .avatar-btn.at-bottom-right { bottom: 2px; right: 2px; }
  account-avatar .avatar-btn.at-primary {
    background-color: oklch(0.55 0.18 145);
    color: oklch(0.98 0 0);
  }
  account-avatar .avatar-btn.at-primary:active {
    background-color: oklch(0.48 0.16 145);
  }
  account-avatar[mode="creating"] .avatar-btn[data-action="cancel-create"],
  account-avatar[mode="creating"] .avatar-btn[data-action="cycle"],
  account-avatar[mode="creating"] .avatar-btn[data-action="save"],
  account-avatar[mode="normal"] .avatar-btn[data-action="edit"],
  account-avatar[mode="editing"] .avatar-btn[data-action="delete"],
  account-avatar[mode="editing"] .avatar-btn[data-action="cancel-edit"],
  account-avatar[mode="editing"]:not([data-type="npub"]) .avatar-btn[data-action="copy-nsec"],
  account-avatar[mode="editing"] .avatar-btn[data-action="copy-npub"] {
    display: inline-flex;
  }
  account-avatar .avatar-readonly-label {
    position: absolute;
    bottom: 2px;
    right: 2px;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    height: 18px;
    border-radius: 9999px;
    background-color: oklch(0.22 0 89.88);
    color: oklch(0.92 0 89.88);
    font-size: 9rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    box-shadow: 0 0 0 2px oklch(0.3 0.12 274.76);
    pointer-events: none;
    z-index: 1;
  }
  account-avatar[mode="normal"][data-type="npub"] .avatar-readonly-label {
    display: inline-flex;
  }
  account-avatar .avatar-btn.is-success {
    background-color: oklch(0.55 0.18 145);
    color: oklch(0.98 0 0);
  }
  account-avatar .avatar-btn.is-error {
    background-color: oklch(0.55 0.2 25);
    color: oklch(0.98 0 0);
  }
  account-avatar .avatar-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  account-avatar .avatar-btn-icon svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  /* Sync-selection: parent list flips the [selecting] attribute on each
     tile. We hide all per-tile controls (so the avatar acts as one big
     toggle target), dim un-selected tiles, and overlay a check on selected
     ones. The list owns selection state and click handling. */
  account-avatar[selecting] .avatar-btn,
  account-avatar[selecting] .avatar-readonly-label {
    display: none !important;
  }
  account-avatar[selecting] {
    cursor: pointer;
    transition: opacity 120ms ease-out;
  }
  account-avatar[selecting]:not([selected]) {
    opacity: 0.35;
  }
  account-avatar .avatar-select-overlay {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    display: none;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 4px;
    pointer-events: none;
    z-index: 2;
  }
  account-avatar[selecting][selected] .avatar-select-overlay {
    display: flex;
  }
  account-avatar .avatar-select-badge {
    width: 22px;
    height: 22px;
    border-radius: 0;
    background-color: oklch(0.3 0.12 274.76);
    color: oklch(0.98 0 0);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 2px oklch(0.35 0.11 277.19);
  }
  account-avatar .avatar-select-badge svg {
    width: 16px;
    height: 16px;
    display: block;
  }
`

const TEMPLATE = `
  <div class="avatar-image" aria-hidden="true"></div>
  <div class="avatar-fallback" aria-hidden="true">${ICON_USER_FILLED}</div>
  <div class="avatar-error-overlay" aria-hidden="true"><span class="avatar-error-icon">${ICON_ALERT}</span></div>
  <button class="avatar-btn at-top-left" data-action="cancel-create" title="Cancel" type="button"><span class="avatar-btn-icon">${ICON_TRASH}</span></button>
  <button class="avatar-btn at-top-left" data-action="delete" title="Remove account" type="button"><span class="avatar-btn-icon">${ICON_TRASH}</span></button>
  <button class="avatar-btn at-top-right" data-action="cycle" title="Change image" type="button"><span class="avatar-btn-icon">${ICON_REFRESH}</span></button>
  <button class="avatar-btn at-top-right" data-action="edit" title="Edit" type="button"><span class="avatar-btn-icon">${ICON_PENCIL}</span></button>
  <span class="avatar-readonly-label" aria-label="Read-only account">read-only</span>
  <button class="avatar-btn at-top-right" data-action="cancel-edit" title="Close" type="button"><span class="avatar-btn-icon">${ICON_X}</span></button>
  <button class="avatar-btn at-bottom-left" data-action="copy-nsec" title="Copy nsec" type="button"><span class="avatar-btn-icon">${ICON_KEY}</span></button>
  <button class="avatar-btn at-bottom-right at-primary" data-action="save" title="Save" type="button"><span class="avatar-btn-icon">${ICON_CHECK}</span></button>
  <button class="avatar-btn at-bottom-right" data-action="copy-npub" title="Copy npub" type="button"><span class="avatar-btn-icon">${ICON_COPY}</span></button>
  <span class="avatar-select-overlay" aria-hidden="true"><span class="avatar-select-badge">${ICON_CHECK}</span></span>
`

export class AccountAvatar extends HTMLElement {
  #mode
  #draft = null
  #account = null
  #image
  #flashTimers = new Map()
  #flashLabels = new Map()
  #unsubStatus = null

  connectedCallback () {
    injectComponentStyles('account-avatar', STYLES)
    this.#mode = this.getAttribute('mode') || MODE.NORMAL
    this.innerHTML = TEMPLATE
    this.#image = this.querySelector('.avatar-image')
    this.addEventListener('click', this.#onClick)
    this.#applyMode()

    if (this.#mode === MODE.CREATING) {
      this.#cycleSeed()
    } else {
      this.#account = store.get(this.getAttribute('pubkey'))
      if (!this.#account) {
        this.remove()
        return
      }
      this.#applyAccountType()
      this.#renderPicture(this.#account.picture, this.#account.pubkey)
      this.#updateCopyKeyButton()
    }

    this.#refreshStatus()
    this.#unsubStatus = accountStatus.subscribe((pubkey) => {
      if (pubkey === this.getAttribute('pubkey')) this.#refreshStatus()
    })
  }

  #refreshStatus () {
    const pk = this.getAttribute('pubkey')
    const st = pk ? accountStatus.get(pk) : null
    this.toggleAttribute('data-error', !!st?.error)
  }

  disconnectedCallback () {
    this.removeEventListener('click', this.#onClick)
    this.#unsubStatus?.()
    this.#unsubStatus = null
    for (const id of this.#flashTimers.values()) clearTimeout(id)
    this.#flashTimers.clear()
    this.#flashLabels.clear()
  }

  refresh () {
    if (this.#mode === MODE.CREATING) return
    const acc = store.get(this.getAttribute('pubkey'))
    if (!acc) {
      this.remove()
      return
    }
    const picChanged = acc.picture !== this.#account?.picture
    const typeChanged = acc.type !== this.#account?.type
    this.#account = acc
    if (typeChanged) this.#applyAccountType()
    if (picChanged) this.#renderPicture(acc.picture, acc.pubkey)
    if (typeChanged) this.#updateCopyKeyButton()
  }

  #applyAccountType () {
    const type = this.#account?.type
    if (type) this.setAttribute('data-type', type)
    else this.removeAttribute('data-type')
  }

  #updateCopyKeyButton () {
    const btn = this.querySelector('button[data-action="copy-nsec"]')
    if (!btn) return
    btn.title = this.#account?.type === 'bunker' ? 'Copy bunker URL' : 'Copy nsec'
  }

  async #copyKey (btn) {
    const acc = this.#account
    if (!acc) return this.#flashError(btn)
    if (acc.type === 'bunker') return this.#copy(btn, acc.bunker)
    if (acc.type !== 'nsec') return this.#flashError(btn)
    // Force a fresh user-verification prompt and decrypt the largeBlob
    // ad-hoc — the in-memory `secrets` module deliberately does not expose
    // the seckey for silent retrieval. The PRF and the entries returned
    // here only live on this stack frame.
    const icon = btn.querySelector('.avatar-btn-icon')
    btn.disabled = true
    icon?.classList.add('pulsate')
    try {
      const entries = await passkey.openSecrets()
      const entry = entries.find(e => e.type === 'nsec' && e.pubkey === acc.pubkey)
      if (!entry?.seckey) return this.#flashError(btn)
      return this.#copy(btn, nostr.nsecFromHex(entry.seckey))
    } catch (err) {
      console.warn('copy-nsec auth failed', err?.message ?? err)
      toast.error('Authentication failed')
      this.#flashError(btn)
    } finally {
      btn.disabled = false
      icon?.classList.remove('pulsate')
    }
  }

  #onClick = (e) => {
    const btn = e.target.closest('button[data-action]')
    if (!btn || btn.disabled) return
    const action = btn.dataset.action
    switch (action) {
      case 'cycle': return this.#cycleSeed()
      case 'cancel-create': return this.remove()
      case 'save': return this.#save(btn)
      case 'edit': return this.#setMode(MODE.EDITING)
      case 'cancel-edit': return this.#setMode(MODE.NORMAL)
      case 'delete': return this.#deleteAccount(btn)
      case 'copy-nsec': return this.#copyKey(btn)
      case 'copy-npub': return this.#copy(btn, nostr.npubFromPubkey(this.#account?.pubkey))
    }
  }

  #setMode (mode) {
    this.#mode = mode
    this.#applyMode()
  }

  #applyMode () {
    this.setAttribute('mode', this.#mode)
  }

  async #cycleSeed () {
    const cycleBtn = this.querySelector('button[data-action="cycle"]')
    const icon = cycleBtn?.querySelector('.avatar-btn-icon')
    if (cycleBtn) {
      cycleBtn.disabled = true
      icon?.classList.add('pulsate')
    }
    try {
      const kp = nostr.generateKeypair()
      const picture = await seededAvatarDataUrl(kp.pubkey)
      this.#draft = { ...kp, picture }
      await this.#renderPicture(picture)
    } finally {
      if (cycleBtn) {
        cycleBtn.disabled = false
        icon?.classList.remove('pulsate')
      }
    }
  }

  async #renderPicture (url, seedKey) {
    this.#image.dataset.loaded = 'false'
    if (!url && seedKey) url = await seededAvatarDataUrl(seedKey)
    if (!url) {
      this.#image.style.backgroundImage = ''
      return
    }
    try {
      await this.#probeImage(url)
      this.#image.style.backgroundImage = `url("${url}")`
      this.#image.dataset.loaded = 'true'
    } catch {
      if (!seedKey) {
        this.#image.style.backgroundImage = ''
        this.#image.dataset.loaded = 'false'
        return
      }
      const fallback = await seededAvatarDataUrl(seedKey)
      this.#image.style.backgroundImage = `url("${fallback}")`
      this.#image.dataset.loaded = 'true'
    }
  }

  #probeImage (url) {
    return new Promise((resolve, reject) => {
      const probe = new Image()
      probe.onload = () => resolve()
      probe.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
      probe.src = url
    })
  }

  async #save (btn) {
    if (!this.#draft) return
    const icon = btn.querySelector('.avatar-btn-icon')
    btn.disabled = true
    icon?.classList.add('pulsate')
    try {
      const writeRelays = relays.freeRelays.slice(0, 2)

      const relayListEvent = nostr.signRelayListEvent({
        secretKey: this.#draft.secretKey,
        writeRelays,
        readRelays: writeRelays
      })
      const profileEvent = nostr.signProfileEvent({
        secretKey: this.#draft.secretKey,
        picture: this.#draft.picture
      })

      const relayListPublish = await relays.publish(relayListEvent, relays.seedRelays)
      if (!relayListPublish.success) throw new Error('RELAY_LIST_PUBLISH_FAILED')

      const profilePublish = await relays.publish(profileEvent, writeRelays)
      if (!profilePublish.success) throw new Error('PROFILE_PUBLISH_FAILED')

      // Register the vault's passkey on the first non-npub account; no-op
      // when the vault is already unlocked.
      await passkey.ensureRegistered()

      const record = {
        type: 'nsec',
        pubkey: this.#draft.pubkey,
        picture: this.#draft.picture,
        name: '',
        profileEvent,
        relayListEvent,
        writeRelays
      }
      // Convert the draft tile in place so it keeps its DOM position
      // (account-list's render reuses tiles by pubkey).
      const newSeckey = this.#draft.seckey
      this.#draft = null
      this.#account = record
      this.setAttribute('pubkey', record.pubkey)
      this.#applyAccountType()
      this.#updateCopyKeyButton()
      this.#setMode(MODE.NORMAL)
      store.add(record)
      secrets.setNsecSecret(record.pubkey, newSeckey)
      await passkey.writeSecretsBlob()
    } catch (err) {
      console.error(err)
      this.#flashError(btn)
    } finally {
      btn.disabled = false
      icon?.classList.remove('pulsate')
    }
  }

  async #deleteAccount (btn) {
    if (!this.#account) return
    const pubkey = this.#account.pubkey
    const wasNonReadOnly = this.#account.type !== 'npub'
    if (wasNonReadOnly) {
      // Re-seal the largeBlob *before* dropping the tile from the DOM. If
      // we removed the account from the store first, account-list would
      // tear down this avatar and the user would see a passkey prompt with
      // no visible context — pulsating the delete button keeps the source
      // of the prompt obvious. secrets.deleteSecret also closes any pooled
      // BunkerHandle and releases the cached NsecSigner, so there's no
      // separate signer-cleanup call.
      const icon = btn?.querySelector('.avatar-btn-icon')
      if (btn) btn.disabled = true
      icon?.classList.add('pulsate')
      secrets.deleteSecret(pubkey)
      try {
        await passkey.writeSecretsBlob()
      } catch (err) {
        // The in-memory secret is already gone; failing to re-seal the
        // largeBlob is recoverable on the next mutation since the seal
        // path always writes the full snapshot.
        console.warn('failed to update vault blob after delete', err?.message ?? err)
      } finally {
        if (btn) btn.disabled = false
        icon?.classList.remove('pulsate')
      }
    }
    messengerLog.removeForPubkey(pubkey)
    store.remove(pubkey)
  }

  async #copy (btn, value) {
    if (!value) return this.#flashError(btn)
    try {
      // navigator.clipboard.writeText needs document focus. The nsec path
      // goes through passkey.openSecrets() first, whose WebAuthn dialog
      // steals focus and doesn't always hand it back before this await
      // — wait for it to come back so the write doesn't throw
      // NotAllowedError "document is not focused".
      await waitForFocus()
      await navigator.clipboard.writeText(value)
      this.#flashSuccess(btn)
    } catch (err) {
      console.error(err)
      this.#flashError(btn)
    }
  }

  #flashSuccess (btn) { this.#flash(btn, ICON_CHECK, 'is-success') }
  #flashError (btn) { this.#flash(btn, ICON_X, 'is-error') }
  #flash (btn, glyphHtml, cls) {
    const prev = this.#flashTimers.get(btn)
    if (prev) {
      clearTimeout(prev)
      this.#restoreFlash(btn)
    }
    const icon = btn.querySelector('.avatar-btn-icon')
    if (!icon) return
    this.#flashLabels.set(btn, icon.innerHTML)
    icon.innerHTML = glyphHtml
    btn.classList.add(cls)
    const id = setTimeout(() => this.#restoreFlash(btn), FLASH_MS)
    this.#flashTimers.set(btn, id)
  }

  #restoreFlash (btn) {
    const icon = btn.querySelector('.avatar-btn-icon')
    const prev = this.#flashLabels.get(btn)
    if (icon && prev != null) {
      icon.innerHTML = prev
      this.#flashLabels.delete(btn)
    }
    btn.classList.remove('is-success', 'is-error')
    this.#flashTimers.delete(btn)
  }
}

customElements.define('account-avatar', AccountAvatar)
