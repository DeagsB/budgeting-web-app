'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/format'
import { updateTransaction, deleteTransaction } from './actions'
import { CategorySelect } from './category-select'
import { SplitEditor } from './split-editor'

type TransactionVM = {
  id: string
  occurred_on: string
  occurredLabel: string
  amount_cents: number
  description: string | null
  account_id: string
  accountName: string
  primary_category_id: string | null
  categorySummary: string
  isSplit: boolean
  isShared: boolean
  splits: { category_id: string | null; amount_cents: number }[]
  member_id: string | null
  memberName: string | null
}

export function TransactionRow({
  transaction: t,
  accounts,
  categories,
  members,
}: {
  transaction: TransactionVM
  accounts: { id: string; name: string }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  members: { id: string; name: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const [showSplits, setShowSplits] = useState(false)

  if (editing) {
    const abs = Math.abs(t.amount_cents)
    const dir = t.amount_cents < 0 ? 'in' : 'out'
    return (
      <li className="px-6 py-4">
        <form
          action={async (fd) => {
            await updateTransaction(fd)
            setEditing(false)
          }}
          className="grid gap-2 sm:grid-cols-6"
        >
          <input type="hidden" name="id" value={t.id} />

          <input
            name="occurred_on"
            type="date"
            defaultValue={t.occurred_on}
            required
            className="rounded border border-gray-300 px-2 py-1 text-sm sm:col-span-2"
          />
          <input
            name="amount"
            type="text"
            inputMode="decimal"
            defaultValue={(abs / 100).toFixed(2)}
            required
            className="rounded border border-gray-300 px-2 py-1 text-sm tabular-nums sm:col-span-2"
          />
          <select
            name="direction"
            defaultValue={dir}
            className="rounded border border-gray-300 px-2 py-1 text-sm sm:col-span-2"
          >
            <option value="out">Out</option>
            <option value="in">In</option>
          </select>

          <select
            name="account_id"
            defaultValue={t.account_id}
            className="rounded border border-gray-300 px-2 py-1 text-sm sm:col-span-3"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="sm:col-span-3">
            <CategorySelect
              name="category_id"
              categories={categories}
              defaultValue={t.primary_category_id ?? ''}
            />
            {t.isSplit && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                This transaction is split across multiple categories. Editing the category here
                replaces the splits with a single row.
              </p>
            )}
          </div>

          <select
            name="member_id"
            defaultValue={t.member_id ?? ''}
            className="rounded border border-gray-300 px-2 py-1 text-sm sm:col-span-3"
          >
            <option value="">Shared</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            name="description"
            defaultValue={t.description ?? ''}
            maxLength={500}
            placeholder="description"
            className="rounded border border-gray-300 px-2 py-1 text-sm sm:col-span-3"
          />

          <div className="flex items-center gap-3 sm:col-span-6">
            <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white">
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
      </li>
    )
  }

  const color =
    t.amount_cents > 0 ? 'text-red-700' : t.amount_cents < 0 ? 'text-green-700' : 'text-gray-900'
  const sign = t.amount_cents < 0 ? '+' : ''

  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-4 px-6 py-3 text-sm">
        <div className="w-24 shrink-0 tabular-nums text-gray-500">{t.occurredLabel}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-gray-900">
            {t.description ?? '—'}
            {t.isSplit && (
              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                split
              </span>
            )}
            {t.isShared && (
              <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-normal text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                shared
              </span>
            )}
          </div>
          <div className="truncate text-xs text-gray-500">
            {t.accountName}
            {' · '}
            {t.categorySummary}
            {' · '}
            {t.memberName ?? 'Shared'}
          </div>
        </div>
        <div className={`w-28 shrink-0 text-right tabular-nums ${color}`}>
          {sign}
          {formatMoney(Math.abs(t.amount_cents))}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSplits((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            {showSplits ? 'Hide splits' : 'Splits'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            Edit
          </button>
          <form
            action={deleteTransaction}
            onSubmit={(e) => {
              if (!confirm('Delete this transaction?')) e.preventDefault()
            }}
          >
            <input type="hidden" name="id" value={t.id} />
            <button type="submit" className="text-xs text-red-600 hover:text-red-800">
              Delete
            </button>
          </form>
        </div>
      </div>

      {showSplits && (
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
          <SplitEditor
            transactionId={t.id}
            totalAmountCents={t.amount_cents}
            initialSplits={t.splits}
            categories={categories}
          />
        </div>
      )}
    </li>
  )
}
