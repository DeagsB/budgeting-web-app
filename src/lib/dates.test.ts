import { afterEach, describe, expect, it, vi } from 'vitest'
import { addMonthsISO, monthStartISOToronto, nextMonthStartISO, todayISO } from './dates'

afterEach(() => {
  vi.useRealTimers()
})

describe('todayISO', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(todayISO(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03-15')
  })

  it('uses the Toronto civil date, not UTC (late evening Eastern is still today)', () => {
    // 2026-08-27T02:30Z is 2026-08-26 22:30 EDT.
    expect(todayISO(new Date('2026-08-27T02:30:00Z'))).toBe('2026-08-26')
    // 2026-01-15T03:00Z is 2026-01-14 22:00 EST.
    expect(todayISO(new Date('2026-01-15T03:00:00Z'))).toBe('2026-01-14')
  })

  it('defaults to now (mocked)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T23:00:00Z'))
    expect(todayISO()).toBe('2026-12-31')
    vi.setSystemTime(new Date('2027-01-01T03:00:00Z'))
    expect(todayISO()).toBe('2026-12-31')
  })
})

describe('monthStartISOToronto', () => {
  it('returns the first of the Toronto month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T02:00:00Z'))
    expect(monthStartISOToronto()).toBe('2026-08-01')
    expect(monthStartISOToronto(new Date('2026-09-20T12:00:00Z'))).toBe('2026-09-01')
  })
})

describe('addMonthsISO', () => {
  it('shifts by months, clamping the day and crossing years', () => {
    expect(addMonthsISO('2026-01-31', -2)).toBe('2025-11-30')
    expect(addMonthsISO('2026-08-26', -12)).toBe('2025-08-26')
    expect(addMonthsISO('2024-03-31', -1)).toBe('2024-02-29')
    expect(addMonthsISO('2026-11-15', 3)).toBe('2027-02-15')
  })
})

describe('nextMonthStartISO', () => {
  it('rolls month and year with string math', () => {
    expect(nextMonthStartISO('2026-08-26')).toBe('2026-09-01')
    expect(nextMonthStartISO('2026-12-05')).toBe('2027-01-01')
    expect(nextMonthStartISO('2026-01-31')).toBe('2026-02-01')
  })
})
