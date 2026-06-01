'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { formatMoney } from '@/lib/format'
import { updateGoal, toggleAchieved, archiveGoal, type GoalState } from './actions'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'

type Goal = {
  id: string
  name: string
  target_amount_cents: number
  current_amount_cents: number
  target_date: string | null
  targetDateLabel: string | null
  funding_account_id: string | null
  fundingAccountName: string | null
  note: string | null
  achieved_at: string | null
}

export function GoalRow({
  goal,
  accounts,
  done,
}: {
  goal: Goal
  accounts: { id: string; name: string }[]
  done: boolean
}) {
  const [editing, setEditing] = useState(false)
  const percent = goal.target_amount_cents
    ? Math.min(100, Math.round((goal.current_amount_cents / goal.target_amount_cents) * 100))
    : 0
  const remaining = Math.max(0, goal.target_amount_cents - goal.current_amount_cents)

  if (editing) {
    return (
      <EditCard
        goal={goal}
        accounts={accounts}
        onDone={() => setEditing(false)}
      />
    )
  }

  return (
    <section
      className={
        'rounded-xl border border-hair bg-paper p-5 shadow-[var(--shadow-card)] md:p-6 ' +
        (done ? 'opacity-70' : '')
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-serif text-[19px] tracking-[-0.01em] text-ink">
              {goal.name}
            </h3>
            {/* Goals carry no member attribution, so they're always shared. */}
            <span className="inline-flex items-center rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-leaf">
              Shared
            </span>
            {done && (
              <span className="inline-flex items-center rounded-full bg-leaf-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-leaf-deep">
                Achieved
              </span>
            )}
          </div>
          {(goal.targetDateLabel || goal.fundingAccountName) && (
            <p className="mt-1 text-[11.5px] text-ink-3">
              {goal.targetDateLabel && <>Due {goal.targetDateLabel}</>}
              {goal.targetDateLabel && goal.fundingAccountName && ' · '}
              {goal.fundingAccountName && <>Funding · {goal.fundingAccountName}</>}
            </p>
          )}
        </div>

        {/* Always-visible actions with ≥44px tap targets so they work on touch
            without a hover state. */}
        <div className="-ml-1 flex flex-wrap items-center gap-1 text-[12px] sm:-mr-1 sm:ml-0 sm:justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-[44px] items-center rounded-md px-2 font-semibold text-ink-2 transition-colors hover:bg-cream-2 hover:text-ink"
          >
            Edit
          </button>
          <form action={toggleAchieved}>
            <input type="hidden" name="id" value={goal.id} />
            <input type="hidden" name="achieved" value={done ? '0' : '1'} />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center rounded-md px-2 font-semibold text-ink-2 transition-colors hover:bg-cream-2 hover:text-ink"
            >
              {done ? 'Reopen' : 'Mark achieved'}
            </button>
          </form>
          <ConfirmButton
            action={archiveGoal}
            formData={{ id: goal.id }}
            prompt={`Archive "${goal.name}"?`}
            description="Archived goals are hidden from the active list but kept in history."
            confirmLabel="Archive"
            destructive
            className="inline-flex min-h-[44px] items-center rounded-md px-2 font-semibold text-maple transition-colors hover:bg-maple-soft"
          >
            Archive
          </ConfirmButton>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <div className="font-serif text-[18px] tabular-nums text-ink">
          <Amount cents={goal.current_amount_cents} className="text-[18px]" />
          <span className="text-ink-3"> of {formatMoney(goal.target_amount_cents)}</span>
        </div>
        <span className="text-[13px] font-semibold tabular-nums text-ink-2">
          {percent}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.name} progress`}
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            background: done ? 'var(--color-leaf-deep)' : 'var(--color-leaf)',
          }}
        />
      </div>
      <div className="mt-1.5 text-[11.5px] text-ink-3">
        {remaining > 0 ? `${formatMoney(remaining)} to go` : 'Target reached'}
      </div>

      {goal.note && (
        <p className="mt-3 rounded-md bg-paper-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
          {goal.note}
        </p>
      )}
    </section>
  )
}

function EditCard({
  goal,
  accounts,
  onDone,
}: {
  goal: Goal
  accounts: { id: string; name: string }[]
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState<GoalState, FormData>(updateGoal, undefined)
  // Close the editor once a submit completes without an error.
  const wasPending = useRef(false)
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) onDone()
    wasPending.current = pending
    // `onDone` is stable from the caller; depend only on the action outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state])

  return (
    <section className="rounded-xl border border-hair bg-paper-2 p-5 shadow-[var(--shadow-card)] md:p-6">
      <form action={formAction} className="grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="id" value={goal.id} />

        <Field label="Name" required className="sm:col-span-2">
          <input
            name="name"
            defaultValue={goal.name}
            required
            maxLength={120}
            className="maple-input"
          />
        </Field>
        <Field label="Target date">
          <input
            name="target_date"
            type="date"
            defaultValue={goal.target_date ?? ''}
            className="maple-input"
          />
        </Field>
        <Field label="Target amount" required>
          <input
            name="target_amount"
            type="text"
            inputMode="decimal"
            defaultValue={(goal.target_amount_cents / 100).toFixed(2)}
            required
            className="maple-input tabular-nums"
          />
        </Field>
        <Field label="Current progress">
          <input
            name="current_amount"
            type="text"
            inputMode="decimal"
            defaultValue={(goal.current_amount_cents / 100).toFixed(2)}
            className="maple-input tabular-nums"
          />
        </Field>
        <Field label="Funding account">
          <select
            name="funding_account_id"
            defaultValue={goal.funding_account_id ?? ''}
            className="maple-select"
          >
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-3">
          <input
            name="note"
            defaultValue={goal.note ?? ''}
            maxLength={1000}
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
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </section>
  )
}
