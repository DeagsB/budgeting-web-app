'use client'

import { useActionState, useRef, useEffect } from 'react'
import { createGoal, type GoalState } from './actions'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'

export function AddGoalForm({
  accounts,
  onSaved,
}: {
  accounts: { id: string; name: string }[]
  onSaved?: () => void
}) {
  const [state, formAction, pending] = useActionState<GoalState, FormData>(createGoal, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!pending && !state?.error) {
      formRef.current?.reset()
      onSaved?.()
    }
    // `onSaved` is stable from the caller; depend only on the action outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state])

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 sm:grid-cols-3">
      <Field label="Name" required className="sm:col-span-2">
        <input
          name="name"
          required
          maxLength={120}
          placeholder="e.g. Down payment"
          className="maple-input"
        />
      </Field>

      <Field label="Target date" hint="Optional">
        <input name="target_date" type="date" className="maple-input" />
      </Field>

      <Field label="Target amount (CAD)" required>
        <input
          name="target_amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="0.00"
          className="maple-input tabular-nums"
        />
      </Field>

      <Field label="Current progress (CAD)">
        <input
          name="current_amount"
          type="text"
          inputMode="decimal"
          defaultValue="0.00"
          className="maple-input tabular-nums"
        />
      </Field>

      <Field label="Funding account" hint="Optional">
        <select name="funding_account_id" className="maple-select">
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes" hint="Optional" className="sm:col-span-3">
        <input
          name="note"
          maxLength={1000}
          placeholder="Anything worth remembering"
          className="maple-input"
        />
      </Field>

      <div className="flex flex-col-reverse items-stretch gap-3 sm:col-span-3 sm:flex-row sm:items-center sm:justify-end">
        {state?.error && (
          <p
            role="alert"
            className="rounded-md bg-maple-soft px-3 py-2 text-[12.5px] font-medium text-maple"
          >
            {state.error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Adding…' : 'Add goal'}
        </Button>
      </div>
    </form>
  )
}
