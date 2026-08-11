import {
  get as get2,
  subscribe
} from "./chunk-OQVZFKQZ.js";
import {
  claimSigner
} from "./chunk-47TWQHYT.js";
import {
  runSecretAccountMutation
} from "./chunk-FQWZBX36.js";
import {
  ensureRegistered,
  openSecrets
} from "./chunk-A4OBQLFD.js";
import {
  error
} from "./chunk-BDYCOPAX.js";
import {
  removeForPubkey
} from "./chunk-SDOMGLPX.js";
import {
  seededAvatarDataUrl
} from "./chunk-4RHK4XWQ.js";
import {
  add,
  applyRecords,
  deleteSecret,
  freeRelays,
  generateKeypair,
  get,
  npubFromPubkey,
  nsecFromHex,
  profileEventTemplate,
  relayPool,
  remove,
  resolveWriteRelays,
  seedRelays,
  setNsecSecret,
  signProfileEvent,
  signRelayListEvent,
  update
} from "./chunk-GUYFWDAK.js";
import {
  defineLocales,
  getT,
  subscribeLocaleChanged
} from "./chunk-KYIGV7TE.js";
import {
  injectComponentStyles,
  waitForFocus
} from "./chunk-3OYOWZEQ.js";

// src/services/account-names.js
var ACCOUNT_NAME_COLORS = Object.freeze([
  "Crimson",
  "Azure",
  "Emerald",
  "Golden",
  "Silver",
  "Coral",
  "Violet",
  "Jade",
  "Amber",
  "Sapphire",
  "Ruby",
  "Onyx",
  "Pearl",
  "Cobalt",
  "Scarlet",
  "Ivory",
  "Magenta",
  "Indigo",
  "Bronze",
  "Turquoise",
  "Copper",
  "Lavender",
  "Chartreuse",
  "Vermillion",
  "Teal",
  "Ochre",
  "Plum",
  "Slate",
  "Aqua",
  "Maroon",
  "Olive",
  "Burgundy",
  "Tangerine",
  "Mint",
  "Navy",
  "Champagne",
  "Salmon",
  "Forest",
  "Citrine",
  "Pewter",
  "Flamingo",
  "Cerulean",
  "Saffron",
  "Amethyst",
  "Topaz",
  "Garnet",
  "Platinum",
  "Orchid",
  "Peach",
  "Rose"
]);
var ACCOUNT_NAME_NATURE = Object.freeze([
  "Glacier",
  "Ember",
  "Cascade",
  "Fjord",
  "River",
  "Mountain",
  "Forest",
  "Ocean",
  "Desert",
  "Meadow",
  "Canyon",
  "Valley",
  "Aurora",
  "Thunder",
  "Lightning",
  "Breeze",
  "Storm",
  "Mist",
  "Frost",
  "Dew",
  "Sunrise",
  "Sunset",
  "Horizon",
  "Tundra",
  "Savanna",
  "Prairie",
  "Lagoon",
  "Delta",
  "Cliff",
  "Ridge",
  "Summit",
  "Peak",
  "Grove",
  "Glade",
  "Brook",
  "Spring",
  "Rapids",
  "Tide",
  "Wave",
  "Coral",
  "Kelp",
  "Moss",
  "Fern",
  "Willow",
  "Cedar",
  "Birch",
  "Sequoia",
  "Bamboo",
  "Crystal",
  "Quartz"
]);
function randomInt(max) {
  return Math.floor(Math.random() * max);
}
function accountNameAt(index) {
  const color = ACCOUNT_NAME_COLORS[Math.floor(index / ACCOUNT_NAME_NATURE.length)];
  const nature = ACCOUNT_NAME_NATURE[index % ACCOUNT_NAME_NATURE.length];
  return `${color} ${nature}`;
}
function randomAccountName(previous = "") {
  const total = ACCOUNT_NAME_COLORS.length * ACCOUNT_NAME_NATURE.length;
  let previousIndex = -1;
  for (let i = 0; i < total; i++) {
    if (accountNameAt(i) === previous) {
      previousIndex = i;
      break;
    }
  }
  if (previousIndex === -1) return accountNameAt(randomInt(total));
  const nextIndex = randomInt(total - 1);
  return accountNameAt(nextIndex >= previousIndex ? nextIndex + 1 : nextIndex);
}

// src/components/account-avatar.js
var MODE = { CREATING: "creating", NORMAL: "normal", EDITING: "editing" };
var FLASH_MS = 1200;
var accountAvatarLocales = defineLocales({
  Cancel: ["Annuler", "Annulla", "Abbrechen", "Cancelar", "Cancelar", "\u041E\u0442\u043C\u0435\u043D\u0430", "\u53D6\u6D88", "\u53D6\u6D88", "\u30AD\u30E3\u30F3\u30BB\u30EB", "\uCDE8\uC18C"],
  "Remove account": ["Supprimer le compte", "Rimuovi account", "Konto entfernen", "Eliminar cuenta", "Remover conta", "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0443\u0447\u0451\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C", "\u79FB\u9664\u8D26\u6237", "\u79FB\u9664\u5E33\u6236", "\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u524A\u9664", "\uACC4\uC815 \uC0AD\uC81C"],
  "Change image and name": ["Changer l\u2019image et le nom", "Cambia immagine e nome", "Bild und Namen \xE4ndern", "Cambiar imagen y nombre", "Alterar imagem e nome", "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0438 \u0438\u043C\u044F", "\u66F4\u6539\u56FE\u7247\u548C\u540D\u79F0", "\u8B8A\u66F4\u5716\u7247\u548C\u540D\u7A31", "\u753B\u50CF\u3068\u540D\u524D\u3092\u5909\u66F4", "\uC774\uBBF8\uC9C0\uC640 \uC774\uB984 \uBCC0\uACBD"],
  Edit: ["Modifier", "Modifica", "Bearbeiten", "Editar", "Editar", "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C", "\u7F16\u8F91", "\u7DE8\u8F2F", "\u7DE8\u96C6", "\uD3B8\uC9D1"],
  "Read-only account": ["Compte en lecture seule", "Account di sola lettura", "Schreibgesch\xFCtztes Konto", "Cuenta de solo lectura", "Conta somente leitura", "\u0423\u0447\u0451\u0442\u043D\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0447\u0442\u0435\u043D\u0438\u044F", "\u53EA\u8BFB\u8D26\u6237", "\u552F\u8B80\u5E33\u6236", "\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u30A2\u30AB\u30A6\u30F3\u30C8", "\uC77D\uAE30 \uC804\uC6A9 \uACC4\uC815"],
  "read-only": ["lecture seule", "sola lettura", "schreibgesch\xFCtzt", "solo lectura", "somente leitura", "\u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0442\u0435\u043D\u0438\u0435", "\u53EA\u8BFB", "\u552F\u8B80", "\u8AAD\u307F\u53D6\u308A\u5C02\u7528", "\uC77D\uAE30 \uC804\uC6A9"],
  Close: ["Fermer", "Chiudi", "Schlie\xDFen", "Cerrar", "Fechar", "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", "\u5173\u95ED", "\u95DC\u9589", "\u9589\u3058\u308B", "\uB2EB\uAE30"],
  "Copy nsec": ["Copier le nsec", "Copia nsec", "nsec kopieren", "Copiar nsec", "Copiar nsec", "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C nsec", "\u590D\u5236 nsec", "\u8907\u88FD nsec", "nsec \u3092\u30B3\u30D4\u30FC", "nsec \uBCF5\uC0AC"],
  "Copy bunker URL": ["Copier l\u2019URL bunker", "Copia URL bunker", "Bunker-URL kopieren", "Copiar URL bunker", "Copiar URL bunker", "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C URL bunker", "\u590D\u5236 bunker URL", "\u8907\u88FD bunker URL", "bunker URL \u3092\u30B3\u30D4\u30FC", "bunker URL \uBCF5\uC0AC"],
  Save: ["Enregistrer", "Salva", "Speichern", "Guardar", "Salvar", "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C", "\u4FDD\u5B58", "\u5132\u5B58", "\u4FDD\u5B58", "\uC800\uC7A5"],
  "Copy npub": ["Copier le npub", "Copia npub", "npub kopieren", "Copiar npub", "Copiar npub", "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C npub", "\u590D\u5236 npub", "\u8907\u88FD npub", "npub \u3092\u30B3\u30D4\u30FC", "npub \uBCF5\uC0AC"],
  "Could not create account": ["Impossible de cr\xE9er le compte", "Impossibile creare l\u2019account", "Konto konnte nicht erstellt werden", "No se pudo crear la cuenta", "N\xE3o foi poss\xEDvel criar a conta", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0443\u0447\u0451\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C", "\u65E0\u6CD5\u521B\u5EFA\u8D26\u6237", "\u7121\u6CD5\u5EFA\u7ACB\u5E33\u6236", "\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u4F5C\u6210\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F", "\uACC4\uC815\uC744 \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"],
  "Account name": ["Nom du compte", "Nome account", "Kontoname", "Nombre de la cuenta", "Nome da conta", "\u0418\u043C\u044F \u0443\u0447\u0451\u0442\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438", "\u8D26\u6237\u540D\u79F0", "\u5E33\u6236\u540D\u7A31", "\u30A2\u30AB\u30A6\u30F3\u30C8\u540D", "\uACC4\uC815 \uC774\uB984"],
  unnamed: ["sans nom", "senza nome", "unbenannt", "sin nombre", "sem nome", "\u0431\u0435\u0437 \u0438\u043C\u0435\u043D\u0438", "\u672A\u547D\u540D", "\u672A\u547D\u540D", "\u540D\u524D\u306A\u3057", "\uC774\uB984 \uC5C6\uC74C"],
  "Name update failed": ["\xC9chec de la mise \xE0 jour du nom", "Aggiornamento del nome non riuscito", "Namens\xE4nderung fehlgeschlagen", "No se pudo actualizar el nombre", "Falha ao atualizar o nome", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0438\u043C\u044F", "\u540D\u79F0\u66F4\u65B0\u5931\u8D25", "\u540D\u7A31\u66F4\u65B0\u5931\u6557", "\u540D\u524D\u306E\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "\uC774\uB984 \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328"],
  "Authentication failed": ["\xC9chec de l\u2019authentification", "Autenticazione non riuscita", "Authentifizierung fehlgeschlagen", "Error de autenticaci\xF3n", "Falha na autentica\xE7\xE3o", "\u041E\u0448\u0438\u0431\u043A\u0430 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u0438", "\u8EAB\u4EFD\u9A8C\u8BC1\u5931\u8D25", "\u9A57\u8B49\u5931\u6557", "\u8A8D\u8A3C\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "\uC778\uC99D \uC2E4\uD328"],
  "Delete failed": ["\xC9chec de la suppression", "Eliminazione non riuscita", "L\xF6schen fehlgeschlagen", "No se pudo eliminar", "Falha ao excluir", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0443\u0434\u0430\u043B\u0438\u0442\u044C", "\u5220\u9664\u5931\u8D25", "\u522A\u9664\u5931\u6557", "\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "\uC0AD\uC81C \uC2E4\uD328"]
});
var t = getT(accountAvatarLocales);
var ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>';
var ICON_REFRESH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>';
var ICON_PENCIL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" /><path d="M13.5 6.5l4 4" /></svg>';
var ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>';
var ICON_KEY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0" /><path d="M15 9h.01" /></svg>';
var ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>';
var ICON_COPY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" /><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" /></svg>';
var ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" /><path d="M12 16h.01" /></svg>';
var ICON_USER_FILLED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 1 1 -5 5l.005 -.217a5 5 0 0 1 4.995 -4.783z" /><path d="M14 14a5 5 0 0 1 5 5v1a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-1a5 5 0 0 1 5 -5h4z" /></svg>';
var STYLES = (
  /* css */
  `
  account-avatar {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    background-color: var(--surface);
    max-width: 100px;
    justify-self: center;
  }
  account-avatar .avatar-image {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
  account-avatar .avatar-fallback {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-fg);
  }
  account-avatar .avatar-fallback svg {
    width: 70%;
    height: 70%;
    display: block;
  }
  account-avatar .avatar-image[data-loaded="true"] + .avatar-fallback {
    display: none;
  }
  account-avatar .avatar-error-overlay {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background-color: oklch(from var(--error) l c h / 0.5);
    border: 2px solid var(--error);
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  account-avatar[data-error] .avatar-error-overlay {
    display: flex;
  }
  account-avatar .avatar-error-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--error-fg);
  }
  account-avatar .avatar-error-icon svg {
    width: 50%;
    height: 50%;
    display: block;
  }
  account-avatar .avatar-btn {
    position: absolute;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: none;
    align-items: center;
    justify-content: center;
    background-color: oklch(from var(--surface) l c h / 0.88);
    color: var(--fg-strong);
    font-size: 13rem;
    line-height: 1;
    box-shadow: 0 0 0 2px var(--accent);
    z-index: 2;
  }
  account-avatar .avatar-btn:active {
    background-color: oklch(from var(--accent-hover) l c h / 0.9);
  }
  account-avatar .avatar-btn.at-top-left { top: -4px; left: -4px; }
  account-avatar .avatar-btn.at-top-center {
    top: -13px;
    left: 50%;
    transform: translateX(-50%);
  }
  account-avatar .avatar-btn.at-top-right { top: -4px; right: -4px; }
  account-avatar .avatar-btn.at-middle-left {
    top: 50%;
    left: -14px;
    transform: translateY(-50%);
  }
  account-avatar .avatar-btn.at-middle-right {
    top: 50%;
    right: -14px;
    transform: translateY(-50%);
  }
  account-avatar .avatar-btn.at-primary {
    background-color: oklch(from var(--success) l c h / 0.88);
    color: var(--fg-on-accent);
  }
  account-avatar .avatar-btn.at-primary:active {
    background-color: oklch(from var(--success-active) l c h / 0.92);
  }
  account-avatar[mode="creating"] .avatar-btn[data-action="cancel-create"],
  account-avatar[mode="creating"] .avatar-btn[data-action="cycle"],
  account-avatar[mode="creating"] .avatar-btn[data-action="save"],
  account-avatar[mode="normal"] .avatar-btn[data-action="edit"],
  account-avatar[mode="editing"] .avatar-btn[data-action="delete"],
  account-avatar[mode="editing"] .avatar-btn[data-action="cancel-edit"],
  account-avatar[mode="editing"]:not([data-type="npub"]) .avatar-btn[data-action="copy-nsec"],
  account-avatar[mode="editing"] .avatar-btn[data-action="copy-npub"] {
    display: inline-flex;
  }
  account-avatar .avatar-readonly-label {
    position: absolute;
    top: -4px;
    left: -4px;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    height: 18px;
    border-radius: 9999px;
    background-color: oklch(from var(--surface) l c h / 0.82);
    color: var(--fg-strong);
    font-size: 9rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    box-shadow: 0 0 0 2px var(--accent);
    pointer-events: none;
    z-index: 2;
  }
  account-avatar[mode="normal"][data-type="npub"] .avatar-readonly-label {
    display: inline-flex;
  }
  account-avatar .avatar-name-field {
    position: absolute;
    left: 50%;
    bottom: -5px;
    transform: translateX(-50%);
    width: auto;
    min-width: calc(100% - 8px);
    max-width: calc(100% + 14px);
    height: 18px;
    border: 0;
    border-radius: 9999px;
    padding: 0 8px;
    box-sizing: border-box;
    background-color: oklch(from var(--surface) l c h / 0.82);
    color: var(--fg-strong);
    font-size: 12rem;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 18px;
    text-align: center;
    text-transform: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 0 0 2px var(--accent);
    outline: none;
    z-index: 1;
  }
  account-avatar .avatar-name-field:focus {
    box-shadow: 0 0 0 2px var(--success);
  }
  account-avatar .avatar-name-field::placeholder {
    color: oklch(from var(--fg) l c h / 0.72);
    opacity: 1;
  }
  account-avatar .avatar-name-field[readonly],
  account-avatar .avatar-name-field:disabled {
    cursor: default;
    opacity: 1;
    -webkit-text-fill-color: currentColor;
  }
  account-avatar[mode="normal"] .avatar-name-field,
  account-avatar[mode="editing"][data-type="npub"] .avatar-name-field {
    caret-color: transparent;
    pointer-events: none;
  }
  account-avatar .avatar-name-field.is-success {
    box-shadow: 0 0 0 2px var(--success);
  }
  account-avatar .avatar-name-field.is-error {
    box-shadow: 0 0 0 2px var(--error);
  }
  account-avatar .avatar-btn.is-success {
    background-color: oklch(from var(--success) l c h / 0.88);
    color: var(--fg-on-accent);
  }
  account-avatar .avatar-btn.is-error {
    background-color: oklch(from var(--error) l c h / 0.88);
    color: var(--fg-on-accent);
  }
  account-avatar .avatar-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  account-avatar .avatar-btn-icon svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  /* Sync-selection: parent list flips the [selecting] attribute on each
     tile. We hide all per-tile controls (so the avatar acts as one big
     toggle target), dim un-selected tiles, and overlay a check on selected
     ones. The list owns selection state and click handling. */
  account-avatar[selecting] .avatar-btn,
  account-avatar[selecting] .avatar-readonly-label,
  account-avatar[selecting] .avatar-name-field {
    display: none !important;
  }
  account-avatar[selecting] {
    cursor: pointer;
    transition: opacity 120ms ease-out;
  }
  account-avatar[selecting]:not([selected]) {
    opacity: 0.35;
  }
  account-avatar .avatar-select-overlay {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    display: none;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 4px;
    pointer-events: none;
    z-index: 2;
  }
  account-avatar[selecting][selected] .avatar-select-overlay {
    display: flex;
  }
  account-avatar .avatar-select-badge {
    width: 22px;
    height: 22px;
    border-radius: 0;
    background-color: var(--accent);
    color: var(--fg-on-accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 2px var(--accent);
  }
  account-avatar .avatar-select-badge svg {
    width: 16px;
    height: 16px;
    display: block;
  }
`
);
var TEMPLATE = `
  <div class="avatar-image" aria-hidden="true"></div>
  <div class="avatar-fallback" aria-hidden="true">${ICON_USER_FILLED}</div>
  <div class="avatar-error-overlay" aria-hidden="true"><span class="avatar-error-icon">${ICON_ALERT}</span></div>
  <button class="avatar-btn at-top-left" data-action="cancel-create" title="Cancel" type="button"><span class="avatar-btn-icon">${ICON_TRASH}</span></button>
  <button class="avatar-btn at-top-left" data-action="delete" title="Remove account" type="button"><span class="avatar-btn-icon">${ICON_TRASH}</span></button>
  <button class="avatar-btn at-top-center" data-action="cycle" title="Change image and name" type="button"><span class="avatar-btn-icon">${ICON_REFRESH}</span></button>
  <button class="avatar-btn at-top-right" data-action="edit" title="Edit" type="button"><span class="avatar-btn-icon">${ICON_PENCIL}</span></button>
  <span class="avatar-readonly-label" aria-label="Read-only account">read-only</span>
  <button class="avatar-btn at-top-right" data-action="cancel-edit" title="Close" type="button"><span class="avatar-btn-icon">${ICON_X}</span></button>
  <button class="avatar-btn at-middle-left" data-action="copy-nsec" title="Copy nsec" type="button"><span class="avatar-btn-icon">${ICON_KEY}</span></button>
  <button class="avatar-btn at-top-right at-primary" data-action="save" title="Save" type="button"><span class="avatar-btn-icon">${ICON_CHECK}</span></button>
  <button class="avatar-btn at-middle-right" data-action="copy-npub" title="Copy npub" type="button"><span class="avatar-btn-icon">${ICON_COPY}</span></button>
  <input class="avatar-name-field" type="text" aria-label="Account name" placeholder="unnamed" spellcheck="false" autocorrect="off" autocapitalize="none" />
  <span class="avatar-select-overlay" aria-hidden="true"><span class="avatar-select-badge">${ICON_CHECK}</span></span>
`;
var AccountAvatar = class extends HTMLElement {
  #mode;
  #draft = null;
  #account = null;
  #image;
  #nameField;
  #savingName = false;
  #savingAccount = false;
  #nameFlashTimer = null;
  #flashTimers = /* @__PURE__ */ new Map();
  #flashLabels = /* @__PURE__ */ new Map();
  #unsubStatus = null;
  #unsubLocale = null;
  #pictureRenderId = 0;
  connectedCallback() {
    injectComponentStyles("account-avatar", STYLES);
    this.#mode = this.getAttribute("mode") || MODE.NORMAL;
    this.innerHTML = TEMPLATE;
    this.#image = this.querySelector(".avatar-image");
    this.#nameField = this.querySelector(".avatar-name-field");
    this.addEventListener("click", this.#onClick);
    this.#nameField?.addEventListener("input", this.#onNameInput);
    this.#nameField?.addEventListener("change", this.#onNameChange);
    this.#nameField?.addEventListener("keydown", this.#onNameKeydown);
    this.#applyMode();
    if (this.#mode === MODE.CREATING) {
      this.#cycleSeed();
    } else {
      this.#account = get(this.getAttribute("pubkey"));
      if (!this.#account) {
        this.remove();
        return;
      }
      this.#applyAccountType();
      this.#renderPicture(this.#account.picture, this.#account.pubkey);
      this.#updateCopyKeyButton();
      this.#syncNameField();
    }
    this.#refreshStatus();
    this.#translate();
    this.#unsubLocale = subscribeLocaleChanged(() => this.#translate());
    this.#unsubStatus = subscribe((pubkey) => {
      if (pubkey === this.getAttribute("pubkey")) this.#refreshStatus();
    });
  }
  #refreshStatus() {
    const pk = this.getAttribute("pubkey");
    const st = pk ? get2(pk) : null;
    this.toggleAttribute("data-error", !!st?.error);
  }
  disconnectedCallback() {
    this.#pictureRenderId++;
    this.removeEventListener("click", this.#onClick);
    this.#nameField?.removeEventListener("input", this.#onNameInput);
    this.#nameField?.removeEventListener("change", this.#onNameChange);
    this.#nameField?.removeEventListener("keydown", this.#onNameKeydown);
    this.#unsubStatus?.();
    this.#unsubStatus = null;
    this.#unsubLocale?.();
    this.#unsubLocale = null;
    clearTimeout(this.#nameFlashTimer);
    this.#nameFlashTimer = null;
    for (const id of this.#flashTimers.values()) clearTimeout(id);
    this.#flashTimers.clear();
    this.#flashLabels.clear();
  }
  refresh() {
    if (this.#mode === MODE.CREATING) return;
    const acc = get(this.getAttribute("pubkey"));
    if (!acc) {
      this.remove();
      return;
    }
    const picChanged = acc.picture !== this.#account?.picture;
    const typeChanged = acc.type !== this.#account?.type;
    const nameChanged = acc.name !== this.#account?.name;
    this.#account = acc;
    if (typeChanged) this.#applyAccountType();
    if (picChanged) this.#renderPicture(acc.picture, acc.pubkey);
    if (typeChanged) this.#updateCopyKeyButton();
    if (nameChanged || typeChanged) this.#syncNameField();
  }
  #applyAccountType() {
    const type = this.#account?.type;
    if (type) this.setAttribute("data-type", type);
    else this.removeAttribute("data-type");
  }
  #updateCopyKeyButton() {
    const btn = this.querySelector('button[data-action="copy-nsec"]');
    if (!btn) return;
    btn.title = this.#account?.type === "bunker" ? t("Copy bunker URL") : t("Copy nsec");
  }
  #currentName() {
    if (this.#mode === MODE.CREATING) return this.#draft?.name || "";
    return this.#account?.name || "";
  }
  #canEditName() {
    if (this.#mode === MODE.CREATING) return true;
    return this.#mode === MODE.EDITING && this.#account?.type !== "npub";
  }
  #syncNameField() {
    const field = this.#nameField;
    if (!field) return;
    const canEdit = this.#canEditName();
    const canRefreshValue = !this.#savingName && (document.activeElement !== field || !canEdit);
    if (canRefreshValue) field.value = this.#currentName();
    this.#syncNameFieldWidth();
    field.readOnly = !canEdit;
    field.disabled = this.#savingName || this.#savingAccount || this.#mode === MODE.EDITING && this.#account?.type === "npub";
    field.tabIndex = canEdit && !this.#savingAccount ? 0 : -1;
  }
  #setAccountSaving(saving) {
    this.#savingAccount = saving;
    if (saving) this.setAttribute("aria-busy", "true");
    else this.removeAttribute("aria-busy");
    for (const action of ["cancel-create", "cycle", "save"]) {
      const btn = this.querySelector(`button[data-action="${action}"]`);
      if (btn) btn.disabled = saving;
    }
    this.#syncNameField();
  }
  #syncNameFieldWidth() {
    if (!this.#nameField) return;
    this.#nameField.size = Math.max(1, this.#nameField.value.length, this.#nameField.placeholder.length);
  }
  #readNameValue() {
    return this.#nameField?.value.trim() || "";
  }
  #onNameInput = () => {
    this.#syncNameFieldWidth();
    if (this.#mode !== MODE.CREATING || !this.#draft) return;
    this.#draft.name = this.#nameField.value;
  };
  #onNameChange = () => {
    if (this.#mode === MODE.CREATING && this.#draft) {
      this.#draft.name = this.#readNameValue();
      this.#syncNameField();
      return;
    }
    if (this.#mode === MODE.EDITING) this.#saveName();
  };
  #onNameKeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      this.#nameField?.blur();
    } else if (e.key === "Escape" && this.#mode === MODE.EDITING) {
      e.preventDefault();
      this.#nameField.value = this.#currentName();
      this.#nameField.blur();
    }
  };
  async #saveName() {
    const account = get(this.#account?.pubkey) || this.#account;
    if (!account || account.type === "npub") return this.#syncNameField();
    const name = this.#readNameValue();
    if (name === (account.name || "")) {
      this.#nameField.value = name;
      return;
    }
    this.#savingName = true;
    this.#nameField.classList.add("pulsate");
    this.#syncNameField();
    try {
      const profileEvent = await claimSigner(account).signEvent(profileEventTemplate({
        name,
        picture: account.picture,
        profileEvent: account.profileEvent
      }));
      const writeRelays = account.writeRelays?.length ? account.writeRelays : await resolveWriteRelays(account.pubkey);
      const profilePublish = await relayPool.sendEvent(profileEvent, writeRelays);
      if (!profilePublish.success) throw new Error("PROFILE_PUBLISH_FAILED");
      const patch = { name, profileEvent, writeRelays };
      await update(account.pubkey, patch);
      this.#account = { ...account, ...patch };
      this.#nameField.value = name;
      this.#flashNameStatus("is-success");
    } catch (err) {
      console.error(err);
      this.#nameField.value = account.name || "";
      this.#flashNameStatus("is-error");
      error(t("Name update failed"));
    } finally {
      this.#savingName = false;
      this.#nameField.classList.remove("pulsate");
      this.#syncNameField();
    }
  }
  #flashNameStatus(cls) {
    clearTimeout(this.#nameFlashTimer);
    this.#nameField.classList.remove("is-success", "is-error");
    this.#nameField.classList.add(cls);
    this.#nameFlashTimer = setTimeout(() => {
      this.#nameField?.classList.remove("is-success", "is-error");
      this.#nameFlashTimer = null;
    }, FLASH_MS);
  }
  async #copyKey(btn) {
    const acc = this.#account;
    if (!acc) return this.#flashError(btn);
    if (acc.type === "bunker") return this.#copy(btn, acc.bunker);
    if (acc.type !== "nsec") return this.#flashError(btn);
    const icon = btn.querySelector(".avatar-btn-icon");
    btn.disabled = true;
    icon?.classList.add("pulsate");
    try {
      const entries = await openSecrets();
      const entry = entries.find((e) => e.type === "nsec" && e.pubkey === acc.pubkey);
      if (!entry?.seckey) return this.#flashError(btn);
      return this.#copy(btn, nsecFromHex(entry.seckey));
    } catch (err) {
      console.warn("copy-nsec auth failed", err?.message ?? err);
      error(t("Authentication failed"));
      this.#flashError(btn);
    } finally {
      btn.disabled = false;
      icon?.classList.remove("pulsate");
    }
  }
  #onClick = (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    switch (action) {
      case "cycle":
        return this.#cycleSeed();
      case "cancel-create":
        return this.remove();
      case "save":
        return this.#save(btn);
      case "edit":
        return this.#setMode(MODE.EDITING);
      case "cancel-edit":
        return this.#setMode(MODE.NORMAL);
      case "delete":
        return this.#deleteAccount(btn);
      case "copy-nsec":
        return this.#copyKey(btn);
      case "copy-npub":
        return this.#copy(btn, npubFromPubkey(this.#account?.pubkey));
    }
  };
  #setMode(mode) {
    this.#mode = mode;
    this.#applyMode();
  }
  #applyMode() {
    this.setAttribute("mode", this.#mode);
    this.#syncNameField();
  }
  async #cycleSeed() {
    const cycleBtn = this.querySelector('button[data-action="cycle"]');
    const icon = cycleBtn?.querySelector(".avatar-btn-icon");
    if (cycleBtn) {
      cycleBtn.disabled = true;
      icon?.classList.add("pulsate");
    }
    try {
      const kp = generateKeypair();
      const picture = await seededAvatarDataUrl(kp.pubkey);
      const name = randomAccountName(this.#currentName());
      this.#draft = { ...kp, picture, name };
      this.#syncNameField();
      await this.#renderPicture(picture);
    } finally {
      if (cycleBtn) {
        cycleBtn.disabled = false;
        icon?.classList.remove("pulsate");
      }
    }
  }
  async #renderPicture(url, seedKey) {
    const renderId = ++this.#pictureRenderId;
    const image = this.#image;
    image.dataset.loaded = "false";
    if (!url && seedKey) url = await seededAvatarDataUrl(seedKey);
    if (renderId !== this.#pictureRenderId || image !== this.#image || !this.isConnected) return;
    if (!url) {
      image.style.backgroundImage = "";
      return;
    }
    try {
      await this.#probeImage(url);
      if (renderId !== this.#pictureRenderId || image !== this.#image || !this.isConnected) return;
      image.style.backgroundImage = `url(${JSON.stringify(url)})`;
      image.dataset.loaded = "true";
    } catch {
      if (renderId !== this.#pictureRenderId || image !== this.#image || !this.isConnected) return;
      if (!seedKey) {
        image.style.backgroundImage = "";
        image.dataset.loaded = "false";
        return;
      }
      const fallback = await seededAvatarDataUrl(seedKey);
      if (renderId !== this.#pictureRenderId || image !== this.#image || !this.isConnected) return;
      image.style.backgroundImage = `url(${JSON.stringify(fallback)})`;
      image.dataset.loaded = "true";
    }
  }
  #probeImage(url) {
    return new Promise((resolve, reject) => {
      const probe = new Image();
      probe.onload = () => resolve();
      probe.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
      probe.src = url;
    });
  }
  async #save(btn) {
    if (!this.#draft) return;
    const draft = this.#draft;
    const icon = btn.querySelector(".avatar-btn-icon");
    this.#setAccountSaving(true);
    icon?.classList.add("pulsate");
    try {
      const writeRelays = freeRelays.slice(0, 2);
      const name = this.#readNameValue();
      const relayListEvent = signRelayListEvent({
        secretKey: draft.secretKey,
        writeRelays,
        readRelays: writeRelays
      });
      const profileEvent = signProfileEvent({
        secretKey: draft.secretKey,
        name,
        picture: draft.picture
      });
      const relayListPublish = await relayPool.sendEvent(relayListEvent, seedRelays);
      if (!relayListPublish.success) throw new Error("RELAY_LIST_PUBLISH_FAILED");
      const profilePublish = await relayPool.sendEvent(profileEvent, writeRelays);
      if (!profilePublish.success) throw new Error("PROFILE_PUBLISH_FAILED");
      await ensureRegistered();
      const record = {
        type: "nsec",
        pubkey: draft.pubkey,
        picture: draft.picture,
        name,
        profileEvent,
        relayListEvent,
        writeRelays
      };
      const newSeckey = draft.seckey;
      await runSecretAccountMutation({
        operation: "create-account",
        beforeAccounts: [],
        afterAccounts: [record],
        apply: async () => {
          await add(record);
          await setNsecSecret(record.pubkey, newSeckey);
        },
        finalize: () => {
          this.#draft = null;
          this.#account = record;
          this.setAttribute("pubkey", record.pubkey);
          this.#applyAccountType();
          this.#updateCopyKeyButton();
          this.#setMode(MODE.NORMAL);
        }
      });
    } catch (err) {
      console.error(err);
      error(t("Could not create account"), err?.message ?? "");
      if (!this.#draft && draft) {
        this.#draft = draft;
        this.#account = null;
        this.removeAttribute("pubkey");
        this.#applyAccountType();
        this.#setMode(MODE.CREATING);
        this.#renderPicture(draft.picture);
      }
      this.#flashError(btn);
    } finally {
      this.#setAccountSaving(false);
      icon?.classList.remove("pulsate");
    }
  }
  async #deleteAccount(btn) {
    if (!this.#account) return;
    const account = this.#account;
    const pubkey = this.#account.pubkey;
    const wasNonReadOnly = this.#account.type !== "npub";
    if (wasNonReadOnly) {
      const icon = btn?.querySelector(".avatar-btn-icon");
      if (btn) btn.disabled = true;
      icon?.classList.add("pulsate");
      try {
        await runSecretAccountMutation({
          operation: "delete-account",
          beforeAccounts: [account],
          afterAccounts: [],
          apply: () => deleteSecret(pubkey),
          finalize: async () => {
            await removeForPubkey(pubkey);
            await applyRecords([pubkey], []);
          }
        });
      } catch (err) {
        console.warn("failed to update vault blob after delete", err?.message ?? err);
        error(t("Delete failed"));
        this.#flashError(btn);
        return;
      } finally {
        if (btn) btn.disabled = false;
        icon?.classList.remove("pulsate");
      }
      return;
    }
    await removeForPubkey(pubkey);
    await remove(pubkey);
  }
  async #copy(btn, value) {
    if (!value) return this.#flashError(btn);
    try {
      await waitForFocus();
      await navigator.clipboard.writeText(value);
      this.#flashSuccess(btn);
    } catch (err) {
      console.error(err);
      this.#flashError(btn);
    }
  }
  #flashSuccess(btn) {
    this.#flash(btn, ICON_CHECK, "is-success");
  }
  #flashError(btn) {
    this.#flash(btn, ICON_X, "is-error");
  }
  #flash(btn, glyphHtml, cls) {
    const prev = this.#flashTimers.get(btn);
    if (prev) {
      clearTimeout(prev);
      this.#restoreFlash(btn);
    }
    const icon = btn.querySelector(".avatar-btn-icon");
    if (!icon) return;
    this.#flashLabels.set(btn, icon.innerHTML);
    icon.innerHTML = glyphHtml;
    btn.classList.add(cls);
    const id = setTimeout(() => this.#restoreFlash(btn), FLASH_MS);
    this.#flashTimers.set(btn, id);
  }
  #restoreFlash(btn) {
    const icon = btn.querySelector(".avatar-btn-icon");
    const prev = this.#flashLabels.get(btn);
    if (icon && prev != null) {
      icon.innerHTML = prev;
      this.#flashLabels.delete(btn);
    }
    btn.classList.remove("is-success", "is-error");
    this.#flashTimers.delete(btn);
  }
  #translate() {
    const titles = {
      "cancel-create": "Cancel",
      delete: "Remove account",
      cycle: "Change image and name",
      edit: "Edit",
      "cancel-edit": "Close",
      save: "Save",
      "copy-npub": "Copy npub"
    };
    for (const [action, key] of Object.entries(titles)) {
      const button = this.querySelector(`button[data-action="${action}"]`);
      if (button) button.title = t(key);
    }
    const readonly = this.querySelector(".avatar-readonly-label");
    if (readonly) {
      readonly.textContent = t("read-only");
      readonly.setAttribute("aria-label", t("Read-only account"));
    }
    if (this.#nameField) {
      this.#nameField.setAttribute("aria-label", t("Account name"));
      this.#nameField.placeholder = t("unnamed");
      this.#syncNameFieldWidth();
    }
    this.#updateCopyKeyButton();
  }
};
customElements.define("account-avatar", AccountAvatar);
