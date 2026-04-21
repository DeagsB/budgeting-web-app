'use client'

import type { ReactNode } from 'react'

/**
 * Wraps sensitive numbers with a blur filter when `hidden` is true. Animated
 * via a 280ms filter transition; can be applied inline without affecting
 * layout (display is inline-block only when hidden).
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
      className={`inline-block transition-[filter] duration-[280ms] ${className}`}
      style={{ filter: hidden ? `blur(${strength}px) saturate(0.8)` : 'none' }}
    >
      {children}
    </span>
  )
}
