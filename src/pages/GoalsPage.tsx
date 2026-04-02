import { useMemo } from 'react'
import { Target } from 'lucide-react'
import { IntentionCard } from '@/components/goals/IntentionCard'
import { TargetConfig } from '@/components/goals/TargetConfig'
import { ReductionMode } from '@/components/goals/ReductionMode'
import { ProgressRing } from '@/components/goals/ProgressRing'
import { useGoals } from '@/hooks/useGoals'
import { useData } from '@/contexts/DataContext'
import { useEntries } from '@/hooks/useEntries'
import { startOfDay, startOfWeek } from 'date-fns'
import type { Goal } from '@/types'

export default function GoalsPage() {
  const { goals, saveGoal, deleteGoal } = useGoals()
  const { settings, saveSettings } = useData()
  const { entries } = useEntries()

  const dailyGoal = goals.find((g) => g.type === 'daily')
  const weeklyGoal = goals.find((g) => g.type === 'weekly')

  const todayEntries = useMemo(() => {
    const today = startOfDay(new Date())
    return entries.filter((e) => e.timestamp >= today)
  }, [entries])

  const thisWeekEntries = useMemo(() => {
    const weekStart = startOfWeek(new Date())
    return entries.filter((e) => e.timestamp >= weekStart)
  }, [entries])

  const todayTotal = todayEntries.reduce((s, e) => s + e.amount, 0)
  const weekTotal = thisWeekEntries.reduce((s, e) => s + e.amount, 0)

  const dailyProgress = dailyGoal ? Math.round((todayTotal / dailyGoal.maxAmount) * 100) : 0
  const weeklyProgress = weeklyGoal ? Math.round((weekTotal / weeklyGoal.maxAmount) * 100) : 0

  const handleSaveIntention = async (text: string) => {
    await saveSettings({ intention: text })
  }

  const intention = settings.intention ?? ''

  const handleUpdateGoal = async (id: string, updates: Partial<Goal>) => {
    const goal = goals.find((g) => g.id === id)
    if (!goal) return
    await deleteGoal(id)
    await saveGoal({ ...goal, ...updates })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Progress rings */}
      {(dailyGoal || weeklyGoal) && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Today's progress
          </p>
          <div className="flex items-center justify-around">
            {dailyGoal && (
              <div className="flex flex-col items-center gap-1">
                <ProgressRing
                  value={dailyProgress}
                  size={88}
                  label={`${Math.min(dailyProgress, 100)}%`}
                  sublabel="daily"
                />
                <p className="text-xs text-muted-foreground text-center">
                  {todayTotal.toFixed(1)} / {dailyGoal.maxAmount} {dailyGoal.unit}
                </p>
              </div>
            )}
            {weeklyGoal && (
              <div className="flex flex-col items-center gap-1">
                <ProgressRing
                  value={weeklyProgress}
                  size={88}
                  label={`${Math.min(weeklyProgress, 100)}%`}
                  sublabel="weekly"
                />
                <p className="text-xs text-muted-foreground text-center">
                  {weekTotal.toFixed(1)} / {weeklyGoal.maxAmount} {weeklyGoal.unit}
                </p>
              </div>
            )}
          </div>
          {dailyProgress <= 100 && weeklyProgress <= 100 && (dailyGoal || weeklyGoal) && (
            <p className="text-center text-xs text-muted-foreground mt-3">
              Every day is a fresh start. 🌿
            </p>
          )}
        </div>
      )}

      <IntentionCard intention={intention} onSave={handleSaveIntention} />

      <TargetConfig goals={goals} onSave={saveGoal} onDelete={deleteGoal} />

      <ReductionMode goal={dailyGoal} onUpdate={handleUpdateGoal} />

      {goals.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Target size={32} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Set a target above to start tracking your progress
          </p>
        </div>
      )}
    </div>
  )
}
