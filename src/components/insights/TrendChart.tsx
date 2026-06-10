import { useState } from 'react'
import {
  estimateTextWidth,
  formatAmount,
  niceTicks,
  roundedTopRect,
} from '@/components/insights/chart-utils'

interface TrendChartProps {
  data: { date: string; total: number }[]
}

const W = 360
const H = 180
const MARGIN = { top: 8, right: 4, bottom: 16, left: 28 }
const PLOT_W = W - MARGIN.left - MARGIN.right
const PLOT_H = H - MARGIN.top - MARGIN.bottom

/** All indices for short ranges; ~5 evenly spaced ones (first + last) for long ranges */
function tickIndices(n: number): number[] {
  if (n <= 8) return Array.from({ length: n }, (_, i) => i)
  const count = 5
  const picks = new Set<number>()
  for (let i = 0; i < count; i++) picks.add(Math.round((i * (n - 1)) / (count - 1)))
  return [...picks]
}

export function TrendChart({ data }: TrendChartProps) {
  const [selected, setSelected] = useState<number | null>(null)

  if (data.length === 0)
    return <p className="text-center text-sm text-muted-foreground py-8">No data</p>

  const peak = Math.max(...data.map((d) => d.total))
  const ticks = niceTicks(peak)
  const yMax = ticks[ticks.length - 1]
  const band = PLOT_W / data.length
  const barW = Math.min(band * 0.7, 32)
  const yOf = (v: number) => MARGIN.top + PLOT_H * (1 - v / yMax)

  const sel = selected !== null && selected < data.length ? selected : null
  let tooltip: { label: string; x: number; y: number; w: number } | null = null
  if (sel !== null) {
    const d = data[sel]
    const label = `${d.date} · ${formatAmount(d.total)}`
    const w = estimateTextWidth(label, 11) + 12
    const cx = MARGIN.left + sel * band + band / 2
    const barTop = d.total > 0 ? yOf(d.total) : MARGIN.top + PLOT_H - 2
    tooltip = {
      label,
      w,
      x: Math.min(Math.max(cx - w / 2, 2), W - w - 2),
      y: Math.max(barTop - 22, 2),
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full h-auto"
      role="img"
      aria-label={`Daily usage bar chart: ${data.length} days, peak ${formatAmount(peak)}`}
      onMouseLeave={() => setSelected(null)}
    >
      <title>Daily usage</title>
      <desc>Bar chart showing the total amount logged for each day in the selected range.</desc>
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
      {tickIndices(data.length).map((i) => {
        const edge = data.length > 8
        const anchor = edge && i === 0 ? 'start' : edge && i === data.length - 1 ? 'end' : 'middle'
        const tx =
          anchor === 'start'
            ? MARGIN.left + i * band
            : anchor === 'end'
              ? MARGIN.left + (i + 1) * band
              : MARGIN.left + i * band + band / 2
        return (
          <text
            key={i}
            x={tx}
            y={H - 3}
            textAnchor={anchor}
            fontSize={11}
            fill="var(--muted-foreground)"
          >
            {data[i].date}
          </text>
        )
      })}
      {data.map((d, i) => {
        const zero = d.total <= 0
        const barH = zero ? 2 : Math.max(PLOT_H * (d.total / yMax), 2)
        const bx = MARGIN.left + i * band
        return (
          <g key={i}>
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
            <path
              d={roundedTopRect(bx + (band - barW) / 2, MARGIN.top + PLOT_H - barH, barW, barH, 4)}
              fill={zero ? 'var(--muted)' : 'var(--primary)'}
              fillOpacity={zero ? 0.3 : 0.9}
            />
            <rect
              x={bx}
              y={MARGIN.top}
              width={band}
              height={PLOT_H}
              fill="transparent"
              onClick={() => setSelected(i)}
              onMouseEnter={() => setSelected(i)}
            >
              <title>{`${d.date}: ${formatAmount(d.total)}`}</title>
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
            height={18}
            rx={5}
            fill="var(--card)"
            stroke="var(--border)"
          />
          <text
            x={tooltip.x + tooltip.w / 2}
            y={tooltip.y + 9}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fill="var(--foreground)"
          >
            {tooltip.label}
          </text>
        </g>
      )}
    </svg>
  )
}
