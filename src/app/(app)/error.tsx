'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * Segment error boundary for everything under (app)/. The shell (nav, tab
 * bar) stays mounted because error.tsx only wraps the page, so the user can
 * still navigate away. `error.digest` matches the server log line.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[app-error]', error)
  }, [error])

  return (
    <div className="flex flex-col gap-6 pb-10">
      <Card padding="lg" className="flex flex-col gap-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">
          Something went wrong
        </p>
        <h1 className="font-serif text-[28px] leading-tight text-ink">
          This page hit a snag.
        </h1>
        <p className="text-[15px] text-ink-2">
          Your data is safe. Try again, or head back to the dashboard.
        </p>
        {error.digest ? (
          <p className="font-mono text-[12px] text-ink-3">ref {error.digest}</p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="primary" onClick={() => unstable_retry()}>
            Try again
          </Button>
          <Button onClick={() => router.push('/dashboard')}>Go to dashboard</Button>
        </div>
      </Card>
    </div>
  )
}
