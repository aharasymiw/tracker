import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from '@/hooks/useAuth'
import type { AuthPrefs, PasswordKeySlot, VaultMeta, VaultState } from '@/types'
import {
  decrypt,
  deriveKeyFromPassword,
  encrypt,
  generateMasterKey,
  generateSalt,
  makeNonExtractable,
  rewrapMasterKey,
  unwrapMasterKey,
  wrapMasterKey,
} from '@/lib/crypto'
import {
  clearSessionKey,
  getAuthPrefs,
  getSessionKey,
  getVaultMeta,
  saveAuthPrefs,
  saveSessionKey,
  saveVaultMeta,
} from '@/lib/db'
import { requestPersistentStorage } from '@/lib/storage'

const SESSION_SENTINEL = 'lesslately-session-ok'
// Vaults created before the Trellis → Less Lately rename carry a verification
// tag encrypted from the old sentinel. The tag is only written at vault
// creation (or when missing), so the old plaintext must stay accepted forever.
const LEGACY_SESSION_SENTINEL = 'trellis-session-ok'
export const STAY_LOGGED_IN_STORAGE_KEY = 'lesslately-stay-logged-in'
const DEFAULT_AUTH_PREFS: AuthPrefs = {
  stayLoggedIn: false,
}

// Same-origin channel that propagates an explicit lock to every open tab.
// Auto-lock stays per-tab: an idle tab locking itself must not yank the vault
// out from under a tab the user is actively working in.
const LOCK_CHANNEL_NAME = 'lesslately-lock'

// User-input events that count as "activity" for the idle timer. Passive and
// debounced so the listeners cost nothing on busy pages.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const
const ACTIVITY_DEBOUNCE_MS = 10_000

function readStayLoggedInCache() {
  try {
    return localStorage.getItem(STAY_LOGGED_IN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeStayLoggedInCache(stayLoggedIn: boolean) {
  try {
    localStorage.setItem(STAY_LOGGED_IN_STORAGE_KEY, String(stayLoggedIn))
  } catch {
    // Ignore localStorage errors (e.g. private browsing)
  }
}

function getPasswordSlot(meta: VaultMeta | null): PasswordKeySlot | undefined {
  return meta?.keySlots.find((slot): slot is PasswordKeySlot => slot.type === 'password')
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [vaultState, setVaultState] = useState<VaultState>('none')
  const [masterKeyVersion, setMasterKeyVersion] = useState(0)
  const [autoLockMinutes, setAutoLockMinutesState] = useState(5)
  const [stayLoggedIn, setStayLoggedInState] = useState(readStayLoggedInCache)
  const masterKeyRef = useRef<CryptoKey | null>(null)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vaultMetaRef = useRef<VaultMeta | null>(null)
  const authPrefsRef = useRef<AuthPrefs>(DEFAULT_AUTH_PREFS)
  const lockChannelRef = useRef<BroadcastChannel | null>(null)

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    lockTimerRef.current = null
  }, [])

  const syncVaultMeta = useCallback((meta: VaultMeta | null) => {
    vaultMetaRef.current = meta
  }, [])

  const syncAuthPrefs = useCallback((prefs: AuthPrefs) => {
    authPrefsRef.current = prefs
    setStayLoggedInState(prefs.stayLoggedIn)
    writeStayLoggedInCache(prefs.stayLoggedIn)
    return prefs
  }, [])

  const savePrefs = useCallback(
    async (updates: Partial<AuthPrefs>) => {
      const prefs = await saveAuthPrefs({
        ...authPrefsRef.current,
        ...updates,
      })
      return syncAuthPrefs(prefs)
    },
    [syncAuthPrefs]
  )

  const persistKeyIfStayLoggedIn = useCallback(async (key: CryptoKey) => {
    if (authPrefsRef.current.stayLoggedIn) {
      await saveSessionKey(key)
    }
  }, [])

  const ensureVerificationTag = useCallback(
    async (meta: VaultMeta, masterKey: CryptoKey) => {
      if (meta.verifyIV && meta.verifyCiphertext) return meta

      const { iv: verifyIV, ciphertext: verifyCiphertext } = await encrypt(
        SESSION_SENTINEL,
        masterKey
      )
      const updated = { ...meta, verifyIV, verifyCiphertext }
      await saveVaultMeta(updated)
      syncVaultMeta(updated)
      return updated
    },
    [syncVaultMeta]
  )

  const finishUnlock = useCallback(
    async (masterKey: CryptoKey, meta: VaultMeta) => {
      masterKeyRef.current = masterKey
      setMasterKeyVersion((value) => value + 1)
      syncVaultMeta(meta)
      setVaultState('unlocked')
      await persistKeyIfStayLoggedIn(masterKey)
      // Fire-and-forget: ask the browser not to evict our IndexedDB data.
      void requestPersistentStorage()
    },
    [persistKeyIfStayLoggedIn, syncVaultMeta]
  )

  // Lock this tab only — used for auto-lock and when another tab broadcasts.
  const lockLocal = useCallback(() => {
    masterKeyRef.current = null
    setMasterKeyVersion((value) => value + 1)
    setVaultState(vaultMetaRef.current ? 'locked' : 'none')
    clearLockTimer()
    void clearSessionKey()
  }, [clearLockTimer])

  // Explicit lock (header button): lock every open tab.
  const lock = useCallback(() => {
    lockLocal()
    lockChannelRef.current?.postMessage('lock')
  }, [lockLocal])

  const startLockTimer = useCallback(() => {
    if (authPrefsRef.current.stayLoggedIn) return
    clearLockTimer()
    lockTimerRef.current = setTimeout(() => lockLocal(), autoLockMinutes * 60 * 1000)
  }, [autoLockMinutes, clearLockTimer, lockLocal])

  const setAutoLockMinutes = useCallback((minutes: number) => {
    setAutoLockMinutesState(minutes)
  }, [])

  const createPasswordSlot = useCallback(async (masterKey: CryptoKey, password: string) => {
    const salt = await generateSalt()
    const wrappingKey = await deriveKeyFromPassword(password, salt)
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)
    const slot: PasswordKeySlot = {
      id: 'password-slot',
      type: 'password',
      passwordSalt: salt,
      encryptedMasterKey,
      masterKeyIV,
    }
    return slot
  }, [])

  const createVaultWithPassword = useCallback(
    async (password: string): Promise<void> => {
      const masterKey = await generateMasterKey()
      const passwordSlot = await createPasswordSlot(masterKey, password)
      const { iv: verifyIV, ciphertext: verifyCiphertext } = await encrypt(
        SESSION_SENTINEL,
        masterKey
      )
      const meta: VaultMeta = {
        version: 3,
        keySlots: [passwordSlot],
        verifyIV,
        verifyCiphertext,
        createdAt: new Date().toISOString(),
      }

      await saveVaultMeta(meta)
      syncVaultMeta(meta)
      syncAuthPrefs(DEFAULT_AUTH_PREFS)
      await saveAuthPrefs(DEFAULT_AUTH_PREFS)

      const usableKey = await makeNonExtractable(masterKey)
      masterKeyRef.current = usableKey
      setMasterKeyVersion((value) => value + 1)
      setVaultState('unlocked')
      void requestPersistentStorage()
    },
    [createPasswordSlot, syncAuthPrefs, syncVaultMeta]
  )

  const unlockWithPassword = useCallback(
    async (password: string): Promise<boolean> => {
      try {
        const meta = await getVaultMeta()
        const passwordSlot = getPasswordSlot(meta ?? null)
        if (!meta || !passwordSlot) return false

        const wrappingKey = await deriveKeyFromPassword(password, passwordSlot.passwordSalt)
        const masterKey = await unwrapMasterKey(
          passwordSlot.encryptedMasterKey,
          passwordSlot.masterKeyIV,
          wrappingKey
        )
        const verifiedMeta = await ensureVerificationTag(meta, masterKey)
        await finishUnlock(masterKey, verifiedMeta)
        return true
      } catch {
        return false
      }
    },
    [ensureVerificationTag, finishUnlock]
  )

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<boolean> => {
      try {
        const meta = await getVaultMeta()
        const passwordSlot = getPasswordSlot(meta ?? null)
        if (!meta || !passwordSlot) return false

        const oldWrapping = await deriveKeyFromPassword(oldPassword, passwordSlot.passwordSalt)
        const newSalt = await generateSalt()
        const newWrapping = await deriveKeyFromPassword(newPassword, newSalt)
        const { encryptedMasterKey, masterKeyIV } = await rewrapMasterKey(
          passwordSlot.encryptedMasterKey,
          passwordSlot.masterKeyIV,
          oldWrapping,
          newWrapping
        )
        const updatedPasswordSlot: PasswordKeySlot = {
          ...passwordSlot,
          passwordSalt: newSalt,
          encryptedMasterKey,
          masterKeyIV,
        }
        const updatedMeta: VaultMeta = {
          ...meta,
          keySlots: meta.keySlots.map((slot) =>
            slot.id === passwordSlot.id ? updatedPasswordSlot : slot
          ),
        }
        await saveVaultMeta(updatedMeta)
        syncVaultMeta(updatedMeta)
        return true
      } catch {
        return false
      }
    },
    [syncVaultMeta]
  )

  const setStayLoggedIn = useCallback(
    async (nextStayLoggedIn: boolean) => {
      const prefs = await savePrefs({ stayLoggedIn: nextStayLoggedIn })
      if (!prefs.stayLoggedIn) {
        await clearSessionKey()
        return
      }
      if (masterKeyRef.current && vaultState === 'unlocked') {
        await saveSessionKey(masterKeyRef.current)
      }
    },
    [savePrefs, vaultState]
  )

  useEffect(() => {
    let cancelled = false

    async function init() {
      const [meta, prefs] = await Promise.all([getVaultMeta(), getAuthPrefs()])

      if (cancelled) return

      if (!meta) {
        syncVaultMeta(null)
        syncAuthPrefs(prefs)
        setVaultState('none')
        return
      }

      syncVaultMeta(meta)
      syncAuthPrefs(prefs)

      const sessionKey = await getSessionKey()
      if (cancelled) return

      if (
        authPrefsRef.current.stayLoggedIn &&
        sessionKey &&
        meta.verifyIV &&
        meta.verifyCiphertext
      ) {
        try {
          const plaintext = await decrypt(meta.verifyCiphertext, meta.verifyIV, sessionKey)
          if (plaintext === SESSION_SENTINEL || plaintext === LEGACY_SESSION_SENTINEL) {
            masterKeyRef.current = sessionKey
            setMasterKeyVersion((value) => value + 1)
            setVaultState('unlocked')
            void requestPersistentStorage()
            return
          }
        } catch {
          // Ignore invalid persisted session key and continue to lock the vault.
        }
      }

      if (sessionKey) {
        await clearSessionKey()
      }

      if (!cancelled) {
        setVaultState('locked')
      }
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [syncAuthPrefs, syncVaultMeta])

  // Auto-lock: one countdown that restarts on any user activity and on tab
  // show/hide. It covers both "tab left hidden" and "tab visible but idle" —
  // previously a visible desktop tab never locked. Disabled by stay-logged-in
  // (startLockTimer no-ops).
  useEffect(() => {
    if (vaultState !== 'unlocked') return

    startLockTimer()

    let lastReset = Date.now()
    const handleActivity = () => {
      if (document.hidden) return
      const now = Date.now()
      if (now - lastReset < ACTIVITY_DEBOUNCE_MS) return
      lastReset = now
      startLockTimer()
    }

    const handleVisibility = () => {
      // Hiding starts the countdown; returning counts as activity.
      lastReset = Date.now()
      startLockTimer()
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity)
      }
      document.removeEventListener('visibilitychange', handleVisibility)
      clearLockTimer()
    }
  }, [clearLockTimer, startLockTimer, vaultState])

  // Cross-tab lock propagation. BroadcastChannel only reaches same-origin
  // contexts and never carries key material — just the instruction to lock.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(LOCK_CHANNEL_NAME)
    channel.onmessage = (event) => {
      if (event.data === 'lock') lockLocal()
    }
    lockChannelRef.current = channel
    return () => {
      lockChannelRef.current = null
      channel.close()
    }
  }, [lockLocal])

  void masterKeyVersion

  return (
    <AuthContext.Provider
      value={{
        vaultState,
        unlockWithPassword,
        lock,
        createVaultWithPassword,
        changePassword,
        masterKey: masterKeyRef.current,
        setAutoLockMinutes,
        stayLoggedIn,
        setStayLoggedIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
