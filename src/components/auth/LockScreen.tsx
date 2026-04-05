import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'

export function LockScreen() {
  const {
    unlockWithPassword,
    unlockWithPasskey,
    hasPasskey,
    passkeySupport,
    preferredUnlockMethod,
  } = useAuth()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(preferredUnlockMethod === 'password')
  const [loadingPassword, setLoadingPassword] = useState(false)
  const [loadingPasskey, setLoadingPasskey] = useState(false)
  const [error, setError] = useState('')

  const canUsePasskey = hasPasskey && passkeySupport === 'available'
  const helperText = useMemo(() => {
    if (canUsePasskey) return 'Unlock with your device, or use your recovery password instead.'
    return 'Enter your password to continue'
  }, [canUsePasskey])

  const handleUnlockPassword = async () => {
    setLoadingPassword(true)
    setError('')
    const ok = await unlockWithPassword(password)
    setLoadingPassword(false)
    if (!ok) setError('Incorrect password')
  }

  const handleUnlockPasskey = async () => {
    setLoadingPasskey(true)
    setError('')
    const ok = await unlockWithPasskey()
    setLoadingPasskey(false)
    if (!ok) setError('Fingerprint / Face ID was not accepted')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-serif text-3xl">Trellis</h1>
          <p className="text-sm text-muted-foreground">{helperText}</p>
        </div>

        <div className="space-y-4">
          {canUsePasskey && !showPassword && (
            <Button className="w-full" onClick={handleUnlockPasskey} disabled={loadingPasskey}>
              {loadingPasskey ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" /> Unlocking…
                </>
              ) : (
                'Unlock with fingerprint / Face ID'
              )}
            </Button>
          )}

          {(!canUsePasskey || showPassword) && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your recovery password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleUnlockPassword()}
                  autoFocus
                />
              </div>

              <Button
                className="w-full"
                onClick={handleUnlockPassword}
                disabled={loadingPassword || !password}
              >
                {loadingPassword ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" /> Unlocking…
                  </>
                ) : (
                  'Unlock with password'
                )}
              </Button>
            </>
          )}

          {canUsePasskey && (
            <Button
              className="w-full"
              variant="ghost"
              onClick={() => {
                setError('')
                setShowPassword((value) => !value)
              }}
            >
              {showPassword ? 'Use fingerprint / Face ID instead' : 'Use password instead'}
            </Button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}
