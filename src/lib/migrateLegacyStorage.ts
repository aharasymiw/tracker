import { THEME_STORAGE_KEY } from '@/lib/theme'
import { LAST_BACKUP_KEY, NUDGE_SNOOZE_KEY } from '@/lib/backupReminder'
import { STAY_LOGGED_IN_STORAGE_KEY } from '@/contexts/AuthContext'

// localStorage keys before the Trellis → Less Lately rename, paired with where
// each value lives now. The legacy names are frozen history — never change them.
const RENAMED_KEYS: ReadonlyArray<[legacyKey: string, currentKey: string]> = [
  ['trellis-theme', THEME_STORAGE_KEY],
  ['trellis-stay-logged-in', STAY_LOGGED_IN_STORAGE_KEY],
  ['trellis-last-backup-at', LAST_BACKUP_KEY],
  ['trellis-backup-nudge-snoozed-until', NUDGE_SNOOZE_KEY],
]

/**
 * Move pre-rename localStorage values to their new keys. Must run before
 * anything reads localStorage (in particular the pre-render theme apply).
 * A value already present under the new key wins; the legacy key is removed
 * either way.
 */
export function migrateLegacyLocalStorage(): void {
  try {
    for (const [legacyKey, currentKey] of RENAMED_KEYS) {
      const value = localStorage.getItem(legacyKey)
      if (value !== null) {
        if (localStorage.getItem(currentKey) === null) {
          localStorage.setItem(currentKey, value)
        }
        localStorage.removeItem(legacyKey)
      }
    }
  } catch {
    // Ignore localStorage errors (e.g. private browsing)
  }
}
