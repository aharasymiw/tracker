import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { decodeBackupJSON, inspectBackupJSON, parseEntriesCSV, type BackupData } from '@/lib/backup'
import { setPendingImport, clearPendingImport } from '@/lib/pendingImport'

type Step = 'welcome' | 'restore-password' | 'password'

export function Onboarding() {
  const { createVaultWithPassword } = useAuth()
  const [step, setStep] = useState<Step>('welcome')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Restore-from-backup (seed a brand-new vault)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [seed, setSeed] = useState<BackupData | null>(null)
  const [seedFileText, setSeedFileText] = useState('')
  const [restorePw, setRestorePw] = useState('')
  const [restoreError, setRestoreError] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)

  const canSubmit = !loading && password.length >= 8 && password === confirm

  const proceedAfterSeed = () => {
    setRestoreError('')
    setRestorePw('')
    setStep('password')
  }

  const handleRestoreFile = async (file: File) => {
    setRestoreError('')
    const text = await file.text()
    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const entries = parseEntriesCSV(text)
        setSeed({ entries, goals: [], settings: { theme: 'system', autoLockMinutes: 5 } })
        proceedAfterSeed()
        return
      }
      const info = inspectBackupJSON(text)
      if (info.encrypted) {
        setSeedFileText(text)
        setStep('restore-password')
        return
      }
      setSeed(await decodeBackupJSON(text))
      proceedAfterSeed()
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Could not read this backup file.')
    }
  }

  const submitRestorePassword = async () => {
    setRestoreBusy(true)
    setRestoreError('')
    try {
      setSeed(await decodeBackupJSON(seedFileText, restorePw))
      proceedAfterSeed()
    } catch {
      setRestoreError('Incorrect password. Please try again.')
    } finally {
      setRestoreBusy(false)
    }
  }

  const validatePassword = () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return false
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const handleCreatePasswordVault = async () => {
    if (!validatePassword()) return
    setError('')
    setLoading(true)
    // Stage the backup so DataContext seeds it once the new vault unlocks.
    if (seed) setPendingImport(seed)
    try {
      await createVaultWithPassword(password)
    } catch (err) {
      clearPendingImport()
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to create vault. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (step === 'welcome') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void handleRestoreFile(file)
          }}
        />
        <div className="space-y-2">
          <h1 className="font-serif text-4xl">Less Lately</h1>
          <p className="text-muted-foreground">Track mindfully. Understand your patterns.</p>
        </div>
        <div className="max-w-xs rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Your data never leaves this device. Everything is encrypted locally.
        </div>
        <div className="w-full max-w-xs space-y-2">
          <Button size="lg" className="w-full" onClick={() => setStep('password')}>
            Get Started
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} className="mr-2" /> Restore from a backup
          </Button>
          {restoreError && <p className="text-sm text-destructive">{restoreError}</p>}
        </div>
      </div>
    )
  }

  if (step === 'restore-password') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <h2 className="font-serif text-2xl">Encrypted backup</h2>
            <p className="text-sm text-muted-foreground">
              This backup is password-protected. Enter the password it was exported with.
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="restore-pw">Backup password</Label>
              <Input
                id="restore-pw"
                type="password"
                value={restorePw}
                autoFocus
                onChange={(e) => setRestorePw(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && restorePw && !restoreBusy) void submitRestorePassword()
                }}
              />
            </div>
            {restoreError && <p className="text-sm text-destructive">{restoreError}</p>}
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={submitRestorePassword}
                disabled={restoreBusy || !restorePw}
              >
                {restoreBusy ? 'Decrypting…' : 'Unlock backup'}
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => {
                  setRestoreError('')
                  setRestorePw('')
                  setSeedFileText('')
                  setStep('welcome')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const seedNotice = seed ? (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
      Restoring <strong>{seed.entries.length}</strong>{' '}
      {seed.entries.length === 1 ? 'entry' : 'entries'}
      {seed.goals.length > 0 && (
        <>
          {' '}
          and <strong>{seed.goals.length}</strong> goals
        </>
      )}{' '}
      into your new vault.
    </div>
  ) : null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="font-serif text-2xl">Create your vault</h2>
          <p className="text-sm text-muted-foreground">Choose a password to secure your data.</p>
        </div>

        <div className="space-y-4">
          {seedNotice}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) void handleCreatePasswordVault()
                }}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" onClick={handleCreatePasswordVault} disabled={!canSubmit}>
            {loading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Creating vault…
              </>
            ) : (
              'Create vault'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
