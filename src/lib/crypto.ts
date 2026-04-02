// Utility helpers
function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return bytes.buffer
}

export { bufToBase64, base64ToBuf, bufToHex, hexToBuf }

export async function generateSalt(): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  return bufToHex(salt.buffer)
}

export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function deriveKeyFromPassword(
  password: string,
  saltHex: string,
  iterations = 600_000
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: hexToBuf(saltHex), iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

export async function wrapMasterKey(
  masterKey: CryptoKey,
  wrappingKey: CryptoKey
): Promise<{ encryptedMasterKey: string; masterKeyIV: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrapped = await crypto.subtle.wrapKey('raw', masterKey, wrappingKey, {
    name: 'AES-GCM',
    iv,
  })
  return {
    encryptedMasterKey: bufToBase64(wrapped),
    masterKeyIV: bufToBase64(iv.buffer),
  }
}

export async function unwrapMasterKey(
  encryptedMasterKey: string,
  masterKeyIV: string,
  unwrappingKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    base64ToBuf(encryptedMasterKey),
    unwrappingKey,
    { name: 'AES-GCM', iv: base64ToBuf(masterKeyIV) },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encrypt(
  data: string,
  masterKey: CryptoKey
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    enc.encode(data)
  )
  return { iv: bufToBase64(iv.buffer), ciphertext: bufToBase64(ciphertext) }
}

export async function decrypt(
  ciphertext: string,
  iv: string,
  masterKey: CryptoKey
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuf(iv) },
    masterKey,
    base64ToBuf(ciphertext)
  )
  return new TextDecoder().decode(plaintext)
}
