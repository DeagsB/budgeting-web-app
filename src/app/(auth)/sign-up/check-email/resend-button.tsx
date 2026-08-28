'use client'

import { useActionState } from 'react'
import { resendConfirmation, type ResendState } from '../actions'

/**
 * "Didn't get it? Send again." Confirms inline on success; shows Supabase's
 * own message on failure (rate limit, delivery error, expired cookie).
 */
export function ResendButton() {
  const [state, formAction, pending] = useActionState<ResendState>(resendConfirmation, undefined)
  const sent = !!state && 'sent' in state
  const error = state && 'error' in state ? state.error : null

  return (
    <form action={formAction} className="flex flex-col items-center gap-3">
      <button
        type="submit"
        disabled={pending || sent}
        className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--color-ink)] px-5 py-3 text-[13.5px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? 'Sending…' : sent ? 'Sent - check again' : 'Resend confirmation email'}
      </button>
      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-[12.5px] leading-relaxed">
        {sent && <span className="text-[var(--color-ink-2)]">A fresh link is on its way. Give it a minute, and check spam.</span>}
        {error && (
          <span
            className="inline-block rounded-[10px] px-3 py-2 font-medium"
            style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
          >
            {error}
          </span>
        )}
      </p>
    </form>
  )
}
