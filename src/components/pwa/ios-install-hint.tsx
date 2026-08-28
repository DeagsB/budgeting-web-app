'use client'

import { useEffect, useRef, useState } from 'react'

const DISMISS_KEY = 'maple.iosInstallHint.dismissedAt'
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000

/**
 * Height the hint currently occupies above the tab bar, published on <html>
 * so the app shell can pad the page bottom by the same amount. 0 (unset) when
 * the hint is hidden. Includes the gap between the card and the tab bar.
 */
export const INSTALL_HINT_HEIGHT_VAR = '--maple-hint-h'

function persistDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {}
}

/**
 * Bottom hint shown to iPhone users browsing in Safari (not yet installed)
 * telling them to tap Share then Add to Home Screen. iOS doesn't surface a
 * beforeinstallprompt event - Safari requires the user to do it manually -
 * so this is the closest we get to an "Install" CTA.
 *
 * Rendered by the app shell only (signed-in pages with the tab bar), never on
 * auth or onboarding screens, so it can assume the tab bar is there and sit
 * just above it. It reserves its own space: while visible it publishes its
 * height as a CSS variable on <html>, and the shell adds that to the page's
 * bottom padding, so scrolled-to-bottom content stays reachable instead of
 * hiding under the card.
 *
 * Hidden if: not iOS, already installed (display-mode: standalone), or the
 * user dismissed it within the last 14 days. Won't show server-side or
 * before mount.
 */
export function IOSInstallHint() {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      const dismissedAt = raw ? Number(raw) : 0
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return
    } catch {}
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // Safari iOS exposes the legacy navigator.standalone for installed PWAs.
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!isIOS || isStandalone) return
    // Wait a beat so the hint doesn't slam in during initial paint.
    const t = setTimeout(() => setShow(true), 1200)
    return () => clearTimeout(t)
  }, [])

  // Publish the occupied height while visible; clear it on hide/unmount.
  useEffect(() => {
    if (!show) return
    const el = ref.current
    const root = document.documentElement
    if (!el) return
    const publish = () => root.style.setProperty(INSTALL_HINT_HEIGHT_VAR, `${Math.ceil(el.offsetHeight)}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty(INSTALL_HINT_HEIGHT_VAR)
    }
  }, [show])

  // Escape dismisses, like any transient notice.
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      persistDismiss()
      setShow(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  function dismiss() {
    persistDismiss()
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      ref={ref}
      role="status"
      aria-label="Install Maple to your home screen"
      // Below the tab bar (z-30) and every sheet/overlay (z-40+), above page
      // content. The wrapper's padding is the gap to the tab bar, so the
      // measured height already includes it.
      className="maple-chrome fixed inset-x-0 z-20 px-3 pb-3 md:hidden"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto max-w-[420px] rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 shadow-[var(--shadow-float)]">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] font-serif text-[20px]"
            style={{ background: 'var(--color-leaf)', color: 'var(--color-paper)' }}
            aria-hidden
          >
            M
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[16px] tracking-[-0.01em] text-[var(--color-ink)]">
              Install Maple
            </div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
              Tap{' '}
              <span aria-label="Share" role="img" className="inline-block align-[-2px]">
                <ShareIcon />
              </span>
              {' '}then <b>Add to Home Screen</b> - opens like a real app, no browser bar.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install hint"
            className="-mr-3 -mt-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-2)]"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 12V2M7 2L4 5M7 2l3 3" />
      <path d="M2 9v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
