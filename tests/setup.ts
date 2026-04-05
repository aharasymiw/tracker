import '@testing-library/jest-dom'
import { afterEach, vi } from 'vite-plus/test'
import { IDBFactory } from 'fake-indexeddb'

// Polyfill IndexedDB for tests
Object.defineProperty(globalThis, 'indexedDB', {
  value: new IDBFactory(),
  writable: true,
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'PublicKeyCredential')
  Reflect.deleteProperty(navigator, 'credentials')
})
