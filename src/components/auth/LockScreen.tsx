import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { Fingerprint, Loader2 } from 'lucide-react'

export function LockScreen() {
  const { unlock, unlockWithBiometric, authMethod } = useAuth()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleUnlock = async () => {
    setLoading(true)
    setError('')
    const ok = await unlock(password)
    setLoading(false)
    if (!ok) setError('Incorrect password')
  }

  const handleBiometric = async () => {
    setLoading(true)
    setError('')
    const ok = await unlockWithBiometric()
    setLoading(false)
    if (!ok) setError('Biometric unlock failed. Try your password.')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-serif text-3xl">Trellis</h1>
          <p className="text-sm text-muted-foreground">Enter your password to continue</p>
        </div>

        <div className="space-y-4">
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" onClick={handleUnlock} disabled={loading || !password}>
            {loading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" /> Unlocking…
              </>
            ) : (
              'Unlock'
            )}
          </Button>

          {(authMethod === 'biometric' || authMethod === 'both') && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleBiometric}
              disabled={loading}
            >
              <Fingerprint size={16} className="mr-2" />
              Use biometric
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
