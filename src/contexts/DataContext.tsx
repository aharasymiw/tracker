import { useCallback, useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAuth } from '@/hooks/useAuth'
import { encrypt, decrypt } from '@/lib/crypto'
import { putEncrypted, getEncrypted, getAllEncrypted, deleteEncrypted } from '@/lib/db'
import { LogEntrySchema, GoalSchema, AppSettingsSchema } from '@/lib/schemas'
import type { LogEntry, Goal, AppSettings, EncryptedRecord } from '@/types'
import { DataContext } from '@/hooks/useData'

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
  stayLoggedIn: false,
}

const SETTINGS_ID = 'app-settings'

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { masterKey, vaultState } = useAuth()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(false)

  // Load all data when vault unlocks
  useEffect(() => {
    if (vaultState !== 'unlocked' || !masterKey) {
      setEntries([])
      setGoals([])
      setSettings(DEFAULT_SETTINGS)
      return
    }

    setIsLoading(true)
    const load = async () => {
      try {
        const [encEntries, encGoals, encSettings] = await Promise.all([
          getAllEncrypted('entries'),
          getAllEncrypted('goals'),
          getEncrypted('settings', SETTINGS_ID),
        ])

        const decEntries = await Promise.all(
          encEntries.map((r) => decryptRecord(r, masterKey!, (v) => LogEntrySchema.parse(v)))
        )
        const decGoals = await Promise.all(
          encGoals.map((r) => decryptRecord(r, masterKey!, (v) => GoalSchema.parse(v)))
        )

        decEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        setEntries(decEntries)
        setGoals(decGoals)

        if (encSettings) {
          const decSettings = await decryptRecord(encSettings, masterKey!, (v) =>
            AppSettingsSchema.parse(v)
          )
          setSettings(decSettings)
        }
      } catch (err) {
        console.error('Failed to load data:', err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [vaultState, masterKey])

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
        isLoading,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}
