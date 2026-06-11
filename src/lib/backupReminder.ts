// Backup freshness tracking. Stores only timestamps in localStorage — no user
// data. A device-local app means device loss or storage eviction is total data
// loss, so the app nudges when a full backup hasn't happened in a while.

export const LAST_BACKUP_KEY = 'lesslately-last-backup-at'
export const NUDGE_SNOOZE_KEY = 'lesslately-backup-nudge-snoozed-until'

export const NUDGE_AFTER_DAYS = 14
export const SNOOZE_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

function readDate(key: string): Date | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

function writeDate(key: string, date: Date): void {
  try {
    localStorage.setItem(key, date.toISOString())
  } catch {
    // Ignore localStorage errors (e.g. private browsing)
  }
}

/** Record that a full (JSON) backup was just exported. */
export function recordBackupCompleted(now: Date = new Date()): void {
  writeDate(LAST_BACKUP_KEY, now)
}

export function getLastBackupAt(): Date | null {
  return readDate(LAST_BACKUP_KEY)
}

/** Hide the nudge for SNOOZE_DAYS. */
export function snoozeBackupNudge(now: Date = new Date()): void {
  writeDate(NUDGE_SNOOZE_KEY, new Date(now.getTime() + SNOOZE_DAYS * DAY_MS))
}

/**
 * Show the nudge when there is data worth backing up and no full backup was
 * made in the last NUDGE_AFTER_DAYS (or ever), unless snoozed.
 */
export function shouldShowBackupNudge(hasEntries: boolean, now: Date = new Date()): boolean {
  if (!hasEntries) return false

  const snoozedUntil = readDate(NUDGE_SNOOZE_KEY)
  if (snoozedUntil && now < snoozedUntil) return false

  const lastBackup = readDate(LAST_BACKUP_KEY)
  if (!lastBackup) return true
  return now.getTime() - lastBackup.getTime() > NUDGE_AFTER_DAYS * DAY_MS
}
