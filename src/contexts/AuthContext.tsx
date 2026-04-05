import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from '@/hooks/useAuth'
import type {
  AuthPrefs,
  PasskeyKeySlot,
  PasswordKeySlot,
  UnlockMethod,
  VaultMeta,
  VaultState,
} from '@/types'
import {
  decrypt,
  deriveKeyFromPassword,
  encrypt,
  generateMasterKey,
  generateSalt,
  makeNonExtractable,
  rewrapMasterKey,
  unwrapMasterKey,
  unwrapMasterKeyExtractable,
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
import {
  createPasskeySlot,
  getPasskeySupport,
  isPasskeyError,
  type PasskeySupportReason,
  unlockWithPasskeySlot,
} from '@/lib/passkey'

const SESSION_SENTINEL = 'trellis-session-ok'
const STAY_LOGGED_IN_STORAGE_KEY = 'trellis-stay-logged-in'
const DEFAULT_AUTH_PREFS: AuthPrefs = {
  stayLoggedIn: false,
  preferredUnlockMethod: 'password',
}

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

function getPasskeySlot(meta: VaultMeta | null): PasskeyKeySlot | undefined {
  return meta?.keySlots.find((slot): slot is PasskeyKeySlot => slot.type === 'passkey')
}

function normalizePreferredUnlockMethod(
  meta: VaultMeta | null,
  method: UnlockMethod
): UnlockMethod {
  if (method === 'passkey' && getPasskeySlot(meta)) return 'passkey'
  return 'password'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [vaultState, setVaultState] = useState<VaultState>('none')
  const [masterKeyVersion, setMasterKeyVersion] = useState(0)
  const [autoLockMinutes, setAutoLockMinutesState] = useState(5)
  const [stayLoggedIn, setStayLoggedInState] = useState(readStayLoggedInCache)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [passkeySupport, setPasskeySupport] = useState<
    'checking' | 'available' | 'tentative' | 'unavailable'
  >('checking')
  const [passkeySupportReason, setPasskeySupportReason] = useState<PasskeySupportReason | null>(
    null
  )
  const [preferredUnlockMethod, setPreferredUnlockMethodState] = useState<UnlockMethod>('password')
  const masterKeyRef = useRef<CryptoKey | null>(null)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vaultMetaRef = useRef<VaultMeta | null>(null)
  const authPrefsRef = useRef<AuthPrefs>(DEFAULT_AUTH_PREFS)

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    lockTimerRef.current = null
  }, [])

  const syncVaultMeta = useCallback((meta: VaultMeta | null) => {
    vaultMetaRef.current = meta
    setHasPasskey(Boolean(getPasskeySlot(meta)))
  }, [])

  const syncAuthPrefs = useCallback(
    (prefs: AuthPrefs, metaOverride: VaultMeta | null = vaultMetaRef.current) => {
      const normalized = normalizePreferredUnlockMethod(metaOverride, prefs.preferredUnlockMethod)
      const nextPrefs = { ...prefs, preferredUnlockMethod: normalized }
      authPrefsRef.current = nextPrefs
      setStayLoggedInState(nextPrefs.stayLoggedIn)
      setPreferredUnlockMethodState(nextPrefs.preferredUnlockMethod)
      writeStayLoggedInCache(nextPrefs.stayLoggedIn)
      return nextPrefs
    },
    []
  )

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
    async (masterKey: CryptoKey, method: UnlockMethod, meta: VaultMeta) => {
      masterKeyRef.current = masterKey
      setMasterKeyVersion((value) => value + 1)
      syncVaultMeta(meta)
      setVaultState('unlocked')
      await savePrefs({ preferredUnlockMethod: method })
      await persistKeyIfStayLoggedIn(masterKey)
    },
    [persistKeyIfStayLoggedIn, savePrefs, syncVaultMeta]
  )

  const lock = useCallback(() => {
    masterKeyRef.current = null
    setMasterKeyVersion((value) => value + 1)
    setVaultState(vaultMetaRef.current ? 'locked' : 'none')
    clearLockTimer()
    void clearSessionKey()
  }, [clearLockTimer])

  const startLockTimer = useCallback(() => {
    if (authPrefsRef.current.stayLoggedIn) return
    clearLockTimer()
    lockTimerRef.current = setTimeout(() => lock(), autoLockMinutes * 60 * 1000)
  }, [autoLockMinutes, clearLockTimer, lock])

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
        version: 2,
        keySlots: [passwordSlot],
        verifyIV,
        verifyCiphertext,
        createdAt: new Date().toISOString(),
      }

      await saveVaultMeta(meta)
      syncVaultMeta(meta)
      syncAuthPrefs(DEFAULT_AUTH_PREFS, meta)
      await saveAuthPrefs(DEFAULT_AUTH_PREFS)

      const usableKey = await makeNonExtractable(masterKey)
      masterKeyRef.current = usableKey
      setMasterKeyVersion((value) => value + 1)
      setVaultState('unlocked')
    },
    [createPasswordSlot, syncAuthPrefs, syncVaultMeta]
  )

  const createVaultWithPasskey = useCallback(
    async (recoveryPassword: string): Promise<void> => {
      const masterKey = await generateMasterKey()
      const [passwordSlot, enrollment] = await Promise.all([
        createPasswordSlot(masterKey, recoveryPassword),
        createPasskeySlot(masterKey),
      ])
      const passkeySlot: PasskeyKeySlot = {
        id: 'passkey-slot',
        type: 'passkey',
        credentialId: enrollment.credentialId,
        encryptedMasterKey: enrollment.encryptedMasterKey,
        masterKeyIV: enrollment.masterKeyIV,
        prfInput: enrollment.prfInput,
        label: 'Fingerprint / Face ID',
      }
      const { iv: verifyIV, ciphertext: verifyCiphertext } = await encrypt(
        SESSION_SENTINEL,
        masterKey
      )
      const meta: VaultMeta = {
        version: 2,
        keySlots: [passwordSlot, passkeySlot],
        verifyIV,
        verifyCiphertext,
        createdAt: new Date().toISOString(),
      }
      const prefs: AuthPrefs = {
        stayLoggedIn: false,
        preferredUnlockMethod: 'passkey',
      }

      await saveVaultMeta(meta)
      syncVaultMeta(meta)
      syncAuthPrefs(prefs, meta)
      await saveAuthPrefs(prefs)

      const usableKey = await makeNonExtractable(masterKey)
      masterKeyRef.current = usableKey
      setMasterKeyVersion((value) => value + 1)
      setVaultState('unlocked')
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
        await finishUnlock(masterKey, 'password', verifiedMeta)
        return true
      } catch {
        return false
      }
    },
    [ensureVerificationTag, finishUnlock]
  )

  const unlockWithPasskey = useCallback(async (): Promise<boolean> => {
    const meta = await getVaultMeta()
    const passkeySlot = getPasskeySlot(meta ?? null)
    if (!meta || !passkeySlot?.prfInput) return false

    try {
      const masterKey = await unlockWithPasskeySlot(passkeySlot)
      const verifiedMeta = await ensureVerificationTag(meta, masterKey)
      await finishUnlock(masterKey, 'passkey', verifiedMeta)
      return true
    } catch (error) {
      if (isPasskeyError(error) && error.code === 'cancelled') {
        return false
      }
      throw error
    }
  }, [ensureVerificationTag, finishUnlock])

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

  const addPasskey = useCallback(
    async (password: string): Promise<void> => {
      const meta = await getVaultMeta()
      const passwordSlot = getPasswordSlot(meta ?? null)
      if (!meta || !passwordSlot) {
        throw new Error('A recovery password is required before adding fingerprint / Face ID')
      }

      const passwordWrappingKey = await deriveKeyFromPassword(password, passwordSlot.passwordSalt)
      const extractableMasterKey = await unwrapMasterKeyExtractable(
        passwordSlot.encryptedMasterKey,
        passwordSlot.masterKeyIV,
        passwordWrappingKey
      )
      const enrollment = await createPasskeySlot(extractableMasterKey)
      const passkeySlot: PasskeyKeySlot = {
        id: getPasskeySlot(meta)?.id ?? 'passkey-slot',
        type: 'passkey',
        credentialId: enrollment.credentialId,
        encryptedMasterKey: enrollment.encryptedMasterKey,
        masterKeyIV: enrollment.masterKeyIV,
        prfInput: enrollment.prfInput,
        label: 'Fingerprint / Face ID',
      }
      const updatedMeta: VaultMeta = {
        ...meta,
        keySlots: [...meta.keySlots.filter((slot) => slot.type !== 'passkey'), passkeySlot],
      }

      await saveVaultMeta(updatedMeta)
      syncVaultMeta(updatedMeta)
      await savePrefs({ preferredUnlockMethod: 'passkey' })
    },
    [savePrefs, syncVaultMeta]
  )

  const removePasskey = useCallback(async (): Promise<void> => {
    const meta = await getVaultMeta()
    if (!meta) return

    const updatedMeta: VaultMeta = {
      ...meta,
      keySlots: meta.keySlots.filter((slot) => slot.type !== 'passkey'),
    }

    await saveVaultMeta(updatedMeta)
    syncVaultMeta(updatedMeta)
    await savePrefs({ preferredUnlockMethod: 'password' })
  }, [savePrefs, syncVaultMeta])

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
      const [meta, prefs, support] = await Promise.all([
        getVaultMeta(),
        getAuthPrefs(),
        getPasskeySupport().catch(() => ({
          status: 'unsupported',
          supported: false,
          platformAuthenticator: false,
          prf: 'unknown' as const,
          reason: 'unsupported-browser' as const,
        })),
      ])

      if (cancelled) return

      setPasskeySupport(support.status)
      setPasskeySupportReason(support.reason ?? null)

      if (!meta) {
        syncVaultMeta(null)
        syncAuthPrefs(prefs, null)
        setVaultState('none')
        return
      }

      syncVaultMeta(meta)
      syncAuthPrefs(prefs, meta)

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
          if (plaintext === SESSION_SENTINEL) {
            masterKeyRef.current = sessionKey
            setMasterKeyVersion((value) => value + 1)
            setVaultState('unlocked')
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
  }, [clearLockTimer, startLockTimer, vaultState])

  void masterKeyVersion

  return (
    <AuthContext.Provider
      value={{
        vaultState,
        unlockWithPassword,
        unlockWithPasskey,
        lock,
        createVaultWithPassword,
        createVaultWithPasskey,
        changePassword,
        addPasskey,
        removePasskey,
        masterKey: masterKeyRef.current,
        setAutoLockMinutes,
        stayLoggedIn,
        setStayLoggedIn,
        hasPasskey,
        passkeySupport,
        passkeySupportReason,
        preferredUnlockMethod,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
