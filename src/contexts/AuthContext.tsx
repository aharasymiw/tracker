import { useCallback, useEffect, useRef, useState } from 'react'
import type { VaultMeta, VaultState } from '@/types'
import {
  generateMasterKey,
  generateSalt,
  deriveKeyFromPassword,
  wrapMasterKey,
  unwrapMasterKey,
} from '@/lib/crypto'
import { getVaultMeta, saveVaultMeta } from '@/lib/db'
import { AuthContext } from '@/hooks/useAuth'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [vaultState, setVaultState] = useState<VaultState>('none')
  const masterKeyRef = useRef<CryptoKey | null>(null)
  const [masterKeyVersion, setMasterKeyVersion] = useState(0) // force re-renders
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autoLockMinutes, setAutoLockMinutes] = useState(5)
  const [stayLoggedIn, setStayLoggedIn] = useState(false)

  useEffect(() => {
    getVaultMeta().then((meta) => {
      if (meta) {
        setVaultState('locked')
      } else {
        setVaultState('none')
      }
    })
  }, [])

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
  }, [])

  const lock = useCallback(() => {
    masterKeyRef.current = null
    setMasterKeyVersion((v) => v + 1)
    setVaultState('locked')
    clearLockTimer()
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

  const unlock = useCallback(async (password: string): Promise<boolean> => {
    try {
      const meta = await getVaultMeta()
      if (!meta?.passwordSalt || !meta.encryptedMasterKey || !meta.masterKeyIV) return false
      const wrappingKey = await deriveKeyFromPassword(password, meta.passwordSalt)
      const masterKey = await unwrapMasterKey(
        meta.encryptedMasterKey,
        meta.masterKeyIV,
        wrappingKey
      )
      masterKeyRef.current = masterKey
      setMasterKeyVersion((v) => v + 1)
      setVaultState('unlocked')
      return true
    } catch {
      return false
    }
  }, [])

  const createVault = useCallback(async (password: string): Promise<void> => {
    const masterKey = await generateMasterKey()
    const salt = await generateSalt()
    const wrappingKey = await deriveKeyFromPassword(password, salt)
    const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)

    const meta: VaultMeta = {
      version: 1,
      passwordSalt: salt,
      encryptedMasterKey,
      masterKeyIV,
      createdAt: new Date().toISOString(),
    }

    await saveVaultMeta(meta)
    masterKeyRef.current = masterKey
    setMasterKeyVersion((v) => v + 1)
    setVaultState('unlocked')
  }, [])

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<boolean> => {
      try {
        const meta = await getVaultMeta()
        if (!meta || !masterKeyRef.current) return false
        if (!meta.passwordSalt || !meta.encryptedMasterKey || !meta.masterKeyIV) return false
        // Verify old password
        const oldWrapping = await deriveKeyFromPassword(oldPassword, meta.passwordSalt)
        await unwrapMasterKey(meta.encryptedMasterKey, meta.masterKeyIV, oldWrapping)
        // Re-wrap with new password
        const newSalt = await generateSalt()
        const newWrapping = await deriveKeyFromPassword(newPassword, newSalt)
        const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(
          masterKeyRef.current,
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
