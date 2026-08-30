'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UpdateToast } from './update-toast'

/**
 * Registers /sw.js once on mount. The service worker is what makes the app
 * installable on iOS Home Screen and Chrome's "Install" prompt - without one,
 * the manifest is ignored.
 *
 * Also owns the update flow: the worker no longer calls skipWaiting() on its
 * own, so a deploy mid-session can't yank chunks out from under a live page.
 * When a new worker reaches "installed" while an old one controls the page,
 * we show a small "Update ready" pill; tapping Reload posts SKIP_WAITING to
 * the waiting worker and reloads once it takes control.
 *
 * Skipped in dev unless explicitly opted in: HMR + service workers fight each
 * other, and the empty cache surfaces stale shells. Production-only by default.
 */
export function ServiceWorkerRegistrar() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [busy, setBusy] = useState(false)
  const reloadingRef = useRef(false)
  const reloadRequestedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_SW_IN_DEV) return

    let cancelled = false
    let registration: ServiceWorkerRegistration | null = null

    const onUpdateFound = () => {
      const installing = registration?.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        // "installed" with an existing controller means: new version waiting
        // behind a live page. On a first install there's no controller and
        // the worker activates on its own.
        if (installing.state === 'installed' && navigator.serviceWorker.controller && !cancelled) {
          setWaiting(installing)
        }
      })
    }

    const onControllerChange = () => {
      // Only reload for an update the user accepted via the toast. The
      // worker also calls clients.claim() on its very first activation,
      // which fires controllerchange too; reloading there loaded every
      // first launch twice.
      if (!reloadRequestedRef.current || reloadingRef.current) return
      reloadingRef.current = true
      window.location.reload()
    }

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          if (cancelled) return
          registration = reg
          // A worker may already be waiting from a previous visit.
          if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting)
          reg.addEventListener('updatefound', onUpdateFound)
        })
        .catch((err) => console.warn('SW registration failed:', err))
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('load', onLoad)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      registration?.removeEventListener('updatefound', onUpdateFound)
    }
  }, [])

  const reload = useCallback(() => {
    if (!waiting) return
    setBusy(true)
    reloadRequestedRef.current = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
    // controllerchange (above) performs the actual reload once the new
    // worker has claimed the page.
  }, [waiting])

  if (!waiting) return null
  return <UpdateToast onReload={reload} busy={busy} />
}
