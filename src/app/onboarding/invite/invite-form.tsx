'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InviteResult } from '@/components/invite-result'
import type { InviteState } from '@/app/(app)/setup/invite-actions'
import { inviteNewMember } from './actions'

/**
 * An email address, nothing else - whoever accepts picks their own name when
 * they join. After a successful send the one-time link shows (email delivery
 * is best-effort); "Invite someone else" resets the form.
 */
export function InviteForm() {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<InviteState, FormData>(inviteNewMember, undefined)
  // useActionState keeps the last result; remember which one the user has
  // dismissed so "Invite someone else" returns to a blank form.
  const [dismissed, setDismissed] = useState<InviteState>(undefined)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (state && 'ok' in state) router.refresh()
  }, [state, router])

  if (state && 'ok' in state && state !== dismissed) {
    return (
      <InviteResult
        inviteUrl={state.inviteUrl}
        emailSent={state.emailSent}
        emailError={state.emailError}
        onDone={() => {
          setDismissed(state)
          setRound((r) => r + 1)
        }}
        doneLabel="Invite someone else"
      />
    )
  }

  return (
    <form key={round} action={formAction} className="flex flex-col gap-5">
      <Field label="Email" hint="They pick the name the household sees when they join.">
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          required
          placeholder="them@domain.ca"
          className="maple-input"
          autoFocus
        />
      </Field>

      {state && 'error' in state && (
        <div role="alert" className="rounded-[12px] bg-maple-soft px-3 py-2 text-[13px] font-medium text-maple">
          {state.error}
        </div>
      )}

      <div className="flex pt-1 sm:justify-end">
        <Button type="submit" variant="secondary" size="md" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
    </form>
  )
}
