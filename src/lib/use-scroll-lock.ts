'use client'

import { useEffect } from 'react'

// Locking the background with `body { overflow: hidden }` alone does NOT stop
// scroll on iOS Safari — the page still rubber-bands behind an open overlay.
// The reliable fix is to pin the body with `position: fixed` and offset it by
// the current scroll position, then restore the scroll on release.
//
// Reference-counted so nested overlays (e.g. a confirm dialog opened on top of
// a sheet) don't fight: the body is only pinned on the first lock and only
// restored once the last lock releases.

let lockCount = 0
let savedScrollY = 0
let savedStyle: {
  overflow: string
  position: string
  top: string
  width: string
} | null = null

function lock() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    const b = document.body.style
    savedStyle = {
      overflow: b.overflow,
      position: b.position,
      top: b.top,
      width: b.width,
    }
    b.overflow = 'hidden'
    b.position = 'fixed'
    b.top = `-${savedScrollY}px`
    b.width = '100%'
  }
  lockCount += 1
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0 && savedStyle) {
    const b = document.body.style
    b.overflow = savedStyle.overflow
    b.position = savedStyle.position
    b.top = savedStyle.top
    b.width = savedStyle.width
    savedStyle = null
    window.scrollTo(0, savedScrollY)
  }
}

/** Lock background scroll while `active` is true (iOS-safe, ref-counted). */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
