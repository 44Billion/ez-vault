# EZ Vault

A minimal, auditable [Nostr](https://github.com/nostr-protocol/nostr) signer that runs as a static Single Page Application on GitHub Pages.

It is designed to be embedded as an iframe by a host app launcher and talks to clients over `window.postMessage` — so the launcher and client apps never touch your private keys directly.

The project is intentionally simple: vanilla JavaScript, no bundler, and a small set of explicit browser dependencies, so that anyone can read the source and verify what it does with their keys.

Account secrets are NIP-44 encrypted under a key derived from the passkey PRF
extension. The passkey unlocks that encryption key; it does not itself hold
the account secrets. EZ Vault keeps PRF and ciphertext in separate storage
whenever the authenticator permits it: if assertions return PRF, the
authoritative ciphertext is `ez-vault:passkey:blob` in IndexedDB and no PRF
backup is kept; if PRF is available only during credential creation, its
compatibility backup is stored in IndexedDB while the ciphertext is held by
the credential's `largeBlob`. Authenticators without `largeBlob` use an
explicit compatibility mode in which both values are stored in IndexedDB.

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
sensitive request and result fields remain encrypted while at rest.

## Bunker accounts and pairing

For a bunker account, IndexedDB keeps only the account pubkey, profile data
and normalized relay URLs in cleartext. The encrypted vault record contains
the account pubkey again as its local index, the secret NIP-46 handler pubkey
and the persistent client key. A one-use `secret` from an imported pointer is
consumed during the first connection and is never persisted afterward.

Copying a bunker URL requires a fresh passkey verification. The exported URL
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
reuses an existing Pomegranate account when present; otherwise it creates a
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
