import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, X } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { getLastBackupAt, shouldShowBackupNudge, snoozeBackupNudge } from '@/lib/backupReminder'

export function BackupNudge() {
  const { entries } = useData()
  const [visible, setVisible] = useState(() => shouldShowBackupNudge(entries.length > 0))

  // Re-evaluate when entries arrive after unlock (initial render sees []).
  const shouldShow = shouldShowBackupNudge(entries.length > 0)
  if (!visible || !shouldShow) return null

  const last = getLastBackupAt()

  return (
    <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
      <Download size={16} className="mt-0.5 shrink-0 text-accent" />
      <div className="flex-1">
        <p>
          {last
            ? 'It’s been a while since your last backup.'
            : 'You haven’t exported a backup yet.'}{' '}
          Your data lives only on this device.
        </p>
        <Link to="/settings" className="font-medium text-accent underline underline-offset-2">
          Export a backup
        </Link>
      </div>
      <button
        type="button"
        aria-label="Dismiss backup reminder"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          snoozeBackupNudge()
          setVisible(false)
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
