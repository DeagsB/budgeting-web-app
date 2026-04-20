'use client'

import { useActionState, useRef, useEffect } from 'react'
import { createTransaction, type TransactionState } from './actions'
import { CategorySelect } from './category-select'

export function AddTransactionForm({
  defaultDate,
  accounts,
  categories,
  members,
}: {
  defaultDate: string
  accounts: { id: string; name: string }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  members: { id: string; name: string }[]
}) {
  const [state, formAction, pending] = useActionState<TransactionState, FormData>(
    createTransaction,
    undefined,
  )
  const formRef = useRef<HTMLFormElement>(null)
  const today = new Date()
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset()
  }, [pending, state, defaultDate])

  return (
    <form ref={formRef} action={formAction} className="mt-3 grid gap-3 sm:grid-cols-6">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-gray-700">Date</span>
        <input
          name="occurred_on"
          type="date"
          required
          defaultValue={todayISO}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-gray-700">Amount</span>
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="0.00"
          className="rounded border border-gray-300 px-3 py-2 tabular-nums"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-gray-700">Direction</span>
        <select
          name="direction"
          defaultValue="out"
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="out">Money out (expense)</option>
          <option value="in">Money in (income)</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-3">
        <span className="text-gray-700">Account</span>
        <select name="account_id" required className="rounded border border-gray-300 px-3 py-2">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-3">
        <span className="text-gray-700">Category</span>
        <CategorySelect name="category_id" categories={categories} />
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-3">
        <span className="text-gray-700">Member</span>
        <select name="member_id" className="rounded border border-gray-300 px-3 py-2">
          <option value="">Shared</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-3">
        <span className="text-gray-700">Description</span>
        <input
          name="description"
          type="text"
          maxLength={500}
          placeholder="optional"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <div className="sm:col-span-6 flex items-center justify-between">
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : <span />}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Add transaction'}
        </button>
      </div>
    </form>
  )
}
