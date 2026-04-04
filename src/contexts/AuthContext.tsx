import { useCallback, useEffect, useRef, useState } from 'react'
import type { VaultMeta, VaultState } from '@/types'
import {
  generateMasterKey,
  generateSalt,
  deriveKeyFromPassword,
  wrapMasterKey,
  unwrapMasterKey,
  rewrapMasterKey,
  makeNonExtractable,
  encrypt,
  decrypt,
} from '@/lib/crypto'
import {
  getVaultMeta,
  saveVaultMeta,
  getSessionKey,
  saveSessionKey,
  clearSessionKey,
} from '@/lib/db'
import { AuthContext } from '@/hooks/useAuth'

const SESSION_SENTINEL = 'trellis-session-ok'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [vaultState, setVaultState] = useState<VaultState>('none')
  const masterKeyRef = useRef<CryptoKey | null>(null)
  const [masterKeyVersion, setMasterKeyVersion] = useState(0) // force re-renders
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autoLockMinutes, setAutoLockMinutes] = useState(5)
  const [stayLoggedIn, setStayLoggedIn] = useState(false)

  useEffect(() => {
    async function init() {
      const meta = await getVaultMeta()
      if (!meta) {
        setVaultState('none')
        return
      }

      // Try restoring session from persisted key, verified against vault's own tag
      const sessionKey = await getSessionKey()
      if (sessionKey && meta.verifyIV && meta.verifyCiphertext) {
        try {
          const plaintext = await decrypt(meta.verifyCiphertext, meta.verifyIV, sessionKey)
          if (plaintext === SESSION_SENTINEL) {
            masterKeyRef.current = sessionKey
            setMasterKeyVersion((v) => v + 1)
            setVaultState('unlocked')
            return
          }
        } catch {
          // Key doesn't match current vault
        }
        await clearSessionKey()
      }

      setVaultState('locked')
    }
    init()
  }, [])

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
  }, [])

  const lock = useCallback(() => {
    masterKeyRef.current = null
    setMasterKeyVersion((v) => v + 1)
    setVaultState('locked')
    clearLockTimer()
    clearSessionKey()
  }, [clearLockTimer])

  const startLockTimer = useCallback(() => {
    if (stayLoggedIn) return
    clearLockTimer()
    lockTimerRef.current = setTimeout(() => lock(), autoLockMinutes * 60 * 1000)
  }, [autoLockMinutes, stayLoggedIn, clearLockTimer, lock])

  const setAutoLockConfig = useCallback((minutes: number, stay: boolean) => {
    setAutoLockMinutes(minutes)
    setStayLoggedIn(stay)
  }, [])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && vaultState === 'unlocked') {
        startLockTimer()
      } else {
        clearLockTimer()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [vaultState, startLockTimer, clearLockTimer])

  const persistKeyIfStayLoggedIn = useCallback(
    async (key: CryptoKey) => {
      if (stayLoggedIn) {
        await saveSessionKey(key)
      }
    },
    [stayLoggedIn]
  )

  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      try {
        const meta = await getVaultMeta()
        if (!meta?.passwordSalt || !meta.encryptedMasterKey || !meta.masterKeyIV) return false
        const wrappingKey = await deriveKeyFromPassword(password, meta.passwordSalt)
        const masterKey = await unwrapMasterKey(
          meta.encryptedMasterKey,
          meta.masterKeyIV,
          wrappingKey
        )
        // Backfill verification tag for vaults created before this feature
        if (!meta.verifyIV || !meta.verifyCiphertext) {
          const { iv: verifyIV, ciphertext: verifyCiphertext } = await encrypt(
            SESSION_SENTINEL,
            masterKey
          )
          await saveVaultMeta({ ...meta, verifyIV, verifyCiphertext })
        }
        masterKeyRef.current = masterKey
        setMasterKeyVersion((v) => v + 1)
        setVaultState('unlocked')
        await persistKeyIfStayLoggedIn(masterKey)
        return true
      } catch {
        return false
      }
    },
    [persistKeyIfStayLoggedIn]
  )

  const createVault = useCallback(
    async (password: string): Promise<void> => {
      const masterKey = await generateMasterKey()
      const salt = await generateSalt()
      const wrappingKey = await deriveKeyFromPassword(password, salt)
      const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)
      const { iv: verifyIV, ciphertext: verifyCiphertext } = await encrypt(
        SESSION_SENTINEL,
        masterKey
      )

      const meta: VaultMeta = {
        version: 1,
        passwordSalt: salt,
        encryptedMasterKey,
        masterKeyIV,
        verifyIV,
        verifyCiphertext,
        createdAt: new Date().toISOString(),
      }

      await saveVaultMeta(meta)
      const usableKey = await makeNonExtractable(masterKey)
      masterKeyRef.current = usableKey
      setMasterKeyVersion((v) => v + 1)
      setVaultState('unlocked')
      await persistKeyIfStayLoggedIn(usableKey)
    },
    [persistKeyIfStayLoggedIn]
  )

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<boolean> => {
      try {
        const meta = await getVaultMeta()
        if (!meta) return false
        if (!meta.passwordSalt || !meta.encryptedMasterKey || !meta.masterKeyIV) return false
        const oldWrapping = await deriveKeyFromPassword(oldPassword, meta.passwordSalt)
        const newSalt = await generateSalt()
        const newWrapping = await deriveKeyFromPassword(newPassword, newSalt)
        const { encryptedMasterKey, masterKeyIV } = await rewrapMasterKey(
          meta.encryptedMasterKey,
          meta.masterKeyIV,
          oldWrapping,
          newWrapping
        )
        await saveVaultMeta({ ...meta, passwordSalt: newSalt, encryptedMasterKey, masterKeyIV })
        return true
      } catch {
        return false
      }
    },
    []
  )

  // Suppress unused variable warning for masterKeyVersion - it's used to trigger re-renders
  void masterKeyVersion

  return (
    <AuthContext.Provider
      value={{
        vaultState,
        unlock,
        lock,
        createVault,
        changePassword,
        masterKey: masterKeyRef.current,
        setAutoLockConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
