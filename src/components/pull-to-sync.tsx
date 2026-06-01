'use client'

import { type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { triggerGmailSync } from '@/app/(app)/transactions/import/auto-setup/actions'

/**
 * Wraps a screen so a pull-down at the very top triggers a best-effort Gmail
 * sync and then re-fetches the server-rendered data. Shared by the dashboard
 * and the transactions page so the gesture behaves identically on both.
 */
export function PullToSync({ children }: { children: ReactNode }) {
  const router = useRouter()
  return (
    <PullToRefresh
      onRefresh={async () => {
        try {
          await triggerGmailSync()
        } catch {
          /* sync is best-effort — refresh regardless so manual adds show */
        }
        router.refresh()
      }}
    >
      {children}
    </PullToRefresh>
  )
}
