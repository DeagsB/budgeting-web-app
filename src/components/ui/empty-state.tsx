import type { ReactNode } from 'react'

/**
 * First-run / no-data placeholder. A centered, dashed-border card used across
 * dashboard and report screens in place of ad-hoc empty cards. Presentational
 * only - callers pass an optional icon, body copy, and an action node (e.g. a
 * <Button> or styled <Link>).
 */
export function EmptyState({
  title,
  body,
  icon,
  action,
  className = '',
}: {
  title: string
  body?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-lg border border-dashed border-hair bg-paper px-6 py-10 text-center ${className}`}
    >
      {icon ? <div className="mb-1 text-ink-3">{icon}</div> : null}
      <div className="font-serif text-[18px] tracking-[-0.01em] text-ink">{title}</div>
      {body ? (
        <p className="max-w-[420px] text-[13.5px] leading-relaxed text-ink-2">{body}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
