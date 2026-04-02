import '@testing-library/jest-dom'
import { IDBFactory } from 'fake-indexeddb'

// Polyfill IndexedDB for tests
Object.defineProperty(globalThis, 'indexedDB', {
  value: new IDBFactory(),
  writable: true,
})
