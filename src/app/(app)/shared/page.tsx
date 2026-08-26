import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, formatDate, monthLabel, monthStartISO } from '@/lib/format'
import { computePairBalances, netUnorderedPairs } from '@/lib/settlement'
import { PageHeader } from '@/components/ui/page-header'
import { MonthNav } from '@/components/ui/month-nav'
import { StatTile } from '@/components/ui/stat-tile'
import { EmptyState } from '@/components/ui/empty-state'
import { Card } from '@/components/ui/card'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { MapleLabel } from '@/components/ui/label'
import { SharedRow } from './row'
import { BulkActions } from './bulk-actions'
import { AccountSwitcher } from './account-switcher'

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

  const [{ data: accounts }, { data: members }, { data: categories }, { data: rules }] = await Promise.all([
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
    supabase
      .from('categories')
      .select('id, parent_id, name')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('sort_order'),
    supabase.from('transaction_rules').select('id, name').eq('household_id', ctx.householdId),
  ])

  const accountRows = (accounts ?? []) as Account[]
  const memberRows = (members ?? []) as (Member & { split_weight: number | null })[]
  const categoryRows = (categories ?? []).map((c) => ({ id: c.id as string, parent_id: (c.parent_id as string | null) ?? null, name: c.name as string }))
  const ruleName = new Map((rules ?? []).map((r) => [r.id as string, r.name as string]))
  const memberWeights = memberRows.map((m) => ({ id: m.id, name: m.display_name, weight: Number(m.split_weight ?? 1) }))

  const selectedAccountId =
    params.account ??
    accountRows.find((a) => a.type === 'credit_card')?.id ??
    accountRows[0]?.id ??
    null

  const memberName = new Map(memberRows.map((m) => [m.id, m.display_name]))

  function monthHref(iso: string) {
    const qs = new URLSearchParams()
    qs.set('month', iso)
    if (params.account) qs.set('account', params.account)
    return `/shared?${qs.toString()}`
  }

  if (!selectedAccountId || accountRows.length === 0 || memberRows.length === 0) {
    const noMembers = memberRows.length === 0
    return (
      <div className="flex flex-col gap-6 pb-10">
        <PageHeader
          eyebrow="Shared expenses"
          title="Split fairly. Settle quickly."
        />
        <EmptyState
          title={noMembers ? 'Add members to share expenses' : 'Add an account to get started'}
          body={
            noMembers
              ? 'Shared expenses require at least two members in your household. Add them in Setup.'
              : 'Once an account exists, transactions on it can be flagged as shared.'
          }
          action={
            <Link href={noMembers ? '/setup' : '/accounts'}>
              <Button variant="primary" size="md">
                {noMembers ? 'Go to Setup' : 'Add an account'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Button>
            </Link>
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
      .select('id, transaction_id, member_id, amount_cents, rule_id, transaction:transactions!inner(account_id, occurred_on)')
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
    rule_id: (s.rule_id as string | null) ?? null,
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

  const flaggedRatio = transactions.length === 0 ? 0 : flaggedCount / transactions.length

  const switcherAccounts = accountRows.map((a) => ({
    id: a.id,
    name: a.name,
    owner: a.member_id ? (memberName.get(a.member_id) ?? 'Removed member') : 'Shared',
  }))

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow="Shared expenses"
        title="Split fairly. Settle quickly."
        subtitle={`${selectedAccount.name} · ${monthLabel(month)}`}
      />

      {/* Net balance payoff — lifted above the control/stat chrome so the
          "who owes whom" answer is the first thing in view. */}
      {netPairs.length > 0 && (
        <Card padding="lg">
          <div className="flex items-baseline justify-between gap-3">
            <MapleLabel>Net balance from this month&rsquo;s shares</MapleLabel>
            <Link
              href="/settlements"
              className="inline-flex min-h-[44px] items-center text-[12px] font-semibold text-leaf hover:underline"
            >
              Settlements →
            </Link>
          </div>
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
                <span className="shrink-0 rounded-full bg-maple-soft px-2.5 py-1 text-[14px]">
                  <Amount cents={p.net_cents} tone="maple" />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Source account + bulk actions */}
      <Card padding="md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <AccountSwitcher
            accounts={switcherAccounts}
            selectedId={selectedAccountId}
            month={month}
          />
          <BulkActions accountId={selectedAccountId} month={month} />
        </div>
      </Card>

      {/* Stats */}
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
        <StatTile
          label="Total shared"
          value={<Amount cents={totalShared} />}
          foot="across this account"
        />
      </section>

      <MonthNav monthISO={month} makeHref={monthHref} />

      {/* Transactions list */}
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
          <p className="px-5 py-10 text-center text-[13.5px] text-ink-2">
            No transactions in {monthLabel(month)}.
          </p>
        ) : (
          <ul className="divide-y divide-hair">
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
                  memberWeights={memberWeights}
                  accounts={accountRows.map((a) => ({ id: a.id, name: a.name }))}
                  categories={categoryRows}
                  accountId={selectedAccountId}
                  ruleName={(() => {
                    const rid = txShares.find((s) => s.rule_id)?.rule_id
                    return rid ? (ruleName.get(rid) ?? 'a rule') : null
                  })()}
                  shares={txShares.map((s) => ({
                    member_id: s.member_id,
                    amount_cents: s.amount_cents,
                  }))}
                />
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
