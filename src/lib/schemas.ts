import { z } from 'zod'

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

export const AppSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  autoLockMinutes: z.number().int().min(1).max(60).default(5),
  defaultEntryType: ConsumptionTypeSchema.optional(),
  intention: z.string().max(1000).optional(),
})

export type LogEntryInput = z.infer<typeof LogEntrySchema>
export type GoalInput = z.infer<typeof GoalSchema>
export type AppSettingsInput = z.infer<typeof AppSettingsSchema>
