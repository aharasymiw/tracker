import { describe, it, expect, beforeEach } from 'vite-plus/test'
import {
  IDBFactory,
  IDBKeyRange,
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBIndex,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from 'fake-indexeddb'
import { generateMasterKey, encrypt } from '@/lib/crypto'
import { AppSettingsSchema } from '@/lib/schemas'
import type { AuthPrefs, EncryptedRecord, VaultMeta } from '@/types'

// Install all fake-indexeddb globals so idb library can find them, then reset
// the db module cache so each test opens a fresh IndexedDB instance.
beforeEach(async () => {
  const newFactory = new IDBFactory()
  // @ts-expect-error — readonly in lib.dom.d.ts but writable via setup.ts defineProperty
  globalThis.indexedDB = newFactory
  // Ensure idb library's global checks (e.g. `if (IDBRequest)`) resolve to fake impls
  globalThis.IDBFactory = IDBFactory as unknown as typeof globalThis.IDBFactory
  globalThis.IDBKeyRange = IDBKeyRange as unknown as typeof globalThis.IDBKeyRange
  globalThis.IDBCursor = IDBCursor as unknown as typeof globalThis.IDBCursor
  globalThis.IDBCursorWithValue =
    IDBCursorWithValue as unknown as typeof globalThis.IDBCursorWithValue
  globalThis.IDBDatabase = IDBDatabase as unknown as typeof globalThis.IDBDatabase
  globalThis.IDBIndex = IDBIndex as unknown as typeof globalThis.IDBIndex
  globalThis.IDBObjectStore = IDBObjectStore as unknown as typeof globalThis.IDBObjectStore
  globalThis.IDBOpenDBRequest = IDBOpenDBRequest as unknown as typeof globalThis.IDBOpenDBRequest
  globalThis.IDBRequest = IDBRequest as unknown as typeof globalThis.IDBRequest
  globalThis.IDBTransaction = IDBTransaction as unknown as typeof globalThis.IDBTransaction
  globalThis.IDBVersionChangeEvent =
    IDBVersionChangeEvent as unknown as typeof globalThis.IDBVersionChangeEvent

  const { resetDbForTesting } = await import('@/lib/db')
  resetDbForTesting()
})

describe('db - vault meta', () => {
  it('saves and retrieves vault meta', async () => {
    const { saveVaultMeta, getVaultMeta } = await import('@/lib/db')

    const meta = {
      version: 2,
      keySlots: [
        {
          id: 'password-slot',
          type: 'password',
          passwordSalt: 'aabbccdd'.repeat(8), // 64 hex chars
          encryptedMasterKey: 'base64data==',
          masterKeyIV: 'iv==',
        },
      ],
      verifyIV: 'verifyiv==',
      verifyCiphertext: 'verifyciphertext==',
      createdAt: new Date().toISOString(),
    } satisfies VaultMeta

    await saveVaultMeta(meta)
    const retrieved = await getVaultMeta()
    expect(retrieved).toEqual(meta)
  })

  it('migrates legacy vault meta on read and persists the upgraded shape', async () => {
    const { getVaultMeta } = await import('@/lib/db')

    const legacyMeta = {
      version: 1,
      passwordSalt: 'aabbccdd'.repeat(8),
      encryptedMasterKey: 'base64data==',
      masterKeyIV: 'iv==',
      verifyIV: 'verifyiv==',
      verifyCiphertext: 'verifyciphertext==',
      createdAt: new Date().toISOString(),
    }

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tracker-vault', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('meta')
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite')
      tx.objectStore('meta').put(legacyMeta, 'vault')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()

    const migrated = await getVaultMeta()
    expect(migrated).toEqual({
      version: 2,
      keySlots: [
        {
          id: 'legacy-password-slot',
          type: 'password',
          passwordSalt: legacyMeta.passwordSalt,
          encryptedMasterKey: legacyMeta.encryptedMasterKey,
          masterKeyIV: legacyMeta.masterKeyIV,
        },
      ],
      verifyIV: legacyMeta.verifyIV,
      verifyCiphertext: legacyMeta.verifyCiphertext,
      createdAt: legacyMeta.createdAt,
    })

    const reread = await getVaultMeta()
    expect(reread).toEqual(migrated)
  })

  it('returns undefined when no vault exists', async () => {
    const { getVaultMeta } = await import('@/lib/db')
    const result = await getVaultMeta()
    expect(result).toBeUndefined()
  })
})

describe('db - auth prefs', () => {
  it('returns defaults when no prefs exist', async () => {
    const { getAuthPrefs } = await import('@/lib/db')

    const prefs = await getAuthPrefs()
    expect(prefs).toEqual({
      stayLoggedIn: false,
      preferredUnlockMethod: 'password',
    } satisfies AuthPrefs)
  })

  it('saves and retrieves auth prefs', async () => {
    const { saveAuthPrefs, getAuthPrefs } = await import('@/lib/db')

    const saved = await saveAuthPrefs({
      stayLoggedIn: true,
      preferredUnlockMethod: 'passkey',
    })

    expect(saved).toEqual({
      stayLoggedIn: true,
      preferredUnlockMethod: 'passkey',
    })

    const retrieved = await getAuthPrefs()
    expect(retrieved).toEqual(saved)
  })
})

describe('db - app settings schema', () => {
  it('strips stayLoggedIn from encrypted app settings', () => {
    const parsed = AppSettingsSchema.parse({
      theme: 'dark',
      autoLockMinutes: 10,
      stayLoggedIn: true,
    })

    expect(parsed).toEqual({
      theme: 'dark',
      autoLockMinutes: 10,
    })
    expect('stayLoggedIn' in parsed).toBe(false)
  })
})

describe('db - encrypted CRUD', () => {
  it('round-trips an encrypted record', async () => {
    const { putEncrypted, getEncrypted } = await import('@/lib/db')

    const key = await generateMasterKey()
    const data = JSON.stringify({ id: 'test-1', value: 'hello' })
    const { iv, ciphertext } = await encrypt(data, key)

    const record: EncryptedRecord = {
      id: 'test-1',
      iv,
      ciphertext,
      updatedAt: new Date().toISOString(),
    }

    await putEncrypted('entries', record)
    const retrieved = await getEncrypted('entries', 'test-1')

    expect(retrieved).toEqual(record)
  })

  it('returns all records', async () => {
    const { putEncrypted, getAllEncrypted } = await import('@/lib/db')

    const records: EncryptedRecord[] = ['a', 'b', 'c'].map((id) => ({
      id,
      iv: 'iv==',
      ciphertext: 'data==',
      updatedAt: new Date().toISOString(),
    }))

    for (const r of records) await putEncrypted('entries', r)
    const all = await getAllEncrypted('entries')
    expect(all.length).toBeGreaterThanOrEqual(3)
    for (const r of records) expect(all.find((x) => x.id === r.id)).toBeDefined()
  })

  it('deletes a record', async () => {
    const { putEncrypted, getEncrypted, deleteEncrypted } = await import('@/lib/db')

    const record: EncryptedRecord = {
      id: 'to-delete',
      iv: 'iv==',
      ciphertext: 'data==',
      updatedAt: new Date().toISOString(),
    }

    await putEncrypted('entries', record)
    await deleteEncrypted('entries', 'to-delete')
    const result = await getEncrypted('entries', 'to-delete')
    expect(result).toBeUndefined()
  })
})
