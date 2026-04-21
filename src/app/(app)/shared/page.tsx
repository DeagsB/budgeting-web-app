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
type Share = {
  id: string
  transaction_id: string
  member_id: string
  amount_cents: number
}

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

  // Default account: the account with type credit_card if present, else the
  // first member-owned account that isn't the caller's, else the first.
  const selectedAccountId =
    params.account ??
    accountRows.find((a) => a.type === 'credit_card')?.id ??
    accountRows[0]?.id ??
    null

  if (!selectedAccountId || accountRows.length === 0 || memberRows.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Shared expenses</h1>
          <p className="mt-1 text-sm text-gray-500">Flag transactions as shared and settle up with household members.</p>
        </header>
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          {memberRows.length === 0
            ? 'Add at least two members to track shared expenses.'
            : 'Add at least one account first.'}
        </p>
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

  // Stats
  const flaggedCount = transactions.filter((t) => (sharesByTx.get(t.id)?.length ?? 0) > 0).length
  const totalShared = shares.reduce(
    (s, sh) => s + (transactions.find((t) => t.id === sh.transaction_id) ? sh.amount_cents : 0),
    0,
  )

  // Pair balances for just this account + month, to give the user a quick
  // "if these shares stand, you owe each other X" readout here too.
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Shared expenses</h1>
          <p className="mt-1 text-sm text-gray-500">
            {monthLabel(month)} · {selectedAccount.name}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={{ pathname: '/shared', query: { ...params, month: addMonths(month, -1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            ← Previous
          </Link>
          <Link
            href={{ pathname: '/shared', query: { ...params, month: monthStartISO() } }}
            className="text-gray-500 hover:text-gray-900"
          >
            This month
          </Link>
          <Link
            href={{ pathname: '/shared', query: { ...params, month: addMonths(month, 1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            Next →
          </Link>
        </div>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
          <input type="hidden" name="month" value={month} />
          <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
            <span className="text-gray-700">Source account</span>
            <select
              name="account"
              defaultValue={selectedAccountId}
              className="w-full rounded border border-gray-300 px-3 py-2"
            >
              {accountRows.map((a) => {
                const owner = a.member_id
                  ? (memberName.get(a.member_id) ?? 'Removed member')
                  : 'Shared'
                return (
                  <option key={a.id} value={a.id}>
                    {a.name} ({owner})
                  </option>
                )
              })}
            </select>
          </label>
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Switch
          </button>
        </form>

        <BulkActions accountId={selectedAccountId} month={month} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Tile label="Transactions this month" value={String(transactions.length)} />
        <Tile label="Flagged as shared" value={`${flaggedCount} / ${transactions.length}`} />
        <Tile label="Total shared" value={formatMoney(totalShared)} />
      </section>

      {netPairs.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Net balance from this month&apos;s shares
          </h2>
          <ul className="mt-2 flex flex-wrap gap-4 text-sm">
            {netPairs.map((p) => (
              <li key={`${p.from_member_id}:${p.to_member_id}`}>
                <strong className="text-gray-900">
                  {memberName.get(p.from_member_id) ?? 'Member'}
                </strong>{' '}
                owes{' '}
                <strong className="text-gray-900">
                  {memberName.get(p.to_member_id) ?? 'Member'}
                </strong>{' '}
                <span className="font-semibold text-red-700">{formatMoney(p.net_cents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            Record e-transfers on the{' '}
            <Link href="/settlements" className="font-medium text-gray-900 underline">
              Settlements
            </Link>{' '}
            page to net them out.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-6 py-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Transactions on {selectedAccount.name}
        </h2>
        {transactions.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-500">No transactions in {monthLabel(month)}.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}
