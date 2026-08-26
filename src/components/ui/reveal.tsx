import type { HTMLAttributes, ReactNode } from 'react'

/**
 * Fade + translate-up reveal driven by a CSS animation (`.maple-reveal` in
 * globals.css), so the content is painted by the server HTML and animates in
 * on first paint - no JavaScript needed. Before hydration the card is never
 * blank; on slow devices it simply fades in a beat later. `delay` staggers
 * children; reduced-motion users get the final frame immediately.
 */
export function Reveal({
  children,
  delay = 0,
  y = 8,
  show = true,
  className = '',
  style,
  ...rest
}: {
  children: ReactNode
  delay?: number
  y?: number
  show?: boolean
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`${show ? 'maple-reveal' : ''} ${className}`}
      style={{
        ...style,
        animationDelay: show && delay ? `${delay}ms` : undefined,
        ['--reveal-y' as string]: `${y}px`,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
