import { useState } from 'react'
import { addWeeks, format } from 'date-fns'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import type { Goal } from '@/types'

interface ReductionModeProps {
  goal: Goal | undefined
  onUpdate: (id: string, updates: Partial<Goal>) => Promise<void>
}

export function ReductionMode({ goal, onUpdate }: ReductionModeProps) {
  const [rate, setRate] = useState(goal?.reductionRate ?? 10)

  if (!goal) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Set a daily target above to enable gradual reduction mode.
      </div>
    )
  }

  const handleToggle = async (enabled: boolean) => {
    await onUpdate(goal.id, { reductionMode: enabled, reductionRate: enabled ? rate : undefined })
  }

  const handleRateChange = async (value: number | readonly number[]) => {
    const newRate = Array.isArray(value) ? (value as readonly number[])[0] : (value as number)
    setRate(newRate)
    if (goal.reductionMode) {
      await onUpdate(goal.id, { reductionRate: newRate })
    }
  }

  const weeksToHalf =
    goal.reductionMode && rate > 0 ? Math.ceil(Math.log(0.5) / Math.log(1 - rate / 100)) : null

  const projectedDate = weeksToHalf ? addWeeks(new Date(), weeksToHalf) : null

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Gradual reduction</p>
          <p className="text-xs text-muted-foreground">Automatically lower your target over time</p>
        </div>
        <Switch checked={goal.reductionMode} onCheckedChange={handleToggle} />
      </div>

      {goal.reductionMode && (
        <>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Reduce by {rate}% per week</Label>
            </div>
            <Slider value={[rate]} onValueChange={handleRateChange} min={5} max={50} step={5} />
          </div>

          {projectedDate && (
            <div className="rounded-lg bg-primary/5 p-3 text-sm">
              <p className="text-muted-foreground">
                At this rate, you'll reach half your current target by{' '}
                <span className="text-foreground font-medium">
                  {format(projectedDate, 'MMMM d, yyyy')}
                </span>
                . Every step counts. 🌱
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
