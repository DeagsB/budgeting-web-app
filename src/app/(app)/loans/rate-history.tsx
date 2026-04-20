'use client'

import { useActionState } from 'react'
import { formatDate } from '@/lib/format'
import { addRateChange, deleteRateChange, type RateChangeState } from './actions'

type RateChange = {
  id: string
  account_id: string
  effective_month: string
  annual_rate_bps: number
  note: string | null
}

export function RateHistory({
  accountId,
  baseRateBps,
  originationDate,
  rateChanges,
}: {
  accountId: string
  baseRateBps: number
  originationDate: string
  rateChanges: RateChange[]
}) {
  const [state, formAction, pending] = useActionState<RateChangeState, FormData>(
    addRateChange,
    undefined,
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Rate history
        </h3>
        <p className="text-xs text-gray-500">
          Starting rate {(baseRateBps / 100).toFixed(3)}% since {formatDate(originationDate)}
        </p>
      </div>

      {rateChanges.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 rounded border border-gray-200 bg-white">
          {rateChanges.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span className="font-medium tabular-nums text-gray-900">
                  {(r.annual_rate_bps / 100).toFixed(3)}%
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  effective {formatDate(r.effective_month)}
                </span>
                {r.note && <span className="ml-2 text-xs text-gray-500">· {r.note}</span>}
              </div>
              <form action={deleteRateChange}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="text-xs text-red-600 hover:text-red-800">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-3 grid items-end gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
        <input type="hidden" name="account_id" value={accountId} />
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-700">Effective month</span>
          <input
            name="effective_month"
            type="date"
            required
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-700">New rate (%)</span>
          <input
            name="annual_rate_pct"
            type="text"
            inputMode="decimal"
            required
            placeholder="5.999"
            className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-700">Note (optional)</span>
          <input
            name="note"
            placeholder="e.g. BoC rate cut"
            maxLength={500}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add rate change'}
        </button>
      </form>

      <p className="mt-2 text-xs text-gray-500">
        The effective month should be the first of a month. Rate applies to periods whose month is
        ≥ the effective month.
      </p>

      {state && 'error' in state && state.error && (
        <p className="mt-2 text-sm text-red-600">{state.error}</p>
      )}
      {state && 'ok' in state && state.ok && (
        <p className="mt-2 text-sm text-green-700 dark:text-green-400">Saved.</p>
      )}
    </div>
  )
}
