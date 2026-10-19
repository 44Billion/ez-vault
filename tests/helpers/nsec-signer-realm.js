import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { getPublicKey } from 'libp2r2p/key'
import { hexToBytes, bytesToHex } from 'libp2r2p/base16'
import { deriveDoubleDhConversationKey } from 'libp2r2p/double-dh'
import { ValidationError } from 'libp2r2p/error'
import { normalizeKind } from 'libp2r2p/nip44-v3'

// Instrument the private lexical boundary in an isolated test realm. Production
// exposes neither key references nor a cache inspection method.
export function isolated (deriveSharedKey = async () => hexToBytes('2'.padStart(64, '0')), overrides = {}) {
  let clock = 0; let wallClock = 0; let serial = 0
  const keys = []; const doubleKeys = []; const doubleCalls = []; const timers = new Map(); const listeners = new Map()
  let source = readFileSync(new URL('../../src/services/nsec-signer.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from '[^']+'\n/gm, '')
    .replace('export default class NsecSigner', 'class NsecSigner')
  if (overrides.selectContent) source = source.replace('await contentSigner.getPublicKey()', 'await selectContent(contentSigner)')
  const context = {
    getPublicKey, hexToBytes, bytesToHex, deriveSharedKey, ValidationError, recordCryptoPerformance () {},
    deriveDoubleDhConversationKey: params => {
      const result = deriveDoubleDhConversationKey(params)
      doubleCalls.push({ role: params.role, kind: params.kind, scope: params.scope })
      if (result.conversationKey) doubleKeys.push(result.conversationKey)
      return result
    },
    nip44: { getConversationKey () {}, encrypt () {}, decrypt () {} },
    nip04: { encrypt () {}, decrypt () {} },
    nip44v3: { normalizeKind, encryptWithConversationKeyBytes: () => 'ciphertext', decryptWithConversationKeyBytes: () => new Uint8Array(), toBytes: () => new Uint8Array() },
    sharedXOnlySecret: () => { const key = new Uint8Array(32).fill(7); keys.push(key); return key },
    utf8ToBytes: value => new TextEncoder().encode(value),
    performance: { now: () => clock },
    Date: { now: () => wallClock },
    addEventListener: (event, callback) => listeners.set(event, callback),
    setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, at: clock + delay }); return id },
    clearTimeout: id => timers.delete(id)
  }
  Object.assign(context, overrides)
  runInNewContext(`${source}\nglobalThis.Signer = NsecSigner`, context)
  return { Signer: context.Signer, context, keys, doubleKeys, doubleCalls, timers, listeners, suspend (ms) { wallClock += ms }, advance (ms) { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn() } } }
}
export const secret = n => n.toString(16).padStart(64, '0')
export const encrypt = (signer, peer) => signer.nip44v3EncryptBytes(peer, 9, '', new Uint8Array([1]))
