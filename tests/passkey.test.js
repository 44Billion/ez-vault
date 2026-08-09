import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import * as passkey from '../src/services/passkey.js'
import * as secrets from '../src/services/secrets.js'
import * as store from '../src/services/accounts-store.js'
import * as journal from '../src/services/account-mutation-journal.js'
import { filterVisibleAccounts, runSecretAccountMutation } from '../src/services/account-mutations.js'
import { bytesToHex, hexToBytes } from 'libp2r2p/base16'
import { bytesToBase64Url } from 'libp2r2p/base64'
import { getState } from '../src/services/storage/index.js'

const data = new Map()

globalThis.localStorage = {
  clear: () => data.clear(),
  getItem: key => data.has(String(key)) ? data.get(String(key)) : null,
  removeItem: key => { data.delete(String(key)) },
  setItem: (key, value) => { data.set(String(key), String(value)) }
}

if (!globalThis.crypto) globalThis.crypto = webcrypto
if (!globalThis.btoa) globalThis.btoa = s => Buffer.from(s, 'binary').toString('base64')
if (!globalThis.atob) globalThis.atob = s => Buffer.from(s, 'base64').toString('binary')

afterEach(() => {
  secrets.lock()
  globalThis.localStorage.clear()
})

function installCredentialMocks ({ prfBytes, onCreate, onGet, onPersist, userAgent = 'Node Test' }) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { hostname: 'localhost' },
      PublicKeyCredential: {}
    }
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent,
      storage: {
        persist: async () => {
          onPersist?.()
          return true
        }
      },
      credentials: {
        create: async options => {
          onCreate?.(options)
          return {
            rawId: new Uint8Array([1, 2, 3, 4]),
            authenticatorAttachment: 'platform',
            getClientExtensionResults: () => ({
              prf: { results: { first: prfBytes } }
            })
          }
        },
        get: async options => {
          if (onGet) return onGet(options)
          return {
            getClientExtensionResults: () => ({
              prf: { results: { first: prfBytes } },
              largeBlob: { written: true }
            })
          }
        }
      }
    }
  })
}

test('empty vault can register passkey and derive a device signer pubkey', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 1
  let createCalls = 0
  let persistCalls = 0

  installCredentialMocks({
    prfBytes,
    onPersist: () => { persistCalls++ },
    onCreate: options => {
      createCalls += 1
      const { extensions, rp, user } = options.publicKey
      const suffix = bytesToBase64Url(user.id).slice(0, 6)

      assert.deepEqual(rp, {
        id: 'localhost',
        name: '44billion · EZ Vault'
      })
      assert.equal(user.displayName, '44billion · EZ Vault')
      assert.equal(user.name, `44billion · EZ Vault (${suffix})`)
      assert.equal(user.id.byteLength, 64)
      assert.equal(new TextDecoder().decode(extensions.prf.eval.first), 'ez-vault')
    }
  })

  assert.deepEqual(store.list(), [])
  assert.equal(secrets.isUnlocked(), false)

  await passkey.ensureRegistered()
  const pubkey = await secrets.getDeviceSignerPubkey()

  assert.equal(createCalls, 1)
  assert.equal(persistCalls, 1)
  assert.equal(secrets.isUnlocked(), true)
  assert.match(pubkey, /^[0-9a-f]{64}$/)
  assert.equal(getState('ez-vault:passkey:credential-id'), 'AQIDBA')
  assert.match(getState('ez-vault:passkey:user-id'), /^[A-Za-z0-9_-]{86}$/)
  assert.equal(getState('ez-vault:passkey:prf'), bytesToHex(prfBytes))

  secrets.lock()
  await passkey.unlock()
  assert.equal(persistCalls, 2)
  assert.equal(data.size, 0)
})

test('passkey user name prefixes a known platform with the persistent product label', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 5
  let createdUser

  installCredentialMocks({
    prfBytes,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    onCreate: options => {
      createdUser = options.publicKey.user
    }
  })

  await passkey.ensureRegistered()

  const suffix = bytesToBase64Url(createdUser.id).slice(0, 6)
  assert.equal(
    createdUser.name,
    `44billion · EZ Vault · macOS / Safari (${suffix})`
  )
  assert.equal(createdUser.displayName, '44billion · EZ Vault')
})

test('writeSecretsBlob falls back to IndexedDB when secondary prompt is cancelled by default', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 2
  const cancelled = Object.assign(new Error('User cancelled'), { name: 'NotAllowedError' })

  installCredentialMocks({
    prfBytes,
    onGet: async () => { throw cancelled }
  })

  await passkey.ensureRegistered()
  await passkey.writeSecretsBlob()

  assert.ok(getState('ez-vault:passkey:blob'))
})

test('writeSecretsBlob can reject cancellation for destructive flows', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 3
  const cancelled = Object.assign(new Error('User cancelled'), { name: 'NotAllowedError' })

  installCredentialMocks({
    prfBytes,
    onGet: async () => { throw cancelled }
  })

  await passkey.ensureRegistered()
  await assert.rejects(
    passkey.writeSecretsBlob({ fallbackOnCancel: false }),
    /User cancelled/
  )

  assert.equal(getState('ez-vault:passkey:blob'), null)
})

test('secret account mutation finalizes only after the passkey write completes', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 6
  installCredentialMocks({ prfBytes })
  await passkey.ensureRegistered()

  let signalWriteStarted
  const writeStarted = new Promise(resolve => { signalWriteStarted = resolve })
  let finishWrite
  const pendingWrite = new Promise(resolve => { finishWrite = resolve })
  installCredentialMocks({
    prfBytes,
    onGet: options => {
      signalWriteStarted(options)
      return pendingWrite
    }
  })

  const secret = bytesToHex(generateSecretKey())
  const record = {
    type: 'nsec',
    pubkey: getPublicKey(hexToBytes(secret)),
    name: 'Pending account',
    picture: ''
  }
  const phases = []
  const unsubscribe = journal.subscribe(() => {
    if (!journal.read()) phases.push('clear')
  })

  const mutation = runSecretAccountMutation({
    operation: 'create-account',
    beforeAccounts: [],
    afterAccounts: [record],
    apply: async () => {
      phases.push('apply')
      await store.add(record)
      await secrets.setNsecSecret(record.pubkey, secret)
    },
    finalize: () => { phases.push('finalize') }
  })

  await writeStarted
  assert.deepEqual(phases, ['apply'])
  assert.deepEqual(store.get(record.pubkey), record)
  assert.deepEqual(filterVisibleAccounts(store.list()), [])
  assert.equal(journal.read()?.operation, 'create-account')

  finishWrite({
    getClientExtensionResults: () => ({ largeBlob: { written: true } })
  })
  await mutation
  unsubscribe()

  assert.deepEqual(phases, ['apply', 'finalize', 'clear'])
  assert.deepEqual(filterVisibleAccounts(store.list()), [record])
  assert.equal(journal.read(), null)
})

test('openSecrets decrypts NIP-44 v3 sealed largeBlob payloads', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 4

  installCredentialMocks({ prfBytes })
  await passkey.ensureRegistered()

  const secret = bytesToHex(generateSecretKey())
  const pubkey = getPublicKey(hexToBytes(secret))
  await store.add({ type: 'nsec', pubkey, name: '', picture: '' })
  await secrets.setNsecSecret(pubkey, secret)
  await secrets.getDeviceSignerPubkey()

  const ciphertext = secrets.sealCurrentEntries()
  assert.equal(Buffer.from(ciphertext, 'base64')[0], 3)

  installCredentialMocks({
    prfBytes,
    onGet: async () => ({
      getClientExtensionResults: () => ({
        prf: { results: { first: prfBytes } },
        largeBlob: { blob: new TextEncoder().encode(ciphertext) }
      })
    })
  })

  const entries = await passkey.openSecrets()
  assert.equal(entries.find(entry => entry.type === 'nsec' && entry.pubkey === pubkey)?.seckey, secret)
  assert.equal(entries.some(entry => entry.type === 'device-signer'), true)
})
