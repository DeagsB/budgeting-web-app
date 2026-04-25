'use client'

import { useEffect } from 'react'

/**
 * Registers /sw.js once on mount. The service worker is what makes the app
 * installable on iOS Home Screen and Chrome's "Install" prompt — without one,
 * the manifest is ignored.
 *
 * Skipped in dev unless explicitly opted in: HMR + service workers fight each
 * other, and the empty cache surfaces stale shells. Production-only by default.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_SW_IN_DEV) return

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((err) => console.warn('SW registration failed:', err))
    }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })
    return () => window.removeEventListener('load', onLoad)
  }, [])

  return null
}
