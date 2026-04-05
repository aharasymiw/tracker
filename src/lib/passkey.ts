import { importWrappingKeyMaterial, wrapMasterKey, unwrapMasterKey } from '@/lib/crypto'

export type PasskeySupportReason =
  | 'unsupported-browser'
  | 'no-platform-authenticator'
  | 'missing-largeblob'
  | 'invalid-origin'
type PasskeySupportStatus = 'unsupported' | 'tentative' | 'available'
type PasskeyStorageSupport = 'unknown' | 'supported' | 'unsupported'

const LARGE_BLOB_REQUIRED_MESSAGE =
  'Passkeys are available here, but this browser or device cannot store the secure unlock data Trellis needs.'
const LARGE_BLOB_RECOVERY_MESSAGE =
  'Fingerprint / Face ID on this device needs to be set up again. Unlock with your recovery password, then re-enroll fingerprint / Face ID.'
const INVALID_ORIGIN_MESSAGE =
  'Passkeys require HTTPS or http://localhost. IP addresses like 127.0.0.1 and LAN URLs cannot create passkeys.'

export type PasskeySupport = {
  status: PasskeySupportStatus
  supported: boolean
  platformAuthenticator: boolean
  largeBlob: PasskeyStorageSupport
  reason?: PasskeySupportReason
}

export type PasskeyErrorCode = 'unsupported' | 'cancelled' | 'failed' | 'recovery-required'

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

export async function derivePasskeyWrappingKey(rawKeyMaterial: BufferSource): Promise<CryptoKey> {
  return importWrappingKeyMaterial(rawKeyMaterial)
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
  rpId?: string
  transports?: string[]
  createdAt: string
}

export type PasskeySlotInput = PasskeySlot

type LargeBlobExtensionResult = {
  supported?: boolean
  written?: boolean
  blob?: ArrayBuffer
}

type PasskeyCredentialWithExtensions = PublicKeyCredential & {
  response?: AuthenticatorResponse & {
    getTransports?: () => string[]
  }
  getClientExtensionResults: () => {
    largeBlob?: LargeBlobExtensionResult
  }
}

type PublicKeyCredentialConstructorWithCapabilities = typeof PublicKeyCredential & {
  getClientCapabilities?: () => Promise<Record<string, boolean> | undefined>
  signalUnknownCredential?: (options: { credentialId: string; rpId: string }) => Promise<void>
}

function isIpv4Host(hostname: string): boolean {
  const parts = hostname.split('.')
  return parts.length === 4 && parts.every((part) => /^\d+$/.test(part) && Number(part) <= 255)
}

function isIpv6Host(hostname: string): boolean {
  return hostname.includes(':')
}

export function getPasskeyOriginIssue(
  hostname: string,
  isSecureContextValue: boolean
): PasskeySupportReason | null {
  if (!isSecureContextValue) return 'invalid-origin'
  if (!hostname) return 'invalid-origin'
  if (hostname === 'localhost') return null
  if (isIpv4Host(hostname) || isIpv6Host(hostname)) return 'invalid-origin'
  return null
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
  largeBlob?: LargeBlobExtensionResult
} {
  return (result as PasskeyCredentialWithExtensions).getClientExtensionResults()
}

function getCredentialTransports(result: PublicKeyCredential): string[] | undefined {
  const response = (result as PasskeyCredentialWithExtensions).response
  if (!response || typeof response.getTransports !== 'function') return undefined
  const transports = response.getTransports()
  return Array.isArray(transports) && transports.length > 0 ? transports : undefined
}

function normalizeError(error: unknown): PasskeyError {
  if (error instanceof PasskeyError) return error
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
      return new PasskeyError('cancelled', 'Passkey request was cancelled', error)
    }
    if (
      error.name === 'SecurityError' &&
      getPasskeyOriginIssue(window.location.hostname, window.isSecureContext) === 'invalid-origin'
    ) {
      return new PasskeyError('unsupported', INVALID_ORIGIN_MESSAGE, error)
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
      largeBlob: 'unknown',
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
      largeBlob: 'unknown',
    }
  }

  let largeBlob: PasskeyStorageSupport = 'unknown'

  if (capabilities && Object.hasOwn(capabilities, 'extension:largeBlob')) {
    largeBlob = capabilities['extension:largeBlob'] ? 'supported' : 'unsupported'
  }

  const status: PasskeySupportStatus =
    largeBlob === 'supported'
      ? 'available'
      : largeBlob === 'unsupported'
        ? 'unsupported'
        : 'tentative'

  return {
    status,
    platformAuthenticator: true,
    largeBlob,
  }
}

export async function getPasskeySupport(): Promise<PasskeySupport> {
  const originIssue = getPasskeyOriginIssue(window.location.hostname, window.isSecureContext)
  if (originIssue) {
    return {
      status: 'unsupported',
      supported: false,
      platformAuthenticator: false,
      largeBlob: 'unknown',
      reason: originIssue,
    }
  }

  const details = await readSupportDetails()

  if (details.status === 'unsupported' && !details.platformAuthenticator) {
    return {
      status: 'unsupported',
      supported: false,
      platformAuthenticator: false,
      largeBlob: details.largeBlob,
      reason:
        details.largeBlob === 'unknown' &&
        (!globalThis.PublicKeyCredential ||
          !navigator.credentials ||
          typeof navigator.credentials.create !== 'function' ||
          typeof navigator.credentials.get !== 'function')
          ? 'unsupported-browser'
          : 'no-platform-authenticator',
    }
  }

  if (details.largeBlob === 'unsupported') {
    return {
      status: 'unsupported',
      supported: false,
      platformAuthenticator: true,
      largeBlob: 'unsupported',
      reason: 'missing-largeblob',
    }
  }

  return {
    status: details.status,
    supported: details.status !== 'unsupported',
    platformAuthenticator: true,
    largeBlob: details.largeBlob,
  }
}

function assertPasskeySupport(support: PasskeySupport): void {
  if (support.supported) return
  throw new PasskeyError(
    'unsupported',
    support.reason === 'missing-largeblob'
      ? LARGE_BLOB_REQUIRED_MESSAGE
      : support.reason === 'invalid-origin'
        ? INVALID_ORIGIN_MESSAGE
        : support.reason === 'no-platform-authenticator'
          ? 'This browser or device does not support a platform passkey authenticator'
          : 'This browser or device does not support platform passkeys'
  )
}

function buildRegistrationOptions(
  options: PasskeySlotRegistrationOptions
): PublicKeyCredentialCreationOptions & {
  extensions: {
    largeBlob: {
      support: 'required'
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
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    },
    timeout: options.timeout ?? 60_000,
    extensions: {
      largeBlob: {
        support: 'required',
      },
    },
  }
}

function buildWriteAuthenticationOptions(
  credentialId: string,
  deviceUnlockKey: BufferSource,
  options: PasskeySlotRegistrationOptions
): PublicKeyCredentialRequestOptions & {
  extensions: {
    largeBlob: {
      write: BufferSource
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
      largeBlob: {
        write: deviceUnlockKey,
      },
    },
  }
}

function buildReadAuthenticationOptions(
  credentialId: string,
  options: PasskeySlotRegistrationOptions
): PublicKeyCredentialRequestOptions & {
  extensions: {
    largeBlob: {
      read: true
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
      largeBlob: {
        read: true,
      },
    },
  }
}

async function importStoredUnlockKey(blob: ArrayBuffer): Promise<CryptoKey> {
  try {
    return await derivePasskeyWrappingKey(blob)
  } catch (error) {
    throw new PasskeyError('recovery-required', LARGE_BLOB_RECOVERY_MESSAGE, error)
  }
}

export async function createPasskeySlot(
  masterKey: CryptoKey,
  options: PasskeySlotRegistrationOptions = {}
): Promise<PasskeySlot> {
  const support = await getPasskeySupport()
  assertPasskeySupport(support)

  const deviceUnlockKey = randomBytes(32)
  const publicKey = buildRegistrationOptions(options)

  try {
    const credential = (await navigator.credentials.create({
      publicKey,
    })) as PublicKeyCredential | null

    if (!credential) {
      throw new PasskeyError('cancelled', 'Passkey registration was cancelled')
    }

    const registrationExtensions = getCredentialExtensions(credential)
    if (registrationExtensions.largeBlob?.supported !== true) {
      throw new PasskeyError('unsupported', LARGE_BLOB_REQUIRED_MESSAGE)
    }

    const credentialId = bufferToBase64Url(credential.rawId)
    const writeAssertion = (await navigator.credentials.get({
      publicKey: buildWriteAuthenticationOptions(credentialId, deviceUnlockKey, options),
    })) as PublicKeyCredential | null

    if (!writeAssertion) {
      throw new PasskeyError('cancelled', 'Passkey authentication was cancelled')
    }

    const writeExtensions = getCredentialExtensions(writeAssertion)
    if (writeExtensions.largeBlob?.written !== true) {
      throw new PasskeyError('recovery-required', LARGE_BLOB_RECOVERY_MESSAGE)
    }

    const wrappingKey = await derivePasskeyWrappingKey(deviceUnlockKey)
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)

    return {
      credentialId,
      encryptedMasterKey,
      masterKeyIV,
      rpId: options.rpId,
      transports: getCredentialTransports(credential),
      createdAt: new Date().toISOString(),
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function unlockWithPasskeySlot(slot: PasskeySlotInput): Promise<CryptoKey> {
  const support = await getPasskeySupport()
  assertPasskeySupport(support)

  const publicKey = buildReadAuthenticationOptions(slot.credentialId, slot)

  try {
    const credential = (await navigator.credentials.get({
      publicKey,
    })) as PublicKeyCredential | null

    if (!credential) {
      throw new PasskeyError('cancelled', 'Passkey authentication was cancelled')
    }

    const blob = getCredentialExtensions(credential).largeBlob?.blob

    if (!blob || blob.byteLength === 0) {
      throw new PasskeyError('recovery-required', LARGE_BLOB_RECOVERY_MESSAGE)
    }

    const wrappingKey = await importStoredUnlockKey(blob)

    try {
      return await unwrapMasterKey(slot.encryptedMasterKey, slot.masterKeyIV, wrappingKey)
    } catch (error) {
      throw new PasskeyError('recovery-required', LARGE_BLOB_RECOVERY_MESSAGE, error)
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function forgetPasskeyCredential(
  slot: Pick<PasskeySlotInput, 'credentialId' | 'rpId'>
): Promise<void> {
  const constructor = globalThis.PublicKeyCredential as
    | PublicKeyCredentialConstructorWithCapabilities
    | undefined

  if (!constructor || typeof constructor.signalUnknownCredential !== 'function') return

  try {
    await constructor.signalUnknownCredential({
      credentialId: slot.credentialId,
      rpId: slot.rpId ?? window.location.hostname,
    })
  } catch {
    // Ignore cleanup errors — local unlink already succeeded.
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
