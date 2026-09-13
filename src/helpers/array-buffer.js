import { ValidationError } from 'libp2r2p/error'

const byteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get

// Native brand checking also accepts buffers cloned from another realm.
export function arrayBufferBytes (value) {
  try {
    byteLength.call(value)
    return new Uint8Array(value)
  } catch (cause) {
    throw new ValidationError('INVALID_PLAINTEXT_BUFFER', { message: 'Plaintext must be an attached ArrayBuffer.', cause })
  }
}
