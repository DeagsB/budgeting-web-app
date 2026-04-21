import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatDate, formatMoney, monthLabel, monthStartISO } from '@/lib/format'
import { computePairBalances, netUnorderedPairs } from '@/lib/settlement'
import { Sparkline, type SparklinePoint } from '@/components/sparkline'
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
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('transactions')
      .select('id, amount_cents, member_id')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', month)
      .lt('occurred_on', nextMonth),
    supabase
      .from('transaction_shares')
      .select(
        'id, transaction_id, member_id, amount_cents, transaction:transactions!inner(occurred_on)',
      )
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
      .select(
        'transaction_id, member_id, amount_cents, transaction:transactions!inner(occurred_on)',
      )
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

  // Totals for the tiles
  const totalOwed = Array.from(pairs.values()).reduce((s, p) => s + Math.max(0, p.owed_cents), 0)
  const totalSettled = Array.from(pairs.values()).reduce((s, p) => s + p.settled_cents, 0)
  const totalNet = netPairs.reduce((s, p) => s + p.net_cents, 0)

  // Sparkline: monthly net outstanding (total of positive net-pair balances) for the past 12 months
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
    const monthTxIds = new Set(yearTxList.filter((t) => t.occurred_on >= m && t.occurred_on < mNext).map((t) => t.id))
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settlements</h1>
          <p className="mt-1 text-sm text-gray-500">{monthLabel(month)} · net balances across household members</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={{ pathname: '/settlements', query: { month: addMonths(month, -1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            ← Previous
          </Link>
          <Link
            href={{ pathname: '/settlements', query: { month: monthStartISO() } }}
            className="text-gray-500 hover:text-gray-900"
          >
            This month
          </Link>
          <Link
            href={{ pathname: '/settlements', query: { month: addMonths(month, 1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            Next →
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Tile label="Total shared this month" value={formatMoney(totalOwed)} />
        <Tile label="Settled via transfer" value={formatMoney(totalSettled)} />
        <Tile
          label="Still outstanding"
          value={formatMoney(totalNet)}
          color={totalNet > 0 ? 'text-red-700' : 'text-gray-900'}
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Who owes whom ({monthLabel(month)})
        </h2>
        {netPairs.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            Nothing outstanding for {monthLabel(month)}. Flag shared expenses on the{' '}
            <Link href="/shared" className="font-medium text-gray-900 underline">
              Shared
            </Link>{' '}
            page or record payments below.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {netPairs.map((p) => (
              <li
                key={`${p.from_member_id}:${p.to_member_id}`}
                className="flex items-baseline justify-between py-2 text-sm"
              >
                <span>
                  <strong className="text-gray-900">
                    {memberName.get(p.from_member_id) ?? 'Member'}
                  </strong>{' '}
                  owes{' '}
                  <strong className="text-gray-900">
                    {memberName.get(p.to_member_id) ?? 'Member'}
                  </strong>
                </span>
                <span className="font-semibold tabular-nums text-red-700">
                  {formatMoney(p.net_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {memberRows.length >= 2 && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Record payment
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Log an e-transfer or other reimbursement between two household members. Doesn&apos;t
            touch budgets or P&amp;L.
          </p>
          <RecordSettlementForm
            members={memberRows.map((m) => ({ id: m.id, name: m.display_name }))}
            defaultDate={new Date().toISOString().slice(0, 10)}
            suggestion={netPairs[0] ?? null}
          />
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-6 py-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Payments in {monthLabel(month)}
        </h2>
        {(monthSettlements ?? []).length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-500">No payments recorded this month.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(monthSettlements ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between px-6 py-3 text-sm"
              >
                <div>
                  <div className="text-gray-900">
                    <strong>{memberName.get(s.from_member_id) ?? 'Member'}</strong> →{' '}
                    <strong>{memberName.get(s.to_member_id) ?? 'Member'}</strong>
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(s.settled_on)}
                    {s.note && ` · ${s.note}`}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="tabular-nums text-gray-900">
                    {formatMoney(Number(s.amount_cents))}
                  </span>
                  <DeleteSettlementButton id={s.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Net outstanding — trailing 12 months
        </h2>
        <div className="mt-3 text-gray-900">
          <Sparkline points={trend} fill ariaLabel="Monthly net outstanding" />
        </div>
      </section>
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color ?? 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  )
}
