import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney, monthLabel, monthStartISO, addMonths } from '@/lib/format'
import { MapleLabel } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { MonthNav } from '@/components/ui/month-nav'
import { StatTile } from '@/components/ui/stat-tile'
import { Card } from '@/components/ui/card'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { colorForCategory } from '@/lib/category-colors'
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
      .select('amount_cents, occurred_on')
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

  // No `direction` column — sign convention is amount_cents > 0 means an
  // outflow (expense) and amount_cents < 0 means an inflow (income).
  for (const t of txs ?? []) {
    const i = idx(t.occurred_on as string)
    if (i < 0) continue
    const raw = Number(t.amount_cents)
    if (raw > 0) buckets[i].expense += raw
    else if (raw < 0) buckets[i].income += -raw
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
  const net = thisMonth.income - thisMonth.expense
  const ytdNet = ytdIncome - ytdExpense

  const maxBar = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expense)))
  const topCatMax = Math.max(1, ...topCats.map((c) => c.cents))
  const topCatTotal = topCats.reduce((s, c) => s + c.cents, 0)

  // True when there's no activity at all this year — drives the empty state.
  const hasAnyActivity = buckets.some((b) => b.income > 0 || b.expense > 0)

  const makeHref = (iso: string) =>
    iso === monthStartISO() ? '/pnl' : `/pnl?month=${iso}`

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header + month nav stack on mobile, sit side-by-side from sm: up. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader eyebrow="Profit & Loss" title="What came in, what went out." />
        <MonthNav monthISO={selected} makeHref={makeHref} className="-ml-2 flex-wrap" />
      </div>

      {!hasAnyActivity ? (
        <EmptyState
          title={`Nothing recorded for ${selected.slice(0, 4)}`}
          body="Your profit & loss fills in as transactions land. Import a statement to see income and expenses month by month."
          action={
            <Link href="/transactions/import">
              <Button variant="primary" size="md">
                Import transactions
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Hero numbers */}
          <section className="grid gap-3 md:grid-cols-3">
            <StatTile
              label={`${monthLabel(selected)} income`}
              tone="leaf"
              value={<Amount cents={thisMonth.income} tone="leaf" />}
            />
            <StatTile
              label={`${monthLabel(selected)} expenses`}
              tone="maple"
              value={<Amount cents={thisMonth.expense} tone="maple" />}
            />
            <StatTile
              label={`${monthLabel(selected)} net`}
              tone={net >= 0 ? 'leaf' : 'maple'}
              value={<Amount cents={net} sign="always" tone={net >= 0 ? 'leaf' : 'maple'} />}
              hint={net >= 0 ? 'surplus' : 'shortfall'}
            />
          </section>

          {/* Twelve-month bars. The chart scrolls inside its own wrapper on
              very small screens so the *page* never scrolls horizontally. */}
          <Card padding="lg">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <MapleLabel>{selected.slice(0, 4)} · monthly</MapleLabel>
              <div className="flex items-center gap-3 text-[11.5px] text-ink-3">
                <Swatch tone="leaf" /> Income
                <Swatch tone="maple" /> Expense
              </div>
            </header>
            <div className="-mx-1 mt-5 overflow-x-auto hide-scroll">
              <div className="grid min-w-[440px] grid-cols-12 items-end gap-1.5">
                {buckets.map((b) => {
                  const ih = (b.income / maxBar) * 100
                  const eh = (b.expense / maxBar) * 100
                  const isSel = b.month === selected
                  return (
                    <Link
                      key={b.month}
                      href={makeHref(b.month)}
                      aria-label={`View ${monthLabel(b.month)} — income ${formatMoney(b.income)}, expense ${formatMoney(b.expense)}`}
                      className="group flex min-w-0 flex-col items-center gap-1.5"
                    >
                      <div className="relative flex h-[140px] w-full items-end justify-center gap-0.5">
                        <div
                          className={`w-1/2 rounded-t-sm bg-leaf transition-all group-hover:opacity-100 ${isSel ? 'opacity-100' : 'opacity-85'}`}
                          style={{ height: `${ih}%` }}
                        />
                        <div
                          className={`w-1/2 rounded-t-sm bg-maple transition-all ${isSel ? 'opacity-100' : 'opacity-85'}`}
                          style={{ height: `${eh}%` }}
                        />
                      </div>
                      <span
                        className={
                          'text-[10px] font-semibold uppercase tracking-[0.06em] tabular-nums ' +
                          (isSel ? 'text-ink' : 'text-ink-3')
                        }
                      >
                        {b.month.slice(5, 7)}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
            <footer className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-hair pt-4 text-[13px] text-ink-2">
              <span>
                YTD income <Amount cents={ytdIncome} tone="leaf" className="text-[13px]" />
              </span>
              <span>
                YTD expense <Amount cents={ytdExpense} tone="maple" className="text-[13px]" />
              </span>
              <span>
                YTD net{' '}
                <Amount
                  cents={ytdNet}
                  sign="always"
                  tone={ytdNet >= 0 ? 'leaf' : 'maple'}
                  className="text-[13px]"
                />
              </span>
            </footer>
          </Card>

          {/* Category breakdown for selected month. Each row stacks the name
              above its bar on mobile so labels never crowd the bar, and sits
              on one row from sm: up. The share-of-spend % rides on a token
              surface chip (no mix-blend) so it's legible on any bar colour. */}
          <Card padding="lg">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
              <MapleLabel>Top categories · {monthLabel(selected)}</MapleLabel>
              {topCatTotal > 0 && (
                <span className="text-[11.5px] text-ink-3">
                  <Amount cents={topCatTotal} className="text-[11.5px]" /> total
                </span>
              )}
            </div>
            {topCats.length === 0 ? (
              <p className="mt-4 text-[13.5px] text-ink-2">
                No expense splits recorded in {monthLabel(selected)}.
              </p>
            ) : (
              <ol className="mt-4 flex flex-col gap-3">
                {topCats.slice(0, 12).map((c) => {
                  // Bar width is share of the largest category so the biggest
                  // always fills 100%. Share-of-total is shown as a percentage.
                  const widthPct = (c.cents / topCatMax) * 100
                  const sharePct = topCatTotal > 0 ? Math.round((c.cents / topCatTotal) * 100) : 0
                  const color = colorForCategory(c.name)
                  return (
                    <li
                      key={c.id}
                      className="flex flex-col gap-1.5 text-[13.5px] sm:flex-row sm:items-center sm:gap-3"
                    >
                      <div className="flex items-baseline justify-between gap-3 sm:w-[160px] sm:shrink-0 sm:justify-start">
                        <span className="truncate text-ink">{c.name}</span>
                        <span className="font-serif text-[15px] tabular-nums text-ink sm:hidden">
                          {formatMoney(c.cents)}
                        </span>
                      </div>
                      <div className="relative h-[28px] flex-1 overflow-hidden rounded-md bg-paper-2">
                        <div
                          className="h-full rounded-md transition-all duration-300"
                          style={{ width: `${widthPct}%`, background: color }}
                          role="progressbar"
                          aria-valuenow={sharePct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${c.name}: ${sharePct}% of spend`}
                        />
                        <span className="absolute inset-y-0 right-0 flex items-center pr-1.5">
                          <span className="rounded-full bg-cream-2 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-2">
                            {sharePct}%
                          </span>
                        </span>
                      </div>
                      <span className="hidden w-[100px] shrink-0 text-right font-serif text-[15px] tabular-nums text-ink sm:block">
                        {formatMoney(c.cents)}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Swatch({ tone }: { tone: 'leaf' | 'maple' }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[10px] w-[10px] rounded-full ${tone === 'leaf' ? 'bg-leaf' : 'bg-maple'}`}
    />
  )
}
