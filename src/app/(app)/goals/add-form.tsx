'use client'

import { useActionState, useRef, useEffect } from 'react'
import { createGoal, type GoalState } from './actions'

export function AddGoalForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<GoalState, FormData>(createGoal, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset()
  }, [pending, state])

  return (
    <form ref={formRef} action={formAction} className="mt-3 grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-gray-700">Name</span>
        <input
          name="name"
          required
          maxLength={120}
          placeholder="e.g. Down payment"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Target date (optional)</span>
        <input name="target_date" type="date" className="rounded border border-gray-300 px-3 py-2" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Target amount (CAD)</span>
        <input
          name="target_amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="0.00"
          className="rounded border border-gray-300 px-3 py-2 tabular-nums"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Current progress (CAD)</span>
        <input
          name="current_amount"
          type="text"
          inputMode="decimal"
          defaultValue="0.00"
          className="rounded border border-gray-300 px-3 py-2 tabular-nums"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Funding account (optional)</span>
        <select name="funding_account_id" className="rounded border border-gray-300 px-3 py-2">
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-3">
        <span className="text-gray-700">Notes (optional)</span>
        <input
          name="note"
          maxLength={1000}
          placeholder="Anything worth remembering"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <div className="sm:col-span-3 flex items-center justify-between">
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : <span />}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add goal'}
        </button>
      </div>
    </form>
  )
}
