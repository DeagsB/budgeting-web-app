import { describe, expect, it } from 'vitest'
import { PENDING_EMAIL_COOKIE, PENDING_EMAIL_TTL_SECONDS, normalizePendingEmail } from './pending-email'

describe('normalizePendingEmail', () => {
  it('trims and lowercases a plausible address', () => {
    expect(normalizePendingEmail('  Jane@Example.CA ')).toBe('jane@example.ca')
  })

  it('rejects empty, malformed, or oversized values', () => {
    expect(normalizePendingEmail(undefined)).toBeNull()
    expect(normalizePendingEmail('')).toBeNull()
    expect(normalizePendingEmail('not-an-email')).toBeNull()
    expect(normalizePendingEmail('a@b')).toBeNull()
    expect(normalizePendingEmail('x'.repeat(250) + '@example.com')).toBeNull()
  })

  it('exposes a stable cookie name and a short TTL', () => {
    expect(PENDING_EMAIL_COOKIE).toBe('maple-pending-email')
    expect(PENDING_EMAIL_TTL_SECONDS).toBeLessThanOrEqual(60 * 60)
  })
})
