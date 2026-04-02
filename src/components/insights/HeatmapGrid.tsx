const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night']

interface HeatmapGridProps {
  data: number[][] // [4 periods][7 days]
}

export function HeatmapGrid({ data }: HeatmapGridProps) {
  const max = Math.max(...data.flat(), 1)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[280px]">
        {/* Day headers */}
        <div className="grid grid-cols-8 gap-1 mb-1">
          <div /> {/* spacer for period labels */}
          {DAYS.map((d) => (
            <div key={d} className="text-center text-[10px] text-muted-foreground font-medium">
              {d}
            </div>
          ))}
        </div>
        {/* Grid rows */}
        {data.map((row, periodIdx) => (
          <div key={periodIdx} className="grid grid-cols-8 gap-1 mb-1">
            <div className="text-[10px] text-muted-foreground flex items-center">
              {PERIODS[periodIdx]}
            </div>
            {row.map((val, dayIdx) => {
              const intensity = val / max
              return (
                <div
                  key={dayIdx}
                  title={`${PERIODS[periodIdx]} ${DAYS[dayIdx]}: ${val.toFixed(1)}`}
                  className="rounded aspect-square"
                  style={{
                    backgroundColor:
                      val === 0
                        ? 'var(--muted)'
                        : `color-mix(in srgb, var(--primary) ${Math.round(intensity * 80 + 20)}%, transparent)`,
                    opacity: val === 0 ? 0.3 : 1,
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
