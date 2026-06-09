import { Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData } from '@/hooks/useData'
import { setStoredTheme } from '@/lib/theme'
import type { Theme } from '@/types'

const OPTIONS: { value: Theme; icon: React.ComponentType<{ size?: number }>; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'dark', icon: Moon, label: 'Dark' },
]

export function ThemeToggle() {
  const { settings, saveSettings } = useData()

  const handleChange = async (theme: Theme) => {
    // Update the synchronous cache + apply immediately (useThemeSync, mounted at
    // the app root, handles live OS tracking for 'system')...
    setStoredTheme(theme)
    // ...then persist the encrypted source of truth.
    await saveSettings({ theme })
  }

  return (
    <div className="flex overflow-hidden rounded-xl border bg-muted p-1 gap-1">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => handleChange(value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all',
            settings.theme === value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Icon size={14} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
