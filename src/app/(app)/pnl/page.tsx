import { Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatMoney, monthLabel, monthStartISO } from '@/lib/format'

type Category = {
  id: string
  parent_id: string | null
  name: string
}

export default async function PnLPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const month =
    params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const nextMonth = addMonths(month, 1)

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [{ data: catRows }, { data: txRows }, { data: splitRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, parent_id, name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('transactions')
      .select('id, amount_cents, member_id')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', month)
      .lt('occurred_on', nextMonth),
    supabase
      .from('transaction_splits')
      .select('category_id, amount_cents, transaction:transactions!inner(occurred_on)')
      .eq('household_id', ctx.householdId)
      .gt('amount_cents', 0)
      .gte('transaction.occurred_on', month)
      .lt('transaction.occurred_on', nextMonth),
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
  ])

  const categories: Category[] = (catRows ?? []) as Category[]
  const memberName = new Map((memberRows ?? []).map((m) => [m.id, m.display_name]))

  // Income = negative transaction totals, grouped by member (income rarely
  // benefits from being split by category so we keep the member-level view).
  const incomeByMember: Record<string, number> = {}
  let totalIncome = 0
  let totalExpense = 0

  for (const tx of txRows ?? []) {
    const amt = Number(tx.amount_cents)
    if (amt < 0) {
      const key = tx.member_id ?? '__shared__'
      incomeByMember[key] = (incomeByMember[key] ?? 0) - amt
      totalIncome += -amt
    } else if (amt > 0) {
      totalExpense += amt
    }
  }

  // Expense by category (roll up to parent), sourced from splits.
  const expenseDirect: Record<string, number> = {}
  const expenseRolled: Record<string, number> = {}
  for (const s of splitRows ?? []) {
    if (!s.category_id) continue
    expenseDirect[s.category_id] = (expenseDirect[s.category_id] ?? 0) + Number(s.amount_cents)
  }
  for (const c of categories) expenseRolled[c.id] = expenseDirect[c.id] ?? 0
  for (const c of categories) {
    if (!c.parent_id) continue
    expenseRolled[c.parent_id] =
      (expenseRolled[c.parent_id] ?? 0) + (expenseDirect[c.id] ?? 0)
  }

  const parents = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)

  const net = totalIncome - totalExpense

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Profit &amp; Loss</h1>
          <p className="mt-1 text-sm text-gray-500">{monthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={{ pathname: '/pnl', query: { month: addMonths(month, -1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            ← Previous
          </Link>
          <Link
            href={{ pathname: '/pnl', query: { month: monthStartISO() } }}
            className="text-gray-500 hover:text-gray-900"
          >
            This month
          </Link>
          <Link
            href={{ pathname: '/pnl', query: { month: addMonths(month, 1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            Next →
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Tile label="Income" value={formatMoney(totalIncome)} color="text-green-700" />
        <Tile label="Expenses" value={formatMoney(totalExpense)} color="text-red-700" />
        <Tile
          label="Net"
          value={formatMoney(net)}
          color={net >= 0 ? 'text-green-700' : 'text-red-700'}
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-6 py-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Income
        </h2>
        {Object.keys(incomeByMember).length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-500">No income logged this month.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {Object.entries(incomeByMember)
              .sort((a, b) => b[1] - a[1])
              .map(([key, amount]) => (
                <li key={key} className="flex items-center justify-between px-6 py-2 text-sm">
                  <span>{key === '__shared__' ? 'Shared / unassigned' : (memberName.get(key) ?? 'Removed member')}</span>
                  <span className="tabular-nums text-green-700">{formatMoney(amount)}</span>
                </li>
              ))}
            <li className="flex items-center justify-between bg-gray-50 px-6 py-2 text-sm font-medium">
              <span>Total income</span>
              <span className="tabular-nums">{formatMoney(totalIncome)}</span>
            </li>
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-6 py-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Expenses by category
        </h2>
        {totalExpense === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-500">No expenses logged this month.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {parents.map((p) => {
                const sum = expenseRolled[p.id] ?? 0
                if (sum === 0) return null
                const kids = childrenOf(p.id)
                return (
                  <Fragment key={p.id}>
                    <tr className="bg-gray-50/50">
                      <td className="px-6 py-2 font-medium text-gray-900">{p.name}</td>
                      <td className="px-6 py-2 text-right tabular-nums text-red-700">
                        {formatMoney(sum)}
                      </td>
                    </tr>
                    {kids.map((c) => {
                      const amt = expenseDirect[c.id] ?? 0
                      if (amt === 0) return null
                      return (
                        <tr key={c.id}>
                          <td className="px-6 py-2 pl-14 text-gray-700">↳ {c.name}</td>
                          <td className="px-6 py-2 text-right tabular-nums text-red-700">
                            {formatMoney(amt)}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
              <tr className="bg-gray-100 font-semibold">
                <td className="px-6 py-2">Total expenses</td>
                <td className="px-6 py-2 text-right tabular-nums">{formatMoney(totalExpense)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
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
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color ?? 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  )
}
