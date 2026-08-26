'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Size = 'sm' | 'md' | 'lg'
type Variant = 'primary' | 'secondary' | 'ghost'

// Every size clears the 44px tap-target floor; `sm` only shrinks the type and
// horizontal padding.
const heights: Record<Size, string> = {
  sm: 'h-11 text-[13px] px-4',
  md: 'h-[46px] text-[14px] px-5',
  lg: 'h-[54px] text-[16px] px-6',
}

/**
 * Maple button. `primary` paints with the leaf accent; `secondary` is a
 * surface-coloured pill with a hair border; `ghost` is text-only. The 100ms
 * scale-down on press mirrors iOS-native feedback.
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: {
  children: ReactNode
  variant?: Variant
  size?: Size
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none'
  const look =
    variant === 'primary'
      ? 'bg-leaf text-paper shadow-[var(--shadow-card)]'
      : variant === 'ghost'
        ? 'text-ink-2 hover:text-ink'
        : 'bg-paper text-ink ring-1 ring-inset ring-hair'

  return (
    <button type={type} className={`${base} ${heights[size]} ${look} ${className}`} {...rest}>
      {children}
    </button>
  )
}
