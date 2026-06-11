import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Download, Trash2, AlertTriangle, Lock } from 'lucide-react'
import { useData } from '@/hooks/useData'
import { format } from 'date-fns'
import { clearAllData } from '@/lib/db'
import { serializePlainBackup, serializeEncryptedBackup, serializeEntriesCSV } from '@/lib/backup'
import { getLastBackupAt, recordBackupCompleted } from '@/lib/backupReminder'
import { ImportData } from '@/components/settings/ImportData'

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function DataExport() {
  const { entries, goals, settings } = useData()

  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  // JSON export dialog
  const [jsonOpen, setJsonOpen] = useState(false)
  const [encrypt, setEncrypt] = useState(false)
  const [pw, setPw] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwError, setPwError] = useState('')
  const [exporting, setExporting] = useState(false)

  // CSV export warning dialog
  const [csvOpen, setCsvOpen] = useState(false)

  const [lastBackupAt, setLastBackupAt] = useState<Date | null>(getLastBackupAt)

  const today = () => format(new Date(), 'yyyy-MM-dd')
  const isEmpty = entries.length === 0 && goals.length === 0

  const openJson = () => {
    setEncrypt(false)
    setPw('')
    setPwConfirm('')
    setPwError('')
    setJsonOpen(true)
  }

  const handleExportJson = async () => {
    if (encrypt) {
      if (pw.length < 8) {
        setPwError('Password must be at least 8 characters.')
        return
      }
      if (pw !== pwConfirm) {
        setPwError('Passwords do not match.')
        return
      }
    }
    setExporting(true)
    try {
      const data = { entries, goals, settings }
      const content = encrypt
        ? await serializeEncryptedBackup(data, pw)
        : serializePlainBackup(data)
      download(`lesslately-backup-${today()}.json`, content, 'application/json')
      // Only full JSON backups count for the reminder — CSV omits goals/settings.
      recordBackupCompleted()
      setLastBackupAt(getLastBackupAt())
      setJsonOpen(false)
    } finally {
      setExporting(false)
    }
  }

  const handleExportCsv = () => {
    download(`lesslately-entries-${today()}.csv`, serializeEntriesCSV(entries), 'text/csv')
    setCsvOpen(false)
  }

  const handleClear = async () => {
    setClearing(true)
    try {
      await clearAllData()
      window.location.reload()
    } catch {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={openJson}
          className="flex-1"
          disabled={isEmpty}
        >
          <Download size={14} className="mr-2" /> Export JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCsvOpen(true)}
          className="flex-1"
          disabled={entries.length === 0}
        >
          <Download size={14} className="mr-2" /> Export CSV
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Last full backup:{' '}
        {lastBackupAt ? format(lastBackupAt, 'MMM d, yyyy · HH:mm') : 'never — export one above'}
      </p>

      <ImportData />

      <Button
        variant="outline"
        size="sm"
        className="w-full text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
        onClick={() => setConfirmClear(true)}
      >
        <Trash2 size={14} className="mr-2" /> Clear all data
      </Button>

      {/* JSON export — full, optionally-encrypted backup */}
      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export full backup (JSON)</DialogTitle>
            <DialogDescription>
              Includes your entries, goals, and settings — everything needed to restore or seed a
              new vault.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label htmlFor="encrypt-backup" className="text-sm font-normal">
                Password-protect this backup
                <span className="block text-xs text-muted-foreground">
                  Encrypt with AES-256-GCM.
                </span>
              </Label>
              <Switch id="encrypt-backup" checked={encrypt} onCheckedChange={setEncrypt} />
            </div>

            {encrypt ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="export-pw">Backup password</Label>
                  <Input
                    id="export-pw"
                    type="password"
                    placeholder="At least 8 characters"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="export-pw-confirm">Confirm password</Label>
                  <Input
                    id="export-pw-confirm"
                    type="password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                  />
                </div>
                {pwError && <p className="text-sm text-destructive">{pwError}</p>}
                <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                  <Lock size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  <span>
                    Keep this password safe. If you lose it, the backup{' '}
                    <strong>cannot be recovered</strong> — there is no reset.
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
                <span>
                  This file will <strong>not be encrypted</strong>. Anyone who opens it can read
                  your full history. Store it somewhere private, or turn on password protection
                  above.
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setJsonOpen(false)} disabled={exporting}>
              Cancel
            </Button>
            <Button onClick={handleExportJson} disabled={exporting}>
              {exporting ? 'Exporting…' : encrypt ? 'Encrypt & download' : 'Download'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV export — entries only, never encrypted */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-destructive" /> Export entries (CSV)
            </DialogTitle>
            <DialogDescription>
              CSV is for spreadsheets and is <strong>never encrypted</strong>. This file will
              contain your entries in plain text — anyone who opens it can read them. It includes
              entries only (not goals or settings).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportCsv}>Download CSV</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
            <DialogDescription>
              This will permanently delete your vault, all entries, and all settings. This cannot be
              undone. Make sure to export your data first if you want to keep it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)} disabled={clearing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClear} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Clear everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
