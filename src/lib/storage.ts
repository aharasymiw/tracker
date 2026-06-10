// Persistent-storage opt-in. Without it the browser may evict IndexedDB under
// storage pressure — and Safari clears storage for sites unused for 7 days when
// the app isn't installed to the home screen. For a local-only app, eviction
// means total data loss, so we ask for durability as soon as a vault exists.

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}
