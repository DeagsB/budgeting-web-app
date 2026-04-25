'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/format'
import { updateGoal, toggleAchieved, archiveGoal } from './actions'
import { ConfirmButton } from '@/components/ui/confirm-button'

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
      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper-2)] p-5 md:p-6">
        <form
          action={async (fd) => {
            await updateGoal(fd)
            setEditing(false)
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          <input type="hidden" name="id" value={goal.id} />

          <EditField label="Name" span={2}>
            <input
              name="name"
              defaultValue={goal.name}
              required
              maxLength={120}
              className="maple-input"
            />
          </EditField>
          <EditField label="Target date">
            <input
              name="target_date"
              type="date"
              defaultValue={goal.target_date ?? ''}
              className="maple-input"
            />
          </EditField>
          <EditField label="Target amount">
            <input
              name="target_amount"
              type="text"
              inputMode="decimal"
              defaultValue={(goal.target_amount_cents / 100).toFixed(2)}
              required
              className="maple-input tabular-nums"
            />
          </EditField>
          <EditField label="Current progress">
            <input
              name="current_amount"
              type="text"
              inputMode="decimal"
              defaultValue={(goal.current_amount_cents / 100).toFixed(2)}
              className="maple-input tabular-nums"
            />
          </EditField>
          <EditField label="Funding account">
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
          </EditField>
          <EditField label="Notes" span={3}>
            <input
              name="note"
              defaultValue={goal.note ?? ''}
              maxLength={1000}
              className="maple-input"
            />
          </EditField>

          <div className="flex items-center justify-end gap-3 sm:col-span-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[13px] font-semibold text-[var(--color-paper)] active:scale-[0.98]"
            >
              Save
            </button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section
      className={
        'rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6 ' +
        (done ? 'opacity-70' : '')
      }
    >
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="font-serif text-[19px] tracking-[-0.01em] text-[var(--color-ink)]">
              {goal.name}
            </h3>
            {done && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
              >
                Achieved
              </span>
            )}
          </div>
          {(goal.targetDateLabel || goal.fundingAccountName) && (
            <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">
              {goal.targetDateLabel && <>Due {goal.targetDateLabel}</>}
              {goal.targetDateLabel && goal.fundingAccountName && ' · '}
              {goal.fundingAccountName && <>Funding · {goal.fundingAccountName}</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-[12px]">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-semibold text-[var(--color-ink-2)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            Edit
          </button>
          <span className="text-[var(--color-hair)]">·</span>
          <form action={toggleAchieved}>
            <input type="hidden" name="id" value={goal.id} />
            <input type="hidden" name="achieved" value={done ? '0' : '1'} />
            <button
              type="submit"
              className="font-semibold text-[var(--color-ink-2)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
            >
              {done ? 'Reopen' : 'Mark achieved'}
            </button>
          </form>
          <span className="text-[var(--color-hair)]">·</span>
          <ConfirmButton
            action={archiveGoal}
            formData={{ id: goal.id }}
            prompt={`Archive "${goal.name}"?`}
            description="Archived goals are hidden from the active list but kept in history."
            confirmLabel="Archive"
            destructive
            className="font-semibold underline-offset-2 hover:underline"
          >
            <span style={{ color: 'var(--color-maple)' }}>Archive</span>
          </ConfirmButton>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <div className="font-serif text-[18px] tabular-nums text-[var(--color-ink)]">
          {formatMoney(goal.current_amount_cents)}
          <span className="text-[var(--color-ink-3)]"> of {formatMoney(goal.target_amount_cents)}</span>
        </div>
        <span className="text-[13px] font-semibold tabular-nums text-[var(--color-ink-2)]">
          {percent}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-paper-2)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            background: done ? 'var(--color-leaf-deep)' : 'var(--color-leaf)',
          }}
        />
      </div>
      <div className="mt-1.5 text-[11.5px] text-[var(--color-ink-3)]">
        {remaining > 0 ? `${formatMoney(remaining)} to go` : 'Target reached'}
      </div>

      {goal.note && (
        <p className="mt-3 rounded-[10px] bg-[var(--color-paper-2)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
          {goal.note}
        </p>
      )}
    </section>
  )
}

function EditField({
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
