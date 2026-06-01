import type { HTMLAttributes, ReactNode } from 'react'
import { MapleLabel } from '@/components/ui/label'

/**
 * Compact stat tile used in stat-grids across screens. Replaces the divergent
 * local Tile/StatTile copies. Pass `progress` (0..1) to render a progress bar.
 */
export function StatTile({
  label,
  value,
  tone = 'ink',
  hint,
  foot,
  progress,
  className = '',
  ...rest
}: {
  label: string
  value: ReactNode
  tone?: 'ink' | 'leaf' | 'maple'
  hint?: string
  foot?: ReactNode
  progress?: number
} & HTMLAttributes<HTMLDivElement>) {
  const toneClass =
    tone === 'leaf' ? 'text-leaf' : tone === 'maple' ? 'text-maple' : 'text-ink'

  const clamped =
    progress == null ? null : Math.min(1, Math.max(0, progress))

  return (
    <div
      className={`flex flex-col gap-1 rounded-md border border-hair bg-paper p-4 ${className}`}
      {...rest}
    >
      <MapleLabel>{label}</MapleLabel>
      <div className={`font-serif text-[22px] sm:text-[26px] tabular-nums leading-none ${toneClass}`}>
        {value}
      </div>
      {hint != null && <div className="text-[12px] text-ink-3">{hint}</div>}
      {clamped != null && (
        <div className="mt-1 h-1.5 w-full rounded-full bg-cream-2">
          <div
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={1}
            className="h-full rounded-full bg-leaf"
            style={{ width: `${clamped * 100}%` }}
          />
        </div>
      )}
      {foot != null && <div className="text-[12px] text-ink-2">{foot}</div>}
    </div>
  )
}
