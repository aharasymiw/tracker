import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { Fingerprint, Loader2 } from 'lucide-react'

export function LockScreen() {
  const { unlock, unlockWithBiometric, authMethod } = useAuth()
  const [password, setPassword] = useState('')
  const [loadingMethod, setLoadingMethod] = useState<'password' | 'biometric' | null>(null)
  const [error, setError] = useState('')

  const showPassword = authMethod === 'password' || authMethod === 'both'
  const showBiometric = authMethod === 'biometric' || authMethod === 'both'

  const handleUnlock = async () => {
    setLoadingMethod('password')
    setError('')
    const ok = await unlock(password)
    setLoadingMethod(null)
    if (!ok) setError('Incorrect password')
  }

  const handleBiometric = async () => {
    setLoadingMethod('biometric')
    setError('')
    const ok = await unlockWithBiometric()
    setLoadingMethod(null)
    if (!ok) {
      setError(
        showPassword
          ? 'Biometric unlock failed. Try your password.'
          : 'Biometric unlock failed. Please try again.'
      )
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-serif text-3xl">Trellis</h1>
          <p className="text-sm text-muted-foreground">
            {showPassword ? 'Enter your password to continue' : 'Use biometric to unlock'}
          </p>
        </div>

        <div className="space-y-4">
          {showPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Your vault password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                autoFocus
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {showPassword && (
            <Button
              className="w-full"
              onClick={handleUnlock}
              disabled={!!loadingMethod || !password}
            >
              {loadingMethod === 'password' ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" /> Unlocking…
                </>
              ) : (
                'Unlock'
              )}
            </Button>
          )}

          {showBiometric && (
            <Button
              variant={showPassword ? 'outline' : 'default'}
              className="w-full"
              onClick={handleBiometric}
              disabled={!!loadingMethod}
            >
              {loadingMethod === 'biometric' ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" /> Unlocking…
                </>
              ) : (
                <>
                  <Fingerprint size={16} className="mr-2" />
                  Use biometric
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
