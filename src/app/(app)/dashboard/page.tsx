import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney, monthStartISO, monthLabel } from '@/lib/format'

export default async function DashboardPage() {
  const supabase = await createClient()
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const month = monthStartISO()

  const [{ data: members }, { data: accounts }, { count: txCount }] = await Promise.all([
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('accounts')
      .select('id, name, type, opening_balance_cents')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null),
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', month),
  ])

  const openingTotal = (accounts ?? []).reduce(
    (sum, a) => sum + Number(a.opening_balance_cents),
    0,
  )

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">{monthLabel(month)}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Tile label="Members" value={String((members ?? []).length)} />
        <Tile label="Accounts" value={String((accounts ?? []).length)} />
        <Tile label="Transactions this month" value={String(txCount ?? 0)} />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Opening balances (sum across accounts)
        </h2>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(openingTotal)}</p>
        <p className="mt-1 text-xs text-gray-500">
          Running balances will land once transactions are wired up.
        </p>
      </section>

      <section className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
        <p className="font-medium text-gray-700">Next to build</p>
        <ul className="mt-2 list-disc pl-5 text-gray-500">
          <li>Members, accounts, categories editors</li>
          <li>Transaction ledger (workbook sheet 4)</li>
          <li>Budget vs Actual + accumulated surplus/deficit (sheets 5, 6)</li>
          <li>Balance sheet, investment growth, loan + contribution trackers</li>
        </ul>
      </section>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}
