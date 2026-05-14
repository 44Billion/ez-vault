// Best-effort fetch of the site's /favicon.ico, returned as a base64 data
// URL. Used by passkey.js to populate `user.iconURL` at registration and to
// detect favicon changes between sessions. Silently returns null on any
// failure (404, non-image content, oversized payload, network error) — the
// caller treats "no icon" as a graceful skip.

const FAVICON_URL = '/favicon.ico'
// Cap so a runaway image can't bloat localStorage. Real favicons are <10 KB.
const MAX_BYTES = 100 * 1024 // 100 KB

export async function fetchFaviconBase64 () {
  try {
    const res = await fetch(FAVICON_URL, { cache: 'no-store' })
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
