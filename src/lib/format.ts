const CAD = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMoney(cents: number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  return CAD.format(n / 100)
}

export function formatMoneySigned(
  cents: number | bigint | null | undefined,
  { plus = false }: { plus?: boolean } = {},
): string {
  if (cents === null || cents === undefined) return '—'
  const n = typeof cents === 'bigint' ? Number(cents) : cents
  const formatted = CAD.format(Math.abs(n) / 100)
  if (n < 0) return `-${formatted}`
  if (plus && n > 0) return `+${formatted}`
  return formatted
}

export function formatMoneyCompact(cents: number | bigint | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
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

export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
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
