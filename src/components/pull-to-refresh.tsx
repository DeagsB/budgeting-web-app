'use client'

import { useRef, useState, type ReactNode } from 'react'

/**
 * iOS-style pull-to-refresh. Wrap a screen's content; when the user drags down
 * from the very top of the page past the threshold and releases, `onRefresh`
 * runs (with a spinner) and the gesture resets. Touch-only — inert on desktop.
 */
export function PullToRefresh({
  onRefresh,
  children,
  label = 'Pull to sync',
  busyLabel = 'Syncing…',
}: {
  onRefresh: () => Promise<void>
  children: ReactNode
  label?: string
  busyLabel?: string
}) {
  const [pull, setPull] = useState(0) // visible drag distance (px, resisted)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const startY = useRef<number | null>(null)

  const THRESHOLD = 64 // px of resisted pull needed to trigger
  const MAX = 96

  function onTouchStart(e: React.TouchEvent) {
    // Only arm the gesture when the page is scrolled to the very top.
    const armed = window.scrollY <= 0 && !refreshing
    startY.current = armed ? e.touches[0].clientY : null
    setDragging(armed)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) {
      setPull(0)
      return
    }
    // Rubber-band resistance: the further you pull, the slower it moves.
    setPull(Math.min(dy * 0.5, MAX))
  }

  async function onTouchEnd() {
    setDragging(false)
    if (startY.current === null) return
    const trigger = pull >= THRESHOLD
    startY.current = null
    if (!trigger) {
      setPull(0)
      return
    }
    setRefreshing(true)
    setPull(THRESHOLD)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
      setPull(0)
    }
  }

  const active = pull > 0 || refreshing
  const ready = pull >= THRESHOLD

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Indicator sits above the content and is revealed by the pull. */}
      <div
        aria-hidden={!active}
        className="flex items-center justify-center overflow-hidden"
        style={{
          height: refreshing ? THRESHOLD : pull,
          transition: dragging ? 'none' : 'height 200ms var(--ease-ios)',
        }}
      >
        <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-3">
          <Spinner spinning={refreshing} rotated={ready && !refreshing} />
          <span aria-live="polite">{refreshing ? busyLabel : ready ? 'Release to sync' : label}</span>
        </div>
      </div>
      {children}
    </div>
  )
}

function Spinner({ spinning, rotated }: { spinning: boolean; rotated: boolean }) {
  if (spinning) {
    return (
      <svg className="h-4 w-4 animate-spin text-leaf" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    )
  }
  // Arrow that flips up once the threshold is reached.
  return (
    <svg
      className="h-4 w-4 text-ink-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: rotated ? 'rotate(180deg)' : 'none', transition: 'transform 150ms var(--ease-ios)' }}
      aria-hidden
    >
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  )
}
