import { getIykcProofs } from '../../helpers/nostr/queries.js'
import { makeContentKeyEvent, CONTENT_KEY_KIND, CONTENT_KEY_PROOF_KIND } from './event.js'
import { publish, resolveWriteRelays } from '../relays.js'

export { CONTENT_KEY_KIND, CONTENT_KEY_PROOF_KIND, getIykcProofs }

function copyUnsignedEvent (event) {
  // eslint-disable-next-line no-unused-vars
  const { id, sig, pubkey, ...unsigned } = event
  return {
    ...unsigned,
    tags: (event.tags || []).map(tag => [...tag])
  }
}

function withImkcTag (event, tag) {
  const tags = (event.tags || []).map(tag => [...tag])
  const indexes = tags
    .map((tag, index) => tag[0] === 'imkc' ? index : -1)
    .filter(index => index >= 0)
  if (indexes.length > 1) throw new Error('MULTIPLE_IMKC_TAGS')
  if (indexes.length) tags[indexes[0]] = tag
  else tags.push(tag)
  return { ...event, tags }
}

export async function upsertContentKeyEvent ({ userSigner, contentKeySigner, staleContentKeys, relays, _publish = publish, _resolveWriteRelays = resolveWriteRelays }) {
  if (!userSigner?.getPublicKey) throw new Error('USER_SIGNER_REQUIRED')
  const pubkey = await userSigner.getPublicKey()
  const writeRelays = relays?.length ? relays : await _resolveWriteRelays(pubkey)
  const event = await makeContentKeyEvent({ userSigner, contentKeySigner, staleContentKeys })
  const result = await _publish(event, writeRelays)
  return { event, result }
}

export async function doubleSignEvent ({ userSigner, contentKeySigner, event }) {
  if (!userSigner?.signEvent) throw new Error('USER_SIGNER_REQUIRED')
  if (!contentKeySigner?.getPublicKey || !contentKeySigner?.signEvent) throw new Error('CONTENT_KEY_SIGNER_REQUIRED')
  if (!event || typeof event !== 'object') throw new Error('EVENT_REQUIRED')

  const imkcPubkey = await contentKeySigner.getPublicKey()
  const unsigned = copyUnsignedEvent(event)
  const proofless = withImkcTag(unsigned, ['imkc', imkcPubkey])
  const proofEvent = await contentKeySigner.signEvent(copyUnsignedEvent(proofless))
  const proofed = withImkcTag(unsigned, ['imkc', imkcPubkey, proofEvent.sig])
  return userSigner.signEvent(copyUnsignedEvent(proofed))
}
