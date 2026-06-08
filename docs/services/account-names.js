// Sources:
// - https://github.com/s-celles/unique-names-data/blob/main/data/colors.csv
// - https://github.com/s-celles/unique-names-data/blob/main/data/nature.csv
// Converted from the first CSV column with the header row skipped.

export const ACCOUNT_NAME_COLORS = Object.freeze([
  'Crimson',
  'Azure',
  'Emerald',
  'Golden',
  'Silver',
  'Coral',
  'Violet',
  'Jade',
  'Amber',
  'Sapphire',
  'Ruby',
  'Onyx',
  'Pearl',
  'Cobalt',
  'Scarlet',
  'Ivory',
  'Magenta',
  'Indigo',
  'Bronze',
  'Turquoise',
  'Copper',
  'Lavender',
  'Chartreuse',
  'Vermillion',
  'Teal',
  'Ochre',
  'Plum',
  'Slate',
  'Aqua',
  'Maroon',
  'Olive',
  'Burgundy',
  'Tangerine',
  'Mint',
  'Navy',
  'Champagne',
  'Salmon',
  'Forest',
  'Citrine',
  'Pewter',
  'Flamingo',
  'Cerulean',
  'Saffron',
  'Amethyst',
  'Topaz',
  'Garnet',
  'Platinum',
  'Orchid',
  'Peach',
  'Rose'
])

export const ACCOUNT_NAME_NATURE = Object.freeze([
  'Glacier',
  'Ember',
  'Cascade',
  'Fjord',
  'River',
  'Mountain',
  'Forest',
  'Ocean',
  'Desert',
  'Meadow',
  'Canyon',
  'Valley',
  'Aurora',
  'Thunder',
  'Lightning',
  'Breeze',
  'Storm',
  'Mist',
  'Frost',
  'Dew',
  'Sunrise',
  'Sunset',
  'Horizon',
  'Tundra',
  'Savanna',
  'Prairie',
  'Lagoon',
  'Delta',
  'Cliff',
  'Ridge',
  'Summit',
  'Peak',
  'Grove',
  'Glade',
  'Brook',
  'Spring',
  'Rapids',
  'Tide',
  'Wave',
  'Coral',
  'Kelp',
  'Moss',
  'Fern',
  'Willow',
  'Cedar',
  'Birch',
  'Sequoia',
  'Bamboo',
  'Crystal',
  'Quartz'
])

function randomInt (max) {
  return Math.floor(Math.random() * max)
}

function accountNameAt (index) {
  const color = ACCOUNT_NAME_COLORS[Math.floor(index / ACCOUNT_NAME_NATURE.length)]
  const nature = ACCOUNT_NAME_NATURE[index % ACCOUNT_NAME_NATURE.length]
  return `${color} ${nature}`
}

export function randomAccountName (previous = '') {
  const total = ACCOUNT_NAME_COLORS.length * ACCOUNT_NAME_NATURE.length
  let previousIndex = -1
  for (let i = 0; i < total; i++) {
    if (accountNameAt(i) === previous) {
      previousIndex = i
      break
    }
  }

  if (previousIndex === -1) return accountNameAt(randomInt(total))

  const nextIndex = randomInt(total - 1)
  return accountNameAt(nextIndex >= previousIndex ? nextIndex + 1 : nextIndex)
}
