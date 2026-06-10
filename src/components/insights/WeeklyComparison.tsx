import { useState } from 'react'
import {
  estimateTextWidth,
  formatAmount,
  niceTicks,
  roundedTopRect,
} from '@/components/insights/chart-utils'

interface WeeklyComparisonProps {
  data: { day: string; thisWeek: number; lastWeek: number }[]
}

const W = 360
const H = 160
const MARGIN = { top: 8, right: 4, bottom: 16, left: 28 }
const PLOT_W = W - MARGIN.left - MARGIN.right
const PLOT_H = H - MARGIN.top - MARGIN.bottom
const BAR_GAP = 4
const LINE_H = 14

const SERIES = [
  { key: 'lastWeek', name: 'Last week', color: 'var(--chart-3)' },
  { key: 'thisWeek', name: 'This week', color: 'var(--chart-1)' },
] as const

interface TooltipBox {
  x: number
  y: number
  w: number
  h: number
  lines: { text: string; color: string }[]
}

export function WeeklyComparison({ data }: WeeklyComparisonProps) {
  const [selected, setSelected] = useState<number | null>(null)

  if (data.length === 0)
    return <p className="text-center text-sm text-muted-foreground py-8">No data</p>

  const peak = Math.max(...data.map((d) => Math.max(d.thisWeek, d.lastWeek)))
  const ticks = niceTicks(peak)
  const yMax = ticks[ticks.length - 1]
  const band = PLOT_W / data.length
  const barW = Math.min(band * 0.35, 16)
  const groupW = barW * SERIES.length + BAR_GAP
  const yOf = (v: number) => MARGIN.top + PLOT_H * (1 - v / yMax)

  const thisTotal = data.reduce((s, d) => s + d.thisWeek, 0)
  const lastTotal = data.reduce((s, d) => s + d.lastWeek, 0)

  const sel = selected !== null && selected < data.length ? selected : null
  let tooltip: TooltipBox | null = null
  if (sel !== null) {
    const d = data[sel]
    const lines = [
      { text: d.day, color: 'var(--foreground)' },
      ...SERIES.map((s) => ({
        text: `${s.name}: ${formatAmount(d[s.key])}`,
        color: s.color,
      })),
    ]
    const w = Math.max(...lines.map((l) => estimateTextWidth(l.text, 11))) + 12
    const h = lines.length * LINE_H + 6
    const cx = MARGIN.left + sel * band + band / 2
    const top = yOf(Math.max(d.thisWeek, d.lastWeek, 0))
    tooltip = {
      lines,
      w,
      h,
      x: Math.min(Math.max(cx - w / 2, 2), W - w - 2),
      y: Math.max(top - h - 4, 2),
    }
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto"
        role="img"
        aria-label={
          `Week over week bar chart: this week ${formatAmount(thisTotal)} total, ` +
          `last week ${formatAmount(lastTotal)} total`
        }
        onMouseLeave={() => setSelected(null)}
      >
        <title>Week over week</title>
        <desc>Grouped bar chart comparing this week's daily totals against last week's.</desc>
        {ticks.map((t) => (
          <text
            key={t}
            x={MARGIN.left - 6}
            y={yOf(t)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={11}
            fill="var(--muted-foreground)"
          >
            {t}
          </text>
        ))}
        {data.map((d, i) => {
          const bx = MARGIN.left + i * band
          const groupX = bx + (band - groupW) / 2
          return (
            <g key={d.day}>
              {sel === i && (
                <rect
                  x={bx}
                  y={MARGIN.top}
                  width={band}
                  height={PLOT_H}
                  fill="var(--muted)"
                  opacity={0.4}
                />
              )}
              {SERIES.map((s, j) => {
                const value = d[s.key]
                if (value <= 0) return null
                const barH = Math.max(PLOT_H * (value / yMax), 1)
                const x = groupX + j * (barW + BAR_GAP)
                return (
                  <path
                    key={s.key}
                    d={roundedTopRect(x, MARGIN.top + PLOT_H - barH, barW, barH, 3)}
                    fill={s.color}
                  />
                )
              })}
              <text
                x={bx + band / 2}
                y={H - 3}
                textAnchor="middle"
                fontSize={11}
                fill="var(--muted-foreground)"
              >
                {d.day}
              </text>
              <rect
                x={bx}
                y={MARGIN.top}
                width={band}
                height={PLOT_H}
                fill="transparent"
                onClick={() => setSelected(i)}
                onMouseEnter={() => setSelected(i)}
              >
                <title>
                  {`${d.day} — Last week: ${formatAmount(d.lastWeek)}, ` +
                    `This week: ${formatAmount(d.thisWeek)}`}
                </title>
              </rect>
            </g>
          )
        })}
        {tooltip && (
          <g pointerEvents="none">
            <rect
              x={tooltip.x}
              y={tooltip.y}
              width={tooltip.w}
              height={tooltip.h}
              rx={5}
              fill="var(--card)"
              stroke="var(--border)"
            />
            {tooltip.lines.map((line, i) => (
              <text
                key={line.text}
                x={tooltip.x + 6}
                y={tooltip.y + 3 + (i + 0.5) * LINE_H}
                dominantBaseline="central"
                fontSize={11}
                fill={line.color}
              >
                {line.text}
              </text>
            ))}
          </g>
        )}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-[11px]">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5" style={{ color: s.color }}>
            <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}
