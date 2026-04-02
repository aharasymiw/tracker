import { useState } from 'react'
import { Clock } from 'lucide-react'
import { format } from 'date-fns'

interface TimePickerProps {
  value: Date
  onChange: (date: Date) => void
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const isNow = Date.now() - value.getTime() < 60_000

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) onChange(new Date(e.target.value))
  }

  if (open) {
    return (
      <input
        type="datetime-local"
        value={format(value, "yyyy-MM-dd'T'HH:mm")}
        onChange={handleChange}
        onBlur={() => setOpen(false)}
        className="w-full rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        autoFocus
        max={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
    >
      <Clock size={16} />
      <span>{isNow ? 'Now' : format(value, 'MMM d, h:mm a')}</span>
    </button>
  )
}
