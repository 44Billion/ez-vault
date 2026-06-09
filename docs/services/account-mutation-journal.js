const KEY = 'ez-vault:account-mutation'
const listeners = new Set()

function cloneJson (value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function notify () {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.warn('account-mutation listener threw', err) }
  }
}

function normalizeAccountList (accounts) {
  return Array.isArray(accounts)
    ? accounts.filter(a => a?.pubkey).map(cloneJson)
    : []
}

function normalizeSecretRefs (refs) {
  return Array.isArray(refs)
    ? refs
      .filter(r => (r?.type === 'nsec' || r?.type === 'bunker') && r.pubkey)
      .map(r => ({ type: r.type, pubkey: r.pubkey }))
    : []
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

export function read () {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const beforeAccounts = normalizeAccountList(parsed.beforeAccounts)
    const afterAccounts = normalizeAccountList(parsed.afterAccounts)
    const beforeSecretRefs = normalizeSecretRefs(parsed.beforeSecretRefs)
    const afterSecretRefs = normalizeSecretRefs(parsed.afterSecretRefs)
    const affectedPubkeys = uniquePubkeys(
      Array.isArray(parsed.affectedPubkeys) ? parsed.affectedPubkeys : [],
      beforeAccounts.map(a => a.pubkey),
      afterAccounts.map(a => a.pubkey),
      beforeSecretRefs.map(r => r.pubkey),
      afterSecretRefs.map(r => r.pubkey)
    )
    return {
      id: String(parsed.id || ''),
      operation: String(parsed.operation || 'unknown'),
      affectedPubkeys,
      beforeAccounts,
      afterAccounts,
      beforeSecretRefs,
      afterSecretRefs,
      createdAt: Math.max(0, Math.floor(Number(parsed.createdAt) || 0))
    }
  } catch {
    return null
  }
}

export function begin ({
  operation,
  affectedPubkeys = [],
  beforeAccounts = [],
  afterAccounts = [],
  beforeSecretRefs = [],
  afterSecretRefs = []
}) {
  if (read()) throw new Error('ACCOUNT_MUTATION_IN_PROGRESS')
  const tx = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    operation: operation || 'unknown',
    affectedPubkeys: uniquePubkeys(
      affectedPubkeys,
      beforeAccounts.map(a => a?.pubkey),
      afterAccounts.map(a => a?.pubkey),
      beforeSecretRefs.map(r => r?.pubkey),
      afterSecretRefs.map(r => r?.pubkey)
    ),
    beforeAccounts: normalizeAccountList(beforeAccounts),
    afterAccounts: normalizeAccountList(afterAccounts),
    beforeSecretRefs: normalizeSecretRefs(beforeSecretRefs),
    afterSecretRefs: normalizeSecretRefs(afterSecretRefs),
    createdAt: Math.floor(Date.now() / 1000)
  }
  localStorage.setItem(KEY, JSON.stringify(tx))
  notify()
  return tx
}

export function clear () {
  if (!localStorage.getItem(KEY)) return
  localStorage.removeItem(KEY)
  notify()
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function affectedPubkeys () {
  return read()?.affectedPubkeys || []
}

export function isAffectedPubkey (pubkey) {
  return affectedPubkeys().includes(pubkey)
}

export function filterVisibleAccounts (accounts) {
  const hidden = new Set(affectedPubkeys())
  if (!hidden.size) return accounts
  return accounts.filter(account => !hidden.has(account.pubkey))
}

export function needsUnlock (tx = read()) {
  return Boolean(tx && (tx.beforeSecretRefs.length || tx.afterSecretRefs.length))
}
