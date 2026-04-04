import { useData } from '@/hooks/useData'

export function useEntries() {
  const { entries, addEntry, updateEntry, deleteEntry } = useData()
  return { entries, addEntry, updateEntry, deleteEntry }
}
