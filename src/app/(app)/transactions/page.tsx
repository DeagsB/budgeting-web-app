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
import { TransactionListProvider } from './list-context'
import { SyncNowButton } from './sync-button'
import { TxControls } from './tx-controls'
import { UncategorizedReview, type TriageTxn } from './uncategorized-review'
import { UncategorizedCountProvider, UncategorizedCountLine } from './uncategorized-count'
import { isUncategorizedSplitSet } from '@/lib/tx-uncategorized'
import { classifyTx, isTxEditable, parseScope } from '@/lib/tx-scope'
import { loadTransfers } from '@/lib/transfer-legs'
import { transferMeta } from '@/lib/transfer-label'

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

/** Minimal shape used only to compute the household-wide uncategorized counts. */
type TxLite = {
  id: string
  occurred_on: string
  account_id: string
  member_id: string | null
  transaction_splits: { category_id: string | null }[] | null
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; account?: string; category?: string; scope?: string; q?: string; limit?: string }>
}) {
  const params = await searchParams
  const month = params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const nextMonth = addMonths(month, 1)
  const search = (params.q ?? '').trim()
  const scope = parseScope(params.scope)
  // "Uncategorized" is a view mode, not a mine/shared/with-me scope, so it
  // isn't part of TX_SCOPES / parseScope (owned outside this feature) - it's
  // handled entirely in this file instead.
  const isUncategorizedScope = params.scope === 'uncategorized'
  // Rows fetched per view. 200 covers a busy month; "Show more" doubles it
  // via the URL so the server render stays the single source of truth.
  const DEFAULT_LIMIT = 200
  const limit = Math.min(5000, Math.max(25, Number(params.limit) || DEFAULT_LIMIT))

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [
    { data: accounts },
    { data: categories },
    { data: members },
    { data: household },
    { data: recentSplits },
    { data: allTxLite },
    { count: plaidItemCount },
    transfers,
  ] = await Promise.all([
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
    // Household-wide, every month - just enough columns to count the pile
    // (see isUncategorizedSplitSet below) and, for the `?scope=uncategorized`
    // view, to know which ids to fetch in full.
    supabase
      .from('transactions')
      .select('id, occurred_on, account_id, member_id, transaction_splits(category_id)')
      .eq('household_id', ctx.householdId),
    // Does this household have a bank linked via Plaid at all? Drives which
    // "set up sync" destination SyncNowButton points to (task 5).
    supabase
      .from('plaid_items')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', ctx.householdId)
      .neq('status', 'removed'),
    // Transfer pairs between the household's own accounts. A leg is neither
    // spending nor income, so it stays out of the pile and the tiles and
    // reads as "Card payment to Visa" instead of a category.
    loadTransfers(supabase, ctx.householdId),
  ])
  const hasSyncUrl = !!household?.gmail_sync_url
  const hasPlaidItem = (plaidItemCount ?? 0) > 0
  const transferLegIds = transfers.legIds
  const transferByTx = transfers.byTx

  const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name]))
  const accountType = new Map((accounts ?? []).map((a) => [a.id, a.type as string]))
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const memberName = new Map((members ?? []).map((m) => [m.id, m.display_name]))

  // Mirror of the `tx_editable` RLS helper: a row is writable when its account
  // is visible to this login (the accounts query is itself RLS-filtered: own
  // and joint accounts) or the signed-in member paid it. Share-only rows
  // (visible because we owe part of them) are read-only; hide the write
  // affordances instead of letting the server action bounce.
  const canEditRow = (accountId: string, memberId: string | null) =>
    isTxEditable({ accountVisible: accountName.has(accountId), payerId: memberId, myMemberId: ctx.memberId })

  // ── Household-wide uncategorized pile (task 3): every month, not just the
  // one in view, so the count in front of the user is honest about the whole
  // backlog. A transaction is uncategorized when it has at most one split and
  // that split's category is null - reused from `@/lib/tx-uncategorized` so
  // this can never drift from the per-row check below. A title is never
  // required to clear the queue. A transfer leg counts as sorted without a
  // category being written: the pair is what explains it.
  const allUncategorizedIds = new Set<string>()
  let uncategorizedThisMonth = 0
  let uncategorizedEarlier = 0
  for (const t of (allTxLite ?? []) as unknown as TxLite[]) {
    if (transferLegIds.has(t.id)) continue
    if (!canEditRow(t.account_id, t.member_id)) continue
    if (!isUncategorizedSplitSet(t.transaction_splits ?? [])) continue
    allUncategorizedIds.add(t.id)
    if (t.occurred_on >= month && t.occurred_on < nextMonth) uncategorizedThisMonth++
    else uncategorizedEarlier++
  }

  // ── Main list query ──
  // Normally this month only; for `?scope=uncategorized` it's every
  // uncategorized+editable id from every month, fetched in full so the view
  // can render normally (day-grouped, newest first) alongside the rest of
  // the page.
  const baseTxQuery = () => {
    let q = supabase
      .from('transactions')
      .select('id, occurred_on, amount_cents, description, account_id, member_id')
      .eq('household_id', ctx.householdId)
    if (params.account) q = q.eq('account_id', params.account)
    if (search) q = q.ilike('description', `%${search}%`)
    return q
  }

  let transactions: Txn[] = []
  if (isUncategorizedScope) {
    const ids = Array.from(allUncategorizedIds)
    if (ids.length > 0) {
      const { data: rows } = await baseTxQuery()
        .in('id', ids)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit + 1)
      transactions = (rows ?? []) as Txn[]
    }
  } else {
    const { data: rows } = await baseTxQuery()
      .gte('occurred_on', month)
      .lt('occurred_on', nextMonth)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit + 1)
    transactions = (rows ?? []) as Txn[]
  }
  // limit+1 probes for more without a count query; the extra row is dropped.
  const hasMore = transactions.length > limit
  if (hasMore) transactions = transactions.slice(0, limit)

  const txIds = transactions.map((t) => t.id)
  // The other leg of every listed transfer leg, so the label can name the
  // counterpart account. Fetched through RLS on purpose: a leg on another
  // member's private account comes back missing and the row just says
  // "Transfer" rather than leaking where the money went.
  const counterpartIds = transactions
    .map((t) => transferByTx.get(t.id)?.counterpartTxId)
    .filter((id): id is string => !!id)
  let splitsList: Split[] = []
  const shareCountByTx = new Map<string, number>()
  const ruleSharedTxIds = new Set<string>()
  const counterpartAccountByTx = new Map<string, string>()
  if (txIds.length > 0) {
    const [{ data: sp }, { data: sh }, { data: cp }] = await Promise.all([
      supabase
        .from('transaction_splits')
        .select('transaction_id, category_id, amount_cents, sort_order')
        .in('transaction_id', txIds)
        .order('sort_order'),
      supabase.from('transaction_shares').select('transaction_id, rule_id').in('transaction_id', txIds),
      counterpartIds.length > 0
        ? supabase.from('transactions').select('id, account_id').in('id', counterpartIds).eq('household_id', ctx.householdId)
        : Promise.resolve({ data: [] as { id: string; account_id: string }[] }),
    ])
    splitsList = (sp ?? []) as Split[]
    for (const r of sh ?? []) {
      shareCountByTx.set(r.transaction_id, (shareCountByTx.get(r.transaction_id) ?? 0) + 1)
      if (r.rule_id) ruleSharedTxIds.add(r.transaction_id)
    }
    for (const r of (cp ?? []) as { id: string; account_id: string }[]) {
      counterpartAccountByTx.set(r.id, r.account_id)
    }
  }

  // How a transfer leg reads on its row, or null for an ordinary row. The
  // kind keys on where the money landed (the in leg's account), which is this
  // row for an inflow and the counterpart for an outflow. Archived accounts
  // are not in `accountName`, so a leg against one reads as a bare "Transfer".
  const transferFor = (t: Txn) => {
    const leg = transferByTx.get(t.id)
    if (!leg) return null
    const counterpartAccountId = counterpartAccountByTx.get(leg.counterpartTxId) ?? null
    const inAccountId = leg.side === 'in' ? t.account_id : counterpartAccountId
    const meta = transferMeta({
      side: leg.side,
      counterpartName: counterpartAccountId ? (accountName.get(counterpartAccountId) ?? null) : null,
      inAccountType: inAccountId ? (accountType.get(inAccountId) ?? null) : null,
    })
    return { transferId: leg.transferId, label: meta.label, kind: meta.kind }
  }

  const canEdit = (t: Txn) => canEditRow(t.account_id, t.member_id)
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

  // Which of the currently-displayed rows are uncategorized. In the default
  // view this is a subset of `transactions` (used to hoist a "To categorize"
  // section, below); in `?scope=uncategorized` it's all of them, since that's
  // exactly what was fetched.
  const uncategorizedIds = new Set<string>()
  for (const t of transactions) {
    if (transferLegIds.has(t.id)) continue
    if (!canEdit(t)) continue
    if (isUncategorizedSplitSet(splitsByTx.get(t.id) ?? [])) uncategorizedIds.add(t.id)
  }

  // Totals computed from the *filtered* set (account + search applied in the
  // query, category + scope applied above) so the summary always matches the
  // visible list. Sign convention: positive cents = outflow, negative = inflow.
  // Transfer legs are money moved, not spent or earned, so they stay out of
  // all three tiles; the per-day total below keeps them, since it is the
  // day's cashflow rather than its spending.
  const flowTxs = transactions.filter((t) => !transferLegIds.has(t.id))
  const outflow = flowTxs.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0)
  const inflow = flowTxs.filter((t) => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0)
  const net = inflow - outflow

  // "To categorize" - this month's uncategorized rows, hoisted to the top of
  // the list with their day shown inline (row.tsx's `dayLabel`) instead of a
  // day header of their own. Not used in `?scope=uncategorized`, where every
  // row is already uncategorized and day-grouping alone already reads as
  // "every month, newest first".
  const toCategorizeTxs = isUncategorizedScope ? [] : transactions.filter((t) => uncategorizedIds.has(t.id))
  const restTxs = isUncategorizedScope ? transactions : transactions.filter((t) => !uncategorizedIds.has(t.id))

  // Group the "rest" by day for section-style rendering.
  const byDay = new Map<string, Txn[]>()
  for (const t of restTxs) {
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

  // Row VMs for the secondary "Review one by one" sheet - whatever's
  // currently uncategorized and visible (this month's hoisted set normally,
  // or the whole list in `?scope=uncategorized`).
  const uncategorizedSourceTxs = isUncategorizedScope ? transactions : toCategorizeTxs
  const uncategorizedVMs: TriageTxn[] = uncategorizedSourceTxs.map((t) => {
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

  const uncategorizedHref = (() => {
    const qs = new URLSearchParams()
    qs.set('scope', 'uncategorized')
    if (params.account) qs.set('account', params.account)
    return `/transactions?${qs.toString()}`
  })()

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

  // One row renderer shared by the hoisted "To categorize" section and the
  // day-grouped list below it, so the two never build the row VM differently.
  const renderRow = (t: Txn, dayLabel?: string) => {
    const splits = splitsByTx.get(t.id) ?? []
    const splitCategories = splits
      .map((s) => (s.category_id ? (categoryName.get(s.category_id) ?? '-') : 'Uncategorized'))
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
          transfer: transferFor(t),
        }}
        isUncategorized={uncategorizedIds.has(t.id)}
        dayLabel={dayLabel}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-10 md:gap-6">
      {/* Desktop-only: the shell's top bar carries the title on mobile, and
          MonthNav below already shows the month; sync + import move into the
          "..." overflow next to the search box. */}
      <PageHeader
        eyebrow="Transactions"
        title="Transactions"
        subtitle={isUncategorizedScope ? 'To categorize - every month' : monthLabel(month)}
        className="max-md:hidden"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SyncNowButton hasSyncUrl={hasSyncUrl} hasPlaidItem={hasPlaidItem} />
            {importLink}
          </div>
        }
      />

      {/* Month nav - link-based; "This month" pill only shows off the current
          month. Swapped for a plain "back" link while viewing the household-
          wide uncategorized pile, since that view ignores the month bound. */}
      {isUncategorizedScope ? (
        <div className="-ml-2 flex items-center gap-2">
          <Link
            href={monthHref(month)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
          >
            ← Back to {monthLabel(month)}
          </Link>
          <span className="text-[12px] text-ink-3">Every month, newest first</span>
        </div>
      ) : (
        <MonthNav monthISO={month} makeHref={monthHref} className="-ml-2" />
      )}

      {/* Owns the client-side "still uncategorized" count so it can keep pace
          with in-place chip taps without a server round trip - see
          uncategorized-count.tsx. Wraps the rest of the page unconditionally
          (harmless when there's nothing to count) so every row underneath can
          reach it. Keyed by month so switching months resets the baseline
          instead of carrying stale local state across it. */}
      <UncategorizedCountProvider
        key={month}
        month={month}
        initialThisMonth={uncategorizedThisMonth}
        earlier={uncategorizedEarlier}
        earlierHref={uncategorizedHref}
        countedIds={Array.from(allUncategorizedIds)}
      >
      <TransactionListProvider
        accounts={accountOptions}
        categories={categoryOptions}
        memberWeights={memberWeights}
        topCategoryIds={topCategoryIds}
      >
        {/* Household-wide "to categorize" count + secondary one-by-one review
            - hidden on the uncategorized-scope view itself, since its own
            list header already says how many are shown. */}
        {!isUncategorizedScope && (uncategorizedThisMonth > 0 || uncategorizedEarlier > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg border border-butter bg-butter/40 px-4 py-3">
            <UncategorizedCountLine />
            <UncategorizedReview
              transactions={uncategorizedVMs}
              categories={categoryOptions}
              topCategoryIds={topCategoryIds}
            />
          </div>
        )}

        {/* Stats - reflect the active filter set. Compact three-up on mobile
            (whole dollars so three fit a 375px screen), full tiles on md+.
            Net = inflow - outflow; every tile carries an explicit sign so
            direction never depends on tint alone. */}
        <section className="grid grid-cols-3 gap-2 md:hidden">
          <StatTile compact label="Outflow" value={<SignedStatAmount cents={-outflow} tone="maple" compact />} tone="maple" />
          <StatTile compact label="Inflow" value={<SignedStatAmount cents={inflow} tone="leaf" compact />} tone="leaf" />
          <StatTile
            compact
            label="Net"
            value={<SignedStatAmount cents={net} tone={net >= 0 ? 'leaf' : 'maple'} compact />}
            tone={net >= 0 ? 'leaf' : 'maple'}
          />
        </section>
        <section className="hidden grid-cols-3 gap-3 md:grid">
          <StatTile label="Outflow" value={<SignedStatAmount cents={-outflow} tone="maple" />} tone="maple" />
          <StatTile label="Inflow" value={<SignedStatAmount cents={inflow} tone="leaf" />} tone="leaf" />
          <StatTile
            label="Net"
            value={<SignedStatAmount cents={net} tone={net >= 0 ? 'leaf' : 'maple'} />}
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
                  <SyncNowButton hasSyncUrl={hasSyncUrl} hasPlaidItem={hasPlaidItem} />
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
              {isUncategorizedScope
                ? `${transactions.length} to categorize`
                : `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`}
            </MapleLabel>
            {transactions.length > 0 && (
              <span className="text-[11px] text-ink-3">Newest first</span>
            )}
          </header>
          {transactions.length === 0 ? (
            <p className="px-5 py-16 text-center text-[14px] text-ink-2">
              {isUncategorizedScope ? 'Nothing to categorize.' : `No transactions in ${monthLabel(month)}.`}
              {(isUncategorizedScope || hasFilter) && (
                <>
                  {' '}
                  <Link href={{ pathname: '/transactions', query: clearQuery }} className="font-semibold text-leaf underline">
                    {isUncategorizedScope ? 'Back to transactions' : 'Clear filters'}
                  </Link>
                </>
              )}
            </p>
          ) : (
            <div>
              {/* "To categorize" - this month's uncategorized rows, pulled to
                  the top with their day shown inline on each row instead of a
                  day header of their own (task 3 of the mobile audit). */}
              {toCategorizeTxs.length > 0 && (
                <div>
                  <div className="bg-butter/40 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                    To categorize
                  </div>
                  <ul className="divide-y divide-hair">
                    {toCategorizeTxs.map((t) => renderRow(t, formatDate(t.occurred_on)))}
                  </ul>
                </div>
              )}
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
                    <ul className="divide-y divide-hair">{dayTxs.map((t) => renderRow(t))}</ul>
                  </div>
                )
              })}
            </div>
          )}
          {hasMore && (
            <Link
              href={{
                pathname: '/transactions',
                query: {
                  ...(params.month ? { month: params.month } : {}),
                  ...(params.account ? { account: params.account } : {}),
                  ...(params.q ? { q: params.q } : {}),
                  ...(params.scope ? { scope: params.scope } : {}),
                  limit: String(limit * 2),
                },
              }}
              className="flex min-h-[48px] items-center justify-center border-t border-hair text-[13px] font-semibold text-leaf transition-colors hover:bg-cream-2"
            >
              Showing the latest {limit} - show more
            </Link>
          )}
        </section>
      </TransactionListProvider>
      </UncategorizedCountProvider>
    </div>
  )
}

/**
 * Outflow/Inflow/Net all follow one sign rule: outflow shows a leading minus,
 * inflow a leading plus, net whichever applies. `Amount`'s own `sign` prop is
 * ignored in `compact` mode (it always defers to `formatMoneyCompact`, which
 * only ever prefixes "-"), so the three stat tiles - compact on mobile to fit
 * 375px - prefix the sign themselves and hand `Amount` the magnitude.
 */
function SignedStatAmount({
  cents,
  tone,
  compact,
}: {
  cents: number
  tone: 'leaf' | 'maple'
  compact?: boolean
}) {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : ''
  return (
    <span className="inline-flex items-baseline">
      {sign && (
        <span aria-hidden className={tone === 'leaf' ? 'text-leaf' : 'text-maple'}>
          {sign}
        </span>
      )}
      <Amount cents={Math.abs(cents)} tone={tone} compact={compact} />
    </span>
  )
}
