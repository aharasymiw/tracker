import { useData } from '@/contexts/DataContext'

export function useEntries() {
  const { entries, addEntry, updateEntry, deleteEntry } = useData()
  return { entries, addEntry, updateEntry, deleteEntry }
}
