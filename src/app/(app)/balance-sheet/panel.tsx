'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { BalanceSheetForm, type AccountRow } from './form'

/**
 * Header action + "Update balances" sheet. Owns the open/close state for the
 * snapshot-editing flow so the server page stays a pure render of the ledger.
 */
export function BalanceSheetPanel({
  month,
  monthName,
  accounts,
}: {
  month: string
  monthName: string
  accounts: AccountRow[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="primary" size="md" onClick={() => setOpen(true)}>
        Update balances
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Balances · ${monthName}`}
        className="sm:w-[640px]"
      >
        <BalanceSheetForm month={month} monthName={monthName} accounts={accounts} onSaved={() => setOpen(false)} />
      </Sheet>
    </>
  )
}
