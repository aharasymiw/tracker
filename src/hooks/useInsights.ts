import { useMemo } from 'react'
import {
  startOfDay,
  startOfWeek,
  eachDayOfInterval,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  format,
  getHours,
  getDay,
} from 'date-fns'
import { useData } from '@/hooks/useData'
import type { LogEntry } from '@/types'

export type TimeRange = 'week' | 'month' | '3months' | 'year'

function getStartDate(range: TimeRange): Date {
  const now = new Date()
  switch (range) {
    case 'week':
      return subDays(now, 7)
    case 'month':
      return subMonths(now, 1)
    case '3months':
      return subMonths(now, 3)
    case 'year':
      return subYears(now, 1)
  }
}

function filterEntries(entries: LogEntry[], since: Date): LogEntry[] {
  return entries.filter((e) => e.timestamp >= since)
}

export function useInsights(range: TimeRange) {
  const { entries } = useData()
  const since = useMemo(() => getStartDate(range), [range])
  const filtered = useMemo(() => filterEntries(entries, since), [entries, since])

  // Daily totals for bar chart
  const dailyTotals = useMemo(() => {
    const now = new Date()
    const days = eachDayOfInterval({ start: since, end: now })
    const map = new Map<string, number>()
    for (const entry of filtered) {
      const key = format(startOfDay(entry.timestamp), 'yyyy-MM-dd')
      map.set(key, (map.get(key) ?? 0) + entry.amount)
    }
    return days.map((day) => ({
      date: format(day, range === 'week' ? 'EEE' : range === 'month' ? 'MMM d' : 'MMM d'),
      fullDate: format(day, 'yyyy-MM-dd'),
      total: map.get(format(day, 'yyyy-MM-dd')) ?? 0,
    }))
  }, [filtered, since, range])

  // Type distribution for donut chart
  const typeDistribution = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of filtered) {
      map.set(entry.type, (map.get(entry.type) ?? 0) + entry.amount)
    }
    return Array.from(map.entries()).map(([type, total]) => ({ type, total }))
  }, [filtered])

  // Time-of-day heatmap: 7 days (Sun-Sat) x 4 periods (morning/afternoon/evening/night)
  const heatmap = useMemo(() => {
    // Initialize 4 periods x 7 days
    const grid: number[][] = Array.from({ length: 4 }, () => Array.from({ length: 7 }, () => 0))
    for (const entry of filtered) {
      const hour = getHours(entry.timestamp)
      const dayOfWeek = getDay(entry.timestamp) // 0=Sun
      const period = hour < 6 ? 3 : hour < 12 ? 0 : hour < 18 ? 1 : 2
      // period: 0=morning(6-12), 1=afternoon(12-18), 2=evening(18-24), 3=night(0-6)
      grid[period][dayOfWeek] += entry.amount
    }
    return grid
  }, [filtered])

  // Social ratio
  const socialRatio = useMemo(() => {
    const solo = filtered.filter((e) => e.socialContext === 'solo').length
    const social = filtered.filter((e) => e.socialContext === 'social').length
    return { solo, social, total: solo + social }
  }, [filtered])

  // Week-over-week comparison
  const weekComparison = useMemo(() => {
    const thisWeekStart = startOfWeek(new Date())
    const lastWeekStart = subWeeks(thisWeekStart, 1)
    const thisWeek = entries.filter((e) => e.timestamp >= thisWeekStart)
    const lastWeek = entries.filter(
      (e) => e.timestamp >= lastWeekStart && e.timestamp < thisWeekStart
    )
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days.map((day, i) => {
      const thisTotal = thisWeek
        .filter((e) => getDay(e.timestamp) === i)
        .reduce((s, e) => s + e.amount, 0)
      const lastTotal = lastWeek
        .filter((e) => getDay(e.timestamp) === i)
        .reduce((s, e) => s + e.amount, 0)
      return { day, thisWeek: thisTotal, lastWeek: lastTotal }
    })
  }, [entries])

  // Streak: consecutive days meeting… we just count consecutive logged days for now
  const currentStreak = useMemo(() => {
    const today = startOfDay(new Date())
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const day = format(subDays(today, i), 'yyyy-MM-dd')
      const hasEntry = entries.some((e) => format(startOfDay(e.timestamp), 'yyyy-MM-dd') === day)
      if (hasEntry) streak++
      else break
    }
    return streak
  }, [entries])

  return {
    dailyTotals,
    typeDistribution,
    heatmap,
    socialRatio,
    weekComparison,
    currentStreak,
    filteredCount: filtered.length,
  }
}
