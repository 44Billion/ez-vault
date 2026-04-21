import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46'
import { SimplePool } from 'nostr-tools/pool'
import { generateSecretKey } from 'nostr-tools'

// Open a short-lived NIP-46 connection to the given bunker URL, perform the
// connect + get_public_key handshake, and return the user pubkey the bunker
// speaks for. The caller uses this both to import a bunker account and to
// verify on reload that the bunker hasn't switched to a different user.
export async function fetchBunkerUserPubkey (bunkerInput) {
  const pointer = await parseBunkerInput(bunkerInput)
  if (!pointer) throw new Error('INVALID_BUNKER_URL')
  const clientSecretKey = generateSecretKey()
  const pool = new SimplePool()
  const signer = BunkerSigner.fromBunker(clientSecretKey, pointer, { pool })
  try {
    // Some bunkers remember the prior session server-side (or consume the
    // URL's `secret` on first use) and reject subsequent `connect` RPCs
    // with the string "already connected". `fromBunker` has already set up
    // the subscription, so we tolerate that and let `getPublicKey` be the
    // real liveness check — if the session is actually dead, it surfaces
    // the real error.
    try {
      await signer.connect()
    } catch (err) {
      const msg = typeof err === 'string' ? err : (err?.message ?? '')
      if (!/already connected/i.test(msg)) throw err
    }
    const pubkey = await signer.getPublicKey()
    return { pubkey, pointer }
  } finally {
    try { await signer.close() } catch { /* noop */ }
    try { pool.close(pointer.relays) } catch { /* noop */ }
  }
}
