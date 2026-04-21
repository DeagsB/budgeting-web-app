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
 * tangent estimate for control points.
 */
export function smoothPath(
  points: [number, number][],
  { tension = 0.35 }: { tension?: number } = {},
): string {
  if (points.length < 2) return ''
  const cps = points.map((_, i, a) => {
    const prev = a[Math.max(0, i - 1)]
    const next = a[Math.min(a.length - 1, i + 1)]
    return [(next[0] - prev[0]) * tension, (next[1] - prev[1]) * tension] as [number, number]
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

// Category ink + tint color tables. Ink is used on chips/badges; tint is the
// background surface behind the ink. Dark-mode tints are translucent so they
// blend with the paper surface.
export const CATEGORY_INK: Record<string, string> = {
  Groceries: '#10B981',
  Dining: '#EF4444',
  Transport: '#F59E0B',
  Housing: '#6366F1',
  Subscriptions: '#06B6D4',
  Savings: '#8B5CF6',
  Entertainment: '#EC4899',
  Health: '#14B8A6',
  Income: '#2E7D32',
  Utilities: '#6366F1',
}

export function categoryInk(name: string | null | undefined): string {
  if (!name) return 'var(--color-ink-2)'
  return CATEGORY_INK[name] ?? 'var(--color-ink-2)'
}

export function categoryTintLight(name: string | null | undefined): string {
  const map: Record<string, string> = {
    Groceries: '#E0EFDB',
    Dining: '#F6E0DB',
    Transport: '#FBEFD4',
    Housing: '#E0E0F5',
    Subscriptions: '#D8EFF5',
    Savings: '#E5DCF5',
    Entertainment: '#F8DDEC',
    Health: '#D4EFE9',
    Income: '#D4EACD',
    Utilities: '#E0E0F5',
  }
  return name ? (map[name] ?? 'var(--color-paper-2)') : 'var(--color-paper-2)'
}

export function categoryTintDark(name: string | null | undefined): string {
  const map: Record<string, string> = {
    Groceries: 'rgba(16,185,129,0.18)',
    Dining: 'rgba(239,68,68,0.18)',
    Transport: 'rgba(245,158,11,0.18)',
    Housing: 'rgba(99,102,241,0.20)',
    Subscriptions: 'rgba(6,182,212,0.18)',
    Savings: 'rgba(139,92,246,0.20)',
    Entertainment: 'rgba(236,72,153,0.18)',
    Health: 'rgba(20,184,166,0.18)',
    Income: 'rgba(46,125,50,0.22)',
    Utilities: 'rgba(99,102,241,0.20)',
  }
  return name ? (map[name] ?? 'rgba(255,255,255,0.07)') : 'rgba(255,255,255,0.07)'
}
