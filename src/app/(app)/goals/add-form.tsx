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
    <form ref={formRef} action={formAction} className="grid gap-3 sm:grid-cols-3">
      <Field label="Name" span={2}>
        <input
          name="name"
          required
          maxLength={120}
          placeholder="e.g. Down payment"
          className="maple-input"
        />
      </Field>

      <Field label="Target date (optional)">
        <input name="target_date" type="date" className="maple-input" />
      </Field>

      <Field label="Target amount (CAD)">
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

      <Field label="Funding account (optional)">
        <select name="funding_account_id" className="maple-select">
          <option value="">—</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes (optional)" span={3}>
        <input
          name="note"
          maxLength={1000}
          placeholder="Anything worth remembering"
          className="maple-input"
        />
      </Field>

      <div className="flex items-center justify-end gap-3 sm:col-span-3">
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
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[13px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add goal'}
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  span,
  children,
}: {
  label: string
  span?: 2 | 3
  children: React.ReactNode
}) {
  const sc = span === 3 ? 'sm:col-span-3' : span === 2 ? 'sm:col-span-2' : ''
  return (
    <label className={`flex flex-col gap-1 ${sc}`}>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  )
}
