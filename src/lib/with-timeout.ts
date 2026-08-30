/**
 * Rejects if `promise` has not settled within `ms`. Server pages use it
 * around their query batches so a stalled upstream connection fails fast
 * into the route's error boundary instead of hanging the loading state.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, what = 'operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}
