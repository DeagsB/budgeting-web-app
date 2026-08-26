'use client'

import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Animates a number up to `value` over `duration` ms using ease-out-quart and
 * returns the current interpolated value. Caller formats it (money, etc.).
 *
 * The first frame starts at `from` (defaults to `value` itself, so nothing
 * flashes "$0.00" before the animation lands); later changes to `value`
 * animate from wherever the previous run settled. When the OS asks for
 * reduced motion, the final value renders immediately with no tween.
 */
export function useCountUp(
  value: number,
  {
    duration = 900,
    from,
    delay = 0,
  }: { duration?: number; from?: number; delay?: number } = {},
): number {
  const initial = from ?? value
  const [v, setV] = useState(initial)
  const prevTarget = useRef<number>(initial)

  useEffect(() => {
    const start = prevTarget.current
    if (start === value || prefersReducedMotion()) {
      prevTarget.current = value
      setV(value)
      return
    }

    let raf = 0
    const diff = value - start
    const t0 = performance.now() + delay

    const tick = (now: number) => {
      const t = Math.max(0, now - t0)
      const p = Math.min(1, t / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      setV(start + diff * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prevTarget.current = value
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, delay])

  return v
}

/**
 * Renders a child using the count-up hook.
 */
export function CountUp({
  value,
  from,
  duration = 900,
  delay = 0,
  format,
}: {
  value: number
  from?: number
  duration?: number
  delay?: number
  format: (v: number) => string
}) {
  const v = useCountUp(value, { duration, delay, from })
  return <>{format(v)}</>
}
