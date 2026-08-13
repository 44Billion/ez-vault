import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { generateSecretKey, getPublicKey } from 'libp2r2p/key'
import * as passkey from '../src/services/passkey.js'
import * as secrets from '../src/services/secrets.js'
import * as store from '../src/services/accounts-store.js'
import * as journal from '../src/services/account-mutation-journal.js'
import * as messengerLog from '../src/services/messenger-log/index.js'
import * as trustedSigners from '../src/services/trusted-signers.js'
import { filterVisibleAccounts, runSecretAccountMutation } from '../src/services/account-mutations.js'
import { bytesToHex, hexToBytes } from 'libp2r2p/base16'
import { bytesToBase64Url } from 'libp2r2p/base64'
import { appendMessengerLog, getState, updateState } from '../src/services/storage/index.js'

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
  passkey.setFallbackDecisionForTests(null)
  globalThis.localStorage.clear()
})

function installCredentialMocks ({
  prfBytes,
  createPrfBytes = prfBytes,
  largeBlobSupported = true,
  includeLargeBlobResult = true,
  onCreate,
  onGet,
  onPersist,
  authenticatorAttachment = 'platform',
  transports = ['internal'],
  exposeTransports = true,
  userAgent = 'Node Test'
}) {
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
            authenticatorAttachment,
            response: exposeTransports
              ? { getTransports: () => [...transports] }
              : {},
            getClientExtensionResults: () => ({
              prf: createPrfBytes
                ? { results: { first: createPrfBytes } }
                : { enabled: true },
              ...(includeLargeBlobResult && {
                largeBlob: { supported: largeBlobSupported }
              })
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

async function enterLocalMode () {
  passkey.setFallbackDecisionForTests(() => 'local')
  installCredentialMocks({
    prfBytes: null,
    createPrfBytes: null,
    onCreate: () => { throw Object.assign(new Error('Unavailable'), { name: 'NotAllowedError' }) }
  })
  await passkey.ensureRegistered()
  passkey.setFallbackDecisionForTests(null)
}

test('empty vault can register passkey and derive a device signer pubkey', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 1
  let createCalls = 0
  let getCalls = 0
  let persistCalls = 0

  installCredentialMocks({
    prfBytes,
    onPersist: () => { persistCalls++ },
    onGet: options => {
      getCalls++
      assert.equal(options.publicKey.userVerification, getCalls === 1 ? 'discouraged' : 'required')
      return {
        getClientExtensionResults: () => ({ prf: { results: { first: prfBytes } } })
      }
    },
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
      assert.deepEqual(extensions.largeBlob, { support: 'preferred' })
      assert.equal(extensions.credProps, true)
      assert.equal(options.publicKey.authenticatorSelection.authenticatorAttachment, undefined)
      assert.deepEqual(options.publicKey.hints, ['client-device', 'hybrid', 'security-key'])
    }
  })

  assert.deepEqual(store.list(), [])
  assert.equal(secrets.isUnlocked(), false)

  await passkey.ensureRegistered()
  const pubkey = await secrets.getDeviceSignerPubkey()

  assert.equal(createCalls, 1)
  assert.equal(getCalls, 1)
  assert.equal(persistCalls, 1)
  assert.equal(secrets.isUnlocked(), true)
  assert.match(pubkey, /^[0-9a-f]{64}$/)
  assert.equal(getState('ez-vault:passkey:credential-id'), 'AQIDBA')
  assert.deepEqual(getState('ez-vault:passkey:transports'), ['internal'])
  assert.match(getState('ez-vault:passkey:user-id'), /^[A-Za-z0-9_-]{86}$/)
  assert.equal(getState('ez-vault:passkey:prf'), null)
  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'idb',
    largeBlobSupport: 'supported',
    cleanupPending: false
  })

  secrets.lock()
  await passkey.unlock()
  assert.equal(getCalls, 2)
  assert.equal(persistCalls, 2)
  assert.ok(getState('ez-vault:passkey:blob'))
  assert.equal(getState('ez-vault:passkey:prf'), null)
  assert.equal(data.size, 0)
})

test('cross-platform credentials retain their transports for follow-up and unlock assertions', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 24
  const requestedTransports = []

  installCredentialMocks({
    prfBytes,
    authenticatorAttachment: 'cross-platform',
    transports: ['usb', 'hybrid'],
    onGet: options => {
      requestedTransports.push(options.publicKey.allowCredentials[0].transports)
      return {
        getClientExtensionResults: () => ({ prf: { results: { first: prfBytes } } })
      }
    }
  })

  await passkey.ensureRegistered()
  secrets.lock()
  await passkey.unlock()

  assert.deepEqual(getState('ez-vault:passkey:transports'), ['usb', 'hybrid'])
  assert.deepEqual(requestedTransports, [
    ['usb', 'hybrid'],
    ['usb', 'hybrid']
  ])
})

test('credentials without transport metadata do not receive a restrictive transport hint', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 25
  const descriptors = []

  installCredentialMocks({
    prfBytes,
    authenticatorAttachment: null,
    exposeTransports: false,
    onGet: options => {
      descriptors.push(options.publicKey.allowCredentials[0])
      return {
        getClientExtensionResults: () => ({ prf: { results: { first: prfBytes } } })
      }
    }
  })

  await passkey.ensureRegistered()
  secrets.lock()
  await passkey.unlock()

  assert.deepEqual(getState('ez-vault:passkey:transports'), [])
  assert.equal(descriptors[0].transports, undefined)
  assert.equal(descriptors[1].transports, undefined)
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

test('persistSecretsBlob writes directly to IndexedDB without another passkey ceremony', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 2
  let getCalls = 0

  installCredentialMocks({
    prfBytes,
    onGet: async () => {
      getCalls++
      return {
        getClientExtensionResults: () => ({ prf: { results: { first: prfBytes } } })
      }
    }
  })

  await passkey.ensureRegistered()
  assert.equal(getCalls, 1)
  await passkey.persistSecretsBlob()

  assert.ok(getState('ez-vault:passkey:blob'))
  assert.equal(getCalls, 1)
  assert.equal(getState('ez-vault:passkey:prf'), null)
})

test('create-only authenticators keep PRF in IDB and ciphertext in largeBlob', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 11
  let getCalls = 0
  let remoteCiphertext = ''
  installCredentialMocks({
    prfBytes,
    onGet: async options => {
      getCalls++
      const write = options.publicKey.extensions.largeBlob?.write
      if (write) remoteCiphertext = new TextDecoder().decode(write)
      return {
        getClientExtensionResults: () => ({
          ...(write
            ? { largeBlob: { written: true } }
            : remoteCiphertext
              ? { largeBlob: { blob: new TextEncoder().encode(remoteCiphertext) } }
              : {})
        })
      }
    }
  })
  await passkey.ensureRegistered()
  assert.equal(getCalls, 1)
  assert.equal(getState('ez-vault:passkey:prf'), bytesToHex(prfBytes))
  assert.equal(getState('ez-vault:passkey:storage-policy').mode, 'largeblob')
  await passkey.persistSecretsBlob()
  assert.equal(getCalls, 2)
  assert.ok(remoteCiphertext)
  assert.equal(getState('ez-vault:passkey:blob'), null)
  secrets.lock()

  await passkey.unlock()

  assert.equal(getCalls, 3)
  assert.equal(getState('ez-vault:passkey:prf'), bytesToHex(prfBytes))
  assert.equal(secrets.isUnlocked(), true)
})

test('create-only authenticator without largeBlob uses IDB compatibility mode', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 16
  let getCalls = 0
  installCredentialMocks({
    prfBytes,
    largeBlobSupported: false,
    onGet: async () => {
      getCalls++
      return { getClientExtensionResults: () => ({}) }
    }
  })

  await passkey.ensureRegistered()
  await passkey.persistSecretsBlob()

  assert.equal(getCalls, 1)
  assert.ok(getState('ez-vault:passkey:blob'))
  assert.equal(getState('ez-vault:passkey:prf'), bytesToHex(prfBytes))
  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'idb-compat',
    largeBlobSupport: 'unsupported',
    cleanupPending: false
  })
})

test('missing largeBlob capability output is recorded as unknown compatibility mode', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 26
  installCredentialMocks({
    prfBytes,
    includeLargeBlobResult: false,
    onGet: async () => ({ getClientExtensionResults: () => ({}) })
  })

  await passkey.ensureRegistered()

  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'idb-compat',
    largeBlobSupport: 'unknown',
    cleanupPending: false
  })
})

test('cancelled post-registration assertion stores the create-time PRF backup', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 12
  const cancelled = Object.assign(new Error('User cancelled'), { name: 'NotAllowedError' })
  installCredentialMocks({
    prfBytes,
    onGet: async () => { throw cancelled }
  })

  await passkey.ensureRegistered()

  assert.equal(getState('ez-vault:passkey:prf'), bytesToHex(prfBytes))
  assert.equal(secrets.isUnlocked(), true)
})

test('assertion-only PRF registration succeeds without a plaintext backup', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 15
  installCredentialMocks({ prfBytes, createPrfBytes: null })

  await passkey.ensureRegistered()

  assert.equal(getState('ez-vault:passkey:prf'), null)
  assert.equal(secrets.isUnlocked(), true)
})

test('registration without either PRF offers and can enter local mode', async () => {
  let fallbackError
  passkey.setFallbackDecisionForTests(err => {
    fallbackError = err
    return 'local'
  })
  installCredentialMocks({
    prfBytes: new Uint8Array(32),
    createPrfBytes: null,
    onGet: async () => ({ getClientExtensionResults: () => ({}) })
  })

  await passkey.ensureRegistered()

  assert.match(fallbackError.message, /PASSKEY_PRF_REQUIRED/)
  assert.equal(getState('ez-vault:passkey:credential-id'), null)
  assert.equal(getState('ez-vault:passkey:prf'), null)
  assert.match(getState('ez-vault:passkey:local-key'), /^[0-9a-f]{64}$/)
  assert.ok(getState('ez-vault:passkey:blob'))
  assert.equal(secrets.isUnlocked(), true)
})

test('missing WebAuthn API offers local mode', async () => {
  Object.defineProperty(globalThis, 'PublicKeyCredential', { configurable: true, value: undefined })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { hostname: 'localhost' } }
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Node Test', storage: { persist: async () => true } }
  })
  let fallbackError
  passkey.setFallbackDecisionForTests(err => {
    fallbackError = err
    return 'local'
  })

  await passkey.ensureRegistered()

  assert.match(fallbackError.message, /PASSKEY_API_UNAVAILABLE/)
  assert.match(getState('ez-vault:passkey:local-key'), /^[0-9a-f]{64}$/)
  assert.equal(secrets.isUnlocked(), true)
})

test('a refused registration can be retried without entering local mode', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 27
  let creates = 0
  let choices = 0
  passkey.setFallbackDecisionForTests(() => {
    choices++
    return 'retry'
  })
  installCredentialMocks({
    prfBytes,
    onCreate: () => {
      creates++
      if (creates === 1) throw Object.assign(new Error('Cancelled'), { name: 'NotAllowedError' })
    }
  })

  await passkey.ensureRegistered()

  assert.equal(creates, 2)
  assert.equal(choices, 1)
  assert.equal(getState('ez-vault:passkey:local-key'), null)
  assert.equal(getState('ez-vault:passkey:storage-policy').mode, 'idb')
})

test('mandatory passkey protection never offers the local fallback', async () => {
  await enterLocalMode()
  let fallbackChoices = 0
  passkey.setFallbackDecisionForTests(() => {
    fallbackChoices++
    return 'local'
  })
  installCredentialMocks({
    prfBytes: null,
    createPrfBytes: null,
    onCreate: () => { throw Object.assign(new Error('Cancelled'), { name: 'NotAllowedError' }) }
  })

  await assert.rejects(passkey.requirePasskey(), { name: 'NotAllowedError' })

  assert.equal(fallbackChoices, 0)
  assert.equal(passkey.isUnprotectedLocalVault(), true)
  assert.equal(secrets.isUnlocked(), true)
})

test('mandatory passkey protection is a no-op for an unlocked protected vault', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 33
  let createCalls = 0
  let getCalls = 0
  installCredentialMocks({
    prfBytes,
    onCreate: () => { createCalls++ },
    onGet: async () => {
      getCalls++
      return { getClientExtensionResults: () => ({ prf: { results: { first: prfBytes } } }) }
    }
  })

  await passkey.ensureRegistered()
  await passkey.requirePasskey()

  assert.equal(createCalls, 1)
  assert.equal(getCalls, 1)
})

test('concurrent mandatory protection requests share one promotion ceremony', async () => {
  await enterLocalMode()
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 34
  let createCalls = 0
  installCredentialMocks({
    prfBytes,
    onCreate: () => { createCalls++ }
  })

  await Promise.all([passkey.requirePasskey(), passkey.requirePasskey()])

  assert.equal(createCalls, 1)
  assert.equal(passkey.hasPasskey(), true)
  assert.equal(getState('ez-vault:passkey:local-key'), null)
})

test('expected lock-time registration failures are classified narrowly', () => {
  assert.equal(passkey.isExpectedPasskeyRegistrationFailure(new Error('PASSKEY_API_UNAVAILABLE')), true)
  assert.equal(passkey.isExpectedPasskeyRegistrationFailure(new Error('PASSKEY_PRF_REQUIRED')), true)
  assert.equal(passkey.isExpectedPasskeyRegistrationFailure(Object.assign(new Error(), { name: 'NotAllowedError' })), true)
  assert.equal(passkey.isExpectedPasskeyRegistrationFailure(new Error('PASSKEY_PRF_MISMATCH')), false)
  assert.equal(passkey.isExpectedPasskeyRegistrationFailure(new Error('IDB_WRITE_FAILED')), false)
})

test('explicit local continuation never downgrades a passkey vault', async () => {
  await passkey.continueWithoutPasskey()
  assert.equal(passkey.isUnprotectedLocalVault(), true)

  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 35
  installCredentialMocks({ prfBytes })
  await passkey.requirePasskey()

  assert.throws(() => passkey.continueWithoutPasskey(), /PASSKEY_DOWNGRADE_FORBIDDEN/)
})

test('local mode opens current secrets without WebAuthn', async () => {
  await enterLocalMode()
  assert.equal(passkey.isUnprotectedLocalVault(), true)
  const seckey = bytesToHex(generateSecretKey())
  const pubkey = getPublicKey(hexToBytes(seckey))
  await secrets.setNsecSecret(pubkey, seckey)
  await passkey.persistSecretsBlob()
  let gets = 0
  navigator.credentials.get = async () => { gets++; throw new Error('must not prompt') }

  const entries = await passkey.openSecrets()

  assert.equal(gets, 0)
  assert.equal(entries.find(entry => entry.pubkey === pubkey)?.seckey, seckey)
})

test('local mode restores automatically on a later startup', async () => {
  await enterLocalMode()
  const seckey = bytesToHex(generateSecretKey())
  const pubkey = getPublicKey(hexToBytes(seckey))
  await secrets.setNsecSecret(pubkey, seckey)
  await passkey.persistSecretsBlob()
  secrets.lock()

  await passkey.initializeVaultProtection()

  assert.equal(secrets.isUnlocked(), true)
  assert.deepEqual(secrets.listSecretRefs(), [{ type: 'nsec', pubkey }])
})

test('local mode promotion reciphers every durable sensitive payload', async () => {
  await enterLocalMode()
  const seckey = bytesToHex(generateSecretKey())
  const pubkey = getPublicKey(hexToBytes(seckey))
  const contentSeckey = bytesToHex(generateSecretKey())
  const trustedPubkey = getPublicKey(generateSecretKey())
  await secrets.setNsecSecret(pubkey, seckey)
  await secrets.setContentKeySecret(pubkey, contentSeckey, 123)
  await trustedSigners.add({ pubkey: trustedPubkey, platform: 'Test device' })
  await messengerLog.append({ method: 'sign_event', status: 'success', params: ['sensitive'] })
  await appendMessengerLog({
    ts: 1,
    appKey: 'launcher',
    method: 'corrupt',
    status: 'failure',
    sealed: 'not-a-valid-ciphertext'
  })
  await passkey.persistSecretsBlob()

  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 28
  installCredentialMocks({ prfBytes })
  await passkey.ensureRegistered()

  assert.equal(getState('ez-vault:passkey:local-key'), null)
  assert.equal(getState('ez-vault:passkey:upgrade-pending'), null)
  assert.equal(getState('ez-vault:passkey:storage-policy').mode, 'idb')
  assert.equal(getState('ez-vault:passkey:prf'), null)

  secrets.lock()
  await passkey.unlock()
  assert.deepEqual(secrets.listSecretRefs(), [{ type: 'nsec', pubkey }])
  assert.equal(secrets.listContentKeys(pubkey).length, 1)
  assert.equal(trustedSigners.list()[0].pubkey, trustedPubkey)
  const logs = await messengerLog.list()
  assert.equal(logs.some(entry => entry.method === 'corrupt'), false)
  assert.deepEqual(logs.find(entry => entry.method === 'sign_event')?.params, ['sensitive'])
})

test('create-only promotion keeps a reciphered IDB fallback until largeBlob sync', async () => {
  await enterLocalMode()
  const seckey = bytesToHex(generateSecretKey())
  const pubkey = getPublicKey(hexToBytes(seckey))
  await secrets.setNsecSecret(pubkey, seckey)
  await passkey.persistSecretsBlob()

  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 29
  let getCalls = 0
  let remoteCiphertext = ''
  installCredentialMocks({
    prfBytes,
    onGet: async options => {
      getCalls++
      const write = options.publicKey.extensions.largeBlob?.write
      if (write) remoteCiphertext = new TextDecoder().decode(write)
      return {
        getClientExtensionResults: () => write ? { largeBlob: { written: true } } : {}
      }
    }
  })

  await passkey.ensureRegistered()
  assert.equal(getCalls, 1)
  assert.equal(getState('ez-vault:passkey:storage-policy').mode, 'largeblob')
  assert.equal(getState('ez-vault:passkey:prf'), bytesToHex(prfBytes))
  assert.ok(getState('ez-vault:passkey:blob'))
  assert.equal(getState('ez-vault:passkey:local-key'), null)

  secrets.lock()
  await passkey.unlock()
  assert.equal(getCalls, 2)
  assert.ok(remoteCiphertext)
  assert.equal(getState('ez-vault:passkey:blob'), null)
  assert.deepEqual(secrets.listSecretRefs(), [{ type: 'nsec', pubkey }])
})

test('create-only promotion uses IDB compatibility mode without largeBlob support', async () => {
  await enterLocalMode()
  const seckey = bytesToHex(generateSecretKey())
  const pubkey = getPublicKey(hexToBytes(seckey))
  await secrets.setNsecSecret(pubkey, seckey)
  await passkey.persistSecretsBlob()

  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 32
  installCredentialMocks({
    prfBytes,
    largeBlobSupported: false,
    onGet: async () => ({ getClientExtensionResults: () => ({}) })
  })

  await passkey.ensureRegistered()

  assert.equal(getState('ez-vault:passkey:storage-policy').mode, 'idb-compat')
  assert.equal(getState('ez-vault:passkey:prf'), bytesToHex(prfBytes))
  assert.ok(getState('ez-vault:passkey:blob'))
  assert.equal(getState('ez-vault:passkey:local-key'), null)
  assert.deepEqual(secrets.listSecretRefs(), [{ type: 'nsec', pubkey }])
})

test('essential sidecar corruption aborts promotion before staging', async () => {
  await enterLocalMode()
  const priorLocalKey = getState('ez-vault:passkey:local-key')
  await updateState({ set: { 'ez-vault:trusted-signers': 'corrupt' } })
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 31
  installCredentialMocks({ prfBytes })

  await assert.rejects(passkey.ensureRegistered())

  assert.equal(getState('ez-vault:passkey:local-key'), priorLocalKey)
  assert.equal(getState('ez-vault:passkey:credential-id'), null)
  assert.equal(getState('ez-vault:passkey:upgrade-pending'), null)
  assert.equal(secrets.isUnlocked(), true)
})

test('vault transition barrier delays activity-log encryption until release', async () => {
  await enterLocalMode()
  const release = secrets.beginVaultTransition()
  let completed = false
  const pending = messengerLog.append({ method: 'barrier', params: ['secret'] }).then(() => { completed = true })
  await Promise.resolve()
  assert.equal(completed, false)

  release()
  await pending

  assert.equal(completed, true)
  assert.deepEqual((await messengerLog.list())[0].params, ['secret'])
})

test('vault transition barrier delays the main secrets ciphertext write', async () => {
  await enterLocalMode()
  const release = secrets.beginVaultTransition()
  let completed = false
  const pending = passkey.persistSecretsBlob().then(() => { completed = true })
  await Promise.resolve()
  assert.equal(completed, false)

  release()
  await pending

  assert.equal(completed, true)
  assert.ok(getState('ez-vault:passkey:blob'))
})

test('vault transition barrier delays secret account mutation snapshots', async () => {
  await enterLocalMode()
  const release = secrets.beginVaultTransition()
  let applied = false
  const pending = runSecretAccountMutation({
    operation: 'barrier-test',
    apply: async () => { applied = true },
    finalize: async () => {}
  })
  await Promise.resolve()
  assert.equal(applied, false)

  release()
  await pending

  assert.equal(applied, true)
})

test('a staged promotion stays locked on reload and resumes with its passkey', async () => {
  await enterLocalMode()
  const seckey = bytesToHex(generateSecretKey())
  const pubkey = getPublicKey(hexToBytes(seckey))
  await secrets.setNsecSecret(pubkey, seckey)
  await passkey.persistSecretsBlob()
  await updateState({
    set: {
      'ez-vault:passkey:credential-id': 'AQIDBA',
      'ez-vault:passkey:transports': [],
      'ez-vault:passkey:upgrade-pending': {
        targetPolicy: { mode: 'idb', largeBlobSupport: 'supported', cleanupPending: false }
      }
    }
  })
  secrets.lock()

  await passkey.initializeVaultProtection()
  assert.equal(secrets.isUnlocked(), false)

  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 30
  installCredentialMocks({ prfBytes })
  await passkey.unlock()

  assert.equal(getState('ez-vault:passkey:local-key'), null)
  assert.equal(getState('ez-vault:passkey:upgrade-pending'), null)
  assert.deepEqual(secrets.listSecretRefs(), [{ type: 'nsec', pubkey }])
})

test('registration rejects inconsistent PRF outputs from create and get', async () => {
  const createPrfBytes = new Uint8Array(32)
  createPrfBytes[0] = 13
  const assertionPrfBytes = new Uint8Array(32)
  assertionPrfBytes[0] = 14
  let fallbackOffered = false
  passkey.setFallbackDecisionForTests(() => {
    fallbackOffered = true
    return 'local'
  })
  installCredentialMocks({ prfBytes: assertionPrfBytes, createPrfBytes })

  await assert.rejects(passkey.ensureRegistered(), /PASSKEY_PRF_MISMATCH/)

  assert.equal(getState('ez-vault:passkey:credential-id'), null)
  assert.equal(getState('ez-vault:passkey:prf'), null)
  assert.equal(secrets.isUnlocked(), false)
  assert.equal(fallbackOffered, false)
})

test('secret account mutation in IDB mode persists without another WebAuthn ceremony', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 6
  let getCalls = 0

  installCredentialMocks({
    prfBytes,
    onGet: async () => {
      getCalls++
      return {
        getClientExtensionResults: () => ({ prf: { results: { first: prfBytes } } })
      }
    }
  })
  await passkey.ensureRegistered()
  assert.equal(getCalls, 1)

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

  await mutation
  unsubscribe()

  assert.deepEqual(phases, ['apply', 'finalize', 'clear'])
  assert.deepEqual(filterVisibleAccounts(store.list()), [record])
  assert.equal(journal.read(), null)
  assert.ok(getState('ez-vault:passkey:blob'))
  assert.equal(getCalls, 1)
})

test('largeBlob mutation finalizes local state before opening its write assertion', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 24
  let getCalls = 0
  const phases = []
  installCredentialMocks({
    prfBytes,
    onGet: async () => {
      getCalls++
      if (getCalls === 1) return { getClientExtensionResults: () => ({}) }
      phases.push('largeblob-write')
      assert.deepEqual(phases, ['apply', 'finalize', 'largeblob-write'])
      return {
        getClientExtensionResults: () => ({ largeBlob: { written: true } })
      }
    }
  })
  await passkey.ensureRegistered()

  const secret = bytesToHex(generateSecretKey())
  const record = {
    type: 'nsec',
    pubkey: getPublicKey(hexToBytes(secret)),
    name: 'Create-only account',
    picture: ''
  }
  await runSecretAccountMutation({
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

  assert.equal(getCalls, 2)
  assert.equal(getState('ez-vault:passkey:blob'), null)
  assert.equal(journal.read(), null)
})

test('non-cancellation largeBlob mutation failure rolls back finalized account state', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 25
  let getCalls = 0
  installCredentialMocks({
    prfBytes,
    onGet: async () => {
      getCalls++
      if (getCalls === 1) return { getClientExtensionResults: () => ({}) }
      throw new Error('authenticator failed')
    }
  })
  await passkey.ensureRegistered()

  const secret = bytesToHex(generateSecretKey())
  const record = {
    type: 'nsec',
    pubkey: getPublicKey(hexToBytes(secret)),
    name: 'Rolled-back account',
    picture: ''
  }
  await assert.rejects(runSecretAccountMutation({
    operation: 'create-account',
    beforeAccounts: [],
    afterAccounts: [record],
    apply: async () => {
      await store.add(record)
      await secrets.setNsecSecret(record.pubkey, secret)
    },
    finalize: () => store.applyRecords([record.pubkey], [record])
  }), /authenticator failed/)

  assert.equal(store.get(record.pubkey), null)
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey: record.pubkey }), false)
  assert.equal(getState('ez-vault:passkey:blob'), null)
  assert.equal(journal.read(), null)
})

test('failed finalization restores accounts, memory, and prior IndexedDB ciphertext', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 3
  installCredentialMocks({ prfBytes })
  await passkey.ensureRegistered()
  await passkey.persistSecretsBlob()
  const priorCiphertext = getState('ez-vault:passkey:blob')

  const secret = bytesToHex(generateSecretKey())
  const record = {
    type: 'nsec',
    pubkey: getPublicKey(hexToBytes(secret)),
    name: 'Rollback account',
    picture: ''
  }

  await assert.rejects(runSecretAccountMutation({
    operation: 'create-account',
    beforeAccounts: [],
    afterAccounts: [record],
    apply: async () => {
      await store.add(record)
      await secrets.setNsecSecret(record.pubkey, secret)
    },
    finalize: () => { throw new Error('finalize failed') }
  }), /finalize failed/)

  assert.equal(store.get(record.pubkey), null)
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey: record.pubkey }), false)
  assert.equal(getState('ez-vault:passkey:blob'), priorCiphertext)
  assert.equal(journal.read(), null)
})

test('failed local-mode mutation restores memory and its prior IDB ciphertext', async () => {
  await enterLocalMode()
  await passkey.persistSecretsBlob()
  const priorCiphertext = getState('ez-vault:passkey:blob')
  const secret = bytesToHex(generateSecretKey())
  const record = {
    type: 'nsec',
    pubkey: getPublicKey(hexToBytes(secret)),
    name: 'Local rollback account',
    picture: ''
  }

  await assert.rejects(runSecretAccountMutation({
    operation: 'create-account-local',
    beforeAccounts: [],
    afterAccounts: [record],
    apply: async () => {
      await store.add(record)
      await secrets.setNsecSecret(record.pubkey, secret)
    },
    finalize: () => { throw new Error('local finalize failed') }
  }), /local finalize failed/)

  assert.equal(store.get(record.pubkey), null)
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey: record.pubkey }), false)
  assert.equal(getState('ez-vault:passkey:blob'), priorCiphertext)
  assert.equal(journal.read(), null)
})

test('cancelled largeBlob write completes with an authoritative IDB fallback', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 17
  let getCalls = 0
  installCredentialMocks({
    prfBytes,
    onGet: async () => {
      getCalls++
      if (getCalls === 1) return { getClientExtensionResults: () => ({}) }
      throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' })
    }
  })

  await passkey.ensureRegistered()
  await passkey.persistSecretsBlob()

  assert.equal(getCalls, 2)
  assert.ok(getState('ez-vault:passkey:blob'))
  assert.equal(getState('ez-vault:passkey:storage-policy').mode, 'largeblob')
})

test('declined largeBlob write stores an IDB fallback for a future retry', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 18
  let getCalls = 0
  installCredentialMocks({
    prfBytes,
    onGet: async () => {
      getCalls++
      return {
        getClientExtensionResults: () => getCalls === 1
          ? {}
          : { largeBlob: { written: false } }
      }
    }
  })

  await passkey.ensureRegistered()
  await passkey.persistSecretsBlob()

  assert.ok(getState('ez-vault:passkey:blob'))
  assert.equal(getState('ez-vault:passkey:storage-policy').mode, 'largeblob')
})

test('non-cancellation largeBlob error restores the previous local fallback', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 19
  secrets.unlock(prfBytes, null)
  const previous = secrets.sealCurrentEntries()
  await installPolicyState(prfBytes, {
    mode: 'largeblob',
    largeBlobSupport: 'supported',
    cleanupPending: false
  }, { 'ez-vault:passkey:blob': previous })
  installCredentialMocks({
    prfBytes,
    onGet: async () => { throw new Error('authenticator failed') }
  })

  const nextSecret = generateSecretKey()
  await secrets.setNsecSecret(getPublicKey(nextSecret), bytesToHex(nextSecret))
  await assert.rejects(passkey.persistSecretsBlob(), /authenticator failed/)

  assert.equal(getState('ez-vault:passkey:blob'), previous)
})

test('PRF appearing during largeBlob write promotes atomically to IDB mode', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 20
  let getCalls = 0
  installCredentialMocks({
    prfBytes,
    onGet: async () => {
      getCalls++
      return {
        getClientExtensionResults: () => getCalls === 1
          ? {}
          : {
              prf: { results: { first: prfBytes } },
              largeBlob: { written: true }
            }
      }
    }
  })

  await passkey.ensureRegistered()
  await passkey.persistSecretsBlob()

  assert.equal(getState('ez-vault:passkey:prf'), null)
  assert.ok(getState('ez-vault:passkey:blob'))
  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'idb',
    largeBlobSupport: 'supported',
    cleanupPending: true
  })
})

async function installLegacyState (prfBytes, extraState = {}) {
  await updateState({
    set: {
      'ez-vault:passkey:credential-id': 'AQIDBA',
      'ez-vault:passkey:prf': bytesToHex(prfBytes),
      ...extraState
    }
  })
}

async function installPolicyState (prfBytes, policy, extraState = {}, { backup = true } = {}) {
  await updateState({
    set: {
      'ez-vault:passkey:credential-id': 'AQIDBA',
      'ez-vault:passkey:storage-policy': policy,
      ...(backup ? { 'ez-vault:passkey:prf': bytesToHex(prfBytes) } : {}),
      ...extraState
    }
  })
}

async function ciphertextWithNsec (prfBytes, secret) {
  secrets.unlock(prfBytes, null)
  const pubkey = getPublicKey(hexToBytes(secret))
  await secrets.setNsecSecret(pubkey, secret)
  const ciphertext = secrets.sealCurrentEntries()
  secrets.lock()
  return { ciphertext, pubkey }
}

test('largeBlob mode retries an IDB fallback during the next unlock', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 21
  const local = await ciphertextWithNsec(prfBytes, bytesToHex(generateSecretKey()))
  await installPolicyState(prfBytes, {
    mode: 'largeblob',
    largeBlobSupport: 'supported',
    cleanupPending: false
  }, { 'ez-vault:passkey:blob': local.ciphertext })
  let request
  installCredentialMocks({
    prfBytes,
    onGet: async options => {
      request = options
      return {
        getClientExtensionResults: () => ({ largeBlob: { written: true } })
      }
    }
  })

  await passkey.unlock()

  assert.equal(new TextDecoder().decode(request.publicKey.extensions.largeBlob.write), local.ciphertext)
  assert.equal(getState('ez-vault:passkey:blob'), null)
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey: local.pubkey }), true)
})

test('IDB compatibility mode promotes when a later assertion returns PRF', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 22
  const local = await ciphertextWithNsec(prfBytes, bytesToHex(generateSecretKey()))
  await installPolicyState(prfBytes, {
    mode: 'idb-compat',
    largeBlobSupport: 'unsupported',
    cleanupPending: false
  }, { 'ez-vault:passkey:blob': local.ciphertext })
  installCredentialMocks({ prfBytes })

  await passkey.unlock()

  assert.equal(getState('ez-vault:passkey:prf'), null)
  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'idb',
    largeBlobSupport: 'unsupported',
    cleanupPending: false
  })
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey: local.pubkey }), true)
})

test('a future assertion PRF mismatch preserves the compatibility backup', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 27
  const mismatchedPrf = new Uint8Array(32)
  mismatchedPrf[0] = 28
  const local = await ciphertextWithNsec(prfBytes, bytesToHex(generateSecretKey()))
  await installPolicyState(prfBytes, {
    mode: 'idb-compat',
    largeBlobSupport: 'unsupported',
    cleanupPending: false
  }, { 'ez-vault:passkey:blob': local.ciphertext })
  installCredentialMocks({ prfBytes: mismatchedPrf })

  await assert.rejects(passkey.unlock(), /PASSKEY_PRF_MISMATCH/)

  assert.equal(getState('ez-vault:passkey:prf'), bytesToHex(prfBytes))
  assert.equal(getState('ez-vault:passkey:blob'), local.ciphertext)
  assert.equal(getState('ez-vault:passkey:storage-policy').mode, 'idb-compat')
  assert.equal(secrets.isUnlocked(), false)
})

test('production largeBlob remains authoritative when assertions still omit PRF', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 23
  const remote = await ciphertextWithNsec(prfBytes, bytesToHex(generateSecretKey()))
  await installLegacyState(prfBytes)
  installCredentialMocks({
    prfBytes,
    onGet: async () => ({
      getClientExtensionResults: () => ({
        largeBlob: { blob: new TextEncoder().encode(remote.ciphertext) }
      })
    })
  })

  await passkey.unlock()

  assert.equal(getState('ez-vault:passkey:blob'), null)
  assert.equal(getState('ez-vault:passkey:prf'), bytesToHex(prfBytes))
  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'largeblob',
    largeBlobSupport: 'supported',
    cleanupPending: false
  })
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey: remote.pubkey }), true)
})

test('legacy largeBlob migrates before unlock and is erased on the next assertion', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 4
  const secret = bytesToHex(generateSecretKey())
  const { ciphertext, pubkey } = await ciphertextWithNsec(prfBytes, secret)
  await installLegacyState(prfBytes)
  const requests = []

  installCredentialMocks({
    prfBytes,
    onGet: async options => {
      requests.push(options)
      if (options.publicKey.extensions.largeBlob?.read) {
        return {
          getClientExtensionResults: () => ({
            prf: { results: { first: prfBytes } },
            largeBlob: { blob: new TextEncoder().encode(ciphertext) }
          })
        }
      }
      return {
        getClientExtensionResults: () => ({
          prf: { results: { first: prfBytes } },
          largeBlob: { written: true }
        })
      }
    }
  })

  await passkey.unlock()
  assert.equal(getState('ez-vault:passkey:blob'), ciphertext)
  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'idb',
    largeBlobSupport: 'supported',
    cleanupPending: true
  })
  assert.equal(getState('ez-vault:passkey:prf'), null)
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey }), true)

  secrets.lock()
  await passkey.unlock()
  assert.deepEqual(requests[1].publicKey.extensions.largeBlob.write, new Uint8Array(0))
  assert.equal(getState('ez-vault:passkey:storage-policy').cleanupPending, false)

  secrets.lock()
  await passkey.unlock()
  assert.equal(requests[2].publicKey.extensions.largeBlob, undefined)
})

test('existing IndexedDB ciphertext wins over a divergent legacy largeBlob', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 7
  const localSecret = bytesToHex(generateSecretKey())
  const staleSecret = bytesToHex(generateSecretKey())
  const local = await ciphertextWithNsec(prfBytes, localSecret)
  const stale = await ciphertextWithNsec(prfBytes, staleSecret)
  await installLegacyState(prfBytes, { 'ez-vault:passkey:blob': local.ciphertext })

  installCredentialMocks({
    prfBytes,
    onGet: async () => ({
      getClientExtensionResults: () => ({
        prf: { results: { first: prfBytes } },
        largeBlob: { blob: new TextEncoder().encode(stale.ciphertext) }
      })
    })
  })

  await passkey.unlock()
  assert.equal(getState('ez-vault:passkey:blob'), local.ciphertext)
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey: local.pubkey }), true)
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey: stale.pubkey }), false)
  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'idb',
    largeBlobSupport: 'supported',
    cleanupPending: true
  })
})

test('absent local and legacy blobs persist an encrypted empty vault', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 8
  await installLegacyState(prfBytes)
  let request
  installCredentialMocks({
    prfBytes,
    onGet: async options => {
      request = options
      return { getClientExtensionResults: () => ({ prf: { results: { first: prfBytes } } }) }
    }
  })

  await passkey.unlock()
  assert.equal(request.publicKey.extensions.largeBlob.read, true)
  assert.ok(getState('ez-vault:passkey:blob'))
  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'idb',
    largeBlobSupport: 'unknown',
    cleanupPending: false
  })
  assert.deepEqual(secrets.listSecretRefs(), [])
})

test('failed legacy cleanup neither blocks unlock nor changes local ciphertext', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 9
  const local = await ciphertextWithNsec(prfBytes, bytesToHex(generateSecretKey()))
  await installPolicyState(prfBytes, {
    mode: 'idb',
    largeBlobSupport: 'supported',
    cleanupPending: true
  }, {
    'ez-vault:passkey:blob': local.ciphertext
  }, { backup: false })
  installCredentialMocks({
    prfBytes,
    onGet: async () => ({
      getClientExtensionResults: () => ({
        prf: { results: { first: prfBytes } },
        largeBlob: { written: false }
      })
    })
  })

  await passkey.unlock()
  assert.equal(getState('ez-vault:passkey:blob'), local.ciphertext)
  assert.equal(getState('ez-vault:passkey:storage-policy').cleanupPending, true)
  assert.equal(secrets.hasSecretRef({ type: 'nsec', pubkey: local.pubkey }), true)
})

test('openSecrets requires fresh verification and can perform the legacy migration', async () => {
  const prfBytes = new Uint8Array(32)
  prfBytes[0] = 10
  const secret = bytesToHex(generateSecretKey())
  const legacy = await ciphertextWithNsec(prfBytes, secret)
  await installLegacyState(prfBytes)
  let request
  installCredentialMocks({
    prfBytes,
    onGet: async options => {
      request = options
      return {
        getClientExtensionResults: () => ({
          prf: { results: { first: prfBytes } },
          largeBlob: { blob: new TextEncoder().encode(legacy.ciphertext) }
        })
      }
    }
  })

  const entries = await passkey.openSecrets()
  assert.equal(request.mediation, 'required')
  assert.equal(request.publicKey.extensions.largeBlob.read, true)
  assert.equal(entries.find(entry => entry.type === 'nsec' && entry.pubkey === legacy.pubkey)?.seckey, secret)
  assert.equal(getState('ez-vault:passkey:blob'), legacy.ciphertext)
  assert.deepEqual(getState('ez-vault:passkey:storage-policy'), {
    mode: 'idb',
    largeBlobSupport: 'supported',
    cleanupPending: true
  })
})
