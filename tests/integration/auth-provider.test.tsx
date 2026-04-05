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
import { DataProvider } from '@/contexts/DataContext'
import { useAuth } from '@/hooks/useAuth'
import { useData } from '@/hooks/useData'

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function toArrayBuffer(value: BufferSource): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value.slice(0)
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
}

function createPasskeyCredential(
  rawId: ArrayBuffer,
  {
    largeBlobSupported,
    largeBlobWritten,
    largeBlobBlob,
  }: {
    largeBlobSupported?: boolean
    largeBlobWritten?: boolean
    largeBlobBlob?: ArrayBuffer
  } = {}
) {
  return {
    rawId,
    id: toBase64Url(rawId),
    type: 'public-key',
    response: {
      getTransports: () => ['internal'],
    },
    getClientExtensionResults: () => ({
      largeBlob: {
        ...(largeBlobSupported === undefined ? {} : { supported: largeBlobSupported }),
        ...(largeBlobWritten === undefined ? {} : { written: largeBlobWritten }),
        ...(largeBlobBlob
          ? {
              blob: largeBlobBlob,
            }
          : {}),
      },
    }),
  } as PublicKeyCredential
}

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

function installWebAuthnMocks({
  capabilities = {
    passkeyPlatformAuthenticator: true,
    'extension:largeBlob': true,
  },
}: {
  capabilities?: Record<string, boolean>
} = {}) {
  const rawId = Uint8Array.from([11, 22, 33, 44]).buffer
  let storedLargeBlob: ArrayBuffer | null = null

  class MockPublicKeyCredential {}

  Object.assign(MockPublicKeyCredential, {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
    getClientCapabilities: vi.fn().mockResolvedValue(capabilities),
    signalUnknownCredential: vi.fn().mockResolvedValue(undefined),
  })

  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value: MockPublicKeyCredential,
  })

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create: vi
        .fn()
        .mockResolvedValue(createPasskeyCredential(rawId, { largeBlobSupported: true })),
      get: vi.fn().mockImplementation(async (request: CredentialRequestOptions) => {
        const largeBlob = (request.publicKey as PublicKeyCredentialRequestOptions | undefined)
          ?.extensions?.largeBlob as
          | {
              write?: BufferSource
              read?: boolean
            }
          | undefined

        if (largeBlob?.write !== undefined) {
          storedLargeBlob = toArrayBuffer(largeBlob.write)
          return createPasskeyCredential(rawId, { largeBlobWritten: true })
        }

        if (largeBlob?.read) {
          return createPasskeyCredential(
            rawId,
            storedLargeBlob ? { largeBlobBlob: storedLargeBlob } : undefined
          )
        }

        return createPasskeyCredential(rawId)
      }),
    },
  })
}

function Harness() {
  const auth = useAuth()
  const data = useData()

  return (
    <div>
      <div data-testid="vault-state">{auth.vaultState}</div>
      <div data-testid="stay-logged-in">{String(auth.stayLoggedIn)}</div>
      <div data-testid="preferred-unlock-method">{auth.preferredUnlockMethod}</div>
      <div data-testid="has-passkey">{String(auth.hasPasskey)}</div>
      <div data-testid="passkey-support">{auth.passkeySupport}</div>
      <div data-testid="auto-lock-minutes">{data.settings.autoLockMinutes}</div>
      <button type="button" onClick={() => void auth.createVaultWithPassword('password-123')}>
        create password vault
      </button>
      <button type="button" onClick={() => void auth.createVaultWithPasskey('password-123')}>
        create passkey vault
      </button>
      <button type="button" onClick={() => void auth.unlockWithPassword('password-123')}>
        unlock with password
      </button>
      <button type="button" onClick={() => void auth.unlockWithPasskey()}>
        unlock with passkey
      </button>
      <button type="button" onClick={() => void auth.addPasskey('password-123')}>
        add passkey
      </button>
      <button type="button" onClick={() => void auth.removePasskey()}>
        remove passkey
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
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'PublicKeyCredential')
  Reflect.deleteProperty(navigator, 'credentials')
})

describe('auth provider integration', () => {
  it('creates a password vault and unlocks it again after locking', async () => {
    mountProviders()

    await clickButton('create password vault')
    await waitForText('vault-state', 'unlocked')
    expect(getText('preferred-unlock-method')).toBe('password')
    expect(getText('has-passkey')).toBe('false')

    await clickButton('lock')
    await waitForText('vault-state', 'locked')

    await clickButton('unlock with password')
    await waitForText('vault-state', 'unlocked')
  })

  it('creates a passkey vault and unlocks it with the platform credential', async () => {
    installWebAuthnMocks()
    mountProviders()

    await waitForText('passkey-support', 'available')
    await clickButton('create passkey vault')

    await waitForText('vault-state', 'unlocked')
    expect(getText('preferred-unlock-method')).toBe('passkey')
    expect(getText('has-passkey')).toBe('true')

    await clickButton('lock')
    await waitForText('vault-state', 'locked')

    await clickButton('unlock with passkey')
    await waitForText('vault-state', 'unlocked')
  })

  it('allows passkey enrollment when support is tentative', async () => {
    installWebAuthnMocks({
      capabilities: {
        passkeyPlatformAuthenticator: true,
      },
    })
    mountProviders()

    await waitForText('passkey-support', 'tentative')
    await clickButton('create passkey vault')

    await waitForText('vault-state', 'unlocked')
    expect(getText('preferred-unlock-method')).toBe('passkey')
    expect(getText('has-passkey')).toBe('true')

    await clickButton('lock')
    await waitForText('vault-state', 'locked')

    await clickButton('unlock with passkey')
    await waitForText('vault-state', 'unlocked')
  })

  it('adds a passkey to an existing password vault and allows passkey unlock', async () => {
    installWebAuthnMocks()
    mountProviders()

    await waitForText('passkey-support', 'available')
    await clickButton('create password vault')
    await waitForText('vault-state', 'unlocked')

    await clickButton('add passkey')
    await waitForText('has-passkey', 'true')
    await waitForText('preferred-unlock-method', 'passkey')
    expect(getText('preferred-unlock-method')).toBe('passkey')

    await clickButton('lock')
    await waitForText('vault-state', 'locked')

    await clickButton('unlock with passkey')
    await waitForText('vault-state', 'unlocked')
  })

  it('removes a passkey and falls back to password unlock', async () => {
    installWebAuthnMocks()
    mountProviders()

    await waitForText('passkey-support', 'available')
    await clickButton('create passkey vault')
    await waitForText('vault-state', 'unlocked')
    await waitForText('has-passkey', 'true')

    await clickButton('remove passkey')
    await waitForText('has-passkey', 'false')
    await waitForText('preferred-unlock-method', 'password')

    await clickButton('lock')
    await waitForText('vault-state', 'locked')

    await clickButton('unlock with password')
    await waitForText('vault-state', 'unlocked')
  })

  it.each([
    ['password', false],
    ['passkey', true],
  ] as const)(
    'restores an unlocked session after remount when stay logged in is enabled for %s auth',
    async (method, usePasskey) => {
      if (usePasskey) installWebAuthnMocks()
      mountProviders()

      if (usePasskey) {
        await waitForText('passkey-support', 'available')
        await clickButton('create passkey vault')
      } else {
        await clickButton('create password vault')
      }

      await waitForText('vault-state', 'unlocked')
      await clickButton('stay logged in on')
      await waitForText('stay-logged-in', 'true')

      unmountProviders()
      mountProviders()

      await waitForText('vault-state', 'unlocked')
      expect(getText('stay-logged-in')).toBe('true')
      expect(getText('preferred-unlock-method')).toBe(method)
    }
  )

  it.each([
    ['password', false],
    ['passkey', true],
  ] as const)(
    'remounts locked when stay logged in is disabled for %s auth',
    async (_method, usePasskey) => {
      if (usePasskey) installWebAuthnMocks()
      mountProviders()

      if (usePasskey) {
        await waitForText('passkey-support', 'available')
        await clickButton('create passkey vault')
      } else {
        await clickButton('create password vault')
      }

      await waitForText('vault-state', 'unlocked')
      await clickButton('stay logged in off')
      await waitForText('stay-logged-in', 'false')

      unmountProviders()
      mountProviders()

      await waitForText('vault-state', 'locked')
      expect(getText('stay-logged-in')).toBe('false')
    }
  )
})
