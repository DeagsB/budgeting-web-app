import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatDate, formatMoney, monthLabel, monthStartISO } from '@/lib/format'
import { computePairBalances, netUnorderedPairs } from '@/lib/settlement'
import { Sparkline, type SparklinePoint } from '@/components/sparkline'
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

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Settlements · {monthLabel(month)}
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
          Square up, gently.
        </h1>
      </header>

      <nav className="flex items-center gap-1 text-[13px]">
        <Link
          href={{ pathname: '/settlements', query: { month: addMonths(month, -1) } }}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          ← Previous
        </Link>
        <Link
          href={{ pathname: '/settlements', query: { month: monthStartISO() } }}
          className="inline-flex items-center rounded-full px-3 py-1.5 font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          This month
        </Link>
        <Link
          href={{ pathname: '/settlements', query: { month: addMonths(month, 1) } }}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          Next →
        </Link>
      </nav>

      <section className="grid gap-3 sm:grid-cols-3">
        <Tile label="Shared this month" value={formatMoney(totalOwed)} tone="ink" />
        <Tile label="Settled via transfer" value={formatMoney(totalSettled)} tone="leaf" />
        <Tile
          label="Still outstanding"
          value={formatMoney(totalNet)}
          tone={totalNet > 0 ? 'maple' : 'ink'}
        />
      </section>

      {/* Who owes whom */}
      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <MapleLabel>Who owes whom</MapleLabel>
        {netPairs.length === 0 ? (
          <p className="mt-3 rounded-[14px] bg-[var(--color-leaf-soft)] px-4 py-3 text-[13.5px] leading-relaxed text-[var(--color-leaf)]">
            ✓ All settled for {monthLabel(month)}. Flag shared expenses on the{' '}
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
                className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--color-hair)] bg-[var(--color-cream-2)]/60 px-4 py-3 text-[14px]"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={memberName.get(p.from_member_id) ?? 'Member'} tone="maple" />
                  <svg width="18" height="12" viewBox="0 0 24 16" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M2 8h18M14 2l6 6-6 6" />
                  </svg>
                  <Avatar name={memberName.get(p.to_member_id) ?? 'Member'} tone="leaf" />
                  <span className="text-[13.5px] text-[var(--color-ink-2)]">
                    <strong className="text-[var(--color-ink)]">
                      {memberName.get(p.from_member_id) ?? 'Member'}
                    </strong>{' '}
                    owes{' '}
                    <strong className="text-[var(--color-ink)]">
                      {memberName.get(p.to_member_id) ?? 'Member'}
                    </strong>
                  </span>
                </div>
                <span
                  className="shrink-0 font-serif text-[17px] tabular-nums tracking-[-0.01em]"
                  style={{ color: 'var(--color-maple)' }}
                >
                  {formatMoney(p.net_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Record payment */}
      {memberRows.length >= 2 && (
        <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
          <MapleLabel>Record payment</MapleLabel>
          <p className="mt-1 text-[13px] text-[var(--color-ink-2)]">
            Log an e-transfer or other reimbursement between household members. It doesn&rsquo;t touch
            budgets or P&amp;L.
          </p>
          <RecordSettlementForm
            members={memberRows.map((m) => ({ id: m.id, name: m.display_name }))}
            defaultDate={new Date().toISOString().slice(0, 10)}
            suggestion={netPairs[0] ?? null}
          />
        </section>
      )}

      {/* Payments history */}
      <section className="overflow-hidden rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)]">
        <header className="border-b border-[var(--color-hair)] px-5 py-3.5">
          <MapleLabel>Payments in {monthLabel(month)}</MapleLabel>
        </header>
        {(monthSettlements ?? []).length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-[var(--color-ink-2)]">
            No payments recorded this month.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-hair)]">
            {(monthSettlements ?? []).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5 text-[14px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[var(--color-ink)]">
                    <strong>{memberName.get(s.from_member_id) ?? 'Member'}</strong>{' '}
                    <span className="text-[var(--color-ink-3)]">→</span>{' '}
                    <strong>{memberName.get(s.to_member_id) ?? 'Member'}</strong>
                  </div>
                  <div className="mt-0.5 text-[12px] text-[var(--color-ink-3)]">
                    {formatDate(s.settled_on)}
                    {s.note && ` · ${s.note}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="font-serif text-[16px] tabular-nums tracking-[-0.01em]"
                    style={{ color: 'var(--color-leaf)' }}
                  >
                    {formatMoney(Number(s.amount_cents))}
                  </span>
                  <DeleteSettlementButton id={s.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Trend */}
      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <MapleLabel>Net outstanding — trailing 12 months</MapleLabel>
        <div className="mt-3 text-[var(--color-ink)]">
          <Sparkline points={trend} fill ariaLabel="Monthly net outstanding" />
        </div>
      </section>
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'ink' | 'leaf' | 'maple'
}) {
  const color =
    tone === 'leaf' ? 'var(--color-leaf)' : tone === 'maple' ? 'var(--color-maple)' : 'var(--color-ink)'
  return (
    <div className="rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 md:p-5">
      <MapleLabel>{label}</MapleLabel>
      <div
        className="mt-1.5 font-serif text-[22px] leading-tight tracking-[-0.02em] tabular-nums md:text-[24px]"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  )
}

function Avatar({ name, tone }: { name: string; tone: 'leaf' | 'maple' }) {
  const initial = (name.trim()[0] ?? '·').toUpperCase()
  const bg = tone === 'leaf' ? 'var(--color-leaf-soft)' : 'var(--color-maple-soft)'
  const fg = tone === 'leaf' ? 'var(--color-leaf)' : 'var(--color-maple)'
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-serif text-[13px]"
      style={{ background: bg, color: fg }}
      aria-hidden
    >
      {initial}
    </span>
  )
}
