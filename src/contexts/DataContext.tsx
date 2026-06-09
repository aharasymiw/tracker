import { useCallback, useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAuth } from '@/hooks/useAuth'
import { encrypt, decrypt } from '@/lib/crypto'
import {
  putEncrypted,
  getEncrypted,
  getAllEncrypted,
  deleteEncrypted,
  clearEncryptedStore,
} from '@/lib/db'
import { LogEntrySchema, GoalSchema, AppSettingsSchema } from '@/lib/schemas'
import type { LogEntry, Goal, AppSettings, EncryptedRecord } from '@/types'
import { DataContext, type ResolvedImport } from '@/hooks/useData'
import { setStoredTheme } from '@/lib/theme'
import { takePendingImport } from '@/lib/pendingImport'

async function encryptRecord<T>(
  id: string,
  data: T,
  masterKey: CryptoKey
): Promise<EncryptedRecord> {
  const { iv, ciphertext } = await encrypt(JSON.stringify(data), masterKey)
  return { id, iv, ciphertext, updatedAt: new Date().toISOString() }
}

async function decryptRecord<T>(
  record: EncryptedRecord,
  masterKey: CryptoKey,
  parser: (v: unknown) => T
): Promise<T> {
  const json = await decrypt(record.ciphertext, record.iv, masterKey)
  return parser(JSON.parse(json))
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  autoLockMinutes: 5,
}

const SETTINGS_ID = 'app-settings'

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { masterKey, vaultState } = useAuth()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(false)

  // Load (or reload) everything from the encrypted stores.
  const loadAll = useCallback(async () => {
    if (!masterKey) return
    const key = masterKey
    setIsLoading(true)
    try {
      const [encEntries, encGoals, encSettings] = await Promise.all([
        getAllEncrypted('entries'),
        getAllEncrypted('goals'),
        getEncrypted('settings', SETTINGS_ID),
      ])

      const decEntries = await Promise.all(
        encEntries.map((r) => decryptRecord(r, key, (v) => LogEntrySchema.parse(v)))
      )
      const decGoals = await Promise.all(
        encGoals.map((r) => decryptRecord(r, key, (v) => GoalSchema.parse(v)))
      )

      decEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      setEntries(decEntries)
      setGoals(decGoals)

      if (encSettings) {
        const decSettings = await decryptRecord(encSettings, key, (v) => AppSettingsSchema.parse(v))
        setSettings(decSettings)
        // Reconcile the synchronous theme cache with the encrypted source of
        // truth so useThemeSync and the next cold start apply the right theme
        // even if the cache was cleared or drifted.
        setStoredTheme(decSettings.theme)
      }
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [masterKey])

  // Write a fully-resolved import into the encrypted stores, then reload.
  const importBackup = useCallback(
    async (resolved: ResolvedImport): Promise<void> => {
      if (!masterKey) throw new Error('Vault is locked')
      const key = masterKey
      if (resolved.mode === 'replace') {
        await clearEncryptedStore('entries')
        await clearEncryptedStore('goals')
      }
      for (const e of resolved.entries) {
        await putEncrypted('entries', await encryptRecord(e.id, e, key))
      }
      for (const g of resolved.goals) {
        await putEncrypted('goals', await encryptRecord(g.id, g, key))
      }
      if (resolved.settings) {
        const parsed = AppSettingsSchema.parse(resolved.settings)
        await putEncrypted('settings', await encryptRecord(SETTINGS_ID, parsed, key))
      }
      await loadAll()
    },
    [masterKey, loadAll]
  )

  // Load on unlock; clear on lock. After loading, apply any backup staged by
  // onboarding to seed a brand-new vault.
  useEffect(() => {
    if (vaultState !== 'unlocked' || !masterKey) {
      setEntries([])
      setGoals([])
      setSettings(DEFAULT_SETTINGS)
      return
    }
    void (async () => {
      await loadAll()
      const seed = takePendingImport()
      if (seed) {
        await importBackup({
          mode: 'merge',
          entries: seed.entries,
          goals: seed.goals,
          settings: seed.settings,
        })
      }
    })()
  }, [vaultState, masterKey, loadAll, importBackup])

  const addEntry = useCallback(
    async (input: Omit<LogEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<LogEntry> => {
      if (!masterKey) throw new Error('Vault is locked')
      const entry: LogEntry = {
        ...input,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      LogEntrySchema.parse(entry)
      const record = await encryptRecord(entry.id, entry, masterKey)
      await putEncrypted('entries', record)
      setEntries((prev) => [entry, ...prev])
      return entry
    },
    [masterKey]
  )

  const updateEntry = useCallback(
    async (id: string, updates: Partial<Omit<LogEntry, 'id' | 'createdAt'>>): Promise<void> => {
      if (!masterKey) throw new Error('Vault is locked')
      const existing = entries.find((e) => e.id === id)
      if (!existing) throw new Error('Entry not found')
      const updated = { ...existing, ...updates, updatedAt: new Date() }
      LogEntrySchema.parse(updated)
      const record = await encryptRecord(id, updated, masterKey)
      await putEncrypted('entries', record)
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)))
    },
    [masterKey, entries]
  )

  const deleteEntry = useCallback(
    async (id: string): Promise<void> => {
      if (!masterKey) throw new Error('Vault is locked')
      await deleteEncrypted('entries', id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    },
    [masterKey]
  )

  const saveGoal = useCallback(
    async (input: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>): Promise<Goal> => {
      if (!masterKey) throw new Error('Vault is locked')
      const goal: Goal = {
        ...input,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      GoalSchema.parse(goal)
      const record = await encryptRecord(goal.id, goal, masterKey)
      await putEncrypted('goals', record)
      setGoals((prev) => [goal, ...prev])
      return goal
    },
    [masterKey]
  )

  const deleteGoal = useCallback(
    async (id: string): Promise<void> => {
      if (!masterKey) throw new Error('Vault is locked')
      await deleteEncrypted('goals', id)
      setGoals((prev) => prev.filter((g) => g.id !== id))
    },
    [masterKey]
  )

  const saveSettings = useCallback(
    async (updates: Partial<AppSettings>): Promise<void> => {
      if (!masterKey) throw new Error('Vault is locked')
      const updated = AppSettingsSchema.parse({ ...settings, ...updates })
      const record = await encryptRecord(SETTINGS_ID, updated, masterKey)
      await putEncrypted('settings', record)
      setSettings(updated)
    },
    [masterKey, settings]
  )

  return (
    <DataContext.Provider
      value={{
        entries,
        addEntry,
        updateEntry,
        deleteEntry,
        goals,
        saveGoal,
        deleteGoal,
        settings,
        saveSettings,
        importBackup,
        isLoading,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}
