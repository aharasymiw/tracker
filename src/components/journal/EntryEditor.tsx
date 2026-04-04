import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TypeSelector } from '@/components/log/TypeSelector'
import { DEFAULT_UNITS } from '@/lib/constants'
import { AmountStepper } from '@/components/log/AmountStepper'
import { SocialToggle } from '@/components/log/SocialToggle'
import { TimePicker } from '@/components/log/TimePicker'
import type { LogEntry, ConsumptionType, SocialContext } from '@/types'

interface EntryEditorProps {
  entry: LogEntry | null
  onSave: (id: string, updates: Partial<LogEntry>) => Promise<void>
  onClose: () => void
}

export function EntryEditor({ entry, onSave, onClose }: EntryEditorProps) {
  const [type, setType] = useState<ConsumptionType>('flower')
  const [amount, setAmount] = useState(1)
  const [socialContext, setSocialContext] = useState<SocialContext>('solo')
  const [timestamp, setTimestamp] = useState(new Date())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (entry) {
      setType(entry.type)
      setAmount(entry.amount)
      setSocialContext(entry.socialContext)
      setTimestamp(entry.timestamp)
      setNote(entry.note ?? '')
    }
  }, [entry])

  const handleSave = async () => {
    if (!entry) return
    setSaving(true)
    try {
      await onSave(entry.id, {
        type,
        amount,
        unit: DEFAULT_UNITS[type],
        socialContext,
        timestamp,
        note: note || undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit entry</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <TypeSelector value={type} onChange={setType} />
          <AmountStepper value={amount} unit={DEFAULT_UNITS[type]} onChange={setAmount} />
          <SocialToggle value={socialContext} onChange={setSocialContext} />
          <TimePicker value={timestamp} onChange={setTimestamp} />
          <textarea
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
