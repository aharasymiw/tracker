import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthMethod, VaultMeta, VaultState } from '@/types'
import {
  generateMasterKey,
  generateSalt,
  deriveKeyFromPassword,
  wrapMasterKey,
  unwrapMasterKey,
} from '@/lib/crypto'
import {
  registerBiometric,
  authenticateBiometric,
  isPRFSupported,
  type PRFSupportStatus,
} from '@/lib/auth'
import { getVaultMeta, saveVaultMeta } from '@/lib/db'
import { AuthContext } from '@/hooks/useAuth'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [vaultState, setVaultState] = useState<VaultState>('none')
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null)
  const masterKeyRef = useRef<CryptoKey | null>(null)
  const [masterKeyVersion, setMasterKeyVersion] = useState(0) // force re-renders
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autoLockMinutes, setAutoLockMinutes] = useState(5)
  const [stayLoggedIn, setStayLoggedIn] = useState(false)
  const [prfSupported, setPrfSupported] = useState<PRFSupportStatus | null>(null)

  useEffect(() => {
    isPRFSupported().then(setPrfSupported)
  }, [])

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
    async (options: { password?: string; withBiometric?: boolean }): Promise<void> => {
      const { password, withBiometric } = options
      const masterKey = await generateMasterKey()

      const meta: VaultMeta = {
        version: 1,
        authMethod: 'password',
        createdAt: new Date().toISOString(),
      }

      // Password wrapping
      if (password) {
        const salt = await generateSalt()
        const wrappingKey = await deriveKeyFromPassword(password, salt)
        const { encryptedMasterKey, masterKeyIV } = await wrapMasterKey(masterKey, wrappingKey)
        meta.passwordSalt = salt
        meta.encryptedMasterKey = encryptedMasterKey
        meta.masterKeyIV = masterKeyIV
      }

      // Biometric wrapping
      if (withBiometric) {
        try {
          const result = await registerBiometric('trellis-user')
          if (result) {
            const { encryptedMasterKey: prfEnc, masterKeyIV: prfIV } = await wrapMasterKey(
              masterKey,
              result.prfKey
            )
            meta.prfEncryptedMasterKey = prfEnc
            meta.prfMasterKeyIV = prfIV
            meta.prfCredentialId = result.credentialId
          } else if (!password) {
            throw new Error('Biometric registration failed')
          }
        } catch (err) {
          if (err instanceof Error && err.message === 'PRF_NOT_SUPPORTED') {
            setPrfSupported(false)
            if (!password) throw new Error('Biometric unlock is not supported in this browser.')
            // password+biometric mode: fall back to password-only silently
          } else {
            if (!password) throw err
          }
        }
      }

      // Determine authMethod from what actually succeeded
      const hasPassword = !!meta.passwordSalt
      const hasBiometric = !!meta.prfCredentialId
      if (hasPassword && hasBiometric) {
        meta.authMethod = 'both'
      } else if (hasBiometric) {
        meta.authMethod = 'biometric'
      } else {
        meta.authMethod = 'password'
      }

      await saveVaultMeta(meta)
      masterKeyRef.current = masterKey
      setMasterKeyVersion((v) => v + 1)
      setAuthMethod(meta.authMethod)
      setVaultState('unlocked')
    },
    []
  )

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

  const enableBiometric = useCallback(async (password: string): Promise<boolean> => {
    try {
      const meta = await getVaultMeta()
      if (!meta || !masterKeyRef.current) return false
      if (!meta.passwordSalt || !meta.encryptedMasterKey || !meta.masterKeyIV) return false
      // Verify password
      const wrappingKey = await deriveKeyFromPassword(password, meta.passwordSalt)
      await unwrapMasterKey(meta.encryptedMasterKey, meta.masterKeyIV, wrappingKey)
      // Register biometric
      let result: Awaited<ReturnType<typeof registerBiometric>>
      try {
        result = await registerBiometric('trellis-user')
      } catch (err) {
        if (err instanceof Error && err.message === 'PRF_NOT_SUPPORTED') {
          setPrfSupported(false)
        }
        return false
      }
      if (!result) return false
      // Wrap master key with PRF key
      const { encryptedMasterKey: prfEnc, masterKeyIV: prfIV } = await wrapMasterKey(
        masterKeyRef.current,
        result.prfKey
      )
      // Update vault meta
      await saveVaultMeta({
        ...meta,
        authMethod: 'both',
        prfEncryptedMasterKey: prfEnc,
        prfMasterKeyIV: prfIV,
        prfCredentialId: result.credentialId,
      })
      setAuthMethod('both')
      return true
    } catch {
      return false
    }
  }, [])

  const disableBiometric = useCallback(async (password: string): Promise<boolean> => {
    try {
      const meta = await getVaultMeta()
      if (!meta || meta.authMethod !== 'both') return false
      if (!meta.passwordSalt || !meta.encryptedMasterKey || !meta.masterKeyIV) return false
      // Verify password
      const wrappingKey = await deriveKeyFromPassword(password, meta.passwordSalt)
      await unwrapMasterKey(meta.encryptedMasterKey, meta.masterKeyIV, wrappingKey)
      // Remove PRF data from vault meta
      const updated: VaultMeta = {
        ...meta,
        authMethod: 'password',
      }
      delete updated.prfEncryptedMasterKey
      delete updated.prfMasterKeyIV
      delete updated.prfCredentialId
      await saveVaultMeta(updated)
      setAuthMethod('password')
      return true
    } catch {
      return false
    }
  }, [])

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
        prfSupported,
        setAutoLockConfig,
        enableBiometric,
        disableBiometric,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
