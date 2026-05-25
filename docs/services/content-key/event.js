import { getEventHash, verifyEvent } from 'nostr-tools'

export const CONTENT_KEY_KIND = 18716
export const CONTENT_KEY_PROOF_KIND = 1122

const HEX_PUBKEY = /^[0-9a-f]{64}$/i
const HEX_SIG = /^[0-9a-f]{128}$/i
const U_AT = /^u@ ([0-9]+)$/

function nowSeconds () {
  return Math.floor(Date.now() / 1000)
}

function uAt (timestamp) {
  return `u@ ${timestamp}`
}

function parseUAt (value) {
  const match = U_AT.exec(String(value || ''))
  if (!match) return null
  const timestamp = Number(match[1])
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : null
}

function parseIykcProof (iykcProof) {
  const [timestampText, cpProof, ...rest] = String(iykcProof || '').split(':')
  const timestamp = Number(timestampText)
  if (rest.length || !Number.isSafeInteger(timestamp) || timestamp < 0 || !HEX_SIG.test(cpProof || '')) return null
  return { timestamp, cpProof }
}

function prooflessContentKeyProofEvent ({ ownerPubkey, contentPubkey, timestamp }) {
  return {
    kind: CONTENT_KEY_PROOF_KIND,
    pubkey: ownerPubkey,
    created_at: 0,
    tags: [['cp', contentPubkey, uAt(timestamp)]],
    content: ''
  }
}

async function signContentKeyProof ({ userSigner, ownerPubkey, contentPubkey, timestamp }) {
  const proofEvent = await userSigner.signEvent(prooflessContentKeyProofEvent({ ownerPubkey, contentPubkey, timestamp }))
  return proofEvent.sig
}

async function currentContentKeyTag ({ userSigner, ownerPubkey, contentPubkey, timestamp }) {
  const cpProof = await signContentKeyProof({ userSigner, ownerPubkey, contentPubkey, timestamp })
  return ['cp', contentPubkey, cpProof, uAt(timestamp)]
}

async function staleContentKeyTag ({ userSigner, ownerPubkey, stale, removedAt }) {
  const contentPubkey = stale.iykcPubkey || stale.contentPubkey || stale.pubkey
  if (!HEX_PUBKEY.test(contentPubkey || '')) throw new Error('INVALID_STALE_CONTENT_KEY')

  const proof = parseIykcProof(stale.iykcProof)
  const cpProof = stale.cpProof || (proof?.timestamp === removedAt ? proof.cpProof : '') ||
    await signContentKeyProof({ userSigner, ownerPubkey, contentPubkey, timestamp: removedAt })

  return ['zz', `cp^${contentPubkey}^${cpProof}`, `${uAt(removedAt)}:0:1:2`]
}

function verifyCpTag ({ ownerPubkey, tag, expectedTimestamp }) {
  const [name, contentPubkey, cpProof, uAtValue, ...rest] = tag || []
  if (name !== 'cp' || rest.length) return null
  if (!HEX_PUBKEY.test(contentPubkey || '') || !HEX_SIG.test(cpProof || '')) return null
  const timestamp = parseUAt(uAtValue)
  if (timestamp == null || (expectedTimestamp != null && timestamp !== expectedTimestamp)) return null
  const iykcProof = `${timestamp}:${cpProof}`
  if (!verifyContentKeyProof({ ownerPubkey, iykcPubkey: contentPubkey, iykcProof })) return null
  return { iykcPubkey: contentPubkey, iykcProof, timestamp, cpProof }
}

function parseArchivedCpTag ({ ownerPubkey, tag }) {
  if (!Array.isArray(tag) || tag[0] !== 'zz' || tag.length !== 3) return null
  const removedAtText = String(tag[2]).split(':')[0]
  const removedAt = parseUAt(removedAtText)
  if (removedAt == null) return null

  const values = String(tag[1] || '').split('^')
  const indexes = String(tag[2]).split(':').slice(1).map(Number)
  if (!values.length || values.length !== indexes.length) return null

  const cpTag = []
  for (let i = 0; i < indexes.length; i++) {
    const index = indexes[i]
    if (!Number.isSafeInteger(index) || index < 0) return null
    cpTag[index] = values[i]
  }
  if (!cpTag[3]) cpTag[3] = uAt(removedAt)

  const parsed = verifyCpTag({ ownerPubkey, tag: cpTag })
  return parsed ? { ...parsed, removedAt } : null
}

export function verifyContentKeyProof ({ ownerPubkey, iykcPubkey, iykcProof } = {}) {
  if (!HEX_PUBKEY.test(ownerPubkey || '') || !HEX_PUBKEY.test(iykcPubkey || '')) return false
  const proof = parseIykcProof(iykcProof)
  if (!proof) return false

  const proofEvent = {
    ...prooflessContentKeyProofEvent({ ownerPubkey, contentPubkey: iykcPubkey, timestamp: proof.timestamp }),
    sig: proof.cpProof
  }
  proofEvent.id = getEventHash(proofEvent)
  return verifyEvent(proofEvent)
}

export async function makeContentKeyEvent ({ userSigner, contentKeySigner, createdAt = nowSeconds(), staleContentKeys = [] }) {
  if (!userSigner?.getPublicKey || !userSigner?.signEvent) throw new Error('USER_SIGNER_REQUIRED')
  if (!contentKeySigner?.getPublicKey) throw new Error('CONTENT_KEY_SIGNER_REQUIRED')

  const ownerPubkey = await userSigner.getPublicKey()
  const contentPubkey = await contentKeySigner.getPublicKey()
  const tags = [await currentContentKeyTag({ userSigner, ownerPubkey, contentPubkey, timestamp: createdAt })]

  for (const stale of staleContentKeys || []) {
    const removedAt = Number.isSafeInteger(stale.removedAt) && stale.removedAt >= 0 ? stale.removedAt : createdAt
    tags.push(await staleContentKeyTag({ userSigner, ownerPubkey, stale, removedAt }))
  }

  return userSigner.signEvent({
    kind: CONTENT_KEY_KIND,
    created_at: createdAt,
    tags,
    content: ''
  })
}

export function parseContentKeyEvent (event) {
  if (!event || event.kind !== CONTENT_KEY_KIND || event.content !== '') return null
  if (!HEX_PUBKEY.test(event.pubkey) || !Number.isSafeInteger(event.created_at)) return null
  if (!Array.isArray(event.tags) || !event.tags.length) return null
  if (!verifyEvent(event)) return null

  const current = verifyCpTag({ ownerPubkey: event.pubkey, tag: event.tags[0], expectedTimestamp: event.created_at })
  if (!current) return null
  if (event.tags.slice(1).some(tag => tag?.[0] === 'cp')) return null

  const staleIykcProofs = []
  for (const tag of event.tags.slice(1)) {
    const stale = parseArchivedCpTag({ ownerPubkey: event.pubkey, tag })
    if (!stale) return null
    staleIykcProofs.push({
      iykcPubkey: stale.iykcPubkey,
      iykcProof: stale.iykcProof,
      removedAt: stale.removedAt
    })
  }

  return {
    iykcPubkey: current.iykcPubkey,
    iykcProof: current.iykcProof,
    staleIykcProofs
  }
}
