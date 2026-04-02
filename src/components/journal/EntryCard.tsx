import { useState } from 'react'
import { format } from 'date-fns'
import {
  Leaf,
  Wind,
  Cookie,
  Droplets,
  FlaskConical,
  Hand,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  User,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { LogEntry, ConsumptionType } from '@/types'

const TYPE_ICONS: Record<
  ConsumptionType,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  flower: Leaf,
  vape: Wind,
  edible: Cookie,
  concentrate: Droplets,
  tincture: FlaskConical,
  topical: Hand,
}

const TYPE_COLORS: Record<ConsumptionType, string> = {
  flower: 'text-primary bg-primary/10',
  vape: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20',
  edible: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
  concentrate: 'text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-900/20',
  tincture: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20',
  topical: 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/20',
}

interface EntryCardProps {
  entry: LogEntry
  onDelete: (id: string) => Promise<void>
  onEdit: (entry: LogEntry) => void
}

export function EntryCard({ entry, onDelete, onEdit }: EntryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const Icon = TYPE_ICONS[entry.type]
  const colorClass = TYPE_COLORS[entry.type]

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(entry.id)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <div className="rounded-xl border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
        >
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              colorClass
            )}
          >
            <Icon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium capitalize">{entry.type}</span>
              <span className="text-sm text-muted-foreground">
                {entry.amount} {entry.unit}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{format(entry.timestamp, 'h:mm a')}</span>
              <span>·</span>
              {entry.socialContext === 'solo' ? (
                <>
                  <User size={11} /> Solo
                </>
              ) : (
                <>
                  <Users size={11} /> Social
                </>
              )}
            </div>
          </div>
          {expanded ? (
            <ChevronUp size={16} className="text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-muted-foreground shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="border-t px-3 pb-3 pt-2 space-y-2">
            {entry.note && <p className="text-sm text-muted-foreground italic">"{entry.note}"</p>}
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(entry)}
                className="text-muted-foreground"
              >
                <Pencil size={14} className="mr-1.5" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 size={14} className="mr-1.5" /> Delete
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete entry?</DialogTitle>
            <DialogDescription>This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
