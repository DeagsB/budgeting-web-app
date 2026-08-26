import type { HTMLAttributes, ReactNode } from 'react'

/**
 * Maple wide-table wrapper. Enforces the mobile rule that the *page* never
 * scrolls horizontally: the table sets its own `min-width` and scrolls inside
 * the `overflow-x-auto` wrapper. The global `.hide-scroll` class suppresses the
 * scrollbar chrome so the horizontal scroll stays invisible until used.
 *
 * `overflow-y-hidden` is deliberate: CSS resolves the cross axis of an
 * `overflow-x: auto` box to `auto` as well, so without it a stray pixel of
 * vertical overflow lets the rail drift up and down under a touch drag.
 * Every horizontal scroller in the app pins the cross axis this way.
 *
 * Callers supply their own `<thead>` / `<tbody>`. Expected styling:
 *   thead: text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3 bg-cream-2
 *   tbody rows: border-t border-hair
 *
 * Server component (presentational only).
 */
export function DataTable({
  minWidth = 640,
  children,
  className = '',
  ...rest
}: {
  minWidth?: number
  children: ReactNode
} & Omit<HTMLAttributes<HTMLTableElement>, 'children'>) {
  return (
    <div className="overflow-x-auto overflow-y-hidden -mx-1 hide-scroll">
      <table
        className={`w-full border-collapse text-[13px] ${className}`}
        style={{ minWidth }}
        {...rest}
      >
        {children}
      </table>
    </div>
  )
}
