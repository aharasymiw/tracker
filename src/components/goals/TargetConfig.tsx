import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Goal } from '@/types'

interface TargetConfigProps {
  goals: Goal[]
  onSave: (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Goal>
  onDelete: (id: string) => Promise<void>
}

export function TargetConfig({ goals, onSave, onDelete }: TargetConfigProps) {
  const dailyGoal = goals.find((g) => g.type === 'daily')
  const weeklyGoal = goals.find((g) => g.type === 'weekly')

  const [editingType, setEditingType] = useState<'daily' | 'weekly' | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('hits')
  const [saving, setSaving] = useState(false)

  const startEdit = (type: 'daily' | 'weekly') => {
    const existing = type === 'daily' ? dailyGoal : weeklyGoal
    setAmount(existing ? String(existing.maxAmount) : '')
    setUnit(existing?.unit ?? 'hits')
    setEditingType(type)
  }

  const handleSave = async () => {
    if (!editingType || !amount) return
    const num = parseFloat(amount)
    if (isNaN(num) || num <= 0) return
    setSaving(true)
    try {
      // Delete old goal of same type if exists
      const existing = editingType === 'daily' ? dailyGoal : weeklyGoal
      if (existing) await onDelete(existing.id)
      await onSave({
        type: editingType,
        maxAmount: num,
        unit,
        reductionMode: false,
        startDate: new Date(),
      })
      setEditingType(null)
    } finally {
      setSaving(false)
    }
  }

  const renderGoalRow = (type: 'daily' | 'weekly', goal: Goal | undefined) => (
    <div key={type} className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div>
        <p className="text-sm font-medium capitalize">{type} limit</p>
        {goal ? (
          <p className="text-xs text-muted-foreground">
            {goal.maxAmount} {goal.unit}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">Not set</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => startEdit(type)}>
          {goal ? 'Edit' : 'Set'}
        </Button>
        {goal && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(goal.id)}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
        Targets
      </p>
      {renderGoalRow('daily', dailyGoal)}
      {renderGoalRow('weekly', weeklyGoal)}

      {editingType && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Set {editingType} limit</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs mb-1">Max amount</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 3"
                min={0}
                step={0.5}
                autoFocus
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs mb-1">Unit</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="hits, mg, etc."
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingType(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !amount}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
