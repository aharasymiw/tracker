import { createContext, useContext } from 'react'
import type { LogEntry, Goal, AppSettings } from '@/types'

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
  // State
  isLoading: boolean
}

export const DataContext = createContext<DataContextValue | null>(null)

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
