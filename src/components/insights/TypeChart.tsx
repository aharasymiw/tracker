import { useState } from 'react'
import { donutSegment } from '@/components/insights/chart-utils'

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

const SIZE = 176
const CENTER = SIZE / 2
const R_OUTER = 80
const R_INNER = 55
const PAD_ANGLE = 2

interface TypeChartProps {
  data: { type: string; total: number }[]
}

export function TypeChart({ data }: TypeChartProps) {
  const [selected, setSelected] = useState<number | null>(null)

  if (data.length === 0)
    return <p className="text-center text-sm text-muted-foreground py-8">No data</p>

  const total = data.reduce((s, d) => s + d.total, 0)
  const sel = selected !== null && selected < data.length ? selected : null

  const pad = data.length > 1 ? PAD_ANGLE : 0
  let angle = 0
  const segments = data.map((d, i) => {
    const sweep = total > 0 ? (d.total / total) * 360 : 0
    const seg = {
      ...d,
      color: COLORS[i % COLORS.length],
      start: angle + pad / 2,
      end: angle + sweep - pad / 2,
    }
    angle += sweep
    return seg
  })

  const ringR = (R_OUTER + R_INNER) / 2
  const ringW = R_OUTER - R_INNER
  const summary = data.map((d) => `${d.type} ${d.total.toFixed(1)}`).join(', ')

  return (
    <div>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto block w-full max-w-[200px] h-auto"
        role="img"
        aria-label={`By type donut chart: ${summary}`}
        onMouseLeave={() => setSelected(null)}
      >
        <title>Consumption by type</title>
        <desc>Donut chart showing each consumption type's share of the total amount.</desc>
        {total <= 0 && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={ringR}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={ringW}
            opacity={0.3}
          />
        )}
        {segments.map((seg, i) => {
          if (seg.end - seg.start <= 0) return null
          const full = seg.end - seg.start >= 359.99
          return (
            <g
              key={seg.type}
              opacity={sel === null || sel === i ? 1 : 0.4}
              onClick={() => setSelected(i)}
              onMouseEnter={() => setSelected(i)}
            >
              {full ? (
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={ringR}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={ringW}
                />
              ) : (
                <path
                  d={donutSegment(CENTER, CENTER, R_OUTER, R_INNER, seg.start, seg.end)}
                  fill={seg.color}
                />
              )}
              <title>{`${seg.type}: ${seg.total.toFixed(1)}`}</title>
            </g>
          )
        })}
        {sel !== null ? (
          <>
            <text
              x={CENTER}
              y={CENTER - 12}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted-foreground)"
            >
              {data[sel].type}
            </text>
            <text
              x={CENTER}
              y={CENTER + 8}
              textAnchor="middle"
              fontSize={18}
              fontWeight={700}
              fill="var(--foreground)"
            >
              {data[sel].total.toFixed(1)}
            </text>
          </>
        ) : (
          <text
            x={CENTER}
            y={CENTER}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={18}
            fontWeight={700}
            fill="var(--foreground)"
          >
            {total.toFixed(1)}
          </text>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {data.map((d, i) => (
          <button
            key={d.type}
            type="button"
            className="flex items-center gap-1.5 text-xs"
            style={{ color: COLORS[i % COLORS.length] }}
            onClick={() => setSelected(sel === i ? null : i)}
          >
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            {d.type}
          </button>
        ))}
      </div>
    </div>
  )
}
