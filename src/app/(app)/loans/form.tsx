'use client'

import { useActionState } from 'react'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { MapleLabel } from '@/components/ui/label'
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

  const saved = !!state && 'ok' in state && state.ok
  const error = state && 'error' in state ? state.error : null

  // For a loan that already has terms, the form is secondary to the projection
  // - collapse it into a disclosure so the payoff tiles lead. New loans render
  // the form open so the first thing the user sees is the terms entry.
  const form = (
    <form action={formAction} className="grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="account_id" value={accountId} />

      <Field label="Annual rate (%)" required>
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
      <Field label="Origination date" required>
        <input
          name="origination_date"
          type="date"
          required
          defaultValue={initial?.origination_date ?? ''}
          className="maple-input"
        />
      </Field>
      <Field label="Original principal" required>
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
      <Field label="Monthly payment" required>
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

      <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-4">
        <div aria-live="polite" className="min-w-0 flex-1 text-[12.5px]">
          {error ? (
            <span className="inline-block rounded-sm bg-maple-soft px-3 py-1.5 font-medium text-maple">
              {error}
            </span>
          ) : saved && !pending ? (
            <span className="inline-block rounded-sm bg-leaf-soft px-3 py-1.5 font-medium text-leaf">
              Terms saved.
            </span>
          ) : null}
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : initial ? 'Update terms' : 'Save terms'}
        </Button>
      </div>
    </form>
  )

  if (!initial) return form

  return (
    <details className="group rounded-md border border-hair bg-paper-2 [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-[44px] cursor-pointer items-center justify-between px-4 py-3">
        <MapleLabel>Edit terms</MapleLabel>
        <Chevron />
      </summary>
      <div className="border-t border-hair px-4 pb-4 pt-4">{form}</div>
    </details>
  )
}

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ink-3 transition-transform group-open:rotate-180"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
