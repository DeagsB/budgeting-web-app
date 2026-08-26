'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createStarterSettlementRule } from './actions'

/**
 * Shown until the household has a settlement rule. One tap creates the
 * INTERAC e-Transfer rule and runs it over the last 12 months.
 */
export function DetectTransfersNudge() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1 rounded-md bg-cream-2 px-4 py-3 text-[13px] text-ink-2 sm:flex-row sm:items-center sm:justify-between">
      <span>Paying each other by e-Transfer? Maple can record those from your bank rows.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await createStarterSettlementRule()
            if (res && 'error' in res) setError(res.error)
            else router.refresh()
          })
        }
        className="inline-flex min-h-[44px] shrink-0 items-center font-semibold text-leaf-deep hover:underline disabled:opacity-50"
      >
        {pending ? 'Setting up…' : 'Detect e-Transfers'}
      </button>
      {error && <span className="text-[12.5px] font-medium text-maple">{error}</span>}
    </div>
  )
}
