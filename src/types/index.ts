export type ConsumptionType = 'flower' | 'vape' | 'edible' | 'concentrate' | 'tincture' | 'topical'
export type SocialContext = 'solo' | 'social'
export type AuthMethod = 'password' | 'biometric' | 'both'
export type VaultState = 'none' | 'locked' | 'unlocked'
export type Theme = 'light' | 'dark' | 'system'

export interface LogEntry {
  id: string
  type: ConsumptionType
  amount: number
  unit: string
  socialContext: SocialContext
  timestamp: Date
  note?: string
  createdAt: Date
  updatedAt: Date
}

export interface Goal {
  id: string
  type: 'daily' | 'weekly'
  maxAmount: number
  unit: string
  reductionMode: boolean
  reductionRate?: number // % per week
  startDate: Date
  intention?: string
  createdAt: Date
  updatedAt: Date
}

export interface AppSettings {
  theme: Theme
  autoLockMinutes: number
  stayLoggedIn: boolean
  defaultEntryType?: ConsumptionType
  intention?: string
}

export interface VaultMeta {
  version: number
  authMethod: AuthMethod
  passwordSalt: string // hex-encoded
  encryptedMasterKey: string // base64-encoded
  masterKeyIV: string // base64-encoded
  prfEncryptedMasterKey?: string
  prfMasterKeyIV?: string
  prfCredentialId?: string
  createdAt: string // ISO date string
}

export interface EncryptedRecord {
  id: string
  iv: string // base64-encoded
  ciphertext: string // base64-encoded
  updatedAt: string // ISO date string for indexing
}
