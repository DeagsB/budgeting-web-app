'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { AddAccountForm } from './add-form'

/**
 * "Add manual account" affordance for /accounts. Linked accounts arrive on
 * their own through Plaid, so the manual form is the exception (cash, or a
 * bank Maple cannot link) and lives behind one button in a bottom sheet
 * instead of sitting open above the account list.
 */
export function AddAccountSheet({ canOwn }: { canOwn: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add manual account
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add a manual account">
        <p className="mb-4 text-[13px] leading-snug text-ink-2">
          For cash, or a bank Maple cannot link. Linked accounts and their balances come in on their own.
        </p>
        <AddAccountForm canOwn={canOwn} onSaved={() => setOpen(false)} />
      </Sheet>
    </>
  )
}
