import type { HTMLAttributes, ReactNode } from 'react'

/**
 * Tiny all-caps label with letter-spacing. Used above card sections in
 * maple-tokens.jsx.
 */
export function MapleLabel({
  children,
  className = '',
  ...rest
}: {
  children: ReactNode
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2 ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
