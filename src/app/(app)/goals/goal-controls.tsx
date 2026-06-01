'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { AddGoalForm } from './add-form'

/**
 * "Add goal" primary button that opens the add form in a bottom Sheet
 * (centered card from `sm:` up). Promotes the previously-collapsed `<details>`
 * disclosure into a visible primary action in the page header.
 */
export function GoalControls({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="primary"
        size="md"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add goal
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Add goal">
        <AddGoalForm accounts={accounts} onSaved={() => setOpen(false)} />
      </Sheet>
    </>
  )
}
