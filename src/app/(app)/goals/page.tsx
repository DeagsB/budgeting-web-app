import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney, formatDate } from '@/lib/format'
import { AddGoalForm } from './add-form'
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
  const [{ data: goals }, { data: accounts }] = await Promise.all([
    supabase
      .from('goals')
      .select('id, name, target_amount_cents, current_amount_cents, target_date, funding_account_id, note, achieved_at')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('target_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('accounts')
      .select('id, name')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
  ])

  const rows: Goal[] = (goals ?? []) as Goal[]
  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))

  const active = rows.filter((g) => !g.achieved_at)
  const done = rows.filter((g) => g.achieved_at)
  const totalTarget = active.reduce((s, g) => s + Number(g.target_amount_cents), 0)
  const totalSaved = active.reduce((s, g) => s + Number(g.current_amount_cents), 0)

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Goals</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track anything you&apos;re saving toward — a trip, a down payment, an emergency fund.
        </p>
      </header>

      {active.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          <Tile label="Active goals" value={String(active.length)} />
          <Tile label="Total saved" value={formatMoney(totalSaved)} />
          <Tile label="Total target" value={formatMoney(totalTarget)} />
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Add goal</h2>
        <AddGoalForm accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))} />
      </section>

      <section className="flex flex-col gap-3">
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
            No active goals yet.
          </p>
        ) : (
          active.map((g) => (
            <GoalRow
              key={g.id}
              goal={{
                ...g,
                target_amount_cents: Number(g.target_amount_cents),
                current_amount_cents: Number(g.current_amount_cents),
                targetDateLabel: g.target_date ? formatDate(g.target_date) : null,
                fundingAccountName: g.funding_account_id
                  ? (accountName.get(g.funding_account_id) ?? null)
                  : null,
              }}
              accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
              done={false}
            />
          ))
        )}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Achieved</h2>
          {done.map((g) => (
            <GoalRow
              key={g.id}
              goal={{
                ...g,
                target_amount_cents: Number(g.target_amount_cents),
                current_amount_cents: Number(g.current_amount_cents),
                targetDateLabel: g.target_date ? formatDate(g.target_date) : null,
                fundingAccountName: g.funding_account_id
                  ? (accountName.get(g.funding_account_id) ?? null)
                  : null,
              }}
              accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
              done={true}
            />
          ))}
        </section>
      )}
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
