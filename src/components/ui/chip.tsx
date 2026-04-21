'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Pill chip. Active chips fill with the leaf accent; inactive chips are
 * ghosted with a hair border. Used for filter bars and range selectors.
 */
export function Chip({
  children,
  active = false,
  className = '',
  type = 'button',
  ...rest
}: {
  children: ReactNode
  active?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const look = active
    ? 'bg-leaf text-paper border-leaf'
    : 'bg-transparent text-ink-2 border-hair hover:text-ink'
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${look} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
