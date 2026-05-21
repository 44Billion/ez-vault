import { getEventHash, verifyEvent } from 'nostr-tools'

export const CONTENT_KEY_KIND = 18716

const HEX_PUBKEY = /^[0-9a-f]{64}$/i
const HEX_SIG = /^[0-9a-f]{128}$/i

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function prooflessContentKeyEvent ({ createdAt = nowSeconds(), contentPubkey }) {
  return {
    kind: CONTENT_KEY_KIND,
    created_at: createdAt,
    tags: [['cp', contentPubkey]],
    content: ''
  }
}

function parseIykcProof (iykcProof) {
  const [createdAtText, cpProof, ...rest] = String(iykcProof || '').split(':')
  const createdAt = Number(createdAtText)
  if (rest.length || !Number.isSafeInteger(createdAt) || createdAt < 0 || !HEX_SIG.test(cpProof || '')) return null
  return { createdAt, cpProof }
}

export function verifyContentKeyProof ({ iykcPubkey, iykcProof } = {}) {
  if (!HEX_PUBKEY.test(iykcPubkey || '')) return false
  const proof = parseIykcProof(iykcProof)
  if (!proof) return false

  const proofEvent = {
    ...prooflessContentKeyEvent({ createdAt: proof.createdAt, contentPubkey: iykcPubkey }),
    pubkey: iykcPubkey,
    sig: proof.cpProof
  }
  proofEvent.id = getEventHash(proofEvent)
  return verifyEvent(proofEvent)
}

export async function makeContentKeyEvent ({ userSigner, contentKeySigner, createdAt = nowSeconds() }) {
  if (!userSigner?.getPublicKey || !userSigner?.signEvent) throw new Error('USER_SIGNER_REQUIRED')
  if (!contentKeySigner?.getPublicKey || !contentKeySigner?.signEvent) throw new Error('CONTENT_KEY_SIGNER_REQUIRED')

  const contentPubkey = await contentKeySigner.getPublicKey()
  const proofless = prooflessContentKeyEvent({ createdAt, contentPubkey })
  const proofEvent = await contentKeySigner.signEvent({ ...proofless, tags: proofless.tags.map(tag => [...tag]) })
  const cpProof = proofEvent.sig

  return userSigner.signEvent({
    ...proofless,
    tags: [['cp', contentPubkey, cpProof]]
  })
}

export function parseContentKeyEvent (event) {
  if (!event || event.kind !== CONTENT_KEY_KIND || event.content !== '') return null
  if (!HEX_PUBKEY.test(event.pubkey) || !Number.isSafeInteger(event.created_at)) return null
  if (!Array.isArray(event.tags) || event.tags.length !== 1) return null
  if (!verifyEvent(event)) return null

  const [name, contentPubkey, cpProof] = event.tags[0]
  if (name !== 'cp' || !HEX_PUBKEY.test(contentPubkey) || !HEX_SIG.test(cpProof)) return null

  const iykcProof = `${event.created_at}:${cpProof}`
  if (!verifyContentKeyProof({ iykcPubkey: contentPubkey, iykcProof })) return null

  return {
    iykcPubkey: contentPubkey,
    iykcProof
  }
}
