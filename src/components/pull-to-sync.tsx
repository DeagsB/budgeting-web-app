'use client'

import { type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { triggerPlaidSync } from '@/app/(app)/transactions/import/plaid-setup/actions'

/**
 * Wraps a screen so a pull-down at the very top triggers a best-effort Plaid
 * sync and then re-fetches the server-rendered data. Rate-limited to once per
 * two minutes from this gesture so a nervous pull does not hammer the API.
 */
export function PullToSync({ children }: { children: ReactNode }) {
  const router = useRouter()
  return (
    <PullToRefresh
      onRefresh={async () => {
        // Best-effort; refresh regardless so manual adds show.
        try {
          await triggerPlaidSync(undefined, { trigger: 'pull', minIntervalMs: 120_000 })
        } catch {
          /* sync failures surface on the Plaid setup page, not here */
        }
        router.refresh()
      }}
    >
      {children}
    </PullToRefresh>
  )
}
