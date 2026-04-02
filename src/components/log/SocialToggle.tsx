import { User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SocialContext } from '@/types'

interface SocialToggleProps {
  value: SocialContext
  onChange: (v: SocialContext) => void
}

export function SocialToggle({ value, onChange }: SocialToggleProps) {
  return (
    <div className="flex overflow-hidden rounded-xl border bg-muted p-1">
      {(['solo', 'social'] as const).map((ctx) => (
        <button
          key={ctx}
          type="button"
          onClick={() => onChange(ctx)}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all',
            value === ctx
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {ctx === 'solo' ? <User size={16} /> : <Users size={16} />}
          <span className="capitalize">{ctx}</span>
        </button>
      ))}
    </div>
  )
}
