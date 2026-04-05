import { z } from 'zod'

export const UnlockMethodSchema = z.enum(['password', 'passkey'])

export const ConsumptionTypeSchema = z.enum([
  'flower',
  'vape',
  'edible',
  'concentrate',
  'tincture',
  'topical',
])

export const SocialContextSchema = z.enum(['solo', 'social'])

export const LogEntrySchema = z.object({
  id: z.string().uuid(),
  type: ConsumptionTypeSchema,
  amount: z.number().positive(),
  unit: z.string().min(1),
  socialContext: SocialContextSchema,
  timestamp: z.coerce.date(),
  note: z.string().max(500).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const GoalSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['daily', 'weekly']),
  maxAmount: z.number().positive(),
  unit: z.string().min(1),
  reductionMode: z.boolean(),
  reductionRate: z.number().min(0).max(100).optional(),
  startDate: z.coerce.date(),
  intention: z.string().max(1000).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const PasswordKeySlotSchema = z.object({
  id: z.string().min(1),
  type: z.literal('password'),
  passwordSalt: z.string().min(1),
  encryptedMasterKey: z.string().min(1),
  masterKeyIV: z.string().min(1),
})

export const PasskeyKeySlotSchema = z.object({
  id: z.string().min(1),
  type: z.literal('passkey'),
  storage: z.literal('largeBlob'),
  credentialId: z.string().min(1),
  encryptedMasterKey: z.string().min(1),
  masterKeyIV: z.string().min(1),
  label: z.string().min(1).optional(),
  transports: z.array(z.string().min(1)).optional(),
  rpId: z.string().min(1).optional(),
})

export const KeySlotSchema = z.discriminatedUnion('type', [
  PasswordKeySlotSchema,
  PasskeyKeySlotSchema,
])

export const VaultMetaSchema = z.object({
  version: z.literal(3),
  keySlots: z.array(KeySlotSchema).min(1),
  verifyIV: z.string().min(1).optional(),
  verifyCiphertext: z.string().min(1).optional(),
  createdAt: z.string().min(1),
})

export const AuthPrefsSchema = z.object({
  stayLoggedIn: z.boolean().default(false),
  preferredUnlockMethod: UnlockMethodSchema.default('password'),
})

export const AppSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  autoLockMinutes: z.number().int().min(1).max(60).default(5),
  defaultEntryType: ConsumptionTypeSchema.optional(),
  intention: z.string().max(1000).optional(),
})

export type LogEntryInput = z.infer<typeof LogEntrySchema>
export type GoalInput = z.infer<typeof GoalSchema>
export type PasswordKeySlotInput = z.infer<typeof PasswordKeySlotSchema>
export type PasskeyKeySlotInput = z.infer<typeof PasskeyKeySlotSchema>
export type KeySlotInput = z.infer<typeof KeySlotSchema>
export type VaultMetaInput = z.infer<typeof VaultMetaSchema>
export type AuthPrefsInput = z.infer<typeof AuthPrefsSchema>
export type AppSettingsInput = z.infer<typeof AppSettingsSchema>

export {
  PasswordKeySlotSchema as VaultPasswordSlotSchema,
  PasskeyKeySlotSchema as VaultPasskeySlotSchema,
  KeySlotSchema as VaultKeySlotSchema,
}
