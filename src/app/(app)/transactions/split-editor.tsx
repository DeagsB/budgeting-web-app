'use client'

import { useActionState, useState } from 'react'
import { formatMoney } from '@/lib/format'
import { saveSplits, type SplitsState } from './actions'
import { CategorySelect } from './category-select'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'

type Category = { id: string; parent_id: string | null; name: string }

type SplitRow = {
  key: number
  category_id: string | null
  amount_cents: number
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
}: {
  transactionId: string
  totalAmountCents: number
  initialSplits: { category_id: string | null; amount_cents: number }[]
  categories: Category[]
}) {
  const [state, formAction, pending] = useActionState<SplitsState, FormData>(saveSplits, undefined)
  const [rows, setRows] = useState<SplitRow[]>(() =>
    (initialSplits.length > 0
      ? initialSplits
      : [{ category_id: null, amount_cents: totalAmountCents }]
    ).map((s, i) => ({ key: i, category_id: s.category_id, amount_cents: s.amount_cents })),
  )
  const [invalid, setInvalid] = useState<Record<number, boolean>>({})
  const hasInvalid = rows.some((r) => invalid[r.key])
  const nextKey = () => Math.max(0, ...rows.map((r) => r.key)) + 1

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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="transaction_id" value={transactionId} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Split editor
          </div>
          <div className="mt-0.5 font-serif text-[18px] leading-tight tracking-[-0.01em] text-ink">
            Total <span className="tabular-nums">{formatMoney(totalAmountCents)}</span>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
          style={{
            background: balanced ? 'var(--color-leaf-soft)' : 'var(--color-butter)',
            color: balanced ? 'var(--color-leaf)' : 'var(--color-ink)',
          }}
        >
          {balanced ? '✓ Balanced' : `Remaining ${formatMoney(remaining)}`}
        </span>
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
                  if (next !== null) updateRow(r.key, { amount_cents: next })
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
                aria-label={`Remove split ${i + 1}`}
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

      {/* Add / apply-remainder */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [...prev, { key: nextKey(), category_id: null, amount_cents: 0 }])
          }
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-hair bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-cream-2"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add split
        </button>
        {!balanced && rows.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setRows((prev) => {
                const copy = [...prev]
                const last = copy[copy.length - 1]
                copy[copy.length - 1] = { ...last, amount_cents: last.amount_cents + remaining }
                return copy
              })
            }
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-leaf hover:underline"
          >
            Apply {formatMoney(remaining)} to last split
          </button>
        )}
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

      <div>
        <Button type="submit" variant="primary" size="sm" disabled={pending || hasInvalid}>
          {pending ? 'Saving…' : 'Save splits'}
        </Button>
      </div>
    </form>
  )
}
