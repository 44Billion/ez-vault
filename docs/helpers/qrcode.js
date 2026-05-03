import qrcode from 'qrcode-generator'

// Tiny wrapper around the qrcode-generator package. `cellSize` is the pixel
// size of a single QR module; `margin` is the quiet-zone width in modules.
// We pick error-correction "M" (~15% recoverable) — high enough to survive a
// phone camera at typical distances, low enough to keep the URL-bearing QR
// from getting visually dense.
export function generateQrDataUrl (text, { errorCorrection = 'M', cellSize = 6, margin = 4 } = {}) {
  const qr = qrcode(0, errorCorrection)
  qr.addData(text)
  qr.make()
  return qr.createDataURL(cellSize, margin)
}
