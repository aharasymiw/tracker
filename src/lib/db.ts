import { deleteDB, openDB, type IDBPDatabase } from 'idb'
import type { AuthPrefs, EncryptedRecord, VaultMeta } from '@/types'
import { AuthPrefsSchema, VaultMetaSchema } from '@/lib/schemas'

const DB_NAME = 'lesslately-vault'
// Database name before the Trellis → Less Lately rename. IndexedDB has no
// rename, so the first open copies it into DB_NAME and deletes it.
const LEGACY_DB_NAME = 'tracker-vault'
const DB_VERSION = 1
const VAULT_META_KEY = 'vault'
const SESSION_KEY = 'session-key'
const AUTH_PREFS_KEY = 'auth-prefs'

const DEFAULT_AUTH_PREFS: AuthPrefs = {
  stayLoggedIn: false,
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

interface LegacyPasswordKeySlotV2 {
  id?: string
  type: 'password'
  passwordSalt?: string
  encryptedMasterKey?: string
  masterKeyIV?: string
}

interface LegacyPasskeyKeySlotV2 {
  id?: string
  type: 'passkey'
  credentialId?: string
  encryptedMasterKey?: string
  masterKeyIV?: string
  label?: string
  transports?: string[]
  prfInput?: string
  rpId?: string
}

interface LegacyVaultMetaV2 {
  version: 2
  keySlots?: Array<LegacyPasswordKeySlotV2 | LegacyPasskeyKeySlotV2>
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

function isLegacyVaultMetaV2(value: unknown): value is LegacyVaultMetaV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const meta = value as LegacyVaultMetaV2
  return meta.version === 2 && Array.isArray(meta.keySlots) && typeof meta.createdAt === 'string'
}

interface RawVersion3Meta {
  version: 3
  keySlots: Array<{ type?: string } & Record<string, unknown>>
  [key: string]: unknown
}

function isVersion3Meta(value: unknown): value is RawVersion3Meta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const meta = value as { version?: unknown; keySlots?: unknown }
  return meta.version === 3 && Array.isArray(meta.keySlots)
}

function migrateLegacyVaultMeta(meta: LegacyVaultMeta): VaultMeta {
  const createdAt = meta.createdAt ?? new Date().toISOString()
  return {
    version: 3,
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

function migrateLegacyVaultMetaV2(meta: LegacyVaultMetaV2): VaultMeta {
  const createdAt = meta.createdAt ?? new Date().toISOString()
  const passwordSlots = (meta.keySlots ?? [])
    .filter((slot): slot is LegacyPasswordKeySlotV2 => slot.type === 'password')
    .map((slot, index) => ({
      id: slot.id ?? (index === 0 ? 'password-slot' : `password-slot-${index + 1}`),
      type: 'password' as const,
      passwordSalt: slot.passwordSalt ?? '',
      encryptedMasterKey: slot.encryptedMasterKey ?? '',
      masterKeyIV: slot.masterKeyIV ?? '',
    }))

  return {
    version: 3,
    keySlots: passwordSlots,
    verifyIV: meta.verifyIV,
    verifyCiphertext: meta.verifyCiphertext,
    createdAt,
  }
}

// One-time copy of the pre-rename database. Runs on every open but exits
// cheaply once the legacy database is gone. Copy first, delete after: if
// anything fails mid-way the legacy data stays put and the next open retries.
async function migrateLegacyDatabase(db: IDBPDatabase): Promise<void> {
  if (typeof indexedDB.databases === 'function') {
    const existing = await indexedDB.databases()
    if (!existing.some((info) => info.name === LEGACY_DB_NAME)) return
  }

  const legacy = await openDB(LEGACY_DB_NAME)
  try {
    // Without indexedDB.databases() the open above creates an empty database;
    // no stores means there was nothing to migrate.
    if (legacy.objectStoreNames.length === 0) return

    // Never overwrite: a vault in the new database means the copy already
    // happened and only the legacy delete was interrupted.
    const hasVault = (await db.get('meta', VAULT_META_KEY)) !== undefined
    if (!hasVault) {
      for (const store of ['meta', 'entries', 'goals', 'settings'] as const) {
        if (!legacy.objectStoreNames.contains(store)) continue
        const [keys, values] = await Promise.all([legacy.getAllKeys(store), legacy.getAll(store)])
        const tx = db.transaction(store, 'readwrite')
        await Promise.all([
          ...values.map((value, i) =>
            // meta uses out-of-line keys; the other stores have keyPath 'id'.
            store === 'meta' ? tx.store.put(value, keys[i]) : tx.store.put(value)
          ),
          tx.done,
        ])
      }
    }
  } finally {
    legacy.close()
  }
  // Not awaited: deletion blocks while another tab (running pre-rename code)
  // still holds the legacy database open. The hasVault guard above makes a
  // retried delete on the next open safe.
  void deleteDB(LEGACY_DB_NAME)
}

function getDB() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openDB(DB_NAME, DB_VERSION, {
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
      try {
        await migrateLegacyDatabase(db)
      } catch {
        // A failed migration must not brick the app. The legacy database is
        // untouched on failure, so the next launch retries.
      }
      return db
    })()
  }
  return dbPromise
}

export async function getVaultMeta(): Promise<VaultMeta | undefined> {
  const db = await getDB()
  const raw = await db.get('meta', VAULT_META_KEY)

  if (isVersion3Meta(raw)) {
    // A v3 vault saved by a build that supported biometric unlock may still
    // carry passkey key slots. Drop any non-password slots so the vault opens
    // with its password, and persist the cleaned shape.
    const passwordSlots = raw.keySlots.filter((slot) => slot?.type === 'password')
    const candidate =
      passwordSlots.length === raw.keySlots.length ? raw : { ...raw, keySlots: passwordSlots }
    const parsed = VaultMetaSchema.safeParse(candidate)
    if (!parsed.success) return undefined
    if (candidate !== raw) await saveVaultMeta(parsed.data)
    return parsed.data
  }

  if (isLegacyVaultMeta(raw)) {
    const migrated = migrateLegacyVaultMeta(raw)
    await saveVaultMeta(migrated)
    return migrated
  }

  if (isLegacyVaultMetaV2(raw)) {
    const migrated = migrateLegacyVaultMetaV2(raw)
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
  // Drop the legacy pre-rename database too, in case migration never ran.
  for (const name of [DB_NAME, LEGACY_DB_NAME]) {
    const req = indexedDB.deleteDatabase(name)
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
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

export async function clearEncryptedStore(store: 'entries' | 'goals' | 'settings'): Promise<void> {
  const db = await getDB()
  await db.clear(store)
}

// Test-only: resets the cached DB promise so the next call opens a fresh connection
export function resetDbForTesting() {
  dbPromise = null
}
