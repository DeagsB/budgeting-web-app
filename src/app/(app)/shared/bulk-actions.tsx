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
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-cream-2)] disabled:opacity-50"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
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
          className="inline-flex items-center rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-50"
          style={{ color: 'var(--color-maple)' }}
        >
          Unshare all
        </button>
      </form>
    </div>
  )
}
