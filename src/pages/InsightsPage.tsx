import { useState } from 'react'
import { BarChart2 } from 'lucide-react'
import { RangeSelector } from '@/components/insights/RangeSelector'
import { TrendChart } from '@/components/insights/TrendChart'
import { TypeChart } from '@/components/insights/TypeChart'
import { HeatmapGrid } from '@/components/insights/HeatmapGrid'
import { WeeklyComparison } from '@/components/insights/WeeklyComparison'
import { useInsights, type TimeRange } from '@/hooks/useInsights'

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </div>
  )
}

export default function InsightsPage() {
  const [range, setRange] = useState<TimeRange>('week')
  const {
    dailyTotals,
    typeDistribution,
    heatmap,
    socialRatio,
    weekComparison,
    currentStreak,
    filteredCount,
  } = useInsights(range)

  if (filteredCount === 0 && currentStreak === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-8">
        <BarChart2 size={40} className="text-muted-foreground/40" />
        <p className="font-serif text-lg">No data yet</p>
        <p className="text-sm text-muted-foreground">Log a few entries to see your patterns</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <RangeSelector value={range} onChange={setRange} />

      {currentStreak > 0 && (
        <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
          <div className="text-4xl font-bold text-primary">{currentStreak}</div>
          <div>
            <p className="font-medium">Day streak</p>
            <p className="text-sm text-muted-foreground">Keep it up!</p>
          </div>
        </div>
      )}

      <ChartCard title="Daily usage">
        <TrendChart data={dailyTotals} />
      </ChartCard>

      <ChartCard title="By type">
        <TypeChart data={typeDistribution} />
      </ChartCard>

      <ChartCard title="Time of day">
        <HeatmapGrid data={heatmap} />
      </ChartCard>

      <ChartCard title="Week over week">
        <WeeklyComparison data={weekComparison} />
      </ChartCard>

      <ChartCard title="Solo vs Social">
        <div className="flex items-center justify-around py-2">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{socialRatio.solo}</p>
            <p className="text-sm text-muted-foreground">Solo</p>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: 'var(--chart-2)' }}>
              {socialRatio.social}
            </p>
            <p className="text-sm text-muted-foreground">Social</p>
          </div>
          {socialRatio.total > 0 && (
            <>
              <div className="h-10 w-px bg-border" />
              <div className="text-center">
                <p className="text-2xl font-bold text-muted-foreground">
                  {Math.round((socialRatio.solo / socialRatio.total) * 100)}%
                </p>
                <p className="text-sm text-muted-foreground">Solo rate</p>
              </div>
            </>
          )}
        </div>
      </ChartCard>
    </div>
  )
}
