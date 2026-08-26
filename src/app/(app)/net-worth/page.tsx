import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, monthStartISO, monthLabel } from '@/lib/format'
import { LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { accountBalanceAt, groupTxByAccount, groupSnapsByAccount } from '@/lib/balances'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { ResponsiveAmount } from '@/components/ui/responsive-amount'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { NetWorthHero, type NetWorthPoint } from './hero'

/**
 * Net worth - the headline trend screen. A scrubbable 24-month chart drives a
 * big animated hero figure, with the assets/liabilities split underneath. The
 * year-over-year delta only appears once there's ≥13 months of real snapshot
 * history, so we never show a fabricated delta against carried-forward data.
 */
export default async function NetWorthPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const [{ data: accounts }, { data: snapshots }, { data: txData }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, type, opening_balance_cents')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null),
    supabase
      .from('account_balance_snapshots')
      .select('account_id, as_of_month, balance_cents')
      .eq('household_id', ctx.householdId)
      .order('as_of_month', { ascending: true }),
    supabase
      .from('transactions')
      .select('account_id, occurred_on, amount_cents')
      .eq('household_id', ctx.householdId)
      .limit(20000),
  ])

  // Cashflow-derived: each month's balance is the opening balance plus every
  // transaction through that month (snapshots, where present, anchor it). The
  // trail now tracks real spending/income instead of carrying opening balances.
  const accountsList = (accounts ?? []).map((a) => ({
    id: a.id as string,
    type: a.type as AccountType,
    opening_balance_cents: Number(a.opening_balance_cents),
  }))
  const balanceTx = (txData ?? []).map((t) => ({
    account_id: t.account_id as string,
    occurred_on: t.occurred_on as string,
    amount_cents: Number(t.amount_cents),
  }))
  const snaps = (snapshots ?? []).map((s) => ({
    account_id: s.account_id as string,
    as_of_month: s.as_of_month as string,
    balance_cents: Number(s.balance_cents),
  }))
  const txByAccount = groupTxByAccount(balanceTx)
  const snapsByAccount = groupSnapsByAccount(snaps)

  // 24-month trail, first of each month.
  const today = monthStartISO(new Date())
  const monthStart = addMonths(today, -23)
  const months: string[] = []
  for (let i = 0; i < 24; i += 1) months.push(addMonths(monthStart, i))

  const trail: NetWorthPoint[] = months.map((m) => {
    let assets = 0
    let liabilities = 0
    for (const a of accountsList) {
      const bal = accountBalanceAt(a, m, txByAccount, snapsByAccount)
      if (LIABILITY_TYPES.has(a.type)) liabilities += bal
      else assets += bal
    }
    return { month: m, assets, liabilities, net: assets - liabilities }
  })

  const latest = trail[trail.length - 1]

  // Empty state: nothing to chart - no accounts, or no transactions/snapshots
  // at all (a flat opening-balance line isn't worth a hero).
  const hasData = balanceTx.length > 0 || snaps.length > 0
  if (accountsList.length === 0 || !hasData) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <PageHeader eyebrow="Net worth" title="Two years of patience." />
        <EmptyState
          title="Nothing to chart yet"
          body="Add your accounts and import (or auto-import) some transactions - your net worth then tracks your spending and income here, month by month."
          action={
            <Link href={accountsList.length === 0 ? '/accounts' : '/transactions/import'}>
              <Button variant="primary" size="md">
                {accountsList.length === 0 ? 'Add an account' : 'Import transactions'}
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  // Gate the year-over-year delta on ≥13 months of real history (earliest
  // transaction or snapshot); anything shorter would compare against a flat
  // opening-balance stretch.
  const earliestTx = balanceTx.reduce<string | null>(
    (min, t) => (min === null || t.occurred_on < min ? t.occurred_on : min),
    null,
  )
  const earliestSnap = snaps.length ? snaps[0].as_of_month : null
  const earliestReal = [earliestTx, earliestSnap]
    .filter((x): x is string => !!x)
    .sort()[0]
  const earliestRealMonth = earliestReal ? `${earliestReal.slice(0, 7)}-01` : null
  const monthsOfRealData = earliestRealMonth ? months.filter((m) => m >= earliestRealMonth).length : 0
  const twelveAgo = trail[trail.length - 13]
  const showYoy = monthsOfRealData >= 13 && twelveAgo != null
  const yoy = showYoy ? latest.net - twelveAgo.net : null
  const yoyFromLabel = showYoy ? monthLabel(twelveAgo.month) : null

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader eyebrow="Net worth" title="Two years of patience." />

      <NetWorthHero trail={trail} yoy={yoy} yoyFromLabel={yoyFromLabel} />

      {/* Assets / liabilities split at the latest month */}
      <section className="grid grid-cols-2 gap-2 sm:gap-3">
        <StatTile
          compact
          label="Assets"
          tone="leaf"
          value={<ResponsiveAmount cents={latest.assets} tone="leaf" />}
          hint="today"
          className="sm:p-4"
        />
        <StatTile
          compact
          label="Liabilities"
          tone="maple"
          value={<ResponsiveAmount cents={latest.liabilities} tone="maple" />}
          hint="today"
          className="sm:p-4"
        />
      </section>
    </div>
  )
}
