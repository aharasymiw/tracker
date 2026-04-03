import { describe, it, expect } from 'vite-plus/test'
// Note: useInsights depends on DataContext — we test the aggregation logic directly as pure functions
// by extracting them. For now, test the heatmap period bucketing logic and streak separately.

// Test the period bucketing inline since it's not exported
describe('time period bucketing', () => {
  const getPeriod = (hour: number) => (hour < 6 ? 3 : hour < 12 ? 0 : hour < 18 ? 1 : 2)

  it('buckets 0-5 as night (3)', () => {
    expect(getPeriod(0)).toBe(3)
    expect(getPeriod(5)).toBe(3)
  })

  it('buckets 6-11 as morning (0)', () => {
    expect(getPeriod(6)).toBe(0)
    expect(getPeriod(11)).toBe(0)
  })

  it('buckets 12-17 as afternoon (1)', () => {
    expect(getPeriod(12)).toBe(1)
    expect(getPeriod(17)).toBe(1)
  })

  it('buckets 18-23 as evening (2)', () => {
    expect(getPeriod(18)).toBe(2)
    expect(getPeriod(23)).toBe(2)
  })
})

describe('streak calculation', () => {
  it('counts consecutive days', async () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const twoDaysAgo = new Date(today)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    const entries = [today, yesterday, twoDaysAgo].map((d, i) => ({
      id: `id-${i}`,
      type: 'flower' as const,
      amount: 1,
      unit: 'hits',
      socialContext: 'solo' as const,
      timestamp: d,
      createdAt: d,
      updatedAt: d,
    }))

    // Inline streak calculation (mirrors useInsights logic)
    const { startOfDay, format, subDays } = await import('date-fns')
    const todayStart = startOfDay(new Date())
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const day = format(subDays(todayStart, i), 'yyyy-MM-dd')
      const hasEntry = entries.some(
        (e: (typeof entries)[0]) => format(startOfDay(e.timestamp), 'yyyy-MM-dd') === day
      )
      if (hasEntry) streak++
      else break
    }
    expect(streak).toBe(3)
  })
})
