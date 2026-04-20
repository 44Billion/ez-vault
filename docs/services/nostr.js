import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  nip19
} from 'nostr-tools'

export function generateKeypair () {
  const secretKey = generateSecretKey()
  const pubkey = getPublicKey(secretKey)
  return {
    secretKey,
    pubkey,
    nsec: nip19.nsecEncode(secretKey),
    npub: nip19.npubEncode(pubkey)
  }
}

export function keypairFromNsec (nsec) {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') throw new Error('NOT_AN_NSEC')
  const secretKey = decoded.data
  const pubkey = getPublicKey(secretKey)
  return {
    secretKey,
    pubkey,
    nsec,
    npub: nip19.npubEncode(pubkey)
  }
}

export function npubFromPubkey (pubkey) {
  return nip19.npubEncode(pubkey)
}

export function signProfileEvent ({ secretKey, name = '', picture }) {
  const content = {}
  if (name) content.name = name
  if (picture) content.picture = picture

  const tags = []
  if (name) tags.push(['name', name])
  if (picture) tags.push(['picture', picture])

  return finalizeEvent({
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify(content)
  }, secretKey)
}

// Signs a NIP-65 kind:10002 relay-list event. Each URL present in both
// `writeRelays` and `readRelays` is emitted as a bare `['r', url]` tag;
// otherwise it gets the explicit `'read'` or `'write'` marker.
export function signRelayListEvent ({ secretKey, writeRelays = [], readRelays = [] }) {
  const write = new Set(writeRelays)
  const read = new Set(readRelays)
  const all = new Set([...write, ...read])
  const tags = []
  for (const url of all) {
    const isWrite = write.has(url)
    const isRead = read.has(url)
    if (isWrite && isRead) tags.push(['r', url])
    else if (isWrite) tags.push(['r', url, 'write'])
    else tags.push(['r', url, 'read'])
  }
  return finalizeEvent({
    kind: 10002,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ''
  }, secretKey)
}

export function parseProfileEvent (event) {
  if (!event || event.kind !== 0) return { name: '', picture: '' }
  let parsed = {}
  try { parsed = JSON.parse(event.content) } catch { parsed = {} }
  const fromTag = name => event.tags.find(t => t[0] === name)?.[1]
  return {
    name: (fromTag('name') || parsed.name || parsed.display_name || '').trim(),
    picture: (fromTag('picture') || parsed.picture || '').trim()
  }
}
