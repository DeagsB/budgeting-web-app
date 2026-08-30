'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Whether balances are hidden, for PrivacyBlur consumers rendered from
 * server components (the dashboard's display-only widgets), where threading
 * the client-side toggle through props is impossible. Defaults to hidden -
 * the privacy-safe first frame.
 */
export const HideBalancesContext = createContext(true)

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
  /** Omit to follow HideBalancesContext (the dashboard's eye toggle). */
  hidden?: boolean
  children: ReactNode
  strength?: number
  className?: string
}) {
  const contextHidden = useContext(HideBalancesContext)
  const isHidden = hidden ?? contextHidden
  return (
    <span
      className={`inline-block ${className}`}
      style={
        isHidden
          ? { WebkitTextFillColor: 'transparent', textShadow: `0 0 ${strength + 2}px currentColor` }
          : undefined
      }
    >
      {children}
    </span>
  )
}
