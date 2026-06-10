// Shared math helpers for the hand-rolled SVG insight charts (recharts replacements)

/** Round to 2 decimals to keep generated SVG attribute values compact */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Integer "nice" y-axis ticks from 0 up to just above maxValue.
 * Step is 1/2/5 x 10^k (minimum 1), mirroring recharts' allowDecimals={false}.
 */
export function niceTicks(maxValue: number, targetCount = 4): number[] {
  const max = Math.max(maxValue, 1)
  const rawStep = max / targetCount
  const pow = 10 ** Math.floor(Math.log10(rawStep))
  let step = pow * 10
  for (const m of [1, 2, 5]) {
    if (m * pow >= rawStep) {
      step = m * pow
      break
    }
  }
  step = Math.max(Math.round(step), 1)
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  return ticks
}

/** Path for a bar with rounded top corners (radius clamps to fit thin/short bars) */
export function roundedTopRect(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.min(radius, w / 2, h)
  const right = r2(x + w)
  const bottom = r2(y + h)
  return [
    `M${r2(x)},${bottom}`,
    `L${r2(x)},${r2(y + r)}`,
    `Q${r2(x)},${r2(y)} ${r2(x + r)},${r2(y)}`,
    `L${r2(right - r)},${r2(y)}`,
    `Q${right},${r2(y)} ${right},${r2(y + r)}`,
    `L${right},${bottom}`,
    'Z',
  ].join(' ')
}

/** Point on a circle; 0 degrees is 12 o'clock, increasing clockwise */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [r2(cx + r * Math.cos(rad)), r2(cy + r * Math.sin(rad))]
}

/** Path for one donut segment between two angles (degrees, clockwise from 12 o'clock) */
export function donutSegment(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number
): string {
  const large = endDeg - startDeg > 180 ? 1 : 0
  const [ox1, oy1] = polar(cx, cy, rOuter, startDeg)
  const [ox2, oy2] = polar(cx, cy, rOuter, endDeg)
  const [ix1, iy1] = polar(cx, cy, rInner, endDeg)
  const [ix2, iy2] = polar(cx, cy, rInner, startDeg)
  return (
    `M${ox1},${oy1} A${rOuter},${rOuter} 0 ${large} 1 ${ox2},${oy2} ` +
    `L${ix1},${iy1} A${rInner},${rInner} 0 ${large} 0 ${ix2},${iy2} Z`
  )
}

/** Display formatting for amounts: integers stay bare, fractions get one decimal */
export function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** Rough text width in SVG user units, for sizing tooltip boxes without measuring */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.62
}
