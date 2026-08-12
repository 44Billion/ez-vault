// Pure URL helpers for the nostrpair pairing flow. Kept separate from the
// stateful session code in services/nostrpair.js so they can be unit-tested
// without pulling in nostr-tools.

export function buildNostrpairUrl ({ pubkey, relay, secret }) {
  const u = new URL(`nostrpair://${pubkey}`)
  u.searchParams.set('relay', relay)
  if (secret) u.searchParams.set('secret', secret)
  return u.toString()
}

export function parseNostrpairInput (input) {
  let url
  try { url = new URL(input) } catch { throw new Error('INVALID_NOSTRPAIR_URL') }
  if (url.protocol !== 'nostrpair:') throw new Error('INVALID_NOSTRPAIR_URL')
  // Hex pubkeys with leading digits get stuffed into url.pathname instead of
  // url.hostname by some URL parser implementations; check both.
  const pubkey = (url.hostname || url.pathname.replace(/^\/+/, '')).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(pubkey)) throw new Error('INVALID_NOSTRPAIR_URL')
  const relay = url.searchParams.get('relay')
  const secret = url.searchParams.get('secret') || ''
  if (!relay) throw new Error('INVALID_NOSTRPAIR_URL')
  return { pubkey, relay, secret }
}

// Pulls the persistent client key off a bunker URL exported via the pairing
// flow. Returns the cleaned URL (fragment stripped) plus the client key, or
// `{ url: input, clientKey: null }` if the input doesn't carry one. The
// fragment is local-only — relays don't transmit URL fragments — so it's
// just a convenient way to pack two values into one string.
export function extractBunkerClientKey (input) {
  let url
  try { url = new URL(input) } catch { throw new Error('INVALID_BUNKER_URL') }
  if (url.protocol !== 'bunker:') return { url: input, clientKey: null }
  const fragment = url.hash.replace(/^#/, '')
  if (!fragment) return { url: url.toString(), clientKey: null }
  const params = new URLSearchParams(fragment)
  const keys = [...params.keys()]
  const values = params.getAll('client_key')
  if (keys.some(key => key !== 'client_key') || values.length !== 1 || !/^[0-9a-f]{64}$/i.test(values[0])) {
    throw new Error('INVALID_BUNKER_CLIENT_KEY')
  }
  url.hash = ''
  return { url: url.toString(), clientKey: values[0].toLowerCase() }
}

export function buildBunkerUrlWithClientKey (bunkerUrl, clientKey) {
  if (!/^[0-9a-f]{64}$/i.test(clientKey || '')) throw new Error('INVALID_BUNKER_CLIENT_KEY')
  const url = new URL(bunkerUrl)
  if (url.protocol !== 'bunker:') throw new Error('INVALID_BUNKER_URL')
  url.hash = new URLSearchParams({ client_key: clientKey.toLowerCase() }).toString()
  return url.toString()
}
