import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Download, Trash2 } from 'lucide-react'
import { useData } from '@/contexts/DataContext'
import { format } from 'date-fns'
import { clearAllData } from '@/lib/db'

export function DataExport() {
  const { entries } = useData()
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const exportCSV = () => {
    const header = 'date,time,type,amount,unit,social_context,note'
    const rows = entries.map((e) =>
      [
        format(e.timestamp, 'yyyy-MM-dd'),
        format(e.timestamp, 'HH:mm'),
        e.type,
        e.amount,
        e.unit,
        e.socialContext,
        `"${(e.note ?? '').replace(/"/g, '""')}"`,
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trellis-export-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportJSON = () => {
    const data = JSON.stringify(entries, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trellis-export-${format(new Date(), 'yyyy-MM-dd')}.json`
    a.click()
    URL.revokeObjectURL(url)
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
          onClick={exportCSV}
          className="flex-1"
          disabled={entries.length === 0}
        >
          <Download size={14} className="mr-2" /> Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={exportJSON}
          className="flex-1"
          disabled={entries.length === 0}
        >
          <Download size={14} className="mr-2" /> Export JSON
        </Button>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
        onClick={() => setConfirmClear(true)}
      >
        <Trash2 size={14} className="mr-2" /> Clear all data
      </Button>

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
