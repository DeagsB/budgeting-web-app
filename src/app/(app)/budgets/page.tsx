import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatMoney, monthLabel, monthStartISO } from '@/lib/format'
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

  // Roll up descendants into parent totals for actuals
  const actualDirect = new Map<string, number>()
  for (const tx of txRows ?? []) {
    if (!tx.category_id) continue
    actualDirect.set(
      tx.category_id,
      (actualDirect.get(tx.category_id) ?? 0) + Number(tx.amount_cents),
    )
  }
  const actualRolled = new Map<string, number>()
  for (const c of categories) actualRolled.set(c.id, actualDirect.get(c.id) ?? 0)
  for (const c of categories) {
    if (!c.parent_id) continue
    actualRolled.set(
      c.parent_id,
      (actualRolled.get(c.parent_id) ?? 0) + (actualDirect.get(c.id) ?? 0),
    )
  }

  const budgetByCat = new Map<string, number>()
  for (const b of budgetRows ?? []) budgetByCat.set(b.category_id, Number(b.amount_cents))

  // Year-to-date cumulative (sheet 6): total budgeted vs total actual per category
  // across all months from year start through selected month.
  const ytdBudget = new Map<string, number>()
  for (const b of yearBudgetRows ?? [])
    ytdBudget.set(b.category_id, (ytdBudget.get(b.category_id) ?? 0) + Number(b.amount_cents))

  const ytdActualDirect = new Map<string, number>()
  for (const tx of yearTxRows ?? []) {
    if (!tx.category_id) continue
    ytdActualDirect.set(
      tx.category_id,
      (ytdActualDirect.get(tx.category_id) ?? 0) + Number(tx.amount_cents),
    )
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

  // Rollover credit per category: for categories with rollover_enabled, the
  // prior-months (budget − actual) carries into this month as extra budget.
  // Negative credit means prior overspend reduces this month's budget.
  const rolloverCredit = new Map<string, number>()
  for (const c of categories) {
    if (!c.rollover_enabled) continue
    const priorBudget = (ytdBudget.get(c.id) ?? 0) - (budgetByCat.get(c.id) ?? 0)
    const priorActual = (ytdActualDirect.get(c.id) ?? 0) - (actualDirect.get(c.id) ?? 0)
    const credit = priorBudget - priorActual
    if (credit !== 0) rolloverCredit.set(c.id, credit)
  }

  const totalBudget = Array.from(budgetByCat.entries())
    .filter(([id]) => !parentOf.get(id)) // sum parents only to avoid double-count
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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Budgets</h1>
          <p className="mt-1 text-sm text-gray-500">{monthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={{ pathname: '/budgets', query: { month: addMonths(month, -1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            ← Previous
          </Link>
          <Link
            href={{ pathname: '/budgets', query: { month: monthStartISO() } }}
            className="text-gray-500 hover:text-gray-900"
          >
            This month
          </Link>
          <Link
            href={{ pathname: '/budgets', query: { month: addMonths(month, 1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            Next →
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <Tile label="Budgeted (month)" value={formatMoney(totalBudget)} />
        <Tile label="Actual (month)" value={formatMoney(totalActual)} />
        <Tile
          label="Variance (month)"
          value={formatMoney(totalActual - totalBudget)}
          color={
            totalActual - totalBudget > 0
              ? 'text-red-700'
              : totalActual - totalBudget < 0
                ? 'text-green-700'
                : 'text-gray-900'
          }
        />
        <Tile
          label="YTD cumulative variance"
          value={formatMoney(totalYtdActual - totalYtdBudget)}
          color={
            totalYtdActual - totalYtdBudget > 0
              ? 'text-red-700'
              : totalYtdActual - totalYtdBudget < 0
                ? 'text-green-700'
                : 'text-gray-900'
          }
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

      <p className="text-xs text-gray-500">
        Actuals count outflows only (positive amounts). Paycheques and other inflows show on the
        P&amp;L view. Parent-category actuals include their children. Rollover categories (flagged
        on the Categories page) add prior-month surplus/deficit to this month&apos;s effective
        budget.
      </p>
    </div>
  )
}

function Tile({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color ?? 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  )
}
