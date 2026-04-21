'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number from `start` up to `value` over `duration` ms using
 * ease-out-quart. Returns the current interpolated value. Caller is responsible
 * for formatting (money, abbreviated, etc.) — this hook is display-agnostic.
 */
export function useCountUp(
  value: number,
  {
    duration = 900,
    start = 0,
    delay = 0,
  }: { duration?: number; start?: number; delay?: number } = {},
): number {
  const [v, setV] = useState(start)
  const prevTarget = useRef<number>(start)

  useEffect(() => {
    let raf = 0
    const from = prevTarget.current
    const diff = value - from
    const t0 = performance.now() + delay

    const tick = (now: number) => {
      const t = Math.max(0, now - t0)
      const p = Math.min(1, t / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      setV(from + diff * eased)
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
  duration = 900,
  delay = 0,
  format,
}: {
  value: number
  duration?: number
  delay?: number
  format: (v: number) => string
}) {
  const v = useCountUp(value, { duration, delay })
  return <>{format(v)}</>
}
