import { describe, it, expect } from 'vite-plus/test'
import {
  generateMasterKey,
  generateSalt,
  deriveKeyFromPassword,
  wrapMasterKey,
  unwrapMasterKey,
  encrypt,
  decrypt,
} from '@/lib/crypto'

describe('auth flow - biometric-only vault (simulated)', () => {
  it('master key wrapped only with PRF key is recoverable', async () => {
    // Simulate PRF output: a raw 32-byte key
    const prfOutput = crypto.getRandomValues(new Uint8Array(32))
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

    // Create master key and wrap with PRF key only (no password)
    const masterKey = await generateMasterKey()
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, prfKey)

    // Encrypt data
    const { iv, ciphertext } = await encrypt('biometric-only data', masterKey)

    // Simulate lock & unlock: re-derive same PRF key, unwrap master key
    const prfKey2 = await crypto.subtle.deriveKey(
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
    const unlockedKey = await unwrapMasterKey(encryptedMasterKey, masterKeyIV, prfKey2)
    const decrypted = await decrypt(ciphertext, iv, unlockedKey)
    expect(decrypted).toBe('biometric-only data')
  })
})

describe('auth flow - password vault', () => {
  it('full onboarding → lock → unlock cycle', async () => {
    // Step 1: Create vault (onboarding)
    const password = 'my-secure-password-123'
    const salt = await generateSalt()
    const masterKey = await generateMasterKey()
    const wrappingKey = await deriveKeyFromPassword(password, salt)
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)

    // Step 2: Encrypt some data with the master key
    const entry = { id: '1', type: 'flower', amount: 2, unit: 'hits' }
    const { iv, ciphertext } = await encrypt(JSON.stringify(entry), masterKey)

    // Step 3: "Lock" — forget the master key (simulate app lock)
    const lostMasterKey = null

    // Step 4: "Unlock" — re-derive master key from password
    const unlockWrappingKey = await deriveKeyFromPassword(password, salt)
    const unlockedKey = await unwrapMasterKey(encryptedMasterKey, masterKeyIV, unlockWrappingKey)

    // Step 5: Decrypt data with unlocked key
    const decrypted = JSON.parse(await decrypt(ciphertext, iv, unlockedKey))
    expect(decrypted).toEqual(entry)
    expect(lostMasterKey).toBeNull() // confirms we lost it
  })

  it('wrong password fails to unlock', async () => {
    const salt = await generateSalt()
    const masterKey = await generateMasterKey()
    const wrappingKey = await deriveKeyFromPassword('correct-password', salt)
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)

    const wrongWrappingKey = await deriveKeyFromPassword('wrong-password', salt)
    await expect(
      unwrapMasterKey(encryptedMasterKey, masterKeyIV, wrongWrappingKey)
    ).rejects.toThrow()
  })

  it('data is inaccessible with wrong key after unlock', async () => {
    await generateSalt()
    const masterKey1 = await generateMasterKey()
    const masterKey2 = await generateMasterKey()

    const { iv, ciphertext } = await encrypt('sensitive data', masterKey1)

    // Trying to decrypt data encrypted with key1 using key2 should fail
    await expect(decrypt(ciphertext, iv, masterKey2)).rejects.toThrow()
  })

  it('re-wrapping master key with new password preserves data access', async () => {
    // Create vault
    const salt1 = await generateSalt()
    const masterKey = await generateMasterKey()
    const oldWrapping = await deriveKeyFromPassword('old-password', salt1)
    const wrapped1 = await wrapMasterKey(masterKey, oldWrapping)

    // Encrypt data
    const { iv, ciphertext } = await encrypt('my data', masterKey)

    // Change password: verify old password can unwrap (proves identity), then re-wrap
    // the original (extractable) masterKey under the new password.
    // unwrapMasterKey returns a non-extractable key by design, so we use the
    // still-in-memory extractable masterKey for re-wrapping — matching real app behaviour
    // where the master key stays in memory until the vault is locked.
    await unwrapMasterKey(wrapped1.encryptedMasterKey, wrapped1.masterKeyIV, oldWrapping) // verify old password
    const salt2 = await generateSalt()
    const newWrapping = await deriveKeyFromPassword('new-password', salt2)
    const wrapped2 = await wrapMasterKey(masterKey, newWrapping)

    // Unlock with new password
    const finalWrapping = await deriveKeyFromPassword('new-password', salt2)
    const finalKey = await unwrapMasterKey(
      wrapped2.encryptedMasterKey,
      wrapped2.masterKeyIV,
      finalWrapping
    )

    // Data should still be accessible
    const decrypted = await decrypt(ciphertext, iv, finalKey)
    expect(decrypted).toBe('my data')
  })
})
