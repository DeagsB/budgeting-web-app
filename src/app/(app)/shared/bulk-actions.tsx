'use client'

import { useTransition } from 'react'
import { shareAllUnflagged, unshareAll } from './actions'
import { ConfirmButton } from '@/components/ui/confirm-button'

export function BulkActions({ accountId, month }: { accountId: string; month: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-wrap items-center gap-2">
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
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-hair bg-paper px-4 text-[12.5px] font-semibold text-ink transition-colors hover:bg-cream-2 disabled:opacity-50"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Share all unflagged
        </button>
      </form>
      <ConfirmButton
        action={unshareAll}
        formData={{ account_id: accountId, month }}
        prompt="Unshare every transaction on this account this month?"
        description="Each transaction reverts to single-member ownership. The original transactions are not deleted."
        confirmLabel="Unshare all"
        destructive
        className="inline-flex min-h-[44px] items-center rounded-full px-4 text-[12.5px] font-semibold text-maple transition-colors hover:bg-maple-soft"
      >
        Unshare all
      </ConfirmButton>
    </div>
  )
}
