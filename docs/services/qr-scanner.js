import jsQR from 'jsqr'

// Returns true on devices where opening the rear camera and getting frames is
// at all possible. The caller should still defensively try/catch start() to
// surface permission denials.
export function isCameraSupported () {
  return !!navigator.mediaDevices?.getUserMedia
}

async function nativeDetectorOrNull () {
  if (typeof BarcodeDetector === 'undefined') return null
  try {
    const formats = await BarcodeDetector.getSupportedFormats?.()
    if (!formats?.includes('qr_code')) return null
    return new BarcodeDetector({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

// Opens the rear camera, scans for a QR code, and resolves with the first
// successful decode via onResult. Caller is responsible for stopping the
// scanner (camera tracks + RAF loop) once it no longer needs frames; the
// scanner stops itself the moment a code is detected.
//
// Detection prefers the native BarcodeDetector API where available (Chrome,
// Edge, Android) and transparently falls back to the pure-JS jsQR decoder so
// Firefox / iOS Safari users still get camera scanning.
export class QrScanner {
  #video = document.createElement('video')
  #stream = null
  #canvas = null
  #ctx = null
  #raf = 0
  #detector = null
  #handlers
  #stopped = false

  constructor ({ onResult, onError } = {}) {
    this.#handlers = { onResult, onError }
    this.#video.setAttribute('playsinline', 'true')
    this.#video.muted = true
  }

  // Returns the <video> element so the caller can mount it where it makes
  // sense in the DOM. We don't style it here — the consumer's CSS owns size
  // and aspect ratio.
  get videoElement () {
    return this.#video
  }

  async start () {
    if (!isCameraSupported()) throw new Error('CAMERA_UNSUPPORTED')
    this.#stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    })
    this.#video.srcObject = this.#stream
    // Wait for both: the play() promise (browser is willing to play) AND
    // a frame that's actually been decoded (readyState >= HAVE_CURRENT_DATA).
    // Without this, callers that mount the video on resolution see an empty
    // box for one or two paint cycles before the first frame appears.
    const playPromise = this.#video.play()
    const framePromise = this.#video.readyState >= 2
      ? Promise.resolve()
      : new Promise(resolve => {
        this.#video.addEventListener('loadeddata', resolve, { once: true })
      })
    await Promise.all([playPromise, framePromise])
    this.#detector = await nativeDetectorOrNull()
    if (this.#detector) {
      this.#tickNative()
    } else {
      this.#canvas = document.createElement('canvas')
      this.#ctx = this.#canvas.getContext('2d', { willReadFrequently: true })
      this.#tickJsQr()
    }
  }

  stop () {
    if (this.#stopped) return
    this.#stopped = true
    if (this.#raf) cancelAnimationFrame(this.#raf)
    this.#raf = 0
    try { this.#video.pause() } catch { /* noop */ }
    this.#stream?.getTracks().forEach(t => { try { t.stop() } catch { /* noop */ } })
    this.#stream = null
  }

  async #tickNative () {
    if (this.#stopped) return
    try {
      const codes = await this.#detector.detect(this.#video)
      const value = codes?.[0]?.rawValue
      if (value) return this.#emit(value)
    } catch (err) {
      this.#handlers.onError?.(err)
    }
    if (!this.#stopped) this.#raf = requestAnimationFrame(() => this.#tickNative())
  }

  #tickJsQr () {
    if (this.#stopped) return
    const v = this.#video
    if (v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth && v.videoHeight) {
      this.#canvas.width = v.videoWidth
      this.#canvas.height = v.videoHeight
      this.#ctx.drawImage(v, 0, 0, v.videoWidth, v.videoHeight)
      const img = this.#ctx.getImageData(0, 0, v.videoWidth, v.videoHeight)
      const result = jsQR(img.data, img.width, img.height)
      if (result?.data) return this.#emit(result.data)
    }
    if (!this.#stopped) this.#raf = requestAnimationFrame(() => this.#tickJsQr())
  }

  #emit (value) {
    if (this.#stopped) return
    this.#handlers.onResult?.(value)
    this.stop()
  }
}
