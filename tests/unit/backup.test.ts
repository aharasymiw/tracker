import { describe, it, expect } from 'vite-plus/test'
import {
  serializePlainBackup,
  serializeEncryptedBackup,
  decodeBackupJSON,
  inspectBackupJSON,
  serializeEntriesCSV,
  parseEntriesCSV,
  planMerge,
  resolveConflict,
  BackupPasswordRequiredError,
  BackupPasswordError,
  BackupParseError,
  type BackupData,
} from '@/lib/backup'
import type { LogEntry, Goal } from '@/types'

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  type: 'flower',
  amount: 1.5,
  unit: 'hits',
  socialContext: 'solo',
  timestamp: new Date('2026-06-05T14:30:00.000Z'),
  note: 'after work',
  createdAt: new Date('2026-06-05T14:30:00.000Z'),
  updatedAt: new Date('2026-06-05T14:30:00.000Z'),
  ...over,
})

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'b1ffcd88-1a2b-4c4d-8e6f-7a8b9c0d1e2f',
  type: 'daily',
  maxAmount: 3,
  unit: 'hits',
  reductionMode: false,
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  ...over,
})

const sample = (): BackupData => ({
  entries: [entry()],
  goals: [goal()],
  settings: { theme: 'dark', autoLockMinutes: 10, intention: 'cut back on weeknights' },
})

describe('JSON backup round-trip', () => {
  it('serializes and decodes a full plaintext backup with dates intact', async () => {
    const data = sample()
    const decoded = await decodeBackupJSON(serializePlainBackup(data))

    expect(decoded.entries[0]).toEqual(data.entries[0])
    expect(decoded.entries[0].timestamp).toBeInstanceOf(Date)
    expect(decoded.goals[0]).toEqual(data.goals[0])
    expect(decoded.settings).toEqual(data.settings)
  })

  it('still decodes backups exported under the pre-rename app name', async () => {
    const data = sample()
    const legacy = { ...JSON.parse(serializePlainBackup(data)), app: 'trellis' }
    const file = JSON.stringify(legacy)

    expect(inspectBackupJSON(file).encrypted).toBe(false)
    const decoded = await decodeBackupJSON(file)
    expect(decoded.entries[0]).toEqual(data.entries[0])
    expect(decoded.settings).toEqual(data.settings)
  })

  it('encrypts and decrypts with the correct password', async () => {
    const data = sample()
    const file = await serializeEncryptedBackup(data, 'correct horse')

    expect(file).not.toContain('cut back on weeknights') // payload is ciphertext
    const decoded = await decodeBackupJSON(file, 'correct horse')
    expect(decoded.settings).toEqual(data.settings)
    expect(decoded.entries[0].timestamp).toBeInstanceOf(Date)
  })

  it('requires a password for an encrypted backup', async () => {
    const file = await serializeEncryptedBackup(sample(), 'pw')
    await expect(decodeBackupJSON(file)).rejects.toBeInstanceOf(BackupPasswordRequiredError)
  })

  it('rejects a wrong password', async () => {
    const file = await serializeEncryptedBackup(sample(), 'pw')
    await expect(decodeBackupJSON(file, 'nope')).rejects.toBeInstanceOf(BackupPasswordError)
  })

  it('inspects without a password and flags encryption', () => {
    const plain = inspectBackupJSON(serializePlainBackup(sample()))
    expect(plain).toMatchObject({
      encrypted: false,
      entryCount: 1,
      goalCount: 1,
      hasSettings: true,
    })
  })

  it('still accepts the legacy bare-array entries export', async () => {
    const legacy = JSON.stringify([entry()])
    const decoded = await decodeBackupJSON(legacy)
    expect(decoded.entries).toHaveLength(1)
    expect(decoded.goals).toHaveLength(0)
    expect(decoded.settings.theme).toBe('system') // schema default
  })

  it('throws a BackupParseError on non-JSON', () => {
    expect(() => inspectBackupJSON('not json{')).toThrow(BackupParseError)
  })
})

describe('CSV entries', () => {
  it('round-trips entries, preferring the ISO datetime column', () => {
    const csv = serializeEntriesCSV([
      entry(),
      entry({ id: 'c2ffcd88-1a2b-4c4d-9e6f-7a8b9c0d1e30', note: 'has, comma and "quote"' }),
    ])
    const parsed = parseEntriesCSV(csv)

    expect(parsed).toHaveLength(2)
    expect(parsed[0].id).toBe(entry().id)
    expect(parsed[0].timestamp.toISOString()).toBe('2026-06-05T14:30:00.000Z')
    expect(parsed[1].note).toBe('has, comma and "quote"') // quoting survives round-trip
  })

  it('generates an id when the CSV row has none', () => {
    const csv = [
      'datetime,type,amount,unit,social_context,note',
      '2026-06-05T14:30:00.000Z,vape,2,hits,solo,',
    ].join('\n')
    const parsed = parseEntriesCSV(csv)
    expect(parsed[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('falls back to date + time columns when datetime is absent', () => {
    const csv = [
      'date,time,type,amount,unit,social_context,note',
      '2026-06-05,14:30,flower,1,hits,solo,',
    ].join('\n')
    const parsed = parseEntriesCSV(csv)
    expect(parsed[0].timestamp.getFullYear()).toBe(2026)
  })

  it('throws on an invalid date', () => {
    const csv = [
      'datetime,type,amount,unit,social_context,note',
      'not-a-date,flower,1,hits,solo,',
    ].join('\n')
    expect(() => parseEntriesCSV(csv)).toThrow(BackupParseError)
  })
})

describe('planMerge / resolveConflict', () => {
  it('separates fresh records from id conflicts', () => {
    const existing = entry({ id: 'dup', note: 'old' })
    const plan = planMerge(
      { entries: [existing], goals: [] },
      { entries: [entry({ id: 'dup', note: 'new' }), entry({ id: 'unique' })], goals: [] }
    )
    expect(plan.freshEntries.map((e) => e.id)).toEqual(['unique'])
    expect(plan.conflictEntries).toHaveLength(1)
    expect(plan.conflictEntries[0].existing.note).toBe('old')
    expect(plan.conflictEntries[0].incoming.note).toBe('new')
  })

  it('resolves skip/overwrite/copy correctly', () => {
    const conflict = {
      id: 'dup',
      incoming: entry({ id: 'dup', note: 'new' }),
      existing: entry({ id: 'dup', note: 'old' }),
    }
    expect(resolveConflict(conflict, 'skip')).toBeNull()
    expect(resolveConflict(conflict, 'overwrite')).toMatchObject({ id: 'dup', note: 'new' })
    const copy = resolveConflict(conflict, 'copy')!
    expect(copy.note).toBe('new')
    expect(copy.id).not.toBe('dup')
    expect(copy.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
