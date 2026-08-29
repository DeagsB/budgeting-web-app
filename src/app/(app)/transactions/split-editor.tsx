'use client'

import { useActionState, useEffect, useState } from 'react'
import { formatMoney } from '@/lib/format'
import { gstIncludedInTotal } from '@/lib/gst'
import { saveSplits, type SplitsState } from './actions'
import { CategorySelect } from './category-select'
import { NewCategoryInline } from './new-category-inline'
import { Button } from '@/components/ui/button'
import { SheetActions } from '@/components/ui/sheet'
import { MoneyInput } from '@/components/ui/money-input'

type Category = { id: string; parent_id: string | null; name: string }

type SplitRow = {
  key: number
  category_id: string | null
  amount_cents: number
}

/** Remembers the last-used GST/HST category so the "Split out GST" chip
 * doesn't ask again once the household has picked one. */
const GST_CATEGORY_KEY = 'maple.gstCategory.v1'
const GST_RATE_PERCENT = 5

/**
 * Rows the user just saved, keyed by transaction id. `saveSplits` revalidates
 * the page on success, and the fresh server data can briefly lag the write
 * (or a parent re-render can otherwise remount this component); either way
 * the user should keep seeing exactly what they just saved, not a flash back
 * to whatever `initialSplits` looked like before. A plain module map (rather
 * than component state) survives a remount within the same page session.
 */
const savedRowsCache = new Map<
  string,
  { category_id: string | null; amount_cents: number }[]
>()

function nextKeyFor(rows: SplitRow[]): number {
  return Math.max(0, ...rows.map((r) => r.key)) + 1
}

/**
 * Edit the per-category splits of a single transaction. Splits must sum to
 * the transaction total; a live progress bar + "Apply remainder" shortcut
 * help the user balance things out without running mental arithmetic.
 */
export function SplitEditor({
  transactionId,
  totalAmountCents,
  initialSplits,
  categories,
  inSheet = false,
}: {
  transactionId: string
  totalAmountCents: number
  initialSplits: { category_id: string | null; amount_cents: number }[]
  categories: Category[]
  /**
   * True when this editor is rendered inside a `<Sheet>` - the Save row then
   * uses `SheetActions` so it rides the sheet's own scroll container. False
   * (the default) renders an equivalent sticky bar local to the editor,
   * for the transaction row's inline "Splits" panel, which is not a Sheet.
   */
  inSheet?: boolean
}) {
  const [state, formAction, pending] = useActionState<SplitsState, FormData>(saveSplits, undefined)
  const [rows, setRows] = useState<SplitRow[]>(() => {
    const cached = savedRowsCache.get(transactionId)
    const source =
      cached ??
      (initialSplits.length > 0
        ? initialSplits
        : [{ category_id: null, amount_cents: totalAmountCents }])
    return source.map((s, i) => ({ key: i, category_id: s.category_id, amount_cents: s.amount_cents }))
  })
  const [invalid, setInvalid] = useState<Record<number, boolean>>({})
  const [lastEditedKey, setLastEditedKey] = useState<number | null>(null)
  const [gstCreateOpen, setGstCreateOpen] = useState(false)
  const hasInvalid = rows.some((r) => invalid[r.key])

  // A successful save is the user's own truth from here on - remember it so
  // a stale-prop remount (see `savedRowsCache` above) can't undo it.
  useEffect(() => {
    if (state && 'ok' in state && state.ok) {
      savedRowsCache.set(
        transactionId,
        rows.map((r) => ({ category_id: r.category_id, amount_cents: r.amount_cents })),
      )
    }
    // Only the *outcome* of a save should trigger this - not every edit to
    // `rows`, which would defeat its own purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, transactionId])

  const currentSum = rows.reduce((s, r) => s + (r.amount_cents || 0), 0)
  const remaining = totalAmountCents - currentSum
  const balanced = remaining === 0
  const progress =
    totalAmountCents === 0
      ? 0
      : Math.min(1, Math.abs(currentSum) / Math.abs(totalAmountCents))

  function updateRow(key: number, patch: Partial<SplitRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  // "Apply remainder" should nudge a *different* row than the one the user
  // is actively typing into - otherwise fixing the row you're already
  // editing feels like the button did nothing. With only one row there is no
  // other choice.
  function remainderTargetKey(): number | null {
    if (rows.length === 0) return null
    if (rows.length === 1) return rows[0].key
    const others = rows.filter((r) => r.key !== lastEditedKey)
    return (others.length > 0 ? others[others.length - 1] : rows[rows.length - 1]).key
  }

  /** Resolve the household's GST/HST category: the last one used, else the
   * first category whose name looks like a tax category, else none. */
  function resolveGstCategoryId(): string | null {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(GST_CATEGORY_KEY)
    } catch {
      /* private mode / storage disabled */
    }
    if (stored && categories.some((c) => c.id === stored)) return stored
    return categories.find((c) => /gst|hst|tax/i.test(c.name))?.id ?? null
  }

  function rememberGstCategoryId(categoryId: string) {
    try {
      localStorage.setItem(GST_CATEGORY_KEY, categoryId)
    } catch {
      /* private mode / storage disabled */
    }
  }

  /** Pulls the GST (already folded into the total) out of the first row into
   * its own row under `categoryId`. The sum of all rows is unchanged, so a
   * balanced editor stays balanced. */
  function applyGstSplit(categoryId: string) {
    setRows((prev) => {
      if (prev.length === 0) return prev
      const tax = gstIncludedInTotal(totalAmountCents, GST_RATE_PERCENT)
      const copy = [...prev]
      copy[0] = { ...copy[0], amount_cents: copy[0].amount_cents - tax }
      copy.push({ key: nextKeyFor(prev), category_id: categoryId, amount_cents: tax })
      return copy
    })
    rememberGstCategoryId(categoryId)
  }

  function onGstChipClick() {
    const categoryId = resolveGstCategoryId()
    if (categoryId) applyGstSplit(categoryId)
    else setGstCreateOpen(true)
  }

  const balancedBadge = (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
      style={{
        background: balanced ? 'var(--color-leaf-soft)' : 'var(--color-butter)',
        color: balanced ? 'var(--color-leaf)' : 'var(--color-ink)',
      }}
    >
      {balanced ? '✓ Balanced' : `Remaining ${formatMoney(remaining)}`}
    </span>
  )

  const saveRow = (
    <div className="flex items-center justify-between gap-3">
      {balancedBadge}
      <Button type="submit" variant="primary" size="sm" disabled={pending || hasInvalid}>
        {pending ? 'Saving…' : 'Save splits'}
      </Button>
    </div>
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="transaction_id" value={transactionId} />

      {/* Header */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
          Split editor
        </div>
        <div className="mt-0.5 font-serif text-[18px] leading-tight tracking-[-0.01em] text-ink">
          Total <span className="tabular-nums">{formatMoney(totalAmountCents)}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1.5 overflow-hidden rounded-full bg-paper">
        <div
          role="progressbar"
          aria-label="Splits allocated"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.round(progress * 100)}%`,
            background: balanced ? 'var(--color-leaf)' : 'var(--color-ink-2)',
          }}
        />
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div
            key={r.key}
            className="grid items-center gap-2 sm:grid-cols-[1fr_160px_auto]"
          >
            <CategorySelect
              name={`split_category:${r.key}`}
              categories={categories}
              value={r.category_id ?? ''}
              onChange={(v) => updateRow(r.key, { category_id: v || null })}
              compact
            />
            <div className="flex items-center rounded-md border border-hair bg-paper px-3 py-1.5 transition-colors focus-within:border-leaf">
              <span className="text-[12px] text-ink-3">$</span>
              <MoneyInput
                size="sm"
                cents={r.amount_cents}
                allowNegative
                aria-label={`Split ${i + 1} amount in dollars`}
                onCents={(next) => {
                  setInvalid((prev) => ({ ...prev, [r.key]: next === null }))
                  if (next !== null) {
                    updateRow(r.key, { amount_cents: next })
                    setLastEditedKey(r.key)
                  }
                }}
              />
              {/* Server parses dollars under `split_amount:<key>`; post the committed cents as dollars. */}
              <input
                type="hidden"
                name={`split_amount:${r.key}`}
                value={(r.amount_cents / 100).toFixed(2)}
              />
            </div>
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                aria-label="Remove split"
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-maple-soft hover:text-maple"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : (
              <div className="h-11 w-11" />
            )}
          </div>
        ))}
      </div>

      {/* Add / GST / apply-remainder */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [...prev, { key: nextKeyFor(prev), category_id: null, amount_cents: 0 }])
          }
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-hair bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cream-2"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add split
        </button>
        <button
          type="button"
          onClick={onGstChipClick}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-hair bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cream-2"
        >
          Split out GST (5%)
        </button>
        {!balanced && rows.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const targetKey = remainderTargetKey()
              if (targetKey === null) return
              setRows((prev) =>
                prev.map((r) => (r.key === targetKey ? { ...r, amount_cents: r.amount_cents + remaining } : r)),
              )
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-leaf hover:underline"
          >
            Apply {formatMoney(remaining)}
          </button>
        )}
        <NewCategoryInline
          categories={categories}
          defaultName="GST"
          variant="inline"
          showTrigger={false}
          open={gstCreateOpen}
          onOpenChange={setGstCreateOpen}
          onCreated={(id) => applyGstSplit(id)}
        />
      </div>

      {/* Feedback */}
      <div aria-live="polite">
        {hasInvalid && (
          <p className="rounded-md bg-maple-soft px-3 py-2 text-[12.5px] font-medium text-maple">
            Enter each split as a dollar amount, e.g. 12.50.
          </p>
        )}
        {state && 'error' in state && state.error && (
          <p className="rounded-md bg-maple-soft px-3 py-2 text-[12.5px] font-medium text-maple">
            {state.error}
          </p>
        )}
        {state && 'ok' in state && state.ok && (
          <p className="rounded-md bg-leaf-soft px-3 py-2 text-[12.5px] font-medium text-leaf">
            Splits saved.
          </p>
        )}
      </div>

      {inSheet ? (
        <SheetActions>{saveRow}</SheetActions>
      ) : (
        <div
          className="sticky bottom-0 z-10 -mx-5 mt-1 border-t border-hair bg-cream px-5 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)' }}
        >
          {saveRow}
        </div>
      )}
    </form>
  )
}
