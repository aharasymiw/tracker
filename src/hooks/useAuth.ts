import { createContext, useContext } from 'react'
import type { AuthMethod, VaultState } from '@/types'
import type { PRFSupportStatus } from '@/lib/auth'

export interface AuthContextValue {
  vaultState: VaultState
  authMethod: AuthMethod | null
  unlock: (password: string) => Promise<boolean>
  unlockWithBiometric: () => Promise<boolean>
  lock: () => void
  createVault: (options: { password?: string; withBiometric?: boolean }) => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>
  masterKey: CryptoKey | null
  prfSupported: PRFSupportStatus | null
  setAutoLockConfig: (minutes: number, stayLoggedIn: boolean) => void
  enableBiometric: (password: string) => Promise<boolean>
  disableBiometric: (password: string) => Promise<boolean>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
