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
  decrypt,
  deriveKeyFromPassword,
  encrypt,
  generateMasterKey,
  unwrapMasterKeyExtractable,
  wrapMasterKey,
} from '@/lib/crypto'

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function createPasskeyCredential(
  rawId: ArrayBuffer,
  {
    enabled,
    prfOutput,
  }: {
    enabled?: boolean
    prfOutput?: ArrayBuffer
  } = {}
) {
  return {
    rawId,
    id: toBase64Url(rawId),
    type: 'public-key',
    getClientExtensionResults: () => ({
      prf: {
        ...(enabled === undefined ? {} : { enabled }),
        ...(prfOutput
          ? {
              results: {
                first: prfOutput,
              },
            }
          : {}),
      },
    }),
  } as PublicKeyCredential
}

function installWebAuthnMocks({
  platformAuthenticator,
  capabilities,
  includeCapabilitiesMethod = true,
  createResult,
  getResult,
}: {
  platformAuthenticator: boolean
  capabilities?: Record<string, boolean>
  includeCapabilitiesMethod?: boolean
  createResult?: PublicKeyCredential | null
  getResult?: PublicKeyCredential | null
}) {
  class MockPublicKeyCredential {}

  const staticProperties: Record<string, unknown> = {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(platformAuthenticator),
  }

  if (includeCapabilitiesMethod) {
    staticProperties.getClientCapabilities = vi.fn().mockResolvedValue(capabilities)
  }

  Object.assign(MockPublicKeyCredential, staticProperties)

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
  Reflect.deleteProperty(globalThis, 'PublicKeyCredential')
  Reflect.deleteProperty(navigator, 'credentials')
})

describe('passkey support detection', () => {
  it('fails closed when WebAuthn is unavailable', async () => {
    const support = await getPasskeySupport()
    expect(support).toEqual({
      status: 'unsupported',
      supported: false,
      platformAuthenticator: false,
      prf: 'unknown',
      reason: 'unsupported-browser',
    })
  })

  it('reports available when platform passkeys and PRF are explicitly supported', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
        'extension:prf': true,
      },
    })

    const support = await getPasskeySupport()
    expect(support).toEqual({
      status: 'available',
      supported: true,
      platformAuthenticator: true,
      prf: 'supported',
    })
  })

  it('reports tentative when PRF capability is omitted', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
    })

    const support = await getPasskeySupport()
    expect(support).toEqual({
      status: 'tentative',
      supported: true,
      platformAuthenticator: true,
      prf: 'unknown',
    })
  })

  it('reports tentative when capabilities API is missing but UVPA succeeds', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      includeCapabilitiesMethod: false,
    })

    const support = await getPasskeySupport()
    expect(support).toEqual({
      status: 'tentative',
      supported: true,
      platformAuthenticator: true,
      prf: 'unknown',
    })
  })

  it('treats explicit PRF false as unsupported', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
        'extension:prf': false,
      },
    })

    const support = await getPasskeySupport()
    expect(support).toEqual({
      status: 'unsupported',
      supported: false,
      platformAuthenticator: true,
      prf: 'unsupported',
      reason: 'missing-prf',
    })
  })

  it('does not rely on the old capabilities.prf key', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
        prf: false,
      },
    })

    const support = await getPasskeySupport()
    expect(support.status).toBe('tentative')
    expect(support.prf).toBe('unknown')
  })
})

describe('passkey enrollment and unlock', () => {
  it('derives a wrapping key that can unlock the same vault with passkey auth', async () => {
    const rawId = Uint8Array.from([10, 20, 30, 40]).buffer
    const prfOutput = Uint8Array.from([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31, 32,
    ]).buffer

    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
      createResult: createPasskeyCredential(rawId, { enabled: true }),
      getResult: createPasskeyCredential(rawId, { prfOutput }),
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
      capabilities: {
        passkeyPlatformAuthenticator: true,
        'extension:prf': true,
      },
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

  it('fails with a specific error when registration reports PRF disabled', async () => {
    const rawId = Uint8Array.from([1, 2, 3, 4]).buffer

    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
      createResult: createPasskeyCredential(rawId, { enabled: false }),
      getResult: null,
    })

    await expect(createPasskeySlot(await generateMasterKey())).rejects.toMatchObject({
      code: 'unsupported',
      message: expect.stringContaining('does not expose the WebAuthn PRF extension'),
    })
  })

  it('fails with a specific error when authentication does not return PRF output', async () => {
    const rawId = Uint8Array.from([7, 8, 9, 10]).buffer

    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
      createResult: createPasskeyCredential(rawId, { enabled: true }),
      getResult: createPasskeyCredential(rawId),
    })

    await expect(createPasskeySlot(await generateMasterKey())).rejects.toMatchObject({
      code: 'unsupported',
      message: expect.stringContaining('does not expose the WebAuthn PRF extension'),
    })
  })

  it('fails unlock when the passkey assertion omits PRF output', async () => {
    const rawId = Uint8Array.from([12, 13, 14, 15]).buffer
    const prfOutput = Uint8Array.from([
      9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9,
      9,
    ]).buffer

    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
      createResult: createPasskeyCredential(rawId, { enabled: true }),
      getResult: createPasskeyCredential(rawId, { prfOutput }),
    })

    const slot = await createPasskeySlot(await generateMasterKey())

    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
      getResult: createPasskeyCredential(rawId),
    })

    await expect(unlockWithPasskeySlot(slot)).rejects.toMatchObject({
      code: 'unsupported',
      message: expect.stringContaining('does not expose the WebAuthn PRF extension'),
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
