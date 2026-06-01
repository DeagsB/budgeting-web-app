'use client'

import { Card } from '@/components/ui/card'
import { MapleLabel } from '@/components/ui/label'
import { CountUp } from '@/components/ui/count-up'
import { formatMoney } from '@/lib/format'

/**
 * "Overall" progress summary across every active goal. The headline totals
 * count up on mount; the bar exposes `role="progressbar"` for assistive tech.
 */
export function OverallCard({
  activeCount,
  totalSaved,
  totalTarget,
}: {
  activeCount: number
  totalSaved: number
  totalTarget: number
}) {
  const overallPct =
    totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0
  const remaining = Math.max(0, totalTarget - totalSaved)

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <MapleLabel>Overall</MapleLabel>
        <span className="text-[10.5px] tabular-nums text-ink-3">{activeCount} active</span>
      </div>
      <div className="mt-1.5 font-serif text-[28px] leading-tight tracking-[-0.02em] tabular-nums text-ink md:text-[34px]">
        <CountUp value={totalSaved} format={formatMoney} />
        <span className="text-ink-3"> of {formatMoney(totalTarget)}</span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-paper-2">
        <div
          role="progressbar"
          aria-valuenow={overallPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Overall goal progress"
          className="h-full rounded-full bg-leaf transition-all duration-300"
          style={{ width: `${overallPct}%` }}
        />
      </div>
      <div className="mt-2 text-[12px] text-ink-3">
        {overallPct}% there · {formatMoney(remaining)} remaining
      </div>
    </Card>
  )
}
