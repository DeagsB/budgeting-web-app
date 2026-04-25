import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney, formatDate } from '@/lib/format'
import { MapleLabel } from '@/components/ui/label'
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
  const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Goals
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
          What you&rsquo;re saving toward.
        </h1>
        <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          A trip, a down payment, an emergency fund — anything you&rsquo;re working
          toward. Add a target and watch the leaf bar climb.
        </p>
      </header>

      {active.length > 0 && (
        <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
          <div className="flex items-baseline justify-between gap-2">
            <MapleLabel>Overall</MapleLabel>
            <span className="text-[10.5px] tabular-nums text-[var(--color-ink-3)]">
              {active.length} active
            </span>
          </div>
          <div className="mt-1.5 font-serif text-[28px] leading-tight tracking-[-0.02em] tabular-nums text-[var(--color-ink)] md:text-[34px]">
            {formatMoney(totalSaved)}
            <span className="text-[var(--color-ink-3)]"> of {formatMoney(totalTarget)}</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--color-paper-2)]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${overallPct}%`,
                background: 'var(--color-leaf)',
              }}
            />
          </div>
          <div className="mt-2 text-[12px] text-[var(--color-ink-3)]">
            {overallPct}% there · {formatMoney(Math.max(0, totalTarget - totalSaved))} remaining
          </div>
        </section>
      )}

      <details className="group rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 md:px-6">
          <MapleLabel>Add goal</MapleLabel>
          <Chevron />
        </summary>
        <div className="border-t border-[var(--color-hair)] px-5 pb-5 pt-5 md:px-6 md:pb-6">
          <AddGoalForm accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))} />
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <MapleLabel>Active</MapleLabel>
        {active.length === 0 ? (
          <p className="rounded-[20px] border border-dashed border-[var(--color-hair)] bg-[var(--color-paper-2)] px-5 py-8 text-center text-[14px] text-[var(--color-ink-2)]">
            No active goals yet — add your first one above.
          </p>
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
                  accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
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
                  accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
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

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--color-ink-3)] transition-transform group-open:rotate-180"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
