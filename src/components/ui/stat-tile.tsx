import type { HTMLAttributes, ReactNode } from 'react'
import { MapleLabel } from '@/components/ui/label'

/**
 * Compact stat tile used in stat-grids across screens. Replaces the divergent
 * local Tile/StatTile copies. Pass `progress` (0..1) to render a progress bar.
 *
 * `compact` shrinks the label, value and padding so three tiles fit side by
 * side on a 375px screen (`<div className="grid grid-cols-3 gap-2">`).
 */
export function StatTile({
  label,
  value,
  tone = 'ink',
  hint,
  foot,
  progress,
  compact = false,
  className = '',
  ...rest
}: {
  label: string
  value: ReactNode
  tone?: 'ink' | 'leaf' | 'maple'
  hint?: string
  foot?: ReactNode
  progress?: number
  compact?: boolean
} & HTMLAttributes<HTMLDivElement>) {
  const toneClass =
    tone === 'leaf' ? 'text-leaf' : tone === 'maple' ? 'text-maple' : 'text-ink'

  const clamped =
    progress == null ? null : Math.min(1, Math.max(0, progress))

  return (
    <div
      className={`flex min-w-0 flex-col rounded-md border border-hair bg-paper ${
        compact ? 'gap-0.5 px-3 py-2.5' : 'gap-1 p-4'
      } ${className}`}
      {...rest}
    >
      {compact ? (
        <div className="truncate text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
          {label}
        </div>
      ) : (
        <MapleLabel>{label}</MapleLabel>
      )}
      <div
        className={`truncate font-serif tabular-nums leading-none ${toneClass} ${
          compact ? 'text-[20px]' : 'text-[22px] sm:text-[26px]'
        }`}
      >
        {value}
      </div>
      {hint != null && (
        <div className={`text-ink-3 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>{hint}</div>
      )}
      {clamped != null && (
        <div className={`h-1.5 w-full rounded-full bg-cream-2 ${compact ? 'mt-0.5' : 'mt-1'}`}>
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
      {foot != null && (
        <div className={`text-ink-2 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>{foot}</div>
      )}
    </div>
  )
}
