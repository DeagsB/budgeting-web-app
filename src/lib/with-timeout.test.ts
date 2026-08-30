import { describe, expect, it } from 'vitest'
import { withTimeout } from './with-timeout'

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42)
  })

  it('propagates the original rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom')
  })

  it('rejects with a labelled error once the deadline passes', async () => {
    const never = new Promise<never>(() => {})
    await expect(withTimeout(never, 10, 'dashboard queries')).rejects.toThrow(
      'dashboard queries timed out after 10ms',
    )
  })
})
