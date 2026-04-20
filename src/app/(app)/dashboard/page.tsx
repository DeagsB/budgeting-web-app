import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatMoney, monthLabel, monthStartISO } from '@/lib/format'
import { LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { Sparkline, type SparklinePoint } from '@/components/sparkline'

export default async function DashboardPage() {
  const supabase = await createClient()
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const currentMonth = monthStartISO()
  const earliestMonth = addMonths(currentMonth, -11) // 12-point trend

  const [{ data: members }, { data: accountRows }, { count: txCount }, { data: snapshots }, { data: txTrend }] =
    await Promise.all([
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
        .gte('occurred_on', currentMonth),
      supabase
        .from('account_balance_snapshots')
        .select('account_id, balance_cents, as_of_month')
        .eq('household_id', ctx.householdId)
        .gte('as_of_month', earliestMonth)
        .lte('as_of_month', currentMonth),
      supabase
        .from('transactions')
        .select('occurred_on, amount_cents')
        .eq('household_id', ctx.householdId)
        .gte('occurred_on', earliestMonth),
    ])

  const accounts = (accountRows ?? []) as {
    id: string
    name: string
    type: AccountType
    opening_balance_cents: number
  }[]
  const openingTotal = accounts.reduce((s, a) => s + Number(a.opening_balance_cents), 0)

  // Build month list (earliest → current)
  const months: string[] = []
  for (let i = 0; i < 12; i += 1) months.push(addMonths(earliestMonth, i))

  // For each month, compute net worth using the latest snapshot ≤ that month
  // per account, falling back to opening_balance_cents if no snapshot yet.
  const snapsByAcct = new Map<string, { as_of_month: string; balance_cents: number }[]>()
  for (const s of snapshots ?? []) {
    if (!snapsByAcct.has(s.account_id)) snapsByAcct.set(s.account_id, [])
    snapsByAcct.get(s.account_id)!.push({
      as_of_month: s.as_of_month,
      balance_cents: Number(s.balance_cents),
    })
  }
  for (const arr of snapsByAcct.values()) arr.sort((a, b) => a.as_of_month.localeCompare(b.as_of_month))

  function balanceAt(account: (typeof accounts)[number], month: string): number {
    const snaps = snapsByAcct.get(account.id) ?? []
    let best: number | null = null
    for (const s of snaps) {
      if (s.as_of_month <= month) best = s.balance_cents
      else break
    }
    return best ?? Number(account.opening_balance_cents)
  }

  const netWorthTrend: SparklinePoint[] = months.map((m) => {
    let assets = 0
    let liabilities = 0
    for (const a of accounts) {
      const bal = balanceAt(a, m)
      if (LIABILITY_TYPES.has(a.type)) liabilities += bal
      else assets += bal
    }
    const d = new Date(m + 'T00:00:00')
    const label = d.toLocaleDateString('en-CA', { month: 'short' })
    return { label, value: assets - liabilities }
  })

  // Monthly spending trend: total positive (outflow) transactions per month
  const spendByMonth = new Map<string, number>()
  for (const tx of txTrend ?? []) {
    const amt = Number(tx.amount_cents)
    if (amt <= 0) continue
    const month = tx.occurred_on.slice(0, 7) + '-01'
    spendByMonth.set(month, (spendByMonth.get(month) ?? 0) + amt)
  }
  const spendTrend: SparklinePoint[] = months.map((m) => {
    const d = new Date(m + 'T00:00:00')
    return {
      label: d.toLocaleDateString('en-CA', { month: 'short' }),
      value: spendByMonth.get(m) ?? 0,
    }
  })

  const currentNetWorth = netWorthTrend[netWorthTrend.length - 1]?.value ?? 0

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">{monthLabel(currentMonth)}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <Tile label="Members" value={String((members ?? []).length)} />
        <Tile label="Accounts" value={String(accounts.length)} />
        <Tile label="Transactions this month" value={String(txCount ?? 0)} />
        <Tile label="Net worth" value={formatMoney(currentNetWorth)} />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Net worth — trailing 12 months
          </h2>
          <Link
            href="/balance-sheet"
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            Balance sheet →
          </Link>
        </div>
        <div className="mt-3 text-gray-900">
          <Sparkline points={netWorthTrend} fill ariaLabel="Net worth over time" />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Monthly spending — trailing 12 months
          </h2>
          <Link
            href="/transactions"
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            Transactions →
          </Link>
        </div>
        <div className="mt-3 text-red-700 dark:text-red-400">
          <Sparkline points={spendTrend} fill ariaLabel="Monthly spending trend" />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Opening balances (sum across accounts)
        </h2>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(openingTotal)}</p>
        <p className="mt-1 text-xs text-gray-500">
          Opening balances are the starting point; current balances update via the balance-sheet
          snapshot form.
        </p>
      </section>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}
