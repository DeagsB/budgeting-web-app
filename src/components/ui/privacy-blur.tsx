'use client'

import type { ReactNode } from 'react'

/**
 * Wraps sensitive numbers and smudges them out when `hidden` is true.
 *
 * Implementation: transparent text fill + a text-shadow in the text's own
 * color. Reads exactly like the old `filter: blur()` but never creates a
 * filter layer - the dashboard shows a dozen of these at once and WebKit
 * pays for every live blur region on scroll and during view transitions.
 * Only text is hidden, which is fine: every consumer wraps formatted money
 * strings / <Amount> spans, nothing graphical.
 */
export function PrivacyBlur({
  hidden,
  children,
  strength = 6,
  className = '',
}: {
  hidden: boolean
  children: ReactNode
  strength?: number
  className?: string
}) {
  return (
    <span
      className={`inline-block ${className}`}
      style={
        hidden
          ? { WebkitTextFillColor: 'transparent', textShadow: `0 0 ${strength + 2}px currentColor` }
          : undefined
      }
    >
      {children}
    </span>
  )
}
