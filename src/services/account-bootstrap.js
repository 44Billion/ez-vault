import {
  signProfileEvent,
  signRelayListEvent
} from 'libp2r2p/key'
import {
  freeRelays,
  relayPool,
  seedRelays
} from 'libp2r2p/relay'

// Publish the two events that make a brand-new account immediately usable and
// discoverable. Keeping this shared prevents the local-nsec and Pomegranate
// creation paths from drifting on relay roles or local record metadata.
export async function publishAccountBootstrap ({
  secretKey,
  name,
  picture,
  _relayPool = relayPool,
  _freeRelays = freeRelays,
  _seedRelays = seedRelays
}) {
  const writeRelays = _freeRelays.slice(0, 2)
  const relayListEvent = signRelayListEvent({
    secretKey,
    writeRelays,
    readRelays: writeRelays
  })
  const profileEvent = signProfileEvent({ secretKey, name, picture })

  const relayListPublish = await _relayPool.sendEvent(relayListEvent, _seedRelays)
  if (!relayListPublish.success) throw new Error('RELAY_LIST_PUBLISH_FAILED')

  const profilePublish = await _relayPool.sendEvent(profileEvent, writeRelays)
  if (!profilePublish.success) throw new Error('PROFILE_PUBLISH_FAILED')

  return { name, picture, profileEvent, relayListEvent, writeRelays }
}
