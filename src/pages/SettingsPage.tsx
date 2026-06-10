import { ThemeToggle } from '@/components/settings/ThemeToggle'
import { DataExport } from '@/components/settings/DataExport'
import { useData } from '@/hooks/useData'
import { useAuth } from '@/hooks/useAuth'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEffect, useState } from 'react'
import { isStoragePersisted, requestPersistentStorage } from '@/lib/storage'

export default function SettingsPage() {
  const { settings, saveSettings } = useData()
  const { changePassword, stayLoggedIn, setStayLoggedIn } = useAuth()
  const [changingPw, setChangingPw] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null)

  useEffect(() => {
    void (async () => {
      // Re-request on visit — some browsers only grant once the site has
      // engagement; the call is a no-op when already granted.
      const granted = (await requestPersistentStorage()) || (await isStoragePersisted())
      setStoragePersisted(granted)
    })()
  }, [])

  const handleAutoLockChange = async (vals: number | readonly number[]) => {
    const value = Array.isArray(vals) ? vals[0] : typeof vals === 'number' ? vals : vals[0]
    await saveSettings({ autoLockMinutes: value })
  }

  const handleChangePw = async () => {
    if (newPw.length < 8) {
      setPwError('New password must be at least 8 characters')
      return
    }
    setSavingPw(true)
    setPwError('')
    const ok = await changePassword(oldPw, newPw)
    setSavingPw(false)
    if (ok) {
      setPwSuccess(true)
      setChangingPw(false)
      setOldPw('')
      setNewPw('')
      setTimeout(() => setPwSuccess(false), 3000)
    } else {
      setPwError('Current password is incorrect')
    }
  }

  const handleToggleStayLoggedIn = async (checked: boolean) => {
    await setStayLoggedIn(checked)
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Theme */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Appearance
        </p>
        <ThemeToggle />
      </section>

      {/* Auto-lock */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Security
        </p>
        <div className="flex justify-between items-center">
          <Label className="text-sm">Stay logged in</Label>
          <Switch checked={stayLoggedIn} onCheckedChange={handleToggleStayLoggedIn} />
        </div>
        <div className={`space-y-2 ${stayLoggedIn ? 'opacity-40 pointer-events-none' : ''}`}>
          <div className="flex justify-between items-center">
            <Label className="text-sm">Auto-lock after {settings.autoLockMinutes} minutes</Label>
          </div>
          <Slider
            value={[settings.autoLockMinutes]}
            onValueChange={handleAutoLockChange}
            min={1}
            max={60}
            step={1}
          />
        </div>

        {/* Change password */}
        <div className="pt-2 border-t">
          {changingPw ? (
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Current password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
              />
              <Input
                type="password"
                placeholder="New password (min 8 chars)"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              {pwError && <p className="text-xs text-destructive">{pwError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setChangingPw(false)
                    setPwError('')
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleChangePw} disabled={savingPw || !oldPw || !newPw}>
                  {savingPw ? 'Saving…' : 'Change password'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setChangingPw(true)}
            >
              Change password
            </Button>
          )}
          {pwSuccess && <p className="text-xs text-primary mt-2">Password changed successfully</p>}
        </div>
      </section>

      {/* Data */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data</p>
        <DataExport />
        {storagePersisted !== null && (
          <p className="text-xs text-muted-foreground">
            {storagePersisted
              ? 'Persistent storage is on — the browser won’t evict your data under storage pressure.'
              : 'Persistent storage not granted yet — the browser could evict local data if space runs low. Installing the app to your home screen helps. Keep backups either way.'}
          </p>
        )}
      </section>

      {/* About */}
      <section className="rounded-xl border bg-card p-4 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">About</p>
        <p className="text-sm font-serif">Trellis</p>
        <p className="text-xs text-muted-foreground">
          Your data is encrypted with AES-256-GCM and never leaves your device. Trellis has no
          server, no accounts, and no analytics.
        </p>
      </section>
    </div>
  )
}
