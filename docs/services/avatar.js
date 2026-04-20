import { getRandomId } from '../helpers/string.js'

const FETCH_TIMEOUT_MS = 5000

export function seededAvatarUrl (seed) {
  const params = new URLSearchParams({
    radius: '50',
    randomizeIds: 'true',
    seed: String(seed)
  })
  return `https://api.dicebear.com/9.x/avataaars/svg?${params}`
}

// Fetches the SVG for a given seed. Falls back to a minimal default SVG
// when the network/API is unreachable so the caller always gets a usable
// image it can inline as a data URL.
export async function getSvgAvatar (seed) {
  try {
    return await fetchSvg(seededAvatarUrl(seed))
  } catch (err) {
    console.warn('Could not fetch avatar image', err?.message ?? err)
    return getDefaultSvg()
  }
}

// Returns a self-contained `data:` URL for the seeded avatar. This is what
// we store locally and publish inside kind:0 events so the picture survives
// without depending on the remote URL staying online.
export async function seededAvatarDataUrl (seed) {
  const svg = await getSvgAvatar(seed)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

async function fetchSvg (url, timeout = FETCH_TIMEOUT_MS) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = setTimeout(() => controller?.abort(), timeout)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'image/svg+xml' },
      signal: controller?.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// Offline / API-down fallback. Keeps mask ids unique across instances.
function getDefaultSvg () {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 280" fill="none">
    <mask id="__MASK__"><rect width="280" height="280" rx="140" ry="140" fill="#fff"/></mask>
    <g mask="url(#__MASK__)">
      <rect width="280" height="280" fill="#2d2d44"/>
      <circle cx="140" cy="112" r="44" fill="#d08b5b"/>
      <rect x="56" y="176" width="168" height="128" rx="52" fill="#d08b5b"/>
    </g>
  </svg>`
  return svg.replaceAll('__MASK__', `m-${getRandomId()}`)
}
