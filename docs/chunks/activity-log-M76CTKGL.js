import {
  list,
  subscribe as subscribe3
} from "./chunk-JDLAFNFY.js";
import {
  seededAvatarDataUrl
} from "./chunk-3RWQBTGN.js";
import {
  get,
  subscribe,
  subscribe2
} from "./chunk-2IRIIQPD.js";
import {
  defineLocales,
  getLocale,
  getT,
  subscribeLocaleChanged
} from "./chunk-KYIGV7TE.js";
import {
  injectComponentStyles
} from "./chunk-3OYOWZEQ.js";
import "./chunk-NZLE2WMY.js";

// src/helpers/app-monogram.js
function getGraphemes(value) {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(value)].map((segment) => segment.segment);
  }
  return Array.from(value);
}
function getWords(value) {
  const separatedValue = value.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(void 0, { granularity: "word" }).segment(separatedValue)].filter((segment) => segment.isWordLike).map((segment) => segment.segment);
  }
  return separatedValue.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
function getAppIconMonogram(appId, appName) {
  const normalizedName = typeof appName === "string" ? appName.trim().replace(/\s+/gu, " ") : "";
  const words = normalizedName ? getWords(normalizedName) : [];
  const rawLabel = words.length > 1 ? `${getGraphemes(words[0])[0]}${getGraphemes(words.at(-1))[0]}` : getGraphemes(words[0] || "").slice(0, 2).join("");
  const label = getGraphemes(rawLabel.toUpperCase()).slice(0, 2).join("") || "\u25C8";
  const seed = String(appId || normalizedName || "app");
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return {
    label,
    paletteIndex: (hash >>> 0) % 10
  };
}

// src/components/shared/table-saw.js
var Tablesaw = class _Tablesaw extends HTMLElement {
  static dupes = {};
  constructor() {
    super();
    this.autoOffset = 50;
    this._needsStylesheet = true;
    this.attrs = {
      breakpoint: "breakpoint",
      breakpointBackwardsCompat: "media",
      type: "type",
      ratio: "ratio",
      label: "data-tablesaw-label",
      zeropad: "zero-padding",
      forceTextAlign: "text-align"
    };
    this.defaults = {
      breakpoint: "(max-width: 39.9375em)",
      // same as Filament Group’s Tablesaw
      ratio: "1fr 2fr"
    };
    this.classes = {
      wrap: "tablesaw-wrap"
    };
    this.props = {
      ratio: "--table-saw-ratio",
      bold: "--table-saw-header-bold"
    };
  }
  generateCss(breakpoint, type) {
    return `
table-saw.${this._id} {
	display: block;
	${type === "container" ? "container-type: inline-size;" : ""}
}

@${type} ${breakpoint} {
	table-saw.${this._id} thead :is(th, td) {
		position: absolute;
		height: 1px;
		width: 1px;
		overflow: hidden;
		clip: rect(1px, 1px, 1px, 1px);
	}
	table-saw.${this._id} :is(tbody, tfoot) tr {
		display: block;
	}
	table-saw.${this._id} :is(tbody, tfoot) :is(th, td):before {
		font-weight: var(${this.props.bold});
		content: attr(${this.attrs.label});
	}
	table-saw.${this._id} :is(tbody, tfoot) :is(th, td) {
		display: grid;
		gap: 0 1em;
		grid-template-columns: var(${this.props.ratio}, ${this.defaults.ratio});
	}
	table-saw.${this._id}[${this.attrs.forceTextAlign}] :is(tbody, tfoot) :is(th, td) {
		text-align: ${this.getAttribute(this.attrs.forceTextAlign) || "left"};
	}
	table-saw.${this._id}[${this.attrs.zeropad}] :is(tbody, tfoot) :is(th, td) {
		padding-left: 0;
		padding-right: 0;
	}
}`;
  }
  connectedCallback() {
    if (!("replaceSync" in CSSStyleSheet.prototype)) {
      return;
    }
    this.addHeaders();
    this.setRatio();
    if (!this._needsStylesheet) {
      return;
    }
    let sheet = new CSSStyleSheet();
    let breakpoint = this.getAttribute(this.attrs.breakpoint) || this.getAttribute(this.attrs.breakpointBackwardsCompat) || this.defaults.breakpoint;
    let type = this.getAttribute(this.attrs.type) || "media";
    this._id = `ts_${type.slice(0, 1)}${breakpoint.replace(/[^a-z0-9]/gi, "_")}`;
    this.classList.add(this._id);
    if (!_Tablesaw.dupes[this._id]) {
      let css = this.generateCss(breakpoint, type);
      sheet.replaceSync(css);
      let root = this.getRootNode();
      root.adoptedStyleSheets.push(sheet);
      if (root.host && root !== root.host.shadowRoot) {
        _Tablesaw.dupes[this._id] = true;
      }
    }
  }
  addHeaders() {
    let headerCells = this.querySelectorAll("thead th");
    let labels = Array.from(headerCells).map((cell, index) => {
      if (index === 0) {
        let styles = window.getComputedStyle(cell);
        if (styles) {
          let bold = styles.getPropertyValue("font-weight");
          this.setBold(bold);
        }
      }
      let label = cell.innerText.trim();
      if (label === "") {
        label = cell.textContent.trim();
      }
      return label;
    });
    if (labels.length === 0) {
      this._needsStylesheet = false;
      console.error("No `<th>` elements found:", this);
      return;
    }
    let cells = this.querySelectorAll("tbody :is(td, th)");
    for (let cell of cells) {
      if (!labels[cell.cellIndex]) {
        continue;
      }
      cell.setAttribute(this.attrs.label, labels[cell.cellIndex]);
      let nodeCount = 0;
      for (let n of cell.childNodes) {
        if (n.nodeType === 3 || n.nodeType === 1) {
          nodeCount++;
        }
      }
      if (nodeCount > 1) {
        let wrapper = document.createElement("div");
        wrapper.classList.add(this.classes.wrap);
        while (cell.firstChild) {
          wrapper.appendChild(cell.firstChild);
        }
        cell.appendChild(wrapper);
      }
    }
  }
  setBold(bold) {
    if (bold || bold === "") {
      this.style.setProperty(this.props.bold, bold);
    }
  }
  setRatio() {
    let ratio = this.getAttribute(this.attrs.ratio);
    if (ratio) {
      let ratioString = ratio.split("/").join("fr ") + "fr";
      this.style.setProperty(this.props.ratio, ratioString);
    }
  }
};
if ("customElements" in window) {
  window.customElements.define("table-saw", Tablesaw);
}

// src/components/activity-log.js
var DEV_MODE = window === window.top;
var activityLogLocales = defineLocales({
  "Unknown app": ["Application inconnue", "App sconosciuta", "Unbekannte App", "Aplicaci\xF3n desconocida", "App desconhecido", "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435", "\u672A\u77E5\u5E94\u7528", "\u672A\u77E5\u61C9\u7528\u7A0B\u5F0F", "\u4E0D\u660E\u306A\u30A2\u30D7\u30EA", "\uC54C \uC218 \uC5C6\uB294 \uC571"],
  Unknown: ["Inconnu", "Sconosciuto", "Unbekannt", "Desconocido", "Desconhecido", "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E", "\u672A\u77E5", "\u672A\u77E5", "\u4E0D\u660E", "\uC54C \uC218 \uC5C6\uC74C"],
  "NostrDB merge": ["Fusion NostrDB", "Unione NostrDB", "NostrDB-Zusammenf\xFChrung", "Fusi\xF3n de NostrDB", "Mesclagem do NostrDB", "\u0421\u043B\u0438\u044F\u043D\u0438\u0435 NostrDB", "NostrDB \u5408\u5E76", "NostrDB \u5408\u4F75", "NostrDB \u30DE\u30FC\u30B8", "NostrDB \uBCD1\uD569"],
  "NostrDB maintenance": ["Maintenance NostrDB", "Manutenzione NostrDB", "NostrDB-Wartung", "Mantenimiento de NostrDB", "Manuten\xE7\xE3o do NostrDB", "\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435 NostrDB", "NostrDB \u7EF4\u62A4", "NostrDB \u7DAD\u8B77", "NostrDB \u30E1\u30F3\u30C6\u30CA\u30F3\u30B9", "NostrDB \uC720\uC9C0\uAD00\uB9AC"],
  "Sign event": ["Signer l\u2019\xE9v\xE9nement", "Firma evento", "Event signieren", "Firmar evento", "Assinar evento", "\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u0442\u044C \u0441\u043E\u0431\u044B\u0442\u0438\u0435", "\u7B7E\u540D\u4E8B\u4EF6", "\u7C3D\u7F72\u4E8B\u4EF6", "\u30A4\u30D9\u30F3\u30C8\u306B\u7F72\u540D", "\uC774\uBCA4\uD2B8 \uC11C\uBA85"],
  "Sign event (kind {{kind}})": ["Signer l\u2019\xE9v\xE9nement (kind {{kind}})", "Firma evento (kind {{kind}})", "Event signieren (Kind {{kind}})", "Firmar evento (kind {{kind}})", "Assinar evento (kind {{kind}})", "\u041F\u043E\u0434\u043F\u0438\u0441\u0430\u0442\u044C \u0441\u043E\u0431\u044B\u0442\u0438\u0435 (kind {{kind}})", "\u7B7E\u540D\u4E8B\u4EF6\uFF08kind {{kind}}\uFF09", "\u7C3D\u7F72\u4E8B\u4EF6\uFF08kind {{kind}}\uFF09", "\u30A4\u30D9\u30F3\u30C8\u306B\u7F72\u540D\uFF08kind {{kind}}\uFF09", "\uC774\uBCA4\uD2B8 \uC11C\uBA85(kind {{kind}})"],
  "Double-sign event": ["Signer deux fois l\u2019\xE9v\xE9nement", "Firma doppia evento", "Event doppelt signieren", "Firmar dos veces el evento", "Assinar evento duas vezes", "\u0414\u0432\u043E\u0439\u043D\u0430\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u0441\u043E\u0431\u044B\u0442\u0438\u044F", "\u53CC\u91CD\u7B7E\u540D\u4E8B\u4EF6", "\u96D9\u91CD\u7C3D\u7F72\u4E8B\u4EF6", "\u30A4\u30D9\u30F3\u30C8\u306B\u4E8C\u91CD\u7F72\u540D", "\uC774\uBCA4\uD2B8 \uC774\uC911 \uC11C\uBA85"],
  "Double-sign event (kind {{kind}})": ["Signer deux fois l\u2019\xE9v\xE9nement (kind {{kind}})", "Firma doppia evento (kind {{kind}})", "Event doppelt signieren (Kind {{kind}})", "Firmar dos veces el evento (kind {{kind}})", "Assinar evento duas vezes (kind {{kind}})", "\u0414\u0432\u043E\u0439\u043D\u0430\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u0441\u043E\u0431\u044B\u0442\u0438\u044F (kind {{kind}})", "\u53CC\u91CD\u7B7E\u540D\u4E8B\u4EF6\uFF08kind {{kind}}\uFF09", "\u96D9\u91CD\u7C3D\u7F72\u4E8B\u4EF6\uFF08kind {{kind}}\uFF09", "\u30A4\u30D9\u30F3\u30C8\u306B\u4E8C\u91CD\u7F72\u540D\uFF08kind {{kind}}\uFF09", "\uC774\uBCA4\uD2B8 \uC774\uC911 \uC11C\uBA85(kind {{kind}})"],
  Encrypt: ["Chiffrer", "Cifra", "Verschl\xFCsseln", "Cifrar", "Criptografar", "\u0417\u0430\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u0442\u044C", "\u52A0\u5BC6", "\u52A0\u5BC6", "\u6697\u53F7\u5316", "\uC554\uD638\uD654"],
  Decrypt: ["D\xE9chiffrer", "Decifra", "Entschl\xFCsseln", "Descifrar", "Descriptografar", "\u0420\u0430\u0441\u0448\u0438\u0444\u0440\u043E\u0432\u0430\u0442\u044C", "\u89E3\u5BC6", "\u89E3\u5BC6", "\u5FA9\u53F7", "\uBCF5\uD638\uD654"],
  "No activity yet.": ["Aucune activit\xE9.", "Nessuna attivit\xE0.", "Noch keine Aktivit\xE4t.", "A\xFAn no hay actividad.", "Ainda n\xE3o h\xE1 atividade.", "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442.", "\u6682\u65E0\u6D3B\u52A8\u3002", "\u5C1A\u7121\u6D3B\u52D5\u3002", "\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002", "\uC544\uC9C1 \uD65C\uB3D9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."],
  App: ["Application", "App", "App", "Aplicaci\xF3n", "App", "\u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435", "\u5E94\u7528", "\u61C9\u7528\u7A0B\u5F0F", "\u30A2\u30D7\u30EA", "\uC571"],
  Operation: ["Op\xE9ration", "Operazione", "Vorgang", "Operaci\xF3n", "Opera\xE7\xE3o", "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F", "\u64CD\u4F5C", "\u64CD\u4F5C", "\u64CD\u4F5C", "\uC791\uC5C5"],
  Data: ["Donn\xE9es", "Dati", "Daten", "Datos", "Dados", "\u0414\u0430\u043D\u043D\u044B\u0435", "\u6570\u636E", "\u8CC7\u6599", "\u30C7\u30FC\u30BF", "\uB370\uC774\uD130"],
  Time: ["Heure", "Ora", "Zeit", "Hora", "Hora", "\u0412\u0440\u0435\u043C\u044F", "\u65F6\u95F4", "\u6642\u9593", "\u6642\u523B", "\uC2DC\uAC04"],
  failed: ["\xE9chec", "non riuscito", "fehlgeschlagen", "fallido", "falhou", "\u043E\u0448\u0438\u0431\u043A\u0430", "\u5931\u8D25", "\u5931\u6557", "\u5931\u6557", "\uC2E4\uD328"],
  "(failed)": ["(\xE9chec)", "(non riuscito)", "(fehlgeschlagen)", "(fallido)", "(falhou)", "(\u043E\u0448\u0438\u0431\u043A\u0430)", "\uFF08\u5931\u8D25\uFF09", "\uFF08\u5931\u6557\uFF09", "\uFF08\u5931\u6557\uFF09", "(\uC2E4\uD328)"],
  "(no payload)": ["(aucun contenu)", "(nessun payload)", "(keine Nutzdaten)", "(sin contenido)", "(sem conte\xFAdo)", "(\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445)", "\uFF08\u65E0\u5185\u5BB9\uFF09", "\uFF08\u7121\u5167\u5BB9\uFF09", "\uFF08\u30DA\u30A4\u30ED\u30FC\u30C9\u306A\u3057\uFF09", "(\uD398\uC774\uB85C\uB4DC \uC5C6\uC74C)"],
  Copy: ["Copier", "Copia", "Kopieren", "Copiar", "Copiar", "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C", "\u590D\u5236", "\u8907\u88FD", "\u30B3\u30D4\u30FC", "\uBCF5\uC0AC"]
});
var t = getT(activityLogLocales);
var FIXTURES_URL = new URL("../services/messenger-log/fixtures.json", import.meta.url);
var FLASH_MS = 1200;
var ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>';
var ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>';
var ICON_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6" /></svg>';
var STYLES = (
  /* css */
  `
  activity-log {
    display: block;
    padding-top: 6px;
  }
  /* When activity-log has no entries, hide the entire accordion (header
     and all) so the user isn't tempted to expand an empty panel. The
     component owns this rule rather than a parent because the empty
     state is its own state to manage. */
  accordion-panel:has(activity-log[data-empty]) {
    display: none;
  }
  activity-log .empty {
    padding: 16px 4px;
    color: var(--fg-muted);
    font-size: 13rem;
    text-align: center;
  }
  activity-log table {
    /* table-layout: fixed \u2014 without this, an unbreakable line in any cell
       (e.g. a long base64 ciphertext or a wrapped long-form note rendered
       with white-space: nowrap on the summary) overrides width: 100% and
       pushes the table past <table-saw>, which also hides the Time column
       and defeats text-overflow: ellipsis (no shorter box to clip in). */
    table-layout: fixed;
    width: 100%;
    border-collapse: collapse;
    font-size: 13rem;
    color: var(--fg-strong);
  }
  /* In stacked mode table-saw turns cells into display: grid, so the col
     widths only matter for the desktop / wide preview. */
  activity-log col.col-app { width: 25%; }
  activity-log col.col-op { width: 22%; }
  activity-log col.col-data { width: 38%; }
  activity-log col.col-time { width: 15%; }
  /* Below table-saw's default stacking breakpoint the colgroup actively
     fights the stacked grid layout (cells aren't table-cells anymore, so
     the col widths just compress everything against the left). Drop it.
     <table-saw type="container"> creates the inline-size container we
     query here. Keep this in sync with table-saw's default breakpoint. */
  @container (max-width: 39.9375em) {
    activity-log colgroup { display: none; }
    activity-log .app-cell {
      width: 100%;
      max-width: 100%;
    }
    /* zero-padding on table-saw kills horizontal cell padding when stacked,
       so the zebra goes flush to the table-saw edge without it. Put the
       horizontal breathing room on the row instead. */
    activity-log tbody tr {
      padding: 0 10px;
    }
  }
  activity-log thead th {
    overflow-wrap: break-word; /* override overflow-wrap: anywhere; from reset.css */
    text-align: left;
    padding: 6px 6px;
    font-size: 11rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
    border-bottom: 1px solid var(--border);
  }
  activity-log tbody td {
    padding: 10px 6px;
    vertical-align: top;
  }
  activity-log tbody tr {
    border-bottom: 1px solid var(--border);
  }
  /* Explicit on both odd and even so neither row falls through to the
     accordion-panel's bg (which would create an inconsistent zebra). */
  activity-log tbody tr:nth-child(odd) {
    background-color: var(--surface);
  }
  activity-log tbody tr:nth-child(even) {
    background-color: var(--surface-raised);
  }
  activity-log tbody tr:last-child {
    border-bottom: 0;
  }
  activity-log .app-cell {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  activity-log .app-icon-wrap {
    position: relative;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
  }
  activity-log .app-icon {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    overflow: hidden;
    position: relative;
  }
  activity-log .app-icon-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: none;
  }
  activity-log .app-icon[data-loaded="true"] .app-icon-image {
    display: block;
  }
  activity-log .app-icon[data-loaded="true"] .app-icon-fallback {
    display: none;
  }
  activity-log .pubkey-avatar {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: var(--surface);
    border: 1.5px solid var(--surface);
    box-shadow: 0 0 0 1px var(--accent);
    object-fit: cover;
  }
  activity-log .app-name {
    font-size: 13rem;
    color: var(--fg-strong);
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Deterministic per-app monogram palettes (theme.css --monogram-* tokens). */
  activity-log .app-icon[data-palette="0"] { background-color: var(--monogram-0-bg); color: var(--monogram-0-fg); }
  activity-log .app-icon[data-palette="1"] { background-color: var(--monogram-1-bg); color: var(--monogram-1-fg); }
  activity-log .app-icon[data-palette="2"] { background-color: var(--monogram-2-bg); color: var(--monogram-2-fg); }
  activity-log .app-icon[data-palette="3"] { background-color: var(--monogram-3-bg); color: var(--monogram-3-fg); }
  activity-log .app-icon[data-palette="4"] { background-color: var(--monogram-4-bg); color: var(--monogram-4-fg); }
  activity-log .app-icon[data-palette="5"] { background-color: var(--monogram-5-bg); color: var(--monogram-5-fg); }
  activity-log .app-icon[data-palette="6"] { background-color: var(--monogram-6-bg); color: var(--monogram-6-fg); }
  activity-log .app-icon[data-palette="7"] { background-color: var(--monogram-7-bg); color: var(--monogram-7-fg); }
  activity-log .app-icon[data-palette="8"] { background-color: var(--monogram-8-bg); color: var(--monogram-8-fg); }
  activity-log .app-icon[data-palette="9"] { background-color: var(--monogram-9-bg); color: var(--monogram-9-fg); }
  activity-log .op-method {
    display: block;
    font-weight: 600;
    color: var(--fg-strong);
  }
  activity-log .op-status {
    display: inline-block;
    margin-top: 2px;
    font-size: 11rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  activity-log .op-status[data-status="failure"] {
    color: var(--error-fg);
  }
  activity-log .op-status[data-status="success"] {
    display: none;
  }
  activity-log .data-cell details {
    display: block;
  }
  activity-log .data-cell summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    border-radius: 4px;
    color: var(--fg-strong);
    user-select: none;
  }
  activity-log .data-cell summary::-webkit-details-marker {
    display: none;
  }
  activity-log .data-cell summary:active {
    background-color: var(--surface-interactive);
    color: var(--fg-strong);
  }
  activity-log .data-cell .data-preview {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  activity-log .data-cell details[open] .data-preview {
    white-space: normal;
    word-break: break-word;
    color: var(--fg-strong);
  }
  activity-log .data-cell .data-toggle-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted);
    transition: transform 180ms ease-out;
  }
  activity-log .data-cell .data-toggle-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  activity-log .data-cell details[open] .data-toggle-icon {
    transform: rotate(180deg);
  }
  activity-log .data-cell details[open] summary {
    margin-bottom: 6px;
  }
  activity-log .data-cell .empty-data {
    color: var(--fg-faint);
    font-style: italic;
  }
  activity-log .data-full {
    margin: 0;
    background-color: var(--surface-sunken);
    border-radius: 6px;
    padding: 8px 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 280px;
    overflow: auto;
    color: var(--fg-strong);
  }
  activity-log .data-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
  }
  activity-log .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12rem;
    cursor: pointer;
    border: 0;
  }
  activity-log .copy-btn:active {
    background-color: var(--accent-hover);
  }
  activity-log .copy-btn.is-success {
    background-color: var(--success);
  }
  activity-log .copy-btn.is-error {
    background-color: var(--error);
  }
  activity-log .copy-btn .copy-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  activity-log .copy-btn .copy-btn-icon svg {
    width: 14px;
    height: 14px;
    display: block;
  }
  activity-log time {
    color: var(--fg-muted);
    font-size: 12rem;
    white-space: nowrap;
  }
`
);
async function resolvePicture(pubkey) {
  return get(pubkey)?.picture || seededAvatarDataUrl(pubkey);
}
var fixturesPromise = null;
function loadFixtures() {
  if (fixturesPromise) return fixturesPromise;
  fixturesPromise = fetch(FIXTURES_URL).then((r) => r.ok ? r.json() : []).catch((err) => {
    console.warn("activity-log: fixtures load failed", err?.message ?? err);
    return [];
  }).then((arr) => Array.isArray(arr) ? arr : []);
  return fixturesPromise;
}
function escapeHtml(s) {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function shortAppId(id) {
  const raw = String(id ?? "");
  const prefix = raw.match(/^\+{1,3}/)?.[0] ?? "";
  const cleaned = raw.replace(/^\+{1,3}/, "").trim();
  if (!cleaned) return "";
  const short = cleaned.length > 14 ? `${cleaned.slice(0, 14)}\u2026` : cleaned;
  return `${prefix}${short}`;
}
function appDisplayName(app) {
  const name = app?.name?.trim();
  if (name) return name;
  const alias = app?.alias?.trim();
  if (alias) return alias;
  return shortAppId(app?.id) || t("Unknown app");
}
function nip44v3Label(action, suffix, eventKind) {
  const translatedAction = t(action);
  return eventKind != null ? `${translatedAction} (NIP-44 v3${suffix}, kind ${eventKind})` : `${translatedAction} (NIP-44 v3${suffix})`;
}
function contextLabel(context) {
  if (context === "nostrdb_merge") return t("NostrDB merge");
  if (context === "nostrdb_maintenance") return t("NostrDB maintenance");
  return "";
}
function methodLabel(method, eventKind, _code, context) {
  let label;
  switch (method) {
    case "sign_event":
      label = eventKind != null ? t("Sign event (kind {{kind}})", { kind: eventKind }) : t("Sign event");
      break;
    case "double_sign_event":
      label = eventKind != null ? t("Double-sign event (kind {{kind}})", { kind: eventKind }) : t("Double-sign event");
      break;
    case "nip04_encrypt":
      label = `${t("Encrypt")} (NIP-04)`;
      break;
    case "nip04_decrypt":
      label = `${t("Decrypt")} (NIP-04)`;
      break;
    case "nip44_encrypt":
      label = `${t("Encrypt")} (NIP-44)`;
      break;
    case "nip44_decrypt":
      label = `${t("Decrypt")} (NIP-44)`;
      break;
    case "nip44v3_encrypt":
      label = nip44v3Label("Encrypt", "", eventKind);
      break;
    case "nip44v3_decrypt":
      label = nip44v3Label("Decrypt", "", eventKind);
      break;
    case "nip44v3_encrypt_double_dh":
      label = nip44v3Label("Encrypt", " Double-DH", eventKind);
      break;
    case "nip44v3_decrypt_double_dh":
      label = nip44v3Label("Decrypt", " Double-DH", eventKind);
      break;
    default:
      label = method ?? t("Unknown");
  }
  const suffix = contextLabel(context);
  return suffix ? `${label} \xB7 ${suffix}` : label;
}
function previewFor(entry) {
  if (entry.status === "failure") return entry.error?.message ?? t("(failed)");
  switch (entry.method) {
    case "sign_event":
    case "double_sign_event":
      return entry.params?.[0]?.content ?? "";
    case "nip04_encrypt":
    case "nip44_encrypt":
      return entry.params?.[1] ?? "";
    case "nip44v3_encrypt":
      return entry.params?.[3] ?? "";
    case "nip44v3_encrypt_double_dh":
      return entry.params?.[3] ?? "";
    case "nip04_decrypt":
    case "nip44_decrypt":
      return entry.result ?? "";
    case "nip44v3_decrypt":
      return entry.result ?? "";
    case "nip44v3_decrypt_double_dh":
      return entry.params?.[3] ?? "";
    default:
      return "";
  }
}
function relativeTime(tsSeconds) {
  if (!tsSeconds) return "";
  const now = Math.floor(Date.now() / 1e3);
  const diff = Math.max(0, now - tsSeconds);
  const relative = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
  if (diff < 60) return relative.format(-diff, "second");
  if (diff < 3600) return relative.format(-Math.floor(diff / 60), "minute");
  if (diff < 86400) return relative.format(-Math.floor(diff / 3600), "hour");
  if (diff < 86400 * 7) return relative.format(-Math.floor(diff / 86400), "day");
  return new Date(tsSeconds * 1e3).toLocaleDateString(getLocale(), { month: "short", day: "numeric" });
}
var ActivityLog = class extends HTMLElement {
  #unsub = null;
  #unsubSecrets = null;
  #unsubAccounts = null;
  #unsubLocale = null;
  #renderId = 0;
  connectedCallback() {
    injectComponentStyles("activity-log", STYLES);
    this.addEventListener("click", this.#onClick);
    this.#unsub = subscribe3(() => this.#render());
    this.#unsubSecrets = subscribe2(() => this.#render());
    this.#unsubAccounts = subscribe(() => this.#render());
    this.#unsubLocale = subscribeLocaleChanged(() => this.#render());
    this.#render();
  }
  disconnectedCallback() {
    this.removeEventListener("click", this.#onClick);
    this.#unsub?.();
    this.#unsub = null;
    this.#unsubSecrets?.();
    this.#unsubSecrets = null;
    this.#unsubAccounts?.();
    this.#unsubAccounts = null;
    this.#unsubLocale?.();
    this.#unsubLocale = null;
  }
  async #render() {
    const id = ++this.#renderId;
    let entries = await list();
    if (DEV_MODE) {
      const fixtures = await loadFixtures();
      if (id !== this.#renderId) return;
      entries = [...entries, ...fixtures].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    }
    if (id !== this.#renderId) return;
    if (entries.length === 0) {
      this.toggleAttribute("data-empty", true);
      this.replaceChildren(Object.assign(document.createElement("div"), {
        className: "empty",
        textContent: t("No activity yet.")
      }));
      return;
    }
    this.toggleAttribute("data-empty", false);
    const tableSaw = document.createElement("table-saw");
    tableSaw.setAttribute("type", "container");
    tableSaw.setAttribute("zero-padding", "");
    tableSaw.innerHTML = `
      <table>
        <colgroup>
          <col class="col-app" />
          <col class="col-op" />
          <col class="col-data" />
          <col class="col-time" />
        </colgroup>
        <thead>
          <tr><th>${t("App")}</th><th>${t("Operation")}</th><th>${t("Data")}</th><th>${t("Time")}</th></tr>
        </thead>
        <tbody>
          ${entries.map((e, i) => this.#rowHtml(e, i)).join("")}
        </tbody>
      </table>
    `;
    this.replaceChildren(tableSaw);
    this.#hydratePictures(entries);
  }
  #rowHtml(entry, idx) {
    const app = entry.app ?? {};
    const monogram = getAppIconMonogram(app.id, app.name);
    const name = appDisplayName(app);
    const op = methodLabel(entry.method, entry.eventKind, entry.code, entry.context);
    const preview = previewFor(entry);
    const fullJson = JSON.stringify(entry, null, 2);
    const status = entry.status ?? "success";
    const ts = entry.ts ?? 0;
    const rel = relativeTime(ts);
    const iso = ts ? new Date(ts * 1e3).toISOString() : "";
    const abs = ts ? new Date(ts * 1e3).toLocaleString(getLocale()) : "";
    const summaryInner = preview ? escapeHtml(preview) : `<span class="empty-data">${t("(no payload)")}</span>`;
    return `
      <tr data-row="${idx}">
        <td>
          <div class="app-cell">
            <div class="app-icon-wrap" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}">
              <div class="app-icon" data-loaded="false" data-palette="${monogram.paletteIndex}">
                <img class="app-icon-image" alt="" />
                <span class="app-icon-fallback">${escapeHtml(monogram.label)}</span>
              </div>
              <img class="pubkey-avatar" alt="" />
            </div>
            <span class="app-name">${escapeHtml(name)}</span>
          </div>
        </td>
        <td>
          <span class="op-method">${escapeHtml(op)}</span>
          <span class="op-status" data-status="${escapeHtml(status)}">${t("failed")}</span>
        </td>
        <td class="data-cell">
          <details>
            <summary>
              <span class="data-preview">${summaryInner}</span>
              <span class="data-toggle-icon" aria-hidden="true">${ICON_CHEVRON}</span>
            </summary>
            <pre class="data-full">${escapeHtml(fullJson)}</pre>
            <div class="data-actions">
              <button type="button" class="copy-btn" data-action="copy">
                <span class="copy-btn-icon">${ICON_COPY}</span>
                <span>${t("Copy")}</span>
              </button>
            </div>
          </details>
        </td>
        <td>
          <time datetime="${escapeHtml(iso)}" title="${escapeHtml(abs)}">${escapeHtml(rel)}</time>
        </td>
      </tr>
    `;
  }
  #hydratePictures(entries) {
    const wraps = this.querySelectorAll(".app-icon-wrap");
    wraps.forEach((wrap, i) => {
      const entry = entries[i];
      if (!entry) return;
      const app = entry.app ?? {};
      const iconBox = wrap.querySelector(".app-icon");
      const iconImg = wrap.querySelector(".app-icon-image");
      const iconUrl = app.icon?.url ?? "";
      if (iconBox && iconImg && iconUrl) {
        iconImg.onload = () => {
          if (iconImg.isConnected) iconBox.dataset.loaded = "true";
        };
        iconImg.onerror = () => {
        };
        iconImg.src = iconUrl;
      }
      const pubkeyImg = wrap.querySelector(".pubkey-avatar");
      if (pubkeyImg && entry.pubkey) {
        resolvePicture(entry.pubkey).then((url) => {
          if (pubkeyImg.isConnected && url) pubkeyImg.src = url;
        });
      }
    });
  }
  #onClick = async (e) => {
    const btn = e.target.closest('button[data-action="copy"]');
    if (!btn || btn.disabled) return;
    const pre = btn.closest("details")?.querySelector(".data-full");
    if (!pre) return;
    btn.disabled = true;
    try {
      await navigator.clipboard.writeText(pre.textContent ?? "");
      this.#flash(btn, ICON_CHECK, "is-success");
    } catch (err) {
      console.error("activity-log copy failed", err);
      this.#flash(btn, ICON_COPY, "is-error");
    }
  };
  #flash(btn, glyphHtml, cls) {
    const icon = btn.querySelector(".copy-btn-icon");
    const prev = icon?.innerHTML;
    if (icon) icon.innerHTML = glyphHtml;
    btn.classList.add(cls);
    setTimeout(() => {
      btn.classList.remove(cls);
      if (icon && prev != null) icon.innerHTML = prev;
      btn.disabled = false;
    }, FLASH_MS);
  }
};
customElements.define("activity-log", ActivityLog);
export {
  ActivityLog,
  activityLogLocales
};
