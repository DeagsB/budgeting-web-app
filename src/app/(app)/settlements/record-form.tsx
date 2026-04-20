'use client'

import { useActionState } from 'react'
import { formatMoney } from '@/lib/format'
import { recordSettlement, type SettlementState } from './actions'

type Member = { id: string; name: string }
type Suggestion = {
  from_member_id: string
  to_member_id: string
  net_cents: number
} | null

export function RecordSettlementForm({
  members,
  defaultDate,
  suggestion,
}: {
  members: Member[]
  defaultDate: string
  suggestion: Suggestion
}) {
  const [state, formAction, pending] = useActionState<SettlementState, FormData>(
    recordSettlement,
    undefined,
  )

  const defaultFrom = suggestion?.from_member_id ?? members[0]?.id ?? ''
  const defaultTo =
    suggestion?.to_member_id ?? members.find((m) => m.id !== defaultFrom)?.id ?? ''
  const defaultAmount =
    suggestion?.net_cents != null ? (suggestion.net_cents / 100).toFixed(2) : ''

  return (
    <form action={formAction} className="mt-3 grid gap-3 sm:grid-cols-6">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-gray-700">From</span>
        <select
          name="from_member_id"
          defaultValue={defaultFrom}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-gray-700">To</span>
        <select
          name="to_member_id"
          defaultValue={defaultTo}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-gray-700">Amount</span>
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          required
          defaultValue={defaultAmount}
          placeholder="0.00"
          className="rounded border border-gray-300 px-3 py-2 tabular-nums"
        />
        {suggestion && (
          <span className="text-xs text-gray-500">
            Current outstanding: {formatMoney(suggestion.net_cents)}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-3">
        <span className="text-gray-700">Date</span>
        <input
          name="settled_on"
          type="date"
          required
          defaultValue={defaultDate}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-3">
        <span className="text-gray-700">Note (optional)</span>
        <input
          name="note"
          maxLength={500}
          placeholder="e.g. April settlement — e-transfer"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <div className="sm:col-span-6 flex items-center justify-between">
        {state && 'error' in state && state.error ? (
          <p className="text-sm text-red-600">{state.error}</p>
        ) : state && 'ok' in state && state.ok ? (
          <p className="text-sm text-green-700 dark:text-green-400">Payment recorded.</p>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Record payment'}
        </button>
      </div>
    </form>
  )
}
