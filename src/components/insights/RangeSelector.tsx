import { cn } from '@/lib/utils'
import type { TimeRange } from '@/hooks/useInsights'

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: '3months', label: '3 Mo' },
  { value: 'year', label: 'Year' },
]

interface RangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <div className="flex overflow-hidden rounded-xl border bg-muted p-1 gap-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-lg py-1.5 text-sm font-medium transition-all',
            value === opt.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
