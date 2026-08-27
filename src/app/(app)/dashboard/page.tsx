import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, monthStartISO } from '@/lib/format'
import { type AccountType } from '@/lib/domain'
import { effectiveBudgets, type BudgetOverride, type StandingBudget } from '@/lib/budget'
import {
  netWorthTrail as computeTrail,
  accountBalanceAt,
  groupTxByAccount,
  groupSnapsByAccount,
} from '@/lib/balances'
import { DashboardClient } from './client'

export const dynamic = 'force-dynamic'

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
  const recurringStart = addMonths(currentMonth, -3)

  const [
    householdRes,
    membersRes,
    accountsRes,
    snapshotsRes,
    transactionsRes,
    splitsRes,
    categoriesRes,
    standingBudgetsRes,
    budgetOverridesRes,
    goalsRes,
    recurringTxRes,
    recentTxRes,
    balanceTxRes,
  ] = await Promise.all([
    supabase.from('households').select('name').eq('id', ctx.householdId).maybeSingle(),
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
      .select('id, amount_cents, member_id, account_id')
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
      .is('archived_at', null)
      .order('sort_order'),
    supabase
      .from('category_budgets')
      .select('category_id, amount_cents')
      .eq('household_id', ctx.householdId),
    supabase
      .from('monthly_budgets')
      .select('category_id, month, amount_cents')
      .eq('household_id', ctx.householdId)
      .eq('month', currentMonth),
    supabase
      .from('goals')
      .select('id, name, target_amount_cents, current_amount_cents, target_date, achieved_at')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('created_at'),
    // Prior 3 months for recurring detection.
    supabase
      .from('transactions')
      .select('amount_cents, description, occurred_on')
      .eq('household_id', ctx.householdId)
      .gt('amount_cents', 0)
      .gte('occurred_on', recurringStart)
      .lt('occurred_on', currentMonth),
    // Last 8 transactions across all accounts (current month, descending).
    supabase
      .from('transactions')
      .select('id, amount_cents, occurred_on, description, account_id')
      .eq('household_id', ctx.householdId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(8),
    // All transactions up to the end of the current month - drives the
    // cashflow-derived running balances + the net-worth trail.
    supabase
      .from('transactions')
      .select('account_id, occurred_on, amount_cents')
      .eq('household_id', ctx.householdId)
      .lt('occurred_on', currentMonthEnd)
      .limit(20000),
  ])

  // If any query errored, the derived figures below silently read as $0/empty.
  // Surface a flag so the client can warn the user instead of presenting a
  // fabricated zero as real data.
  const hasError = [
    householdRes,
    membersRes,
    accountsRes,
    snapshotsRes,
    transactionsRes,
    splitsRes,
    categoriesRes,
    standingBudgetsRes,
    budgetOverridesRes,
    goalsRes,
    recurringTxRes,
    recentTxRes,
    balanceTxRes,
  ].some((r) => r.error)

  const household = householdRes.data ?? { name: 'Household' }
  const members = (membersRes.data ?? []) as { id: string; display_name: string }[]
  const accounts = ((accountsRes.data ?? []) as Account[]).map((a) => ({
    ...a,
    opening_balance_cents: Number(a.opening_balance_cents),
  }))
  const snapshots = ((snapshotsRes.data ?? []) as Snapshot[]).map((s) => ({
    ...s,
    balance_cents: Number(s.balance_cents),
  }))
  const transactions = (transactionsRes.data ?? []).map((t) => ({
    id: t.id,
    amount_cents: Number(t.amount_cents),
    member_id: t.member_id,
    account_id: t.account_id,
  }))
  const splits = (splitsRes.data ?? []).map((s) => ({
    category_id: s.category_id,
    amount_cents: Number(s.amount_cents),
  }))
  const categories = (categoriesRes.data ?? []) as { id: string; name: string; parent_id: string | null }[]

  // Cashflow-derived balances: opening balance + the net effect of every
  // transaction through the month (snapshots, if any, anchor it). Makes the
  // net-worth trail + card balances track real spending/income instead of
  // sitting flat on opening balances.
  const balanceTx = ((balanceTxRes.data ?? []) as Array<{
    account_id: string
    occurred_on: string
    amount_cents: number | string
  }>).map((t) => ({
    account_id: t.account_id,
    occurred_on: t.occurred_on,
    amount_cents: Number(t.amount_cents),
  }))
  const txByAccount = groupTxByAccount(balanceTx)
  const snapsByAccount = groupSnapsByAccount(snapshots)

  const months: string[] = []
  for (let i = 0; i < 12; i += 1) months.push(addMonths(monthStart12, i))

  const netWorthTrail = computeTrail(accounts, months, txByAccount, snapsByAccount)

  const netWorth = netWorthTrail[netWorthTrail.length - 1]?.value ?? 0
  const netWorthPrev = netWorthTrail[netWorthTrail.length - 2]?.value ?? netWorth
  const netWorthDelta = netWorth - netWorthPrev

  // Per-account month stats - power the "useful stat" view on the back of
  // each card flip. Outflow = positive amounts; inflow = negative amounts.
  const monthOutByAccount = new Map<string, number>()
  const monthInByAccount = new Map<string, number>()
  for (const tx of transactions) {
    if (!tx.account_id) continue
    if (tx.amount_cents > 0) {
      monthOutByAccount.set(tx.account_id, (monthOutByAccount.get(tx.account_id) ?? 0) + tx.amount_cents)
    } else if (tx.amount_cents < 0) {
      monthInByAccount.set(tx.account_id, (monthInByAccount.get(tx.account_id) ?? 0) + -tx.amount_cents)
    }
  }
  const monthCountByAccount = new Map<string, number>()
  for (const tx of transactions) {
    if (!tx.account_id) continue
    monthCountByAccount.set(tx.account_id, (monthCountByAccount.get(tx.account_id) ?? 0) + 1)
  }

  // Current account balances (cashflow-derived through this month).
  const accountsWithBalance = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    ownership: a.ownership,
    member_id: a.member_id,
    balance_cents: accountBalanceAt(a, currentMonth, txByAccount, snapsByAccount),
    month_outflow_cents: monthOutByAccount.get(a.id) ?? 0,
    month_inflow_cents: monthInByAccount.get(a.id) ?? 0,
    month_tx_count: monthCountByAccount.get(a.id) ?? 0,
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

  // Budget hero - total budgeted across top-level categories for the current
  // month: the standing amount unless this month overrides it. Spend is
  // `expenses` already computed.
  const budgetByCat = effectiveBudgets(
    (standingBudgetsRes.data ?? []) as StandingBudget[],
    (budgetOverridesRes.data ?? []) as BudgetOverride[],
    currentMonth,
  )
  const totalBudget = Array.from(budgetByCat.entries())
    .filter(([id]) => !parentOf.get(id))
    .reduce((s, [, v]) => s + v, 0)

  // Goals - active, not yet achieved, with progress.
  const goals = ((goalsRes.data ?? []) as Array<{
    id: string
    name: string
    target_amount_cents: number | string
    current_amount_cents: number | string
    target_date: string | null
    achieved_at: string | null
  }>)
    .filter((g) => !g.achieved_at)
    .map((g) => ({
      id: g.id,
      name: g.name,
      target: Number(g.target_amount_cents),
      current: Number(g.current_amount_cents),
      target_date: g.target_date,
    }))

  // Recurring detection - same algorithm as the budgets page.
  type RecurRow = { amount_cents: number | string; description: string | null; occurred_on: string }
  const recGroups = new Map<string, { description: string; amount: number; months: Set<string> }>()
  for (const tx of (recurringTxRes.data ?? []) as RecurRow[]) {
    const desc = (tx.description ?? '').trim()
    if (!desc) continue
    const norm = desc.toLowerCase().replace(/\s+/g, ' ').replace(/[#0-9]+$/, '').trim()
    const amt = Number(tx.amount_cents)
    if (!Number.isFinite(amt) || amt <= 0) continue
    const key = `${norm}|${amt}`
    const monthKey = tx.occurred_on.slice(0, 7)
    const existing = recGroups.get(key)
    if (existing) existing.months.add(monthKey)
    else recGroups.set(key, { description: desc, amount: amt, months: new Set([monthKey]) })
  }
  const recurring = Array.from(recGroups.values())
    .filter((g) => g.months.size >= 2)
    .map((g) => ({
      description: g.description,
      amount_cents: g.amount,
      monthsSeen: g.months.size,
    }))
    .sort((a, b) => b.amount_cents - a.amount_cents)
  const recurringTotal = recurring.reduce((s, g) => s + g.amount_cents, 0)

  // Recent activity - last 8 transactions overall, with account name resolved.
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]))
  const recentActivity = ((recentTxRes.data ?? []) as Array<{
    id: string
    amount_cents: number | string
    occurred_on: string
    description: string | null
    account_id: string
  }>).map((t) => ({
    id: t.id,
    amount_cents: Number(t.amount_cents),
    occurred_on: t.occurred_on,
    description: t.description ?? '-',
    account_name: accountNameById.get(t.account_id) ?? '-',
  }))

  // Pace - daily spend so far + projected month-end. Skipped in past/future
  // months by the client when daysElapsed === 0 or === daysInMonth.
  const monthDate = new Date(currentMonth + 'T00:00:00')
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const today = new Date()
  let daysElapsed: number
  if (today < monthDate) daysElapsed = 0
  else if (today.getFullYear() === monthDate.getFullYear() && today.getMonth() === monthDate.getMonth()) {
    daysElapsed = today.getDate()
  } else daysElapsed = daysInMonth
  const dailyPace = daysElapsed > 0 ? expenses / daysElapsed : 0
  const projectedMonth = Math.round(dailyPace * daysInMonth)

  return (
    <DashboardClient
      householdName={household.name}
      members={members.map((m) => ({ id: m.id, name: m.display_name, initial: m.display_name[0] ?? '?' }))}
      myMemberId={ctx.memberId}
      currentMonthISO={currentMonth}
      netWorth={netWorth}
      netWorthDelta={netWorthDelta}
      netWorthTrail={netWorthTrail}
      income={income}
      expenses={expenses}
      net={income - expenses}
      accounts={accountsWithBalance}
      spendingBreakdown={spendingBreakdown}
      totalBudget={totalBudget}
      goals={goals}
      recurring={recurring}
      recurringTotal={recurringTotal}
      recentActivity={recentActivity}
      pace={{
        dailyPace,
        projectedMonth,
        daysElapsed,
        daysInMonth,
      }}
      categories={categories.map((c) => ({ id: c.id, parent_id: c.parent_id, name: c.name }))}
      hasError={hasError}
    />
  )
}
