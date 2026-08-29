import { describe, expect, it } from 'vitest'
import { formatSyncedAt, relativeTimeFromNow } from './relative-time'

const NOW = new Date('2026-08-29T12:00:00Z')

describe('relativeTimeFromNow', () => {
  it('returns null when there is no timestamp', () => {
    expect(relativeTimeFromNow(null, NOW)).toBeNull()
    expect(relativeTimeFromNow(undefined, NOW)).toBeNull()
  })

  it('returns null for an unparsable timestamp', () => {
    expect(relativeTimeFromNow('not-a-date', NOW)).toBeNull()
  })

  it('rounds to the nearest unit', () => {
    expect(relativeTimeFromNow(new Date(NOW.getTime() - 10_000).toISOString(), NOW)).toBe('just now')
    expect(relativeTimeFromNow(new Date(NOW.getTime() - 5 * 60_000).toISOString(), NOW)).toBe('5 min ago')
    expect(relativeTimeFromNow(new Date(NOW.getTime() - 2 * 3_600_000).toISOString(), NOW)).toBe('2 h ago')
    expect(relativeTimeFromNow(new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), NOW)).toBe('3 d ago')
  })

  it('rounds the boundary between units up rather than truncating', () => {
    // 90 minutes rounds to "2 h ago", not "1 h ago".
    expect(relativeTimeFromNow(new Date(NOW.getTime() - 90 * 60_000).toISOString(), NOW)).toBe('2 h ago')
  })

  it('treats a future timestamp as "just now" (clock skew)', () => {
    expect(relativeTimeFromNow(new Date(NOW.getTime() + 5_000).toISOString(), NOW)).toBe('just now')
  })
})

describe('formatSyncedAt', () => {
  it('says never synced when there is no timestamp', () => {
    expect(formatSyncedAt(null, NOW)).toBe('never synced')
    expect(formatSyncedAt(undefined, NOW)).toBe('never synced')
  })

  it('prefixes the relative phrase with "synced"', () => {
    expect(formatSyncedAt(new Date(NOW.getTime() - 10_000).toISOString(), NOW)).toBe('synced just now')
    expect(formatSyncedAt(new Date(NOW.getTime() - 2 * 3_600_000).toISOString(), NOW)).toBe('synced 2 h ago')
  })
})
