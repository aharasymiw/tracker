import type { Theme } from '@/types'

// Synchronous, unencrypted cache of the user's theme *preference*. The durable
// source of truth is the encrypted settings record in IndexedDB, but that can't
// be read until the vault is unlocked — so this cache lets us apply the correct
// theme before React renders and while the vault is still locked.
export const THEME_STORAGE_KEY = 'lesslately-theme'

// Dispatched on `window` whenever the stored preference changes in this tab, so
// the always-mounted theme sync can re-apply without waiting on React state.
export const THEME_CHANGE_EVENT = 'lesslately:theme-change'

const VALID_THEMES: readonly Theme[] = ['light', 'dark', 'system']

/** Read the saved theme preference from the synchronous cache. */
export function getStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    if (value && (VALID_THEMES as string[]).includes(value)) return value as Theme
  } catch {
    // Ignore localStorage errors (e.g. private browsing)
  }
  return 'system'
}

/** Resolve a preference to dark/light and toggle the `.dark` class on <html>. */
export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', isDark)
}

/**
 * Persist the preference to the synchronous cache, apply it immediately, and
 * notify the session so the global theme sync stays in step. The encrypted
 * source of truth is written separately (see DataContext.saveSettings).
 */
export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore localStorage errors (e.g. private browsing)
  }
  applyTheme(theme)
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }))
}

/**
 * Apply the stored theme and keep it in sync for the whole session — with the
 * OS (so `system` tracks a live day/night switch), with other tabs, and with
 * same-tab preference changes. Returns a cleanup that removes every listener.
 *
 * Framework-agnostic so the behavior can be unit-tested without React;
 * `useThemeSync` is a thin wrapper that runs this inside an effect.
 */
export function startThemeSync(): () => void {
  const sync = () => applyTheme(getStoredTheme())

  // Apply on start, then on each relevant signal below.
  sync()

  // OS appearance change — drives `system` mode; a no-op for light/dark.
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', sync)

  // Preference changed in another tab.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) sync()
  }
  window.addEventListener('storage', onStorage)

  // Preference changed in this tab (ThemeToggle / unlock reconcile).
  window.addEventListener(THEME_CHANGE_EVENT, sync)

  return () => {
    mq.removeEventListener('change', sync)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(THEME_CHANGE_EVENT, sync)
  }
}
