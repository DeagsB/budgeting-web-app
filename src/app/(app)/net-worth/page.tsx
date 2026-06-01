import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, monthStartISO, monthLabel } from '@/lib/format'
import { LIABILITY_TYPES } from '@/lib/domain'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { Amount } from '@/components/ui/amount'
import { EmptyState } from '@/components/ui/empty-state'
import { NetWorthHero, type NetWorthPoint } from './hero'

/**
 * Net worth — the headline trend screen. A scrubbable 24-month chart drives a
 * big animated hero figure, with the assets/liabilities split underneath. The
 * year-over-year delta only appears once there's ≥13 months of real snapshot
 * history, so we never show a fabricated delta against carried-forward data.
 */
export default async function NetWorthPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const [{ data: accounts }, { data: snapshots }] = await Promise.all([
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
  ])

  const snapsByAcct = new Map<string, { as_of: string; cents: number }[]>()
  for (const s of snapshots ?? []) {
    const arr = snapsByAcct.get(s.account_id) ?? []
    arr.push({ as_of: s.as_of_month as string, cents: Number(s.balance_cents) })
    snapsByAcct.set(s.account_id, arr)
  }

  // 24-month trail, first of each month. Each month carries forward the most
  // recent snapshot at-or-before it, falling back to the account's opening
  // balance for months with no snapshot yet.
  const today = monthStartISO(new Date())
  const monthStart = addMonths(today, -23)
  const months: string[] = []
  for (let i = 0; i < 24; i += 1) months.push(addMonths(monthStart, i))

  const trail: NetWorthPoint[] = months.map((m) => {
    let assets = 0
    let liabilities = 0
    for (const a of accounts ?? []) {
      const snaps = snapsByAcct.get(a.id) ?? []
      const priorOrEqual = [...snaps].reverse().find((s) => s.as_of <= m)
      const bal = priorOrEqual ? priorOrEqual.cents : Number(a.opening_balance_cents)
      if (LIABILITY_TYPES.has(a.type as never)) liabilities += bal
      else assets += bal
    }
    return { month: m, assets, liabilities, net: assets - liabilities }
  })

  const latest = trail[trail.length - 1]

  // Empty state: no balance history captured at all. Carrying-forward opening
  // balances would draw a flat fictional line, so show a real prompt instead.
  const hasSnapshots = (snapshots?.length ?? 0) > 0
  if (!hasSnapshots) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <PageHeader eyebrow="Net worth" title="Two years of patience." />
        <EmptyState
          title="No balance history yet"
          body="Record a balance for your accounts to start charting your net worth over time. Once you have a couple of months, the trend line and year-over-year change appear here."
          action={
            <Link
              href="/accounts"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-leaf px-5 text-[14px] font-semibold text-paper transition-transform active:scale-[0.97]"
            >
              Update balances
            </Link>
          }
        />
      </div>
    )
  }

  // Gate the year-over-year delta. Only meaningful once the household has ≥13
  // months of *real* snapshot history — anything shorter is carried-forward
  // padding, and a delta against it would be fabricated.
  const earliestSnapshot = snapshots?.[0]?.as_of_month as string | undefined
  const monthsOfRealData = earliestSnapshot
    ? months.filter((m) => m >= earliestSnapshot).length
    : 0
  const twelveAgo = trail[trail.length - 13]
  const showYoy = monthsOfRealData >= 13 && twelveAgo != null
  const yoy = showYoy ? latest.net - twelveAgo.net : null
  const yoyFromLabel = showYoy ? monthLabel(twelveAgo.month) : null

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader eyebrow="Net worth" title="Two years of patience." />

      <NetWorthHero trail={trail} yoy={yoy} yoyFromLabel={yoyFromLabel} />

      {/* Assets / liabilities split at the latest month */}
      <section className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Assets · today"
          tone="leaf"
          value={<Amount cents={latest.assets} tone="leaf" />}
        />
        <StatTile
          label="Liabilities · today"
          tone="maple"
          value={<Amount cents={latest.liabilities} tone="maple" />}
        />
      </section>
    </div>
  )
}
