'use client'

import { useCallback, useSyncExternalStore } from 'react'

// Same-tab change notifications: `storage` only fires in *other* tabs.
const EVENT = 'maple:storage'

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(EVENT, onChange)
  }
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * A localStorage-backed value that hydrates without a second commit.
 *
 * The old pattern (`useState(default)` + `useEffect(() => setState(read()))`)
 * renders the default, paints, then re-renders the whole tree once the
 * effect runs. `useSyncExternalStore` hands React the server value for
 * hydration and the stored value for the very next synchronous render, so
 * the persisted choice is on screen before the first paint completes and no
 * hydration mismatch is logged.
 *
 * `parse` must be pure: it is memoised per raw string so the snapshot stays
 * referentially stable between renders (a hard requirement of the hook).
 */
export function useStoredValue<T>(key: string, parse: (raw: string | null) => T, serverValue: T): T {
  const getSnapshot = useCallback(() => {
    const raw = readRaw(key)
    const cached = snapshotCache.get(key)
    if (cached && cached.raw === raw) return cached.value as T
    const value = parse(raw)
    snapshotCache.set(key, { raw, value })
    return value
  }, [key, parse])
  const getServerSnapshot = useCallback(() => serverValue, [serverValue])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

const snapshotCache = new Map<string, { raw: string | null; value: unknown }>()

/** Persist a value and notify every `useStoredValue(key)` in this tab. */
export function writeStoredValue(key: string, raw: string | null): void {
  try {
    if (raw === null) localStorage.removeItem(key)
    else localStorage.setItem(key, raw)
  } catch {}
  window.dispatchEvent(new Event(EVENT))
}
