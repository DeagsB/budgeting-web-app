'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/format'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP } from '@/lib/domain'
import { updateAccount, archiveAccount, unarchiveAccount } from './actions'

type Account = {
  id: string
  name: string
  type: string
  typeLabel: string
  ownership: string
  member_id: string | null
  memberName: string | null
  opening_balance_cents: number
  archived: boolean
}

export function AccountRow({
  account,
  members,
}: {
  account: Account
  members: { id: string; name: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const [ownership, setOwnership] = useState<'member' | 'shared'>(account.ownership as never)

  if (editing) {
    return (
      <li className="border-b border-gray-100 px-6 py-4 last:border-b-0">
        <form
          action={async (fd) => {
            await updateAccount(fd)
            setEditing(false)
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={account.id} />

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Name</span>
            <input
              name="name"
              defaultValue={account.name}
              required
              maxLength={80}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Type</span>
            <select
              name="type"
              defaultValue={account.type}
              className="rounded border border-gray-300 px-3 py-2"
            >
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
              defaultValue={account.member_id ?? ''}
              className="rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {ownership === 'shared' ? (
                <option value="">— shared —</option>
              ) : (
                members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-gray-700">Opening balance (CAD)</span>
            <input
              name="opening_balance"
              type="text"
              inputMode="decimal"
              defaultValue={(account.opening_balance_cents / 100).toFixed(2)}
              className="rounded border border-gray-300 px-3 py-2 tabular-nums"
            />
          </label>

          <div className="flex gap-3 sm:col-span-2">
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
      </li>
    )
  }

  return (
    <li
      className={
        'flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-3 last:border-b-0 ' +
        (account.archived ? 'opacity-50' : '')
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-gray-900">{account.name}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{account.typeLabel}</span>
            <span>·</span>
            <span>
              {account.ownership === 'shared'
                ? 'Shared'
                : (account.memberName ?? 'Member removed')}
            </span>
          </div>
        </div>
        <div className="text-right text-sm tabular-nums text-gray-900">
          {formatMoney(account.opening_balance_cents)}
          <div className="text-xs text-gray-500">opening</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {!account.archived && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            Edit
          </button>
        )}
        {account.archived ? (
          <form action={unarchiveAccount}>
            <input type="hidden" name="id" value={account.id} />
            <button type="submit" className="text-xs text-gray-500 hover:text-gray-900">
              Unarchive
            </button>
          </form>
        ) : (
          <form action={archiveAccount}>
            <input type="hidden" name="id" value={account.id} />
            <button type="submit" className="text-xs text-red-600 hover:text-red-800">
              Archive
            </button>
          </form>
        )}
      </div>
    </li>
  )
}
