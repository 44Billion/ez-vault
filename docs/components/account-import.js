import * as store from '../services/accounts-store.js'
import * as nostr from '../services/nostr.js'
import {
  fetchLatestProfile,
  fetchRelayListEvent,
  parseRelayListEvent,
  freeRelays
} from '../services/relays.js'
import { fetchBunkerUserPubkey, releaseBunker } from '../services/bunker.js'
import { seededAvatarDataUrl } from '../services/avatar.js'
import { injectComponentStyles } from '../helpers/dom.js'

const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>'
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>'
const ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>'

const ERROR_FLASH_MS = 1500

const STYLES = /* css */`
  account-import {
    display: block;
    overflow: hidden;
    max-height: 0;
    transition: max-height 220ms ease-out;
  }
  account-import[open] {
    max-height: 60px;
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
`

const TEMPLATE = /* html */`
  <form class="import-form" autocomplete="off">
    <button class="import-btn" data-action="cancel" type="button" title="Cancel">
      <span class="import-btn-icon">${ICON_X}</span>
    </button>
    <input class="import-input" type="text" placeholder="nsec1.../hex, npub1..., or bunker://" spellcheck="false" autocorrect="off" autocapitalize="off" />
    <button class="import-btn" data-action="confirm" type="submit" title="Import">
      <span class="import-btn-icon">${ICON_CHECK}</span>
    </button>
  </form>
`

export class AccountImport extends HTMLElement {
  #form
  #input
  #cancelBtn
  #confirmBtn
  #confirmIcon
  #errorTimer = null
  #busy = false

  connectedCallback () {
    injectComponentStyles('account-import', STYLES)
    this.innerHTML = TEMPLATE
    this.#form = this.querySelector('.import-form')
    this.#input = this.querySelector('.import-input')
    this.#cancelBtn = this.querySelector('button[data-action="cancel"]')
    this.#confirmBtn = this.querySelector('button[data-action="confirm"]')
    this.#confirmIcon = this.#confirmBtn.querySelector('.import-btn-icon')

    this.#form.addEventListener('submit', this.#onSubmit)
    this.#cancelBtn.addEventListener('click', this.#onCancel)
  }

  disconnectedCallback () {
    if (this.#errorTimer) clearTimeout(this.#errorTimer)
  }

  open () {
    if (this.hasAttribute('open')) return
    this.setAttribute('open', '')
    requestAnimationFrame(() => this.#input?.focus())
  }

  close () {
    if (this.#busy) return
    this.removeAttribute('open')
    this.#input.value = ''
    this.#clearErrorFlash()
  }

  #onCancel = () => {
    this.close()
  }

  #onSubmit = async (e) => {
    e.preventDefault()
    if (this.#busy) return
    const raw = this.#input.value.trim()
    if (!raw) return

    this.#setBusy(true)
    try {
      if (raw.startsWith('bunker://')) {
        await this.#importBunker(raw)
      } else if (raw.startsWith('npub1')) {
        await this.#importNpub(raw)
      } else {
        await this.#importSeckey(raw)
      }
      this.removeAttribute('open')
      this.#input.value = ''
    } catch (err) {
      console.error('import failed', err?.message ?? err)
      this.#flashError()
    } finally {
      this.#setBusy(false)
    }
  }

  #setBusy (on) {
    this.#busy = on
    this.#input.disabled = on
    this.#cancelBtn.disabled = on
    this.#confirmBtn.disabled = on
    this.#confirmIcon.classList.toggle('pulsate', on)
  }

  #flashError () {
    this.#clearErrorFlash()
    this.#cancelBtn.disabled = true
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
    if (!this.#busy) {
      this.#cancelBtn.disabled = false
      this.#confirmBtn.disabled = false
    }
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
      // Upgrading from bunker → nsec: the live BunkerHandle is now obsolete,
      // tear it down so it doesn't linger in the pool.
      if (existing.type === 'bunker') releaseBunker(pubkey)
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

  async #importBunker (bunkerUrlInput) {
    // fetchBunkerUserPubkey spins up a pooled BunkerHandle, generates the
    // persistent client key, burns the URL's one-use secret on connect, and
    // returns the values we must persist. The handle keeps the connection
    // warm for the rehydrator/sign path that follows.
    const { pubkey, clientKey, bunkerUrl } = await fetchBunkerUserPubkey(bunkerUrlInput)
    const existing = store.get(pubkey)
    // A bunker import can replace another bunker entry (URL/secret refresh)
    // or upgrade a read-only npub; an existing nsec is strictly more capable,
    // so we reject that case.
    if (existing && existing.type !== 'bunker' && existing.type !== 'npub') {
      // The handle has already registered itself in the pool keyed by this
      // pubkey — clean it up since we're rejecting the import.
      releaseBunker(pubkey)
      throw new Error('ACCOUNT_EXISTS')
    }
    const meta = await resolveMetadata(pubkey)
    const picture = meta.picture || existing?.picture || await seededAvatarDataUrl(pubkey)
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
