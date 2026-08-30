'use client'

import { Sheet } from '@/components/ui/sheet'
import { AddTransactionForm } from '@/app/(app)/transactions/add-form'

type Props = {
  onClose: () => void
  defaultDate: string
  accounts: { id: string; name: string }[]
  categories: Parameters<typeof AddTransactionForm>[0]['categories']
}

/**
 * The dashboard's "Add transaction" sheet. Split out so the sheet primitive
 * and the form (plus its action + toast + money parsing) load on the first
 * tap instead of riding the dashboard's cold-start critical path. Mounted
 * only while open, which is exactly what <Sheet> already does internally.
 */
export function AddTransactionSheet({ onClose, defaultDate, accounts, categories }: Props) {
  return (
    <Sheet open onClose={onClose} title="Add transaction">
      <AddTransactionForm
        defaultDate={defaultDate}
        accounts={accounts}
        categories={categories}
        onSaved={onClose}
      />
    </Sheet>
  )
}
