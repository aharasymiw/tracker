import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'
import { LogEntrySchema, GoalSchema, AppSettingsSchema } from '@/lib/schemas'
import type { LogEntry, Goal, AppSettings } from '@/types'
import { generateSalt, deriveBackupKey, encrypt, decrypt } from '@/lib/crypto'

// Local-first backups. JSON is the full, optionally-encrypted backup (entries +
// goals + settings). CSV is an entries-only, spreadsheet-friendly export that is
// never encrypted. Security-sensitive records (vault meta and key slots) are
// intentionally never included — a backup restored into a vault is re-encrypted
// under that vault's own key.

export const BACKUP_VERSION = 1
const BACKUP_APP = 'trellis'
const PBKDF2_ITERATIONS = 600_000

export interface BackupData {
  entries: LogEntry[]
  goals: Goal[]
  settings: AppSettings
}

// --- Errors the UI distinguishes between ---------------------------------

export class BackupParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupParseError'
  }
}

/** Thrown when an encrypted backup is decoded without a password. */
export class BackupPasswordRequiredError extends Error {
  constructor() {
    super('This backup is password-protected.')
    this.name = 'BackupPasswordRequiredError'
  }
}

/** Thrown when the supplied password fails to decrypt the backup. */
export class BackupPasswordError extends Error {
  constructor() {
    super('Incorrect password, or the backup file is corrupted.')
    this.name = 'BackupPasswordError'
  }
}

// --- Envelope schemas ----------------------------------------------------

const BackupPayloadSchema = z.object({
  entries: z.array(LogEntrySchema),
  goals: z.array(GoalSchema),
  settings: AppSettingsSchema,
})

const PlainBackupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number(),
  exportedAt: z.string(),
  encrypted: z.literal(false).optional(),
  entries: z.array(LogEntrySchema),
  goals: z.array(GoalSchema),
  settings: AppSettingsSchema,
})

const EncryptedBackupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number(),
  exportedAt: z.string(),
  encrypted: z.literal(true),
  kdf: z.object({
    name: z.literal('PBKDF2'),
    salt: z.string(),
    iterations: z.number(),
    hash: z.literal('SHA-256'),
  }),
  iv: z.string(),
  ciphertext: z.string(),
})

// Old export format: a bare JSON array of entries (no goals/settings).
const LegacyEntriesSchema = z.array(LogEntrySchema)

// --- JSON export ---------------------------------------------------------

function payloadJSON(data: BackupData): string {
  // Date fields serialize to ISO strings; LogEntrySchema/GoalSchema coerce them
  // back to Date on import.
  return JSON.stringify({ entries: data.entries, goals: data.goals, settings: data.settings })
}

export function serializePlainBackup(
  data: BackupData,
  exportedAt: string = new Date().toISOString()
): string {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt,
      encrypted: false,
      entries: data.entries,
      goals: data.goals,
      settings: data.settings,
    },
    null,
    2
  )
}

export async function serializeEncryptedBackup(
  data: BackupData,
  password: string,
  exportedAt: string = new Date().toISOString()
): Promise<string> {
  const salt = await generateSalt()
  const key = await deriveBackupKey(password, salt, PBKDF2_ITERATIONS)
  const { iv, ciphertext } = await encrypt(payloadJSON(data), key)
  return JSON.stringify(
    {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt,
      encrypted: true,
      kdf: { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      iv,
      ciphertext,
    },
    null,
    2
  )
}

// --- JSON import ---------------------------------------------------------

export interface BackupInspection {
  encrypted: boolean
  exportedAt?: string
  entryCount?: number
  goalCount?: number
  hasSettings: boolean
}

/** Cheap, password-free look at a JSON backup so the UI can prompt correctly. */
export function inspectBackupJSON(text: string): BackupInspection {
  const parsed = parseJSON(text)
  if (Array.isArray(parsed)) {
    const legacy = LegacyEntriesSchema.safeParse(parsed)
    if (legacy.success)
      return { encrypted: false, entryCount: legacy.data.length, hasSettings: false }
    throw new BackupParseError('Unrecognized backup format.')
  }
  const enc = EncryptedBackupSchema.safeParse(parsed)
  if (enc.success) return { encrypted: true, exportedAt: enc.data.exportedAt, hasSettings: true }
  const plain = PlainBackupSchema.safeParse(parsed)
  if (plain.success) {
    return {
      encrypted: false,
      exportedAt: plain.data.exportedAt,
      entryCount: plain.data.entries.length,
      goalCount: plain.data.goals.length,
      hasSettings: true,
    }
  }
  throw new BackupParseError('Unrecognized backup format.')
}

export async function decodeBackupJSON(text: string, password?: string): Promise<BackupData> {
  const parsed = parseJSON(text)

  if (Array.isArray(parsed)) {
    const entries = LegacyEntriesSchema.parse(parsed)
    return { entries, goals: [], settings: AppSettingsSchema.parse({}) }
  }

  const enc = EncryptedBackupSchema.safeParse(parsed)
  if (enc.success) {
    if (!password) throw new BackupPasswordRequiredError()
    const key = await deriveBackupKey(password, enc.data.kdf.salt, enc.data.kdf.iterations)
    let json: string
    try {
      json = await decrypt(enc.data.ciphertext, enc.data.iv, key)
    } catch {
      throw new BackupPasswordError()
    }
    return BackupPayloadSchema.parse(parseJSON(json))
  }

  const plain = PlainBackupSchema.safeParse(parsed)
  if (plain.success) {
    return { entries: plain.data.entries, goals: plain.data.goals, settings: plain.data.settings }
  }

  throw new BackupParseError('Unrecognized backup format.')
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new BackupParseError('This file is not valid JSON.')
  }
}

// --- CSV (entries only, never encrypted) ---------------------------------

const CSV_HEADERS = [
  'id',
  'datetime',
  'date',
  'time',
  'type',
  'amount',
  'unit',
  'social_context',
  'note',
] as const

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function serializeEntriesCSV(entries: LogEntry[]): string {
  const rows = entries.map((e) =>
    [
      e.id,
      e.timestamp.toISOString(),
      format(e.timestamp, 'yyyy-MM-dd'),
      format(e.timestamp, 'HH:mm'),
      e.type,
      String(e.amount),
      e.unit,
      e.socialContext,
      e.note ?? '',
    ]
      .map((v) => csvEscape(v))
      .join(',')
  )
  return [CSV_HEADERS.join(','), ...rows].join('\r\n')
}

/** Minimal RFC-4180 parser: handles quoted fields, escaped quotes, CRLF/LF. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
    } else if (c === ',') {
      endField()
      i++
    } else if (c === '\n') {
      endRow()
      i++
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
      i++
    } else {
      field += c
      i++
    }
  }
  if (field.length > 0 || row.length > 0) endRow()

  // Drop fully-empty rows (e.g. a trailing newline).
  return rows.filter((r) => r.some((cell) => cell !== ''))
}

export function parseEntriesCSV(text: string): LogEntry[] {
  const rows = parseCSV(text)
  if (rows.length === 0) throw new BackupParseError('The CSV file is empty.')

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const idIdx = col('id')
  const datetimeIdx = col('datetime')
  const dateIdx = col('date')
  const timeIdx = col('time')
  const typeIdx = col('type')
  const amountIdx = col('amount')
  const unitIdx = col('unit')
  const socialIdx = col('social_context')
  const noteIdx = col('note')

  if (typeIdx === -1 || amountIdx === -1 || unitIdx === -1) {
    throw new BackupParseError('CSV is missing required columns (type, amount, unit).')
  }

  const at = (row: string[], idx: number) => (idx === -1 ? '' : (row[idx] ?? '').trim())

  return rows.slice(1).map((row, n) => {
    const datetime = at(row, datetimeIdx)
    const date = at(row, dateIdx)
    const time = at(row, timeIdx)
    const isoCandidate = datetime || (date && time ? `${date}T${time}` : date)
    const timestamp = new Date(isoCandidate)
    if (!isoCandidate || Number.isNaN(timestamp.getTime())) {
      throw new BackupParseError(`CSV row ${n + 2}: missing or invalid date/time.`)
    }

    const id = at(row, idIdx) || uuidv4()
    const note = at(row, noteIdx)
    try {
      return LogEntrySchema.parse({
        id,
        type: at(row, typeIdx),
        amount: Number(at(row, amountIdx)),
        unit: at(row, unitIdx),
        socialContext: at(row, socialIdx) || 'solo',
        timestamp,
        note: note || undefined,
        // CSV carries no audit timestamps; anchor them to the consumption time.
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    } catch {
      throw new BackupParseError(`CSV row ${n + 2}: invalid entry data.`)
    }
  })
}

// --- Conflict planning (pure) --------------------------------------------

export type ConflictChoice = 'skip' | 'overwrite' | 'copy'

export interface ImportConflict<T> {
  id: string
  incoming: T
  existing: T
}

export interface ImportPlan {
  freshEntries: LogEntry[]
  conflictEntries: ImportConflict<LogEntry>[]
  freshGoals: Goal[]
  conflictGoals: ImportConflict<Goal>[]
}

/** Split incoming records into brand-new vs id-conflicting against current data. */
export function planMerge(
  current: { entries: LogEntry[]; goals: Goal[] },
  incoming: { entries: LogEntry[]; goals: Goal[] }
): ImportPlan {
  const entryById = new Map(current.entries.map((e) => [e.id, e]))
  const goalById = new Map(current.goals.map((g) => [g.id, g]))

  const freshEntries: LogEntry[] = []
  const conflictEntries: ImportConflict<LogEntry>[] = []
  for (const incomingEntry of incoming.entries) {
    const existing = entryById.get(incomingEntry.id)
    if (existing) conflictEntries.push({ id: incomingEntry.id, incoming: incomingEntry, existing })
    else freshEntries.push(incomingEntry)
  }

  const freshGoals: Goal[] = []
  const conflictGoals: ImportConflict<Goal>[] = []
  for (const incomingGoal of incoming.goals) {
    const existing = goalById.get(incomingGoal.id)
    if (existing) conflictGoals.push({ id: incomingGoal.id, incoming: incomingGoal, existing })
    else freshGoals.push(incomingGoal)
  }

  return { freshEntries, conflictEntries, freshGoals, conflictGoals }
}

/**
 * Apply a per-conflict choice, returning the record to write (with a fresh id
 * for `copy`) or `null` to skip. Reused for both entries and goals.
 */
export function resolveConflict<T extends { id: string }>(
  conflict: ImportConflict<T>,
  choice: ConflictChoice
): T | null {
  if (choice === 'skip') return null
  if (choice === 'overwrite') return conflict.incoming
  return { ...conflict.incoming, id: uuidv4() } // copy
}
