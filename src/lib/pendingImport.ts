import type { BackupData } from '@/lib/backup'

// One-shot, in-memory handoff for the onboarding "seed a new vault from a
// backup" flow. Onboarding decodes the file and stashes it here *before*
// creating the vault; DataContext consumes it once, right after the new vault
// unlocks and its (empty) data has loaded. Not persisted — the create→unlock
// transition happens within the same session.

let pending: BackupData | null = null

export function setPendingImport(data: BackupData): void {
  pending = data
}

export function takePendingImport(): BackupData | null {
  const data = pending
  pending = null
  return data
}

export function hasPendingImport(): boolean {
  return pending !== null
}

export function clearPendingImport(): void {
  pending = null
}
