import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney, formatDate, monthStartISO, monthLabel, addMonths } from '@/lib/format'
import { amortize, buildRateLookup, type AmortResult } from '@/lib/amortization'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatTile } from '@/components/ui/stat-tile'
import { Amount } from '@/components/ui/amount'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable } from '@/components/ui/data-table'
import { MapleLabel } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { LoanForm } from './form'
import { RateHistory } from './rate-history'

type LoanAccount = {
  id: string
  name: string
  opening_balance_cents: number
  type: string
}

type LoanDetail = {
  account_id: string
  annual_rate_bps: number
  origination_date: string
  original_principal_cents: number
  contractual_monthly_payment_cents: number
}

type RateChange = {
  id: string
  account_id: string
  effective_month: string
  annual_rate_bps: number
  note: string | null
}

// Format a month count as a payoff date label. 600 is the amortiser's cap, so
// anything at or above it means the payment never clears the balance.
function payoffLabel(month: string, months: number): string {
  if (months >= 600) return 'Never at this payment'
  if (months <= 0) return 'Paid off'
  return monthLabel(addMonths(month, months))
}

export default async function LoansPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const month = monthStartISO()

  const [{ data: loanAccounts }, { data: loanDetails }, { data: snapshots }, { data: rateChanges }] =
    await Promise.all([
      supabase
        .from('accounts')
        .select('id, name, opening_balance_cents, type')
        .eq('household_id', ctx.householdId)
        .eq('type', 'loan')
        .is('archived_at', null)
        .order('name'),
      supabase
        .from('loan_details')
        .select(
          'account_id, annual_rate_bps, origination_date, original_principal_cents, contractual_monthly_payment_cents',
        )
        .eq('household_id', ctx.householdId),
      supabase
        .from('account_balance_snapshots')
        .select('account_id, balance_cents, as_of_month')
        .eq('household_id', ctx.householdId)
        .order('as_of_month', { ascending: false }),
      supabase
        .from('loan_rate_changes')
        .select('id, account_id, effective_month, annual_rate_bps, note')
        .eq('household_id', ctx.householdId)
        .order('effective_month'),
    ])

  const accounts: LoanAccount[] = (loanAccounts ?? []) as LoanAccount[]
  const detailByAccount = new Map<string, LoanDetail>()
  for (const d of loanDetails ?? []) detailByAccount.set(d.account_id, d as LoanDetail)

  const ratesByAccount = new Map<string, RateChange[]>()
  for (const r of (rateChanges ?? []) as RateChange[]) {
    if (!ratesByAccount.has(r.account_id)) ratesByAccount.set(r.account_id, [])
    ratesByAccount.get(r.account_id)!.push(r)
  }

  const latestSnapshot = new Map<string, { balance_cents: number; as_of_month: string }>()
  for (const s of snapshots ?? []) {
    if (!latestSnapshot.has(s.account_id)) {
      latestSnapshot.set(s.account_id, {
        balance_cents: Number(s.balance_cents),
        as_of_month: s.as_of_month,
      })
    }
  }

  // Compute the amortisation once per loan so the household rollup and each card
  // share the same projection.
  const projections = accounts.map((a) => {
    const detail = detailByAccount.get(a.id) ?? null
    const snap = latestSnapshot.get(a.id)
    const currentBalanceCents = snap?.balance_cents ?? Number(a.opening_balance_cents)
    const rates = ratesByAccount.get(a.id) ?? []

    const amort: AmortResult | null = detail
      ? amortize({
          principal_cents: currentBalanceCents,
          monthly_payment_cents: detail.contractual_monthly_payment_cents,
          rateForPeriod: buildRateLookup({
            baseRateBps: detail.annual_rate_bps,
            startMonth: month,
            rateChanges: rates.map((r) => ({
              effective_month: r.effective_month,
              annual_rate_bps: r.annual_rate_bps,
            })),
          }),
        })
      : null

    return {
      account: a,
      detail,
      currentBalanceCents,
      snapshotDate: snap?.as_of_month ?? null,
      rates,
      amort,
    }
  })

  // Household debt rollup.
  const totalOwing = projections.reduce((s, p) => s + p.currentBalanceCents, 0)
  const totalInterest = projections.reduce(
    (s, p) => s + (p.amort?.total_interest_cents ?? 0),
    0,
  )
  // Latest payoff across loans drives the household "debt-free" projection. Any
  // loan that never clears (months capped) makes the whole household open-ended.
  const projectedLoans = projections.filter((p) => p.amort)
  const maxMonths = projectedLoans.reduce((m, p) => Math.max(m, p.amort!.months), 0)
  const anyOpenEnded = projectedLoans.some((p) => p.amort!.months >= 600)
  const householdPayoff =
    projectedLoans.length === 0
      ? null
      : anyOpenEnded
        ? 'Open-ended'
        : payoffLabel(month, maxMonths)

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow="Loans"
        title="Payoff, projected."
        subtitle="Enter loan terms and rate history to project payoff date, remaining interest, and the monthly principal/interest split. Variable-rate loans pick up each rate change as its effective month arrives."
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="No loan accounts yet"
          body="Create one on the Accounts page with type set to Loan, then come back to add terms."
          action={
            <Link href="/accounts">
              <Button variant="primary" size="md">
                Go to Accounts
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {projectedLoans.length > 0 && (
            <Card>
              <div className="flex items-baseline justify-between gap-2">
                <MapleLabel>Household debt</MapleLabel>
                <span className="text-[11px] tabular-nums text-ink-3">
                  {accounts.length} loan{accounts.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <StatTile
                  label="Total owing"
                  tone="maple"
                  value={<Amount cents={totalOwing} />}
                  hint="across all loans"
                />
                <StatTile
                  label="Projected debt-free"
                  value={householdPayoff ?? '—'}
                  hint={
                    householdPayoff === 'Open-ended'
                      ? 'a payment never clears'
                      : 'at current payments'
                  }
                />
                <StatTile
                  label="Remaining interest"
                  value={<Amount cents={totalInterest} />}
                  hint="projected, all loans"
                />
              </div>
            </Card>
          )}

          <div className="flex flex-col gap-6">
            {projections.map((p) => (
              <LoanCard
                key={p.account.id}
                account={p.account}
                detail={p.detail}
                currentBalanceCents={p.currentBalanceCents}
                snapshotDate={p.snapshotDate}
                month={month}
                rateChanges={p.rates}
                amort={p.amort}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LoanCard({
  account,
  detail,
  currentBalanceCents,
  snapshotDate,
  month,
  rateChanges,
  amort,
}: {
  account: LoanAccount
  detail: LoanDetail | null
  currentBalanceCents: number
  snapshotDate: string | null
  month: string
  rateChanges: RateChange[]
  amort: AmortResult | null
}) {
  const hasRateChanges = rateChanges.length > 0
  const nextRow = amort?.schedule[0] ?? null

  return (
    <Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h2 className="font-serif text-[22px] leading-tight tracking-[-0.01em] text-ink">
          {account.name}
        </h2>
        <p className="text-[12.5px] text-ink-2">
          Current balance{' '}
          <span className="font-semibold tabular-nums text-ink">
            {formatMoney(currentBalanceCents)}
          </span>
          {snapshotDate && (
            <span className="text-ink-3"> (as of {formatDate(snapshotDate)})</span>
          )}
        </p>
      </div>

      {/* Projection leads: payoff tiles sit at the top of the card. */}
      {amort && detail && (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <StatTile
            label="Projected payoff"
            value={payoffLabel(month, amort.months)}
            hint={
              amort.months >= 600
                ? 'payment never clears'
                : `${amort.months} month${amort.months === 1 ? '' : 's'}`
            }
          />
          <StatTile
            label="Remaining interest"
            tone="maple"
            value={<Amount cents={amort.total_interest_cents} />}
          />
          <StatTile
            label="Remaining payments"
            value={<Amount cents={amort.total_payments_cents} />}
          />
          <StatTile
            label="Next payment split"
            value={
              nextRow ? (
                <span className="text-[16px] sm:text-[18px]">
                  <Amount cents={nextRow.principal_cents} tone="leaf" className="text-[16px] sm:text-[18px]" />
                  <span className="text-ink-3"> + </span>
                  <Amount cents={nextRow.interest_cents} tone="maple" className="text-[16px] sm:text-[18px]" />
                </span>
              ) : (
                '—'
              )
            }
            hint={hasRateChanges ? 'principal + interest · schedule applies' : 'principal + interest'}
          />
        </div>
      )}

      {detail ? (
        <div className="mt-4">
          <LoanForm
            key="existing"
            accountId={account.id}
            initial={{
              annual_rate_pct: (detail.annual_rate_bps / 100).toFixed(3),
              origination_date: detail.origination_date,
              original_principal: (detail.original_principal_cents / 100).toFixed(2),
              monthly_payment: (detail.contractual_monthly_payment_cents / 100).toFixed(2),
            }}
          />
        </div>
      ) : (
        <div className="mt-4">
          <LoanForm key="new" accountId={account.id} initial={null} />
          <p className="mt-3 text-[12px] text-ink-3">
            Save terms above to see the amortisation projection for {monthLabel(month)}.
          </p>
        </div>
      )}

      {detail && (
        <div className="mt-6">
          <RateHistory
            accountId={account.id}
            baseRateBps={detail.annual_rate_bps}
            originationDate={detail.origination_date}
            rateChanges={rateChanges}
          />
        </div>
      )}

      {amort && amort.schedule.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <MapleLabel>Amortisation schedule</MapleLabel>
            <Legend />
          </div>
          <div className="overflow-hidden rounded-md border border-hair">
            <DataTable minWidth={680}>
              <thead className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3 bg-cream-2">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5 text-right">Rate</th>
                  <th className="px-4 py-2.5 text-right">Starting</th>
                  <th className="px-4 py-2.5 text-right">Interest</th>
                  <th className="px-4 py-2.5 text-right">Principal</th>
                  <th className="px-4 py-2.5 text-right">Payment</th>
                  <th className="px-4 py-2.5 text-right">Ending</th>
                </tr>
              </thead>
              <tbody>
                {amort.schedule.slice(0, 12).map((r) => (
                  <tr key={r.index} className="border-t border-hair">
                    <td className="px-4 py-1.5 text-ink-3">{r.index}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-ink-3">
                      {(r.rate_bps / 100).toFixed(3)}%
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <Amount cents={r.starting_cents} />
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <Amount cents={r.interest_cents} tone="maple" />
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <Amount cents={r.principal_cents} tone="leaf" />
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <Amount cents={r.payment_cents} />
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <Amount cents={r.ending_cents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {amort.schedule.length > 12 && (
              <div className="border-t border-hair bg-cream-2 px-4 py-2 text-[11.5px] text-ink-3">
                First 12 months shown. Full projection has {amort.schedule.length} periods.
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// Principal / interest colour key for the schedule and payment-split tile.
function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-leaf" aria-hidden />
        Principal
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-maple" aria-hidden />
        Interest
      </span>
    </div>
  )
}
