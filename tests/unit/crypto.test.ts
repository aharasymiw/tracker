import { describe, it, expect } from 'vitest'
import {
  generateMasterKey,
  generateSalt,
  deriveKeyFromPassword,
  wrapMasterKey,
  unwrapMasterKey,
  encrypt,
  decrypt,
  bufToBase64,
  base64ToBuf,
  bufToHex,
  hexToBuf,
} from '@/lib/crypto'

describe('bufToBase64 / base64ToBuf', () => {
  it('round-trips', () => {
    const original = new Uint8Array([1, 2, 3, 255, 0, 127])
    const b64 = bufToBase64(original.buffer)
    const back = new Uint8Array(base64ToBuf(b64))
    expect(Array.from(back)).toEqual(Array.from(original))
  })
})

describe('bufToHex / hexToBuf', () => {
  it('round-trips', () => {
    const original = new Uint8Array([0, 15, 16, 255, 128])
    const hex = bufToHex(original.buffer)
    const back = new Uint8Array(hexToBuf(hex))
    expect(Array.from(back)).toEqual(Array.from(original))
  })
})

describe('generateSalt', () => {
  it('returns 64-char hex string', async () => {
    const salt = await generateSalt()
    expect(salt).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(salt)).toBe(true)
  })

  it('generates unique salts', async () => {
    const [a, b] = await Promise.all([generateSalt(), generateSalt()])
    expect(a).not.toBe(b)
  })
})

describe('encrypt / decrypt', () => {
  it('round-trips data', async () => {
    const key = await generateMasterKey()
    const plaintext = 'Hello, Trellis!'
    const { iv, ciphertext } = await encrypt(plaintext, key)
    const decrypted = await decrypt(ciphertext, iv, key)
    expect(decrypted).toBe(plaintext)
  })

  it('rejects wrong key', async () => {
    const key1 = await generateMasterKey()
    const key2 = await generateMasterKey()
    const { iv, ciphertext } = await encrypt('secret', key1)
    await expect(decrypt(ciphertext, iv, key2)).rejects.toThrow()
  })

  it('rejects tampered ciphertext', async () => {
    const key = await generateMasterKey()
    const { iv, ciphertext } = await encrypt('secret', key)
    const tampered = ciphertext.slice(0, -4) + 'XXXX'
    await expect(decrypt(tampered, iv, key)).rejects.toThrow()
  })

  it('generates unique IVs', async () => {
    const key = await generateMasterKey()
    const [r1, r2] = await Promise.all([encrypt('a', key), encrypt('a', key)])
    expect(r1.iv).not.toBe(r2.iv)
  })
})

describe('wrapMasterKey / unwrapMasterKey', () => {
  it('round-trips via password', async () => {
    const masterKey = await generateMasterKey()
    const salt = await generateSalt()
    const wrappingKey = await deriveKeyFromPassword('test-password', salt)
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)
    const unwrapped = await unwrapMasterKey(encryptedMasterKey, masterKeyIV, wrappingKey)
    // Verify the unwrapped key works for encrypt/decrypt
    const { iv, ciphertext } = await encrypt('test', unwrapped)
    const decrypted = await decrypt(ciphertext, iv, unwrapped)
    expect(decrypted).toBe('test')
  })

  it('rejects wrong password', async () => {
    const masterKey = await generateMasterKey()
    const salt = await generateSalt()
    const wrappingKey = await deriveKeyFromPassword('correct', salt)
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)
    const wrongKey = await deriveKeyFromPassword('wrong', salt)
    await expect(unwrapMasterKey(encryptedMasterKey, masterKeyIV, wrongKey)).rejects.toThrow()
  })
})

describe('deriveKeyFromPassword', () => {
  it('is deterministic', async () => {
    const salt = await generateSalt()
    const key1 = await deriveKeyFromPassword('password', salt)
    const key2 = await deriveKeyFromPassword('password', salt)
    // Both keys should work to wrap/unwrap the same master key
    const masterKey = await generateMasterKey()
    const wrapped = await wrapMasterKey(masterKey, key1)
    const unwrapped = await unwrapMasterKey(wrapped.encryptedMasterKey, wrapped.masterKeyIV, key2)
    const { iv, ciphertext } = await encrypt('test', unwrapped)
    expect(await decrypt(ciphertext, iv, unwrapped)).toBe('test')
  })
})
