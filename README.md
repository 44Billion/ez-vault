# 46b Vault

A minimal, auditable [Nostr](https://github.com/nostr-protocol/nostr) signer that runs as a static Single Page Application on GitHub Pages.

It is designed to be embedded as an iframe by a host app launcher and talks to clients over the [NIP-46 (Nostr Connect)](https://github.com/nostr-protocol/nips/blob/master/46.md) protocol via Nostr relays — so the launcher and client apps never touch your private keys directly.

The project is intentionally simple: vanilla JavaScript, no bundler, and a single runtime dependency ([`nostr-tools`](https://github.com/nbd-wtf/nostr-tools)), so that anyone can read the source and verify what it does with their keys.

## Scripts

- `npm start` — start the local dev server
- `npm run end` — stop the local dev server
- `npm test` — run the test suite

## License

MIT
