export type ConsumptionType = 'flower' | 'vape' | 'edible' | 'concentrate' | 'tincture' | 'topical'
export type SocialContext = 'solo' | 'social'
export type VaultState = 'none' | 'locked' | 'unlocked'
export type Theme = 'light' | 'dark' | 'system'
export type UnlockMethod = 'password' | 'passkey'

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
  defaultEntryType?: ConsumptionType
  intention?: string
}

export interface PasswordKeySlot {
  id: string
  type: 'password'
  passwordSalt: string
  encryptedMasterKey: string
  masterKeyIV: string
}

export interface PasskeyKeySlot {
  id: string
  type: 'passkey'
  storage: 'largeBlob'
  credentialId: string
  encryptedMasterKey: string
  masterKeyIV: string
  label?: string
  transports?: string[]
  rpId?: string
}

export type KeySlot = PasswordKeySlot | PasskeyKeySlot

export interface AuthPrefs {
  stayLoggedIn: boolean
  preferredUnlockMethod: UnlockMethod
}

export interface VaultMeta {
  version: 3
  keySlots: KeySlot[]
  verifyIV?: string // base64-encoded — IV for session key verification
  verifyCiphertext?: string // base64-encoded — sentinel encrypted with master key
  createdAt: string // ISO date string
}

export type VaultKeySlot = KeySlot

export interface EncryptedRecord {
  id: string
  iv: string // base64-encoded
  ciphertext: string // base64-encoded
  updatedAt: string // ISO date string for indexing
}
