'use client'

import { useActionState, useState } from 'react'
import { formatMoney } from '@/lib/format'
import { saveSplits, type SplitsState } from './actions'

type Category = { id: string; parent_id: string | null; name: string }

type SplitRow = {
  key: number
  category_id: string | null
  amount_cents: number
}

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
    (initialSplits.length > 0 ? initialSplits : [{ category_id: null, amount_cents: totalAmountCents }]).map(
      (s, i) => ({ key: i, category_id: s.category_id, amount_cents: s.amount_cents }),
    ),
  )
  const nextKey = () => Math.max(0, ...rows.map((r) => r.key)) + 1

  const currentSum = rows.reduce((s, r) => s + (r.amount_cents || 0), 0)
  const remaining = totalAmountCents - currentSum

  const parents = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)

  function updateRow(key: number, patch: Partial<SplitRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="transaction_id" value={transactionId} />

      <div className="flex items-baseline justify-between text-xs text-gray-500">
        <span>
          Transaction total{' '}
          <strong className="text-gray-900">{formatMoney(totalAmountCents)}</strong> · splits must
          sum to this.
        </span>
        <span className={remaining === 0 ? 'text-gray-500' : 'text-amber-700 dark:text-amber-300'}>
          Remaining: {formatMoney(remaining)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={r.key} className="grid items-center gap-2 sm:grid-cols-[1fr_140px_auto]">
            <select
              name={`split_category:${r.key}`}
              value={r.category_id ?? ''}
              onChange={(e) => updateRow(r.key, { category_id: e.target.value || null })}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">— uncategorized —</option>
              {parents.map((p) => {
                const kids = childrenOf(p.id)
                return (
                  <optgroup key={p.id} label={p.name}>
                    <option value={p.id}>{p.name}</option>
                    {kids.map((c) => (
                      <option key={c.id} value={c.id}>
                        &nbsp;&nbsp;↳ {c.name}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            <input
              name={`split_amount:${r.key}`}
              type="text"
              inputMode="decimal"
              value={r.amount_cents === 0 ? '' : (r.amount_cents / 100).toFixed(2)}
              placeholder="0.00"
              onChange={(e) => updateRow(r.key, { amount_cents: parseAmount(e.target.value) })}
              className="w-full rounded border border-gray-300 px-2 py-1 text-right text-sm tabular-nums"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                className="text-xs text-red-600 hover:text-red-800"
                aria-label={`Remove split ${i + 1}`}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [...prev, { key: nextKey(), category_id: null, amount_cents: 0 }])
          }
          className="text-sm font-medium text-gray-700 underline hover:text-gray-900"
        >
          + Add split
        </button>
        {remaining !== 0 && rows.length > 0 && (
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
            className="text-sm font-medium text-gray-700 underline hover:text-gray-900"
          >
            Apply {formatMoney(remaining)} to last split
          </button>
        )}
      </div>

      {state && 'error' in state && state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state && 'ok' in state && state.ok && (
        <p className="text-sm text-green-700 dark:text-green-400">Splits saved.</p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
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
