import { createAvatar } from '@dicebear/core'
import * as avataaars from '@dicebear/avataaars'

const dataUrlCache = new Map()

export function getSvgAvatar (seed) {
  return createAvatar(avataaars, {
    radius: 50,
    randomizeIds: false,
    seed: [String(seed)]
  }).toString()
}

// Keep this API asynchronous for existing consumers. Generation is local and
// the stable result is shared across every component that needs this seed.
export async function seededAvatarDataUrl (seed) {
  const key = String(seed)
  if (!dataUrlCache.has(key)) {
    const svg = getSvgAvatar(key)
    dataUrlCache.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  }
  return dataUrlCache.get(key)
}
