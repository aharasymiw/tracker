import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test'
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  startThemeSync,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
} from '@/lib/theme'

// Controllable `prefers-color-scheme: dark` mock — jsdom doesn't implement
// matchMedia. `setOsDark()` flips the OS preference and fires `change`,
// simulating an automatic day/night switch while the app stays open.
function installMatchMedia() {
  let osDark = false
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql = {
    get matches() {
      return osDark
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
  }
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia
  return {
    setOsDark(value: boolean) {
      osDark = value
      const event = { matches: value } as MediaQueryListEvent
      for (const cb of listeners) cb(event)
    },
  }
}

const isDark = () => document.documentElement.classList.contains('dark')

describe('theme lib', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getStoredTheme defaults to system and validates the cached value', () => {
    expect(getStoredTheme()).toBe('system')
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    expect(getStoredTheme()).toBe('dark')
    localStorage.setItem(THEME_STORAGE_KEY, 'bogus')
    expect(getStoredTheme()).toBe('system')
  })

  it('applyTheme toggles the .dark class, resolving system from the OS', () => {
    const os = installMatchMedia()

    applyTheme('dark')
    expect(isDark()).toBe(true)

    applyTheme('light')
    expect(isDark()).toBe(false)

    os.setOsDark(true)
    applyTheme('system')
    expect(isDark()).toBe(true)

    os.setOsDark(false)
    applyTheme('system')
    expect(isDark()).toBe(false)
  })

  it('setStoredTheme persists the cache, applies it, and notifies the session', () => {
    installMatchMedia()
    const onChange = vi.fn()
    window.addEventListener(THEME_CHANGE_EVENT, onChange)

    setStoredTheme('dark')

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(isDark()).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)

    window.removeEventListener(THEME_CHANGE_EVENT, onChange)
  })
})

describe('startThemeSync (what useThemeSync runs for the whole session)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('system mode tracks a live OS day/night switch', () => {
    const os = installMatchMedia()
    localStorage.setItem(THEME_STORAGE_KEY, 'system')

    const stop = startThemeSync()
    expect(isDark()).toBe(false) // daytime: OS is light

    os.setOsDark(true) // sunset: OS auto-switches to dark
    expect(isDark()).toBe(true) // app follows without a reload

    os.setOsDark(false) // sunrise
    expect(isDark()).toBe(false)

    stop()
  })

  it('explicit dark/light ignores OS changes', () => {
    const os = installMatchMedia()
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    const stop = startThemeSync()
    expect(isDark()).toBe(true)

    os.setOsDark(false) // OS goes light — explicit dark must stay dark
    expect(isDark()).toBe(true)

    stop()
  })

  it('reacts to a preference change dispatched in this tab', () => {
    installMatchMedia()
    localStorage.setItem(THEME_STORAGE_KEY, 'light')

    const stop = startThemeSync()
    expect(isDark()).toBe(false)

    setStoredTheme('dark') // e.g. user taps the dark icon in ThemeToggle
    expect(isDark()).toBe(true)

    stop()
  })

  it('reacts to a preference change from another tab (storage event)', () => {
    installMatchMedia()
    localStorage.setItem(THEME_STORAGE_KEY, 'light')

    const stop = startThemeSync()
    expect(isDark()).toBe(false)

    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }))
    expect(isDark()).toBe(true)

    stop()
  })

  it('stops tracking the OS after cleanup', () => {
    const os = installMatchMedia()
    localStorage.setItem(THEME_STORAGE_KEY, 'system')

    const stop = startThemeSync()
    stop()

    os.setOsDark(true) // listeners torn down — no change
    expect(isDark()).toBe(false)
  })
})
