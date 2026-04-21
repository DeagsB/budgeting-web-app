import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney, monthLabel, monthStartISO, addMonths } from '@/lib/format'
import { MapleLabel } from '@/components/ui/label'
import Link from 'next/link'

/**
 * P&L — twelve-month income vs expense rollup, plus a breakdown by top-level
 * category for the selected month. Serif numbers, maple-red for expenses,
 * leaf-green for income.
 */
export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const sp = await searchParams
  const selected = sp.month || monthStartISO(new Date())
  const yearStart = `${selected.slice(0, 4)}-01-01`

  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const [{ data: splits }, { data: txs }, { data: cats }] = await Promise.all([
    supabase
      .from('transaction_splits')
      .select('category_id, amount_cents, transaction:transactions!inner(occurred_on)')
      .eq('household_id', ctx.householdId)
      .gte('transaction.occurred_on', yearStart),
    supabase
      .from('transactions')
      .select('amount_cents, occurred_on, direction')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', yearStart),
    supabase
      .from('categories')
      .select('id, parent_id, name')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('sort_order'),
  ])

  // Build month buckets (selected year, Jan–Dec)
  type Bucket = { month: string; income: number; expense: number }
  const buckets: Bucket[] = []
  for (let i = 0; i < 12; i += 1) {
    buckets.push({ month: addMonths(yearStart, i), income: 0, expense: 0 })
  }
  const idx = (iso: string) =>
    buckets.findIndex((b) => b.month.slice(0, 7) === iso.slice(0, 7))

  for (const t of txs ?? []) {
    const i = idx(t.occurred_on as string)
    if (i < 0) continue
    const cents = Math.abs(Number(t.amount_cents))
    if (t.direction === 'income') buckets[i].income += cents
    else if (t.direction === 'expense') buckets[i].expense += cents
  }

  // Category breakdown for selected month
  const parentOf = new Map<string, string | null>(
    (cats ?? []).map((c) => [c.id, c.parent_id as string | null]),
  )
  const nameOf = new Map<string, string>((cats ?? []).map((c) => [c.id, c.name]))
  const catTotals = new Map<string, number>()
  for (const s of splits ?? []) {
    const occ = (s.transaction as { occurred_on?: string } | null)?.occurred_on
    if (!occ || occ.slice(0, 7) !== selected.slice(0, 7)) continue
    const cents = Number(s.amount_cents)
    if (cents <= 0) continue
    let id = s.category_id as string | null
    while (id && parentOf.get(id)) id = parentOf.get(id) ?? null
    if (!id) continue
    catTotals.set(id, (catTotals.get(id) ?? 0) + cents)
  }
  const topCats = [...catTotals.entries()]
    .map(([id, cents]) => ({ id, name: nameOf.get(id) ?? '—', cents }))
    .sort((a, b) => b.cents - a.cents)

  const thisMonth = buckets.find((b) => b.month === selected) ?? { income: 0, expense: 0, month: selected }
  const ytdIncome = buckets.reduce((s, b) => (b.month <= selected ? s + b.income : s), 0)
  const ytdExpense = buckets.reduce((s, b) => (b.month <= selected ? s + b.expense : s), 0)

  const maxBar = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expense)))
  const topCatMax = Math.max(1, ...topCats.map((c) => c.cents))

  const prevMonth = addMonths(selected, -1)
  const nextMonth = addMonths(selected, 1)

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Profit &amp; Loss
        </div>
        <div className="flex items-end justify-between gap-4">
          <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
            What came in, what went out.
          </h1>
          <nav className="flex shrink-0 items-center gap-1 text-[12.5px]">
            <Link
              href={`/pnl?month=${prevMonth}`}
              className="rounded-full border border-[var(--color-hair)] px-3 py-1.5 font-semibold text-[var(--color-ink-2)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
            >
              ←
            </Link>
            <span className="px-3 font-semibold text-[var(--color-ink)]">{monthLabel(selected)}</span>
            <Link
              href={`/pnl?month=${nextMonth}`}
              className="rounded-full border border-[var(--color-hair)] px-3 py-1.5 font-semibold text-[var(--color-ink-2)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
            >
              →
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero numbers */}
      <section className="grid gap-3 md:grid-cols-3">
        <Stat label={`${monthLabel(selected)} income`} value={thisMonth.income} tone="leaf" />
        <Stat label={`${monthLabel(selected)} expenses`} value={thisMonth.expense} tone="maple" />
        <Stat
          label={`${monthLabel(selected)} net`}
          value={thisMonth.income - thisMonth.expense}
          tone={thisMonth.income - thisMonth.expense >= 0 ? 'leaf' : 'maple'}
          signed
        />
      </section>

      {/* Twelve-month bars */}
      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <header className="flex items-baseline justify-between">
          <MapleLabel>{selected.slice(0, 4)} · monthly</MapleLabel>
          <div className="flex items-center gap-3 text-[11.5px] text-[var(--color-ink-3)]">
            <Swatch tone="leaf" /> Income
            <Swatch tone="maple" /> Expense
          </div>
        </header>
        <div className="mt-5 grid grid-cols-12 items-end gap-1.5">
          {buckets.map((b) => {
            const ih = (b.income / maxBar) * 100
            const eh = (b.expense / maxBar) * 100
            const isSel = b.month === selected
            return (
              <Link key={b.month} href={`/pnl?month=${b.month}`} className="group flex flex-col items-center gap-1.5">
                <div className="relative flex h-[140px] w-full items-end justify-center gap-0.5">
                  <div
                    className="w-1/2 rounded-t-[3px] transition-all group-hover:opacity-100"
                    style={{
                      height: `${ih}%`,
                      background: 'var(--color-leaf)',
                      opacity: isSel ? 1 : 0.85,
                    }}
                  />
                  <div
                    className="w-1/2 rounded-t-[3px] transition-all"
                    style={{
                      height: `${eh}%`,
                      background: 'var(--color-maple)',
                      opacity: isSel ? 1 : 0.85,
                    }}
                  />
                </div>
                <span
                  className={
                    'text-[10px] font-semibold uppercase tracking-[0.06em] tabular-nums ' +
                    (isSel ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-3)]')
                  }
                >
                  {b.month.slice(5, 7)}
                </span>
              </Link>
            )
          })}
        </div>
        <footer className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-[var(--color-hair)] pt-4 text-[13px] text-[var(--color-ink-2)]">
          <span>
            YTD income{' '}
            <b className="tabular-nums text-[var(--color-ink)]">{formatMoney(ytdIncome)}</b>
          </span>
          <span>
            YTD expense{' '}
            <b className="tabular-nums text-[var(--color-ink)]">{formatMoney(ytdExpense)}</b>
          </span>
          <span>
            YTD net{' '}
            <b
              className="tabular-nums"
              style={{ color: ytdIncome - ytdExpense >= 0 ? 'var(--color-leaf)' : 'var(--color-maple)' }}
            >
              {formatMoney(ytdIncome - ytdExpense)}
            </b>
          </span>
        </footer>
      </section>

      {/* Category breakdown for selected month */}
      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <MapleLabel>Top categories · {monthLabel(selected)}</MapleLabel>
        {topCats.length === 0 ? (
          <p className="mt-4 text-[13.5px] text-[var(--color-ink-2)]">
            No expense splits recorded in {monthLabel(selected)}.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col gap-2.5">
            {topCats.slice(0, 12).map((c) => {
              const pct = (c.cents / topCatMax) * 100
              return (
                <li key={c.id} className="flex items-center gap-3 text-[13.5px]">
                  <span className="w-[140px] shrink-0 truncate text-[var(--color-ink)]">{c.name}</span>
                  <div className="relative h-[26px] flex-1 overflow-hidden rounded-[6px] bg-[var(--color-paper-2)]">
                    <div
                      className="h-full rounded-[6px]"
                      style={{ width: `${pct}%`, background: 'var(--color-maple-soft)' }}
                    />
                  </div>
                  <span className="w-[100px] shrink-0 text-right font-serif text-[15px] tabular-nums text-[var(--color-ink)]">
                    {formatMoney(c.cents)}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  signed,
}: {
  label: string
  value: number
  tone: 'leaf' | 'maple'
  signed?: boolean
}) {
  const color = tone === 'leaf' ? 'var(--color-leaf)' : 'var(--color-maple)'
  const sign = signed && value > 0 ? '+' : signed && value < 0 ? '−' : ''
  return (
    <div className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </div>
      <div
        className="mt-2 font-serif text-[30px] leading-none tracking-[-0.02em] tabular-nums"
        style={{ color }}
      >
        {sign}
        {formatMoney(Math.abs(value))}
      </div>
    </div>
  )
}

function Swatch({ tone }: { tone: 'leaf' | 'maple' }) {
  return (
    <span
      className="inline-block h-[10px] w-[10px] rounded-full"
      style={{ background: tone === 'leaf' ? 'var(--color-leaf)' : 'var(--color-maple)' }}
    />
  )
}
