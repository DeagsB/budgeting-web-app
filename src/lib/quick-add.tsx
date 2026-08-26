'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Global "+" (quick add) wiring.
 *
 * The mobile tab bar owns a single centre "+" button. Screens that host an
 * add-transaction sheet register a handler with `useQuickAddTarget`; tapping
 * "+" opens that sheet in place. Anywhere else, "+" routes to the transactions
 * page with `?add=1`, which opens its sheet on arrival.
 */

type Handler = () => void

type QuickAddApi = {
  /** Fire the quick-add action (open a registered sheet, else navigate). */
  trigger: () => void
  /** Register the current screen's handler; returns an unregister fn. */
  register: (fn: Handler) => () => void
}

const QuickAddContext = createContext<QuickAddApi | null>(null)

/** Route the "+" falls back to when no screen has registered a handler. */
export const QUICK_ADD_FALLBACK = '/transactions?add=1'

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const handlerRef = useRef<Handler | null>(null)

  const register = useCallback((fn: Handler) => {
    handlerRef.current = fn
    return () => {
      if (handlerRef.current === fn) handlerRef.current = null
    }
  }, [])

  const trigger = useCallback(() => {
    if (handlerRef.current) handlerRef.current()
    else router.push(QUICK_ADD_FALLBACK)
  }, [router])

  const api = useMemo<QuickAddApi>(() => ({ trigger, register }), [trigger, register])

  return <QuickAddContext.Provider value={api}>{children}</QuickAddContext.Provider>
}

/** Read the quick-add trigger (used by the tab bar). */
export function useQuickAdd(): QuickAddApi {
  const api = useContext(QuickAddContext)
  if (!api) throw new Error('useQuickAdd must be used inside <QuickAddProvider>')
  return api
}

/**
 * Register this screen as the "+" target for as long as it is mounted.
 * Pass `null` to opt out (e.g. when the screen has nothing to add to).
 * The latest `fn` is always the one invoked, without re-registering on
 * every render.
 */
export function useQuickAddTarget(fn: Handler | null) {
  const api = useContext(QuickAddContext)
  const fnRef = useRef<Handler | null>(null)
  useEffect(() => {
    fnRef.current = fn
  }, [fn])
  const enabled = !!fn
  useEffect(() => {
    if (!api || !enabled) return
    return api.register(() => fnRef.current?.())
  }, [api, enabled])
}
