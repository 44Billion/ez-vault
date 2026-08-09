import { listAccounts, mutateAccounts } from './storage/index.js'

const listeners = new Set()

function notify () {
  for (const fn of listeners) {
    try { fn() } catch (err) { console.warn('accounts-store listener threw', err) }
  }
}

async function mutate (fn) {
  const result = await mutateAccounts(fn)
  notify()
  return result
}

export function subscribe (fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function list () {
  return listAccounts()
}

export function get (pubkey) {
  return list().find(account => account.pubkey === pubkey) || null
}

export async function add (account) {
  await mutate(all => {
    if (all.some(existing => existing.pubkey === account.pubkey)) throw new Error('ACCOUNT_EXISTS')
    all.unshift(account)
    return { accounts: all }
  })
}

export async function replace (pubkey, account) {
  await mutate(all => {
    const index = all.findIndex(existing => existing.pubkey === pubkey)
    if (index === -1) throw new Error('ACCOUNT_NOT_FOUND')
    all[index] = account
    return { accounts: all }
  })
}

export async function update (pubkey, patch) {
  return mutate(all => {
    const index = all.findIndex(account => account.pubkey === pubkey)
    if (index === -1) return { accounts: all, result: false }
    all[index] = { ...all[index], ...patch }
    return { accounts: all, result: true }
  })
}

export async function remove (pubkey) {
  return mutate(all => {
    const next = all.filter(account => account.pubkey !== pubkey)
    return { accounts: next, result: next.length !== all.length }
  })
}

export async function applyRecords (affectedPubkeys, records) {
  const affected = new Set((affectedPubkeys || []).filter(Boolean))
  const nextRecords = Array.isArray(records) ? records : []
  const byPubkey = new Map(nextRecords.filter(account => account?.pubkey).map(account => [account.pubkey, account]))
  const inserted = new Set()
  await mutate(all => {
    const next = []
    for (const account of all) {
      if (!affected.has(account.pubkey)) {
        next.push(account)
        continue
      }
      const replacement = byPubkey.get(account.pubkey)
      if (replacement) {
        next.push(replacement)
        inserted.add(account.pubkey)
      }
    }
    for (let index = nextRecords.length - 1; index >= 0; index--) {
      const record = nextRecords[index]
      if (!record?.pubkey || inserted.has(record.pubkey)) continue
      next.unshift(record)
      inserted.add(record.pubkey)
    }
    return { accounts: next }
  })
}
