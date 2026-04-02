import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface WeeklyComparisonProps {
  data: { day: string; thisWeek: number; lastWeek: number }[]
}

export function WeeklyComparison({ data }: WeeklyComparisonProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar
          dataKey="lastWeek"
          name="Last week"
          fill="var(--chart-3)"
          radius={[3, 3, 0, 0]}
          maxBarSize={16}
        />
        <Bar
          dataKey="thisWeek"
          name="This week"
          fill="var(--chart-1)"
          radius={[3, 3, 0, 0]}
          maxBarSize={16}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
