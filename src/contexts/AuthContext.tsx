import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { AuthMethod, VaultMeta, VaultState } from '@/types'
import {
  generateMasterKey,
  generateSalt,
  deriveKeyFromPassword,
  wrapMasterKey,
  unwrapMasterKey,
} from '@/lib/crypto'
import { registerBiometric, authenticateBiometric, isWebAuthnSupported } from '@/lib/auth'
import { getVaultMeta, saveVaultMeta } from '@/lib/db'

interface AuthContextValue {
  vaultState: VaultState
  authMethod: AuthMethod | null
  unlock: (password: string) => Promise<boolean>
  unlockWithBiometric: () => Promise<boolean>
  lock: () => void
  createVault: (password: string, withBiometric?: boolean) => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>
  masterKey: CryptoKey | null
  webAuthnSupported: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [vaultState, setVaultState] = useState<VaultState>('none')
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null)
  const masterKeyRef = useRef<CryptoKey | null>(null)
  const [masterKeyVersion, setMasterKeyVersion] = useState(0) // force re-renders
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autoLockMinutes] = useState(5)
  const webAuthnSupported = isWebAuthnSupported()

  useEffect(() => {
    getVaultMeta().then((meta) => {
      if (meta) {
        setVaultState('locked')
        setAuthMethod(meta.authMethod)
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
    clearLockTimer()
    lockTimerRef.current = setTimeout(() => lock(), autoLockMinutes * 60 * 1000)
  }, [autoLockMinutes, clearLockTimer, lock])

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
      if (!meta) return false
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

  const unlockWithBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const meta = await getVaultMeta()
      if (!meta?.prfCredentialId || !meta.prfEncryptedMasterKey || !meta.prfMasterKeyIV)
        return false
      const prfKey = await authenticateBiometric(meta.prfCredentialId)
      if (!prfKey) return false
      const masterKey = await unwrapMasterKey(
        meta.prfEncryptedMasterKey,
        meta.prfMasterKeyIV,
        prfKey
      )
      masterKeyRef.current = masterKey
      setMasterKeyVersion((v) => v + 1)
      setVaultState('unlocked')
      return true
    } catch {
      return false
    }
  }, [])

  const createVault = useCallback(
    async (password: string, withBiometric = false): Promise<void> => {
      const salt = await generateSalt()
      const masterKey = await generateMasterKey()
      const wrappingKey = await deriveKeyFromPassword(password, salt)
      const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)

      const meta: VaultMeta = {
        version: 1,
        authMethod: withBiometric ? 'both' : 'password',
        passwordSalt: salt,
        encryptedMasterKey,
        masterKeyIV,
        createdAt: new Date().toISOString(),
      }

      if (withBiometric && webAuthnSupported) {
        const result = await registerBiometric('trellis-user')
        if (result) {
          const { encryptedMasterKey: prfEnc, masterKeyIV: prfIV } = await wrapMasterKey(
            masterKey,
            result.prfKey
          )
          meta.prfEncryptedMasterKey = prfEnc
          meta.prfMasterKeyIV = prfIV
          meta.prfCredentialId = result.credentialId
        }
      }

      await saveVaultMeta(meta)
      masterKeyRef.current = masterKey
      setMasterKeyVersion((v) => v + 1)
      setAuthMethod(meta.authMethod)
      setVaultState('unlocked')
    },
    [webAuthnSupported]
  )

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<boolean> => {
      try {
        const meta = await getVaultMeta()
        if (!meta || !masterKeyRef.current) return false
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
        authMethod,
        unlock,
        unlockWithBiometric,
        lock,
        createVault,
        changePassword,
        masterKey: masterKeyRef.current,
        webAuthnSupported,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
