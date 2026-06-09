import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
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

function installIndexedDbGlobals() {
  const newFactory = new IDBFactory()
  // @ts-expect-error writable in runtime
  globalThis.indexedDB = newFactory
  globalThis.IDBFactory = IDBFactory as unknown as typeof globalThis.IDBFactory
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

function Harness() {
  const auth = useAuth()
  const data = useData()

  return (
    <div>
      <div data-testid="vault-state">{auth.vaultState}</div>
      <div data-testid="stay-logged-in">{String(auth.stayLoggedIn)}</div>
      <div data-testid="auto-lock-minutes">{data.settings.autoLockMinutes}</div>
      <button type="button" onClick={() => void auth.createVaultWithPassword('password-123')}>
        create password vault
      </button>
      <button type="button" onClick={() => void auth.unlockWithPassword('password-123')}>
        unlock with password
      </button>
      <button type="button" onClick={() => void auth.setStayLoggedIn(true)}>
        stay logged in on
      </button>
      <button type="button" onClick={() => void auth.setStayLoggedIn(false)}>
        stay logged in off
      </button>
      <button type="button" onClick={auth.lock}>
        lock
      </button>
    </div>
  )
}

type MountedApp = {
  container: HTMLDivElement
  root: Root
}

let mountedApp: MountedApp | null = null

function mountProviders(): MountedApp {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <AuthProvider>
        <DataProvider>
          <Harness />
        </DataProvider>
      </AuthProvider>
    )
  })

  const mounted = { container, root }
  mountedApp = mounted
  return mounted
}

function unmountProviders() {
  if (!mountedApp) return
  act(() => {
    mountedApp?.root.unmount()
  })
  mountedApp.container.remove()
  mountedApp = null
}

function getText(testId: string): string {
  const element = mountedApp?.container.querySelector(`[data-testid="${testId}"]`)
  if (!element) throw new Error(`Missing test id: ${testId}`)
  return element.textContent ?? ''
}

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(mountedApp?.container.querySelectorAll('button') ?? []).find(
    (element) => element.textContent === label
  )
  if (!button) throw new Error(`Missing button: ${label}`)
  return button as HTMLButtonElement
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function waitForText(testId: string, expected: string) {
  const timeout = Date.now() + 5000
  while (Date.now() < timeout) {
    await flush()
    if (getText(testId).includes(expected)) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${testId} to include ${expected}`)
}

async function clickButton(label: string) {
  const button = getButton(label)
  act(() => {
    button.click()
  })
  await flush()
}

beforeEach(async () => {
  installIndexedDbGlobals()
  localStorage.clear()
  sessionStorage.clear()

  const { resetDbForTesting } = await import('@/lib/db')
  resetDbForTesting()
})

afterEach(() => {
  unmountProviders()
})

describe('auth provider integration', () => {
  it('creates a password vault and unlocks it again after locking', async () => {
    mountProviders()

    await clickButton('create password vault')
    await waitForText('vault-state', 'unlocked')

    await clickButton('lock')
    await waitForText('vault-state', 'locked')

    await clickButton('unlock with password')
    await waitForText('vault-state', 'unlocked')
  })

  it('restores an unlocked session after remount when stay logged in is enabled', async () => {
    mountProviders()

    await clickButton('create password vault')
    await waitForText('vault-state', 'unlocked')
    await clickButton('stay logged in on')
    await waitForText('stay-logged-in', 'true')

    unmountProviders()
    mountProviders()

    await waitForText('vault-state', 'unlocked')
    expect(getText('stay-logged-in')).toBe('true')
  })

  it('remounts locked when stay logged in is disabled', async () => {
    mountProviders()

    await clickButton('create password vault')
    await waitForText('vault-state', 'unlocked')
    await clickButton('stay logged in off')
    await waitForText('stay-logged-in', 'false')

    unmountProviders()
    mountProviders()

    await waitForText('vault-state', 'locked')
    expect(getText('stay-logged-in')).toBe('false')
  })
})
