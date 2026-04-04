import { useState, useCallback } from 'react'
import { TypeSelector } from '@/components/log/TypeSelector'
import { DEFAULT_UNITS } from '@/lib/constants'
import { AmountStepper } from '@/components/log/AmountStepper'
import { SocialToggle } from '@/components/log/SocialToggle'
import { TimePicker } from '@/components/log/TimePicker'
import { LogConfirm } from '@/components/log/LogConfirm'
import { Button } from '@/components/ui/button'
import { useEntries } from '@/hooks/useEntries'
import type { ConsumptionType, SocialContext } from '@/types'
import { ChevronDown } from 'lucide-react'

function getDefaultState() {
  return {
    type: 'flower' as ConsumptionType,
    amount: 1,
    socialContext: 'solo' as SocialContext,
    timestamp: new Date(),
    note: '',
    noteOpen: false,
  }
}

export default function LogPage() {
  const { addEntry } = useEntries()
  const [state, setState] = useState(getDefaultState)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const unit = DEFAULT_UNITS[state.type]

  const handleTypeChange = useCallback((type: ConsumptionType) => {
    setState((s) => ({ ...s, type, amount: 1 }))
  }, [])

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await addEntry({
        type: state.type,
        amount: state.amount,
        unit,
        socialContext: state.socialContext,
        timestamp: state.timestamp,
        note: state.note || undefined,
      })
      setConfirming(true)
    } catch (err) {
      console.error('Failed to log entry:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDismiss = useCallback(() => {
    setConfirming(false)
    setState(getDefaultState())
  }, [])

  return (
    <>
      {confirming && <LogConfirm onDismiss={handleDismiss} />}

      <div className="flex flex-col gap-5 p-4">
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Type
          </p>
          <TypeSelector value={state.type} onChange={handleTypeChange} />
        </section>

        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Amount
          </p>
          <AmountStepper
            value={state.amount}
            unit={unit}
            onChange={(amount) => setState((s) => ({ ...s, amount }))}
          />
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Context
          </p>
          <SocialToggle
            value={state.socialContext}
            onChange={(socialContext) => setState((s) => ({ ...s, socialContext }))}
          />
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Time
          </p>
          <TimePicker
            value={state.timestamp}
            onChange={(timestamp) => setState((s) => ({ ...s, timestamp }))}
          />
        </section>

        <section>
          {state.noteOpen ? (
            <textarea
              placeholder="Add a note… (optional)"
              value={state.note}
              onChange={(e) => setState((s) => ({ ...s, note: e.target.value }))}
              maxLength={500}
              rows={3}
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          ) : (
            <button
              type="button"
              onClick={() => setState((s) => ({ ...s, noteOpen: true }))}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown size={16} />
              Add note
            </button>
          )}
        </section>

        <Button
          size="lg"
          className="w-full mt-2"
          onClick={handleSubmit}
          disabled={submitting || state.amount <= 0}
        >
          {submitting ? 'Logging…' : 'Log'}
        </Button>
      </div>
    </>
  )
}
