// Short auto-detected "OS / browser" label. Sent across the pair channel so
// each side can store a human-readable hint for the OTHER side's signer (the
// raw pubkey alone is opaque). Best-effort: degrades to "unknown OS /
// unknown browser" rather than throwing, so a missing UA can't break a pair
// handshake.

export function detectPlatform () {
  const uad = navigator.userAgentData
  if (uad) {
    const os = uad.platform || 'unknown OS'
    // Reverse because the most specific brands are usually at the end
    const brand = uad.brands?.toReversed()?.find(b => !/Not.*A.Brand/i.test(b.brand))?.brand
    return `${os} / ${brand || 'unknown browser'}`
  }
  const ua = navigator.userAgent || ''
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown OS'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'unknown browser'
  return `${os} / ${browser}`
}
