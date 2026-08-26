import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatDate, monthLabel, monthStartISO } from '@/lib/format'
import { computePairBalances, netUnorderedPairs } from '@/lib/settlement'
import { Sparkline, type SparklinePoint } from '@/components/sparkline'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatTile } from '@/components/ui/stat-tile'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MonthNav } from '@/components/ui/month-nav'
import { MapleLabel } from '@/components/ui/label'
import { RecordSettlementForm } from './record-form'
import { DeleteSettlementButton } from './delete-button'

type Member = { id: string; display_name: string }

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const month =
    params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const nextMonth = addMonths(month, 1)
  const yearStart = addMonths(month, -11)

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [
    { data: members },
    { data: monthTxs },
    { data: monthShares },
    { data: monthSettlements },
    { data: yearTxs },
    { data: yearShares },
    { data: yearSettlements },
  ] = await Promise.all([
    supabase.from('members').select('id, display_name').eq('household_id', ctx.householdId).order('sort_order'),
    supabase
      .from('transactions')
      .select('id, amount_cents, member_id')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', month)
      .lt('occurred_on', nextMonth),
    supabase
      .from('transaction_shares')
      .select('id, transaction_id, member_id, amount_cents, transaction:transactions!inner(occurred_on)')
      .eq('household_id', ctx.householdId)
      .gte('transaction.occurred_on', month)
      .lt('transaction.occurred_on', nextMonth),
    supabase
      .from('settlements')
      .select('id, from_member_id, to_member_id, amount_cents, settled_on, note')
      .eq('household_id', ctx.householdId)
      .gte('settled_on', month)
      .lt('settled_on', nextMonth)
      .order('settled_on', { ascending: false }),
    supabase
      .from('transactions')
      .select('id, amount_cents, member_id, occurred_on')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', yearStart)
      .lt('occurred_on', nextMonth),
    supabase
      .from('transaction_shares')
      .select('transaction_id, member_id, amount_cents, transaction:transactions!inner(occurred_on)')
      .eq('household_id', ctx.householdId)
      .gte('transaction.occurred_on', yearStart)
      .lt('transaction.occurred_on', nextMonth),
    supabase
      .from('settlements')
      .select('from_member_id, to_member_id, amount_cents, settled_on')
      .eq('household_id', ctx.householdId)
      .gte('settled_on', yearStart)
      .lt('settled_on', nextMonth),
  ])

  const memberRows = (members ?? []) as Member[]
  const memberName = new Map(memberRows.map((m) => [m.id, m.display_name]))

  const monthTxList = (monthTxs ?? []).map((t) => ({
    id: t.id,
    amount_cents: Number(t.amount_cents),
    member_id: t.member_id,
  }))
  const monthShareList = (monthShares ?? []).map((s) => ({
    transaction_id: s.transaction_id,
    member_id: s.member_id,
    amount_cents: Number(s.amount_cents),
  }))
  const monthSettList = (monthSettlements ?? []).map((s) => ({
    from_member_id: s.from_member_id,
    to_member_id: s.to_member_id,
    amount_cents: Number(s.amount_cents),
  }))

  const pairs = computePairBalances({
    transactions: monthTxList,
    shares: monthShareList,
    settlements: monthSettList,
  })
  const netPairs = netUnorderedPairs(pairs)

  const totalOwed = Array.from(pairs.values()).reduce((s, p) => s + Math.max(0, p.owed_cents), 0)
  const totalSettled = Array.from(pairs.values()).reduce((s, p) => s + p.settled_cents, 0)
  const totalNet = netPairs.reduce((s, p) => s + p.net_cents, 0)

  // Trailing 12-month trend
  const yearTxList = (yearTxs ?? []).map((t) => ({
    id: t.id,
    amount_cents: Number(t.amount_cents),
    member_id: t.member_id,
    occurred_on: t.occurred_on as string,
  }))
  const yearShareList = (yearShares ?? []).map((s) => ({
    transaction_id: s.transaction_id,
    member_id: s.member_id,
    amount_cents: Number(s.amount_cents),
  }))
  const yearSettList = (yearSettlements ?? []).map((s) => ({
    from_member_id: s.from_member_id,
    to_member_id: s.to_member_id,
    amount_cents: Number(s.amount_cents),
    settled_on: s.settled_on as string,
  }))

  const monthsAxis: string[] = []
  for (let i = 0; i < 12; i += 1) monthsAxis.push(addMonths(yearStart, i))
  const trend: SparklinePoint[] = monthsAxis.map((m) => {
    const mNext = addMonths(m, 1)
    const monthTxIds = new Set(
      yearTxList.filter((t) => t.occurred_on >= m && t.occurred_on < mNext).map((t) => t.id),
    )
    const mTxs = yearTxList.filter((t) => monthTxIds.has(t.id))
    const mShares = yearShareList.filter((s) => monthTxIds.has(s.transaction_id))
    const mSetts = yearSettList.filter((s) => s.settled_on >= m && s.settled_on < mNext)
    const p = computePairBalances({ transactions: mTxs, shares: mShares, settlements: mSetts })
    const n = netUnorderedPairs(p)
    return {
      label: new Date(m + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short' }),
      value: n.reduce((s, x) => s + x.net_cents, 0),
    }
  })
  const hasTrend = trend.some((p) => p.value !== 0)

  // Settlement requires at least two members to owe one another.
  if (memberRows.length < 2) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <PageHeader eyebrow={`Settlements · ${monthLabel(month)}`} title="Square up, gently." />
        <EmptyState
          title="Add a second member to settle up"
          body="Settlements track who owes whom between household members, so you need at least two before there's anything to square up."
          action={
            <Link href="/setup">
              <Button variant="primary" size="md">
                Manage members
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader eyebrow={`Settlements · ${monthLabel(month)}`} title="Square up, gently." />

      <MonthNav monthISO={month} makeHref={(iso) => `/settlements?month=${iso}`} />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Shared this month" value={<Amount cents={totalOwed} tone="ink" />} tone="ink" />
        <StatTile label="Settled via transfer" value={<Amount cents={totalSettled} tone="leaf" />} tone="leaf" />
        <StatTile
          label="Still outstanding"
          value={<Amount cents={totalNet} tone={totalNet > 0 ? 'maple' : 'ink'} />}
          tone={totalNet > 0 ? 'maple' : 'ink'}
          hint={totalNet > 0 ? 'still owing' : 'all settled'}
        />
      </section>

      {/* Who owes whom */}
      <Card>
        <MapleLabel>Who owes whom</MapleLabel>
        {netPairs.length === 0 ? (
          <p className="mt-3 rounded-md bg-leaf-soft px-4 py-3 text-[13.5px] leading-relaxed text-leaf">
            All settled for {monthLabel(month)}. Flag shared expenses on the{' '}
            <Link href="/shared" className="font-semibold underline">
              Shared
            </Link>{' '}
            page, or record a payment below.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {netPairs.map((p) => (
              <li
                key={`${p.from_member_id}:${p.to_member_id}`}
                className="flex items-center justify-between gap-3 rounded-md bg-cream-2 px-3 py-2.5 text-[13.5px]"
              >
                <span className="min-w-0 truncate">
                  <strong className="font-semibold text-ink">
                    {memberName.get(p.from_member_id) ?? 'Member'}
                  </strong>{' '}
                  <span className="text-ink-2">owes</span>{' '}
                  <strong className="font-semibold text-ink">
                    {memberName.get(p.to_member_id) ?? 'Member'}
                  </strong>
                </span>
                <span className="shrink-0 rounded-full bg-maple-soft px-2.5 py-1">
                  <Amount cents={p.net_cents} tone="maple" className="text-[14px]" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Record payment */}
      <Card>
        <MapleLabel>Record payment</MapleLabel>
        <p className="mt-1 text-[13px] text-ink-2">
          Log an e-transfer or other reimbursement between household members. It doesn&rsquo;t touch
          budgets or P&amp;L.
        </p>
        <RecordSettlementForm
          members={memberRows.map((m) => ({ id: m.id, name: m.display_name }))}
          defaultDate={new Date().toISOString().slice(0, 10)}
          suggestion={netPairs[0] ?? null}
        />
      </Card>

      {/* Payments history */}
      <Card padding="none" className="overflow-hidden">
        <header className="border-b border-hair px-5 py-3.5">
          <MapleLabel>Payments in {monthLabel(month)}</MapleLabel>
        </header>
        {(monthSettlements ?? []).length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-ink-2">
            No payments recorded this month.
          </p>
        ) : (
          <ul className="divide-y divide-hair">
            {(monthSettlements ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5 text-[14px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ink">
                    <strong>{memberName.get(s.from_member_id) ?? 'Member'}</strong>{' '}
                    <span className="text-ink-3" aria-hidden>→</span>{' '}
                    <span className="sr-only">paid</span>
                    <strong>{memberName.get(s.to_member_id) ?? 'Member'}</strong>
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {formatDate(s.settled_on)}
                    {s.note && ` · ${s.note}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Amount cents={Number(s.amount_cents)} tone="leaf" className="text-[16px]" />
                  <DeleteSettlementButton id={s.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Trend */}
      <Card>
        <MapleLabel>Net outstanding — trailing 12 months</MapleLabel>
        {hasTrend ? (
          <div className="mt-3 text-ink">
            <Sparkline points={trend} fill ariaLabel="Monthly net outstanding" />
          </div>
        ) : (
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
            No outstanding balances in the last 12 months. Once shared expenses go unsettled, the
            running total appears here.
          </p>
        )}
      </Card>
    </div>
  )
}
