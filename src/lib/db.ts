import { openDB, type IDBPDatabase } from 'idb'
import type { VaultMeta, EncryptedRecord } from '@/types'

const DB_NAME = 'tracker-vault'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Unencrypted meta store
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
        // Encrypted stores
        if (!db.objectStoreNames.contains('entries')) {
          const entries = db.createObjectStore('entries', { keyPath: 'id' })
          entries.createIndex('updatedAt', 'updatedAt')
        }
        if (!db.objectStoreNames.contains('goals')) {
          db.createObjectStore('goals', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export async function getVaultMeta(): Promise<VaultMeta | undefined> {
  const db = await getDB()
  return db.get('meta', 'vault')
}

export async function saveVaultMeta(meta: VaultMeta): Promise<void> {
  const db = await getDB()
  await db.put('meta', meta, 'vault')
}

export async function clearAllData(): Promise<void> {
  dbPromise = null
  const req = indexedDB.deleteDatabase(DB_NAME)
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// Session key persistence — used by AuthContext for "stay logged in"
// Stores the CryptoKey object directly (structured-cloneable, non-extractable).
// Verification is done against VaultMeta.verifyCiphertext, not a self-contained sentinel.
export async function saveSessionKey(key: CryptoKey): Promise<void> {
  const db = await getDB()
  await db.put('meta', key, 'session-key')
}

export async function getSessionKey(): Promise<CryptoKey | undefined> {
  const db = await getDB()
  return db.get('meta', 'session-key')
}

export async function clearSessionKey(): Promise<void> {
  const db = await getDB()
  await db.delete('meta', 'session-key')
}

// Encrypted CRUD — used by DataContext
export async function putEncrypted(
  store: 'entries' | 'goals' | 'settings',
  record: EncryptedRecord
): Promise<void> {
  const db = await getDB()
  await db.put(store, record)
}

export async function getEncrypted(
  store: 'entries' | 'goals' | 'settings',
  id: string
): Promise<EncryptedRecord | undefined> {
  const db = await getDB()
  return db.get(store, id)
}

export async function getAllEncrypted(
  store: 'entries' | 'goals' | 'settings'
): Promise<EncryptedRecord[]> {
  const db = await getDB()
  return db.getAll(store)
}

export async function deleteEncrypted(
  store: 'entries' | 'goals' | 'settings',
  id: string
): Promise<void> {
  const db = await getDB()
  await db.delete(store, id)
}

// Test-only: resets the cached DB promise so the next call opens a fresh connection
export function resetDbForTesting() {
  dbPromise = null
}
