import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatDate, monthStartISO } from '@/lib/format'
import { accountBalanceAt, groupSnapsByAccount, groupTxByAccount } from '@/lib/balances'
import type { AccountType } from '@/lib/domain'
import { MapleLabel } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { GoalControls } from './goal-controls'
import { OverallCard } from './overall-card'
import { GoalRow } from './row'

type Goal = {
  id: string
  name: string
  target_amount_cents: number
  current_amount_cents: number
  target_date: string | null
  funding_account_id: string | null
  note: string | null
  achieved_at: string | null
}

export default async function GoalsPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const [{ data: goals }, { data: accounts }, { data: snapshots }, { data: txData }] = await Promise.all([
    supabase
      .from('goals')
      .select('id, name, target_amount_cents, current_amount_cents, target_date, funding_account_id, note, achieved_at')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('target_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('accounts')
      .select('id, name, type, opening_balance_cents')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('account_balance_snapshots')
      .select('account_id, balance_cents, as_of_month')
      .eq('household_id', ctx.householdId)
      .order('as_of_month', { ascending: false }),
    supabase
      .from('transactions')
      .select('account_id, occurred_on, amount_cents')
      .eq('household_id', ctx.householdId)
      .limit(20000),
  ])

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const accountList = (accounts ?? []).map((a) => ({ id: a.id, name: a.name }))

  // A goal with a funding account tracks progress from that account's real
  // balance - see src/lib/balances.ts - instead of a typed figure, so
  // nobody has to keep a number in sync by hand (goals/add-form.tsx,
  // goals/row.tsx hide the typed field once a funding account is chosen).
  const txByAccount = groupTxByAccount(
    (txData ?? []).map((t) => ({
      account_id: t.account_id as string,
      occurred_on: t.occurred_on as string,
      amount_cents: Number(t.amount_cents),
    })),
  )
  const snapsByAccount = groupSnapsByAccount(
    (snapshots ?? []).map((s) => ({
      account_id: s.account_id as string,
      as_of_month: s.as_of_month as string,
      balance_cents: Number(s.balance_cents),
    })),
  )
  const accountById = new Map(
    (accounts ?? []).map((a) => [
      a.id as string,
      { type: a.type as AccountType, opening_balance_cents: Number(a.opening_balance_cents) },
    ]),
  )
  const thisMonth = monthStartISO()
  function currentAmountFor(g: { current_amount_cents: number | string; funding_account_id: string | null }): number {
    if (!g.funding_account_id) return Number(g.current_amount_cents)
    const acct = accountById.get(g.funding_account_id)
    if (!acct) return Number(g.current_amount_cents) // funding account archived/missing - fall back to what's stored
    const bal = accountBalanceAt(
      { id: g.funding_account_id, type: acct.type, opening_balance_cents: acct.opening_balance_cents },
      thisMonth,
      txByAccount,
      snapsByAccount,
    )
    return Math.max(0, bal)
  }

  const rows: Goal[] = ((goals ?? []) as Goal[]).map((g) => ({
    ...g,
    current_amount_cents: currentAmountFor(g),
  }))
  const active = rows.filter((g) => !g.achieved_at)
  const done = rows.filter((g) => g.achieved_at)
  const totalTarget = active.reduce((s, g) => s + Number(g.target_amount_cents), 0)
  const totalSaved = active.reduce((s, g) => s + Number(g.current_amount_cents), 0)

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow="Goals"
        title="What you're saving toward."
        subtitle="A trip, a down payment, an emergency fund - anything you're working toward. Add a target and watch the leaf bar climb."
        actions={active.length > 0 ? <GoalControls accounts={accountList} /> : undefined}
      />

      {active.length > 0 && (
        <OverallCard
          activeCount={active.length}
          totalSaved={totalSaved}
          totalTarget={totalTarget}
        />
      )}

      <section className="flex flex-col gap-3">
        <MapleLabel>Active</MapleLabel>
        {active.length === 0 ? (
          <EmptyState
            title="No active goals yet"
            body="Add your first one with the Add goal button - a target amount and an optional deadline is all it takes."
            action={<GoalControls accounts={accountList} />}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((g) => (
              <li key={g.id}>
                <GoalRow
                  goal={{
                    ...g,
                    target_amount_cents: Number(g.target_amount_cents),
                    current_amount_cents: Number(g.current_amount_cents),
                    targetDateLabel: g.target_date ? formatDate(g.target_date) : null,
                    fundingAccountName: g.funding_account_id
                      ? (accountName.get(g.funding_account_id) ?? null)
                      : null,
                  }}
                  accounts={accountList}
                  done={false}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <MapleLabel>Achieved</MapleLabel>
          <ul className="flex flex-col gap-3">
            {done.map((g) => (
              <li key={g.id}>
                <GoalRow
                  goal={{
                    ...g,
                    target_amount_cents: Number(g.target_amount_cents),
                    current_amount_cents: Number(g.current_amount_cents),
                    targetDateLabel: g.target_date ? formatDate(g.target_date) : null,
                    fundingAccountName: g.funding_account_id
                      ? (accountName.get(g.funding_account_id) ?? null)
                      : null,
                  }}
                  accounts={accountList}
                  done={true}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
