import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, monthLabel, monthStartISO } from '@/lib/format'
import { TimeOffTable } from './table'

type Entry = {
  member_id: string
  period_month: string
  vacation_accrued_hours: number
  vacation_used_hours: number
  flex_accrued_hours: number
  flex_used_hours: number
}

export default async function TimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const month =
    params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const nextMonth = addMonths(month, 1)

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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Time off</h1>
          <p className="mt-1 text-sm text-gray-500">
            Vacation + FLEX hours for {monthLabel(month)}. Balances cumulative through end of
            month.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={{ pathname: '/time-off', query: { month: addMonths(month, -1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            ← Previous
          </Link>
          <Link
            href={{ pathname: '/time-off', query: { month: monthStartISO() } }}
            className="text-gray-500 hover:text-gray-900"
          >
            This month
          </Link>
          <Link
            href={{ pathname: '/time-off', query: { month: nextMonth } }}
            className="text-gray-500 hover:text-gray-900"
          >
            Next →
          </Link>
        </div>
      </header>

      {(members ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          Add members first.
        </p>
      ) : (
        <TimeOffTable
          month={month}
          rows={(members ?? []).map((m) => {
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
              vacation_balance:
                prior.vac_accrued + vac_accrued - prior.vac_used - vac_used,
              flex_balance: prior.flex_accrued + flex_accrued - prior.flex_used - flex_used,
            }
          })}
        />
      )}
    </div>
  )
}
