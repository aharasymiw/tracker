import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface AmountStepperProps {
  value: number
  unit: string
  onChange: (value: number) => void
  step?: number
  min?: number
}

export function AmountStepper({ value, unit, onChange, step = 1, min = 0 }: AmountStepperProps) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')

  const increment = () => {
    onChange(Math.round((value + step) * 100) / 100)
    navigator.vibrate?.(10)
  }

  const decrement = () => {
    const next = Math.round((value - step) * 100) / 100
    if (next >= min) {
      onChange(next)
      navigator.vibrate?.(10)
    }
  }

  const handleNumberClick = () => {
    setInputVal(String(value))
    setEditing(true)
  }

  const handleInputBlur = () => {
    const num = parseFloat(inputVal)
    if (!isNaN(num) && num >= min) onChange(num)
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={decrement}
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all active:scale-90',
          value <= min
            ? 'border-border text-muted-foreground opacity-40'
            : 'border-primary text-primary hover:bg-primary/5'
        )}
        disabled={value <= min}
      >
        <Minus size={20} />
      </button>

      {editing ? (
        <Input
          type="number"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={handleInputBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleInputBlur()}
          className="w-28 text-center text-2xl font-semibold"
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={handleNumberClick}
          className="flex min-w-[5rem] flex-col items-center"
        >
          <span className="text-4xl font-bold tabular-nums">{value}</span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </button>
      )}

      <button
        type="button"
        onClick={increment}
        className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary text-primary transition-all hover:bg-primary/5 active:scale-90"
      >
        <Plus size={20} />
      </button>
    </div>
  )
}
