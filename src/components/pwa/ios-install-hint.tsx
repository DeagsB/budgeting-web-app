'use client'

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'maple.iosInstallHint.dismissedAt'
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000

function persistDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {}
}

/**
 * Hint shown to iPhone users browsing in Safari (not yet installed) telling
 * them to tap Share then Add to Home Screen. iOS doesn't surface a
 * beforeinstallprompt event - Safari requires the user to do it manually -
 * so this is the closest we get to an "Install" CTA.
 *
 * Rendered by the app shell only (signed-in pages with the tab bar), never on
 * auth or onboarding screens. It renders in normal document flow (not
 * `position: fixed`), so it never floats over scrolling content - it simply
 * becomes the last block on the page, and the page grows to make room for it
 * the way any other in-flow element would. That also means it never needs to
 * publish its own height for something else to reserve space around.
 *
 * Hidden if: not iOS, already installed (display-mode: standalone), or the
 * user dismissed it within the last 14 days. Won't show server-side or
 * before mount.
 */
export function IOSInstallHint() {
  const [show, setShow] = useState(false)

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
      role="status"
      aria-label="Install Maple to your home screen"
      className="maple-chrome px-4 pb-4 pt-1 md:hidden"
    >
      <div className="mx-auto max-w-[420px] rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 shadow-[var(--shadow-card)]">
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
