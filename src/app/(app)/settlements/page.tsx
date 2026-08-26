import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { computeBalancesByPeriod, computePeriodStatement, nextAutoCloseDate } from '@/lib/settlement'
import { loadSettlementData } from '@/lib/settlement-data'
import { Sparkline, type SparklinePoint } from '@/components/sparkline'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatTile } from '@/components/ui/stat-tile'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MapleLabel } from '@/components/ui/label'
import { RecordSettlementForm } from './record-form'
import { AwaitingSettlementCard, OpenPeriodCard, type LineVM } from './period-card'
import { PeriodHistory, type PeriodVM } from './period-history'

export const dynamic = 'force-dynamic'

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/**
 * /settlements - the running tally, any statement waiting to be paid, a
 * manual payment form, and the history of closed periods.
 */
export default async function SettlementsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const [{ data: members }, data] = await Promise.all([
    supabase.from('members').select('id, display_name').eq('household_id', ctx.householdId).is('archived_at', null).order('sort_order'),
    loadSettlementData(supabase, ctx.householdId),
  ])
  const memberRows = (members ?? []).map((m) => ({ id: m.id as string, name: m.display_name as string }))
  const memberName = new Map(memberRows.map((m) => [m.id, m.name]))
  const { data: closers } = await supabase.from('members').select('id, display_name').eq('household_id', ctx.householdId)
  const closerName = new Map((closers ?? []).map((m) => [m.id as string, m.display_name as string]))

  if (memberRows.length < 2) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <PageHeader eyebrow="Settlements" title="Square up, gently." />
        <EmptyState
          title="Add a second member to settle up"
          body="Settlements track who owes whom between household members, so you need at least two before there's anything to square up."
          action={
            <Link href="/setup">
              <Button variant="primary" size="md">
                Manage members
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  const byPeriod = computeBalancesByPeriod(data)
  const toVM = (l: { from_member_id: string; to_member_id: string; net_cents: number }): LineVM => ({
    ...l,
    fromName: memberName.get(l.from_member_id) ?? 'Member',
    toName: memberName.get(l.to_member_id) ?? 'Member',
    involvesMe: ctx.memberId !== null && (l.from_member_id === ctx.memberId || l.to_member_id === ctx.memberId),
  })

  const open = data.openPeriod
  const openStatement = open ? computePeriodStatement(open.id, byPeriod, data.periods) : null

  // Periods needing action, newest first; the rest go to history.
  const { data: periodRows } = await supabase
    .from('settlement_periods')
    .select('id, status, closed_by')
    .eq('household_id', ctx.householdId)
  const closedBy = new Map((periodRows ?? []).map((p) => [p.id as string, (p.closed_by as string | null) ?? null]))

  const past = data.periods
    .filter((p) => p.status !== 'open')
    .slice()
    .sort((a, b) => (a.period_start < b.period_start ? 1 : -1))
  const awaiting = past.filter((p) => p.status === 'closed')

  const periodVMs: PeriodVM[] = past.map((p) => {
    const st = computePeriodStatement(p.id, byPeriod, data.periods)
    return {
      id: p.id,
      period_start: p.period_start,
      period_end: p.period_end,
      status: p.status,
      closedByName: closedBy.get(p.id) ? (closerName.get(closedBy.get(p.id)!) ?? null) : null,
      lines: st.lines.map(toVM),
      totalNetCents: st.totalNetCents,
      settlements: data.settlements
        .filter((s) => s.period_id === p.id)
        .map((s) => ({
          id: s.id,
          fromName: memberName.get(s.from_member_id) ?? 'Member',
          toName: memberName.get(s.to_member_id) ?? 'Member',
          amount_cents: s.amount_cents,
          settled_on: s.settled_on,
          note: s.note,
        })),
    }
  })

  const trend: SparklinePoint[] = past
    .slice(0, 12)
    .reverse()
    .map((p) => ({
      label: new Date(p.period_start + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short' }),
      value: computePeriodStatement(p.id, byPeriod, data.periods).totalOwedCents,
    }))
  const hasTrend = trend.length >= 2 && trend.some((p) => p.value !== 0)

  const totalOutstanding = (openStatement?.totalNetCents ?? 0)
  const today = todayISO()
  const nextClose = nextAutoCloseDate(today, data.closeDay, data.lastClosedAtISO)
  const suggestion = openStatement?.lines.find((l) => l.from_member_id === ctx.memberId || l.to_member_id === ctx.memberId) ?? openStatement?.lines[0] ?? null

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader eyebrow="Settlements" title="Square up, gently." subtitle="Shared expenses close on a schedule; settle each statement in one tap." />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Shared this period" value={<Amount cents={openStatement?.totalOwedCents ?? 0} tone="ink" />} tone="ink" />
        <StatTile label="Awaiting payment" value={String(awaiting.length)} tone={awaiting.length > 0 ? 'maple' : 'ink'} hint={awaiting.length === 1 ? 'statement' : 'statements'} />
        <StatTile
          label="Outstanding now"
          value={<Amount cents={totalOutstanding} tone={totalOutstanding > 0 ? 'maple' : 'ink'} />}
          tone={totalOutstanding > 0 ? 'maple' : 'ink'}
          hint={totalOutstanding > 0 ? 'incl. carry-forward' : 'all square'}
        />
      </section>

      {awaiting.map((p) => {
        const st = computePeriodStatement(p.id, byPeriod, data.periods)
        return (
          <AwaitingSettlementCard key={p.id} periodId={p.id} periodStart={p.period_start} periodEnd={p.period_end ?? today} lines={st.lines.map(toVM)} />
        )
      })}

      {open && openStatement && (
        <OpenPeriodCard
          periodStart={open.period_start}
          lines={openStatement.lines.map(toVM)}
          carryForward={openStatement.carryForward.map(toVM)}
          nextAutoClose={nextClose}
          closeDay={data.closeDay}
        />
      )}

      <Card>
        <MapleLabel>Record payment</MapleLabel>
        <p className="mt-1 text-[13px] text-ink-2">Log an e-transfer or other reimbursement between household members. It doesn&rsquo;t touch budgets or P&amp;L.</p>
        <RecordSettlementForm
          members={memberRows}
          defaultDate={today}
          suggestion={suggestion}
          periodId={open?.id ?? null}
        />
      </Card>

      <PeriodHistory periods={periodVMs} highlightId={params.period ?? null} />

      <Card>
        <MapleLabel>Shared per period</MapleLabel>
        {hasTrend ? (
          <div className="mt-3 text-ink">
            <Sparkline points={trend} fill ariaLabel="Shared amount per closed period" />
          </div>
        ) : (
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">Once a few periods have closed, the trend of what you share each period appears here.</p>
        )}
      </Card>
    </div>
  )
}
