import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { generateSecretKey, getPublicKey } from 'nostr-tools'
import * as passkey from '../docs/services/passkey.js'
import * as secrets from '../docs/services/secrets.js'
import * as store from '../docs/services/accounts-store.js'
import { bytesToHex, hexToBytes } from '../docs/helpers/nostr/index.js'

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

function installCredentialMocks ({ prfBytes, onCreate, onGet }) {
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
      userAgent: 'Node Test',
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

  installCredentialMocks({
    prfBytes,
    onCreate: options => {
      createCalls += 1
      assert.equal(options.publicKey.rp.id, 'localhost')
    }
  })

  assert.deepEqual(store.list(), [])
  assert.equal(secrets.isUnlocked(), false)

  await passkey.ensureRegistered()
  const pubkey = await secrets.getDeviceSignerPubkey()

  assert.equal(createCalls, 1)
  assert.equal(secrets.isUnlocked(), true)
  assert.match(pubkey, /^[0-9a-f]{64}$/)
})

test('writeSecretsBlob falls back to localStorage when secondary prompt is cancelled by default', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 2
  const cancelled = Object.assign(new Error('User cancelled'), { name: 'NotAllowedError' })

  installCredentialMocks({
    prfBytes,
    onGet: async () => { throw cancelled }
  })

  await passkey.ensureRegistered()
  await passkey.writeSecretsBlob()

  assert.ok(globalThis.localStorage.getItem('ez-vault:passkey:blob'))
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

  assert.equal(globalThis.localStorage.getItem('ez-vault:passkey:blob'), null)
})

test('openSecrets decrypts NIP-44 v3 sealed largeBlob payloads', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 4

  installCredentialMocks({ prfBytes })
  await passkey.ensureRegistered()

  const secret = bytesToHex(generateSecretKey())
  const pubkey = getPublicKey(hexToBytes(secret))
  store.add({ type: 'nsec', pubkey, name: '', picture: '' })
  secrets.setNsecSecret(pubkey, secret)
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
