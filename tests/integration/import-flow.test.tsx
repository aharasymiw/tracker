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
import { useAuth } from '@/hooks/useAuth'
import { useData } from '@/hooks/useData'
import { ImportData } from '@/components/settings/ImportData'
import {
  serializePlainBackup,
  serializeEncryptedBackup,
  serializeEntriesCSV,
  type BackupData,
} from '@/lib/backup'
import type { LogEntry, Goal } from '@/types'

// --- Fixtures ------------------------------------------------------------

const ENTRY_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const ALT_ENTRY_ID = 'c2ffcd88-1a2b-4c4d-9e6f-7a8b9c0d1e30'

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: ENTRY_ID,
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
  entries: [entry()],
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

// Base UI's Dialog/Switch touch browser APIs jsdom omits; stub the ones it needs.
function installDomStubs() {
  if (!globalThis.matchMedia) {
    // @ts-expect-error test stub
    globalThis.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })
  }
  if (!globalThis.ResizeObserver) {
    // @ts-expect-error test stub
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}

// --- Harness -------------------------------------------------------------

function Inspector() {
  const { entries, goals, settings } = useData()
  return (
    <>
      <div data-testid="entry-count">{entries.length}</div>
      <div data-testid="goal-count">{goals.length}</div>
      <div data-testid="entry-state">{entries.map((e) => `${e.id}=${e.note ?? ''}`).join('|')}</div>
      <div data-testid="theme">{settings.theme}</div>
    </>
  )
}

function VaultHarness() {
  const { vaultState, createVaultWithPassword } = useAuth()
  return (
    <div>
      <div data-testid="vault-state">{vaultState}</div>
      <button type="button" onClick={() => void createVaultWithPassword('password-123')}>
        create vault
      </button>
      <ImportData />
      <Inspector />
    </div>
  )
}

function mount() {
  return render(
    <AuthProvider>
      <DataProvider>
        <VaultHarness />
      </DataProvider>
    </AuthProvider>
  )
}

async function createVault() {
  fireEvent.click(screen.getByText('create vault'))
  await waitFor(() => expect(screen.getByTestId('vault-state').textContent).toBe('unlocked'))
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]')
  if (!input) throw new Error('file input not found')
  return input as HTMLInputElement
}

function chooseFile(name: string, text: string) {
  const file = new File([text], name, {
    type: name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/json',
  })
  fireEvent.change(getFileInput(), { target: { files: [file] } })
}

const entryCount = () => Number(screen.getByTestId('entry-count').textContent)
const goalCount = () => Number(screen.getByTestId('goal-count').textContent)
const entryState = () => screen.getByTestId('entry-state').textContent ?? ''

/** Wait for the configure dialog and click its primary action. The "Import
 *  backup" title is ambiguous with the always-present trigger button, so we key
 *  off the stage-specific footer button instead. */
async function clickConfigure(buttonName = 'Continue', timeout?: number) {
  fireEvent.click(
    await screen.findByRole('button', { name: buttonName }, timeout ? { timeout } : undefined)
  )
}

/** Drive configure → done for a merge with no conflicts (or replace). */
async function finishViaConfigure(buttonName = 'Continue') {
  await clickConfigure(buttonName)
  await screen.findByText('Import complete')
}

async function clickDone() {
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByText('Import complete')).toBeNull())
}

beforeEach(async () => {
  installIndexedDbGlobals()
  installDomStubs()
  localStorage.clear()
  sessionStorage.clear()
  const { resetDbForTesting } = await import('@/lib/db')
  resetDbForTesting()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('import flow (UI)', () => {
  it('merges a plaintext backup into an empty vault', async () => {
    mount()
    await createVault()

    chooseFile('backup.json', serializePlainBackup(backup()))
    await finishViaConfigure('Continue')

    await waitFor(() => expect(entryCount()).toBe(1))
    expect(goalCount()).toBe(1)
  })

  it('overwrites the existing record when an id conflicts', async () => {
    mount()
    await createVault()

    // Seed e1 = "old".
    chooseFile(
      'a.json',
      serializePlainBackup(backup({ entries: [entry({ note: 'old' })], goals: [] }))
    )
    await finishViaConfigure('Continue')
    await waitFor(() => expect(entryCount()).toBe(1))
    await clickDone()

    // Re-import e1 = "new" → conflict.
    chooseFile(
      'b.json',
      serializePlainBackup(backup({ entries: [entry({ note: 'new' })], goals: [] }))
    )
    await clickConfigure('Continue')
    await screen.findByText(/Conflict 1 of 1/)
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite with incoming' }))

    await screen.findByText('Import complete')
    await waitFor(() => expect(entryCount()).toBe(1))
    expect(entryState()).toBe(`${ENTRY_ID}=new`)
  })

  it('imports a conflicting record as a new copy, keeping both', async () => {
    mount()
    await createVault()

    chooseFile(
      'a.json',
      serializePlainBackup(backup({ entries: [entry({ note: 'old' })], goals: [] }))
    )
    await finishViaConfigure('Continue')
    await waitFor(() => expect(entryCount()).toBe(1))
    await clickDone()

    chooseFile(
      'b.json',
      serializePlainBackup(backup({ entries: [entry({ note: 'new' })], goals: [] }))
    )
    await clickConfigure('Continue')
    await screen.findByText(/Conflict 1 of 1/)
    fireEvent.click(screen.getByRole('button', { name: 'Import as a new copy' }))

    await screen.findByText('Import complete')
    await waitFor(() => expect(entryCount()).toBe(2))
    expect(entryState()).toContain('=old')
    expect(entryState()).toContain('=new')
  })

  it('skips a conflicting record, keeping the current one', async () => {
    mount()
    await createVault()

    chooseFile(
      'a.json',
      serializePlainBackup(backup({ entries: [entry({ note: 'old' })], goals: [] }))
    )
    await finishViaConfigure('Continue')
    await waitFor(() => expect(entryCount()).toBe(1))
    await clickDone()

    chooseFile(
      'b.json',
      serializePlainBackup(backup({ entries: [entry({ note: 'new' })], goals: [] }))
    )
    await clickConfigure('Continue')
    await screen.findByText(/Conflict 1 of 1/)
    fireEvent.click(screen.getByRole('button', { name: 'Skip — keep current' }))

    await screen.findByText('Import complete')
    await waitFor(() => expect(entryCount()).toBe(1))
    expect(entryState()).toBe(`${ENTRY_ID}=old`)
  })

  it('replace mode wipes existing data before importing', async () => {
    mount()
    await createVault()

    chooseFile(
      'a.json',
      serializePlainBackup(backup({ entries: [entry({ note: 'old' })], goals: [] }))
    )
    await finishViaConfigure('Continue')
    await waitFor(() => expect(entryCount()).toBe(1))
    await clickDone()

    const replacement = backup({
      entries: [entry({ id: ALT_ENTRY_ID, note: 'replacement' })],
      goals: [],
    })
    chooseFile('b.json', serializePlainBackup(replacement))
    fireEvent.click(await screen.findByText('Replace'))
    await clickConfigure('Replace & import')

    await screen.findByText('Import complete')
    await waitFor(() => expect(entryCount()).toBe(1))
    expect(entryState()).toBe(`${ALT_ENTRY_ID}=replacement`)
  })

  it('prompts for a password and rejects the wrong one before accepting the right one', async () => {
    mount()
    await createVault()

    chooseFile('enc.json', await serializeEncryptedBackup(backup({ goals: [] }), 'secret'))

    // Password stage.
    const pwField = await screen.findByLabelText('Backup password')
    fireEvent.change(pwField, { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    await screen.findByText('Incorrect password. Please try again.', undefined, { timeout: 5000 })

    fireEvent.change(pwField, { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))

    await clickConfigure('Continue', 5000)
    await screen.findByText('Import complete')
    await waitFor(() => expect(entryCount()).toBe(1))
  })

  it('imports entries from a CSV file (no settings)', async () => {
    mount()
    await createVault()

    chooseFile('entries.csv', serializeEntriesCSV([entry()]))
    const continueBtn = await screen.findByRole('button', { name: 'Continue' })
    // CSV carries no settings, so the settings toggle must not appear.
    expect(screen.queryByText('Also import settings')).toBeNull()
    fireEvent.click(continueBtn)

    await screen.findByText('Import complete')
    await waitFor(() => expect(entryCount()).toBe(1))
    expect(goalCount()).toBe(0)
  })

  it('applies imported settings when the toggle is enabled', async () => {
    mount()
    await createVault()
    expect(screen.getByTestId('theme').textContent).toBe('system')

    chooseFile(
      'backup.json',
      serializePlainBackup(backup({ goals: [], settings: { theme: 'dark', autoLockMinutes: 10 } }))
    )
    fireEvent.click(await screen.findByRole('switch'))
    await clickConfigure('Continue')

    await screen.findByText('Import complete')
    await waitFor(() => expect(screen.getByTestId('theme').textContent).toBe('dark'))
  })
})
