# EZ Vault

A minimal, auditable [Nostr](https://github.com/nostr-protocol/nostr) signer that runs as a static Single Page Application on GitHub Pages.

It is designed to be embedded as an iframe by a host app launcher and talks to clients over `window.postMessage` — so the launcher and client apps never touch your private keys directly.

The project is intentionally simple: vanilla JavaScript, no bundler, and a small set of explicit browser dependencies, so that anyone can read the source and verify what it does with their keys.

Durable local state is stored in IndexedDB. Account secrets remain encrypted
under the passkey-derived vault key in the authenticator `largeBlob`, with an
encrypted IndexedDB fallback when the authenticator does not support it. The
activity log keeps at most 500 entries per app and 64 MiB globally; sensitive
request and result fields remain encrypted while at rest.

## Scripts

- `npm start` — start the local dev server
- `npm run end` — stop the local dev server
- `npm test` — run the test suite

## License

MIT
