import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatMoney, monthLabel, monthStartISO } from '@/lib/format'
import { accountTypeLabel, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { BalanceSheetForm } from './form'

type Account = {
  id: string
  name: string
  type: AccountType
  ownership: string
  member_id: string | null
  opening_balance_cents: number
  archived_at: string | null
}

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const month =
    params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const prevMonth = addMonths(month, -1)

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [
    { data: accountRows },
    { data: memberRows },
    { data: snapshotsThisMonth },
    { data: snapshotsPrevMonth },
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, ownership, member_id, opening_balance_cents, archived_at')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('account_balance_snapshots')
      .select('account_id, balance_cents')
      .eq('household_id', ctx.householdId)
      .eq('as_of_month', month),
    supabase
      .from('account_balance_snapshots')
      .select('account_id, balance_cents')
      .eq('household_id', ctx.householdId)
      .eq('as_of_month', prevMonth),
  ])

  const accounts: Account[] = (accountRows ?? []) as Account[]
  const memberName = new Map((memberRows ?? []).map((m) => [m.id, m.display_name]))
  const currByAcct = new Map<string, number>()
  for (const s of snapshotsThisMonth ?? []) currByAcct.set(s.account_id, Number(s.balance_cents))
  const prevByAcct = new Map<string, number>()
  for (const s of snapshotsPrevMonth ?? []) prevByAcct.set(s.account_id, Number(s.balance_cents))

  // If no snapshot for the month, fall back to opening balance.
  const effectiveBalance = (a: Account) =>
    currByAcct.get(a.id) ?? Number(a.opening_balance_cents)

  let assets = 0
  let liabilities = 0
  for (const a of accounts) {
    const bal = effectiveBalance(a)
    if (LIABILITY_TYPES.has(a.type)) liabilities += bal
    else assets += bal
  }
  const netWorth = assets - liabilities

  let prevAssets = 0
  let prevLiabilities = 0
  for (const a of accounts) {
    const bal = prevByAcct.get(a.id) ?? Number(a.opening_balance_cents)
    if (LIABILITY_TYPES.has(a.type)) prevLiabilities += bal
    else prevAssets += bal
  }
  const prevNet = prevAssets - prevLiabilities
  const netChange = netWorth - prevNet

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Balance sheet</h1>
          <p className="mt-1 text-sm text-gray-500">As of end of {monthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={{ pathname: '/balance-sheet', query: { month: addMonths(month, -1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            ← Previous
          </Link>
          <Link
            href={{ pathname: '/balance-sheet', query: { month: monthStartISO() } }}
            className="text-gray-500 hover:text-gray-900"
          >
            This month
          </Link>
          <Link
            href={{ pathname: '/balance-sheet', query: { month: addMonths(month, 1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            Next →
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <Tile label="Assets" value={formatMoney(assets)} />
        <Tile label="Liabilities" value={formatMoney(liabilities)} />
        <Tile
          label="Net worth"
          value={formatMoney(netWorth)}
          color={netWorth >= 0 ? 'text-green-700' : 'text-red-700'}
        />
        <Tile
          label={`Change vs ${monthLabel(prevMonth)}`}
          value={formatMoney(netChange)}
          color={
            netChange > 0 ? 'text-green-700' : netChange < 0 ? 'text-red-700' : 'text-gray-900'
          }
        />
      </section>

      {accounts.length === 0 ? (
        <section className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          Add accounts first.{' '}
          <Link href="/accounts" className="font-medium text-gray-900 underline">
            Go to accounts
          </Link>
          .
        </section>
      ) : (
        <BalanceSheetForm
          month={month}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            typeLabel: accountTypeLabel(a.type),
            memberName: a.member_id ? (memberName.get(a.member_id) ?? null) : null,
            ownership: a.ownership,
            opening_balance_cents: Number(a.opening_balance_cents),
            current_balance_cents: currByAcct.get(a.id) ?? null,
            previous_balance_cents: prevByAcct.get(a.id) ?? null,
            is_liability: LIABILITY_TYPES.has(a.type),
          }))}
        />
      )}

      <p className="text-xs text-gray-500">
        Loans and credit cards are treated as liabilities. Leave a balance blank to fall back to
        the account&apos;s opening balance for this month.
      </p>
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color ?? 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  )
}
