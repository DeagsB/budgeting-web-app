'use client'

import { useActionState, useRef, useState, useEffect } from 'react'
import { createAccount, type AccountState } from './actions'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP } from '@/lib/domain'

export function AddAccountForm({ members }: { members: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(
    createAccount,
    undefined,
  )
  const formRef = useRef<HTMLFormElement>(null)
  const [ownership, setOwnership] = useState<'member' | 'shared'>(
    members.length > 0 ? 'member' : 'shared',
  )

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset()
  }, [pending, state])

  return (
    <form ref={formRef} action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Name</span>
        <input
          name="name"
          type="text"
          required
          maxLength={80}
          placeholder="e.g. Chequing"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Type</span>
        <select name="type" required className="rounded border border-gray-300 px-3 py-2">
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Ownership</span>
        <select
          name="ownership"
          value={ownership}
          onChange={(e) => setOwnership(e.target.value as 'member' | 'shared')}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {ACCOUNT_OWNERSHIP.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Member</span>
        <select
          name="member_id"
          disabled={ownership === 'shared'}
          className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
        >
          {ownership === 'shared' ? (
            <option value="">— shared —</option>
          ) : (
            <>
              {members.length === 0 && <option value="">(no members)</option>}
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </>
          )}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-gray-700">Opening balance (CAD)</span>
        <input
          name="opening_balance"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue="0.00"
          className="rounded border border-gray-300 px-3 py-2 tabular-nums"
        />
        <span className="text-xs text-gray-500">
          For loans / credit cards, enter the balance owing as a positive number.
        </span>
      </label>

      <div className="sm:col-span-2 flex items-center justify-between">
        {state?.error ? (
          <p className="text-sm text-red-600">{state.error}</p>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add account'}
        </button>
      </div>
    </form>
  )
}
