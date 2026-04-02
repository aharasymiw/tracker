import { Link, useLocation } from 'react-router-dom'
import { Settings, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Log',
  '/journal': 'Journal',
  '/insights': 'Insights',
  '/goals': 'Goals',
  '/settings': 'Settings',
}

export function Header() {
  const location = useLocation()
  const { lock, vaultState } = useAuth()
  const title = PAGE_TITLES[location.pathname] ?? 'Trellis'

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card px-4"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <h1 className="font-serif text-xl font-medium">{title}</h1>
      <div className="flex items-center gap-1">
        {vaultState === 'unlocked' && (
          <Button variant="ghost" size="icon" onClick={lock} aria-label="Lock vault">
            <Lock size={18} />
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label="Settings" render={<Link to="/settings" />}>
          <Settings size={20} />
        </Button>
      </div>
    </header>
  )
}
