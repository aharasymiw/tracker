import { format, isToday, isYesterday } from 'date-fns'
import { EntryCard } from './EntryCard'
import type { LogEntry } from '@/types'

function formatDayHeader(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMM d')
}

interface DayGroupProps {
  date: Date
  entries: LogEntry[]
  onDelete: (id: string) => Promise<void>
  onEdit: (entry: LogEntry) => void
}

export function DayGroup({ date, entries, onDelete, onEdit }: DayGroupProps) {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-2 border-b mb-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{formatDayHeader(date)}</span>
          <span className="text-xs text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </div>
      <div className="px-4 flex flex-col gap-2 pb-2">
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} onDelete={onDelete} onEdit={onEdit} />
        ))}
      </div>
    </div>
  )
}
