'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Post-invite block: explains whether the email went out and always shows
 * the one-time link (copyable), because Supabase's built-in mailer only
 * reaches team addresses until custom SMTP is configured. Shared by the
 * Setup invite sheet and onboarding step 3.
 */
export function InviteResult({
  inviteUrl,
  emailSent,
  emailError,
  onDone,
  doneLabel = 'Done',
}: {
  inviteUrl: string
  emailSent: boolean
  emailError?: string
  onDone: () => void
  doneLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-relaxed text-ink-2">
        {emailSent
          ? 'An email is on its way. You can also share this link directly - it works once and expires in 7 days.'
          : `We could not send the email${emailError ? ` (${emailError})` : ''}. Share this link instead - it works once and expires in 7 days.`}
      </p>
      <div className="flex flex-col gap-2">
        <input
          readOnly
          value={inviteUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Invitation link"
          className="maple-input font-mono text-[13px]"
        />
        <Button
          type="button"
          variant="primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(inviteUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              /* clipboard blocked: the field is selectable */
            }
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {doneLabel}
        </Button>
      </div>
    </div>
  )
}
