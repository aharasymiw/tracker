import { createContext, useContext } from 'react'
import type { LogEntry, Goal, AppSettings } from '@/types'

/**
 * A fully-resolved import ready to write. The UI resolves merge/replace and any
 * id conflicts first (see `@/lib/backup`), so this is just the final record set.
 * `settings: null` leaves the current settings untouched.
 */
export interface ResolvedImport {
  mode: 'merge' | 'replace'
  entries: LogEntry[]
  goals: Goal[]
  settings: AppSettings | null
}

export interface DataContextValue {
  // Entries
  entries: LogEntry[]
  addEntry: (entry: Omit<LogEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<LogEntry>
  updateEntry: (id: string, updates: Partial<Omit<LogEntry, 'id' | 'createdAt'>>) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  // Goals
  goals: Goal[]
  saveGoal: (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Goal>
  deleteGoal: (id: string) => Promise<void>
  // Settings
  settings: AppSettings
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>
  // Backup import (export reads entries/goals/settings directly)
  importBackup: (resolved: ResolvedImport) => Promise<void>
  // State
  isLoading: boolean
}

export const DataContext = createContext<DataContextValue | null>(null)

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
