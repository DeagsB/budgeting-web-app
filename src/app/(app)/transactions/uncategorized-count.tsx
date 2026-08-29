'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'

type CountContextValue = {
  /** This month's uncategorized count, live-decremented as rows get sorted. */
  thisMonth: number
  /** Uncategorized count from every earlier month - static for this page load. */
  earlier: number
  earlierHref: string
  /** Called by a row (row.tsx) the instant its own quick-categorize save lands. */
  markCategorized: (id: string) => void
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
 * decremented locally via `markCategorized` - never resynced from a later
 * prop, so an automatic Next.js refresh landing mid-session can't double-
 * subtract an id this component already cleared. Pass a fresh `key` (page.tsx
 * keys it by month) when the underlying page truly changes, to reset the
 * baseline instead of carrying stale local state across it.
 *
 * `children` are the already-rendered rows/sections (a Server Component
 * subtree) - wrapping them in this client Provider is what lets a client-only
 * row deep inside call `markCategorized` without lifting the whole list into
 * client state.
 */
export function UncategorizedCountProvider({
  initialThisMonth,
  earlier,
  earlierHref,
  children,
}: {
  initialThisMonth: number
  earlier: number
  earlierHref: string
  children: ReactNode
}) {
  const [thisMonth, setThisMonth] = useState(initialThisMonth)
  const clearedRef = useRef<Set<string>>(new Set())

  const markCategorized = useCallback((id: string) => {
    if (clearedRef.current.has(id)) return
    clearedRef.current.add(id)
    setThisMonth((n) => Math.max(0, n - 1))
  }, [])

  const value = useMemo(
    () => ({ thisMonth, earlier, earlierHref, markCategorized }),
    [thisMonth, earlier, earlierHref, markCategorized],
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
