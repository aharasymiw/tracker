import { importWrappingKeyMaterial, wrapMasterKey, unwrapMasterKey } from '@/lib/crypto'

type PasskeySupportReason = 'unsupported-browser' | 'no-platform-authenticator' | 'missing-prf'
type PasskeySupportStatus = 'unsupported' | 'tentative' | 'available'
type PasskeyPrfSupport = 'unknown' | 'supported' | 'unsupported'

const PRF_EXTENSION_REQUIRED_MESSAGE =
  'Passkeys are available here, but this browser or device does not expose the WebAuthn PRF extension Trellis needs.'

export type PasskeySupport = {
  status: PasskeySupportStatus
  supported: boolean
  platformAuthenticator: boolean
  prf: PasskeyPrfSupport
  reason?: PasskeySupportReason
}

export type PasskeyErrorCode = 'unsupported' | 'cancelled' | 'failed'

export class PasskeyError extends Error {
  code: PasskeyErrorCode

  constructor(code: PasskeyErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'PasskeyError'
    this.code = code
    if (cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = cause
    }
  }
}

export function isPasskeyError(error: unknown): error is PasskeyError {
  return error instanceof PasskeyError
}

export async function derivePasskeyWrappingKey(prfOutput: BufferSource): Promise<CryptoKey> {
  return importWrappingKeyMaterial(prfOutput)
}

export interface PasskeySlotRegistrationOptions {
  rpName?: string
  rpId?: string
  timeout?: number
  userName?: string
  displayName?: string
}

export interface PasskeySlot {
  credentialId: string
  encryptedMasterKey: string
  masterKeyIV: string
  prfInput: string
  rpId?: string
  createdAt: string
}

export type PasskeySlotInput = PasskeySlot

type PasskeyCredentialWithExtensions = PublicKeyCredential & {
  getClientExtensionResults: () => {
    prf?: {
      enabled?: boolean
      results?: {
        first?: ArrayBuffer
      }
    }
  }
}

type PublicKeyCredentialConstructorWithCapabilities = typeof PublicKeyCredential & {
  getClientCapabilities?: () => Promise<Record<string, boolean> | undefined>
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(normalized + padding)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

function getCredentialExtensions(result: PublicKeyCredential): {
  prf?: {
    enabled?: boolean
    results?: {
      first?: ArrayBuffer
    }
  }
} {
  return (result as PasskeyCredentialWithExtensions).getClientExtensionResults()
}

function normalizeError(error: unknown): PasskeyError {
  if (error instanceof PasskeyError) return error
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
      return new PasskeyError('cancelled', 'Passkey request was cancelled', error)
    }
    if (error.name === 'InvalidStateError' || error.name === 'NotSupportedError') {
      return new PasskeyError('unsupported', 'Passkey is not supported in this browser', error)
    }
  }
  return new PasskeyError('failed', 'Passkey operation failed', error)
}

async function readSupportDetails(): Promise<Omit<PasskeySupport, 'supported' | 'reason'>> {
  const constructor = globalThis.PublicKeyCredential as
    | PublicKeyCredentialConstructorWithCapabilities
    | undefined
  const credentials = navigator.credentials

  if (
    !constructor ||
    !credentials ||
    typeof credentials.create !== 'function' ||
    typeof credentials.get !== 'function'
  ) {
    return {
      status: 'unsupported',
      platformAuthenticator: false,
      prf: 'unknown',
    }
  }

  const capabilities = constructor.getClientCapabilities
    ? await constructor.getClientCapabilities().catch(() => undefined)
    : undefined

  const capabilityPlatformAuthenticator = capabilities?.passkeyPlatformAuthenticator
  const platformAuthenticator =
    typeof capabilityPlatformAuthenticator === 'boolean'
      ? capabilityPlatformAuthenticator
      : typeof constructor.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
        ? await constructor.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
        : false

  if (!platformAuthenticator) {
    return {
      status: 'unsupported',
      platformAuthenticator: false,
      prf: 'unknown',
    }
  }

  let prf: PasskeyPrfSupport = 'unknown'

  if (capabilities && Object.hasOwn(capabilities, 'extension:prf')) {
    prf = capabilities['extension:prf'] ? 'supported' : 'unsupported'
  }

  const status: PasskeySupportStatus =
    prf === 'supported' ? 'available' : prf === 'unsupported' ? 'unsupported' : 'tentative'

  return {
    status,
    platformAuthenticator: true,
    prf,
  }
}

export async function getPasskeySupport(): Promise<PasskeySupport> {
  const details = await readSupportDetails()

  if (details.status === 'unsupported' && !details.platformAuthenticator) {
    return {
      status: 'unsupported',
      supported: false,
      platformAuthenticator: false,
      prf: details.prf,
      reason:
        details.prf === 'unknown' &&
        (!globalThis.PublicKeyCredential ||
          !navigator.credentials ||
          typeof navigator.credentials.create !== 'function' ||
          typeof navigator.credentials.get !== 'function')
          ? 'unsupported-browser'
          : 'no-platform-authenticator',
    }
  }

  if (details.prf === 'unsupported') {
    return {
      status: 'unsupported',
      supported: false,
      platformAuthenticator: true,
      prf: 'unsupported',
      reason: 'missing-prf',
    }
  }

  return {
    status: details.status,
    supported: details.status !== 'unsupported',
    platformAuthenticator: true,
    prf: details.prf,
  }
}

function assertPasskeySupport(support: PasskeySupport): void {
  if (support.supported) return
  throw new PasskeyError(
    'unsupported',
    support.reason === 'missing-prf'
      ? PRF_EXTENSION_REQUIRED_MESSAGE
      : support.reason === 'no-platform-authenticator'
        ? 'This browser or device does not support a platform passkey authenticator'
        : 'This browser or device does not support platform passkeys'
  )
}

async function getWrappingKeyFromExtensionResult(result: PublicKeyCredential): Promise<{
  credentialId: string
  rawId: ArrayBuffer
  wrappingKey: CryptoKey
  prfOutput: ArrayBuffer
}> {
  const extensionResults = getCredentialExtensions(result)
  const prfOutput = extensionResults.prf?.results?.first

  if (!prfOutput) {
    throw new PasskeyError('unsupported', PRF_EXTENSION_REQUIRED_MESSAGE)
  }

  return {
    credentialId: bufferToBase64Url(result.rawId),
    rawId: result.rawId,
    wrappingKey: await derivePasskeyWrappingKey(prfOutput),
    prfOutput,
  }
}

function buildRegistrationOptions(
  prfInput: BufferSource,
  options: PasskeySlotRegistrationOptions
): PublicKeyCredentialCreationOptions & {
  extensions: {
    prf: {
      eval: {
        first: BufferSource
      }
    }
  }
} {
  return {
    challenge: randomBytes(32),
    rp: {
      name: options.rpName ?? 'Trellis',
      ...(options.rpId ? { id: options.rpId } : {}),
    },
    user: {
      id: randomBytes(16),
      name: options.userName ?? 'trellis',
      displayName: options.displayName ?? 'Trellis',
    },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
    timeout: options.timeout ?? 60_000,
    extensions: {
      prf: {
        eval: {
          first: prfInput,
        },
      },
    },
  }
}

function buildAuthenticationOptions(
  credentialId: string,
  prfInput: BufferSource,
  options: PasskeySlotRegistrationOptions
): PublicKeyCredentialRequestOptions & {
  extensions: {
    prf: {
      eval: {
        first: BufferSource
      }
    }
  }
} {
  return {
    challenge: randomBytes(32),
    allowCredentials: [
      {
        type: 'public-key',
        id: base64UrlToBuffer(credentialId),
      },
    ],
    userVerification: 'required',
    timeout: options.timeout ?? 60_000,
    ...(options.rpId ? { rpId: options.rpId } : {}),
    extensions: {
      prf: {
        eval: {
          first: prfInput,
        },
      },
    },
  }
}

export async function createPasskeySlot(
  masterKey: CryptoKey,
  options: PasskeySlotRegistrationOptions = {}
): Promise<PasskeySlot> {
  const support = await getPasskeySupport()
  assertPasskeySupport(support)

  const prfInput = bufferToBase64Url(randomBytes(32).buffer)
  const publicKey = buildRegistrationOptions(base64UrlToBuffer(prfInput), options)

  try {
    const credential = (await navigator.credentials.create({
      publicKey,
    })) as PublicKeyCredential | null

    if (!credential) {
      throw new PasskeyError('cancelled', 'Passkey registration was cancelled')
    }

    const registrationExtensions = getCredentialExtensions(credential)
    if (registrationExtensions.prf?.enabled === false) {
      throw new PasskeyError('unsupported', PRF_EXTENSION_REQUIRED_MESSAGE)
    }

    const credentialId = bufferToBase64Url(credential.rawId)
    const assertion = (await navigator.credentials.get({
      publicKey: buildAuthenticationOptions(credentialId, base64UrlToBuffer(prfInput), options),
    })) as PublicKeyCredential | null

    if (!assertion) {
      throw new PasskeyError('cancelled', 'Passkey authentication was cancelled')
    }

    const wrapped = await getWrappingKeyFromExtensionResult(assertion)
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrapped.wrappingKey)
    return {
      credentialId,
      encryptedMasterKey,
      masterKeyIV,
      prfInput,
      rpId: options.rpId,
      createdAt: new Date().toISOString(),
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function unlockWithPasskeySlot(slot: PasskeySlotInput): Promise<CryptoKey> {
  const support = await getPasskeySupport()
  assertPasskeySupport(support)

  const publicKey = buildAuthenticationOptions(
    slot.credentialId,
    base64UrlToBuffer(slot.prfInput),
    slot
  )

  try {
    const credential = (await navigator.credentials.get({
      publicKey,
    })) as PublicKeyCredential | null

    if (!credential) {
      throw new PasskeyError('cancelled', 'Passkey authentication was cancelled')
    }

    const wrapped = await getWrappingKeyFromExtensionResult(credential)
    return unwrapMasterKey(slot.encryptedMasterKey, slot.masterKeyIV, wrapped.wrappingKey)
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function enrollPlatformPasskey(
  masterKey: CryptoKey,
  options: PasskeySlotRegistrationOptions = {}
): Promise<PasskeySlot> {
  return createPasskeySlot(masterKey, options)
}

export async function authenticatePlatformPasskey(slot: PasskeySlotInput): Promise<CryptoKey> {
  return unlockWithPasskeySlot(slot)
}
