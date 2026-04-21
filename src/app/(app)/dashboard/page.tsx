import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, monthStartISO } from '@/lib/format'
import { LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { DashboardClient } from './client'

type Account = {
  id: string
  name: string
  type: AccountType
  ownership: string
  member_id: string | null
  opening_balance_cents: number
  bank?: string | null
}

type Snapshot = {
  account_id: string
  as_of_month: string
  balance_cents: number
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const currentMonth = monthStartISO()
  const monthStart12 = addMonths(currentMonth, -11)
  const currentMonthEnd = addMonths(currentMonth, 1)

  const [
    { data: householdRow },
    { data: memberRows },
    { data: accountRows },
    { data: snapshotRows },
    { data: txRows },
    { data: splitRows },
    { data: categoryRows },
  ] = await Promise.all([
    supabase.from('households').select('name').eq('id', ctx.householdId).single(),
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('accounts')
      .select('id, name, type, ownership, member_id, opening_balance_cents')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('account_balance_snapshots')
      .select('account_id, as_of_month, balance_cents')
      .eq('household_id', ctx.householdId)
      .gte('as_of_month', monthStart12)
      .lte('as_of_month', currentMonth)
      .order('as_of_month', { ascending: true }),
    supabase
      .from('transactions')
      .select('id, amount_cents, member_id')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', currentMonth)
      .lt('occurred_on', currentMonthEnd),
    supabase
      .from('transaction_splits')
      .select('category_id, amount_cents, transaction:transactions!inner(occurred_on)')
      .eq('household_id', ctx.householdId)
      .gte('transaction.occurred_on', currentMonth)
      .lt('transaction.occurred_on', currentMonthEnd),
    supabase
      .from('categories')
      .select('id, name, parent_id')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null),
  ])

  const household = householdRow ?? { name: 'Household' }
  const members = (memberRows ?? []) as { id: string; display_name: string }[]
  const accounts = ((accountRows ?? []) as Account[]).map((a) => ({
    ...a,
    opening_balance_cents: Number(a.opening_balance_cents),
  }))
  const snapshots = ((snapshotRows ?? []) as Snapshot[]).map((s) => ({
    ...s,
    balance_cents: Number(s.balance_cents),
  }))
  const transactions = (txRows ?? []).map((t) => ({
    id: t.id,
    amount_cents: Number(t.amount_cents),
    member_id: t.member_id,
  }))
  const splits = (splitRows ?? []).map((s) => ({
    category_id: s.category_id,
    amount_cents: Number(s.amount_cents),
  }))
  const categories = (categoryRows ?? []) as { id: string; name: string; parent_id: string | null }[]

  // Build net-worth trail: for each of the last 12 months, sum the latest
  // snapshot balance per account (fallback to opening_balance_cents).
  const snapsByAcct = new Map<string, Snapshot[]>()
  for (const s of snapshots) {
    if (!snapsByAcct.has(s.account_id)) snapsByAcct.set(s.account_id, [])
    snapsByAcct.get(s.account_id)!.push(s)
  }

  function balanceAt(acct: Account, month: string): number {
    const arr = snapsByAcct.get(acct.id) ?? []
    let best: number | null = null
    for (const s of arr) {
      if (s.as_of_month <= month) best = s.balance_cents
      else break
    }
    return best ?? acct.opening_balance_cents
  }

  const months: string[] = []
  for (let i = 0; i < 12; i += 1) months.push(addMonths(monthStart12, i))

  const netWorthTrail = months.map((m) => {
    let assets = 0
    let liabilities = 0
    for (const a of accounts) {
      const bal = balanceAt(a, m)
      if (LIABILITY_TYPES.has(a.type)) liabilities += bal
      else assets += bal
    }
    return { month: m, value: assets - liabilities }
  })

  const netWorth = netWorthTrail[netWorthTrail.length - 1]?.value ?? 0
  const netWorthPrev = netWorthTrail[netWorthTrail.length - 2]?.value ?? netWorth
  const netWorthDelta = netWorth - netWorthPrev

  // Current account balances (latest snapshot or opening fallback).
  const accountsWithBalance = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    ownership: a.ownership,
    member_id: a.member_id,
    balance_cents: balanceAt(a, currentMonth),
  }))

  // Month totals: income (negative txns), expenses (positive), net.
  let income = 0
  let expenses = 0
  for (const tx of transactions) {
    if (tx.amount_cents < 0) income += -tx.amount_cents
    else if (tx.amount_cents > 0) expenses += tx.amount_cents
  }

  // Spending breakdown by category. Splits only on positive amounts (outflows).
  // Roll child category spend into the parent so the breakdown bar shows
  // top-level groups.
  const parentOf = new Map<string, string | null>(categories.map((c) => [c.id, c.parent_id]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  const spendByCategory = new Map<string, number>()
  for (const s of splits) {
    if (s.amount_cents <= 0 || !s.category_id) continue
    const parentId = parentOf.get(s.category_id) ?? s.category_id
    const rootId = parentId ?? s.category_id
    spendByCategory.set(rootId, (spendByCategory.get(rootId) ?? 0) + s.amount_cents)
  }

  const spendingBreakdown = Array.from(spendByCategory.entries())
    .map(([id, amount]) => ({
      id,
      name: categoryName.get(id) ?? 'Uncategorized',
      amount_cents: amount,
    }))
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, 6)

  return (
    <DashboardClient
      householdName={household.name}
      members={members.map((m) => ({ id: m.id, name: m.display_name, initial: m.display_name[0] ?? '?' }))}
      currentMonthISO={currentMonth}
      netWorth={netWorth}
      netWorthDelta={netWorthDelta}
      netWorthTrail={netWorthTrail}
      income={income}
      expenses={expenses}
      net={income - expenses}
      accounts={accountsWithBalance}
      spendingBreakdown={spendingBreakdown}
    />
  )
}
