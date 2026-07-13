import { generateSecretKey, getPublicKey } from 'nostr-tools'
import { getConversationKey } from 'nostr-tools/nip44'
import { bytesToHex } from 'libp2r2p/base16'
import { Nip46Client, Nip46ServerSession } from 'libp2r2p/nip46'
import { freeRelays, relayPool } from 'libp2r2p/relay'
import {
  buildNostrpairUrl,
  parseNostrpairInput,
  extractBunkerClientKey,
  buildBunkerUrlWithClientKey
} from '../helpers/nostrpair-url.js'

export { buildNostrpairUrl, parseNostrpairInput, extractBunkerClientKey }

// The pairing exchange is short-lived and same-user, so a single relay keeps
// the QR code compact while the shared NIP-46 layer handles reconnection.
export const pairingRelay = freeRelays[0]

const PAIRING_CODE_DOMAIN_TAG = 'nostr-pair-sas-v1'
const PUBKEY = /^[0-9a-f]{64}$/
const SECRET_BYTES = 16
const CONNECT_TIMEOUT_MS = 30_000
const REQUEST_TIMEOUT_MS = 120_000
const EXCHANGE_TIMEOUT_MS = 180_000
const NETWORK_TIMEOUT_MS = 10_000
const LOGOUT_TIMEOUT_MS = 1000
const PAIRING_CODE_DIGITS = 6
const PROFILE_NAME_MAX_LENGTH = 128
const PROFILE_ABOUT_MAX_LENGTH = 4096
const PROFILE_PICTURE_MAX_LENGTH = 4096

function isPlainObject (value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function maybeUnref (timer) {
  timer?.unref?.()
  return timer
}

function randomHex (bytes) {
  const value = new Uint8Array(bytes)
  crypto.getRandomValues(value)
  return bytesToHex(value)
}

function syncError (error, { closed = false } = {}) {
  if (closed) return new Error('SYNC_CANCELLED')
  if (error?.message === 'NIP46_REQUEST_TIMEOUT') return new Error('SYNC_TIMEOUT')
  return error instanceof Error ? error : new Error(String(error))
}

function waitAtMost (promise, timeout) {
  return new Promise((resolve, reject) => {
    const timer = maybeUnref(setTimeout(() => reject(new Error('SYNC_TIMEOUT')), timeout))
    Promise.resolve(promise).then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) }
    )
  })
}

function trustedSignerParams (params) {
  if (!Array.isArray(params) || params.length !== 2) throw new Error('invalid register_trusted_signer params')
  const [platform, signerPubkey] = params
  if (typeof platform !== 'string' || !PUBKEY.test(signerPubkey)) throw new Error('invalid trusted signer')
  return { platform, signerPubkey }
}

function accountExchangeParams (params) {
  if (!Array.isArray(params) || params.length !== 3) throw new Error('invalid exchange_accounts params')
  const [code, platform, accountsJson] = params
  if (typeof code !== 'string' || typeof platform !== 'string' || typeof accountsJson !== 'string') {
    throw new Error('invalid exchange_accounts params')
  }
  let accounts
  try {
    accounts = JSON.parse(accountsJson)
  } catch {
    throw new Error('invalid accounts')
  }
  if (!Array.isArray(accounts)) throw new Error('invalid accounts')
  return { code, platform, accounts }
}

// Both devices derive the same six-digit SAS from their ephemeral NIP-44
// conversation key, separated from NIP-44's own key derivation by an HMAC tag.
export async function derivePairingCode (seckey, peerPubkey) {
  const conversationKey = getConversationKey(seckey, peerPubkey)
  const hmacKey = await crypto.subtle.importKey(
    'raw', conversationKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const tagBytes = new TextEncoder().encode(PAIRING_CODE_DOMAIN_TAG)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, tagBytes))
  const n = (mac[0] * 0x1000000) + (mac[1] << 16) + (mac[2] << 8) + mac[3]
  return String(n % 10 ** PAIRING_CODE_DIGITS).padStart(PAIRING_CODE_DIGITS, '0')
}

// Device 1 is a one-use NIP-46 server whose custom methods exchange device
// trust and account envelopes. Standard lifecycle methods are handled by libp2r2p.
export class HostSession {
  #ephSecretKey
  #ephPubkey
  #secret
  #relay
  #rpc
  #handlers
  #requestTimeout
  #subscriptionTimeout
  #closed = false

  constructor ({
    onJoinerConnected,
    onPairingCode,
    onError,
    onTrustedSignerReceived,
    onExchangeRequest,
    _relayPool = relayPool,
    _requestTimeout = REQUEST_TIMEOUT_MS,
    _subscriptionTimeout = NETWORK_TIMEOUT_MS
  } = {}) {
    this.#ephSecretKey = generateSecretKey()
    this.#ephPubkey = getPublicKey(this.#ephSecretKey)
    this.#secret = randomHex(SECRET_BYTES)
    this.#relay = pairingRelay
    this.#handlers = { onJoinerConnected, onPairingCode, onError, onTrustedSignerReceived, onExchangeRequest }
    this.#requestTimeout = _requestTimeout
    this.#subscriptionTimeout = _subscriptionTimeout
    this.#rpc = new Nip46ServerSession(this.#ephSecretKey, {
      relays: [this.#relay],
      secret: this.#secret,
      relayPool: _relayPool,
      timeout: NETWORK_TIMEOUT_MS,
      onError,
      onConnect: ({ peerPubkey }) => this.#onConnect(peerPubkey),
      onRequest: request => this.#onRequest(request)
    })
  }

  get url () {
    return buildNostrpairUrl({ pubkey: this.#ephPubkey, relay: this.#relay, secret: this.#secret })
  }

  async start () {
    if (this.#closed) return
    try {
      await this.#rpc.start({ timeout: this.#subscriptionTimeout })
    } catch (error) {
      if (!this.#closed) throw error
    }
  }

  cancel () {
    this.close()
  }

  close () {
    if (this.#closed) return
    this.#closed = true
    this.#rpc.close().catch(error => this.#handlers.onError?.(error))
  }

  async #onConnect (peerPubkey) {
    if (this.#closed) throw new Error('SYNC_CANCELLED')
    this.#handlers.onJoinerConnected?.()
    const code = await derivePairingCode(this.#ephSecretKey, peerPubkey)
    this.#handlers.onPairingCode?.(code)
  }

  async #onRequest ({ method, params }) {
    if (this.#closed) throw new Error('SYNC_CANCELLED')

    if (method === 'register_trusted_signer') {
      const incoming = trustedSignerParams(params)
      const ourTrust = await this.#handlers.onTrustedSignerReceived?.(incoming)
      if (ourTrust?.signerPubkey) {
        if (!PUBKEY.test(ourTrust.signerPubkey)) throw new Error('invalid local trusted signer')
        const result = await this.#rpc.sendRequest('register_trusted_signer', [
          typeof ourTrust.platform === 'string' ? ourTrust.platform : '',
          ourTrust.signerPubkey
        ], { timeout: this.#requestTimeout })
        if (result !== 'ack') throw new Error('REGISTER_TRUSTED_SIGNER_FAILED')
      }
      return 'ack'
    }

    if (method === 'exchange_accounts') {
      const incoming = accountExchangeParams(params)
      const code = await derivePairingCode(this.#ephSecretKey, this.#rpc.clientPubkey)
      if (incoming.code !== code) throw new Error('invalid pairing code')
      const outgoing = await this.#handlers.onExchangeRequest?.({
        platform: incoming.platform,
        accounts: incoming.accounts
      })
      return JSON.stringify({
        platform: typeof outgoing?.platform === 'string' ? outgoing.platform : '',
        accounts: Array.isArray(outgoing?.accounts) ? outgoing.accounts : []
      })
    }

    throw new Error('method not supported on nostrpair channel')
  }
}

// Device 2 is a NIP-46 client with two pairing-specific commands. The shared
// client owns listener readiness, request routing, relay switching, and logout.
export class JoinerSession {
  #ephSecretKey
  #remotePubkey
  #client
  #handlers
  #connectTimeout
  #requestTimeout
  #exchangeTimeout
  #closed = false
  #peerSignerReceived = null
  #peerSignerResolve = null
  #peerSignerReject = null
  #peerSignerTimer = null

  constructor (url, {
    onPairingCode,
    onConnected,
    onError,
    _relayPool = relayPool,
    _connectTimeout = CONNECT_TIMEOUT_MS,
    _requestTimeout = REQUEST_TIMEOUT_MS,
    _exchangeTimeout = EXCHANGE_TIMEOUT_MS
  } = {}) {
    const parsed = parseNostrpairInput(url)
    this.#remotePubkey = parsed.pubkey
    this.#ephSecretKey = generateSecretKey()
    this.#handlers = { onPairingCode, onConnected, onError }
    this.#connectTimeout = _connectTimeout
    this.#requestTimeout = _requestTimeout
    this.#exchangeTimeout = _exchangeTimeout
    this.#client = new Nip46Client(this.#ephSecretKey, {
      remoteSignerPubkey: parsed.pubkey,
      relays: [parsed.relay],
      secret: parsed.secret
    }, {
      relayPool: _relayPool,
      timeout: NETWORK_TIMEOUT_MS,
      onError,
      onRequest: request => this.#onRequest(request)
    })
  }

  async connect () {
    try {
      await this.#client.connect({ timeout: this.#connectTimeout })
      if (this.#closed) throw new Error('SYNC_CANCELLED')
      this.#handlers.onConnected?.()
      const code = await derivePairingCode(this.#ephSecretKey, this.#remotePubkey)
      this.#handlers.onPairingCode?.(code)
    } catch (error) {
      throw syncError(error, { closed: this.#closed })
    }
  }

  async exchangeTrust ({ platform = '', signerPubkey } = {}) {
    if (!PUBKEY.test(signerPubkey)) throw new Error('INVALID_TRUSTED_SIGNER')
    const peerPromise = this.#awaitPeerTrustedSigner({ timeout: this.#requestTimeout })
    try {
      const acknowledgement = this.#client
        .sendRequest('register_trusted_signer', [platform, signerPubkey], { timeout: this.#requestTimeout })
        .then(result => {
          if (result !== 'ack') throw new Error('REGISTER_TRUSTED_SIGNER_FAILED')
        })
      const [, peer] = await Promise.all([acknowledgement, peerPromise])
      return peer
    } catch (error) {
      clearTimeout(this.#peerSignerTimer)
      this.#peerSignerTimer = null
      this.#peerSignerResolve = null
      this.#peerSignerReject = null
      throw syncError(error, { closed: this.#closed })
    }
  }

  async exchangeAccounts ({ code = '', platform = '', accounts = [] } = {}) {
    let resultJson
    try {
      resultJson = await this.#client.sendRequest('exchange_accounts', [
        code,
        platform,
        JSON.stringify(Array.isArray(accounts) ? accounts : [])
      ], { timeout: this.#exchangeTimeout })
    } catch (error) {
      throw syncError(error, { closed: this.#closed })
    }

    let result
    try {
      result = JSON.parse(resultJson)
    } catch {
      throw new Error('SYNC_BAD_RESPONSE')
    }
    if (!isPlainObject(result) || !Array.isArray(result.accounts)) throw new Error('SYNC_BAD_RESPONSE')

    try {
      await waitAtMost(this.#client.logout(), LOGOUT_TIMEOUT_MS)
    } catch { /* logout is only a courtesy hint */ }
    await this.#client.close()
    this.#closed = true
    return {
      platform: typeof result.platform === 'string' ? result.platform : '',
      accounts: result.accounts
    }
  }

  close () {
    if (this.#closed) return
    this.#closed = true
    this.#client.close().catch(error => this.#handlers.onError?.(error))
    clearTimeout(this.#peerSignerTimer)
    this.#peerSignerTimer = null
    this.#peerSignerReject?.(new Error('SYNC_CANCELLED'))
    this.#peerSignerResolve = null
    this.#peerSignerReject = null
  }

  #awaitPeerTrustedSigner ({ timeout }) {
    if (this.#peerSignerReceived) return Promise.resolve(this.#peerSignerReceived)
    return new Promise((resolve, reject) => {
      this.#peerSignerTimer = maybeUnref(setTimeout(() => {
        this.#peerSignerResolve = null
        this.#peerSignerReject = null
        this.#peerSignerTimer = null
        reject(new Error('SYNC_TIMEOUT'))
      }, timeout))
      this.#peerSignerResolve = value => {
        clearTimeout(this.#peerSignerTimer)
        this.#peerSignerTimer = null
        resolve(value)
      }
      this.#peerSignerReject = error => {
        clearTimeout(this.#peerSignerTimer)
        this.#peerSignerTimer = null
        reject(error)
      }
    })
  }

  async #onRequest ({ method, params }) {
    if (method !== 'register_trusted_signer') throw new Error('method not supported on nostrpair channel')
    const peer = trustedSignerParams(params)
    this.#peerSignerReceived = peer
    this.#peerSignerResolve?.(peer)
    this.#peerSignerResolve = null
    this.#peerSignerReject = null
    return 'ack'
  }
}

// Build the self-contained objects carried in `exchange_accounts.accounts`.
// `value` is nsec1..., npub1..., or bunker://...#client_key=... where the URL
// fragment carries the per-account persistent client key. The fragment is
// local-only, so it only packages the account and its client key for transfer.
function buildSyncAccountEntries (accounts, secretEntries, { nsecFromHex, npubFromPubkey }) {
  const nsecByPubkey = new Map()
  const clientKeyByPubkey = new Map()
  for (const entry of secretEntries) {
    if (entry.type === 'nsec') nsecByPubkey.set(entry.pubkey, entry.seckey)
    else if (entry.type === 'bunker') clientKeyByPubkey.set(entry.pubkey, entry.clientKey)
  }
  const out = []
  for (const account of accounts) {
    if (account.type === 'nsec') {
      const seckey = nsecByPubkey.get(account.pubkey)
      if (!seckey) continue
      out.push({
        type: 'nsec',
        value: nsecFromHex(seckey),
        pubkey: account.pubkey,
        profile: profileForAccount(account)
      })
    } else if (account.type === 'npub') {
      out.push({
        type: 'npub',
        value: npubFromPubkey(account.pubkey),
        pubkey: account.pubkey,
        profile: profileForAccount(account)
      })
    } else if (account.type === 'bunker') {
      const clientKey = clientKeyByPubkey.get(account.pubkey)
      if (!clientKey) continue
      out.push({
        type: 'bunker',
        value: buildBunkerUrlWithClientKey(account.bunker, clientKey),
        pubkey: account.pubkey,
        profile: profileForAccount(account)
      })
    }
  }
  return out
}

function profileContent (event) {
  if (!event?.content) return {}
  try {
    const parsed = JSON.parse(event.content)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function cleanProfileField (value, maxLength) {
  const clean = typeof value === 'string' ? value.trim() : ''
  return clean.length <= maxLength ? clean : ''
}

function profileForAccount (account) {
  const profile = {}
  const content = profileContent(account.profileEvent)
  const name = cleanProfileField(account.name, PROFILE_NAME_MAX_LENGTH)
  const picture = cleanProfileField(account.picture, PROFILE_PICTURE_MAX_LENGTH)
  const contentName = cleanProfileField(content.name, PROFILE_NAME_MAX_LENGTH)
  const contentPicture = cleanProfileField(content.picture, PROFILE_PICTURE_MAX_LENGTH)
  const about = cleanProfileField(content.about, PROFILE_ABOUT_MAX_LENGTH)

  if (name || contentName) profile.name = name || contentName
  if (about) profile.about = about
  if (picture || contentPicture) profile.picture = picture || contentPicture
  return profile
}

export function buildSyncAccountPayload (accounts, secretEntries, converters) {
  return {
    accounts: buildSyncAccountEntries(accounts, secretEntries, converters)
  }
}
