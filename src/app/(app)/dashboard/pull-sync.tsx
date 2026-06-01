'use client'

import { type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { triggerGmailSync } from '../transactions/import/auto-setup/actions'

/**
 * Wraps the dashboard so a pull-down at the top of the screen triggers a Gmail
 * sync (best-effort) and then re-fetches the server-rendered data.
 */
export function DashboardPullSync({ children }: { children: ReactNode }) {
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
