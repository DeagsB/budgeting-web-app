'use client'

import { useTransition } from 'react'
import { deleteSettlement } from './actions'

export function DeleteSettlementButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          if (!confirm('Delete this settlement?')) return
          await deleteSettlement(fd)
        })
      }
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Delete settlement"
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-maple-soft)] hover:text-[var(--color-maple)] disabled:opacity-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
        </svg>
      </button>
    </form>
  )
}
