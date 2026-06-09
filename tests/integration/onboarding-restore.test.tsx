import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import {
  IDBFactory,
  IDBKeyRange,
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBIndex,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from 'fake-indexeddb'
import { AuthProvider } from '@/contexts/AuthContext'
import { DataProvider } from '@/contexts/DataContext'
import { useData } from '@/hooks/useData'
import { Onboarding } from '@/components/auth/Onboarding'
import {
  serializePlainBackup,
  serializeEncryptedBackup,
  serializeEntriesCSV,
  type BackupData,
} from '@/lib/backup'
import type { LogEntry, Goal } from '@/types'
import { clearPendingImport } from '@/lib/pendingImport'

// --- Fixtures ------------------------------------------------------------

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

const backup = (over: Partial<BackupData> = {}): BackupData => ({
  entries: [
    entry({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }),
    entry({ id: 'd3ffcd88-1a2b-4c4d-9e6f-7a8b9c0d1e41', note: 'second' }),
  ],
  goals: [goal()],
  settings: { theme: 'system', autoLockMinutes: 5 },
  ...over,
})

// --- Test environment ----------------------------------------------------

function installIndexedDbGlobals() {
  const newFactory = new IDBFactory()
  // @ts-expect-error writable in runtime
  globalThis.indexedDB = newFactory
  globalThis.IDBKeyRange = IDBKeyRange as unknown as typeof globalThis.IDBKeyRange
  globalThis.IDBCursor = IDBCursor as unknown as typeof globalThis.IDBCursor
  globalThis.IDBCursorWithValue =
    IDBCursorWithValue as unknown as typeof globalThis.IDBCursorWithValue
  globalThis.IDBDatabase = IDBDatabase as unknown as typeof globalThis.IDBDatabase
  globalThis.IDBIndex = IDBIndex as unknown as typeof globalThis.IDBIndex
  globalThis.IDBObjectStore = IDBObjectStore as unknown as typeof globalThis.IDBObjectStore
  globalThis.IDBOpenDBRequest = IDBOpenDBRequest as unknown as typeof globalThis.IDBOpenDBRequest
  globalThis.IDBRequest = IDBRequest as unknown as typeof globalThis.IDBRequest
  globalThis.IDBTransaction = IDBTransaction as unknown as typeof globalThis.IDBTransaction
  globalThis.IDBVersionChangeEvent =
    IDBVersionChangeEvent as unknown as typeof globalThis.IDBVersionChangeEvent
}

// --- Harness -------------------------------------------------------------

function Inspector() {
  const { entries, goals } = useData()
  return (
    <>
      <div data-testid="entry-count">{entries.length}</div>
      <div data-testid="goal-count">{goals.length}</div>
    </>
  )
}

function mount() {
  return render(
    <AuthProvider>
      <DataProvider>
        <Onboarding />
        <Inspector />
      </DataProvider>
    </AuthProvider>
  )
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]')
  if (!input) throw new Error('file input not found')
  return input as HTMLInputElement
}

function chooseRestoreFile(name: string, text: string) {
  // The "Restore from a backup" button only opens the OS picker; selecting the
  // file is what drives the flow, so fire change on the input directly.
  fireEvent.click(screen.getByRole('button', { name: /Restore from a backup/ }))
  const file = new File([text], name, {
    type: name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/json',
  })
  fireEvent.change(getFileInput(), { target: { files: [file] } })
}

async function createVaultFromPasswordStep() {
  const pw = await screen.findByLabelText('Password', { exact: true })
  const confirm = screen.getByLabelText('Confirm password')
  fireEvent.change(pw, { target: { value: 'password-123' } })
  fireEvent.change(confirm, { target: { value: 'password-123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create vault' }))
}

const entryCount = () => Number(screen.getByTestId('entry-count').textContent)

beforeEach(async () => {
  installIndexedDbGlobals()
  localStorage.clear()
  sessionStorage.clear()
  clearPendingImport()
  const { resetDbForTesting } = await import('@/lib/db')
  resetDbForTesting()
})

afterEach(() => {
  cleanup()
  clearPendingImport()
  vi.restoreAllMocks()
})

describe('onboarding restore-from-backup seed', () => {
  it('seeds a brand-new vault from a plaintext backup', async () => {
    mount()
    await screen.findByText('Restore from a backup')

    chooseRestoreFile('backup.json', serializePlainBackup(backup()))

    // The restore notice confirms the seed was staged.
    await screen.findByText(/Restoring/)
    await createVaultFromPasswordStep()

    await waitFor(() => expect(entryCount()).toBe(2), { timeout: 5000 })
    expect(screen.getByTestId('goal-count').textContent).toBe('1')
  })

  it('seeds from a CSV backup (entries only)', async () => {
    mount()
    await screen.findByText('Restore from a backup')

    chooseRestoreFile('entries.csv', serializeEntriesCSV([entry()]))

    await screen.findByText(/Restoring/)
    await createVaultFromPasswordStep()

    await waitFor(() => expect(entryCount()).toBe(1), { timeout: 5000 })
    expect(screen.getByTestId('goal-count').textContent).toBe('0')
  })

  it('unlocks an encrypted backup before seeding', async () => {
    mount()
    await screen.findByText('Restore from a backup')

    chooseRestoreFile('enc.json', await serializeEncryptedBackup(backup(), 'secret'))

    // Restore-password step.
    const pwField = await screen.findByLabelText('Backup password')
    fireEvent.change(pwField, { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock backup' }))

    await screen.findByText(/Restoring/, undefined, { timeout: 5000 })
    await createVaultFromPasswordStep()

    await waitFor(() => expect(entryCount()).toBe(2), { timeout: 5000 })
  })
})
