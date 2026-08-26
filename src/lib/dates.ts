/**
 * Civil-date helpers. The household lives in Canada, so "today" means the
 * calendar date in America/Toronto, never the UTC date the server happens to
 * be on. Every server-side "what day is it" must go through here; the
 * `toISOString().slice(0, 10)` idiom silently rolls the date at 8pm Eastern.
 */
export const HOUSEHOLD_TIME_ZONE = 'America/Toronto'

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOUSEHOLD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** `YYYY-MM-DD` for the given instant (default: now) in America/Toronto. */
export function todayISO(now: Date = new Date()): string {
  return fmt.format(now)
}

/** `YYYY-MM-01` for the current month in America/Toronto. */
export function monthStartISOToronto(now: Date = new Date()): string {
  return `${todayISO(now).slice(0, 7)}-01`
}

/**
 * Shift a `YYYY-MM-DD` by whole months with pure string math (no Date, no
 * time zone). The day is clamped to the target month's length, so
 * 2026-01-31 minus 2 months is 2025-11-30.
 */
export function addMonthsISO(iso: string, delta: number): string {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const total = year * 12 + (month - 1) + delta
  const y = Math.floor(total / 12)
  const m = total - y * 12 + 1
  const d = Math.min(day, daysInMonth(y, m))
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** `YYYY-MM-01` for the month after the one containing `iso` (a YYYY-MM-DD). */
export function nextMonthStartISO(iso: string): string {
  return `${addMonthsISO(iso, 1).slice(0, 7)}-01`
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}
