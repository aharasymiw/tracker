import { beforeEach, describe, expect, it } from 'vite-plus/test'
import {
  LAST_BACKUP_KEY,
  NUDGE_SNOOZE_KEY,
  getLastBackupAt,
  recordBackupCompleted,
  shouldShowBackupNudge,
  snoozeBackupNudge,
} from '@/lib/backupReminder'

const NOW = new Date('2026-06-10T12:00:00.000Z')

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

beforeEach(() => {
  localStorage.clear()
})

describe('recordBackupCompleted / getLastBackupAt', () => {
  it('round-trips the timestamp', () => {
    recordBackupCompleted(NOW)
    expect(getLastBackupAt()?.toISOString()).toBe(NOW.toISOString())
  })

  it('returns null when nothing recorded or the value is garbage', () => {
    expect(getLastBackupAt()).toBeNull()
    localStorage.setItem(LAST_BACKUP_KEY, 'not-a-date')
    expect(getLastBackupAt()).toBeNull()
  })
})

describe('shouldShowBackupNudge', () => {
  it('never nudges with no entries', () => {
    expect(shouldShowBackupNudge(false, NOW)).toBe(false)
  })

  it('nudges when entries exist but no backup was ever made', () => {
    expect(shouldShowBackupNudge(true, NOW)).toBe(true)
  })

  it('does not nudge when the last backup is recent', () => {
    recordBackupCompleted(daysAgo(3))
    expect(shouldShowBackupNudge(true, NOW)).toBe(false)
  })

  it('nudges when the last backup is older than the threshold', () => {
    recordBackupCompleted(daysAgo(15))
    expect(shouldShowBackupNudge(true, NOW)).toBe(true)
  })

  it('respects an active snooze and expires it', () => {
    recordBackupCompleted(daysAgo(30))
    snoozeBackupNudge(NOW)
    expect(shouldShowBackupNudge(true, NOW)).toBe(false)
    // Snooze lasts 7 days; day 8 nudges again.
    const later = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000)
    expect(shouldShowBackupNudge(true, later)).toBe(true)
  })

  it('ignores a corrupt snooze value', () => {
    recordBackupCompleted(daysAgo(30))
    localStorage.setItem(NUDGE_SNOOZE_KEY, 'garbage')
    expect(shouldShowBackupNudge(true, NOW)).toBe(true)
  })
})
