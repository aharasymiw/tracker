import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import {
  createPasskeySlot,
  derivePasskeyWrappingKey,
  getPasskeySupport,
  isPasskeyError,
  PasskeyError,
  unlockWithPasskeySlot,
} from '@/lib/passkey'
import {
  generateMasterKey,
  encrypt,
  decrypt,
  deriveKeyFromPassword,
  wrapMasterKey,
  unwrapMasterKeyExtractable,
} from '@/lib/crypto'

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function createPrfCredential(rawId: ArrayBuffer, prfOutput: ArrayBuffer) {
  return {
    rawId,
    id: toBase64Url(rawId),
    type: 'public-key',
    getClientExtensionResults: () => ({
      prf: {
        results: {
          first: prfOutput,
        },
      },
    }),
  } as PublicKeyCredential
}

function installWebAuthnMocks({
  platformAuthenticator,
  prfSupported,
  createResult,
  getResult,
}: {
  platformAuthenticator: boolean
  prfSupported: boolean
  createResult?: PublicKeyCredential | null
  getResult?: PublicKeyCredential | null
}) {
  class MockPublicKeyCredential {}

  Object.assign(MockPublicKeyCredential, {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(platformAuthenticator),
    getClientCapabilities: vi.fn().mockResolvedValue({ prf: prfSupported }),
  })

  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value: MockPublicKeyCredential,
  })

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create: vi.fn().mockResolvedValue(createResult),
      get: vi.fn().mockResolvedValue(getResult),
    },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('passkey support detection', () => {
  it('fails closed when WebAuthn is unavailable', async () => {
    const support = await getPasskeySupport()
    expect(support).toEqual({
      supported: false,
      platformAuthenticator: false,
      prf: false,
      reason: 'unsupported-browser',
    })
  })

  it('requires platform authenticator and PRF support', async () => {
    installWebAuthnMocks({ platformAuthenticator: true, prfSupported: false })

    const support = await getPasskeySupport()
    expect(support.supported).toBe(false)
    expect(support.reason).toBe('missing-prf')
  })
})

describe('passkey enrollment and unlock', () => {
  it('derives a wrapping key that can unlock the same vault with passkey auth', async () => {
    const rawId = Uint8Array.from([10, 20, 30, 40]).buffer
    const prfOutput = Uint8Array.from([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31, 32,
    ]).buffer
    const credential = createPrfCredential(rawId, prfOutput)

    installWebAuthnMocks({
      platformAuthenticator: true,
      prfSupported: true,
      createResult: credential,
      getResult: credential,
    })

    const masterKey = await generateMasterKey()
    const enrollment = await createPasskeySlot(masterKey, {
      rpName: 'Trellis',
      userName: 'ada',
      displayName: 'Ada Lovelace',
    })

    expect(enrollment.credentialId).toBe(toBase64Url(rawId))
    expect(enrollment.prfInput).toBeTruthy()

    const restored = await unlockWithPasskeySlot(enrollment)

    const encrypted = await encrypt('hello passkey', masterKey)
    const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, restored)
    expect(decrypted).toBe('hello passkey')
  })

  it('maps cancellation to a typed passkey error', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      prfSupported: true,
      createResult: null,
      getResult: null,
    })

    await expect(
      createPasskeySlot(await generateMasterKey(), {
        rpName: 'Trellis',
        userName: 'grace',
        displayName: 'Grace Hopper',
      })
    ).rejects.toMatchObject({
      code: 'cancelled',
      name: 'PasskeyError',
    })
  })

  it('exposes passkey errors to consumers', () => {
    const error = new PasskeyError('failed', 'boom')
    expect(isPasskeyError(error)).toBe(true)
    expect(error.code).toBe('failed')
  })

  it('derives a wrapping key from PRF output', async () => {
    const prfOutput = Uint8Array.from([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31, 32,
    ]).buffer

    const wrappingKey = await derivePasskeyWrappingKey(prfOutput)
    const masterKey = await generateMasterKey()
    const wrapped = await wrapMasterKey(masterKey, wrappingKey)
    const extracted = await unwrapMasterKeyExtractable(
      wrapped.encryptedMasterKey,
      wrapped.masterKeyIV,
      wrappingKey
    )

    const encrypted = await encrypt('wrap-path', masterKey)
    const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, extracted)
    expect(decrypted).toBe('wrap-path')
  })

  it('supports extractable unwrap after password re-entry', async () => {
    const password = 'recovery-password'
    const salt = 'aabbccdd'.repeat(8)
    const wrappingKey = await deriveKeyFromPassword(password, salt)
    const masterKey = await generateMasterKey()
    const wrapped = await wrapMasterKey(masterKey, wrappingKey)
    const extracted = await unwrapMasterKeyExtractable(
      wrapped.encryptedMasterKey,
      wrapped.masterKeyIV,
      wrappingKey
    )

    const encrypted = await encrypt('re-enroll', extracted)
    const decrypted = await decrypt(encrypted.ciphertext, encrypted.iv, extracted)
    expect(decrypted).toBe('re-enroll')
  })
})
