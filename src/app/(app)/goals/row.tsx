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
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <form
          action={async (fd) => {
            await updateGoal(fd)
            setEditing(false)
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          <input type="hidden" name="id" value={goal.id} />

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-gray-700">Name</span>
            <input
              name="name"
              defaultValue={goal.name}
              required
              maxLength={120}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Target date</span>
            <input
              name="target_date"
              type="date"
              defaultValue={goal.target_date ?? ''}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Target amount</span>
            <input
              name="target_amount"
              type="text"
              inputMode="decimal"
              defaultValue={(goal.target_amount_cents / 100).toFixed(2)}
              required
              className="rounded border border-gray-300 px-3 py-2 tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Current progress</span>
            <input
              name="current_amount"
              type="text"
              inputMode="decimal"
              defaultValue={(goal.current_amount_cents / 100).toFixed(2)}
              className="rounded border border-gray-300 px-3 py-2 tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Funding account</span>
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
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-3">
            <span className="text-gray-700">Notes</span>
            <input
              name="note"
              defaultValue={goal.note ?? ''}
              maxLength={1000}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>

          <div className="flex items-center gap-3 sm:col-span-3">
            <button
              type="submit"
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className={`rounded-lg border border-gray-200 bg-white p-6 ${done ? 'opacity-70' : ''}`}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">
            {goal.name}
            {done && (
              <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                Achieved
              </span>
            )}
          </h3>
          {(goal.targetDateLabel || goal.fundingAccountName) && (
            <p className="mt-1 text-xs text-gray-500">
              {goal.targetDateLabel && <>Due {goal.targetDateLabel}</>}
              {goal.targetDateLabel && goal.fundingAccountName && ' · '}
              {goal.fundingAccountName && <>Funding: {goal.fundingAccountName}</>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="hover:text-gray-900"
          >
            Edit
          </button>
          <form action={toggleAchieved}>
            <input type="hidden" name="id" value={goal.id} />
            <input type="hidden" name="achieved" value={done ? '0' : '1'} />
            <button type="submit" className="hover:text-gray-900">
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
            className="text-red-600 hover:text-red-800"
          >
            Archive
          </ConfirmButton>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <div className="flex gap-4 text-sm tabular-nums text-gray-700">
          <span>
            <strong>{formatMoney(goal.current_amount_cents)}</strong>
            <span className="text-gray-500"> saved</span>
          </span>
          <span>
            of {formatMoney(goal.target_amount_cents)}
          </span>
          <span className="text-gray-500">({formatMoney(remaining)} to go)</span>
        </div>
        <span className="text-sm font-medium text-gray-700">{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full ${done ? 'bg-green-500' : 'bg-gray-900'}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {goal.note && <p className="mt-3 text-sm text-gray-600">{goal.note}</p>}
    </section>
  )
}
