// Best-effort fetch of the vault's favicon (src/assets/favicon.png, copied to
// docs/favicon.png by the build), returned as a base64 data URL. Used by
// passkey.js to populate `user.iconURL` at registration and to detect favicon
// changes between sessions. Silently returns null on any failure (404,
// non-image content, oversized payload, network error) — the caller treats
// "no icon" as a graceful skip.
//
// Resolved relative to the page at call time so it works both on GitHub
// Pages (repo subpath, e.g. /ez-vault/favicon.png) and on the vault
// subdomain (vault.44billion.net/favicon.png) — an absolute /favicon.ico
// would 404. Kept lazy so importing this module in Node tests never touches
// `window`.
function faviconUrl () {
  const base = typeof window !== 'undefined' ? window.location.href : undefined
  return new URL('./favicon.png', base).href
}
// Cap so a runaway image can't bloat local persistence. Real favicons are <10 KB.
const MAX_BYTES = 100 * 1024 // 100 KB

export async function fetchFaviconBase64 () {
  try {
    const res = await fetch(faviconUrl(), { cache: 'no-store' })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    if (blob.size > MAX_BYTES) return null
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}

function blobToDataUrl (blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
