// Opt-in server-side timing for the perf harness (scripts/perf). Enabled by
// PERF_TIMING=1; a no-op otherwise so production pays nothing.

const enabled = process.env.PERF_TIMING === '1'

export function perfTimer(name: string): (stage: string) => void {
  if (!enabled) return () => {}
  const start = performance.now()
  let last = start
  return (stage) => {
    const now = performance.now()
    console.log(`[perf] ${name} ${stage}=${(now - last).toFixed(0)}ms elapsed=${(now - start).toFixed(0)}ms`)
    last = now
  }
}
