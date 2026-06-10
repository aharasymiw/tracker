import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
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
import { useAuth } from '@/hooks/useAuth'

// Idle auto-lock and cross-tab lock propagation. The data layer isn't needed,
// so these mount AuthProvider alone (default autoLockMinutes = 5).

function Harness() {
  const auth = useAuth()
  return (
    <div>
      <div data-testid="vault-state">{auth.vaultState}</div>
      <button type="button" onClick={() => void auth.createVaultWithPassword('password-123')}>
        create password vault
      </button>
      <button type="button" onClick={() => void auth.unlockWithPassword('password-123')}>
        unlock with password
      </button>
      <button type="button" onClick={auth.lock}>
        lock
      </button>
    </div>
  )
}

interface Mounted {
  container: HTMLDivElement
  root: Root
}

const mounted: Mounted[] = []

function mountProvider(): Mounted {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    )
  })
  const app = { container, root }
  mounted.push(app)
  return app
}

function unmountAll() {
  for (const app of mounted.splice(0)) {
    act(() => app.root.unmount())
    app.container.remove()
  }
}

function getText(app: Mounted, testId: string): string {
  return app.container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? ''
}

function getButton(app: Mounted, label: string): HTMLButtonElement {
  const button = Array.from(app.container.querySelectorAll('button')).find(
    (el) => el.textContent === label
  )
  if (!button) throw new Error(`Missing button: ${label}`)
  return button as HTMLButtonElement
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function clickButton(app: Mounted, label: string) {
  const button = getButton(app, label)
  act(() => button.click())
  await flush()
}

// Real-timer polling (used before fake timers are installed).
async function waitForText(app: Mounted, testId: string, expected: string) {
  const timeout = Date.now() + 5000
  while (Date.now() < timeout) {
    await flush()
    if (getText(app, testId).includes(expected)) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${testId} to include ${expected}`)
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

// Deterministic stand-in for BroadcastChannel: jsdom's availability varies.
class MockBroadcastChannel {
  static peers = new Map<string, Set<MockBroadcastChannel>>()
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(public name: string) {
    if (!MockBroadcastChannel.peers.has(name)) MockBroadcastChannel.peers.set(name, new Set())
    MockBroadcastChannel.peers.get(name)!.add(this)
  }

  postMessage(data: unknown) {
    for (const peer of MockBroadcastChannel.peers.get(this.name) ?? []) {
      if (peer !== this) peer.onmessage?.({ data } as MessageEvent)
    }
  }

  close() {
    MockBroadcastChannel.peers.get(this.name)?.delete(this)
  }
}

const originalBroadcastChannel = globalThis.BroadcastChannel

beforeEach(() => {
  // @ts-expect-error writable in runtime
  globalThis.indexedDB = new IDBFactory()
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
  // @ts-expect-error minimal mock
  globalThis.BroadcastChannel = MockBroadcastChannel
  MockBroadcastChannel.peers.clear()
  localStorage.clear()
})

afterEach(async () => {
  unmountAll()
  vi.useRealTimers()
  globalThis.BroadcastChannel = originalBroadcastChannel
  const { resetDbForTesting } = await import('@/lib/db')
  resetDbForTesting()
})

// Re-arms the lock countdown under fake timers (the timer armed during unlock
// used the real setTimeout). visibilitychange restarts it unconditionally.
async function rearmUnderFakeTimers() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await advance(0)
}

describe('idle auto-lock', () => {
  it('locks after the auto-lock window passes with no activity', async () => {
    const app = mountProvider()
    await clickButton(app, 'create password vault')
    await waitForText(app, 'vault-state', 'unlocked')

    await rearmUnderFakeTimers()
    await advance(5 * 60 * 1000 + 1000)

    expect(getText(app, 'vault-state')).toBe('locked')
  })

  it('stays unlocked while the user is active, then locks once idle', async () => {
    const app = mountProvider()
    await clickButton(app, 'create password vault')
    await waitForText(app, 'vault-state', 'unlocked')

    await rearmUnderFakeTimers()

    // 4 minutes pass, then activity resets the countdown.
    await advance(4 * 60 * 1000)
    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })

    // 2 more minutes: 6 total, but only 2 since last activity — still unlocked.
    await advance(2 * 60 * 1000)
    expect(getText(app, 'vault-state')).toBe('unlocked')

    // Idle past the window since the reset — locked.
    await advance(3 * 60 * 1000 + 1000)
    expect(getText(app, 'vault-state')).toBe('locked')
  })
})

describe('cross-tab lock', () => {
  it('locking one tab locks the others', async () => {
    const tabA = mountProvider()
    await clickButton(tabA, 'create password vault')
    await waitForText(tabA, 'vault-state', 'unlocked')

    const tabB = mountProvider()
    await waitForText(tabB, 'vault-state', 'locked')
    await clickButton(tabB, 'unlock with password')
    await waitForText(tabB, 'vault-state', 'unlocked')

    await clickButton(tabA, 'lock')
    await waitForText(tabA, 'vault-state', 'locked')
    await waitForText(tabB, 'vault-state', 'locked')
  })
})
