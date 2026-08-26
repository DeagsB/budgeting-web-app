'use client'

import { type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { triggerPlaidSync } from '@/app/(app)/transactions/import/plaid-setup/actions'
import { useRunAction } from '@/lib/run-action'

/**
 * Wraps a screen so a pull-down at the very top triggers a best-effort Plaid
 * sync and then re-fetches the server-rendered data. Rate-limited to once per
 * two minutes from this gesture so a nervous pull does not hammer the API.
 *
 * Offline pulls surface a toast instead of failing silently, and the sync is
 * retried once when the connection returns.
 */
export function PullToSync({ children }: { children: ReactNode }) {
  const router = useRouter()
  const run = useRunAction()
  return (
    <PullToRefresh
      onRefresh={async () => {
        // Best-effort; refresh regardless so manual adds show.
        try {
          await run(() => triggerPlaidSync(undefined, { trigger: 'pull', minIntervalMs: 120_000 }), {
            offlineMessage: "You're offline. We'll sync when you're back.",
            retrySuccessMessage: 'Back online - synced.',
            onRetrySuccess: () => router.refresh(),
          })
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
