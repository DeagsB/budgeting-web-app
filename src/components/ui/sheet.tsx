'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode, TouchEvent as ReactTouchEvent } from 'react'
import { useScrollLock } from '@/lib/use-scroll-lock'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Swipe-down-to-dismiss threshold on the drag handle, in px.
const SWIPE_DISMISS_PX = 60
// Matches Tailwind's `sm:` breakpoint - past this width the sheet is a
// centered card, not a bottom sheet, so the mobile keyboard-fit / swipe
// gestures below don't apply and Tailwind's own `sm:` classes take over.
const DESKTOP_QUERY = '(min-width: 640px)'

/**
 * Accessible overlay primitive - a bottom sheet on mobile that becomes a
 * centered card at `sm:` and up. Renders into a portal on `document.body`,
 * locks body scroll, closes on Esc / scrim click, and traps focus while open.
 * Restores focus to the previously-active element on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  labelledById,
  className = '',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  labelledById?: string
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<Element | null>(null)

  // Only portal once mounted on the client - guards `document` for SSR.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  // Lock body scroll while open (iOS-safe).
  useScrollLock(open)

  // Save + restore focus across the open lifecycle, and focus the panel on open.
  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement
    panelRef.current?.focus()
    return () => {
      const el = restoreFocusRef.current
      if (el instanceof HTMLElement) el.focus()
      restoreFocusRef.current = null
    }
  }, [open])

  // Esc closes; Tab is trapped within the panel.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === panel)
      if (focusable.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || active === panel) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  // ─── Keyboard-aware sizing (mobile bottom sheet only) ───
  // iOS keeps `window.innerHeight` fixed when the on-screen keyboard opens
  // and shrinks `visualViewport` instead, so a plain `88dvh`-capped sheet
  // ends up rendered partly *under* the keyboard with its footer
  // unreachable. Track the visual viewport while open: cap the panel to
  // what's actually free above the keyboard (minus a small top margin) and
  // pin the panel's bottom edge to the visible viewport's bottom edge
  // instead of the layout viewport's, so a sticky `SheetActions` bar stays
  // above the keyboard. Falls back to the static `max-h-[88dvh]` class
  // below when `visualViewport` isn't available.
  const [vvStyle, setVvStyle] = useState<{ maxHeight?: number; bottom?: number }>({})

  useEffect(() => {
    if (!open) return
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const desktopQuery = window.matchMedia(DESKTOP_QUERY)

    function update() {
      if (desktopQuery.matches) {
        // Centered card at sm:+ - let Tailwind's own classes own sizing.
        setVvStyle({})
        return
      }
      const topMargin = 24
      const maxHeight = Math.max(0, Math.round(vv!.height - topMargin))
      const bottomGap = Math.max(
        0,
        Math.round(window.innerHeight - (vv!.offsetTop + vv!.height)),
      )
      setVvStyle({ maxHeight, bottom: bottomGap })
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    desktopQuery.addEventListener('change', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      desktopQuery.removeEventListener('change', update)
      setVvStyle({})
    }
  }, [open])

  // ─── Swipe-down-to-dismiss (drag handle only) ───
  // Scoped to the handle so it never competes with scrolling the sheet's own
  // content. Follows the finger 1:1 while dragging (no transition, so it
  // can't lag); releasing past the threshold closes, otherwise it springs
  // back - the spring-back transition collapses to ~0 under
  // `prefers-reduced-motion` via the global rule in globals.css.
  const dragRef = useRef<{ startY: number; lastY: number } | null>(null)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)

  function onHandleTouchStart(e: ReactTouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return
    dragRef.current = { startY: e.touches[0].clientY, lastY: e.touches[0].clientY }
    setDragging(true)
  }
  function onHandleTouchMove(e: ReactTouchEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    const y = e.touches[0].clientY
    drag.lastY = y
    setDragY(Math.max(0, y - drag.startY))
  }
  function endDrag() {
    const drag = dragRef.current
    if (!drag) return
    const dy = Math.max(0, drag.lastY - drag.startY)
    dragRef.current = null
    setDragging(false)
    setDragY(0)
    if (dy > SWIPE_DISMISS_PX) onClose()
  }

  if (!open || !mounted) return null

  const dynamicStyle: CSSProperties = {
    paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
    ...(vvStyle.maxHeight !== undefined ? { maxHeight: `${vvStyle.maxHeight}px` } : {}),
    ...(vvStyle.bottom !== undefined ? { bottom: `${vvStyle.bottom}px` } : {}),
    ...(dragY > 0 ? { transform: `translateY(${dragY}px)` } : {}),
    ...(dragging ? { transition: 'none' } : {}),
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledById ? undefined : title}
        aria-labelledby={labelledById}
        tabIndex={-1}
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[24px] border-t border-hair bg-cream shadow-[var(--shadow-float)] outline-none transition-transform duration-200 ease-[var(--ease-ios)] sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-h-[85dvh] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:transition-none ${className}`}
        style={dynamicStyle}
      >
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 touch-none rounded-full bg-hair sm:hidden"
          aria-hidden
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={endDrag}
          onTouchCancel={endDrag}
        />
        {title ? (
          <div className="maple-chrome flex items-center justify-between gap-3 px-5 py-3.5">
            <h2 className="font-serif text-[20px] tracking-[-0.02em] text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-paper hover:text-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="px-5 py-3">{children}</div>
        {footer ? <div className="border-t border-hair px-5 py-3.5">{footer}</div> : null}
      </div>
    </>,
    document.body,
  )
}

/**
 * Sticky action bar for the bottom of a form rendered inside a `Sheet` (or any
 * scrolling panel). Keeps the primary button visible above the on-screen
 * keyboard because the panel, not the page, is the scroll container - and
 * because the panel itself now tracks `visualViewport` (see `Sheet` above),
 * this bar stays above the keyboard even as it animates open and closed.
 */
export function SheetActions({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`sticky bottom-0 z-20 -mx-5 mt-4 border-t border-hair bg-cream px-5 pt-3 ${className}`}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)' }}
    >
      {children}
    </div>
  )
}
