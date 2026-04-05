import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import {
  createPasskeySlot,
  derivePasskeyWrappingKey,
  forgetPasskeyCredential,
  getPasskeyOriginIssue,
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

function toArrayBuffer(value: BufferSource): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value.slice(0)
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
}

function createPasskeyCredential(
  rawId: ArrayBuffer,
  {
    largeBlobSupported,
    largeBlobWritten,
    largeBlobBlob,
  }: {
    largeBlobSupported?: boolean
    largeBlobWritten?: boolean
    largeBlobBlob?: ArrayBuffer
  } = {}
) {
  return {
    rawId,
    id: toBase64Url(rawId),
    type: 'public-key',
    getClientExtensionResults: () => ({
      largeBlob: {
        ...(largeBlobSupported === undefined ? {} : { supported: largeBlobSupported }),
        ...(largeBlobWritten === undefined ? {} : { written: largeBlobWritten }),
        ...(largeBlobBlob ? { blob: largeBlobBlob } : {}),
      },
    }),
    response: {
      getTransports: () => ['internal'],
    },
  } as PublicKeyCredential
}

function installWebAuthnMocks({
  platformAuthenticator,
  capabilities,
  includeCapabilitiesMethod = true,
  rawId = Uint8Array.from([10, 20, 30, 40]).buffer,
  createResult,
  createReturnsNull = false,
  registrationSupported = true,
  writeSucceeds = true,
  readBlob,
}: {
  platformAuthenticator: boolean
  capabilities?: Record<string, boolean>
  includeCapabilitiesMethod?: boolean
  rawId?: ArrayBuffer
  createResult?: PublicKeyCredential | null
  createReturnsNull?: boolean
  registrationSupported?: boolean
  writeSucceeds?: boolean
  readBlob?: ArrayBuffer | null
}) {
  let storedLargeBlob: ArrayBuffer | null = null
  const signalUnknownCredential = vi.fn().mockResolvedValue(undefined)

  class MockPublicKeyCredential {}

  const staticProperties: Record<string, unknown> = {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(platformAuthenticator),
    signalUnknownCredential,
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
      create: vi.fn().mockImplementation(async () => {
        if (createResult !== undefined) return createResult
        if (createReturnsNull) return null
        return createPasskeyCredential(rawId, { largeBlobSupported: registrationSupported })
      }),
      get: vi.fn().mockImplementation(async (request: CredentialRequestOptions) => {
        const largeBlob = (request.publicKey as PublicKeyCredentialRequestOptions | undefined)
          ?.extensions?.largeBlob as
          | {
              write?: BufferSource
              read?: boolean
            }
          | undefined

        if (largeBlob?.write !== undefined) {
          storedLargeBlob = writeSucceeds ? toArrayBuffer(largeBlob.write) : null
          return createPasskeyCredential(rawId, { largeBlobWritten: writeSucceeds })
        }

        if (largeBlob?.read) {
          const blob = readBlob === undefined ? storedLargeBlob : readBlob
          return createPasskeyCredential(rawId, blob ? { largeBlobBlob: blob } : undefined)
        }

        return createPasskeyCredential(rawId)
      }),
    },
  })

  return { signalUnknownCredential }
}

beforeEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'PublicKeyCredential')
  Reflect.deleteProperty(navigator, 'credentials')
})

describe('passkey support detection', () => {
  it('rejects insecure or IP-based origins before probing WebAuthn support', () => {
    expect(getPasskeyOriginIssue('127.0.0.1', true)).toBe('invalid-origin')
    expect(getPasskeyOriginIssue('192.168.1.50', true)).toBe('invalid-origin')
    expect(getPasskeyOriginIssue('localhost', true)).toBeNull()
    expect(getPasskeyOriginIssue('trellis.example', false)).toBe('invalid-origin')
  })

  it('fails closed when WebAuthn is unavailable', async () => {
    const support = await getPasskeySupport()
    expect(support).toEqual({
      status: 'unsupported',
      supported: false,
      platformAuthenticator: false,
      largeBlob: 'unknown',
      reason: 'unsupported-browser',
    })
  })

  it('reports available when platform passkeys and largeBlob are explicitly supported', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
        'extension:largeBlob': true,
      },
    })

    const support = await getPasskeySupport()
    expect(support).toEqual({
      status: 'available',
      supported: true,
      platformAuthenticator: true,
      largeBlob: 'supported',
    })
  })

  it('reports tentative when largeBlob capability is omitted', async () => {
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
      largeBlob: 'unknown',
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
      largeBlob: 'unknown',
    })
  })

  it('treats explicit largeBlob false as unsupported', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
        'extension:largeBlob': false,
      },
    })

    const support = await getPasskeySupport()
    expect(support).toEqual({
      status: 'unsupported',
      supported: false,
      platformAuthenticator: true,
      largeBlob: 'unsupported',
      reason: 'missing-largeblob',
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
    expect(support.largeBlob).toBe('unknown')
  })
})

describe('passkey enrollment and unlock', () => {
  it('derives a wrapping key that can unlock the same vault with passkey auth', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
    })

    const masterKey = await generateMasterKey()
    const enrollment = await createPasskeySlot(masterKey, {
      rpName: 'Trellis',
      userName: 'ada',
      displayName: 'Ada Lovelace',
    })

    expect(enrollment.credentialId).toBeTruthy()
    expect(enrollment.transports).toEqual(['internal'])

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
        'extension:largeBlob': true,
      },
      createReturnsNull: true,
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

  it('fails with a specific error when registration reports largeBlob unsupported', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
      registrationSupported: false,
    })

    await expect(createPasskeySlot(await generateMasterKey())).rejects.toMatchObject({
      code: 'unsupported',
      message: expect.stringContaining('secure unlock data Trellis needs'),
    })
  })

  it('fails with a typed recovery error when the largeBlob write does not complete', async () => {
    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
      writeSucceeds: false,
    })

    await expect(createPasskeySlot(await generateMasterKey())).rejects.toMatchObject({
      code: 'recovery-required',
      message: expect.stringContaining('set up again'),
    })
  })

  it('fails unlock when the largeBlob read omits the stored unlock key', async () => {
    const rawId = Uint8Array.from([12, 13, 14, 15]).buffer

    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
      rawId,
    })

    const slot = await createPasskeySlot(await generateMasterKey())

    installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
      rawId,
      readBlob: null,
    })

    await expect(unlockWithPasskeySlot(slot)).rejects.toMatchObject({
      code: 'recovery-required',
      message: expect.stringContaining('set up again'),
    })
  })

  it('best-effort signals unknown credentials when removing a passkey', async () => {
    const { signalUnknownCredential } = installWebAuthnMocks({
      platformAuthenticator: true,
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
    })

    await forgetPasskeyCredential({
      credentialId: 'credential-id',
      rpId: 'trellis.example',
    })

    expect(signalUnknownCredential).toHaveBeenCalledWith({
      credentialId: 'credential-id',
      rpId: 'trellis.example',
    })
  })

  it('exposes passkey errors to consumers', () => {
    const error = new PasskeyError('failed', 'boom')
    expect(isPasskeyError(error)).toBe(true)
    expect(error.code).toBe('failed')
  })

  it('derives a wrapping key from device unlock key material', async () => {
    const deviceUnlockKey = Uint8Array.from([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31, 32,
    ]).buffer

    const wrappingKey = await derivePasskeyWrappingKey(deviceUnlockKey)
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
