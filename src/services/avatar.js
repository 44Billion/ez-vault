import { Avatar, Style } from '@dicebear/core'
import avataaarsDefinition from '@dicebear/styles/avataaars.json' with { type: 'json' }
import neutralDefinition from '@dicebear/styles/avataaars-neutral.json' with { type: 'json' }

const avataaars = new Style(avataaarsDefinition)
const avataaarsNeutral = new Style(neutralDefinition)
const dataUrlCache = new Map()
const neutralDataUrlCache = new Map()

function svgAvatar (style, seed) {
  return new Avatar(style, {
    borderRadius: 50,
    idRandomization: false,
    seed: String(seed)
  }).toString()
}

export function getSvgAvatar (seed) {
  return svgAvatar(avataaars, seed)
}

export function getNeutralSvgAvatar (seed) {
  return svgAvatar(avataaarsNeutral, seed)
}

function avatarDataUrl (cache, render, seed) {
  const key = String(seed)
  if (!cache.has(key)) {
    const svg = render(key)
    cache.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  }
  return cache.get(key)
}

// Keep these APIs asynchronous for existing intake consumers. Generation is
// local; no avatar seed or account pubkey is sent to DiceBear.
export async function seededAvatarDataUrl (seed) {
  return avatarDataUrl(dataUrlCache, getSvgAvatar, seed)
}

export async function seededNeutralAvatarDataUrl (seed) {
  return avatarDataUrl(neutralDataUrlCache, getNeutralSvgAvatar, seed)
}
