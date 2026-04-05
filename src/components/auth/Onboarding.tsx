import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'

type Step = 'welcome' | 'choose' | 'password' | 'passkey'

export function Onboarding() {
  const { createVaultWithPassword, createVaultWithPasskey, passkeySupport } = useAuth()
  const [step, setStep] = useState<Step>('welcome')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = !loading && password.length >= 8 && password === confirm
  const passkeyAvailable = passkeySupport === 'available' || passkeySupport === 'tentative'

  const validateRecoveryPassword = () => {
    if (password.length < 8) {
      setError('Recovery password must be at least 8 characters')
      return false
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const handleCreatePasswordVault = async () => {
    if (!validateRecoveryPassword()) return
    setError('')
    setLoading(true)
    try {
      await createVaultWithPassword(password)
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to create vault. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePasskeyVault = async () => {
    if (!validateRecoveryPassword()) return
    setError('')
    setLoading(true)
    try {
      await createVaultWithPasskey(password)
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to set up fingerprint / Face ID. Please try again.'
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
        <div className="max-w-xs rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Your data never leaves this device. Everything is encrypted locally.
        </div>
        <Button
          size="lg"
          className="w-full max-w-xs"
          onClick={() => setStep(passkeyAvailable ? 'choose' : 'password')}
        >
          Get Started
        </Button>
      </div>
    )
  }

  if (step === 'choose') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <h2 className="font-serif text-2xl">Choose how to unlock Trellis</h2>
            <p className="text-sm text-muted-foreground">
              Use your device biometrics for quick access, or stick with a password-only vault.
            </p>
          </div>

          <div className="space-y-3">
            <Button className="w-full" size="lg" onClick={() => setStep('passkey')}>
              Use fingerprint / Face ID
            </Button>
            <Button className="w-full" variant="outline" onClick={() => setStep('password')}>
              Use password instead
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const isPasskeyStep = step === 'passkey'
  const title = isPasskeyStep ? 'Create your secure vault' : 'Create your vault'
  const description = isPasskeyStep
    ? 'Set a recovery password, then enroll your device biometrics.'
    : 'Choose a password to secure your data.'
  const passwordLabel = isPasskeyStep ? 'Recovery password' : 'Password'
  const passwordPlaceholder = isPasskeyStep ? 'At least 8 characters' : 'At least 8 characters'
  const submitLabel = isPasskeyStep ? 'Set up fingerprint / Face ID' : 'Create vault'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h2 className="font-serif text-2xl">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="space-y-4">
          {isPasskeyStep && (
            <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
              You&apos;ll unlock with your device biometrics, and this recovery password will stay
              available if you ever need to fall back to password unlock.
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="password">{passwordLabel}</Label>
              <Input
                id="password"
                type="password"
                placeholder={passwordPlaceholder}
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
                  if (e.key !== 'Enter' || !canSubmit) return
                  if (isPasskeyStep) {
                    void handleCreatePasskeyVault()
                  } else {
                    void handleCreatePasswordVault()
                  }
                }}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={isPasskeyStep ? handleCreatePasskeyVault : handleCreatePasswordVault}
              disabled={!canSubmit}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  {isPasskeyStep ? 'Setting up…' : 'Creating vault…'}
                </>
              ) : (
                submitLabel
              )}
            </Button>

            {passkeyAvailable && (
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => {
                  setError('')
                  setStep(isPasskeyStep ? 'password' : 'passkey')
                }}
              >
                {isPasskeyStep ? 'Use password only instead' : 'Prefer fingerprint / Face ID?'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
