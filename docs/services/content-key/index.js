import { getIykcProofs } from '../../helpers/nostr/queries.js'
import { makeContentKeyEvent, CONTENT_KEY_KIND } from './event.js'
import { publish, resolveWriteRelays } from '../relays.js'

export { CONTENT_KEY_KIND, getIykcProofs }

export async function upsertContentKeyEvent ({ userSigner, contentKeySigner, relays, _publish = publish, _resolveWriteRelays = resolveWriteRelays }) {
  if (!userSigner?.getPublicKey) throw new Error('USER_SIGNER_REQUIRED')
  const pubkey = await userSigner.getPublicKey()
  const writeRelays = relays?.length ? relays : await _resolveWriteRelays(pubkey)
  const event = await makeContentKeyEvent({ userSigner, contentKeySigner })
  const result = await _publish(event, writeRelays)
  return { event, result }
}
