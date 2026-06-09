import { useRef, useState } from 'react'
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useData } from '@/hooks/useData'
import type { ResolvedImport } from '@/hooks/useData'
import type { LogEntry, Goal } from '@/types'
import {
  decodeBackupJSON,
  inspectBackupJSON,
  parseEntriesCSV,
  planMerge,
  resolveConflict,
  BackupPasswordRequiredError,
  BackupPasswordError,
  type BackupData,
  type ConflictChoice,
  type ImportConflict,
} from '@/lib/backup'

type Stage = 'password' | 'configure' | 'conflicts' | 'done' | 'error'
type ImportMode = 'merge' | 'replace'

type Conflict =
  | { kind: 'entry'; conflict: ImportConflict<LogEntry> }
  | { kind: 'goal'; conflict: ImportConflict<Goal> }

interface ImportResult {
  added: number
  overwritten: number
  copied: number
  skipped: number
  settingsReplaced: boolean
  mode: ImportMode
}

const entrySummary = (e: LogEntry) =>
  `${format(e.timestamp, 'MMM d, yyyy · HH:mm')} — ${e.type}, ${e.amount} ${e.unit}`
const goalSummary = (g: Goal) => `${g.type} goal — max ${g.maxAmount} ${g.unit}`

export function ImportData() {
  const { entries, goals, importBackup } = useData()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('configure')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Decoded source
  const [fileText, setFileText] = useState('')
  const [decoded, setDecoded] = useState<BackupData | null>(null)
  const [sourceHasSettings, setSourceHasSettings] = useState(false)

  // Password (encrypted JSON)
  const [password, setPassword] = useState('')

  // Configure
  const [mode, setMode] = useState<ImportMode>('merge')
  const [importSettings, setImportSettings] = useState(false)

  // Conflict resolution
  const [queue, setQueue] = useState<Conflict[]>([])
  const [conflictIdx, setConflictIdx] = useState(0)
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
  const [applyToAll, setApplyToAll] = useState(false)

  const [result, setResult] = useState<ImportResult | null>(null)

  const reset = () => {
    setStage('configure')
    setError('')
    setBusy(false)
    setFileText('')
    setDecoded(null)
    setSourceHasSettings(false)
    setPassword('')
    setMode('merge')
    setImportSettings(false)
    setQueue([])
    setConflictIdx(0)
    setChoices({})
    setApplyToAll(false)
    setResult(null)
  }

  const closeDialog = () => {
    setOpen(false)
    reset()
  }

  const handlePickFile = () => fileInputRef.current?.click()

  const handleFileChosen = async (file: File) => {
    reset()
    const text = await file.text()
    setFileText(text)
    const isCsv = file.name.toLowerCase().endsWith('.csv')

    try {
      if (isCsv) {
        const csvEntries = parseEntriesCSV(text)
        finishDecode({ entries: csvEntries, goals: [], settings: defaultishSettings() }, false)
        return
      }
      const info = inspectBackupJSON(text)
      if (info.encrypted) {
        setSourceHasSettings(true)
        setStage('password')
        setOpen(true)
        return
      }
      const data = await decodeBackupJSON(text)
      finishDecode(data, info.hasSettings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.')
      setStage('error')
      setOpen(true)
    }
  }

  const finishDecode = (data: BackupData, hasSettings: boolean) => {
    setDecoded(data)
    setSourceHasSettings(hasSettings)
    setImportSettings(false)
    setMode('merge')
    setStage('configure')
    setOpen(true)
  }

  const submitPassword = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await decodeBackupJSON(fileText, password)
      finishDecode(data, true)
    } catch (err) {
      if (err instanceof BackupPasswordError || err instanceof BackupPasswordRequiredError) {
        setError('Incorrect password. Please try again.')
      } else {
        setError(err instanceof Error ? err.message : 'Could not decrypt this file.')
      }
    } finally {
      setBusy(false)
    }
  }

  const startApply = () => {
    if (!decoded) return
    if (mode === 'merge') {
      const plan = planMerge({ entries, goals }, decoded)
      const conflicts: Conflict[] = [
        ...plan.conflictEntries.map((conflict) => ({ kind: 'entry' as const, conflict })),
        ...plan.conflictGoals.map((conflict) => ({ kind: 'goal' as const, conflict })),
      ]
      if (conflicts.length > 0) {
        setQueue(conflicts)
        setConflictIdx(0)
        setChoices({})
        setApplyToAll(false)
        setStage('conflicts')
        return
      }
    }
    void apply({})
  }

  const chooseConflict = (choice: ConflictChoice) => {
    const current = queue[conflictIdx]
    const next = { ...choices, [current.conflict.id]: choice }
    if (applyToAll) {
      for (let i = conflictIdx; i < queue.length; i++) next[queue[i].conflict.id] = choice
      setChoices(next)
      void apply(next)
      return
    }
    setChoices(next)
    if (conflictIdx + 1 >= queue.length) {
      void apply(next)
    } else {
      setConflictIdx(conflictIdx + 1)
    }
  }

  const apply = async (finalChoices: Record<string, ConflictChoice>) => {
    if (!decoded) return
    setBusy(true)
    setError('')
    try {
      const counts = { added: 0, overwritten: 0, copied: 0, skipped: 0 }
      let finalEntries: LogEntry[]
      let finalGoals: Goal[]

      if (mode === 'replace') {
        finalEntries = decoded.entries
        finalGoals = decoded.goals
        counts.added = decoded.entries.length + decoded.goals.length
      } else {
        const plan = planMerge({ entries, goals }, decoded)
        finalEntries = [...plan.freshEntries]
        finalGoals = [...plan.freshGoals]
        counts.added = plan.freshEntries.length + plan.freshGoals.length

        for (const c of plan.conflictEntries) {
          const choice = finalChoices[c.id] ?? 'skip'
          const resolvedRecord = resolveConflict(c, choice)
          tally(counts, choice)
          if (resolvedRecord) finalEntries.push(resolvedRecord)
        }
        for (const c of plan.conflictGoals) {
          const choice = finalChoices[c.id] ?? 'skip'
          const resolvedRecord = resolveConflict(c, choice)
          tally(counts, choice)
          if (resolvedRecord) finalGoals.push(resolvedRecord)
        }
      }

      const settings = importSettings && sourceHasSettings ? decoded.settings : null
      const payload: ResolvedImport = { mode, entries: finalEntries, goals: finalGoals, settings }
      await importBackup(payload)

      setResult({ ...counts, settingsReplaced: settings !== null, mode })
      setStage('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
      setStage('error')
    } finally {
      setBusy(false)
    }
  }

  const current = queue[conflictIdx]

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset the input so re-selecting the same file fires onChange again.
          e.target.value = ''
          if (file) void handleFileChosen(file)
        }}
      />

      <Button variant="outline" size="sm" className="w-full" onClick={handlePickFile}>
        <Upload size={14} className="mr-2" /> Import backup
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}>
        <DialogContent>
          {stage === 'password' && (
            <>
              <DialogHeader>
                <DialogTitle>Encrypted backup</DialogTitle>
                <DialogDescription>
                  This backup is password-protected. Enter the password it was exported with.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="backup-password">Backup password</Label>
                <Input
                  id="backup-password"
                  type="password"
                  value={password}
                  autoFocus
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && password && !busy) void submitPassword()
                  }}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={submitPassword} disabled={busy || !password}>
                  {busy ? 'Decrypting…' : 'Unlock'}
                </Button>
              </DialogFooter>
            </>
          )}

          {stage === 'configure' && decoded && (
            <>
              <DialogHeader>
                <DialogTitle>Import backup</DialogTitle>
                <DialogDescription>
                  Found {decoded.entries.length}{' '}
                  {decoded.entries.length === 1 ? 'entry' : 'entries'}
                  {decoded.goals.length > 0 && ` and ${decoded.goals.length} goals`}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setMode('merge')}
                    className={modeClass(mode === 'merge')}
                  >
                    <span className="font-medium">Merge</span>
                    <span className="block text-xs text-muted-foreground">
                      Add to your current data. You&apos;ll choose what to do for any records that
                      already exist.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('replace')}
                    className={modeClass(mode === 'replace')}
                  >
                    <span className="font-medium text-destructive">Replace</span>
                    <span className="block text-xs text-muted-foreground">
                      Delete all current entries and goals first, then import. This cannot be
                      undone.
                    </span>
                  </button>
                </div>

                {sourceHasSettings && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <Label htmlFor="import-settings" className="text-sm font-normal">
                      Also import settings
                      <span className="block text-xs text-muted-foreground">
                        Overwrites your theme, auto-lock, and intention.
                      </span>
                    </Label>
                    <Switch
                      id="import-settings"
                      checked={importSettings}
                      onCheckedChange={setImportSettings}
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant={mode === 'replace' ? 'destructive' : 'default'}
                  onClick={startApply}
                  disabled={busy}
                >
                  {busy ? 'Importing…' : mode === 'replace' ? 'Replace & import' : 'Continue'}
                </Button>
              </DialogFooter>
            </>
          )}

          {stage === 'conflicts' && current && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Conflict {conflictIdx + 1} of {queue.length}
                </DialogTitle>
                <DialogDescription>
                  This {current.kind} already exists. What should happen?
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-lg border p-3 text-sm">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Current
                  </p>
                  <p>
                    {current.kind === 'entry'
                      ? entrySummary(current.conflict.existing)
                      : goalSummary(current.conflict.existing)}
                  </p>
                  <p className="mt-2 mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Incoming
                  </p>
                  <p>
                    {current.kind === 'entry'
                      ? entrySummary(current.conflict.incoming)
                      : goalSummary(current.conflict.incoming)}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <Label htmlFor="apply-all" className="text-sm font-normal">
                    Apply my choice to all remaining conflicts
                  </Label>
                  <Switch id="apply-all" checked={applyToAll} onCheckedChange={setApplyToAll} />
                </div>
              </div>

              <DialogFooter className="sm:flex-col sm:gap-2">
                <Button className="w-full" variant="outline" onClick={() => chooseConflict('skip')}>
                  Skip — keep current
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => chooseConflict('overwrite')}
                >
                  Overwrite with incoming
                </Button>
                <Button className="w-full" variant="outline" onClick={() => chooseConflict('copy')}>
                  Import as a new copy
                </Button>
              </DialogFooter>
            </>
          )}

          {stage === 'done' && result && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-primary" /> Import complete
                </DialogTitle>
                <DialogDescription>
                  {result.mode === 'replace'
                    ? `Replaced your data with ${result.added} imported records.`
                    : `Added ${result.added}, overwrote ${result.overwritten}, copied ${result.copied}, skipped ${result.skipped}.`}
                  {result.settingsReplaced && ' Settings were updated.'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={closeDialog}>Done</Button>
              </DialogFooter>
            </>
          )}

          {stage === 'error' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-destructive" /> Import failed
                </DialogTitle>
                <DialogDescription>{error}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={closeDialog}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function tally(
  counts: { overwritten: number; copied: number; skipped: number },
  choice: ConflictChoice
) {
  if (choice === 'overwrite') counts.overwritten++
  else if (choice === 'copy') counts.copied++
  else counts.skipped++
}

function modeClass(active: boolean) {
  return [
    'w-full rounded-lg border p-3 text-left transition-colors',
    active ? 'border-primary bg-primary/5' : 'hover:bg-muted',
  ].join(' ')
}

// CSV has no settings; provide a placeholder that is never written (the settings
// toggle is hidden when the source has no settings).
function defaultishSettings(): BackupData['settings'] {
  return { theme: 'system', autoLockMinutes: 5 }
}
