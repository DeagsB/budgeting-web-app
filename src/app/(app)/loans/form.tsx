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

      <Field label="Annual rate (%)">
        <input
          name="annual_rate_pct"
          type="text"
          inputMode="decimal"
          required
          defaultValue={initial?.annual_rate_pct ?? ''}
          placeholder="5.99"
          className="maple-input tabular-nums"
        />
      </Field>
      <Field label="Origination date">
        <input
          name="origination_date"
          type="date"
          required
          defaultValue={initial?.origination_date ?? ''}
          className="maple-input"
        />
      </Field>
      <Field label="Original principal">
        <input
          name="original_principal"
          type="text"
          inputMode="decimal"
          required
          defaultValue={initial?.original_principal ?? ''}
          placeholder="0.00"
          className="maple-input tabular-nums"
        />
      </Field>
      <Field label="Monthly payment">
        <input
          name="monthly_payment"
          type="text"
          inputMode="decimal"
          required
          defaultValue={initial?.monthly_payment ?? ''}
          placeholder="0.00"
          className="maple-input tabular-nums"
        />
      </Field>

      <div className="flex items-center justify-end gap-3 sm:col-span-4">
        {state?.error && (
          <p
            className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
          >
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[13px] font-semibold text-[var(--color-paper)] active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Saving…' : initial ? 'Update terms' : 'Save terms'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  )
}
