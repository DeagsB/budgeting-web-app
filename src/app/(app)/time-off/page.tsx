import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { monthLabel, monthStartISO } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { MonthNav } from '@/components/ui/month-nav'
import { StatTile } from '@/components/ui/stat-tile'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { TimeOffTable } from './table'

type Entry = {
  member_id: string
  period_month: string
  vacation_accrued_hours: number
  vacation_used_hours: number
  flex_accrued_hours: number
  flex_used_hours: number
}

function fmtHours(h: number): string {
  return `${h.toFixed(2)} h`
}

export default async function TimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const month =
    params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const [{ data: members }, { data: monthEntries }, { data: priorEntries }] = await Promise.all([
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('time_off_entries')
      .select('member_id, period_month, vacation_accrued_hours, vacation_used_hours, flex_accrued_hours, flex_used_hours')
      .eq('household_id', ctx.householdId)
      .eq('period_month', month),
    supabase
      .from('time_off_entries')
      .select('member_id, vacation_accrued_hours, vacation_used_hours, flex_accrued_hours, flex_used_hours')
      .eq('household_id', ctx.householdId)
      .lt('period_month', month),
  ])

  const monthEntryByMember = new Map<string, Entry>()
  for (const e of monthEntries ?? [])
    monthEntryByMember.set(e.member_id, {
      member_id: e.member_id,
      period_month: e.period_month,
      vacation_accrued_hours: Number(e.vacation_accrued_hours),
      vacation_used_hours: Number(e.vacation_used_hours),
      flex_accrued_hours: Number(e.flex_accrued_hours),
      flex_used_hours: Number(e.flex_used_hours),
    })

  const cumulativeByMember = new Map<
    string,
    { vac_accrued: number; vac_used: number; flex_accrued: number; flex_used: number }
  >()
  for (const e of priorEntries ?? []) {
    const cur = cumulativeByMember.get(e.member_id) ?? {
      vac_accrued: 0,
      vac_used: 0,
      flex_accrued: 0,
      flex_used: 0,
    }
    cur.vac_accrued += Number(e.vacation_accrued_hours)
    cur.vac_used += Number(e.vacation_used_hours)
    cur.flex_accrued += Number(e.flex_accrued_hours)
    cur.flex_used += Number(e.flex_used_hours)
    cumulativeByMember.set(e.member_id, cur)
  }

  const memberRows = members ?? []

  const rows = memberRows.map((m) => {
    const e = monthEntryByMember.get(m.id)
    const prior = cumulativeByMember.get(m.id) ?? {
      vac_accrued: 0,
      vac_used: 0,
      flex_accrued: 0,
      flex_used: 0,
    }
    const vac_accrued = e?.vacation_accrued_hours ?? 0
    const vac_used = e?.vacation_used_hours ?? 0
    const flex_accrued = e?.flex_accrued_hours ?? 0
    const flex_used = e?.flex_used_hours ?? 0
    return {
      member_id: m.id,
      memberName: m.display_name,
      vacation_accrued: vac_accrued,
      vacation_used: vac_used,
      flex_accrued: flex_accrued,
      flex_used: flex_used,
      vacation_balance: prior.vac_accrued + vac_accrued - prior.vac_used - vac_used,
      flex_balance: prior.flex_accrued + flex_accrued - prior.flex_used - flex_used,
    }
  })

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow={`Time off · ${monthLabel(month)}`}
        title="Vacation, accounted for."
        subtitle="Vacation and FLEX hours per member, accrued and used. Balances are cumulative through the end of the selected month."
      />

      <MonthNav
        monthISO={month}
        makeHref={(iso) => `/time-off?month=${iso}`}
      />

      {memberRows.length === 0 ? (
        <EmptyState
          title="No members yet"
          body="Time off is tracked per household member. Add at least one member to start logging vacation and FLEX hours."
          action={
            <Link href="/setup">
              <Button variant="primary" size="md">
                Go to setup
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <section aria-label="Balances by member" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => {
              const vacOver = r.vacation_balance < 0
              const flexOver = r.flex_balance < 0
              return (
                <StatTile
                  key={r.member_id}
                  label={r.memberName}
                  tone={vacOver ? 'maple' : 'leaf'}
                  value={fmtHours(r.vacation_balance)}
                  hint="Vacation balance"
                  foot={
                    <span className={flexOver ? 'text-maple' : 'text-ink-2'}>
                      FLEX {fmtHours(r.flex_balance)}
                      {flexOver ? ' · overdrawn' : ''}
                    </span>
                  }
                  aria-label={`${r.memberName}: vacation balance ${fmtHours(r.vacation_balance)}${
                    vacOver ? ', overdrawn' : ''
                  }; FLEX balance ${fmtHours(r.flex_balance)}${flexOver ? ', overdrawn' : ''}`}
                />
              )
            })}
          </section>

          <TimeOffTable month={month} rows={rows} />
        </>
      )}
    </div>
  )
}
