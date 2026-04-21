import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, monthLabel, monthStartISO, formatMoney, formatDate } from '@/lib/format'
import { MapleLabel } from '@/components/ui/label'
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

  const outflow = transactions.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0)
  const inflow = transactions.filter((t) => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0)
  const net = outflow - inflow

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const memberName = new Map((members ?? []).map((m) => [m.id, m.display_name]))

  // Group transactions by day for section-style rendering.
  const byDay = new Map<string, Txn[]>()
  for (const t of transactions) {
    const key = t.occurred_on
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(t)
  }

  const hasFilter = !!(params.account || params.category || params.member)
  const clearQuery: Record<string, string> = { month }

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Activity · {monthLabel(month)}
        </div>
        <div className="flex items-end justify-between gap-4">
          <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
            Every dollar, accounted for.
          </h1>
          <Link
            href="/transactions/import"
            className="hidden items-center gap-1.5 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-cream-2)] sm:inline-flex"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Import CSV
          </Link>
        </div>
      </header>

      {/* Month nav */}
      <nav className="flex items-center gap-1 text-[13px]">
        <Link
          href={{ pathname: '/transactions', query: { ...params, month: addMonths(month, -1) } }}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 font-medium text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
        >
          ← Previous
        </Link>
        <Link
          href={{ pathname: '/transactions', query: { ...params, month: monthStartISO() } }}
          className="inline-flex items-center rounded-full px-3 py-1.5 font-medium text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
        >
          This month
        </Link>
        <Link
          href={{ pathname: '/transactions', query: { ...params, month: addMonths(month, 1) } }}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 font-medium text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
        >
          Next →
        </Link>
      </nav>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        <StatTile label="Outflow" value={formatMoney(outflow)} tone="ink" />
        <StatTile label="Inflow" value={formatMoney(inflow)} tone="leaf" />
        <StatTile label="Net" value={formatMoney(net)} tone={net >= 0 ? 'leaf' : 'maple'} />
      </section>

      {/* Filters */}
      {(accounts ?? []).length > 0 && (
        <form method="get" className="rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <MapleLabel>Filters</MapleLabel>
            {hasFilter && (
              <Link
                href={{ pathname: '/transactions', query: clearQuery }}
                className="text-[12px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
              >
                Clear
              </Link>
            )}
          </div>
          <input type="hidden" name="month" value={month} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Selector label="Account" name="account" defaultValue={params.account}>
              <option value="">All accounts</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Selector>
            <Selector label="Category" name="category" defaultValue={params.category}>
              <option value="">All categories</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id ? `↳ ${c.name}` : c.name}
                </option>
              ))}
            </Selector>
            <Selector label="Member" name="member" defaultValue={params.member}>
              <option value="">Anyone</option>
              <option value="shared">Shared account</option>
              {(members ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </Selector>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98]"
            >
              Apply filters
            </button>
          </div>
        </form>
      )}

      {/* Add transaction */}
      {(accounts ?? []).length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-[20px] border border-dashed border-[var(--color-hair)] bg-[var(--color-paper-2)] p-8">
          <div>
            <h2 className="font-serif text-[22px] leading-tight tracking-[-0.01em] text-[var(--color-ink)]">
              Add an account first
            </h2>
            <p className="mt-2 max-w-[440px] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
              Transactions need to live somewhere. Create at least one account and you&rsquo;re ready to log spending.
            </p>
          </div>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2.5 text-[13px] font-semibold text-[var(--color-paper)]"
          >
            Go to accounts
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      ) : (
        <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
          <MapleLabel>Add transaction</MapleLabel>
          <AddTransactionForm
            defaultDate={monthStartISO()}
            accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
            categories={(categories ?? []).map((c) => ({ id: c.id, parent_id: c.parent_id, name: c.name }))}
            members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))}
          />
        </section>
      )}

      {/* Transactions list */}
      <section className="overflow-hidden rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)]">
        <header className="flex items-baseline justify-between border-b border-[var(--color-hair)] px-5 py-3.5">
          <MapleLabel>
            {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
          </MapleLabel>
          {transactions.length > 0 && (
            <span className="text-[11px] text-[var(--color-ink-3)]">
              Newest first
            </span>
          )}
        </header>
        {transactions.length === 0 ? (
          <p className="px-5 py-16 text-center text-[14px] text-[var(--color-ink-2)]">
            No transactions in {monthLabel(month)}.
            {hasFilter && (
              <>
                {' '}
                <Link href={{ pathname: '/transactions', query: clearQuery }} className="font-semibold text-[var(--color-leaf)] underline">
                  Clear filters
                </Link>
              </>
            )}
          </p>
        ) : (
          <div>
            {Array.from(byDay.entries()).map(([day, dayTxs]) => {
              const dayTotal = dayTxs.reduce((s, t) => s + t.amount_cents, 0)
              return (
                <div key={day}>
                  <div className="flex items-baseline justify-between bg-[var(--color-cream-2)]/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                    <span>{formatDate(day)}</span>
                    <span className="tabular-nums">
                      {dayTotal >= 0 ? '' : '+'}
                      {formatMoney(Math.abs(dayTotal))}
                    </span>
                  </div>
                  <ul className="divide-y divide-[var(--color-hair)]">
                    {dayTxs.map((t) => {
                      const splits = splitsByTx.get(t.id) ?? []
                      const splitCategories = splits
                        .map((s) =>
                          s.category_id ? (categoryName.get(s.category_id) ?? '—') : 'Uncategorized',
                        )
                        .filter((s, i, arr) => arr.indexOf(s) === i)
                      const categorySummary =
                        splits.length <= 1
                          ? splits[0]?.category_id
                            ? (categoryName.get(splits[0].category_id!) ?? '—')
                            : 'Uncategorized'
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
                            splits: splits.map((s) => ({ category_id: s.category_id, amount_cents: s.amount_cents })),
                            member_id: t.member_id,
                            memberName: t.member_id ? (memberName.get(t.member_id) ?? null) : null,
                          }}
                          accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
                          categories={(categories ?? []).map((c) => ({ id: c.id, parent_id: c.parent_id, name: c.name }))}
                          members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))}
                        />
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

// ───────── subcomponents ─────────

function StatTile({
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
        className="mt-1.5 font-serif text-[22px] leading-tight tracking-[-0.02em] tabular-nums md:text-[26px]"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  )
}

function Selector({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string
  name: string
  defaultValue?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      <select name={name} defaultValue={defaultValue ?? ''} className="maple-select">
        {children}
      </select>
    </label>
  )
}
