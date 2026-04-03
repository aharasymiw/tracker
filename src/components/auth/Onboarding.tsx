import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { Fingerprint, KeyRound, Loader2, ShieldAlert } from 'lucide-react'

type AuthMode = 'password' | 'biometric' | 'both'

export function Onboarding() {
  const { createVault, prfSupported } = useAuth()
  const [step, setStep] = useState<'welcome' | 'setup'>('welcome')
  const [authMode, setAuthMode] = useState<AuthMode>('password')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const needsPassword = authMode === 'password' || authMode === 'both'
  const needsBiometric = authMode === 'biometric' || authMode === 'both'

  const canCreate =
    !loading &&
    (needsPassword ? password.length >= 8 && password === confirm : true) &&
    (authMode === 'biometric' ? riskAcknowledged : true)

  const handleCreate = async () => {
    if (needsPassword) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
      if (password !== confirm) {
        setError('Passwords do not match')
        return
      }
    }
    setError('')
    setLoading(true)
    try {
      await createVault({
        password: needsPassword ? password : undefined,
        withBiometric: needsBiometric,
      })
    } catch {
      setError(
        authMode === 'biometric'
          ? 'Biometric registration failed. Please try again.'
          : 'Failed to create vault. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (step === 'welcome') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 text-center">
        <div className="space-y-2">
          <h1 className="font-serif text-4xl">Trellis</h1>
          <p className="text-muted-foreground">Track mindfully. Understand your patterns.</p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground max-w-xs">
          Your data never leaves this device. Everything is encrypted locally.
        </div>
        <Button size="lg" className="w-full max-w-xs" onClick={() => setStep('setup')}>
          Get Started
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="font-serif text-2xl">Create your vault</h2>
          <p className="text-sm text-muted-foreground">Choose how to secure your data</p>
        </div>

        <div className="space-y-4">
          {/* Auth mode selector */}
          <div className="space-y-2">
            <AuthModeButton
              active={authMode === 'password'}
              onClick={() => {
                setAuthMode('password')
                setRiskAcknowledged(false)
              }}
              icon={<KeyRound size={20} />}
              label="Password only"
            />
            {prfSupported !== null && (
              <AuthModeButton
                active={authMode === 'both'}
                onClick={() => {
                  setAuthMode('both')
                  setRiskAcknowledged(false)
                }}
                icon={<Fingerprint size={20} />}
                label="Password + biometric"
                disabled={prfSupported === false}
                disabledReason="Biometric unlock isn't supported in this browser. Try using Chrome."
              />
            )}
            {prfSupported !== null && (
              <AuthModeButton
                active={authMode === 'biometric'}
                onClick={() => setAuthMode('biometric')}
                icon={<Fingerprint size={20} />}
                label="Biometric only"
                disabled={prfSupported === false}
                disabledReason="Biometric unlock isn't supported in this browser. Try using Chrome."
              />
            )}
          </div>

          {/* Password fields */}
          {needsPassword && (
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
                  onKeyDown={(e) => e.key === 'Enter' && canCreate && handleCreate()}
                />
              </div>
            </div>
          )}

          {/* Biometric-only risk warning */}
          {authMode === 'biometric' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                <ShieldAlert size={18} className="mt-0.5 shrink-0" />
                <span>
                  If you reset your device, your data cannot be recovered. There is no password
                  backup.
                </span>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={riskAcknowledged}
                  onChange={(e) => setRiskAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  I understand my data cannot be recovered if I lose access to this device
                </span>
              </label>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" onClick={handleCreate} disabled={!canCreate}>
            {loading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" /> Creating vault…
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

function AuthModeButton({
  active,
  onClick,
  icon,
  label,
  disabled,
  disabledReason,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
  disabledReason?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : active
            ? 'border-primary bg-primary/5 text-primary'
            : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      <div>
        <span>{label}</span>
        {disabled && disabledReason && (
          <p className="text-xs text-muted-foreground mt-0.5">{disabledReason}</p>
        )}
      </div>
    </button>
  )
}
