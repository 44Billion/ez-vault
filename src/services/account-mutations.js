import * as store from './accounts-store.js'
import * as secrets from './secrets.js'
import * as passkey from './passkey.js'
import * as journal from './account-mutation-journal.js'

function cloneJson (value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function cleanAccounts (accounts) {
  return (Array.isArray(accounts) ? accounts : []).filter(a => a?.pubkey).map(cloneJson)
}

function uniquePubkeys (...groups) {
  const out = []
  const seen = new Set()
  for (const group of groups) {
    for (const pubkey of group || []) {
      if (!pubkey || seen.has(pubkey)) continue
      seen.add(pubkey)
      out.push(pubkey)
    }
  }
  return out
}

function refKey (ref) {
  return `${ref.type}:${ref.pubkey}`
}

function sortRefs (refs) {
  return [...(refs || [])]
    .filter(r => (r?.type === 'nsec' || r?.type === 'bunker') && r.pubkey)
    .map(r => ({ type: r.type, pubkey: r.pubkey }))
    .sort((a, b) => refKey(a).localeCompare(refKey(b)))
}

function refsEqual (a, b) {
  const left = sortRefs(a)
  const right = sortRefs(b)
  if (left.length !== right.length) return false
  return left.every((ref, i) => ref.type === right[i].type && ref.pubkey === right[i].pubkey)
}

function secretRefForAccount (account) {
  if (!account || (account.type !== 'nsec' && account.type !== 'bunker')) return null
  return { type: account.type, pubkey: account.pubkey }
}

function secretRefsForAccounts (accounts) {
  return sortRefs(cleanAccounts(accounts).map(secretRefForAccount).filter(Boolean))
}

function secretRefsForPubkeys (pubkeys) {
  const wanted = new Set(pubkeys)
  return sortRefs(secrets.listSecretRefs().filter(ref => wanted.has(ref.pubkey)))
}

function affectedFromAccounts (beforeAccounts, afterAccounts) {
  return uniquePubkeys(
    beforeAccounts.map(a => a.pubkey),
    afterAccounts.map(a => a.pubkey)
  )
}

async function rollbackAccountState (affectedPubkeys, beforeAccounts, priorMemoryBlob, priorLocalBlob, priorContentKeysBlob) {
  let succeeded = true
  try { await store.applyRecords(affectedPubkeys, beforeAccounts) } catch (err) {
    succeeded = false
    console.warn('account rollback failed', err?.message ?? err)
  }
  if (priorMemoryBlob !== null) {
    try { secrets.reload(priorMemoryBlob) } catch (err) {
      succeeded = false
      console.warn('secrets rollback failed', err?.message ?? err)
    }
  }
  try { await passkey.restoreSecretsBlobSnapshot(priorLocalBlob) } catch (err) {
    succeeded = false
    console.warn('ciphertext rollback failed', err?.message ?? err)
  }
  if (priorContentKeysBlob !== null) {
    try { await secrets.restoreContentKeySecrets(priorContentKeysBlob) } catch (err) {
      succeeded = false
      console.warn('content-key rollback failed', err?.message ?? err)
    }
  }
  return succeeded
}

export async function runSecretAccountMutation ({
  operation,
  beforeAccounts = [],
  afterAccounts = [],
  apply,
  finalize
}) {
  const cleanBefore = cleanAccounts(beforeAccounts)
  const cleanAfter = cleanAccounts(afterAccounts)
  const affectedPubkeys = affectedFromAccounts(cleanBefore, cleanAfter)
  const beforeSecretRefs = secretRefsForPubkeys(affectedPubkeys)
  const afterSecretRefs = secretRefsForAccounts(cleanAfter)
  const beforeSecretFingerprint = secrets.secretStateFingerprint(affectedPubkeys)
  const priorMemoryBlob = secrets.sealCurrentEntries()
  const priorLocalBlob = passkey.snapshotSecretsBlob()
  const priorContentKeysBlob = secrets.snapshotContentKeySecrets()

  await journal.begin({
    operation,
    affectedPubkeys,
    beforeAccounts: cleanBefore,
    afterAccounts: cleanAfter,
    beforeSecretRefs,
    afterSecretRefs,
    beforeSecretFingerprint
  })

  try {
    await apply()
    await finalize?.()
    await journal.setAfterSecretFingerprint(secrets.secretStateFingerprint(affectedPubkeys))
    await passkey.persistSecretsBlob()
  } catch (err) {
    // A successful largeBlob write followed by an impossible PRF mismatch may
    // have committed the after-state remotely. Keep the journal so the next
    // authenticated recovery can reconcile against the durable ciphertext.
    if (err?.persistenceMayHaveCommitted) throw err
    const rolledBack = await rollbackAccountState(
      affectedPubkeys,
      cleanBefore,
      priorMemoryBlob,
      priorLocalBlob,
      priorContentKeysBlob
    )
    // Keep the journal if a rollback itself failed. Startup recovery can then
    // reconcile the records against whichever ciphertext actually committed.
    if (rolledBack) await journal.clear()
    throw err
  }
  await journal.clear()
  try {
    await secrets.finalizeLegacyBunkerMigrations()
  } catch (err) {
    console.warn('legacy bunker migration cleanup failed', err?.message ?? err)
  }
}

function accountsByPubkey (accounts) {
  return new Map(cleanAccounts(accounts).map(account => [account.pubkey, account]))
}

function accountMatchesRef (account, ref) {
  const accountRef = secretRefForAccount(account)
  return Boolean(accountRef && ref && accountRef.type === ref.type && accountRef.pubkey === ref.pubkey)
}

async function reconcileMixedState (tx, actualRefs) {
  const before = accountsByPubkey(tx.beforeAccounts)
  const after = accountsByPubkey(tx.afterAccounts)
  const actualByPubkey = new Map(actualRefs.map(ref => [ref.pubkey, ref]))
  const records = []

  for (const pubkey of tx.affectedPubkeys) {
    const ref = actualByPubkey.get(pubkey)
    const afterAccount = after.get(pubkey)
    const beforeAccount = before.get(pubkey)

    if (accountMatchesRef(afterAccount, ref)) records.push(afterAccount)
    else if (accountMatchesRef(beforeAccount, ref)) records.push(beforeAccount)
    else if (!ref && afterAccount?.type === 'npub') records.push(afterAccount)
    else if (!ref && beforeAccount?.type === 'npub') records.push(beforeAccount)
    else if (ref) console.warn('dropping account record with mismatched secret ref', pubkey)
  }

  await store.applyRecords(tx.affectedPubkeys, records)
}

export async function recoverPendingMutation () {
  const tx = journal.read()
  if (!tx) return { recovered: false, outcome: 'none' }
  if (journal.needsUnlock(tx) && !secrets.isUnlocked()) {
    return { recovered: false, outcome: 'locked' }
  }

  const actualRefs = secretRefsForPubkeys(tx.affectedPubkeys)
  const actualFingerprint = secrets.secretStateFingerprint(tx.affectedPubkeys)
  let outcome = 'mixed'
  if (tx.afterSecretFingerprint && actualFingerprint === tx.afterSecretFingerprint) {
    await store.applyRecords(tx.affectedPubkeys, tx.afterAccounts)
    outcome = 'after'
  } else if (tx.beforeSecretFingerprint && actualFingerprint === tx.beforeSecretFingerprint) {
    await store.applyRecords(tx.affectedPubkeys, tx.beforeAccounts)
    outcome = 'before'
  } else if (!tx.afterSecretFingerprint && refsEqual(actualRefs, tx.afterSecretRefs)) {
    await store.applyRecords(tx.affectedPubkeys, tx.afterAccounts)
    outcome = 'after'
  } else if (!tx.beforeSecretFingerprint && refsEqual(actualRefs, tx.beforeSecretRefs)) {
    await store.applyRecords(tx.affectedPubkeys, tx.beforeAccounts)
    outcome = 'before'
  } else {
    console.warn('recovering mixed account mutation state', {
      operation: tx.operation,
      affectedPubkeys: tx.affectedPubkeys
    })
    await reconcileMixedState(tx, actualRefs)
  }

  await journal.clear()
  return { recovered: true, outcome }
}

export function filterVisibleAccounts (accounts) {
  return journal.filterVisibleAccounts(accounts)
}

export function hasPendingMutation () {
  return Boolean(journal.read())
}

export function pendingMutationNeedsUnlock () {
  return journal.needsUnlock()
}

export const subscribePendingMutations = journal.subscribe
