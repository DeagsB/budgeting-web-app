'use client'

import { useMemo, useState } from 'react'
import { formatMoney, formatMoneySigned, monthLabel } from '@/lib/format'
import { smoothPath, seriesToPoints } from '@/lib/maple'
import { MapleLabel } from '@/components/ui/label'
import { useCountUp } from '@/components/ui/count-up'

export type NetWorthPoint = { month: string; net: number; assets: number; liabilities: number }

/**
 * Net-worth hero + trend chart. Client component so the chart can be scrubbed:
 * dragging across it picks a month, which drives the big <CountUp> figure and
 * the contextual delta line. When not scrubbing, the figure animates up to the
 * latest value and the delta shows the gated year-over-year change (or nothing
 * when there isn't enough real history to compute one).
 *
 * The chart is a smoothed bezier (smoothPath) over the trail with faint
 * horizontal gridlines and a dashed zero baseline. The viewBox is taller on
 * mobile so the curve reads on a 375px screen, and an sr-only data table mirrors
 * every point for screen-reader users.
 */
export function NetWorthHero({
  trail,
  yoy,
  yoyFromLabel,
}: {
  trail: NetWorthPoint[]
  /** Year-over-year delta in cents, or null when there isn't ≥13 months of real data. */
  yoy: number | null
  /** Label of the month the YoY delta is measured from (e.g. "June 2025"). */
  yoyFromLabel: string | null
}) {
  const [scrubIdx, setScrubIdx] = useState<number | null>(null)

  const latest = trail[trail.length - 1]
  // Count up from last month's figure rather than from zero, so the first
  // frame is already a plausible number instead of "$0.00".
  const previous = trail.length > 1 ? trail[trail.length - 2] : latest
  const animatedNet = useCountUp(latest.net, { duration: 1100, from: previous.net })

  // Chart geometry. preserveAspectRatio="none" stretches the viewBox to the
  // container, so the taller mobile viewBox just gives the curve more vertical
  // room on narrow screens.
  const W = 640
  const H = 200
  const values = useMemo(() => trail.map((t) => t.net), [trail])
  const points = useMemo(() => seriesToPoints(values, W, H, { pad: 14 }), [values])
  const linePath = useMemo(() => smoothPath(points), [points])
  const areaPath =
    points.length > 1
      ? `${linePath} L${points[points.length - 1][0]},${H} L${points[0][0]},${H} Z`
      : ''

  // Faint gridlines: four evenly-spaced horizontals plus the dashed zero line
  // where v = 0 falls inside the value range.
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const yOf = (v: number) => H - 14 - ((v - min) / span) * (H - 28)
  const zeroY = yOf(0)
  const gridYs = [0.25, 0.5, 0.75].map((f) => 14 + f * (H - 28))

  const handleScrub = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setScrubIdx(Math.round(xFrac * (trail.length - 1)))
  }

  const scrubPoint = scrubIdx !== null ? trail[scrubIdx] : null
  const displayedValue = scrubPoint ? scrubPoint.net : animatedNet
  const negative = displayedValue < 0

  return (
    <section className="rounded-xl border border-hair bg-cream-2 p-6 shadow-[var(--shadow-card)] md:p-8">
      <MapleLabel>{scrubPoint ? monthLabel(scrubPoint.month) : 'Today'}</MapleLabel>

      <div
        className={`mt-2 font-serif text-[48px] leading-none tracking-[-0.03em] tabular-nums md:text-[64px] ${
          negative ? 'text-maple' : 'text-ink'
        }`}
      >
        {negative ? '−' : ''}
        {formatMoney(Math.abs(displayedValue))}
      </div>

      {/* Contextual delta line. While scrubbing it shows that month's split;
          at rest it shows the gated YoY change, or a "building history" note
          when there isn't enough real data to compute one. */}
      <div className="mt-3 flex items-baseline gap-2 text-[13.5px]">
        {scrubPoint ? (
          <span className="text-ink-2">
            Assets {formatMoney(scrubPoint.assets)} · liabilities{' '}
            {formatMoney(scrubPoint.liabilities)}
          </span>
        ) : yoy !== null ? (
          <>
            <span
              className={`font-serif text-[18px] tabular-nums ${
                yoy >= 0 ? 'text-leaf' : 'text-maple'
              }`}
            >
              {formatMoneySigned(yoy, { plus: true })}
            </span>
            <span className="text-ink-3">vs {yoyFromLabel}</span>
          </>
        ) : (
          <span className="text-ink-3">Building a year of history…</span>
        )}
      </div>

      {/* Trend chart */}
      <div className="mt-5 -mx-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-[180px] w-full cursor-crosshair touch-none sm:h-[200px]"
          role="img"
          aria-label="Net worth trend over the last 24 months"
          onPointerDown={handleScrub}
          onPointerMove={(e) => {
            if (e.buttons === 1 || e.pointerType === 'touch') handleScrub(e)
          }}
          onPointerLeave={() => setScrubIdx(null)}
          onPointerUp={() => setScrubIdx(null)}
        >
          <defs>
            <linearGradient id="nwFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-leaf)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-leaf)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          {gridYs.map((gy) => (
            <line
              key={gy}
              x1={0}
              x2={W}
              y1={gy}
              y2={gy}
              stroke="var(--color-hair)"
              strokeWidth="1"
            />
          ))}
          {/* Dashed zero baseline */}
          <line
            x1={0}
            x2={W}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--color-hair)"
            strokeDasharray="3 4"
            strokeWidth="1.5"
          />

          {areaPath && <path d={areaPath} fill="url(#nwFill)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="var(--color-leaf)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Scrub indicator, or the endpoint dot at rest */}
          {scrubIdx !== null && points[scrubIdx] ? (
            <g>
              <line
                x1={points[scrubIdx][0]}
                x2={points[scrubIdx][0]}
                y1={0}
                y2={H}
                stroke="var(--color-leaf)"
                strokeOpacity="0.5"
                strokeDasharray="2 3"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={points[scrubIdx][0]}
                cy={points[scrubIdx][1]}
                r="6"
                fill="var(--color-leaf)"
                stroke="var(--color-cream-2)"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : (
            points.length > 0 && (
              <circle
                cx={points[points.length - 1][0]}
                cy={points[points.length - 1][1]}
                r="5"
                fill="var(--color-cream-2)"
                stroke="var(--color-leaf)"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            )
          )}
        </svg>
      </div>

      {/* Accessible mirror of the chart data. */}
      <table className="sr-only">
        <caption>Net worth by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Net worth</th>
            <th scope="col">Assets</th>
            <th scope="col">Liabilities</th>
          </tr>
        </thead>
        <tbody>
          {trail.map((t) => (
            <tr key={t.month}>
              <th scope="row">{monthLabel(t.month)}</th>
              <td>{formatMoney(t.net)}</td>
              <td>{formatMoney(t.assets)}</td>
              <td>{formatMoney(t.liabilities)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
