import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, monthLabel, monthStartISO, formatMoney, formatDate } from '@/lib/format'
import { AddTransactionForm } from './add-form'
import { TransactionRow } from './row'

type Txn = {
  id: string
  occurred_on: string
  amount_cents: number
  description: string | null
  account_id: string
  member_id: string | null
}

type Split = {
  transaction_id: string
  category_id: string | null
  amount_cents: number
  sort_order: number
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; account?: string; category?: string; member?: string }>
}) {
  const params = await searchParams
  const month = params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const nextMonth = addMonths(month, 1)

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [{ data: accounts }, { data: categories }, { data: members }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('categories')
      .select('id, parent_id, name, code')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('sort_order'),
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
  ])

  let q = supabase
    .from('transactions')
    .select('id, occurred_on, amount_cents, description, account_id, member_id')
    .eq('household_id', ctx.householdId)
    .gte('occurred_on', month)
    .lt('occurred_on', nextMonth)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (params.account) q = q.eq('account_id', params.account)
  if (params.member === 'shared') q = q.is('member_id', null)
  else if (params.member) q = q.eq('member_id', params.member)

  const { data: rows } = await q
  let transactions = (rows ?? []) as Txn[]

  // Fetch splits for the returned transactions.
  const txIds = transactions.map((t) => t.id)
  let splitsList: Split[] = []
  let sharedTxIds = new Set<string>()
  if (txIds.length > 0) {
    const [{ data: sp }, { data: sh }] = await Promise.all([
      supabase
        .from('transaction_splits')
        .select('transaction_id, category_id, amount_cents, sort_order')
        .in('transaction_id', txIds)
        .order('sort_order'),
      supabase.from('transaction_shares').select('transaction_id').in('transaction_id', txIds),
    ])
    splitsList = (sp ?? []) as Split[]
    sharedTxIds = new Set((sh ?? []).map((r) => r.transaction_id))
  }

  // Apply category filter at the transaction level: a transaction matches
  // if any split maps to the category.
  if (params.category) {
    const matched = new Set(
      splitsList.filter((s) => s.category_id === params.category).map((s) => s.transaction_id),
    )
    transactions = transactions.filter((t) => matched.has(t.id))
  }

  const splitsByTx = new Map<string, Split[]>()
  for (const s of splitsList) {
    if (!splitsByTx.has(s.transaction_id)) splitsByTx.set(s.transaction_id, [])
    splitsByTx.get(s.transaction_id)!.push(s)
  }

  const outflow = transactions
    .filter((t) => t.amount_cents > 0)
    .reduce((s, t) => s + t.amount_cents, 0)
  const inflow = transactions
    .filter((t) => t.amount_cents < 0)
    .reduce((s, t) => s - t.amount_cents, 0)
  const net = outflow - inflow

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const memberName = new Map((members ?? []).map((m) => [m.id, m.display_name]))

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Transactions</h1>
          <p className="mt-1 text-sm text-gray-500">{monthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/transactions/import"
            className="rounded border border-gray-300 px-3 py-1 font-medium text-gray-700 hover:bg-gray-50"
          >
            Import CSV
          </Link>
          <Link
            href={{ pathname: '/transactions', query: { ...params, month: addMonths(month, -1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            ← Previous
          </Link>
          <Link
            href={{ pathname: '/transactions', query: { ...params, month: monthStartISO() } }}
            className="text-gray-500 hover:text-gray-900"
          >
            This month
          </Link>
          <Link
            href={{ pathname: '/transactions', query: { ...params, month: addMonths(month, 1) } }}
            className="text-gray-500 hover:text-gray-900"
          >
            Next →
          </Link>
        </div>
      </header>

      {(accounts ?? []).length === 0 ? (
        <section className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          Add at least one account before logging transactions.{' '}
          <Link href="/accounts" className="font-medium text-gray-900 underline">
            Go to accounts
          </Link>
          .
        </section>
      ) : (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Add transaction
          </h2>
          <AddTransactionForm
            defaultDate={monthStartISO()}
            accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
            categories={(categories ?? []).map((c) => ({
              id: c.id,
              parent_id: c.parent_id,
              name: c.name,
            }))}
            members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))}
          />
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Tile label="Outflow" value={formatMoney(outflow)} color="text-red-700" />
        <Tile label="Inflow" value={formatMoney(inflow)} color="text-green-700" />
        <Tile label="Net (out − in)" value={formatMoney(net)} />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-6 py-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
        </h2>
        {transactions.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-500">No transactions this month.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {transactions.map((t) => {
              const splits = splitsByTx.get(t.id) ?? []
              const splitCategories = splits
                .map((s) => (s.category_id ? (categoryName.get(s.category_id) ?? '—') : 'Uncategorized'))
                .filter((s, i, arr) => arr.indexOf(s) === i)
              const categorySummary =
                splits.length <= 1
                  ? (splits[0]?.category_id
                      ? (categoryName.get(splits[0].category_id!) ?? '—')
                      : 'Uncategorized')
                  : `Split: ${splitCategories.join(' + ')}`
              const primaryCategoryId = splits[0]?.category_id ?? null
              return (
                <TransactionRow
                  key={t.id}
                  transaction={{
                    id: t.id,
                    occurred_on: t.occurred_on,
                    occurredLabel: formatDate(t.occurred_on),
                    amount_cents: t.amount_cents,
                    description: t.description,
                    account_id: t.account_id,
                    accountName: accountName.get(t.account_id) ?? '—',
                    primary_category_id: primaryCategoryId,
                    categorySummary,
                    isSplit: splits.length > 1,
                    isShared: sharedTxIds.has(t.id),
                    splits: splits.map((s) => ({
                      category_id: s.category_id,
                      amount_cents: s.amount_cents,
                    })),
                    member_id: t.member_id,
                    memberName: t.member_id ? (memberName.get(t.member_id) ?? null) : null,
                  }}
                  accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
                  categories={(categories ?? []).map((c) => ({
                    id: c.id,
                    parent_id: c.parent_id,
                    name: c.name,
                  }))}
                  members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))}
                />
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color ?? 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  )
}
