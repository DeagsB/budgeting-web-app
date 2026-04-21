import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import {
  addMonths,
  formatDate,
  formatMoney,
  monthLabel,
  monthStartISO,
} from '@/lib/format'
import { computePairBalances, netUnorderedPairs } from '@/lib/settlement'
import { MapleLabel } from '@/components/ui/label'
import { SharedRow } from './row'
import { BulkActions } from './bulk-actions'

type Account = { id: string; name: string; type: string; member_id: string | null; ownership: string }
type Member = { id: string; display_name: string }
type Txn = {
  id: string
  occurred_on: string
  amount_cents: number
  description: string | null
  member_id: string | null
}
type Share = { id: string; transaction_id: string; member_id: string; amount_cents: number }

export default async function SharedPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; account?: string }>
}) {
  const params = await searchParams
  const month =
    params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const nextMonth = addMonths(month, 1)

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [{ data: accounts }, { data: members }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, member_id, ownership')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
  ])

  const accountRows = (accounts ?? []) as Account[]
  const memberRows = (members ?? []) as Member[]

  const selectedAccountId =
    params.account ??
    accountRows.find((a) => a.type === 'credit_card')?.id ??
    accountRows[0]?.id ??
    null

  if (!selectedAccountId || accountRows.length === 0 || memberRows.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader month={month} />
        <EmptyState
          title={
            memberRows.length === 0 ? 'Add members to share expenses' : 'Add an account to get started'
          }
          body={
            memberRows.length === 0
              ? 'Shared expenses require at least two members in your household.'
              : 'Once an account exists, transactions on it can be flagged as shared.'
          }
          cta={
            memberRows.length === 0
              ? { href: '/members', label: 'Manage members' }
              : { href: '/accounts', label: 'Add an account' }
          }
        />
      </div>
    )
  }

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
      .select('id, transaction_id, member_id, amount_cents, transaction:transactions!inner(account_id, occurred_on)')
      .eq('household_id', ctx.householdId)
      .eq('transaction.account_id', selectedAccountId)
      .gte('transaction.occurred_on', month)
      .lt('transaction.occurred_on', nextMonth),
  ])

  const transactions = (txRows ?? []) as Txn[]
  const shares = ((shareRows ?? []) as (Share & { transaction?: unknown })[]).map((s) => ({
    id: s.id,
    transaction_id: s.transaction_id,
    member_id: s.member_id,
    amount_cents: Number(s.amount_cents),
  }))

  const sharesByTx = new Map<string, Share[]>()
  for (const s of shares) {
    if (!sharesByTx.has(s.transaction_id)) sharesByTx.set(s.transaction_id, [])
    sharesByTx.get(s.transaction_id)!.push(s)
  }

  const selectedAccount = accountRows.find((a) => a.id === selectedAccountId)!

  const flaggedCount = transactions.filter((t) => (sharesByTx.get(t.id)?.length ?? 0) > 0).length
  const totalShared = shares.reduce(
    (s, sh) => s + (transactions.find((t) => t.id === sh.transaction_id) ? sh.amount_cents : 0),
    0,
  )

  const pairs = computePairBalances({
    transactions: transactions.map((t) => ({
      id: t.id,
      amount_cents: t.amount_cents,
      member_id: t.member_id,
    })),
    shares,
    settlements: [],
  })
  const netPairs = netUnorderedPairs(pairs)
  const memberName = new Map(memberRows.map((m) => [m.id, m.display_name]))

  const flaggedRatio = transactions.length === 0 ? 0 : flaggedCount / transactions.length

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader month={month} subtitle={`${selectedAccount.name} · ${monthLabel(month)}`} params={params} />

      {/* Month + account bar */}
      <div className="flex flex-col gap-3 rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 sm:flex-row sm:items-end sm:justify-between md:p-5">
        <form method="get" className="flex flex-col gap-1.5 sm:max-w-[320px]">
          <MapleLabel>Source account</MapleLabel>
          <input type="hidden" name="month" value={month} />
          <div className="flex gap-2">
            <select
              name="account"
              defaultValue={selectedAccountId}
              className="maple-select flex-1"
            >
              {accountRows.map((a) => {
                const owner = a.member_id
                  ? (memberName.get(a.member_id) ?? 'Removed member')
                  : 'Shared'
                return (
                  <option key={a.id} value={a.id}>
                    {a.name} — {owner}
                  </option>
                )
              })}
            </select>
            <button
              type="submit"
              className="rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-paper-2)] px-4 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-cream-2)]"
            >
              Switch
            </button>
          </div>
        </form>

        <BulkActions accountId={selectedAccountId} month={month} />
      </div>

      {/* Month navigation + stats */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatTile
          label="Transactions"
          value={String(transactions.length)}
          foot={`in ${monthLabel(month)}`}
        />
        <StatTile
          label="Flagged as shared"
          value={`${flaggedCount} / ${transactions.length || 0}`}
          progress={flaggedRatio}
        />
        <StatTile label="Total shared" value={formatMoney(totalShared)} foot="across this account" />
      </section>

      <MonthNav month={month} params={params} />

      {netPairs.length > 0 && (
        <section className="rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5">
          <div className="flex items-baseline justify-between">
            <MapleLabel>Net balance from this month&rsquo;s shares</MapleLabel>
            <Link
              href="/settlements"
              className="text-[12px] font-semibold text-[var(--color-leaf)] hover:underline"
            >
              Settlements →
            </Link>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {netPairs.map((p) => (
              <li
                key={`${p.from_member_id}:${p.to_member_id}`}
                className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--color-cream-2)] px-3 py-2.5 text-[13.5px]"
              >
                <span className="min-w-0 truncate">
                  <strong className="font-semibold text-[var(--color-ink)]">
                    {memberName.get(p.from_member_id) ?? 'Member'}
                  </strong>{' '}
                  <span className="text-[var(--color-ink-2)]">owes</span>{' '}
                  <strong className="font-semibold text-[var(--color-ink)]">
                    {memberName.get(p.to_member_id) ?? 'Member'}
                  </strong>
                </span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 font-serif text-[14px] tabular-nums"
                  style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
                >
                  {formatMoney(p.net_cents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Transactions list */}
      <section className="overflow-hidden rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)]">
        <header className="flex items-baseline justify-between border-b border-[var(--color-hair)] px-5 py-3.5">
          <MapleLabel>Transactions on {selectedAccount.name}</MapleLabel>
          {transactions.length > 0 && (
            <span className="text-[11px] text-[var(--color-ink-3)]">
              {flaggedCount}/{transactions.length} shared
            </span>
          )}
        </header>
        {transactions.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-[var(--color-ink-2)]">
            No transactions in {monthLabel(month)}.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-hair)]">
            {transactions.map((t) => {
              const txShares = sharesByTx.get(t.id) ?? []
              const payerId = t.member_id
              const payerName = payerId ? (memberName.get(payerId) ?? null) : null
              return (
                <SharedRow
                  key={t.id}
                  transaction={{
                    id: t.id,
                    occurredLabel: formatDate(t.occurred_on),
                    amount_cents: t.amount_cents,
                    description: t.description,
                    payer_id: payerId,
                    payerName,
                  }}
                  members={memberRows.map((m) => ({ id: m.id, name: m.display_name }))}
                  shares={txShares.map((s) => ({
                    member_id: s.member_id,
                    amount_cents: s.amount_cents,
                  }))}
                />
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

// ─── subcomponents ────────────────────────────────────────────────────────

function PageHeader({
  subtitle,
}: {
  month: string
  subtitle?: string
  params?: { month?: string; account?: string }
}) {
  return (
    <header className="flex flex-col gap-1">
      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        Shared expenses
      </div>
      <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
        Split fairly. Settle quickly.
      </h1>
      {subtitle && <p className="text-[14px] text-[var(--color-ink-2)]">{subtitle}</p>}
    </header>
  )
}

function MonthNav({
  month,
  params,
}: {
  month: string
  params: { month?: string; account?: string }
}) {
  return (
    <nav className="flex items-center gap-1 text-[13px]">
      <Link
        href={{ pathname: '/shared', query: { ...params, month: addMonths(month, -1) } }}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 font-medium text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
      >
        ← Previous
      </Link>
      <Link
        href={{ pathname: '/shared', query: { ...params, month: monthStartISO() } }}
        className="inline-flex items-center rounded-full px-3 py-1.5 font-medium text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
      >
        This month
      </Link>
      <Link
        href={{ pathname: '/shared', query: { ...params, month: addMonths(month, 1) } }}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 font-medium text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
      >
        Next →
      </Link>
    </nav>
  )
}

function StatTile({
  label,
  value,
  foot,
  progress,
}: {
  label: string
  value: string
  foot?: string
  progress?: number
}) {
  return (
    <div className="rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 md:p-5">
      <MapleLabel>{label}</MapleLabel>
      <div className="mt-1.5 font-serif text-[24px] leading-tight tracking-[-0.02em] tabular-nums text-[var(--color-ink)]">
        {value}
      </div>
      {progress !== undefined && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-paper-2)]">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--color-leaf)' }}
          />
        </div>
      )}
      {foot && !progress && (
        <div className="mt-1 text-[12px] text-[var(--color-ink-3)]">{foot}</div>
      )}
    </div>
  )
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string
  body: string
  cta: { href: string; label: string }
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-[20px] border border-dashed border-[var(--color-hair)] bg-[var(--color-paper-2)] p-8">
      <div>
        <h2 className="font-serif text-[22px] leading-tight tracking-[-0.01em] text-[var(--color-ink)]">
          {title}
        </h2>
        <p className="mt-2 max-w-[440px] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          {body}
        </p>
      </div>
      <Link
        href={cta.href}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2.5 text-[13px] font-semibold text-[var(--color-paper)]"
      >
        {cta.label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>
    </div>
  )
}
