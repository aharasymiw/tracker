import { createContext, useContext } from 'react'
import type { UnlockMethod, VaultState } from '@/types'

export type PasskeySupportState = 'checking' | 'available' | 'unavailable'

export interface AuthContextValue {
  vaultState: VaultState
  unlockWithPassword: (password: string) => Promise<boolean>
  unlockWithPasskey: () => Promise<boolean>
  lock: () => void
  createVaultWithPassword: (password: string) => Promise<void>
  createVaultWithPasskey: (recoveryPassword: string) => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>
  addPasskey: (password: string) => Promise<void>
  removePasskey: () => Promise<void>
  masterKey: CryptoKey | null
  setAutoLockMinutes: (minutes: number) => void
  stayLoggedIn: boolean
  setStayLoggedIn: (stayLoggedIn: boolean) => Promise<void>
  hasPasskey: boolean
  passkeySupport: PasskeySupportState
  preferredUnlockMethod: UnlockMethod
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
