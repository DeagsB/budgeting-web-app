'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'maple.iosInstallHint.dismissed'

/**
 * One-time bottom sheet shown to iPhone users browsing in Safari (not yet
 * installed) telling them to tap Share → Add to Home Screen. iOS doesn't
 * surface a beforeinstallprompt event — Safari requires the user to do it
 * manually — so this is the closest we get to a "Install" CTA.
 *
 * Hidden if: not iOS, already installed (display-mode: standalone), or the
 * user dismissed it. Won't show server-side or before mount.
 */
export function IOSInstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return
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

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch {}
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      role="dialog"
      aria-label="Install Maple to your home screen"
      className="fixed inset-x-0 z-50 px-3"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom) + 12px)',
      }}
    >
      <div
        className="mx-auto max-w-[420px] rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 shadow-[var(--shadow-float)]"
      >
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
              {' '}then <b>Add to Home Screen</b> — opens like a real app, no browser bar.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install hint"
            className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-2)]"
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
