import * as store from './accounts-store.js'
import * as nostr from '../helpers/nostr/index.js'
import * as secrets from './secrets.js'
import * as passkey from './passkey.js'
import * as trustedSigners from './trusted-signers.js'
import { runSecretAccountMutation } from './account-mutations.js'
import {
  fetchLatestProfile,
  fetchRelayListEvent,
  parseRelayListEvent,
  freeRelays
} from './relays.js'
import { fetchBunkerUserPubkey } from './bunker.js'
import { seededAvatarDataUrl } from './avatar.js'
import { extractBunkerClientKey } from '../helpers/nostrpair-url.js'

// Shared account-intake pipeline. Used by:
//   - components/account-add.js — user pastes/scans a single npub/nsec/bunker
//   - components/sync/sync-host.js + components/sync/sync-joiner.js —
//     commit accounts received from a paired peer
//
// Both flows funnel through `commitPrepared` so the passkey ceremony and
// the largeBlob write run back-to-back, with rollback on writeBlob failure.

// Per-intake abort token. Carries:
//   - cancelled: flag that intake steps poll between awaits
//   - cleanups:  effect-rollback fns registered by individual prepare paths
//                (e.g. close the bunker handle if cancel hits before commit)
//   - cancelPromise/cancelReject: lets the caller unblock immediately on
//                cancel via Promise.race instead of waiting for the
//                underlying RPC to time out
export function createIntakeToken () {
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

export function abortIntake (token) {
  if (!token || token.cancelled) return
  token.cancelled = true
  for (const fn of token.cleanups) {
    try { fn() } catch (err) { console.warn('intake cleanup failed', err?.message ?? err) }
  }
  token.cleanups.length = 0
  token.cancelReject?.(new Error('IMPORT_CANCELLED'))
}

export async function resolveMetadata (pubkey) {
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

// Each `prepare*` resolves the pubkey, runs the duplicate check, and fetches
// metadata + the seeded avatar, but does NOT touch the store or the secrets
// module. The returned object holds everything `commitPrepared` needs to
// apply the mutation synchronously, so the passkey + largeBlob prompts can
// fire back-to-back with no awaited work splitting them.

export async function prepareSeckey (raw) {
  const { pubkey, seckey } = nostr.keypairFromSeckey(raw)
  // A bare secret key gives strictly more capability than a bunker URL or a
  // read-only npub, so importing a seckey for a pubkey currently held as
  // either is an in-place upgrade. An existing seckey entry is a duplicate
  // — return a `skipped` marker (rather than throwing) so the sync caller
  // can still account for the pubkey when applying peer trust. The single-
  // account dispatcher converts skipped → throw so its "flash error on
  // duplicate" UI still fires.
  const existing = store.get(pubkey)
  if (existing && existing.type === 'nsec') {
    return { type: 'nsec', pubkey, skipped: true, reason: 'ACCOUNT_EXISTS' }
  }
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

export async function prepareNpub (npub) {
  const pubkey = nostr.pubkeyFromNpub(npub)
  // npub is the weakest form (read-only), so it can never overwrite an
  // existing entry — any nsec/bunker/npub at this pubkey wins.
  if (store.get(pubkey)) {
    return { type: 'npub', pubkey, skipped: true, reason: 'ACCOUNT_EXISTS' }
  }
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

export async function prepareBunker (bunkerUrlInput, token) {
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
  const cleanup = () => {
    if (committed) return
    try { bunkerHandle?.close() } catch { /* noop */ }
  }
  token?.cleanups.push(cleanup)

  try {
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
      cleanup()
      if (token) {
        const idx = token.cleanups.indexOf(cleanup)
        if (idx >= 0) token.cleanups.splice(idx, 1)
      }
      return { type: 'bunker', pubkey, skipped: true, reason: 'ACCOUNT_EXISTS' }
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
// snapshot taken just before commit, and restore local encrypted sidecars
// such as content keys and trusted signers.
//
// `options.peerSigner` is `{ pubkey, platform }` — the single device
// signer pubkey the peer announced in `register_trusted_signer`. We
// fold it into the trusted-signers write so the trust + the secrets
// land (or roll back) together.
export async function commitPrepared (prepared, options = {}) {
  const { peerSigner = null } = options
  if (!prepared.length && !peerSigner) return
  const needsSecretsPersist = prepared.some(p => p.type !== 'npub')
  // ensureRegistered if EITHER we'll write secrets (largeBlob) OR encrypt
  // the trusted-signers list (vault-key encryption).
  if (needsSecretsPersist || peerSigner) await passkey.ensureRegistered()

  // Store/trusted-signer snapshots are taken AFTER ensureRegistered so a
  // first-time registration is the baseline we'd revert to.
  const priorStoreRecords = new Map()
  for (const p of prepared) priorStoreRecords.set(p.pubkey, store.get(p.pubkey))
  const priorTrustedSignersBlob = peerSigner ? trustedSigners.snapshot() : null

  let committedCount = 0
  let trustedSignerWritten = false
  const applyPrepared = () => {
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
      committedCount++
    }
    // Trusted-signer write BEFORE the largeBlob write: bracketing both
    // inside this try/catch means the rollback can put the prior
    // ciphertext back if writeSecretsBlob below throws.
    if (peerSigner) {
      trustedSigners.add(peerSigner)
      trustedSignerWritten = true
    }
  }
  const rollbackPrepared = () => {
    for (let i = 0; i < committedCount; i++) {
      const p = prepared[i]
      const prior = priorStoreRecords.get(p.pubkey)
      try {
        if (prior) store.replace(p.pubkey, prior)
        else store.remove(p.pubkey)
      } catch { /* noop */ }
    }
    if (trustedSignerWritten) {
      try { trustedSigners.restore(priorTrustedSignersBlob) } catch (e) {
        console.warn('trusted-signers rollback failed', e?.message ?? e)
      }
    }
  }

  try {
    if (needsSecretsPersist) {
      await runSecretAccountMutation({
        operation: 'commit-prepared',
        beforeAccounts: [...priorStoreRecords.values()].filter(Boolean),
        afterAccounts: prepared.map(p => p.record).filter(Boolean),
        apply: applyPrepared,
        finalize: () => {},
        writeOptions: {}
      })
    } else {
      applyPrepared()
    }
  } catch (err) {
    if (needsSecretsPersist) {
      if (trustedSignerWritten) {
        try { trustedSigners.restore(priorTrustedSignersBlob) } catch (e) {
          console.warn('trusted-signers rollback failed', e?.message ?? e)
        }
      }
    } else {
      rollbackPrepared()
    }
    throw err
  }
}

// Dispatch a peer-sent bare key (nsec1.../npub1.../bunker://) to the
// matching prepare function. Sync flows iterate over the peer envelope's
// accounts array and call this per-entry.
export async function prepareBareKey (bareKey, token) {
  if (typeof bareKey !== 'string') throw new Error('invalid entry')
  if (bareKey.startsWith('bunker://')) return prepareBunker(bareKey, token)
  if (bareKey.startsWith('npub1')) return prepareNpub(bareKey)
  if (bareKey.startsWith('nsec1')) return prepareSeckey(bareKey)
  throw new Error(`unknown entry: ${bareKey.slice(0, 16)}…`)
}
