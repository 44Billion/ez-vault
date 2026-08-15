# EZ Vault

A minimal, auditable [Nostr](https://github.com/nostr-protocol/nostr) signer that runs as a static Single Page Application on GitHub Pages.

It is designed to be embedded as an iframe by a host app launcher and talks to clients over `window.postMessage` — so the launcher and client apps never touch your private keys directly.

The project is intentionally simple: vanilla JavaScript, no bundler, and a small set of explicit browser dependencies, so that anyone can read the source and verify what it does with their keys.

## Hosting and deploy coherence (GitHub Pages)

The vault is served from the committed `docs/` directory on GitHub Pages
(`https://44billion.github.io/ez-vault`). GitHub Pages serves every file with
`Cache-Control: max-age=600` and does not support custom headers, so a reload
shortly after a deploy can pair a stale `index.html` with chunk URLs that no
longer exist — a 404 inside the module graph leaves a blank page while the
CSS still paints.

Three mechanisms keep this self-healing:

- `bin/build.js` inlines `src/sw-bootstrap.js` into `index.html`, so the
  deployed page registers the service worker before `app.js` loads, with
  `updateViaCache: 'none'`. Once it controls the page, network-first
  revalidation (with a `Cache-Control: no-cache` request header) bypasses the
  10-minute browser cache for `index.html`/`app.js`, and hashed chunks are
  immutable URLs.
- `bin/build.js` also inlines `src/boot-failsafe.js` and
  `src/boot-failsafe.css` into `index.html`; the deployed page ships a small
  boot failsafe: if `#vault` is not revealed within 12s it logs the failure
  and reloads once per session; if that also fails it shows a manual reload
  overlay instead of a blank page. A successful boot re-arms the automatic
  attempt. The authored HTML stays minimal — these blocks are kept as build
  markers so the deployed page remains fully self-contained.
- The launcher (44billion) independently times out `VAULT_READY`, reloads the
  iframe once, and offers a manual retry dialog when the vault stays
  unreachable or never signals ready.

The vault is also served by the 44billion server at `vault.44billion.net`,
which sends proper cache headers; GitHub Pages remains the default host.

Account secrets are normally NIP-44 encrypted under a key derived from the
passkey PRF extension. The passkey unlocks that encryption key; it does not
itself hold the account secrets. EZ Vault keeps PRF and ciphertext in separate storage
whenever the authenticator permits it: if assertions return PRF, the
authoritative ciphertext is `ez-vault:passkey:blob` in IndexedDB and no PRF
backup is kept; if PRF is available only during credential creation, its
compatibility backup is stored in IndexedDB while the ciphertext is held by
the credential's `largeBlob`. Authenticators without `largeBlob` use an
explicit compatibility mode in which both values are stored in IndexedDB.

When no passkey exists and registration is unavailable or refused, the user
may explicitly continue in an unprotected local mode. The vault still uses
the same ciphertext formats, but its random 32-byte key is stored beside them
at `ez-vault:passkey:local-key`. Anyone able to copy the site's IndexedDB can
therefore recover every secret; this is cryptographically equivalent to
plaintext storage. User-initiated account creation/import and trusted-device
creation retry passkey registration; copying or removing an existing account,
and removing a trusted device, do not retry registration while the vault
remains local. Destructive local removals use a textual browser confirmation.
Once a passkey exists, deliberate secret copying, account removal and
trusted-device removal require a fresh assertion instead. A successful retry
reciphers the vault blob, content
keys, trusted signers and sealed activity-log fields under PRF before deleting
the local key. `ez-vault:passkey:upgrade-pending` makes an interrupted upgrade
recoverable, but the staged credential must then be used to finish it. Manual
locking also requires this promotion: a local-only vault cannot meaningfully
be locked while its key remains beside its ciphertext. If passkey creation is
cancelled or unsupported, the vault stays open and unlocked.
Closing either passkey/local choice with Escape or a backdrop click selects
local mode; explicit page teardown still cancels without changing storage.

The unlocked main view provides a floating Lock action. For an already
protected vault it clears vault keys, account signers, content keys and bunker
handles from memory without another WebAuthn ceremony. It then publishes the
locked account snapshot to the launcher before requesting that the launcher
close the vault drawer. A close acknowledgement failure never restores those
secrets to memory.

Pairing (`nostrpair://`) is the supported recovery and cross-device transfer
mechanism. WebAuthn does not give a relying party a way to prohibit vendor
credential sync: `residentKey`, the returned `rk` property, backup eligibility
(`BE`) and backup state (`BS`) are distinct signals, not a no-sync control.
After every registration, EZ Vault immediately probes the new credential with
a `get()` assertion using `userVerification: 'discouraged'`, before writing
any creation-time PRF to IndexedDB. If that assertion returns the same PRF,
the creation-time output is never stored. Otherwise the compatibility backup
is retained and the ciphertext destination is selected from the credential's
reported `largeBlob` support. A later assertion that returns and validates the
same PRF promotes the credential permanently to the IndexedDB-ciphertext mode;
any old `largeBlob` copy is then erased best-effort on a later assertion.
Cancellation or refusal of a normal `largeBlob` write leaves the newer
ciphertext in IndexedDB as an authoritative fallback until it can be synced.
Pairing is required if a credential promoted this way later stops returning
PRF.

Registration orders WebAuthn `hints` as current device, hybrid authentication
through a phone, then a physical security key, but it does not require a
platform authenticator. This fallback is required on systems such as desktop
Linux where the browser may report no user-verifying platform authenticator.
The browser controls how prominently each choice is displayed. EZ Vault
persists the transports reported by the created credential so later assertions
do not accidentally restrict it to the `internal` transport; credentials
created by older platform-only releases keep their legacy `internal` hint.

The activity log keeps at most 500 entries per app and 64 MiB globally;
sensitive request and result fields use the same encrypted-at-rest envelope.
In explicit local mode its key is stored beside it, so that envelope provides
no protection to anyone who can read the site's IndexedDB.

## Bunker accounts and pairing

For a bunker account, IndexedDB keeps only the account pubkey, profile data
and normalized relay URLs in cleartext. The encrypted vault record contains
the account pubkey again as its local index, the secret NIP-46 handler pubkey
and the persistent client key. A one-use `secret` from an imported pointer is
consumed during the first connection and is never persisted afterward.

Copying a bunker URL requires a fresh passkey verification when the vault is
passkey-backed. In the explicitly unprotected local mode, copying does not
create a passkey or add a verification prompt. The exported URL
contains `#client_key=<64 hex>` so a restored or paired device reuses the same
NIP-46 client identity. The fragment is removed before the pointer is sent to
the bunker. Pairing uses that same self-contained form. Older 64-byte bunker
records remain readable; their handler is taken from the old public account
record and moved into the encrypted 96-byte record on the next successful
normal secrets write. Relay changes remain public metadata and do not trigger
a vault reseal or another WebAuthn ceremony.

## Continue with Google

The optional Google flow is intentionally fixed to the Pomegranate Central at
`https://auth.njump.me`. OAuth is intermediated by that service, so users trust
it to authenticate the correct Google account and mint its signed short-lived
token. EZ Vault keeps that token and the verified e-mail only in memory. It
closes its Google login popup and cancels the shared operation if no response
arrives within 10 minutes, so a hidden or forgotten window cannot leave the UI
busy indefinitely. Because OAuth returns after the initiating click's WebAuthn
activation has expired, an unprotected vault then presents an explicit second
step: creating a passkey is the recommended action, while continuing in local
mode remains a secondary choice. Escape or a backdrop click also selects local
mode. The passkey click invokes WebAuthn
directly; no account/profile creation or bunker connection happens before that
choice is settled. An existing passkey bypasses this step. The flow then reuses
an existing Pomegranate account when present; otherwise it creates a
FROST 2-of-4 account using these fixed operators:

- `https://po.coracle.social`
- `https://po.f7z.io`
- `https://po.jumble.social`
- `https://po.njump.me`

The generated nsec exists only during setup and is split locally with the
pinned `@fiatjaf/promenade-trusted-dealer` implementation. Each operator gets
one shard and any two operators can jointly sign; consequently, compromise or
collusion of two operators can compromise the account, while losing three
operators makes it unavailable. Partial network failure can leave an
incomplete remote registration which the Central/operators must reconcile.
Only a newly registered account is bootstrapped on Nostr: EZ Vault assigns a
local neutral avatar and generated name, publishes its kind `10002` relay list
to the seed relays, then publishes its kind `0` profile to the selected write
relays before persisting the bunker account locally. An account already
returned by the Central is imported unchanged and does not cause either event
to be republished.
The selected `default` profile is imported as an ordinary bunker account and
must report the same account pubkey as `/account`.

Pomegranate avatar fallback also runs locally. Existing account flows retain
DiceBear Avataaars, while this flow uses Avataaars Neutral after trying a Nostr
profile picture and an existing local picture.

## Scripts

- `npm start` — start the local dev server
- `npm run end` — stop the local dev server
- `npm test` — run the test suite

## License

MIT
