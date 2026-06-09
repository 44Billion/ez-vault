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

function rollbackAccountState (affectedPubkeys, beforeAccounts, priorBlob, priorContentKeysBlob) {
  try { store.applyRecords(affectedPubkeys, beforeAccounts) } catch (err) {
    console.warn('account rollback failed', err?.message ?? err)
  }
  if (priorBlob !== null) {
    try { secrets.reload(priorBlob) } catch (err) {
      console.warn('secrets rollback failed', err?.message ?? err)
    }
  }
  if (priorContentKeysBlob !== null) {
    try { secrets.restoreContentKeySecrets(priorContentKeysBlob) } catch (err) {
      console.warn('content-key rollback failed', err?.message ?? err)
    }
  }
}

export async function runSecretAccountMutation ({
  operation,
  beforeAccounts = [],
  afterAccounts = [],
  apply,
  finalize,
  writeOptions = {}
}) {
  const cleanBefore = cleanAccounts(beforeAccounts)
  const cleanAfter = cleanAccounts(afterAccounts)
  const affectedPubkeys = affectedFromAccounts(cleanBefore, cleanAfter)
  const beforeSecretRefs = secretRefsForPubkeys(affectedPubkeys)
  const afterSecretRefs = secretRefsForAccounts(cleanAfter)
  const priorBlob = secrets.sealCurrentEntries()
  const priorContentKeysBlob = secrets.snapshotContentKeySecrets()

  journal.begin({
    operation,
    affectedPubkeys,
    beforeAccounts: cleanBefore,
    afterAccounts: cleanAfter,
    beforeSecretRefs,
    afterSecretRefs
  })

  try {
    await apply()
    await passkey.writeSecretsBlob(writeOptions)
    await finalize?.()
    journal.clear()
  } catch (err) {
    rollbackAccountState(affectedPubkeys, cleanBefore, priorBlob, priorContentKeysBlob)
    journal.clear()
    throw err
  }
}

function accountsByPubkey (accounts) {
  return new Map(cleanAccounts(accounts).map(account => [account.pubkey, account]))
}

function accountMatchesRef (account, ref) {
  const accountRef = secretRefForAccount(account)
  return Boolean(accountRef && ref && accountRef.type === ref.type && accountRef.pubkey === ref.pubkey)
}

function reconcileMixedState (tx, actualRefs) {
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

  store.applyRecords(tx.affectedPubkeys, records)
}

export function recoverPendingMutation () {
  const tx = journal.read()
  if (!tx) return { recovered: false, outcome: 'none' }
  if (journal.needsUnlock(tx) && !secrets.isUnlocked()) {
    return { recovered: false, outcome: 'locked' }
  }

  const actualRefs = secretRefsForPubkeys(tx.affectedPubkeys)
  let outcome = 'mixed'
  if (refsEqual(actualRefs, tx.afterSecretRefs)) {
    store.applyRecords(tx.affectedPubkeys, tx.afterAccounts)
    outcome = 'after'
  } else if (refsEqual(actualRefs, tx.beforeSecretRefs)) {
    store.applyRecords(tx.affectedPubkeys, tx.beforeAccounts)
    outcome = 'before'
  } else {
    console.warn('recovering mixed account mutation state', {
      operation: tx.operation,
      affectedPubkeys: tx.affectedPubkeys
    })
    reconcileMixedState(tx, actualRefs)
  }

  journal.clear()
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
