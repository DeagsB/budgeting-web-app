const CAD = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMoney(cents: number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return '-'
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  return CAD.format(n / 100)
}

export function formatMoneySigned(
  cents: number | bigint | null | undefined,
  { plus = false }: { plus?: boolean } = {},
): string {
  if (cents === null || cents === undefined) return '-'
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  const formatted = CAD.format(Math.abs(n) / 100)
  if (n < 0) return `-${formatted}`
  if (plus && n > 0) return `+${formatted}`
  return formatted
}

export function formatMoneyCompact(cents: number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return '-'
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  const dollars = n / 100
  const abs = Math.abs(dollars)
  if (abs < 1000) return formatMoney(cents)
  const sign = dollars < 0 ? '-' : ''
  if (abs < 1_000_000) return `${sign}$${trimCompact(abs / 1000)}K`
  if (abs < 1_000_000_000) return `${sign}$${trimCompact(abs / 1_000_000)}M`
  return `${sign}$${trimCompact(abs / 1_000_000_000)}B`
}

function trimCompact(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/**
 * Normalise a user-typed decimal string to canonical `-?\d*(\.\d*)?` form.
 *
 * Accepts en-CA ("1,234.56") and fr-CA ("1 234,56" - the iOS fr-CA keyboard
 * emits a comma decimal) conventions:
 * - whitespace (incl. NBSP / narrow NBSP) and "$" are stripped
 * - with commas and no period, the LAST comma is the decimal mark when it is
 *   followed by 1-2 digits; otherwise every comma is a thousands separator
 * - with both commas and a period, commas are thousands separators
 *
 * Returns null for anything that is not an unambiguous decimal number.
 */
function normaliseDecimal(input: string): string | null {
  let s = input.replace(/[\s\u00a0\u202f$]/g, '')
  if (s.includes(',')) {
    if (s.includes('.')) {
      s = s.replace(/,/g, '')
    } else {
      const last = s.lastIndexOf(',')
      const tail = s.slice(last + 1)
      if (/^\d{1,2}$/.test(tail)) {
        s = s.slice(0, last).replace(/,/g, '') + '.' + tail
      } else {
        s = s.replace(/,/g, '')
      }
    }
  }
  if (!s || s === '-' || s === '.' || s === '-.') return null
  return s
}

/**
 * Parse a user-typed dollar amount to integer cents.
 * Rejects (returns null) empty input, malformed numbers, and more than two
 * decimal places - it never rounds silently.
 */
export function parseMoneyToCents(input: string): number | null {
  const s = normaliseDecimal(input)
  if (s === null) return null
  if (!/^-?\d*(\.\d{0,2})?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/**
 * Parse a user-typed decimal quantity (e.g. hours) using the same locale
 * rules as {@link parseMoneyToCents}, rounded to `decimals` places.
 */
export function parseDecimal(input: string, decimals = 2): number | null {
  const s = normaliseDecimal(input)
  if (s === null) return null
  if (!/^-?\d*(\.\d*)?$/.test(s)) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '-'
  return DATE_FMT.format(new Date(isoDate + 'T00:00:00'))
}

export function monthStartISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function monthLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })
}

export function addMonths(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
