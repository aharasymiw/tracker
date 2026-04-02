import { NavLink } from 'react-router-dom'
import { PenLine, BookOpen, BarChart2, Target } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/', icon: PenLine, label: 'Log' },
  { to: '/journal', icon: BookOpen, label: 'Journal' },
  { to: '/insights', icon: BarChart2, label: 'Insights' },
  { to: '/goals', icon: Target, label: 'Goals' },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-14">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors min-h-[44px]',
                isActive
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
