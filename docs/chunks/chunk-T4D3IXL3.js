import {
  freeRelays,
  relayPool,
  seedRelays,
  signProfileEvent,
  signRelayListEvent
} from "./chunk-NHHPGB6R.js";

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

// src/services/account-bootstrap.js
async function publishAccountBootstrap({
  secretKey,
  name,
  picture,
  _relayPool = relayPool,
  _freeRelays = freeRelays,
  _seedRelays = seedRelays
}) {
  const writeRelays = _freeRelays.slice(0, 2);
  const relayListEvent = signRelayListEvent({
    secretKey,
    writeRelays,
    readRelays: writeRelays
  });
  const profileEvent = signProfileEvent({ secretKey, name, picture });
  const relayListPublish = await _relayPool.sendEvent(relayListEvent, _seedRelays);
  if (!relayListPublish.success) throw new Error("RELAY_LIST_PUBLISH_FAILED");
  const profilePublish = await _relayPool.sendEvent(profileEvent, writeRelays);
  if (!profilePublish.success) throw new Error("PROFILE_PUBLISH_FAILED");
  return { name, picture, profileEvent, relayListEvent, writeRelays };
}

export {
  randomAccountName,
  publishAccountBootstrap
};
