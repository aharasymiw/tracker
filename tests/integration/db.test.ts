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
      version: 3,
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

  // The legacy-meta tests below seed 'tracker-vault' — the database name before
  // the Less Lately rename — because those meta shapes only ever existed there.
  // Reading them back therefore also exercises the database-name migration.
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
      version: 3,
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

  it('drops legacy PRF passkey slots when migrating version 2 metadata', async () => {
    const { getVaultMeta } = await import('@/lib/db')

    const version2Meta = {
      version: 2,
      keySlots: [
        {
          id: 'password-slot',
          type: 'password',
          passwordSalt: 'aabbccdd'.repeat(8),
          encryptedMasterKey: 'base64data==',
          masterKeyIV: 'iv==',
        },
        {
          id: 'passkey-slot',
          type: 'passkey',
          credentialId: 'credential-id',
          encryptedMasterKey: 'blob-data==',
          masterKeyIV: 'blob-iv==',
          prfInput: 'legacy-prf-input',
          label: 'Fingerprint / Face ID',
        },
      ],
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
      tx.objectStore('meta').put(version2Meta, 'vault')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()

    const migrated = await getVaultMeta()
    expect(migrated).toEqual({
      version: 3,
      keySlots: [
        {
          id: 'password-slot',
          type: 'password',
          passwordSalt: version2Meta.keySlots[0].passwordSalt,
          encryptedMasterKey: version2Meta.keySlots[0].encryptedMasterKey,
          masterKeyIV: version2Meta.keySlots[0].masterKeyIV,
        },
      ],
      verifyIV: version2Meta.verifyIV,
      verifyCiphertext: version2Meta.verifyCiphertext,
      createdAt: version2Meta.createdAt,
    })
  })

  it('drops a legacy passkey slot from version 3 metadata on read', async () => {
    const { getVaultMeta } = await import('@/lib/db')

    const version3Meta = {
      version: 3,
      keySlots: [
        {
          id: 'password-slot',
          type: 'password',
          passwordSalt: 'aabbccdd'.repeat(8),
          encryptedMasterKey: 'base64data==',
          masterKeyIV: 'iv==',
        },
        {
          id: 'passkey-slot',
          type: 'passkey',
          storage: 'largeBlob',
          credentialId: 'credential-id',
          encryptedMasterKey: 'blob-data==',
          masterKeyIV: 'blob-iv==',
          label: 'Fingerprint / Face ID',
        },
      ],
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
      tx.objectStore('meta').put(version3Meta, 'vault')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()

    const cleaned = await getVaultMeta()
    expect(cleaned).toEqual({
      version: 3,
      keySlots: [version3Meta.keySlots[0]],
      verifyIV: version3Meta.verifyIV,
      verifyCiphertext: version3Meta.verifyCiphertext,
      createdAt: version3Meta.createdAt,
    })

    // The cleaned shape is persisted, so a re-read returns the same thing.
    const reread = await getVaultMeta()
    expect(reread).toEqual(cleaned)
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
    } satisfies AuthPrefs)
  })

  it('saves and retrieves auth prefs', async () => {
    const { saveAuthPrefs, getAuthPrefs } = await import('@/lib/db')

    const saved = await saveAuthPrefs({
      stayLoggedIn: true,
    })

    expect(saved).toEqual({
      stayLoggedIn: true,
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

describe('db - legacy database migration', () => {
  const validMeta = (): VaultMeta => ({
    version: 3,
    keySlots: [
      {
        id: 'password-slot',
        type: 'password',
        passwordSalt: 'aabbccdd'.repeat(8),
        encryptedMasterKey: 'base64data==',
        masterKeyIV: 'iv==',
      },
    ],
    verifyIV: 'verifyiv==',
    verifyCiphertext: 'verifyciphertext==',
    createdAt: new Date().toISOString(),
  })

  const openRaw = (name: string) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('meta')
        db.createObjectStore('entries', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
        db.createObjectStore('goals', { keyPath: 'id' })
        db.createObjectStore('settings', { keyPath: 'id' })
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })

  const putRaw = (db: IDBDatabase, store: string, value: unknown, key?: string) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

  const legacyDatabaseExists = async () => {
    const dbs = await indexedDB.databases()
    return dbs.some((info) => info.name === 'tracker-vault')
  }

  it('copies the pre-rename database into the new one and deletes it', async () => {
    const meta = validMeta()
    const record: EncryptedRecord = {
      id: 'entry-1',
      iv: 'iv==',
      ciphertext: 'data==',
      updatedAt: new Date().toISOString(),
    }

    const legacy = await openRaw('tracker-vault')
    await putRaw(legacy, 'meta', meta, 'vault')
    await putRaw(legacy, 'entries', record)
    legacy.close()

    const { getVaultMeta, getAllEncrypted } = await import('@/lib/db')
    expect(await getVaultMeta()).toEqual(meta)
    expect(await getAllEncrypted('entries')).toEqual([record])

    // Deletion is fire-and-forget, so give it a moment to land.
    for (let i = 0; i < 50 && (await legacyDatabaseExists()); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(await legacyDatabaseExists()).toBe(false)
  })

  it('never overwrites an existing vault in the new database', async () => {
    const legacyMeta = { ...validMeta(), createdAt: '2025-01-01T00:00:00.000Z' }
    const currentMeta = validMeta()

    const legacy = await openRaw('tracker-vault')
    await putRaw(legacy, 'meta', legacyMeta, 'vault')
    legacy.close()

    const current = await openRaw('lesslately-vault')
    await putRaw(current, 'meta', currentMeta, 'vault')
    current.close()

    const { getVaultMeta } = await import('@/lib/db')
    expect(await getVaultMeta()).toEqual(currentMeta)
  })

  it('is a no-op for a fresh install', async () => {
    const { getVaultMeta } = await import('@/lib/db')
    expect(await getVaultMeta()).toBeUndefined()
    expect(await legacyDatabaseExists()).toBe(false)
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
