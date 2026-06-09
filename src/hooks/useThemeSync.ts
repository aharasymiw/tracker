import { useEffect } from 'react'
import { startThemeSync } from '@/lib/theme'

/**
 * Keeps the applied light/dark appearance in sync with the saved theme
 * preference for the entire session, on every page:
 *
 * - preference `light` / `dark` → always that mode, regardless of the OS.
 * - preference `system` → tracks the OS, including a live day/night auto-switch
 *   that happens while the app stays open.
 *
 * Mount this once near the app root so it is never unmounted mid-session (a
 * previous version lived inside the Settings page, so `system` mode only
 * tracked the OS while that page happened to be open). The sync logic lives in
 * `startThemeSync` (`@/lib/theme`); this is just the React binding.
 */
export function useThemeSync(): void {
  useEffect(() => startThemeSync(), [])
}
