import { openDB, type IDBPDatabase } from 'idb'
import type { AuthPrefs, EncryptedRecord, VaultMeta } from '@/types'
import { AuthPrefsSchema, VaultMetaSchema } from '@/lib/schemas'

const DB_NAME = 'tracker-vault'
const DB_VERSION = 1
const VAULT_META_KEY = 'vault'
const SESSION_KEY = 'session-key'
const AUTH_PREFS_KEY = 'auth-prefs'

const DEFAULT_AUTH_PREFS: AuthPrefs = {
  stayLoggedIn: false,
  preferredUnlockMethod: 'password',
}

let dbPromise: Promise<IDBPDatabase> | null = null

interface LegacyVaultMeta {
  version?: number
  passwordSalt?: string
  encryptedMasterKey?: string
  masterKeyIV?: string
  verifyIV?: string
  verifyCiphertext?: string
  createdAt?: string
}

function isLegacyVaultMeta(value: unknown): value is LegacyVaultMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const meta = value as LegacyVaultMeta
  return (
    typeof meta.passwordSalt === 'string' &&
    typeof meta.encryptedMasterKey === 'string' &&
    typeof meta.masterKeyIV === 'string' &&
    typeof meta.createdAt === 'string'
  )
}

function migrateLegacyVaultMeta(meta: LegacyVaultMeta): VaultMeta {
  const createdAt = meta.createdAt ?? new Date().toISOString()
  return {
    version: 2,
    keySlots: [
      {
        id: 'legacy-password-slot',
        type: 'password',
        passwordSalt: meta.passwordSalt ?? '',
        encryptedMasterKey: meta.encryptedMasterKey ?? '',
        masterKeyIV: meta.masterKeyIV ?? '',
      },
    ],
    verifyIV: meta.verifyIV,
    verifyCiphertext: meta.verifyCiphertext,
    createdAt,
  }
}

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
  const raw = await db.get('meta', VAULT_META_KEY)
  const parsed = VaultMetaSchema.safeParse(raw)
  if (parsed.success) return parsed.data

  if (isLegacyVaultMeta(raw)) {
    const migrated = migrateLegacyVaultMeta(raw)
    await saveVaultMeta(migrated)
    return migrated
  }

  return undefined
}

export async function saveVaultMeta(meta: VaultMeta): Promise<void> {
  const db = await getDB()
  const parsed = VaultMetaSchema.parse(meta)
  await db.put('meta', parsed, VAULT_META_KEY)
}

export async function getAuthPrefs(): Promise<AuthPrefs> {
  const db = await getDB()
  const raw = await db.get('meta', AUTH_PREFS_KEY)
  const parsed = AuthPrefsSchema.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_AUTH_PREFS
}

export async function saveAuthPrefs(updates: Partial<AuthPrefs>): Promise<AuthPrefs> {
  const db = await getDB()
  const current = await getAuthPrefs()
  const parsed = AuthPrefsSchema.parse({ ...current, ...updates })
  await db.put('meta', parsed, AUTH_PREFS_KEY)
  return parsed
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
  await db.put('meta', key, SESSION_KEY)
}

export async function getSessionKey(): Promise<CryptoKey | undefined> {
  const db = await getDB()
  return db.get('meta', SESSION_KEY)
}

export async function clearSessionKey(): Promise<void> {
  const db = await getDB()
  await db.delete('meta', SESSION_KEY)
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
