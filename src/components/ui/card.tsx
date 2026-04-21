import type { HTMLAttributes, ReactNode } from 'react'

/**
 * Maple surface card. Uses the `paper` token so it sits one tier above the
 * page background (`cream`). Shadow + hairline border from design tokens.
 */
export function Card({
  children,
  className = '',
  padding = 'md',
  ...rest
}: {
  children: ReactNode
  padding?: 'sm' | 'md' | 'lg' | 'none'
} & HTMLAttributes<HTMLDivElement>) {
  const pad =
    padding === 'none' ? '' : padding === 'sm' ? 'p-4' : padding === 'lg' ? 'p-6' : 'p-5'
  return (
    <div
      className={`rounded-lg border border-hair bg-paper shadow-[var(--shadow-card)] ${pad} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
