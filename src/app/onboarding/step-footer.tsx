'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { completeOnboarding } from './complete-actions'

/**
 * Row under a step card: an optional Continue link on the right and a
 * "Skip" on the left. `skip: 'finish'` ends the guided flow (sets the
 * completion flag, lands on the dashboard); `skip: { href }` just moves on.
 */
export function StepFooter({
  continueHref,
  continueLabel = 'Continue',
  skip,
  skipLabel = 'Skip for now',
}: {
  continueHref?: string
  continueLabel?: string
  skip: 'finish' | { href: string }
  skipLabel?: string
}) {
  const [pending, start] = useTransition()

  const skipEl =
    skip === 'finish' ? (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => completeOnboarding())}
        className="inline-flex min-h-[44px] items-center justify-center px-2 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
      >
        {pending ? 'One moment…' : skipLabel}
      </button>
    ) : (
      <Link
        href={skip.href}
        className="inline-flex min-h-[44px] items-center justify-center px-2 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
      >
        {skipLabel}
      </Link>
    )

  return (
    <div className="flex flex-col gap-2 px-1 sm:flex-row-reverse sm:items-center sm:justify-between">
      {continueHref ? (
        <Link href={continueHref} className="inline-flex w-full sm:w-auto">
          <Button type="button" variant="primary" size="md" className="w-full sm:w-auto">
            {continueLabel}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Button>
        </Link>
      ) : (
        <span />
      )}
      {skipEl}
    </div>
  )
}
