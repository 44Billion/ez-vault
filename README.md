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

## Scripts

- `npm start` — start the local dev server
- `npm run end` — stop the local dev server
- `npm test` — run the test suite

## License

MIT
