'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { completeOnboarding } from './complete-actions'
import { finishMemberOnboarding } from './member-actions'

/**
 * Row under a step card: an optional Continue link on the right, an optional
 * Back link and a "Skip" on the left. `skip: 'finish'` ends the guided flow
 * (sets the completion flag, lands on the dashboard); `skip: { href }` just
 * moves on. Back exists so an earlier step stays reachable - notably step 2,
 * to connect another bank after moving past it.
 *
 * `skip: 'finish'` ends the owner's flow, `skip: 'finish-member'` ends the
 * shorter one an invited member walks.
 */
export function StepFooter({
  continueHref,
  continueLabel = 'Continue',
  backHref,
  backLabel = 'Back',
  skip,
  skipLabel = 'Skip for now',
}: {
  continueHref?: string
  continueLabel?: string
  /** Earlier step to return to, e.g. /onboarding/bank to connect another bank. */
  backHref?: string
  backLabel?: string
  skip: 'finish' | 'finish-member' | { href: string }
  skipLabel?: string
}) {
  const [pending, start] = useTransition()

  const skipEl =
    typeof skip === 'string' ? (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => (skip === 'finish' ? completeOnboarding() : finishMemberOnboarding()))}
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
      <div className="flex items-center gap-1">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex min-h-[44px] items-center justify-center gap-1 px-2 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            {backLabel}
          </Link>
        ) : null}
        {skipEl}
      </div>
    </div>
  )
}
