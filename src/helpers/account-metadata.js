import { isValidEvent } from 'libp2r2p/event'
import { parseProfileEvent } from 'libp2r2p/key'

export function isAccountMetadataEvent (event, pubkey, kind) {
  return Boolean(event && event.pubkey === pubkey && event.kind === kind && isValidEvent(event))
}

export function isNewerAccountMetadata (event, previous, pubkey, kind) {
  return isAccountMetadataEvent(event, pubkey, kind) && (
    !isAccountMetadataEvent(previous, pubkey, kind) ||
    event.created_at > previous.created_at ||
    (event.created_at === previous.created_at && event.id < previous.id)
  )
}

// Legacy pairing imports used an unsigned kind-0 object for presentation.
// Read that exact shape without ever promoting it to signed metadata.
export function accountProfile (account) {
  const event = account.profileEvent
  const signed = isAccountMetadataEvent(event, account.pubkey, 0)
  const legacy = event?.kind === 0 && event.pubkey === account.pubkey &&
    event.created_at === 0 && event.id === undefined && event.sig === undefined
  const parsed = parseProfileEvent(signed || legacy ? event : undefined)
  return {
    name: parsed.name || account.name || '',
    picture: parsed.picture || account.picture || '',
    about: signed ? parsed.about : (parsed.about || account.about || '')
  }
}
