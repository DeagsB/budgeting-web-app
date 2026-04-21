'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { useEffect, useState } from 'react'

/**
 * Mount-time fade + translate-up reveal. `delay` lets you stagger children.
 * Once `show` flips, the transform runs with an iOS-feel easing.
 */
export function Reveal({
  children,
  delay = 0,
  y = 8,
  show = true,
  className = '',
  ...rest
}: {
  children: ReactNode
  delay?: number
  y?: number
  show?: boolean
} & HTMLAttributes<HTMLDivElement>) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (!show) return
    const id = setTimeout(() => setMounted(true), delay)
    return () => clearTimeout(id)
  }, [show, delay])

  return (
    <div
      className={`transition-[opacity,transform] duration-[380ms] ease-[var(--ease-ios-in)] ${className}`}
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : `translateY(${y}px)`,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
