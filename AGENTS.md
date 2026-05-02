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

The vault is am iframe signer that talks to the parent window (app launcher) directly using `window.postMessage`. An app requests a permission to the app launcher that, if granted, talks to the vault on behalf of the app.

## Nostr Relays & Event Discovery (NIP-65)

Not all relays are equal. We distinguish two relay roles:

- **Seed relays** — a small, well-known list of indexer-style relays that reliably hold users' [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md) relay-list events (kind `10002`). We use seed relays **only** to discover which relays a given user actually publishes to. They are not a general broadcast target.
- **Free relays** — a short fallback list of open write-accepting relays. We use them:
  - as the initial write-relay set for a brand-new account (picked as the `write` tags in the account's first kind:10002 event), and
  - as a fallback when we cannot find or reach a user's own write relays.

### Discovering a user's write relays (NIP-65)

To fetch *any* user-authored event (e.g. kind:0 profile, kind:30023 long-form, etc.):

1. Query kind:10002 for `authors: [pubkey]` from **seed relays**.
2. Pick the event with the highest `created_at` across whichever relays responded.
3. Parse its `r` tags — the entries without a marker or tagged `write` are the user's write relays.
4. Fetch the user-authored event from those write relays. If no write relays were found (or the lookup failed), fall back to the free-relay list.

### Account bootstrap (when creating a new account)

1. Pick the first two entries from the free-relay list as the initial write set.
2. Sign a kind:10002 event tagging those two URLs as both read and write.
3. **Publish kind:10002 to the seed relays.** This is what makes the account discoverable via NIP-65.
4. Sign the kind:0 profile event.
5. **Publish kind:0 to the user's write relays** (the two free relays chosen in step 1).
6. Only persist the account locally if both publishes succeed.

### Multi-relay fetch timing

When querying multiple relays for the same filter, do not wait for every relay to EOSE or time out:

- Collect events as they arrive from any relay.
- **As soon as the first relay sends EOSE, start a 500ms grace timer.** When it fires, close all subscriptions and return the best event collected so far (typically the one with the highest `created_at`).
- Keep an outer hard timeout (~5s) as a safety net in case no relay ever EOSEs.

This 500ms-after-first-EOSE pattern is the default for every multi-relay read in this codebase. Re-use the shared helper in [`docs/services/relays.js`](docs/services/relays.js) rather than reimplementing it.

## Layout & UX Shape

The vault is always embedded in a **vertical drawer that slides in from the right** of the host page. Design every screen around that shape:

- **Tall, narrow, one-column by default.** Think "vertical strip", not "page".
- **On portrait-mode mobile** the drawer takes most of the viewport width.
- **On landscape or desktop** the drawer stays roughly the same narrow width — it does **not** expand to fill extra horizontal space. Do not design desktop-specific wide layouts.
- **Columns scale with item size, not with the viewport.** For grids of small items (e.g. account avatars) use `grid-template-columns: repeat(auto-fill, minmax(<min-item-size>, 1fr))` so the drawer naturally fits 3 columns of small items, 2 of medium items, and 1 of large items. Do **not** hard-code a fixed column count.
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

### Services that grow auxiliary files

A service typically lives in a single file (e.g. `docs/services/foo.js`). When a service grows enough that it wants to ship alongside auxiliary files (fixtures, JSON data, helper modules used only by that service), promote it to its own folder:

```
docs/services/foo/
├── index.js        # the public entry — same exports as the old foo.js
├── fixtures.json   # auxiliary data, only loaded when needed
└── ...             # additional internal modules, each kept small
```

Importers should write `from './services/foo/index.js'`. Keep the index file as the only public surface — internal modules are not imported from outside the folder. See `docs/services/messenger-log/` for the canonical example.

## Styling Rules

The CSS reset in [`docs/styles/reset.css`](docs/styles/reset.css) sets `html { font-size: 0.0625em }` so that `1rem ≈ 1px`. This is a deliberate trick with two consequences:

1. **Use `rem` for `font-size` only.** For example, write `font-size: 16rem;` where you would normally write `font-size: 16px;`. This keeps the text responsive to the user's browser-level font-size zoom (an accessibility feature we care about).
2. **Use `px` for everything else** — `width`, `height`, `padding`, `margin`, `border-width`, etc. Do not assume the usual "1rem = 16px" outside of `font-size`.

Other style conventions:

- **Dark mode is the baseline.** Only author dark-theme colors. Light mode is produced automatically via a `filter: invert(1) hue-rotate(180deg)` rule in [`docs/styles/global.css`](docs/styles/global.css) — do not add a parallel light-mode palette.
- **Loading indicators:** prefer the existing `.pulsate` animation defined in `global.css`. The typical pattern is: on click, `disabled` the button and add the `pulsate` class while the async work runs; remove both on completion. Reach for spinners only when pulsate is genuinely unsuitable.
  - When the button has its own background color (e.g. a colored pill wrapping an icon), apply `.pulsate` to the inner icon/label element rather than the button itself — animating opacity on the whole button makes the background go transparent, which looks wrong. Wrap the glyph in a dedicated inner element so you have something to target.
- **Icons:** use [Tabler outline icons](https://github.com/tabler/tabler-icons/tree/main/icons/outline). Icons already copied into the project live under [`icons/`](icons/); grab any missing icon from the Tabler repo and drop the `.svg` in there. Inline the SVG markup directly in the template (HTML or JS template literal) so `stroke="currentColor"` inherits the host text color — loading via `<img src>` isolates the SVG from CSS and breaks theming.
- **Prefer `:active` over `:hover`.** This app is primarily used on touch devices where hover does not exist (and, when it does, it fires on tap-and-hold, which is a poor UX). Style the *pressed* state on `:active` so mobile users get visible feedback. Only add `:hover` when there is a specific desktop affordance worth highlighting — never as the sole feedback mechanism.

### Component-scoped styles

Page-level and cross-component styles live under `docs/styles/` (`reset.css`, `global.css`, `index.css`). Styles that only concern a single Web Component should live **inside that component's `.js` file** so the component is self-contained.

Pattern (using light DOM — we deliberately avoid Shadow DOM so the global filter-invert light-mode trick and the `1rem = 1px` font-size trick keep working):

```js
import { injectComponentStyles } from '../helpers/dom.js'

const STYLES = /* css */`
  account-avatar { /* ... tag-prefixed to avoid collisions ... */ }
  account-avatar .avatar-btn { /* ... */ }
`

export class AccountAvatar extends HTMLElement {
  connectedCallback () {
    injectComponentStyles('account-avatar', STYLES)
    // ...
  }
}
```

Rules for component CSS:

- **Always prefix selectors with the component's tag name** (e.g. `account-avatar .avatar-btn`). The styles live in the global stylesheet scope, so the tag prefix is the scoping mechanism.
- **Use `injectComponentStyles(id, css)`** from [`docs/helpers/dom.js`](docs/helpers/dom.js). It is idempotent — safe to call from every `connectedCallback`.
- **Tag the template literal with a leading `/* css */` comment** so editors / extensions that opt into tag-based highlighting syntax-highlight the CSS inside. Same idea applies to any HTML template literal (`/* html */`).
- Keep tokens that need to be shared across components (colors, spacing scale) in `global.css` and consume them via CSS custom properties.

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
