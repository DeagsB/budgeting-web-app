import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatMoney, monthLabel, monthStartISO } from '@/lib/format'
import { MapleLabel } from '@/components/ui/label'
import { BudgetTable } from './table'

type Category = {
  id: string
  parent_id: string | null
  name: string
  code: string
  rollover_enabled: boolean
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const month =
    params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const nextMonth = addMonths(month, 1)
  const yearStart = `${month.slice(0, 4)}-01-01`
  // Recurring-detection window: the three months immediately before the
  // selected month. We don't include the current month so this view stays
  // the same regardless of how the current month is unfolding.
  const recurringStart = addMonths(month, -3)

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [
    { data: catRows },
    { data: budgetRows },
    { data: txRows },
    { data: yearBudgetRows },
    { data: yearTxRows },
    { data: recurringTxRows },
  ] = await Promise.all([
    supabase
      .from('categories')
      .select('id, parent_id, name, code, rollover_enabled')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('sort_order'),
    supabase
      .from('monthly_budgets')
      .select('category_id, amount_cents')
      .eq('household_id', ctx.householdId)
      .eq('month', month),
    supabase
      .from('transaction_splits')
      .select('category_id, amount_cents, transaction:transactions!inner(occurred_on)')
      .eq('household_id', ctx.householdId)
      .gt('amount_cents', 0)
      .gte('transaction.occurred_on', month)
      .lt('transaction.occurred_on', nextMonth),
    supabase
      .from('monthly_budgets')
      .select('category_id, month, amount_cents')
      .eq('household_id', ctx.householdId)
      .gte('month', yearStart)
      .lte('month', month),
    supabase
      .from('transaction_splits')
      .select('category_id, amount_cents, transaction:transactions!inner(occurred_on)')
      .eq('household_id', ctx.householdId)
      .gt('amount_cents', 0)
      .gte('transaction.occurred_on', yearStart)
      .lt('transaction.occurred_on', nextMonth),
    // Transactions from the prior three months — used to detect recurring
    // patterns. We pull from `transactions` (not splits) because the same
    // logical merchant lives on a single transaction, not split by category.
    supabase
      .from('transactions')
      .select('amount_cents, description, occurred_on, account_id')
      .eq('household_id', ctx.householdId)
      .gt('amount_cents', 0)
      .gte('occurred_on', recurringStart)
      .lt('occurred_on', month)
      .order('occurred_on'),
  ])

  const categories: Category[] = (catRows ?? []) as Category[]
  const parentOf = new Map<string, string | null>(categories.map((c) => [c.id, c.parent_id]))

  const actualDirect = new Map<string, number>()
  for (const tx of txRows ?? []) {
    if (!tx.category_id) continue
    actualDirect.set(tx.category_id, (actualDirect.get(tx.category_id) ?? 0) + Number(tx.amount_cents))
  }
  const actualRolled = new Map<string, number>()
  for (const c of categories) actualRolled.set(c.id, actualDirect.get(c.id) ?? 0)
  for (const c of categories) {
    if (!c.parent_id) continue
    actualRolled.set(c.parent_id, (actualRolled.get(c.parent_id) ?? 0) + (actualDirect.get(c.id) ?? 0))
  }

  const budgetByCat = new Map<string, number>()
  for (const b of budgetRows ?? []) budgetByCat.set(b.category_id, Number(b.amount_cents))

  const ytdBudget = new Map<string, number>()
  for (const b of yearBudgetRows ?? [])
    ytdBudget.set(b.category_id, (ytdBudget.get(b.category_id) ?? 0) + Number(b.amount_cents))

  const ytdActualDirect = new Map<string, number>()
  for (const tx of yearTxRows ?? []) {
    if (!tx.category_id) continue
    ytdActualDirect.set(tx.category_id, (ytdActualDirect.get(tx.category_id) ?? 0) + Number(tx.amount_cents))
  }
  const ytdActualRolled = new Map<string, number>()
  for (const c of categories) ytdActualRolled.set(c.id, ytdActualDirect.get(c.id) ?? 0)
  for (const c of categories) {
    if (!c.parent_id) continue
    ytdActualRolled.set(
      c.parent_id,
      (ytdActualRolled.get(c.parent_id) ?? 0) + (ytdActualDirect.get(c.id) ?? 0),
    )
  }

  const rolloverCredit = new Map<string, number>()
  for (const c of categories) {
    if (!c.rollover_enabled) continue
    const priorBudget = (ytdBudget.get(c.id) ?? 0) - (budgetByCat.get(c.id) ?? 0)
    const priorActual = (ytdActualDirect.get(c.id) ?? 0) - (actualDirect.get(c.id) ?? 0)
    const credit = priorBudget - priorActual
    if (credit !== 0) rolloverCredit.set(c.id, credit)
  }

  const totalBudget = Array.from(budgetByCat.entries())
    .filter(([id]) => !parentOf.get(id))
    .reduce((s, [, v]) => s + v, 0)
  const totalActual = categories
    .filter((c) => !c.parent_id)
    .reduce((s, c) => s + (actualRolled.get(c.id) ?? 0), 0)
  const monthVariance = totalActual - totalBudget
  const pctUsed = totalBudget > 0 ? Math.min(1.2, totalActual / totalBudget) : 0

  // Compact "X of N budgeted" + top-spending categories for the hero peek.
  // Uses top-level (parent) categories so we don't double-count children.
  const topLevel = categories.filter((c) => !c.parent_id)
  const budgetedTopLevel = topLevel.filter((c) => (budgetByCat.get(c.id) ?? 0) > 0)
  const topCategories = budgetedTopLevel
    .map((c) => {
      const budget = budgetByCat.get(c.id) ?? 0
      const actual = actualRolled.get(c.id) ?? 0
      return { id: c.id, name: c.name, budget, actual }
    })
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 4)

  // Month-focused stats: how many budgeted categories are already over,
  // and a pace-based projection of where this month is headed.
  const categoriesOver = budgetedTopLevel.filter(
    (c) => (actualRolled.get(c.id) ?? 0) > (budgetByCat.get(c.id) ?? 0),
  ).length

  // Recurring-transaction detection. Group prior-3-month transactions by a
  // (normalized description, exact amount) key. Any group that appeared in
  // ≥ 2 distinct months is treated as recurring. We sum one occurrence per
  // group to approximate the monthly recurring outflow.
  type RecurringRow = { amount_cents: number; description: string | null; occurred_on: string }
  const recurringRows = (recurringTxRows ?? []) as RecurringRow[]
  const groups = new Map<string, { description: string; amount: number; months: Set<string> }>()
  for (const tx of recurringRows) {
    const desc = (tx.description ?? '').trim()
    if (!desc) continue
    const norm = desc.toLowerCase().replace(/\s+/g, ' ').replace(/[#0-9]+$/, '').trim()
    const amt = Number(tx.amount_cents)
    if (!Number.isFinite(amt) || amt <= 0) continue
    const key = `${norm}|${amt}`
    const monthKey = tx.occurred_on.slice(0, 7) // YYYY-MM
    const existing = groups.get(key)
    if (existing) existing.months.add(monthKey)
    else groups.set(key, { description: desc, amount: amt, months: new Set([monthKey]) })
  }
  const recurring = Array.from(groups.values())
    .filter((g) => g.months.size >= 2)
    .map((g) => ({
      description: g.description,
      amount_cents: g.amount,
      monthsSeen: g.months.size,
    }))
    .sort((a, b) => b.amount_cents - a.amount_cents)

  const recurringMonthlyTotal = recurring.reduce((s, g) => s + g.amount_cents, 0)
  const recurringTop = recurring.slice(0, 3)
  // What share of this month's budget is already locked in to recurring spend?
  const recurringShareOfBudget =
    totalBudget > 0 ? Math.round((recurringMonthlyTotal / totalBudget) * 100) : null

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Budgets · {monthLabel(month)}
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
          The plan, in dollars.
        </h1>
      </header>

      <nav className="grid grid-cols-3 gap-2 text-[13px]">
        <Link
          href={{ pathname: '/budgets', query: { month: addMonths(month, -1) } }}
          className="inline-flex items-center justify-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-2 font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          ← Previous
        </Link>
        <Link
          href={{ pathname: '/budgets', query: { month: monthStartISO() } }}
          className="inline-flex items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper-2)] px-3 py-2 font-semibold text-[var(--color-ink)]"
        >
          This month
        </Link>
        <Link
          href={{ pathname: '/budgets', query: { month: addMonths(month, 1) } }}
          className="inline-flex items-center justify-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-2 font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          Next →
        </Link>
      </nav>

      {/* Big progress hero */}
      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <MapleLabel>This month</MapleLabel>
            <div className="mt-1 font-serif text-[28px] leading-tight tracking-[-0.02em] text-[var(--color-ink)] md:text-[34px]">
              {formatMoney(totalActual)}{' '}
              <span className="text-[var(--color-ink-3)]">of {formatMoney(totalBudget)}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-[var(--color-ink-2)]">
              <span className="font-semibold tabular-nums text-[var(--color-ink)]">
                {budgetedTopLevel.length}
              </span>{' '}
              of <span className="tabular-nums">{topLevel.length}</span> categories budgeted
            </div>
          </div>
          <span
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums"
            style={{
              background: monthVariance <= 0 ? 'var(--color-leaf-soft)' : 'var(--color-maple-soft)',
              color: monthVariance <= 0 ? 'var(--color-leaf)' : 'var(--color-maple)',
            }}
          >
            {monthVariance <= 0
              ? `${formatMoney(-monthVariance)} under`
              : `${formatMoney(monthVariance)} over`}
          </span>
        </div>
        {/* Progress bar. When over budget, the bar fills the full track but
            splits at the budget-100% mark — leaf for the budgeted portion,
            maple for the overage — with a paper-colored tick line at the
            boundary so the 100% mark stays visible. */}
        <ProgressBar pctUsed={pctUsed} />

        {/* Top-spending budgeted categories — quick glance before the full
            table. Mini bars match the hero's tone: leaf when within budget,
            maple when over. */}
        {topCategories.length > 0 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {topCategories.map((c) => {
              const pct = c.budget > 0 ? Math.min(1.2, c.actual / c.budget) : 0
              const over = c.actual > c.budget
              return (
                <div key={c.id} className="rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-paper-2)] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate text-[12.5px] font-semibold text-[var(--color-ink)]">
                      {c.name}
                    </div>
                    <div
                      className="shrink-0 text-[11px] font-semibold tabular-nums"
                      style={{ color: over ? 'var(--color-maple)' : 'var(--color-ink-2)' }}
                    >
                      {Math.round(pct * 100)}%
                    </div>
                  </div>
                  <div className="mt-1.5 h-[6px] overflow-hidden rounded-full bg-[var(--color-paper)]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.round(pct * 100))}%`,
                        background: over ? 'var(--color-maple)' : 'var(--color-leaf)',
                      }}
                    />
                  </div>
                  <div className="mt-1.5 text-[11.5px] tabular-nums text-[var(--color-ink-3)]">
                    <span style={{ color: over ? 'var(--color-maple)' : 'var(--color-ink)' }}>
                      {formatMoney(c.actual)}
                    </span>{' '}
                    of {formatMoney(c.budget)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <RecurringInsight
          total={recurringMonthlyTotal}
          count={recurring.length}
          shareOfBudget={recurringShareOfBudget}
          top={recurringTop}
        />
        <Tile
          label="Over budget"
          value={`${categoriesOver} of ${budgetedTopLevel.length}`}
          tone={categoriesOver > 0 ? 'maple' : 'leaf'}
          hint={
            budgetedTopLevel.length === 0
              ? 'No budgets configured yet'
              : categoriesOver === 0
                ? 'Every category on track this month'
                : `${categoriesOver} categor${categoriesOver === 1 ? 'y' : 'ies'} need${categoriesOver === 1 ? 's' : ''} attention`
          }
        />
      </section>

      <details className="group rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 md:px-6">
          <div className="flex items-center gap-2">
            <MapleLabel>Categories</MapleLabel>
            <span className="text-[11.5px] text-[var(--color-ink-3)]">
              {budgetedTopLevel.length} of {topLevel.length} budgeted
            </span>
          </div>
          <Chevron />
        </summary>
        <div className="border-t border-[var(--color-hair)]">
          <BudgetTable
            month={month}
            categories={categories}
            budgetByCat={Object.fromEntries(budgetByCat)}
            actualRolled={Object.fromEntries(actualRolled)}
            actualDirect={Object.fromEntries(actualDirect)}
            ytdBudget={Object.fromEntries(ytdBudget)}
            ytdActualRolled={Object.fromEntries(ytdActualRolled)}
            rolloverCredit={Object.fromEntries(rolloverCredit)}
          />
        </div>
      </details>

      <p className="rounded-[14px] border border-[var(--color-hair)] bg-[var(--color-paper-2)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
        Actuals count outflows only. Paycheques and other inflows appear on P&amp;L. Parent-category
        totals include their children. <span className="font-semibold text-[var(--color-ink)]">Rollover</span>{' '}
        categories carry last month&rsquo;s surplus or deficit into this month&rsquo;s effective budget.
      </p>
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone: 'ink' | 'leaf' | 'maple'
  hint?: string
}) {
  const color =
    tone === 'leaf' ? 'var(--color-leaf)' : tone === 'maple' ? 'var(--color-maple)' : 'var(--color-ink)'
  return (
    <div className="rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 md:p-5">
      <MapleLabel>{label}</MapleLabel>
      <div
        className="mt-1.5 font-serif text-[22px] leading-tight tracking-[-0.02em] tabular-nums md:text-[26px]"
        style={{ color }}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-[12px] text-[var(--color-ink-3)]">{hint}</div>}
    </div>
  )
}

function RecurringInsight({
  total,
  count,
  shareOfBudget,
  top,
}: {
  total: number
  count: number
  shareOfBudget: number | null
  top: { description: string; amount_cents: number; monthsSeen: number }[]
}) {
  if (count === 0) {
    return (
      <div className="rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 md:p-5">
        <MapleLabel>Recurring</MapleLabel>
        <div className="mt-1.5 font-serif text-[22px] leading-tight tracking-[-0.02em] text-[var(--color-ink-3)] md:text-[26px]">
          —
        </div>
        <div className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-3)]">
          Nothing yet. Once a transaction with the same description and amount lands in 2+ of the last 3 months, it&rsquo;ll show up here.
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <MapleLabel>Recurring</MapleLabel>
        <span className="text-[10.5px] tabular-nums text-[var(--color-ink-3)]">
          {count} item{count === 1 ? '' : 's'}
        </span>
      </div>
      <div className="mt-1.5 font-serif text-[22px] leading-tight tracking-[-0.02em] tabular-nums text-[var(--color-ink)] md:text-[26px]">
        {formatMoney(total)}
        <span className="text-[14px] font-normal text-[var(--color-ink-3)]">/mo</span>
      </div>
      <div className="mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
        {shareOfBudget !== null ? `${shareOfBudget}% of this month's budget is locked in` : 'detected from last 3 months'}
      </div>
      {top.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-[var(--color-hair)] pt-3">
          {top.map((g) => (
            <li key={g.description + g.amount_cents} className="flex items-baseline gap-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">{g.description}</span>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
                style={{ background: 'var(--color-paper-2)', color: 'var(--color-ink-3)' }}
                title={`Seen in ${g.monthsSeen} of last 3 months`}
              >
                {g.monthsSeen}/3
              </span>
              <span className="shrink-0 font-serif text-[13px] tabular-nums text-[var(--color-ink-2)]">
                {formatMoney(g.amount_cents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProgressBar({ pctUsed }: { pctUsed: number }) {
  const over = pctUsed > 1
  // When over, breakpoint% of the bar is the budgeted portion; the rest is
  // overage. The bar always fills the track when over, so the breakpoint
  // visually pins the "100% of budget" location.
  const breakpoint = over ? 100 / pctUsed : null
  return (
    <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--color-paper-2)]">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: over ? '100%' : `${Math.round(pctUsed * 100)}%`,
          background: over
            ? `linear-gradient(to right, var(--color-leaf) 0%, var(--color-leaf) ${breakpoint}%, var(--color-maple) ${breakpoint}%, var(--color-maple) 100%)`
            : 'var(--color-leaf)',
        }}
      />
      {breakpoint !== null && (
        <div
          className="pointer-events-none absolute inset-y-0 w-[2px] bg-[var(--color-paper)]"
          style={{ left: `calc(${breakpoint}% - 1px)` }}
          aria-label="100% of budget"
        />
      )}
    </div>
  )
}

// Used inside the collapsible <summary>; rotates 180° when the parent
// <details> opens via group-open:rotate-180.
function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--color-ink-3)] transition-transform group-open:rotate-180"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
