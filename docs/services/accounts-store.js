const KEY = '46b-vault:accounts'
const listeners = new Set()

function read () {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function write (accounts) {
  localStorage.setItem(KEY, JSON.stringify(accounts))
  for (const fn of listeners) fn()
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function list () {
  return read()
}

export function get (pubkey) {
  return read().find(a => a.pubkey === pubkey) || null
}

export function add (account) {
  const all = read()
  if (all.some(a => a.pubkey === account.pubkey)) throw new Error('ACCOUNT_EXISTS')
  all.unshift(account)
  write(all)
}

export function replace (pubkey, account) {
  const all = read()
  const i = all.findIndex(a => a.pubkey === pubkey)
  if (i === -1) throw new Error('ACCOUNT_NOT_FOUND')
  all[i] = account
  write(all)
}

export function update (pubkey, patch) {
  const all = read()
  const i = all.findIndex(a => a.pubkey === pubkey)
  if (i === -1) return
  all[i] = { ...all[i], ...patch }
  write(all)
}

export function remove (pubkey) {
  const next = read().filter(a => a.pubkey !== pubkey)
  write(next)
}
