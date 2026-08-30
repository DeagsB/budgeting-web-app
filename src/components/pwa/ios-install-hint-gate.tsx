'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const IOSInstallHint = dynamic(
  () => import('./ios-install-hint').then((m) => m.IOSInstallHint),
  { ssr: false },
)

/**
 * Loads the "Add to Home Screen" hint only when it could ever show: a
 * browser tab, not an installed PWA. The installed app (the primary target)
 * never downloads the hint's chunk at all.
 */
export function IOSInstallHintGate() {
  const [eligible, setEligible] = useState(false)
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) return
    // Fetching the chunk the instant the shell hydrates competes with the
    // page's own hydration (measured: +230 ms to interactive in a Safari
    // tab). Wait until the page has settled; the hint is not urgent.
    const t = setTimeout(() => setEligible(true), 1500)
    return () => clearTimeout(t)
  }, [])
  return eligible ? <IOSInstallHint /> : null
}
