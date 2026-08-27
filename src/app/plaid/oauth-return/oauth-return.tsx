'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlaidConnect, usePlaidReauth, type PlaidAccountView } from '@/components/plaid/plaid-connect'
import { readOAuthResume } from '@/lib/plaid-oauth'

const FALLBACK = '/transactions/import/plaid-setup'

/**
 * Lands the OAuth bounce. Whichever flow was in progress (fresh connect or
 * re-auth) resumes here, then the user is sent back to where they started.
 * Rendered outside the app shell + onboarding so neither gate can swallow it.
 */
export function OAuthReturn(props: {
  plaidConfigured: boolean
  atCap: boolean
  maxItems: number
  linkedCount: number
  accounts: PlaidAccountView[]
  canOwn: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  // Read once: which page kicked this off. Missing = a stale/direct visit.
  const [resume] = useState(() =>
    typeof window === 'undefined' ? null : readOAuthResume(window.location.search, window.localStorage, FALLBACK),
  )
  const returnTo = resume?.returnTo ?? FALLBACK

  const reauth = usePlaidReauth({
    returnTo,
    onDone: (_id, resumedReturnTo) => router.replace(resumedReturnTo ?? FALLBACK),
    onError: setError,
  })

  return (
    <div className="flex flex-col gap-4">
      {resume === null && (
        <p className="rounded-[12px] bg-cream-2 px-3 py-2 text-[13px] leading-relaxed text-ink-2">
          Nothing to resume. Start again from the page where you connected the bank.
        </p>
      )}
      {resume?.mode === 'update' && (
        <p aria-live="polite" className="text-[13.5px] text-ink-2">
          {reauth.pending ? 'Finishing re-authentication…' : 'Re-opening your bank…'}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-maple-soft px-3 py-2 text-[12.5px] font-medium text-maple">
          {error}
        </p>
      )}
      {resume?.mode !== 'update' && (
        <PlaidConnect
          {...props}
          variant="plain"
          returnTo={returnTo}
          onLinked={() => router.replace(returnTo)}
          connectLabel="Try again"
        />
      )}
      <button
        type="button"
        onClick={() => router.replace(returnTo)}
        className="inline-flex min-h-[44px] items-center self-start text-[13px] font-semibold text-ink-2 hover:text-ink hover:underline"
      >
        ← Back
      </button>
    </div>
  )
}
