'use client'

import { useMemo, useState, useTransition } from 'react'
import { applyTransactionAttributes } from './actions'
import { CategorySelect } from './category-select'
import { NewCategoryInline } from './new-category-inline'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'

type Category = { id: string; parent_id: string | null; name: string }
type Member = { id: string; name: string }

export type TriageTxn = {
  id: string
  occurredLabel: string
  amount_cents: number
  description: string | null
  accountName: string
  member_id: string | null
  // Current primary category (null = uncategorized). Pre-fills the card so a
  // row that only needs a *title* keeps its existing category on save.
  category_id: string | null
}

/**
 * "N transactions need a category" banner + a focused triage queue that steps
 * through every uncategorized transaction in the current month. Each card lets
 * the user set the category, owning member, and description in one save, and
 * optionally fan the category out to other transactions from the same merchant.
 */
export function UncategorizedReview({
  transactions,
  categories,
  members,
  topCategoryIds,
}: {
  transactions: TriageTxn[]
  categories: Category[]
  members: Member[]
  topCategoryIds: string[]
}) {
  const [open, setOpen] = useState(false)
  const count = transactions.length

  return (
    <>
      {/* Banner — hidden once nothing is left, but the Sheet stays mounted so an
          in-progress queue can finish on its success screen even after the last
          transaction's save revalidates this list down to zero. */}
      {count > 0 && (
        <>
          {/* Mobile: slim single-line pill. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-full border border-butter bg-butter/40 pl-4 pr-3 text-left transition-colors active:bg-butter/60 md:hidden"
          >
            <span aria-hidden className="shrink-0 text-ink">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
                <circle cx="7" cy="7" r="1.2" fill="currentColor" />
              </svg>
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
              {count} need{count === 1 ? 's' : ''} a category or title
            </span>
            <span className="shrink-0 text-[11.5px] font-semibold text-ink-2">Review</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-ink-3">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          {/* md+: full banner. */}
          <div className="hidden flex-row items-center justify-between gap-3 rounded-lg border border-butter bg-butter/40 px-4 py-3.5 md:flex">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-ink"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
                <circle cx="7" cy="7" r="1.2" fill="currentColor" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">
                {count} transaction{count === 1 ? '' : 's'} need{count === 1 ? 's' : ''} a category or title
              </p>
              <p className="text-[12.5px] text-ink-2">
                Review them one by one — set a title, category, owner, and more.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setOpen(true)}
            className="shrink-0"
          >
            Review
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Button>
          </div>
        </>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Categorize transactions">
        <TriageQueue
          transactions={transactions}
          categories={categories}
          members={members}
          topCategoryIds={topCategoryIds}
          onClose={() => setOpen(false)}
        />
      </Sheet>
    </>
  )
}

// ───────────────────────────────────────────────────────────────────────────

function normalize(desc: string | null): string {
  return (desc ?? '').trim().toLowerCase()
}

function TriageQueue({
  transactions: incoming,
  categories,
  members,
  topCategoryIds,
  onClose,
}: {
  transactions: TriageTxn[]
  categories: Category[]
  members: Member[]
  topCategoryIds: string[]
  onClose: () => void
}) {
  // Freeze the queue at mount. Saves call revalidatePath('/transactions'),
  // which would otherwise feed a shrinking `transactions` prop into this
  // component and reshuffle the in-progress walk. The snapshot is fine because
  // TriageQueue is unmounted whenever the Sheet closes, so each open re-reads
  // the latest list.
  const [transactions] = useState(incoming)
  const total = transactions.length
  const [pos, setPos] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  // Categories created inline during this session, kept so they stay selectable
  // on later cards in the same walk. Dedupe by id: creating a category
  // revalidates /transactions, which eventually feeds the new category back in
  // via the live `categories` prop — without this filter it would appear twice
  // (duplicate React key + doubled option).
  const [extraCategories, setExtraCategories] = useState<Category[]>([])
  const mergedCategories = useMemo(() => {
    const known = new Set(categories.map((c) => c.id))
    return [...categories, ...extraCategories.filter((c) => !known.has(c.id))]
  }, [categories, extraCategories])
  // Track which ids the user already handled in this session so the
  // "apply to similar" sibling lists don't re-offer transactions that have
  // since been categorized — and so a transaction cleared via a sibling is
  // skipped instead of shown again as its own card.
  const [handled, setHandled] = useState<Set<string>>(() => new Set())

  // First transaction at or after `pos` that hasn't already been handled.
  const currentIndex = useMemo(() => {
    let i = pos
    while (i < transactions.length && handled.has(transactions[i].id)) i++
    return i
  }, [pos, transactions, handled])
  const current = transactions[currentIndex]

  // Other still-unhandled transactions in this queue that share the current
  // merchant string — candidates for a single bulk categorize.
  const similar = useMemo(() => {
    if (!current) return []
    const key = normalize(current.description)
    if (!key) return []
    return transactions.filter(
      (t) => t.id !== current.id && !handled.has(t.id) && normalize(t.description) === key,
    )
  }, [current, transactions, handled])

  function advance(idsJustHandled: string[]) {
    setHandled((prev) => {
      const next = new Set(prev)
      for (const id of idsJustHandled) next.add(id)
      return next
    })
    setSavedCount((c) => c + idsJustHandled.length)
    setPos(currentIndex + 1)
  }

  function skip() {
    setPos(currentIndex + 1)
  }

  // ── Done state ──
  if (!current) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf-soft text-leaf"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div>
          <p className="font-serif text-[20px] tracking-[-0.01em] text-ink">All caught up</p>
          <p className="mt-1 text-[13px] text-ink-2">
            Sorted {savedCount} of {total} transaction{total === 1 ? '' : 's'}.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={onClose}>
          Done
        </Button>
      </div>
    )
  }

  const reviewedSoFar = Math.min(currentIndex, total)
  const progress = total === 0 ? 0 : Math.round((reviewedSoFar / total) * 100)

  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          <span>
            {reviewedSoFar + 1} of {total}
          </span>
          <span>{savedCount} categorized</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-paper-2">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Triage progress"
            className="h-full rounded-full bg-leaf transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <TriageCard
        key={current.id}
        txn={current}
        categories={mergedCategories}
        members={members}
        topCategoryIds={topCategoryIds}
        similar={similar}
        onSaved={advance}
        onSkip={skip}
        onCategoryCreated={(cat) => setExtraCategories((prev) => [...prev, cat])}
      />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────

function TriageCard({
  txn,
  categories,
  members,
  topCategoryIds,
  similar,
  onSaved,
  onSkip,
  onCategoryCreated,
}: {
  txn: TriageTxn
  categories: Category[]
  members: Member[]
  topCategoryIds: string[]
  similar: TriageTxn[]
  onSaved: (ids: string[]) => void
  onSkip: () => void
  onCategoryCreated: (cat: Category) => void
}) {
  const [pending, startTransition] = useTransition()
  const [categoryId, setCategoryId] = useState(txn.category_id ?? '')
  const [memberId, setMemberId] = useState(txn.member_id ?? '')
  const [description, setDescription] = useState(txn.description ?? '')
  // Only fan a category out to same-merchant siblings by default when THIS row
  // is itself uncategorized — otherwise the user is likely just fixing a title.
  const [applySimilar, setApplySimilar] = useState(!txn.category_id)
  const [error, setError] = useState<string | null>(null)

  const byId = new Map(categories.map((c) => [c.id, c]))
  const topCats = topCategoryIds.map((id) => byId.get(id)).filter(Boolean) as Category[]

  const isExpense = txn.amount_cents > 0
  const sign = isExpense ? '-' : '+'

  function save() {
    const ids = [txn.id, ...(applySimilar ? similar.map((s) => s.id) : [])]
    const fd = new FormData()
    fd.set('id', txn.id)
    fd.set('category_id', categoryId)
    fd.set('member_id', memberId)
    fd.set('description', description)
    if (applySimilar && similar.length > 0) {
      fd.set('similar_ids', similar.map((s) => s.id).join(','))
    }
    setError(null)
    startTransition(async () => {
      try {
        await applyTransactionAttributes(fd)
        onSaved(ids)
      } catch {
        setError('Couldn’t save. Check your connection and try again.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-hair bg-paper p-4">
      {/* Transaction header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{txn.description ?? '—'}</p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {txn.occurredLabel} · {txn.accountName}
          </p>
        </div>
        <div className="shrink-0 text-[18px] tracking-[-0.01em]">
          <span className={isExpense ? 'text-maple' : 'text-leaf'}>{sign}</span>
          <span className={`tabular-nums ${isExpense ? 'text-maple' : 'text-leaf'}`}>
            {formatMoney(Math.abs(txn.amount_cents))}
          </span>
        </div>
      </div>

      {/* Category */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Category</span>
        <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
          {topCats.map((c) => {
            const active = categoryId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(active ? '' : c.id)}
                aria-pressed={active}
                className={
                  'inline-flex min-h-[44px] items-center rounded-full border px-3 text-[12.5px] font-semibold transition-colors ' +
                  (active
                    ? 'border-leaf bg-leaf text-paper'
                    : 'border-hair bg-cream text-ink hover:border-leaf hover:bg-leaf-soft')
                }
              >
                {c.parent_id ? `↳ ${c.name}` : c.name}
              </button>
            )
          })}
          <NewCategoryInline
            categories={categories}
            variant="inline"
            onCreated={(id, name, parent_id) => {
              onCategoryCreated({ id, name, parent_id })
              setCategoryId(id)
            }}
          />
        </div>
        <CategorySelect
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          compact
        />
      </div>

      {/* Member */}
      {members.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Owner</span>
          <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
            <MemberChip active={memberId === ''} onClick={() => setMemberId('')}>
              Shared
            </MemberChip>
            {members.map((m) => (
              <MemberChip key={m.id} active={memberId === m.id} onClick={() => setMemberId(m.id)}>
                {m.name}
              </MemberChip>
            ))}
          </div>
        </div>
      )}

      {/* Title (the transaction description) */}
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
          Title
        </span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="e.g. Groceries, Rent, Coffee"
          className="maple-input sm"
        />
      </label>

      {/* Apply to similar */}
      {similar.length > 0 && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md bg-cream-2 px-3 py-2.5">
          <input
            type="checkbox"
            checked={applySimilar}
            onChange={(e) => setApplySimilar(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-leaf)]"
          />
          <span className="text-[12.5px] text-ink">
            Also apply this category to{' '}
            <strong className="font-semibold">
              {similar.length} other{similar.length === 1 ? '' : 's'}
            </strong>{' '}
            from “{txn.description}”
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-maple-soft px-3 py-2 text-[12.5px] font-medium text-maple">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={pending}
          onClick={save}
          className="flex-1"
        >
          {pending ? 'Saving…' : 'Save & next'}
        </Button>
        <Button type="button" variant="secondary" size="md" disabled={pending} onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  )
}

function MemberChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'inline-flex min-h-[44px] items-center rounded-full border px-3 text-[12.5px] font-semibold transition-colors ' +
        (active
          ? 'border-ink bg-ink text-paper'
          : 'border-hair bg-cream text-ink hover:border-ink-3')
      }
    >
      {children}
    </button>
  )
}
