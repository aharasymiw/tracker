import '@testing-library/jest-dom'
import { afterEach, beforeEach, vi } from 'vite-plus/test'
import { IDBFactory } from 'fake-indexeddb'

// Polyfill IndexedDB for tests
Object.defineProperty(globalThis, 'indexedDB', {
  value: new IDBFactory(),
  writable: true,
})

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'PublicKeyCredential')
  Reflect.deleteProperty(navigator, 'credentials')
})
