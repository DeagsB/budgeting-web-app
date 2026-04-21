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

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [
    { data: catRows },
    { data: budgetRows },
    { data: txRows },
    { data: yearBudgetRows },
    { data: yearTxRows },
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
  const totalYtdBudget = Array.from(ytdBudget.entries())
    .filter(([id]) => !parentOf.get(id))
    .reduce((s, [, v]) => s + v, 0)
  const totalYtdActual = categories
    .filter((c) => !c.parent_id)
    .reduce((s, c) => s + (ytdActualRolled.get(c.id) ?? 0), 0)

  const monthVariance = totalActual - totalBudget
  const ytdVariance = totalYtdActual - totalYtdBudget
  const pctUsed = totalBudget > 0 ? Math.min(1.2, totalActual / totalBudget) : 0

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

      <nav className="flex items-center gap-1 text-[13px]">
        <Link
          href={{ pathname: '/budgets', query: { month: addMonths(month, -1) } }}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          ← Previous
        </Link>
        <Link
          href={{ pathname: '/budgets', query: { month: monthStartISO() } }}
          className="inline-flex items-center rounded-full px-3 py-1.5 font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          This month
        </Link>
        <Link
          href={{ pathname: '/budgets', query: { month: addMonths(month, 1) } }}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
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
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--color-paper-2)]">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, Math.round(pctUsed * 100))}%`,
              background: pctUsed > 1 ? 'var(--color-maple)' : 'var(--color-leaf)',
            }}
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Tile
          label="YTD budgeted"
          value={formatMoney(totalYtdBudget)}
          tone="ink"
        />
        <Tile
          label="YTD variance"
          value={formatMoney(ytdVariance)}
          tone={ytdVariance > 0 ? 'maple' : ytdVariance < 0 ? 'leaf' : 'ink'}
          hint={ytdVariance <= 0 ? 'Under budget year-to-date' : 'Over budget year-to-date'}
        />
      </section>

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
