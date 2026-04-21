'use client'

import { useActionState, useState } from 'react'
import { formatMoney } from '@/lib/format'
import { saveSplits, type SplitsState } from './actions'
import { CategorySelect } from './category-select'

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
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            Split editor
          </div>
          <div className="mt-0.5 font-serif text-[18px] leading-tight tracking-[-0.01em] text-[var(--color-ink)]">
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
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-paper)]">
        <div
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
            <div className="flex items-center rounded-[10px] border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 transition-colors focus-within:border-[var(--color-leaf)]">
              <span className="text-[12px] text-[var(--color-ink-3)]">$</span>
              <input
                name={`split_amount:${r.key}`}
                type="text"
                inputMode="decimal"
                value={r.amount_cents === 0 ? '' : (r.amount_cents / 100).toFixed(2)}
                placeholder="0.00"
                onChange={(e) => updateRow(r.key, { amount_cents: parseAmount(e.target.value) })}
                className="w-full bg-transparent text-right text-[13px] tabular-nums text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-3)]"
              />
            </div>
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                aria-label={`Remove split ${i + 1}`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-maple-soft)] hover:text-[var(--color-maple)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : (
              <div className="h-8 w-8" />
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
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-ink)] hover:bg-[var(--color-cream-2)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
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
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--color-leaf)] hover:underline"
          >
            Apply {formatMoney(remaining)} to last split
          </button>
        )}
      </div>

      {/* Feedback */}
      {state && 'error' in state && state.error && (
        <p
          className="rounded-[10px] px-3 py-2 text-[12.5px] font-medium"
          style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
        >
          {state.error}
        </p>
      )}
      {state && 'ok' in state && state.ok && (
        <p
          className="rounded-[10px] px-3 py-2 text-[12.5px] font-medium"
          style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
        >
          Splits saved.
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save splits'}
        </button>
      </div>
    </form>
  )
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}
