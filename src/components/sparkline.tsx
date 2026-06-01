// Lightweight SVG line chart for trend visualisation — no external deps.
// Renders a responsive line chart with optional area fill, x-axis labels, and
// value readouts on hover (via CSS tooltip). Designed for tiny dashboards
// rather than interactive analytics.

import { formatMoney } from '@/lib/format'
import { gridlines as gridlineYs, smoothPath as smoothPathOf } from '@/lib/maple'

export type SparklinePoint = {
  label: string
  value: number
}

export function Sparkline({
  points,
  height = 120,
  color = 'currentColor',
  fill = false,
  showAxis = true,
  smoothPath = false,
  gridlines = false,
  ariaLabel,
}: {
  points: SparklinePoint[]
  height?: number
  color?: string
  fill?: boolean
  showAxis?: boolean
  /** Draw the line as a smoothed cubic-Bezier curve instead of straight segments. */
  smoothPath?: boolean
  /** Render faint evenly-spaced horizontal gridlines behind the series. */
  gridlines?: boolean
  ariaLabel?: string
}) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded border border-dashed border-hair bg-paper-2 text-xs text-ink-3"
        style={{ height }}
      >
        No data yet
      </div>
    )
  }

  const width = 600 // internal viewBox; scales via CSS
  const padding = { top: 12, right: 12, bottom: showAxis ? 24 : 8, left: 8 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const vals = points.map((p) => p.value)
  const minV = Math.min(...vals, 0)
  const maxV = Math.max(...vals, 0)
  const range = maxV - minV || 1

  const xStep = points.length === 1 ? 0 : innerW / (points.length - 1)
  const xs = points.map((_, i) => padding.left + i * xStep)
  const ys = points.map((p) => padding.top + innerH - ((p.value - minV) / range) * innerH)

  const coords: [number, number][] = xs.map((x, i) => [x, ys[i]])

  const line =
    smoothPath && coords.length > 1
      ? smoothPathOf(coords)
      : coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')

  const areaPath = `${line} L ${xs[xs.length - 1].toFixed(2)} ${(
    padding.top +
    innerH
  ).toFixed(2)} L ${xs[0].toFixed(2)} ${(padding.top + innerH).toFixed(2)} Z`

  // Zero baseline
  const zeroY = padding.top + innerH - ((0 - minV) / range) * innerH

  const gridYs = gridlines
    ? gridlineYs(innerH, { count: 3, pad: 0 }).map((y) => padding.top + y)
    : []

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      role="img"
      aria-label={ariaLabel}
      style={{ color }}
    >
      {gridYs.map((y, i) => (
        <line
          key={`grid-${i}`}
          x1={padding.left}
          x2={padding.left + innerW}
          y1={y}
          y2={y}
          stroke="currentColor"
          strokeOpacity="0.08"
        />
      ))}
      {minV < 0 && maxV > 0 && (
        <line
          x1={padding.left}
          x2={padding.left + innerW}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeDasharray="3 3"
        />
      )}
      {fill && (
        <path d={areaPath} fill="currentColor" opacity={0.12} />
      )}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={xs[i]} cy={ys[i]} r={3} fill="currentColor">
            <title>{`${p.label}: ${formatMoney(p.value)}`}</title>
          </circle>
          {showAxis && i % Math.max(1, Math.floor(points.length / 6)) === 0 && (
            <text
              x={xs[i]}
              y={height - 6}
              textAnchor="middle"
              fontSize={10}
              fill="currentColor"
              opacity={0.6}
            >
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
