'use client'

import { useActionState, useState } from 'react'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { setMemberName, type MemberNameState } from '../member-actions'

/**
 * Member step 2. Pre-filled with whatever the member row is called today
 * (the invitation only carried an email, so that is the email's local part
 * until the invitee changes it here).
 */
export function MemberNameForm({ current }: { current: string }) {
  const [state, formAction, pending] = useActionState<MemberNameState, FormData>(setMemberName, undefined)
  const [name, setName] = useState(current)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Your name" hint="How you show up in splits, reports and settle-ups.">
        <input
          name="name"
          type="text"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alex"
          className="maple-input"
          autoFocus
        />
      </Field>

      {state?.error && (
        <div role="alert" className="rounded-[12px] bg-maple-soft px-3 py-2 text-[13px] font-medium text-maple">
          {state.error}
        </div>
      )}

      <div className="flex pt-1 sm:justify-end">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={pending || name.trim().length === 0}
          className="w-full sm:w-auto"
        >
          {pending ? 'Saving…' : 'Continue'}
          {!pending && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </Button>
      </div>
    </form>
  )
}
