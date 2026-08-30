// Maple design-system helpers: formatters, smoothed SVG paths, and category
// color maps. Keep these deterministic (pure) so they can run on the server.

export function fmtCADshort(cents: number): string {
  const n = cents / 100
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000) return `$${(n / 1000).toFixed(1)}K`
  if (abs >= 1000) return `$${(n / 1000).toFixed(2)}K`
  return `$${n.toFixed(0)}`
}

export function fmtSignCAD(cents: number): string {
  const abs = Math.abs(cents)
  const s = new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs / 100)
  return cents >= 0 ? `+${s}` : `−${s}`
}

/**
 * Maps a sequence of y-values to [x, y] SVG coordinates in a [w, h] box.
 * `pad` keeps the curve from hitting the edges so the stroke isn't clipped.
 */
export function seriesToPoints(
  values: number[],
  w: number,
  h: number,
  { pad = 4 }: { pad?: number } = {},
): [number, number][] {
  if (values.length === 0) return []
  if (values.length === 1) return [[w / 2, h / 2]]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (w - pad * 2) / (values.length - 1)
  return values.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)])
}

/**
 * Smooth cubic-Bezier path through the given points. Uses a Catmull-Rom-style
 * tangent estimate for control points, with the tangent flattened at every
 * local peak and trough so the curve never leaves the data's own y-range.
 *
 * Without that flattening a step up to a new plateau (a big deposit landing in
 * a net-worth trail) overshoots its own maximum by more than the chart's pad
 * and the peak gets sliced off by the top of the viewBox. Zeroing the vertical
 * tangent where the series turns is the Fritsch-Carlson monotone rule, and it
 * keeps the curve smooth everywhere it is genuinely rising or falling.
 */
export function smoothPath(
  points: [number, number][],
  { tension = 0.35 }: { tension?: number } = {},
): string {
  if (points.length < 2) return ''
  const cps = points.map((_, i, a) => {
    const prev = a[Math.max(0, i - 1)]
    const next = a[Math.min(a.length - 1, i + 1)]
    const rising = a[i][1] - prev[1]
    const falling = next[1] - a[i][1]
    // <= 0 covers a turn, a flat shoulder, and both endpoints (where prev or
    // next is the point itself) - all the places an overshoot starts.
    const turns = rising * falling <= 0
    return [
      (next[0] - prev[0]) * tension,
      turns ? 0 : (next[1] - prev[1]) * tension,
    ] as [number, number]
  })
  let d = `M${points[0][0]},${points[0][1]}`
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const [cp0x, cp0y] = cps[i - 1]
    const [cp1x, cp1y] = cps[i]
    d += ` C${x0 + cp0x},${y0 + cp0y} ${x1 - cp1x},${y1 - cp1y} ${x1},${y1}`
  }
  return d
}

/**
 * Evenly-spaced horizontal gridline y-coordinates across a [0, h] box (inset by
 * `pad` top and bottom so lines don't sit on the frame). Returns `count` inner
 * lines - the outer edges are intentionally omitted. Pure + deterministic.
 */
export function gridlines(
  h: number,
  { count = 3, pad = 4 }: { count?: number; pad?: number } = {},
): number[] {
  if (count < 1) return []
  const top = pad
  const bottom = h - pad
  const step = (bottom - top) / (count + 1)
  return Array.from({ length: count }, (_, i) => top + step * (i + 1))
}
