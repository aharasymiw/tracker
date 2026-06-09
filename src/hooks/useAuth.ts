import { createContext, useContext } from 'react'
import type { VaultState } from '@/types'

export interface AuthContextValue {
  vaultState: VaultState
  unlockWithPassword: (password: string) => Promise<boolean>
  lock: () => void
  createVaultWithPassword: (password: string) => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>
  masterKey: CryptoKey | null
  setAutoLockMinutes: (minutes: number) => void
  stayLoggedIn: boolean
  setStayLoggedIn: (stayLoggedIn: boolean) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
