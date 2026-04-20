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
