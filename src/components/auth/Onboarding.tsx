import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'

export function Onboarding() {
  const { createVault } = useAuth()
  const [step, setStep] = useState<'welcome' | 'setup'>('welcome')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canCreate = !loading && password.length >= 8 && password === confirm

  const handleCreate = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setError('')
    setLoading(true)
    try {
      await createVault(password)
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
          <p className="text-sm text-muted-foreground">Choose a password to secure your data</p>
        </div>

        <div className="space-y-4">
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
