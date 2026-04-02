interface ProgressRingProps {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  label?: string
  sublabel?: string
}

export function ProgressRing({
  value,
  size = 100,
  strokeWidth = 8,
  label,
  sublabel,
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const clampedValue = Math.min(value, 100)
  const dash = (clampedValue / 100) * circumference

  const color =
    value <= 80 ? 'var(--primary)' : value <= 100 ? 'var(--accent)' : 'var(--destructive)'

  return (
    <div
      className="relative inline-flex flex-col items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
          opacity={0.3}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      {(label || sublabel) && (
        <div className="absolute flex flex-col items-center">
          {label && <span className="text-lg font-bold leading-tight">{label}</span>}
          {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
        </div>
      )}
    </div>
  )
}
