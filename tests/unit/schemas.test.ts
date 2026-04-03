import { describe, it, expect } from 'vite-plus/test'
import { LogEntrySchema, GoalSchema, AppSettingsSchema } from '@/lib/schemas'

describe('LogEntrySchema', () => {
  const valid = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    type: 'flower',
    amount: 1.5,
    unit: 'hits',
    socialContext: 'solo',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  }

  it('accepts valid entry', () => {
    expect(() => LogEntrySchema.parse(valid)).not.toThrow()
  })

  it('rejects negative amount', () => {
    expect(() => LogEntrySchema.parse({ ...valid, amount: -1 })).toThrow()
  })

  it('rejects unknown type', () => {
    expect(() => LogEntrySchema.parse({ ...valid, type: 'unknown' })).toThrow()
  })

  it('rejects note > 500 chars', () => {
    expect(() => LogEntrySchema.parse({ ...valid, note: 'x'.repeat(501) })).toThrow()
  })

  it('accepts optional note', () => {
    const result = LogEntrySchema.parse({ ...valid, note: 'Felt relaxed' })
    expect(result.note).toBe('Felt relaxed')
  })

  it('coerces timestamp strings to Date', () => {
    const result = LogEntrySchema.parse({ ...valid, timestamp: '2024-01-15T10:00:00Z' })
    expect(result.timestamp).toBeInstanceOf(Date)
  })
})

describe('GoalSchema', () => {
  const valid = {
    id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    type: 'daily',
    maxAmount: 3,
    unit: 'hits',
    reductionMode: false,
    startDate: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  it('accepts valid goal', () => {
    expect(() => GoalSchema.parse(valid)).not.toThrow()
  })

  it('accepts reduction mode with rate', () => {
    const result = GoalSchema.parse({ ...valid, reductionMode: true, reductionRate: 10 })
    expect(result.reductionRate).toBe(10)
  })

  it('rejects reduction rate > 100', () => {
    expect(() => GoalSchema.parse({ ...valid, reductionMode: true, reductionRate: 101 })).toThrow()
  })
})

describe('AppSettingsSchema', () => {
  it('accepts valid settings', () => {
    const result = AppSettingsSchema.parse({ theme: 'dark', autoLockMinutes: 10 })
    expect(result.theme).toBe('dark')
  })

  it('applies defaults', () => {
    const result = AppSettingsSchema.parse({})
    expect(result.theme).toBe('system')
    expect(result.autoLockMinutes).toBe(5)
  })

  it('rejects autoLockMinutes > 60', () => {
    expect(() => AppSettingsSchema.parse({ autoLockMinutes: 61 })).toThrow()
  })
})
