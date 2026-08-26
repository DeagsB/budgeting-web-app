import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, monthLabel, monthStartISO, formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { Amount } from '@/components/ui/amount'
import { MonthNav } from '@/components/ui/month-nav'
import { EmptyState } from '@/components/ui/empty-state'
import { MapleLabel } from '@/components/ui/label'
import { TransactionRow } from './row'
import { SyncNowButton } from './sync-button'
import { TxControls } from './tx-controls'
import { UncategorizedReview, type TriageTxn } from './uncategorized-review'
import { looksCryptic } from '@/lib/title'
import { classifyTx, isTxEditable, parseScope } from '@/lib/tx-scope'

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
  searchParams: Promise<{ month?: string; account?: string; category?: string; scope?: string; q?: string }>
}) {
  const params = await searchParams
  const month = params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const nextMonth = addMonths(month, 1)
  const search = (params.q ?? '').trim()
  const scope = parseScope(params.scope)

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [{ data: accounts }, { data: categories }, { data: members }, { data: household }, { data: recentSplits }] =
    await Promise.all([
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
        .select('id, display_name, split_weight')
        .eq('household_id', ctx.householdId)
        .order('sort_order'),
      supabase
        .from('households')
        .select('gmail_sync_url')
        .eq('id', ctx.householdId)
        .single(),
      // Recent categorised splits → "most-used categories" for the quick-pick
      // chips on uncategorized rows and in the triage queue.
      supabase
        .from('transaction_splits')
        .select('category_id')
        .eq('household_id', ctx.householdId)
        .not('category_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(400),
    ])
  const hasSyncUrl = !!household?.gmail_sync_url

  let q = supabase
    .from('transactions')
    .select('id, occurred_on, amount_cents, description, account_id, member_id')
    .eq('household_id', ctx.householdId)
    .gte('occurred_on', month)
    .lt('occurred_on', nextMonth)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (params.account) q = q.eq('account_id', params.account)
  if (search) q = q.ilike('description', `%${search}%`)

  const { data: rows } = await q
  let transactions = (rows ?? []) as Txn[]

  const txIds = transactions.map((t) => t.id)
  let splitsList: Split[] = []
  const shareCountByTx = new Map<string, number>()
  const ruleSharedTxIds = new Set<string>()
  if (txIds.length > 0) {
    const [{ data: sp }, { data: sh }] = await Promise.all([
      supabase
        .from('transaction_splits')
        .select('transaction_id, category_id, amount_cents, sort_order')
        .in('transaction_id', txIds)
        .order('sort_order'),
      supabase.from('transaction_shares').select('transaction_id, rule_id').in('transaction_id', txIds),
    ])
    splitsList = (sp ?? []) as Split[]
    for (const r of sh ?? []) {
      shareCountByTx.set(r.transaction_id, (shareCountByTx.get(r.transaction_id) ?? 0) + 1)
      if (r.rule_id) ruleSharedTxIds.add(r.transaction_id)
    }
  }

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const memberName = new Map((members ?? []).map((m) => [m.id, m.display_name]))

  // Mirror of the `tx_editable` RLS helper: a row is writable when its account
  // is visible to this login (the accounts query is itself RLS-filtered: own
  // and joint accounts) or the signed-in member paid it. Share-only rows
  // (visible because we owe part of them) are read-only; hide the write
  // affordances instead of letting the server action bounce.
  const canEdit = (t: Txn) =>
    isTxEditable({ accountVisible: accountName.has(t.account_id), payerId: t.member_id, myMemberId: ctx.memberId })
  const accountLabel = (t: Txn) => accountName.get(t.account_id) ?? 'Private account'
  const scopeOf = (t: Txn) => classifyTx({ editable: canEdit(t), shareCount: shareCountByTx.get(t.id) ?? 0 })

  if (params.category) {
    const matched = new Set(
      splitsList.filter((s) => s.category_id === params.category).map((s) => s.transaction_id),
    )
    transactions = transactions.filter((t) => matched.has(t.id))
  }
  if (scope) transactions = transactions.filter((t) => scopeOf(t) === scope)

  const splitsByTx = new Map<string, Split[]>()
  for (const s of splitsList) {
    if (!splitsByTx.has(s.transaction_id)) splitsByTx.set(s.transaction_id, [])
    splitsByTx.get(s.transaction_id)!.push(s)
  }

  // Totals computed from the *filtered* set (account + search applied in the
  // query, category + scope applied above) so the summary always matches the
  // visible list. Sign convention: positive cents = outflow, negative = inflow.
  const outflow = transactions.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0)
  const inflow = transactions.filter((t) => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0)
  const net = outflow - inflow

  // Group transactions by day for section-style rendering.
  const byDay = new Map<string, Txn[]>()
  for (const t of transactions) {
    const key = t.occurred_on
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(t)
  }

  const hasFilter = !!(params.account || params.category || scope || search)
  const clearQuery: Record<string, string> = { month }

  const accountOptions = (accounts ?? []).map((a) => ({ id: a.id, name: a.name }))
  const categoryOptions = (categories ?? []).map((c) => ({ id: c.id, parent_id: c.parent_id, name: c.name }))
  const memberWeights = (members ?? []).map((m) => ({ id: m.id, name: m.display_name, weight: Number(m.split_weight ?? 1) }))

  // Most-used categories (ranked by recent usage, padded with the first few
  // categories so a fresh household still shows quick-pick chips).
  const topCategoryIds = (() => {
    const tally = new Map<string, number>()
    for (const r of recentSplits ?? []) {
      if (r.category_id) tally.set(r.category_id, (tally.get(r.category_id) ?? 0) + 1)
    }
    const validIds = new Set(categoryOptions.map((c) => c.id))
    const ranked = [...tally.entries()]
      .filter(([id]) => validIds.has(id))
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
    for (const c of categoryOptions) {
      if (ranked.length >= 6) break
      if (!ranked.includes(c.id)) ranked.push(c.id)
    }
    return ranked.slice(0, 6)
  })()

  // A transaction is "uncategorized" when it has at most one split and that
  // split has no category. Multi-split transactions are always categorized.
  // It "needs a title" when its description is missing or still looks like a
  // raw bank descriptor. Either condition surfaces it in the triage queue.
  const uncategorizedIds = new Set<string>()
  const attentionIds = new Set<string>()
  for (const t of transactions) {
    if (!canEdit(t)) continue // triage actions write; read-only rows never queue
    const splits = splitsByTx.get(t.id) ?? []
    const isUncat = splits.length <= 1 && (splits[0]?.category_id ?? null) === null
    if (isUncat) uncategorizedIds.add(t.id)
    if (isUncat || looksCryptic(t.description)) attentionIds.add(t.id)
  }

  const attentionVMs: TriageTxn[] = transactions
    .filter((t) => attentionIds.has(t.id))
    .map((t) => {
      const splits = splitsByTx.get(t.id) ?? []
      return {
        id: t.id,
        occurredLabel: formatDate(t.occurred_on),
        amount_cents: t.amount_cents,
        description: t.description,
        accountName: accountLabel(t),
        category_id: splits[0]?.category_id ?? null,
      }
    })

  const monthHref = (iso: string) => {
    const qs = new URLSearchParams()
    qs.set('month', iso)
    if (params.account) qs.set('account', params.account)
    if (params.category) qs.set('category', params.category)
    if (scope) qs.set('scope', scope)
    if (search) qs.set('q', search)
    return `/transactions?${qs.toString()}`
  }

  const importLink = (
    <Link
      href="/transactions/import"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-hair bg-paper px-3.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-cream-2"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Import CSV
    </Link>
  )

  return (
    <div className="flex flex-col gap-5 pb-10 md:gap-6">
      {/* Desktop-only: the shell's top bar carries the title on mobile, and
          MonthNav below already shows the month; sync + import move into the
          "..." overflow next to the search box. */}
      <PageHeader
        eyebrow="Transactions"
        title="Transactions"
        subtitle={monthLabel(month)}
        className="max-md:hidden"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SyncNowButton hasSyncUrl={hasSyncUrl} />
            {importLink}
          </div>
        }
      />

      {/* Month nav - link-based; "This month" pill only shows off the current month. */}
      <MonthNav monthISO={month} makeHref={monthHref} className="-ml-2" />

      {/* Triage - slim pill (mobile) / banner (md+) + step-through queue for
          transactions that need a category and/or a real title. */}
      <UncategorizedReview
        transactions={attentionVMs}
        categories={categoryOptions}
        topCategoryIds={topCategoryIds}
      />

      {/* Stats - reflect the active filter set. Compact three-up on mobile
          (whole dollars so three fit a 375px screen), full tiles on md+. */}
      <section className="grid grid-cols-3 gap-2 md:hidden">
        <StatTile compact label="Outflow" value={<Amount cents={outflow} tone="maple" compact />} tone="maple" />
        <StatTile compact label="Inflow" value={<Amount cents={inflow} tone="leaf" compact />} tone="leaf" />
        <StatTile
          compact
          label="Net"
          value={<Amount cents={net} tone={net >= 0 ? 'leaf' : 'maple'} compact />}
          tone={net >= 0 ? 'leaf' : 'maple'}
        />
      </section>
      <section className="hidden grid-cols-3 gap-3 md:grid">
        <StatTile label="Outflow" value={<Amount cents={outflow} tone="maple" />} tone="maple" />
        <StatTile label="Inflow" value={<Amount cents={inflow} tone="leaf" />} tone="leaf" />
        <StatTile
          label="Net"
          value={<Amount cents={net} tone={net >= 0 ? 'leaf' : 'maple'} />}
          tone={net >= 0 ? 'leaf' : 'maple'}
        />
      </section>

      {/* Controls - search + chip filters + add (always visible). */}
      {accountOptions.length === 0 ? (
        <EmptyState
          title="Add an account first"
          body="Transactions need to live somewhere. Create at least one account and you’re ready to log spending."
          action={
            <Link
              href="/accounts"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-leaf px-4 text-[13px] font-semibold text-paper shadow-[var(--shadow-card)]"
            >
              Go to accounts
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          }
        />
      ) : (
        <TxControls
          month={month}
          search={search}
          accountId={params.account}
          categoryId={params.category}
          scope={scope ?? undefined}
          accounts={accountOptions}
          categories={categoryOptions}
          overflowActions={
            <>
              <div className="flex min-h-[44px] items-center">
                <SyncNowButton hasSyncUrl={hasSyncUrl} />
              </div>
              <div className="flex min-h-[44px] items-center">{importLink}</div>
            </>
          }
        />
      )}

      {/* Transactions list */}
      <section className="overflow-hidden rounded-lg border border-hair bg-paper">
        <header className="flex items-baseline justify-between border-b border-hair px-5 py-3.5">
          <MapleLabel>
            {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
          </MapleLabel>
          {transactions.length > 0 && (
            <span className="text-[11px] text-ink-3">Newest first</span>
          )}
        </header>
        {transactions.length === 0 ? (
          <p className="px-5 py-16 text-center text-[14px] text-ink-2">
            No transactions in {monthLabel(month)}.
            {hasFilter && (
              <>
                {' '}
                <Link href={{ pathname: '/transactions', query: clearQuery }} className="font-semibold text-leaf underline">
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
                  <div className="flex items-baseline justify-between bg-cream-2/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    <span>{formatDate(day)}</span>
                    <span className="tabular-nums">
                      {dayTotal >= 0 ? '-' : '+'}
                      <Amount cents={Math.abs(dayTotal)} className="text-[11px] font-semibold" />
                    </span>
                  </div>
                  <ul className="divide-y divide-hair">
                    {dayTxs.map((t) => {
                      const splits = splitsByTx.get(t.id) ?? []
                      const splitCategories = splits
                        .map((s) =>
                          s.category_id ? (categoryName.get(s.category_id) ?? '-') : 'Uncategorized',
                        )
                        .filter((s, i, arr) => arr.indexOf(s) === i)
                      const categorySummary =
                        splits.length <= 1
                          ? splits[0]?.category_id
                            ? (categoryName.get(splits[0].category_id!) ?? '-')
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
                            accountName: accountLabel(t),
                            canEdit: canEdit(t),
                            primary_category_id: primaryCategoryId,
                            categorySummary,
                            isSplit: splits.length > 1,
                            isShared: (shareCountByTx.get(t.id) ?? 0) > 0,
                            isRuleShared: ruleSharedTxIds.has(t.id),
                            splits: splits.map((s) => ({ category_id: s.category_id, amount_cents: s.amount_cents })),
                            member_id: t.member_id,
                            payerName: t.member_id ? (memberName.get(t.member_id) ?? null) : null,
                            isMine: t.member_id !== null && t.member_id === ctx.memberId,
                          }}
                          accounts={accountOptions}
                          categories={categoryOptions}
                          memberWeights={memberWeights}
                          isUncategorized={uncategorizedIds.has(t.id)}
                          topCategoryIds={topCategoryIds}
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
