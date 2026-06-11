import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'

export function LockScreen() {
  const { unlockWithPassword } = useAuth()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleUnlock = async () => {
    setLoading(true)
    setError('')
    const ok = await unlockWithPassword(password)
    setLoading(false)
    if (!ok) setError('Incorrect password')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-serif text-3xl">Less Lately</h1>
          <p className="text-sm text-muted-foreground">Enter your password to continue</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleUnlock()}
              autoFocus
            />
          </div>

          <Button className="w-full" onClick={handleUnlock} disabled={loading || !password}>
            {loading ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" /> Unlocking…
              </>
            ) : (
              'Unlock with password'
            )}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}
