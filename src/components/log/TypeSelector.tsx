import { Leaf, Wind, Cookie, Droplets, FlaskConical, Hand } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConsumptionType } from '@/types'

const TYPES: {
  type: ConsumptionType
  label: string
  icon: React.ComponentType<{ size?: number }>
}[] = [
  { type: 'flower', label: 'Flower', icon: Leaf },
  { type: 'vape', label: 'Vape', icon: Wind },
  { type: 'edible', label: 'Edible', icon: Cookie },
  { type: 'concentrate', label: 'Concentrate', icon: Droplets },
  { type: 'tincture', label: 'Tincture', icon: FlaskConical },
  { type: 'topical', label: 'Topical', icon: Hand },
]

interface TypeSelectorProps {
  value: ConsumptionType
  onChange: (type: ConsumptionType) => void
}

export function TypeSelector({ value, onChange }: TypeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TYPES.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={cn(
            'flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all min-h-[72px] active:scale-95',
            value === type
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
          )}
        >
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
