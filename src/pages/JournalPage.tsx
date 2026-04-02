import { useMemo, useState } from 'react'
import { startOfDay } from 'date-fns'
import { BookOpen } from 'lucide-react'
import { DayGroup } from '@/components/journal/DayGroup'
import { EntryEditor } from '@/components/journal/EntryEditor'
import { useEntries } from '@/hooks/useEntries'
import type { LogEntry } from '@/types'

export default function JournalPage() {
  const { entries, deleteEntry, updateEntry } = useEntries()
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, { date: Date; entries: LogEntry[] }>()
    for (const entry of entries) {
      const day = startOfDay(entry.timestamp)
      const key = day.toISOString()
      if (!map.has(key)) map.set(key, { date: day, entries: [] })
      map.get(key)!.entries.push(entry)
    }
    return Array.from(map.values())
  }, [entries])

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-8">
        <BookOpen size={40} className="text-muted-foreground/40" />
        <p className="font-serif text-lg">Nothing logged yet</p>
        <p className="text-sm text-muted-foreground">Use the Log tab to record your first entry</p>
      </div>
    )
  }

  return (
    <>
      <div className="pb-4">
        {grouped.map(({ date, entries: dayEntries }) => (
          <DayGroup
            key={date.toISOString()}
            date={date}
            entries={dayEntries}
            onDelete={deleteEntry}
            onEdit={setEditingEntry}
          />
        ))}
      </div>

      <EntryEditor
        entry={editingEntry}
        onSave={updateEntry}
        onClose={() => setEditingEntry(null)}
      />
    </>
  )
}
