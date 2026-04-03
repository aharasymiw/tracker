import { bufToBase64, base64ToBuf } from './crypto'

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window
}

export type PRFSupportStatus = true | false | 'unknown'

export async function isPRFSupported(): Promise<PRFSupportStatus> {
  if (!isWebAuthnSupported()) return false
  try {
    const PKC = PublicKeyCredential as unknown as Record<
      string,
      (() => Promise<Record<string, unknown>>) | undefined
    >
    const caps = await PKC['getClientCapabilities']?.()
    if (caps?.['prf'] === true) return true
    // getClientCapabilities was unavailable or reported false.
    // On Chromium Android, PRF may still work — report unknown.
    if (isChromiumOnAndroid()) return 'unknown'
    return false
  } catch {
    if (isChromiumOnAndroid()) return 'unknown'
    return false
  }
}

function isChromiumOnAndroid(): boolean {
  const ua = navigator.userAgent
  return /Android/i.test(ua) && /Chrome\/\d+/i.test(ua) && !/Firefox/i.test(ua)
}

export async function registerBiometric(
  userId: string
): Promise<{ credentialId: string; prfKey: CryptoKey } | null> {
  if (!isWebAuthnSupported()) return null
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Trellis', id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(userId),
          name: 'trellis-user',
          displayName: 'Trellis User',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        extensions: { prf: { eval: { first: new TextEncoder().encode('trellis-master-key') } } },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null

    if (!credential) return null
    const extResults = (credential as PublicKeyCredential).getClientExtensionResults() as Record<
      string,
      unknown
    >
    const prfResult = extResults?.prf as { results?: { first?: ArrayBuffer } } | undefined
    if (!prfResult?.results?.first) throw new Error('PRF_NOT_SUPPORTED')

    const prfOutput = prfResult.results.first
    const keyMaterial = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, [
      'deriveKey',
    ])
    const prfKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode('trellis-wrap'),
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    )

    const rawId = credential.rawId
    return { credentialId: bufToBase64(rawId), prfKey }
  } catch (err) {
    if (err instanceof Error && err.message === 'PRF_NOT_SUPPORTED') throw err
    console.error('Biometric registration failed:', err)
    return null
  }
}

export async function authenticateBiometric(credentialId: string): Promise<CryptoKey | null> {
  if (!isWebAuthnSupported()) return null
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [{ type: 'public-key', id: base64ToBuf(credentialId) }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: new TextEncoder().encode('trellis-master-key') } } },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null

    if (!credential) return null
    const extResults = (credential as PublicKeyCredential).getClientExtensionResults() as Record<
      string,
      unknown
    >
    const prfResult = extResults?.prf as { results?: { first?: ArrayBuffer } } | undefined
    if (!prfResult?.results?.first) return null

    const prfOutput = prfResult.results.first
    const keyMaterial = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, [
      'deriveKey',
    ])
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode('trellis-wrap'),
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    )
  } catch (err) {
    console.error('Biometric auth failed:', err)
    return null
  }
}
