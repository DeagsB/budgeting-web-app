'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { nextMonthStartISO } from '@/lib/dates'

type CountContextValue = {
  /** This month's uncategorized count, live-decremented as rows get sorted. */
  thisMonth: number
  /** Uncategorized count from every earlier month; only moves when a transfer is unlinked. */
  earlier: number
  earlierHref: string
  /** Called by a row (row.tsx) the instant its own quick-categorize save lands. */
  markCategorized: (id: string) => void
  /**
   * Called by a row after "Not a transfer" lands with the legs that are
   * uncategorized again. Each is added back to this month's or the earlier
   * count by its own date - the counterpart leg can sit in another month.
   */
  markRequeued: (rows: { id: string; occurred_on: string }[]) => void
}

const UncategorizedCountContext = createContext<CountContextValue | null>(null)

/**
 * Reads the shared "still uncategorized" counter. Returns null outside a
 * Provider (e.g. the household-wide `?scope=uncategorized` list doesn't
 * render one - see page.tsx) so callers should always optional-chain it.
 */
export function useUncategorizedCount() {
  return useContext(UncategorizedCountContext)
}

/**
 * Owns the client-side "how many are left" state for the household's
 * to-categorize pile. Seeded once from the server's counts and only ever
 * moved locally, via `markCategorized` (one-way decrement) and
 * `markRequeued` (an explicit increment after "Not a transfer") - never
 * resynced from a later prop, so an automatic Next.js refresh landing
 * mid-session can't double-subtract an id this component already cleared.
 * Pass a fresh `key` (page.tsx keys it by month) when the underlying page
 * truly changes, to reset the baseline instead of carrying stale local
 * state across it.
 *
 * `children` are the already-rendered rows/sections (a Server Component
 * subtree) - wrapping them in this client Provider is what lets a client-only
 * row deep inside call `markCategorized` without lifting the whole list into
 * client state.
 */
export function UncategorizedCountProvider({
  month,
  initialThisMonth,
  earlier: initialEarlier,
  earlierHref,
  countedIds,
  children,
}: {
  /** `YYYY-MM-01` of the month in view, so a requeued leg lands in the right bucket. */
  month: string
  initialThisMonth: number
  earlier: number
  earlierHref: string
  /** The ids behind the two server counts, so a requeue never counts a row twice. */
  countedIds: string[]
  children: ReactNode
}) {
  const [thisMonth, setThisMonth] = useState(initialThisMonth)
  const [earlier, setEarlier] = useState(initialEarlier)
  const clearedRef = useRef<Set<string>>(new Set())
  // Rows the counts already include. Seeded from the server like the counts
  // themselves (never resynced, same reason); a requeue adds to it.
  const countedRef = useRef<Set<string>>(new Set(countedIds))

  const markCategorized = useCallback((id: string) => {
    if (clearedRef.current.has(id)) return
    clearedRef.current.add(id)
    setThisMonth((n) => Math.max(0, n - 1))
  }, [])

  // A requeued leg is uncategorized again, so a later chip tap on it must
  // count once more: forget it in `clearedRef` as well as bumping the count.
  // A leg that was still in the baseline count (it was paired after this
  // page loaded and never cleared here) is already counted: skip it.
  const markRequeued = useCallback(
    (rows: { id: string; occurred_on: string }[]) => {
      const nextMonth = nextMonthStartISO(month)
      let inMonth = 0
      let before = 0
      for (const r of rows) {
        const alreadyCounted = countedRef.current.has(r.id) && !clearedRef.current.has(r.id)
        clearedRef.current.delete(r.id)
        countedRef.current.add(r.id)
        if (alreadyCounted) continue
        if (r.occurred_on >= month && r.occurred_on < nextMonth) inMonth++
        else before++
      }
      if (inMonth > 0) setThisMonth((n) => n + inMonth)
      if (before > 0) setEarlier((n) => n + before)
    },
    [month],
  )

  const value = useMemo(
    () => ({ thisMonth, earlier, earlierHref, markCategorized, markRequeued }),
    [thisMonth, earlier, earlierHref, markCategorized, markRequeued],
  )

  return <UncategorizedCountContext.Provider value={value}>{children}</UncategorizedCountContext.Provider>
}

/**
 * "N to categorize - M from earlier months" header line. Renders nothing
 * once there's nothing left to do. Must be mounted under
 * `UncategorizedCountProvider`.
 */
export function UncategorizedCountLine() {
  const ctx = useUncategorizedCount()
  if (!ctx) return null
  const { thisMonth, earlier, earlierHref } = ctx
  if (thisMonth === 0 && earlier === 0) return null

  return (
    <p className="text-[13.5px] text-ink-2">
      {thisMonth > 0 ? (
        <span className="font-semibold text-ink">
          {thisMonth} to categorize
        </span>
      ) : (
        <span className="font-semibold text-ink">All caught up this month</span>
      )}
      {earlier > 0 && (
        <>
          {' - '}
          <Link href={earlierHref} className="font-semibold text-leaf underline underline-offset-2">
            {earlier} from earlier months
          </Link>
        </>
      )}
    </p>
  )
}
