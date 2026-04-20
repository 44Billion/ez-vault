# AGENTS.md

This document is the primary brief for AI assistants working on this repository. Read it in full before making changes.

## Project Overview

This project is a **Nostr signer** implemented as a Single Page Application. It is designed to be loaded inside an `<iframe>` by a host **app launcher** (the parent window), and it hosts the user's Nostr private keys (`nsec`) so that the launcher and any client apps never touch them directly.

Because the signer custodies private keys, the overriding design principle is **auditability**: any reasonably-experienced developer should be able to read the source and convince themselves it is safe. Without that trust, no one will store their `nsec` with us.

## Core Constraints

- **Vanilla JavaScript.** No framework, no TypeScript, no transpilation.
- **No bundler, no build step.** The browser loads source files exactly as they appear in `docs/`.
- **One runtime dependency: [`nostr-tools`](https://github.com/nbd-wtf/nostr-tools).** Everything else is standard Web APIs. Do not add new runtime dependencies without explicit approval.
- **Small, readable surface area.** Prefer straightforward code over clever abstractions — the code is the documentation for our security claims.

## Hosting & Entry Point

- The SPA is served by **GitHub Pages** from the `docs/` folder. That is why `index.html` lives at `docs/index.html` (not at the repo root).
- `docs/index.html` is the only HTML file. It loads `docs/index.js` as a module, which then imports everything else.
- `docs/index.html` must stay minimal:
  - A `<link>` tag per CSS file (currently `styles/reset.css` and `styles/global.css` — there is no `icons.css` yet).
  - An `importmap` that **only aliases `nostr-tools`** to `https://esm.sh/nostr-tools` (and its `nostr-tools/` subpath). We do **not** use the importmap to rename local modules — local imports use relative paths.
  - A final `<script type="module">` that imports `./index.js`.

## Communication Model

Unlike a traditional `window.postMessage` iframe signer, this vault does **not** talk to the parent window directly. Instead, it uses the [NIP-46 (Nostr Connect)](https://github.com/nostr-protocol/nips/blob/master/46.md) protocol, specifically the **["Direct connection initiated by the client"](https://github.com/nostr-protocol/nips/blob/master/46.md#direct-connection-initiated-by-the-client)** flow:

- The client (app launcher) initiates the connection.
- Requests and responses travel as Nostr events through **Nostr relays**.
- The vault publishes/subscribes on those relays to receive signing requests and return signed results.

When implementing or modifying signer behavior, follow the NIP-46 spec linked above as the source of truth.

## Layout & UX Shape

The vault is always embedded in a **vertical drawer that slides in from the right** of the host page. Design every screen around that shape:

- **Tall, narrow, one-column by default.** Think "vertical strip", not "page".
- **On portrait-mode mobile** the drawer takes most of the viewport width.
- **On landscape or desktop** the drawer stays roughly the same narrow width — it does **not** expand to fill extra horizontal space. Do not design desktop-specific wide layouts.
- **Two columns only when genuinely useful.** The main example is dense item lists (e.g. an avatar list for live accounts, two per row). Everything else is one column stacked vertically.
- **Configuration uses accordions, not pages.** Each config section is a collapsible accordion panel on the same screen. This keeps every setting one tap away.
- **No client-side router.** The SPA is effectively always on `/` — there are no route transitions to design for. State lives in the DOM (open accordion, selected account, etc.), not in the URL path.
- **Query-string parameters on the iframe `src` are allowed** for the initial handshake / configuration passed in by the launcher. Read them from `location.search` at startup; do not mutate them afterwards.

When in doubt about a layout decision, ask: "does this still work as a tall vertical strip?" If the answer is no, the design is wrong for this app.

## Key Storage

For now, `nsec` values are stored **in plain text in `localStorage`**. This is a deliberate, simple starting point — no passkeys, no WebAuthn PRF extension, no encryption-at-rest, and no IndexedDB. Keep this simple until we explicitly decide to upgrade it.

- Do **not** introduce IndexedDB.
- Do **not** introduce passkey / WebAuthn flows.
- If you touch key storage, preserve the plain-text-localStorage model unless the user explicitly asks you to change it.

## Folder Structure

```
/ (repo root)
├── docs/                 # GitHub Pages root — everything the browser loads
│   ├── index.html        # Single entry point
│   ├── index.js          # Module entry — imports components / helpers / services
│   ├── components/       # Custom Elements (Web Components)
│   ├── helpers/          # Pure helper functions (e.g. string.js → string helpers)
│   ├── services/         # Service classes, singletons, or method-bag objects
│   │                     # encapsulating a specific feature area
│   └── styles/           # CSS (reset.css, global.css, plus feature stylesheets)
├── tests/                # Automated tests run with the Node built-in test runner
├── server.py             # Local dev server
└── package.json          # npm scripts: `start` (dev server), `end` (kill server),
                          #   `test` (node --test)
```

Development-only tooling and scripts live **outside** `docs/` so they are never served to the browser.

### Where new code goes

- **Custom element?** → `docs/components/`
- **Pure function (string/array/date/etc. util)?** → `docs/helpers/`
- **Feature logic, API client, stateful singleton, or a bag of related methods?** → `docs/services/`
- **Styling?** → `docs/styles/` — either extend an existing file or add a new one and link it from `index.html`.

## Styling Rules

The CSS reset in [`docs/styles/reset.css`](docs/styles/reset.css) sets `html { font-size: 0.0625em }` so that `1rem ≈ 1px`. This is a deliberate trick with two consequences:

1. **Use `rem` for `font-size` only.** For example, write `font-size: 16rem;` where you would normally write `font-size: 16px;`. This keeps the text responsive to the user's browser-level font-size zoom (an accessibility feature we care about).
2. **Use `px` for everything else** — `width`, `height`, `padding`, `margin`, `border-width`, etc. Do not assume the usual "1rem = 16px" outside of `font-size`.

Other style conventions:

- **Dark mode is the baseline.** Only author dark-theme colors. Light mode is produced automatically via a `filter: invert(1) hue-rotate(180deg)` rule in [`docs/styles/global.css`](docs/styles/global.css) — do not add a parallel light-mode palette.
- **Loading indicators:** prefer the existing `.pulsate` animation defined in `global.css`. The typical pattern is: on click, `disabled` the button and add the `pulsate` class while the async work runs; remove both on completion. Reach for spinners only when pulsate is genuinely unsuitable.

## JavaScript Module Conventions

- Import local modules with **relative paths** (`./`, `../`). The importmap is reserved for `nostr-tools` aliasing.
- Keep `docs/index.js` as the single SPA entry. It wires up components and kicks off any needed service initialization.
- Custom elements (Web Components) are the default UI primitive. Register them from their file in `docs/components/` and use them declaratively in markup.

## Testing & Local Development

- **Run tests:** `npm test` (executes `node --test 'tests/**/*.test.js'`).
- **Start dev server:** `npm start` (runs `server.py`).
- **Stop dev server:** `npm run end`.
- Add new automated tests under `tests/` using Node's built-in test runner — no extra framework.
- Small manual-check scripts and other developer-facing files may live at the repo root (outside `docs/`) so they are not shipped to GitHub Pages.

## Security Mindset (Read Before Every Change)

Because this app holds users' Nostr private keys, every change should be evaluated against these questions:

1. Does this add a new runtime dependency or network origin? (Default answer: no.)
2. Does this make the code harder to audit by a careful human reader?
3. Does this enlarge the attack surface around `nsec` storage, reading, or transport?
4. Does this bypass or weaken the NIP-46 boundary?

If the answer to any of these is "yes", the change needs an explicit justification and should be discussed with the user before proceeding.
