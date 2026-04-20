'use client'

import { useActionState } from 'react'
import { saveLoanDetails, type LoanState } from './actions'

type Initial = {
  annual_rate_pct: string
  origination_date: string
  original_principal: string
  monthly_payment: string
} | null

export function LoanForm({ accountId, initial }: { accountId: string; initial: Initial }) {
  const [state, formAction, pending] = useActionState<LoanState, FormData>(
    saveLoanDetails,
    undefined,
  )

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="account_id" value={accountId} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Annual rate (%)</span>
        <input
          name="annual_rate_pct"
          type="text"
          inputMode="decimal"
          required
          defaultValue={initial?.annual_rate_pct ?? ''}
          placeholder="5.99"
          className="rounded border border-gray-300 px-3 py-2 tabular-nums"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Origination date</span>
        <input
          name="origination_date"
          type="date"
          required
          defaultValue={initial?.origination_date ?? ''}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Original principal</span>
        <input
          name="original_principal"
          type="text"
          inputMode="decimal"
          required
          defaultValue={initial?.original_principal ?? ''}
          placeholder="0.00"
          className="rounded border border-gray-300 px-3 py-2 tabular-nums"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Monthly payment</span>
        <input
          name="monthly_payment"
          type="text"
          inputMode="decimal"
          required
          defaultValue={initial?.monthly_payment ?? ''}
          placeholder="0.00"
          className="rounded border border-gray-300 px-3 py-2 tabular-nums"
        />
      </label>

      <div className="sm:col-span-4 flex items-center justify-between">
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : <span />}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : initial ? 'Update terms' : 'Save terms'}
        </button>
      </div>
    </form>
  )
}
