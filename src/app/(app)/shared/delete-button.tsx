'use client'

import { ConfirmButton } from '@/components/ui/confirm-button'
import { deleteSettlement, unmatchSettlement } from './actions'

const cls = 'flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-maple-soft hover:text-maple'

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
    </svg>
  )
}

/** Hand-recorded payment: plain delete. */
export function DeleteSettlementButton({ id }: { id: string }) {
  return (
    <ConfirmButton
      action={deleteSettlement}
      formData={{ id }}
      prompt="Delete this payment?"
      description="Removes the payment record. Transactions involved aren't affected."
      confirmLabel="Delete"
      destructive
      className={cls}
    >
      <span className="sr-only">Delete payment</span>
      <TrashIcon />
    </ConfirmButton>
  )
}

/** Payment the ledger recorded: removing it also marks its ledger rows "not a payment". */
export function UnmatchSettlementButton({ id }: { id: string }) {
  return (
    <ConfirmButton
      action={unmatchSettlement}
      formData={{ id }}
      prompt="Not a payment between members?"
      description="Removes this payment and stops offering the matching bank rows as payments. The transactions themselves stay."
      confirmLabel="Remove"
      destructive
      className={cls}
    >
      <span className="sr-only">Not a payment</span>
      <TrashIcon />
    </ConfirmButton>
  )
}
