import {
  ValidationError
} from "./chunk-5FTA2SIT.js";

// src/helpers/array-buffer.js
var byteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
function arrayBufferBytes(value) {
  try {
    byteLength.call(value);
    return new Uint8Array(value);
  } catch (cause) {
    throw new ValidationError("INVALID_PLAINTEXT_BUFFER", { message: "Plaintext must be an attached ArrayBuffer.", cause });
  }
}

export {
  arrayBufferBytes
};
