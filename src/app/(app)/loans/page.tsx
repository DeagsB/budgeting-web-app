import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney, formatDate, monthStartISO } from '@/lib/format'
import { amortize } from '@/lib/amortization'
import { LoanForm } from './form'

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

export default async function LoansPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const month = monthStartISO()

  const [{ data: loanAccounts }, { data: loanDetails }, { data: snapshots }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, opening_balance_cents, type')
      .eq('household_id', ctx.householdId)
      .eq('type', 'loan')
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('loan_details')
      .select('account_id, annual_rate_bps, origination_date, original_principal_cents, contractual_monthly_payment_cents')
      .eq('household_id', ctx.householdId),
    supabase
      .from('account_balance_snapshots')
      .select('account_id, balance_cents, as_of_month')
      .eq('household_id', ctx.householdId)
      .order('as_of_month', { ascending: false }),
  ])

  const accounts: LoanAccount[] = (loanAccounts ?? []) as LoanAccount[]
  const detailByAccount = new Map<string, LoanDetail>()
  for (const d of loanDetails ?? []) detailByAccount.set(d.account_id, d as LoanDetail)

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
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Loans</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your loan terms to project payoff date, remaining interest, and per-month
          principal/interest breakdown.
        </p>
      </header>

      {accounts.length === 0 ? (
        <section className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          No loan accounts yet. Create one on the{' '}
          <Link href="/accounts" className="font-medium text-gray-900 underline">
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

            return (
              <LoanCard
                key={a.id}
                account={a}
                detail={detail ?? null}
                currentBalanceCents={currentBalance}
                snapshotDate={snap?.as_of_month ?? null}
                month={month}
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
}: {
  account: LoanAccount
  detail: LoanDetail | null
  currentBalanceCents: number
  snapshotDate: string | null
  month: string
}) {
  const amort = detail
    ? amortize({
        principal_cents: currentBalanceCents,
        annual_rate_bps: detail.annual_rate_bps,
        monthly_payment_cents: detail.contractual_monthly_payment_cents,
      })
    : null

  const ratePct = detail ? (detail.annual_rate_bps / 100).toFixed(3) : ''

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">{account.name}</h2>
        <p className="text-sm text-gray-500">
          Current balance{' '}
          <span className="font-medium text-gray-900 tabular-nums">
            {formatMoney(currentBalanceCents)}
          </span>
          {snapshotDate && (
            <span className="text-xs text-gray-500"> (as of {formatDate(snapshotDate)})</span>
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

      {amort && detail && (
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <Tile
            label="Months to payoff"
            value={amort.months < 600 ? String(amort.months) : '600+'}
          />
          <Tile label="Total remaining interest" value={formatMoney(amort.total_interest_cents)} />
          <Tile label="Total remaining payments" value={formatMoney(amort.total_payments_cents)} />
          <Tile
            label="Next month"
            value={
              amort.schedule[0]
                ? `${formatMoney(amort.schedule[0].principal_cents)} principal + ${formatMoney(amort.schedule[0].interest_cents)} interest`
                : '—'
            }
            small
          />
        </div>
      )}

      {amort && amort.schedule.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 text-right font-medium">Starting</th>
                <th className="px-4 py-2 text-right font-medium">Interest</th>
                <th className="px-4 py-2 text-right font-medium">Principal</th>
                <th className="px-4 py-2 text-right font-medium">Payment</th>
                <th className="px-4 py-2 text-right font-medium">Ending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {amort.schedule.slice(0, 12).map((r) => (
                <tr key={r.index}>
                  <td className="px-4 py-1 text-gray-500">{r.index}</td>
                  <td className="px-4 py-1 text-right tabular-nums">
                    {formatMoney(r.starting_cents)}
                  </td>
                  <td className="px-4 py-1 text-right tabular-nums text-red-700">
                    {formatMoney(r.interest_cents)}
                  </td>
                  <td className="px-4 py-1 text-right tabular-nums text-green-700">
                    {formatMoney(r.principal_cents)}
                  </td>
                  <td className="px-4 py-1 text-right tabular-nums">
                    {formatMoney(r.payment_cents)}
                  </td>
                  <td className="px-4 py-1 text-right tabular-nums">
                    {formatMoney(r.ending_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {amort.schedule.length > 12 && (
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
              First 12 months shown. Full projection has {amort.schedule.length} periods.
            </div>
          )}
        </div>
      )}

      {!detail && (
        <p className="mt-4 text-xs text-gray-500">
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
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={small ? 'mt-1 text-xs text-gray-700' : 'mt-1 text-lg font-semibold tabular-nums'}>
        {value}
      </div>
    </div>
  )
}
