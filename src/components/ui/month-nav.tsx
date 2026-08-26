import type { HTMLAttributes } from 'react'
import Link from 'next/link'
import { addMonths, monthLabel, monthStartISO } from '@/lib/format'

/**
 * Link-based month navigator (prev / label / next + "This month").
 *
 * Built from `<Link>`s so it works inside server components that read the
 * current month from `searchParams` — navigation is a URL change, no client
 * state. `makeHref` maps a `YYYY-MM-01` string to the href for that month.
 *
 * The "This month" pill renders only when the viewed month isn't already the
 * current one, so it can't get stuck in a permanently-highlighted state.
 */
export function MonthNav({
  monthISO,
  makeHref,
  className = '',
  ...rest
}: {
  monthISO: string
  makeHref: (iso: string) => string
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>) {
  const prevISO = addMonths(monthISO, -1)
  const nextISO = addMonths(monthISO, 1)
  const current = monthStartISO()
  const isCurrent = monthISO === current

  return (
    <div className={`flex items-center gap-1 ${className}`} {...rest}>
      <Link
        href={makeHref(prevISO)}
        aria-label={`Go to ${monthLabel(prevISO)}`}
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-paper-2"
      >
        <span aria-hidden className="text-[20px] leading-none">
          ‹
        </span>
      </Link>

      <span className="min-w-[140px] text-center font-serif text-[16px] tracking-[-0.01em] text-ink">
        {monthLabel(monthISO)}
      </span>

      <Link
        href={makeHref(nextISO)}
        aria-label={`Go to ${monthLabel(nextISO)}`}
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-paper-2"
      >
        <span aria-hidden className="text-[20px] leading-none">
          ›
        </span>
      </Link>

      {isCurrent ? (
        <span
          aria-hidden
          className="ml-1 inline-flex min-h-[44px] items-center rounded-full border border-hair px-3 py-1.5 text-[12px] font-semibold text-ink-3 opacity-50"
        >
          This month
        </span>
      ) : (
        <Link
          href={makeHref(current)}
          className="ml-1 inline-flex min-h-[44px] items-center rounded-full border border-hair px-3 py-1.5 text-[12px] font-semibold text-ink-2 transition-colors hover:bg-paper-2"
        >
          This month
        </Link>
      )}
    </div>
  )
}
