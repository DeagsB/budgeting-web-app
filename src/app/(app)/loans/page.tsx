import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney, formatDate, monthStartISO } from '@/lib/format'
import { amortize, buildRateLookup } from '@/lib/amortization'
import { MapleLabel } from '@/components/ui/label'
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

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Loans
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
          Payoff, projected.
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          Enter loan terms and rate history to project payoff date, remaining interest, and the
          monthly principal/interest split. Variable-rate loans pick up each rate change as its
          effective month arrives.
        </p>
      </header>

      {accounts.length === 0 ? (
        <section className="rounded-[20px] border border-dashed border-[var(--color-hair)] bg-[var(--color-paper-2)] px-5 py-8 text-[13.5px] text-[var(--color-ink-2)]">
          No loan accounts yet. Create one on the{' '}
          <Link
            href="/accounts"
            className="font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
          >
            Accounts
          </Link>{' '}
          page with type set to Loan.
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {accounts.map((a) => {
            const detail = detailByAccount.get(a.id)
            const snap = latestSnapshot.get(a.id)
            const currentBalance = snap?.balance_cents ?? Number(a.opening_balance_cents)
            const rates = ratesByAccount.get(a.id) ?? []

            return (
              <LoanCard
                key={a.id}
                account={a}
                detail={detail ?? null}
                currentBalanceCents={currentBalance}
                snapshotDate={snap?.as_of_month ?? null}
                month={month}
                rateChanges={rates}
              />
            )
          })}
        </div>
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
}: {
  account: LoanAccount
  detail: LoanDetail | null
  currentBalanceCents: number
  snapshotDate: string | null
  month: string
  rateChanges: RateChange[]
}) {
  const amort = detail
    ? amortize({
        principal_cents: currentBalanceCents,
        monthly_payment_cents: detail.contractual_monthly_payment_cents,
        rateForPeriod: buildRateLookup({
          baseRateBps: detail.annual_rate_bps,
          startMonth: month,
          rateChanges: rateChanges.map((r) => ({
            effective_month: r.effective_month,
            annual_rate_bps: r.annual_rate_bps,
          })),
        }),
      })
    : null

  const ratePct = detail ? (detail.annual_rate_bps / 100).toFixed(3) : ''
  const hasRateChanges = rateChanges.length > 0

  return (
    <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h2 className="font-serif text-[22px] leading-tight tracking-[-0.01em] text-[var(--color-ink)]">
          {account.name}
        </h2>
        <p className="text-[12.5px] text-[var(--color-ink-2)]">
          Current balance{' '}
          <span className="font-semibold tabular-nums text-[var(--color-ink)]">
            {formatMoney(currentBalanceCents)}
          </span>
          {snapshotDate && (
            <span className="text-[var(--color-ink-3)]"> (as of {formatDate(snapshotDate)})</span>
          )}
        </p>
      </div>

      <div className="mt-4">
        <LoanForm
          key={detail ? 'existing' : 'new'}
          accountId={account.id}
          initial={
            detail
              ? {
                  annual_rate_pct: ratePct,
                  origination_date: detail.origination_date,
                  original_principal: (detail.original_principal_cents / 100).toFixed(2),
                  monthly_payment: (
                    detail.contractual_monthly_payment_cents / 100
                  ).toFixed(2),
                }
              : null
          }
        />
      </div>

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

      {amort && detail && (
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Tile
            label="Months to payoff"
            value={amort.months < 600 ? String(amort.months) : '600+'}
          />
          <Tile label="Remaining interest" value={formatMoney(amort.total_interest_cents)} />
          <Tile label="Remaining payments" value={formatMoney(amort.total_payments_cents)} />
          <Tile
            label={hasRateChanges ? 'Schedule applies' : 'Constant rate'}
            value={
              amort.schedule[0]
                ? `${formatMoney(amort.schedule[0].principal_cents)} principal + ${formatMoney(amort.schedule[0].interest_cents)} interest (next month)`
                : '—'
            }
            small
          />
        </div>
      )}

      {amort && amort.schedule.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-[14px] border border-[var(--color-hair)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[12.5px]">
              <thead
                className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]"
                style={{ background: 'var(--color-cream-2)' }}
              >
                <tr>
                  <th className="px-4 py-2.5 font-bold">#</th>
                  <th className="px-4 py-2.5 text-right font-bold">Rate</th>
                  <th className="px-4 py-2.5 text-right font-bold">Starting</th>
                  <th className="px-4 py-2.5 text-right font-bold">Interest</th>
                  <th className="px-4 py-2.5 text-right font-bold">Principal</th>
                  <th className="px-4 py-2.5 text-right font-bold">Payment</th>
                  <th className="px-4 py-2.5 text-right font-bold">Ending</th>
                </tr>
              </thead>
              <tbody>
                {amort.schedule.slice(0, 12).map((r) => (
                  <tr key={r.index} className="border-t border-[var(--color-hair)]">
                    <td className="px-4 py-1.5 text-[var(--color-ink-3)]">{r.index}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-[var(--color-ink-3)]">
                      {(r.rate_bps / 100).toFixed(3)}%
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-[var(--color-ink)]">
                      {formatMoney(r.starting_cents)}
                    </td>
                    <td
                      className="px-4 py-1.5 text-right tabular-nums"
                      style={{ color: 'var(--color-maple)' }}
                    >
                      {formatMoney(r.interest_cents)}
                    </td>
                    <td
                      className="px-4 py-1.5 text-right tabular-nums"
                      style={{ color: 'var(--color-leaf)' }}
                    >
                      {formatMoney(r.principal_cents)}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-[var(--color-ink)]">
                      {formatMoney(r.payment_cents)}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-[var(--color-ink)]">
                      {formatMoney(r.ending_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {amort.schedule.length > 12 && (
            <div
              className="border-t border-[var(--color-hair)] px-4 py-2 text-[11.5px] text-[var(--color-ink-3)]"
              style={{ background: 'var(--color-cream-2)' }}
            >
              First 12 months shown. Full projection has {amort.schedule.length} periods.
            </div>
          )}
        </div>
      )}

      {!detail && (
        <p className="mt-4 text-[12px] text-[var(--color-ink-3)]">
          Save terms above to see the amortisation projection for {month}.
        </p>
      )}
    </section>
  )
}

function Tile({
  label,
  value,
  small,
}: {
  label: string
  value: string
  small?: boolean
}) {
  return (
    <div className="rounded-[14px] border border-[var(--color-hair)] bg-[var(--color-paper-2)] p-3">
      <MapleLabel>{label}</MapleLabel>
      <div
        className={
          small
            ? 'mt-1 text-[12px] text-[var(--color-ink-2)]'
            : 'mt-1 font-serif text-[20px] leading-tight tracking-[-0.01em] tabular-nums text-[var(--color-ink)]'
        }
      >
        {value}
      </div>
    </div>
  )
}
