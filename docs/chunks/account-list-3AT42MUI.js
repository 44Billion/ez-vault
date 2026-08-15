import "./chunk-ST3ZU4TV.js";
import "./chunk-OQVZFKQZ.js";
import "./chunk-FOVB2KVB.js";
import "./chunk-JEDTY7MQ.js";
import "./chunk-T4D3IXL3.js";
import "./chunk-3RWQBTGN.js";
import {
  filterVisibleAccounts,
  subscribePendingMutations
} from "./chunk-MKIFRTGJ.js";
import "./chunk-YIXC4UXQ.js";
import {
  list,
  subscribe
} from "./chunk-NHHPGB6R.js";
import "./chunk-BDYCOPAX.js";
import "./chunk-KYIGV7TE.js";
import {
  injectComponentStyles
} from "./chunk-3OYOWZEQ.js";
import "./chunk-NZLE2WMY.js";

// src/components/account-list.js
var STYLES = (
  /* css */
  `
  account-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 100px));
    justify-content: start;
    row-gap: 27px;
    align-content: start;
  }
  /* A lone tile starts at the inline edge. With multiple visible tiles,
     distribute the free space equally before, between, and after them. The
     second selector includes a visible creating tile; the first deliberately
     ignores creating tiles because selection mode hides them below. */
  account-list:has(> account-avatar:not([mode="creating"]) ~ account-avatar:not([mode="creating"])),
  account-list:not([mode="selecting"]):has(> account-avatar ~ account-avatar) {
    justify-content: space-evenly;
  }
  /* Hide in-progress create tiles while a selection panel is open \u2014 selecting
     drafts that don't have a pubkey yet is meaningless. */
  account-list[mode="selecting"] account-avatar[mode="creating"] {
    display: none;
  }
`
);
var AccountList = class extends HTMLElement {
  #unsub;
  #unsubPending;
  #observer = null;
  #selected = /* @__PURE__ */ new Set();
  #wasCreating = false;
  // Wired by index.js. The create flow has no dedicated panel — it's an
  // inline tile in this list — so the list itself manages the toolbar
  // state: greys out `toolbarButtons` and flips `createButton` to
  // .is-active while a `[mode="creating"]` tile exists.
  toolbarButtons = [];
  createButton = null;
  connectedCallback() {
    injectComponentStyles("account-list", STYLES);
    this.#render();
    this.#unsub = subscribe(() => this.#render());
    this.#unsubPending = subscribePendingMutations(() => this.#render());
    this.addEventListener("click", this.#onClick);
    this.#observer = new MutationObserver(() => this.#syncCreateActive());
    this.#observer.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["mode"]
    });
  }
  disconnectedCallback() {
    this.#unsub?.();
    this.#unsubPending?.();
    this.#unsubPending = null;
    this.removeEventListener("click", this.#onClick);
    this.#observer?.disconnect();
    this.#observer = null;
  }
  startCreate() {
    if (this.querySelector('account-avatar[mode="creating"]')) return;
    const tile = document.createElement("account-avatar");
    tile.setAttribute("mode", "creating");
    this.prepend(tile);
    this.#syncCreateActive();
  }
  #syncCreateActive() {
    const creating = !!this.querySelector('account-avatar[mode="creating"]');
    if (creating === this.#wasCreating) return;
    this.#wasCreating = creating;
    for (const btn of this.toolbarButtons) {
      if (btn) btn.disabled = creating;
    }
    this.createButton?.classList.toggle("is-active", creating);
  }
  // Enter selection mode for a sync flow. Every existing account starts
  // selected; the user can deselect individuals with a tap. Used by both
  // sync-host (Device 1) and sync-joiner (Device 2) — neither side has any
  // exporting / importing semantics anymore, just "which accounts to send".
  enterSelectionMode() {
    this.setAttribute("mode", "selecting");
    this.#selected = new Set(list().map((a) => a.pubkey));
    this.#applySelectionAttrs();
  }
  exitSelectionMode() {
    this.removeAttribute("mode");
    this.#selected.clear();
    this.#applySelectionAttrs();
  }
  isSelecting() {
    return this.getAttribute("mode") === "selecting";
  }
  getSelectedPubkeys() {
    return [...this.#selected];
  }
  #onClick = (e) => {
    if (!this.isSelecting()) return;
    if (e.target.closest("button")) return;
    const tile = e.target.closest("account-avatar[pubkey]");
    if (!tile || !this.contains(tile)) return;
    const pk = tile.getAttribute("pubkey");
    if (!pk) return;
    if (this.#selected.has(pk)) this.#selected.delete(pk);
    else this.#selected.add(pk);
    this.#applySelectionAttrs();
  };
  #applySelectionAttrs() {
    const selecting = this.isSelecting();
    for (const tile of this.querySelectorAll("account-avatar[pubkey]")) {
      tile.toggleAttribute("selecting", selecting);
      const pk = tile.getAttribute("pubkey");
      tile.toggleAttribute("selected", selecting && this.#selected.has(pk));
    }
  }
  #render() {
    const accounts = filterVisibleAccounts(list());
    const accountPubkeys = new Set(accounts.map((a) => a.pubkey));
    const existing = /* @__PURE__ */ new Map();
    for (const tile of this.querySelectorAll('account-avatar[pubkey]:not([mode="creating"])')) {
      existing.set(tile.getAttribute("pubkey"), tile);
    }
    for (const [pk, tile] of existing) {
      if (!accountPubkeys.has(pk)) tile.remove();
      else tile.refresh?.();
    }
    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];
      if (existing.has(acc.pubkey)) continue;
      const tile = document.createElement("account-avatar");
      tile.setAttribute("mode", "normal");
      tile.setAttribute("pubkey", acc.pubkey);
      let nextTile = null;
      for (let j = i + 1; j < accounts.length; j++) {
        const sibling = existing.get(accounts[j].pubkey);
        if (sibling) {
          nextTile = sibling;
          break;
        }
      }
      if (nextTile) this.insertBefore(tile, nextTile);
      else this.appendChild(tile);
    }
    if (this.isSelecting()) {
      for (const acc of accounts) this.#selected.add(acc.pubkey);
      this.#applySelectionAttrs();
    }
  }
};
customElements.define("account-list", AccountList);
export {
  AccountList
};
