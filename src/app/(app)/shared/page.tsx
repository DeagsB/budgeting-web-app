import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatDate, formatMoney, monthLabel, monthStartISO } from '@/lib/format'
import { addMonthsISO, todayISO } from '@/lib/dates'
import { computeBalancesByPeriod, computePeriodStatement, nextAutoCloseDate } from '@/lib/settlement'
import { loadSettlementData } from '@/lib/settlement-data'
import { buildSettlementMatchContext, candidateMember, decide } from '@/lib/settlement-detect'
import { ruleMatches, type TransactionRule } from '@/lib/transaction-rules'
import { loadTransferLegIds } from '@/lib/transfer-legs'
import { ownershipLabel } from '@/lib/tx-scope'
import { Sparkline, type SparklinePoint } from '@/components/sparkline'
import { PageHeader } from '@/components/ui/page-header'
import { MonthNav } from '@/components/ui/month-nav'
import { StatTile } from '@/components/ui/stat-tile'
import { EmptyState } from '@/components/ui/empty-state'
import { Card } from '@/components/ui/card'
import { Amount } from '@/components/ui/amount'
import { ResponsiveAmount } from '@/components/ui/responsive-amount'
import { Button } from '@/components/ui/button'
import { MapleLabel } from '@/components/ui/label'
import { SharedRow } from './row'
import { BulkActions } from './bulk-actions'
import { AccountSwitcher } from './account-switcher'
import { RecordSettlementForm } from './record-form'
import { AwaitingSettlementCard, OpenPeriodCard, type LineVM } from './period-card'
import { PeriodHistory, type PeriodVM } from './period-history'
import { PaymentPrompts, type PaymentPromptVM } from './payment-prompts'
import { DetectSettlementsNudge } from './detect-nudge'

export const dynamic = 'force-dynamic'

type Account = { id: string; name: string; type: string; member_id: string | null; ownership: string }
type Member = { id: string; display_name: string }
type Txn = {
  id: string
  occurred_on: string
  amount_cents: number
  description: string | null
  member_id: string | null
}
type Share = { id: string; transaction_id: string; member_id: string; amount_cents: number; rule_id: string | null }
/** A crossover: another member paid, this login holds a share. Read-only. */
type SharedWithMe = {
  id: string
  occurred_on: string
  amount_cents: number
  description: string | null
  account_id: string
  payer_id: string | null
  my_share_cents: number
}

/**
 * /shared - one place for shared money: what is owed right now, statements
 * waiting to be paid, payments the ledger found, what others shared with
 * you, the per-account flagging list, and the history.
 */
export default async function SharedPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; account?: string; period?: string }>
}) {
  const params = await searchParams
  const month = params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const nextMonth = addMonths(month, 1)
  const today = todayISO()

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [
    { data: accounts },
    { data: members },
    { data: allMembers },
    { data: categories },
    { data: rules },
    data,
    { data: periodRows },
    { data: recentTx },
    transferLegIds,
  ] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, member_id, ownership')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('members')
      .select('id, display_name, split_weight')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('sort_order'),
    supabase.from('members').select('id, display_name').eq('household_id', ctx.householdId),
    supabase
      .from('categories')
      .select('id, parent_id, name')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('sort_order'),
    supabase
      .from('transaction_rules')
      .select('id, household_id, name, enabled, sort_order, match_text, amount_min_cents, amount_max_cents, account_id, direction, share_mode, share_weights, category_id, is_settlement')
      .eq('household_id', ctx.householdId),
    loadSettlementData(supabase, ctx.householdId),
    supabase.from('settlement_periods').select('id, closed_by').eq('household_id', ctx.householdId),
    // Payment candidates come from the recent ledger (RLS: rows this login can see).
    supabase
      .from('transactions')
      .select('id, occurred_on, amount_cents, description, account_id, member_id, settlement_ignored')
      .eq('household_id', ctx.householdId)
      .eq('settlement_ignored', false)
      .gte('occurred_on', addMonthsISO(today, -3))
      .order('occurred_on', { ascending: false })
      .limit(2000),
    // An e-Transfer between two of the household's own accounts is a
    // transfer, never a payment between members - keep it out of the prompts.
    loadTransferLegIds(supabase, ctx.householdId),
  ])

  const accountRows = (accounts ?? []) as Account[]
  const memberRows = (members ?? []) as (Member & { split_weight: number | null })[]
  const categoryRows = (categories ?? []).map((c) => ({ id: c.id as string, parent_id: (c.parent_id as string | null) ?? null, name: c.name as string }))
  const ruleList: TransactionRule[] = (rules ?? []).map((r) => ({
    id: r.id as string,
    household_id: r.household_id as string,
    name: r.name as string,
    enabled: r.enabled as boolean,
    sort_order: Number(r.sort_order),
    match_text: r.match_text as string,
    amount_min_cents: r.amount_min_cents === null ? null : Number(r.amount_min_cents),
    amount_max_cents: r.amount_max_cents === null ? null : Number(r.amount_max_cents),
    account_id: (r.account_id as string | null) ?? null,
    direction: r.direction as TransactionRule['direction'],
    share_mode: r.share_mode as TransactionRule['share_mode'],
    share_weights: (r.share_weights as Record<string, number> | null) ?? null,
    category_id: (r.category_id as string | null) ?? null,
    is_settlement: Boolean(r.is_settlement),
  }))
  const ruleName = new Map(ruleList.map((r) => [r.id, r.name]))
  const settlementRules = ruleList.filter((r) => r.is_settlement && r.enabled)
  const memberWeights = memberRows.map((m) => ({ id: m.id, name: m.display_name, weight: Number(m.split_weight ?? 1) }))
  const memberName = new Map((allMembers ?? []).map((m) => [m.id as string, m.display_name as string]))
  const closedBy = new Map((periodRows ?? []).map((p) => [p.id as string, (p.closed_by as string | null) ?? null]))

  function monthHref(iso: string) {
    const qs = new URLSearchParams()
    qs.set('month', iso)
    if (params.account) qs.set('account', params.account)
    return `/shared?${qs.toString()}`
  }

  // ── Gate: sharing needs two people with logins ─────────────────────────
  if (memberRows.length < 2) {
    return (
      <div className="flex flex-col gap-6 pb-10">
        <PageHeader eyebrow="Shared expenses" title="Split fairly. Settle quickly." />
        <EmptyState
          title="Invite another member"
          body="Sharing needs another member with a login. Invite one in Setup and their share of each expense lands here."
          action={
            <Link href="/setup">
              <Button variant="primary" size="md">
                Go to Setup
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  // ── Statement ──────────────────────────────────────────────────────────
  const byPeriod = computeBalancesByPeriod(data)
  const toVM = (l: { from_member_id: string; to_member_id: string; net_cents: number }): LineVM => ({
    ...l,
    fromName: memberName.get(l.from_member_id) ?? 'Member',
    toName: memberName.get(l.to_member_id) ?? 'Member',
    involvesMe: ctx.memberId !== null && (l.from_member_id === ctx.memberId || l.to_member_id === ctx.memberId),
  })
  const open = data.openPeriod
  const openStatement = open ? computePeriodStatement(open.id, byPeriod, data.periods) : null
  const past = data.periods
    .filter((p) => p.status !== 'open')
    .slice()
    .sort((a, b) => (a.period_start < b.period_start ? 1 : -1))
  const awaiting = past.filter((p) => p.status === 'closed')
  const totalOutstanding = openStatement?.totalNetCents ?? 0
  const nextClose = nextAutoCloseDate(today, data.closeDay, data.lastClosedAtISO)
  const suggestion =
    openStatement?.lines.find((l) => l.from_member_id === ctx.memberId || l.to_member_id === ctx.memberId) ?? openStatement?.lines[0] ?? null

  const periodVMs: PeriodVM[] = past.map((p) => {
    const st = computePeriodStatement(p.id, byPeriod, data.periods)
    const closer = closedBy.get(p.id)
    return {
      id: p.id,
      period_start: p.period_start,
      period_end: p.period_end,
      status: p.status,
      closedByName: closer ? (memberName.get(closer) ?? null) : null,
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
          fromLedger: s.paid_transaction_id !== null || s.received_transaction_id !== null,
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

  // ── Payments the ledger found but could not place ──────────────────────
  const matchCtx = buildSettlementMatchContext(data, memberRows.map((m) => m.id))
  const accountOwner = new Map(accountRows.map((a) => [a.id, a.member_id]))
  const prompts: PaymentPromptVM[] = []
  if (settlementRules.length > 0) {
    const cutoff = addMonthsISO(today, -3)
    for (const t of recentTx ?? []) {
      if ((t.occurred_on as string) < cutoff) continue
      const tx = {
        id: t.id as string,
        description: (t.description as string | null) ?? null,
        amount_cents: Number(t.amount_cents),
        account_id: t.account_id as string,
        member_id: (t.member_id as string | null) ?? null,
      }
      if (!settlementRules.some((r) => ruleMatches(r, tx))) continue
      const member = candidateMember(tx, accountOwner)
      if (!member || matchCtx.linkedTxIds.has(tx.id) || transferLegIds.has(tx.id)) continue
      const m = decide(matchCtx, { transaction_id: tx.id, member_id: member, amount_cents: tx.amount_cents, occurred_on: t.occurred_on as string })
      const others = memberRows.filter((x) => x.id !== member).map((x) => ({ id: x.id, name: x.display_name }))
      // Auto-placeable rows (rule created without a retro-apply, say) are
      // offered with the answer pre-filled; one tap records them.
      const suggested =
        m.kind === 'prompt'
          ? m.suggested_counterparty
          : m.kind === 'record'
            ? m.from_member_id === member
              ? m.to_member_id
              : m.from_member_id
            : (() => {
                const s = matchCtx.existing.find((x) => x.id === m.settlement_id)
                return s ? (s.from_member_id === member ? s.to_member_id : s.from_member_id) : null
              })()
      prompts.push({
        transaction_id: tx.id,
        description: tx.description,
        occurredLabel: formatDate(t.occurred_on as string),
        amount_cents: tx.amount_cents,
        memberName: memberName.get(member) ?? 'Member',
        mine: member === ctx.memberId,
        suggested_counterparty: suggested,
        counterparties: others,
      })
    }
  }

  // ── Shared with me (crossovers) ────────────────────────────────────────
  const visibleAccountIds = new Set(accountRows.map((a) => a.id))
  const { data: withMeRows } = ctx.memberId
    ? await supabase
        .from('transaction_shares')
        .select('amount_cents, transaction:transactions!inner(id, occurred_on, amount_cents, description, account_id, member_id)')
        .eq('household_id', ctx.householdId)
        .eq('member_id', ctx.memberId)
        .neq('transaction.member_id', ctx.memberId)
        .gte('transaction.occurred_on', month)
        .lt('transaction.occurred_on', nextMonth)
    : { data: null }
  const sharedWithMe: SharedWithMe[] = (
    (withMeRows ?? []) as unknown as {
      amount_cents: number
      transaction: { id: string; occurred_on: string; amount_cents: number; description: string | null; account_id: string; member_id: string | null } | null
    }[]
  )
    .filter((r) => r.transaction && !visibleAccountIds.has(r.transaction.account_id))
    .map((r) => ({
      id: r.transaction!.id,
      occurred_on: r.transaction!.occurred_on,
      amount_cents: Number(r.transaction!.amount_cents),
      description: r.transaction!.description,
      account_id: r.transaction!.account_id,
      payer_id: r.transaction!.member_id,
      my_share_cents: Number(r.amount_cents),
    }))
    .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0))
  const owedByMe = sharedWithMe.reduce((s, r) => s + r.my_share_cents, 0)

  // ── Flagging list for one account ──────────────────────────────────────
  const selectedAccountId = params.account ?? accountRows.find((a) => a.type === 'credit_card')?.id ?? accountRows[0]?.id ?? null
  const selectedAccount = accountRows.find((a) => a.id === selectedAccountId) ?? null

  let transactions: Txn[] = []
  let shares: Share[] = []
  if (selectedAccountId) {
    const [{ data: txRows }, { data: shareRows }] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, occurred_on, amount_cents, description, member_id')
        .eq('household_id', ctx.householdId)
        .eq('account_id', selectedAccountId)
        .gte('occurred_on', month)
        .lt('occurred_on', nextMonth)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('transaction_shares')
        .select('id, transaction_id, member_id, amount_cents, rule_id, transaction:transactions!inner(account_id, occurred_on)')
        .eq('household_id', ctx.householdId)
        .eq('transaction.account_id', selectedAccountId)
        .gte('transaction.occurred_on', month)
        .lt('transaction.occurred_on', nextMonth),
    ])
    transactions = (txRows ?? []) as Txn[]
    shares = ((shareRows ?? []) as (Share & { transaction?: unknown })[]).map((s) => ({
      id: s.id,
      transaction_id: s.transaction_id,
      member_id: s.member_id,
      amount_cents: Number(s.amount_cents),
      rule_id: (s.rule_id as string | null) ?? null,
    }))
  }
  const sharesByTx = new Map<string, Share[]>()
  for (const s of shares) {
    if (!sharesByTx.has(s.transaction_id)) sharesByTx.set(s.transaction_id, [])
    sharesByTx.get(s.transaction_id)!.push(s)
  }
  const flaggedCount = transactions.filter((t) => (sharesByTx.get(t.id)?.length ?? 0) > 0).length
  const totalShared = shares.reduce((s, sh) => s + (transactions.some((t) => t.id === sh.transaction_id) ? sh.amount_cents : 0), 0)
  const flaggedRatio = transactions.length === 0 ? 0 : flaggedCount / transactions.length
  const switcherAccounts = accountRows.map((a) => ({ id: a.id, name: a.name, owner: ownershipLabel(a.ownership) }))

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow="Shared expenses"
        title="Split fairly. Settle quickly."
        subtitle={totalOutstanding > 0 ? `Outstanding now: ${formatMoney(totalOutstanding)}` : 'All square'}
      />

      {/* 1. Balance - the running tally is the page's single number. */}
      {open && openStatement && (
        <OpenPeriodCard
          periodStart={open.period_start}
          today={today}
          lines={openStatement.lines.map(toVM)}
          carryForward={openStatement.carryForward.map(toVM)}
          nextAutoClose={nextClose}
          closeDay={data.closeDay}
        />
      )}
      {settlementRules.length === 0 && <DetectSettlementsNudge />}

      {/* 2. Statements waiting to be paid. */}
      {awaiting.map((p) => {
        const st = computePeriodStatement(p.id, byPeriod, data.periods)
        return <AwaitingSettlementCard key={p.id} periodId={p.id} periodStart={p.period_start} periodEnd={p.period_end ?? today} lines={st.lines.map(toVM)} />
      })}

      {/* 3. Payments the ledger found. */}
      <PaymentPrompts prompts={prompts} />

      {/* 4. Crossovers - another member paid, this login owes a share. Read-only. */}
      {sharedWithMe.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <header className="flex items-baseline justify-between gap-3 border-b border-hair px-5 py-3.5">
            <MapleLabel>Shared with you</MapleLabel>
            <span className="text-[11px] text-ink-3">
              Your share <Amount cents={owedByMe} className="text-[11px] font-semibold" />
            </span>
          </header>
          <ul className="divide-y divide-hair">
            {sharedWithMe.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-3.5 text-[14px]">
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{r.description ?? '-'}</div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {formatDate(r.occurred_on)} · paid by {r.payer_id ? (memberName.get(r.payer_id) ?? 'another member') : 'another member'} ·{' '}
                    {formatMoney(Math.abs(r.amount_cents))} total
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Amount cents={r.my_share_cents} tone="maple" className="text-[16px]" />
                  <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-3">Your share</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 5. Flag transactions on one account. */}
      {!selectedAccount ? (
        <EmptyState
          title="Add an account to get started"
          body="Once an account exists, transactions on it can be flagged as shared."
          action={
            <Link href="/accounts">
              <Button variant="primary" size="md">
                Add an account
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <Card padding="md">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <AccountSwitcher accounts={switcherAccounts} selectedId={selectedAccount.id} month={month} />
              <BulkActions accountId={selectedAccount.id} month={month} />
            </div>
          </Card>

          <section className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatTile compact className="sm:p-4" label="Transactions" value={String(transactions.length)} foot={`in ${monthLabel(month)}`} />
            <StatTile compact className="sm:p-4" label="Shared" value={`${flaggedCount} / ${transactions.length || 0}`} progress={flaggedRatio} />
            <StatTile compact className="sm:p-4" label="Total shared" value={<ResponsiveAmount cents={totalShared} />} foot="this account" />
          </section>

          <MonthNav monthISO={month} makeHref={monthHref} />

          <Card padding="none" className="overflow-hidden">
            <header className="flex items-baseline justify-between border-b border-hair px-5 py-3.5">
              <MapleLabel>Transactions on {selectedAccount.name}</MapleLabel>
              {transactions.length > 0 && (
                <span className="text-[11px] text-ink-3">
                  {flaggedCount}/{transactions.length} shared
                </span>
              )}
            </header>
            {transactions.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13.5px] text-ink-2">No transactions in {monthLabel(month)}.</p>
            ) : (
              <ul className="divide-y divide-hair">
                {transactions.map((t) => {
                  const txShares = sharesByTx.get(t.id) ?? []
                  const payerId = t.member_id
                  return (
                    <SharedRow
                      key={t.id}
                      transaction={{
                        id: t.id,
                        occurredLabel: formatDate(t.occurred_on),
                        amount_cents: t.amount_cents,
                        description: t.description,
                        payer_id: payerId,
                        payerName: payerId ? (memberName.get(payerId) ?? null) : null,
                      }}
                      members={memberRows.map((m) => ({ id: m.id, name: m.display_name }))}
                      memberWeights={memberWeights}
                      accounts={accountRows.map((a) => ({ id: a.id, name: a.name }))}
                      categories={categoryRows}
                      accountId={selectedAccount.id}
                      ruleName={(() => {
                        const rid = txShares.find((s) => s.rule_id)?.rule_id
                        return rid ? (ruleName.get(rid) ?? 'a rule') : null
                      })()}
                      shares={txShares.map((s) => ({ member_id: s.member_id, amount_cents: s.amount_cents }))}
                    />
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* 6. History, trend, and the by-hand fallback. */}
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

      <details className="group rounded-lg border border-hair bg-paper">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[13.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          Record a payment by hand
          <span className="text-[12px] font-normal text-ink-3 group-open:hidden">Cash, or a transfer the bank did not label</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 transition-transform group-open:rotate-180" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <div className="border-t border-hair px-5 pb-5">
          <p className="mt-3 text-[13px] text-ink-2">Payments that show up on your bank feed are recorded on their own. Use this for anything else.</p>
          <RecordSettlementForm
            members={memberRows.map((m) => ({ id: m.id, name: m.display_name }))}
            myMemberId={ctx.memberId}
            defaultDate={today}
            suggestion={suggestion}
            periodId={open?.id ?? null}
          />
        </div>
      </details>
    </div>
  )
}
