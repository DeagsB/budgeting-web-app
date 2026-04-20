'use client'

import { useTransition } from 'react'
import { shareAllUnflagged, unshareAll } from './actions'

export function BulkActions({ accountId, month }: { accountId: string; month: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      <form
        action={(fd) =>
          startTransition(async () => {
            await shareAllUnflagged(fd)
          })
        }
      >
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="month" value={month} />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Share all unflagged
        </button>
      </form>
      <form
        action={(fd) =>
          startTransition(async () => {
            if (!confirm('Unshare every transaction on this account this month?')) return
            await unshareAll(fd)
          })
        }
      >
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="month" value={month} />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Unshare all
        </button>
      </form>
    </div>
  )
}
