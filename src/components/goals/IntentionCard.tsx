import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil, Check } from 'lucide-react'

interface IntentionCardProps {
  intention: string
  onSave: (text: string) => Promise<void>
}

export function IntentionCard({ intention, onSave }: IntentionCardProps) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(intention)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(text)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          My intention
        </p>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setText(intention)
              setEditing(true)
            }}
            className="h-7 px-2"
          >
            <Pencil size={13} />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Why are you tracking? What does mindful use look like for you?"
            maxLength={1000}
            rows={4}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !text.trim()}>
              <Check size={13} className="mr-1" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <p
          className={`font-serif text-base leading-relaxed ${intention ? 'text-foreground' : 'text-muted-foreground italic'}`}
        >
          {intention || 'Tap the edit button to add your intention…'}
        </p>
      )}
    </div>
  )
}
